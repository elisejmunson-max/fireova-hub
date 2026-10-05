import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { saveMediaBankPoster, type PosterUploadDependencies } from './media-bank-poster-upload.ts';

const jpeg = await sharp({ create: { width: 270, height: 480, channels: 3, background: '#cc3333' } }).jpeg().toBuffer();
function fixture(overrides: Partial<PosterUploadDependencies> = {}) {
  const writes: { path: string; bytes: Buffer }[] = [];
  const deps: PosterUploadDependencies = {
    getUser: async () => ({ id: 'owner' }),
    getOwnedAsset: async () => ({ id: 'asset', user_id: 'owner', file_type: 'video/mp4' }),
    upload: async (path, bytes) => { writes.push({ path, bytes }); return true; },
    remove: async () => {},
    ...overrides,
  };
  return { deps, writes };
}
const request = (bytes: Uint8Array = jpeg, headers: Record<string, string> = {}) => new Request('https://fixture.test/api/media-bank/poster/asset', { method: 'POST', body: new Uint8Array(bytes), headers: { 'Content-Type': 'image/jpeg', ...headers } });

test('poster writes authenticate and bind asset/owner/type before reading uploaded content', async () => {
  for (const override of [
    { getUser: async () => null },
    { getUser: async () => ({ id: 'dev' }) },
    { getOwnedAsset: async () => null },
    { getOwnedAsset: async () => ({ id: 'asset', user_id: 'foreign', file_type: 'video/mp4' }) },
    { getOwnedAsset: async () => ({ id: 'other', user_id: 'owner', file_type: 'video/mp4' }) },
    { getOwnedAsset: async () => ({ id: 'asset', user_id: 'owner', file_type: 'image/jpeg' }) },
  ]) {
    const { deps, writes } = fixture(override);
    const response = await saveMediaBankPoster(request(), 'asset', deps);
    assert([401, 404].includes(response.status)); assert.equal(writes.length, 0);
  }
});

test('poster endpoint saves only normalized bounded JPEG to the deterministic owner path', async () => {
  const { deps, writes } = fixture();
  const response = await saveMediaBankPoster(request(), 'asset', deps);
  assert.equal(response.status, 201); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(writes.length, 1); assert.equal(writes[0].path, 'owner/media-bank-posters/v1/asset.jpg');
  const metadata = await sharp(writes[0].bytes).metadata();
  assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 270); assert.equal(metadata.height, 480); assert.equal(metadata.exif, undefined);
});

test('poster endpoint rejects arbitrary paths, wrong MIME, corrupted JPEG and dishonest body sizes', async () => {
  for (const [id, req, status] of [
    ['../asset', request(), 404],
    ['asset', request(jpeg, { 'Content-Type': 'video/mp4' }), 415],
    ['asset', request(new Uint8Array([1, 2, 3])), 415],
    ['asset', request(new Uint8Array([255, 216, 255, 0])), 415],
    ['asset', request(jpeg, { 'Content-Length': '262145' }), 413],
    ['asset', request(new Uint8Array(262145), { 'Content-Length': '1' }), 413],
  ] as const) {
    const { deps, writes } = fixture();
    assert.equal((await saveMediaBankPoster(req, id, deps)).status, status); assert.equal(writes.length, 0);
  }
});

test('poster endpoint refuses JPEG dimensions over 480 and pixel bombs', async () => {
  for (const [width, height] of [[481, 2], [480, 481]]) {
    const oversized = await sharp({ create: { width, height, channels: 3, background: '#222' } }).jpeg().toBuffer();
    const { deps, writes } = fixture();
    assert.equal((await saveMediaBankPoster(request(oversized), 'asset', deps)).status, 415); assert.equal(writes.length, 0);
  }
});

test('poster storage conflict/error cannot overwrite existing poster or alter originals', async () => {
  const { deps } = fixture({ upload: async () => false });
  assert.equal((await saveMediaBankPoster(request(), 'asset', deps)).status, 409);
  const failed = fixture({ upload: async () => { throw new Error('private storage information'); } });
  const response = await saveMediaBankPoster(request(), 'asset', failed.deps);
  assert.equal(response.status, 503); assert.equal(await response.text(), '{"ok":false}');
});

test('aborted stalled poster body cancels without storage write', async () => {
  const controller = new AbortController();
  const body = new ReadableStream({ start() {} });
  const req = new Request('https://fixture.test', { method: 'POST', body, duplex: 'half', signal: controller.signal, headers: { 'Content-Type': 'image/jpeg' } } as RequestInit);
  const { deps, writes } = fixture();
  const result = saveMediaBankPoster(req, 'asset', deps); controller.abort();
  assert.equal((await result).status, 503); assert.equal(writes.length, 0);
});

// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { ThumbnailGate } from './media-bank-thumbnail.ts';

test('server request deadline retains the gate until in-flight storage work and ownership check settle', async () => {
  const gate = new ThumbnailGate({ concurrent: 1, concurrentPerOwner: 1, queued: 0 });
  let finish!: (value: boolean) => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  const storage = new Promise<boolean>(resolve => { finish = resolve; });
  const { deps } = fixture({ gate, requestMs: 30, upload: async () => { started(); return storage; } });
  const first = saveMediaBankPoster(request(), 'asset', deps);
  await began;
  assert.equal((await first).status, 503);
  assert.equal(gate.stats().active, 1, 'timeout must not free an occupied storage work slot');
  const next = fixture({ gate }).deps;
  assert.equal((await saveMediaBankPoster(request(), 'asset', next)).status, 503);
  finish(true);
  for (let i = 0; i < 30 && gate.stats().active; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(gate.stats().active, 0);
});

test('poster created after its owned video disappears is removed before work finishes', async () => {
  let reads = 0;
  const removed: string[] = [];
  const { deps } = fixture({
    getOwnedAsset: async () => ++reads === 1 ? { id: 'asset', user_id: 'owner', file_type: 'video/mp4' } : null,
    remove: async path => { removed.push(path); },
  });
  assert.equal((await saveMediaBankPoster(request(), 'asset', deps)).status, 404);
  assert.deepEqual(removed, ['owner/media-bank-posters/v1/asset.jpg']);
});

test('post-upload ownership recheck errors trigger deterministic cleanup without disclosing details', async () => {
  let reads = 0;
  const removed: string[] = [];
  const { deps } = fixture({
    getOwnedAsset: async () => { if (++reads > 1) throw new Error('private data'); return { id: 'asset', user_id: 'owner', file_type: 'video/mp4' }; },
    remove: async path => { removed.push(path); },
  });
  assert.equal((await saveMediaBankPoster(request(), 'asset', deps)).status, 503);
  assert.deepEqual(removed, ['owner/media-bank-posters/v1/asset.jpg']);
});

test('many tiny body chunks retain no shared pending deadline handlers', async () => {
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { if (offset < jpeg.length) controller.enqueue(new Uint8Array(jpeg.subarray(offset, ++offset))); else controller.close(); } });
  const req = new Request('https://fixture.test', { method: 'POST', body, duplex: 'half', headers: { 'Content-Type': 'image/jpeg' } } as RequestInit);
  const { deps, writes } = fixture();
  assert.equal((await saveMediaBankPoster(req, 'asset', deps)).status, 201);
  assert.equal(writes.length, 1); assert.equal(offset, jpeg.length);
});
