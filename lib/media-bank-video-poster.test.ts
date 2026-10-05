import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { createMediaBankVideoPoster, MEDIA_BANK_POSTER_LIMITS } from './media-bank-video-poster.ts';

function fakeBrowser(t: any, options: { width?: number; height?: number; duration?: number; oversized?: boolean; drawError?: boolean; error?: boolean } = {}) {
  const state = { objectUrls: 0, revoked: 0, detached: 0, draws: 0, encodes: 0, width: 0, height: 0, qualities: [] as number[] };
  const video: any = {
    videoWidth: options.width ?? 1080, videoHeight: options.height ?? 1920,
    duration: options.duration ?? 2, readyState: 2, seeking: false,
    removeAttribute() { state.detached++; }, load() {},
    set src(_: string) { queueMicrotask(() => options.error ? video.onerror?.() : video.onloadedmetadata?.()); },
    set currentTime(_: number) { queueMicrotask(() => video.onseeked?.()); },
  };
  const canvas = {
    set width(value: number) { state.width = value; },
    set height(value: number) { state.height = value; },
    getContext() { return { drawImage() { state.draws++; if (options.drawError) throw new Error('decode error'); } }; },
    toBlob(callback: (blob: Blob) => void, type: string, quality: number) {
      state.encodes++; state.qualities.push(quality);
      callback(new Blob([new Uint8Array(options.oversized ? MEDIA_BANK_POSTER_LIMITS.bytes + 1 : 40)], { type }));
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag: string) => tag === 'video' ? video : canvas } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); });
  t.mock.method(URL, 'createObjectURL', () => { state.objectUrls++; return 'blob:local-test-only'; });
  t.mock.method(URL, 'revokeObjectURL', () => { state.revoked++; });
  return state;
}

test('poster extraction rejects unsupported and oversized local inputs before decoding', async t => {
  const state = fakeBrowser(t);
  for (const file of [new File(['x'], 'a.svg', { type: 'image/svg+xml' }), new File([], 'a.mp4', { type: 'video/mp4' })]) {
    assert.equal(await createMediaBankVideoPoster(file), undefined);
  }
  const oversized = new File(['x'], 'a.mp4', { type: 'video/mp4' });
  Object.defineProperty(oversized, 'size', { value: MEDIA_BANK_POSTER_LIMITS.sourceBytes + 1 });
  assert.equal(await createMediaBankVideoPoster(oversized), undefined);
  assert.equal(state.objectUrls, 0);
});

test('local video capture produces bounded JPEG and releases the local source', async t => {
  const state = fakeBrowser(t);
  const output = await createMediaBankVideoPoster(new File(['selected local bytes'], 'a.mp4', { type: 'video/mp4' }));
  assert.equal(output?.type, 'image/jpeg');
  assert.equal(output?.size, 40);
  assert.equal(state.width, 270); assert.equal(state.height, 480);
  assert.equal(state.draws, 1); assert.equal(state.encodes, 1);
  assert.equal(state.revoked, 1); assert.equal(state.detached, 1);
});

for (const options of [{ width: 100_000 }, { height: 0 }, { duration: Infinity }, { duration: 0 }, { error: true }]) {
  test(`invalid local video metadata/errors fail closed: ${JSON.stringify(options)}`, async t => {
    const state = fakeBrowser(t, options);
    assert.equal(await createMediaBankVideoPoster(new File(['x'], 'a.mov', { type: 'video/quicktime' })), undefined);
    assert.equal(state.draws, 0); assert.equal(state.revoked, 1); assert.equal(state.detached, 1);
  });
}

test('JPEG output above the byte cap fails after four bounded quality attempts', async t => {
  const state = fakeBrowser(t, { oversized: true });
  assert.equal(await createMediaBankVideoPoster(new File(['x'], 'a.mp4', { type: 'video/mp4' })), undefined);
  assert.deepEqual(state.qualities, [.82, .72, .62, .52]);
  assert.equal(state.revoked, 1);
});

test('canvas failure preserves source upload availability and cleans up', async t => {
  const state = fakeBrowser(t, { drawError: true });
  assert.equal(await createMediaBankVideoPoster(new File(['x'], 'a.mp4', { type: 'video/mp4' })), undefined);
  assert.equal(state.encodes, 0); assert.equal(state.revoked, 1);
});
