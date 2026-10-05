import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
// @ts-expect-error Node direct TypeScript execution requires the suffix.
import { serveThumbnail, ThumbnailCache, ThumbnailGate, ThumbnailError, THUMBNAIL_LIMITS, validThumbnailPath, validatedThumbnailUrl, readThumbnailOriginal, renderThumbnail, type ThumbnailAsset, type ThumbnailDependencies } from './media-bank-thumbnail.ts';

const origin = 'https://project.supabase.co';
const owner = 'owner-a';
const asset = (id = 'asset-a', user = owner): ThumbnailAsset => ({
  id, user_id: user, storage_path: `${user}/library/${id}.jpg`, file_type: 'image/jpeg', size_bytes: 16, created_at: '2026-01-01',
});
const urlFor = (path: string) => `${origin}/storage/v1/object/public/media/${path.split('/').map(encodeURIComponent).join('/')}`;
const imageResponse = (body: BodyInit = 'original', headers: Record<string, string> = {}) => new Response(body, { headers: { 'Content-Type': 'image/jpeg', ...headers } });
const request = () => new Request('https://app.example/api/media-bank/thumbnail/asset-a');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(overrides: Partial<ThumbnailDependencies> = {}) {
  const events: string[] = [];
  const cache = new ThumbnailCache();
  const gate = new ThumbnailGate();
  const deps: ThumbnailDependencies = {
    getUser: async () => { events.push('auth'); return { id: owner }; },
    getOwnedAsset: async (id, user) => { events.push(`owned:${user}:${id}`); return asset(id, user); },
    getSourceUrl: path => { events.push('source'); return urlFor(path); },
    supabaseUrl: origin,
    fetcher: async () => { events.push('fetch'); return imageResponse(); },
    render: async () => { events.push('render'); return Buffer.from('thumbnail'); },
    cache, gate,
    ...overrides,
  };
  return { deps, events, cache, gate };
}
const statusIs = (status: number) => (error: unknown) => error instanceof ThumbnailError && error.status === status;

// Authorization and cache boundaries.
test('unauthenticated requests cannot query assets, resolve URLs, access cache, fetch, or transform', async () => {
  const f = fixture({ getUser: async () => null });
  f.cache.get = () => { throw new Error('must not touch cache'); };
  const result = await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(result.status, 401);
  assert.deepEqual(f.events, []);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
});

test('absent and foreign rows never reach cache or storage', async () => {
  for (const row of [null, asset('asset-a', 'someone-else'), asset('wrong-id')]) {
    const f = fixture({ getOwnedAsset: async () => row });
    f.cache.get = () => { throw new Error('must not touch cache'); };
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
    assert.deepEqual(f.events, ['auth']);
  }
});

test('successful requests authenticate and check owner before every cache hit', async () => {
  const f = fixture();
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 200);
  const second = await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(second.status, 200);
  assert.deepEqual(f.events, ['auth', `owned:${owner}:asset-a`, 'source', 'fetch', 'render', 'auth', `owned:${owner}:asset-a`]);
  assert.equal(second.headers.get('content-type'), 'image/webp');
  assert.equal(second.headers.get('content-length'), '9');
  assert.equal(second.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(second.headers.get('vary'), 'Cookie');
  assert.equal(second.headers.get('cache-control'), 'private, no-store');
  assert.equal(await second.text(), 'thumbnail');
  f.deps.getUser = async () => null;
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 401);
  f.deps.getUser = async () => ({ id: owner });
  f.deps.getOwnedAsset = async () => null;
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
});

test('same asset ID across owners never reuses another owner derivative', async () => {
  const f = fixture();
  await serveThumbnail(request(), 'asset-a', f.deps);
  f.deps.getUser = async () => ({ id: 'owner-b' });
  f.deps.render = async () => Buffer.from('second-owner');
  const result = await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(await result.text(), 'second-owner');
  assert.equal(f.events.filter(event => event === 'fetch').length, 2);
});

test('asset path and source version changes miss the cache', async () => {
  const f = fixture();
  await serveThumbnail(request(), 'asset-a', f.deps);
  f.deps.getOwnedAsset = async () => ({ ...asset(), storage_path: `${owner}/library/replaced.jpg` });
  await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(f.events.filter(event => event === 'fetch').length, 2);
});

test('owned rows referencing foreign storage paths are rejected before cache access', async () => {
  const f = fixture({ getOwnedAsset: async () => ({ ...asset(), storage_path: 'owner-b/library/private.jpg' }) });
  f.cache.get = () => { throw new Error('must not touch cache'); };
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
  assert.deepEqual(f.events, ['auth']);
});

test('unsupported row MIME types and declared oversized originals never fetch', async () => {
  for (const file_type of ['video/unknown', 'image/svg+xml', 'application/pdf', 'image/unknown', 'image/jpeg;foo']) {
    const f = fixture({ getOwnedAsset: async () => ({ ...asset(), file_type }) });
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 415);
    assert.deepEqual(f.events, ['auth']);
  }
  const f = fixture({ getOwnedAsset: async () => ({ ...asset(), size_bytes: THUMBNAIL_LIMITS.originalBytes + 1 }) });
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 413);
  assert.deepEqual(f.events, ['auth']);
});

test('malformed route IDs cannot become storage sources', async () => {
  for (const id of ['', '../secret', 'https://evil.example/photo', 'x'.repeat(101), 'asset?url=evil']) {
    const f = fixture();
    assert.equal((await serveThumbnail(request(), id, f.deps)).status, 404);
    assert.deepEqual(f.events, ['auth']);
  }
});

// Source validation and bounded downloading.
test('storage path validation rejects URL, traversal, encoded, absolute, and malformed keys', () => {
  for (const path of ['', null, 'https://evil.example/a', '//evil/a', '/owner-a/a', 'owner-b/a',
    `${owner}/../b`, `${owner}/./b`, `${owner}//a`, `${owner}/a/`, `${owner}/%2e%2e/b`, `${owner}/a%252fb`,
    `${owner}/a\\b`, `${owner}/a?x`, `${owner}/a#x`, `${owner}/a\u0000b`, `${owner}/a:b`, `${owner}/${'a'.repeat(256)}`]) {
    assert.equal(validThumbnailPath(path, owner), false, String(path));
  }
  for (const path of [`${owner}/library/a.jpg`, `${owner}/events/event-id/a.jpg`, `${owner}/content-bank/a.jpg`, `${owner}/library/café photo.jpg`]) {
    assert.equal(validThumbnailPath(path, owner), true);
    assert.equal(validatedThumbnailUrl(urlFor(path), origin, path), urlFor(path));
  }
});

test('source URLs must match the configured HTTPS origin, fixed bucket and exact owned key', () => {
  const path = asset().storage_path;
  for (const source of [`https://evil.example/storage/v1/object/public/media/${path}`, `http://project.supabase.co/storage/v1/object/public/media/${path}`,
    `https://project.supabase.co.evil.example/storage/v1/object/public/media/${path}`, urlFor(path).replace('/media/', '/other/'),
    urlFor(path).replace('/public/', '/sign/'), `${urlFor(path)}?token=secret`, `${urlFor(path)}#ignored`,
    urlFor(path).replace('https://', 'https://user:secret@'), urlFor('owner-a/library/other.jpg')]) {
    assert.throws(() => validatedThumbnailUrl(source, origin, path), statusIs(404));
  }
  assert.throws(() => validatedThumbnailUrl(urlFor(path), 'http://localhost:54321', path), statusIs(404));
});

test('invalid storage URL never reaches fetch and error does not leak its text', async () => {
  const f = fixture({ getSourceUrl: () => 'https://evil.example/?secret=do-not-leak' });
  const result = await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(result.status, 404);
  assert.equal(await result.text(), 'Thumbnail unavailable');
  assert.equal(f.events.includes('fetch'), false);
});

test('storage fetch disables redirects, credentials and framework cache without forwarding request headers', async () => {
  const f = fixture({ fetcher: async (url, init) => {
    assert.equal(url, urlFor(asset().storage_path));
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.cache, 'no-store');
    const headers = new Headers(init?.headers);
    assert.equal(headers.has('authorization'), false);
    assert.equal(headers.has('cookie'), false);
    assert.ok(init?.signal instanceof AbortSignal);
    return imageResponse();
  } });
  const req = new Request(request(), { headers: { Authorization: 'Bearer private', Cookie: 'session=private' } });
  assert.equal((await serveThumbnail(req, 'asset-a', f.deps)).status, 200);
});

test('redirects, missing/non-image MIME types, compressed content and non-200 upstreams are rejected', async () => {
  for (const response of [new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }),
    new Response('x', { status: 206, headers: { 'Content-Type': 'image/jpeg' } }),
    new Response('x'), imageResponse('x', { 'Content-Type': 'image/svg+xml' }),
    imageResponse('x', { 'Content-Encoding': 'gzip' }), imageResponse('x', { 'Content-Type': 'text/html' })]) {
    const f = fixture({ fetcher: async () => response });
    const result = await serveThumbnail(request(), 'asset-a', f.deps);
    assert.notEqual(result.status, 200);
    assert.equal(f.events.includes('render'), false);
  }
  const redirected = imageResponse();
  Object.defineProperty(redirected, 'redirected', { value: true });
  const f = fixture({ fetcher: async () => redirected });
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
});

test('huge or malformed Content-Length rejects and cancels before reading bytes', async () => {
  for (const length of [String(THUMBNAIL_LIMITS.originalBytes + 1), '99999999999999999999999999', '-1', '1.2', 'invalid']) {
    let pulls = 0, cancelled = false;
    const stream = new ReadableStream({ pull() { pulls++; }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    await assert.rejects(readThumbnailOriginal(urlFor(asset().storage_path), new AbortController().signal,
      async () => imageResponse(stream, { 'Content-Length': length })), statusIs(413));
    assert.equal(pulls, 0);
    assert.equal(cancelled, true);
  }
});

test('absent and dishonest length headers cannot bypass the streaming byte cap', async () => {
  for (const headers of [{}, { 'Content-Length': '1' }] as Record<string, string>[]) {
    let pulls = 0, cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(7)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    await assert.rejects(readThumbnailOriginal(urlFor(asset().storage_path), new AbortController().signal,
      async () => imageResponse(stream, headers), { ...THUMBNAIL_LIMITS, originalBytes: 10 }), statusIs(413));
    assert.equal(pulls, 2);
    assert.equal(cancelled, true);
  }
});

test('tiny chunks and exact-limit originals produce exactly the accepted bytes', async () => {
  let count = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (count === 10) controller.close(); else controller.enqueue(Uint8Array.of(++count));
  } }, { highWaterMark: 0 });
  const output = await readThumbnailOriginal(urlFor(asset().storage_path), new AbortController().signal,
    async () => imageResponse(stream), { ...THUMBNAIL_LIMITS, originalBytes: 10 });
  assert.deepEqual([...output], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(output.buffer.byteLength, 10); // One bounded buffer, no retained per-chunk array.
});

test('a stalled response stream times out, aborts fetch and cancels the reader', async () => {
  let fetchSignal: AbortSignal | null | undefined, cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await assert.rejects(readThumbnailOriginal(urlFor(asset().storage_path), new AbortController().signal,
    async (_url, init) => { fetchSignal = init?.signal; return imageResponse(stream); },
    { ...THUMBNAIL_LIMITS, downloadMs: 15 }), statusIs(504));
  assert.equal(fetchSignal?.aborted, true);
  assert.equal(cancelled, true);
});

test('a stalled connection times out without waiting for its fetch implementation', async () => {
  await assert.rejects(readThumbnailOriginal(urlFor(asset().storage_path), new AbortController().signal,
    async () => new Promise<Response>(() => {}), { ...THUMBNAIL_LIMITS, downloadMs: 15 }), statusIs(504));
});

// Decoder, cancellation, concurrency, and private cache bounds.
test('real Sharp output preserves source aspect inside 480px with metadata removed', async () => {
  const original = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#ff8040' } }).jpeg().withMetadata().toBuffer();
  const output = await renderThumbnail(original, new AbortController().signal);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 320);
  assert.equal(metadata.exif, undefined);
  assert.ok(output.length <= THUMBNAIL_LIMITS.outputBytes);
  const tiny = await sharp({ create: { width: 12, height: 12, channels: 3, background: 'red' } }).png().toBuffer();
  assert.equal((await sharp(await renderThumbnail(tiny, new AbortController().signal)).metadata()).width, 12);
});

test('portrait square small and rotated derivatives preserve the full source aspect', async () => {
  for (const [width, height, orientation, expectedWidth, expectedHeight] of [
    [600, 900, 1, 320, 480],
    [800, 800, 1, 480, 480],
    [12, 8, 1, 12, 8],
    [900, 600, 6, 320, 480],
  ]) {
    const original = await sharp({ create: { width, height, channels: 3, background: '#4080ff' } }).jpeg().withMetadata({ orientation }).toBuffer();
    const before = Buffer.from(original);
    const output = await renderThumbnail(original, new AbortController().signal);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, expectedWidth);
    assert.equal(metadata.height, expectedHeight);
    assert.equal(metadata.exif, undefined);
    assert.ok(output.length <= THUMBNAIL_LIMITS.outputBytes);
    assert.deepEqual(original, before, 'source bytes remain unchanged');
  }
});

test('derivative keeps both source edges for the gallery to crop only once', async () => {
  const width = 900, height = 600;
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 3;
    rgb[offset] = x < 20 ? 255 : 0;
    rgb[offset + 1] = x >= 20 && x < width - 20 ? 255 : 0;
    rgb[offset + 2] = x >= width - 20 ? 255 : 0;
  }
  const original = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const output = await renderThumbnail(original, new AbortController().signal);
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  const left = (Math.floor(info.height / 2) * info.width) * info.channels;
  const right = (Math.floor(info.height / 2) * info.width + info.width - 1) * info.channels;
  assert.deepEqual([info.width, info.height], [480, 320]);
  assert.ok(data[left] > 220 && data[left + 2] < 30, 'left source edge retained');
  assert.ok(data[right] < 30 && data[right + 2] > 220, 'right source edge retained');
});

test('real decoder rejects oversized pixels, SVG and invalid image bytes', async () => {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(renderThumbnail(png, new AbortController().signal, { ...THUMBNAIL_LIMITS, inputPixels: 100 }), statusIs(413));
  await assert.rejects(renderThumbnail(png, new AbortController().signal, { ...THUMBNAIL_LIMITS, decodedBytes: 100 }), statusIs(413));
  await assert.rejects(renderThumbnail(png, new AbortController().signal, { ...THUMBNAIL_LIMITS, originalBytes: 10 }), statusIs(413));
  await assert.rejects(renderThumbnail(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), new AbortController().signal), statusIs(415));
  await assert.rejects(renderThumbnail(Buffer.from('this is not an image'), new AbortController().signal), statusIs(415));
});

test('oversized derivatives never enter cache', async () => {
  const f = fixture({ render: async () => Buffer.alloc(101), limits: { outputBytes: 100 } });
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 413);
  assert.deepEqual(f.cache.stats(), { entries: 0, bytes: 0 });
});

test('private cache isolates owners and applies owner bytes, entry count, global bytes and TTL', () => {
  let now = 0;
  const cache = new ThumbnailCache({ cacheBytes: 12, cacheBytesPerOwner: 8, cacheEntries: 3, cacheEntriesPerOwner: 2, cacheTtlMs: 100 }, () => now);
  cache.set('a', '1', Buffer.from('1111'));
  cache.set('a', '2', Buffer.from('2222'));
  assert.equal(cache.get('b', '1'), undefined);
  cache.set('a', '3', Buffer.from('3333'));
  assert.equal(cache.get('a', '1'), undefined);
  cache.set('b', '1', Buffer.from('4444'));
  assert.deepEqual(cache.stats(), { entries: 3, bytes: 12 });
  cache.set('c', '1', Buffer.from('5555'));
  assert.equal(cache.get('a', '2'), undefined);
  assert.deepEqual(cache.stats(), { entries: 3, bytes: 12 });
  cache.set('c', 'too-big', Buffer.alloc(9));
  assert.deepEqual(cache.stats(), { entries: 3, bytes: 12 });
  now = 100;
  assert.equal(cache.get('c', '1'), undefined);
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
});

test('cache separately enforces count limits and touches LRU on hits', () => {
  const cache = new ThumbnailCache({ cacheEntries: 2, cacheEntriesPerOwner: 1 });
  cache.set('a', '1', Buffer.from('1'));
  cache.set('a', '2', Buffer.from('2'));
  assert.equal(cache.get('a', '1'), undefined);
  cache.set('b', '1', Buffer.from('3'));
  cache.get('a', '2');
  cache.set('c', '1', Buffer.from('4'));
  assert.equal(cache.get('b', '1'), undefined);
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 2 });
});

test('concurrency, per-owner concurrency and queue size stay bounded and release idempotently', async () => {
  const gate = new ThumbnailGate({ concurrent: 2, concurrentPerOwner: 1, queued: 2, queuedPerOwner: 1 });
  const signal = new AbortController().signal;
  const releaseA = await gate.acquire('a', signal);
  const nextA = gate.acquire('a', signal);
  await assert.rejects(gate.acquire('a', signal), statusIs(503));
  const releaseB = await gate.acquire('b', signal);
  const nextC = gate.acquire('c', signal);
  await assert.rejects(gate.acquire('d', signal), statusIs(503));
  assert.deepEqual(gate.stats(), { active: 2, queued: 2, owners: 2 });
  releaseB();
  const releaseC = await nextC;
  assert.deepEqual(gate.stats(), { active: 2, queued: 1, owners: 2 });
  releaseA(); releaseA();
  const releaseA2 = await nextA;
  releaseA2(); releaseC();
  assert.deepEqual(gate.stats(), { active: 0, queued: 0, owners: 0 });
});

test('queued work times out or cancels without leaking permits', async () => {
  const gate = new ThumbnailGate({ concurrent: 1, queueMs: 15 });
  const release = await gate.acquire('a', new AbortController().signal);
  await assert.rejects(gate.acquire('b', new AbortController().signal), statusIs(503));
  const controller = new AbortController();
  const queued = gate.acquire('b', controller.signal);
  controller.abort(new ThumbnailError(499));
  await assert.rejects(queued, statusIs(499));
  release();
  assert.deepEqual(gate.stats(), { active: 0, queued: 0, owners: 0 });
});

test('waiting same-asset requests recheck cache after a preceding job completes', async () => {
  const f = fixture({ gate: new ThumbnailGate({ concurrent: 1 }) });
  const results = await Promise.all([serveThumbnail(request(), 'asset-a', f.deps), serveThumbnail(request(), 'asset-a', f.deps)]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.equal(f.events.filter(event => event === 'fetch').length, 1);
});

test('request deadline returns promptly while a still-running decoder retains its permit', async () => {
  let finish: ((data: Buffer) => void) | undefined;
  const f = fixture({ render: async () => new Promise(resolve => { finish = resolve; }), limits: { requestMs: 20 } });
  const response = await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(response.status, 504);
  assert.equal(f.gate.stats().active, 1);
  finish!(Buffer.from('late'));
  await tick();
  assert.equal(f.gate.stats().active, 0);
  assert.deepEqual(f.cache.stats(), { entries: 0, bytes: 0 });
});

test('stalled auth returns a deadline error without touching assets or cache later', async () => {
  let finish: ((user: { id: string }) => void) | undefined;
  const f = fixture({ getUser: async () => new Promise(resolve => { finish = resolve; }), limits: { requestMs: 15 } });
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 504);
  finish!({ id: owner });
  await tick();
  assert.deepEqual(f.events, []);
});

test('client cancellation aborts active original download without populating cache', async () => {
  const controller = new AbortController();
  let fetchStarted: (() => void) | undefined;
  const started = new Promise<void>(resolve => { fetchStarted = resolve; });
  let fetchSignal: AbortSignal | null | undefined;
  const f = fixture({ fetcher: async (_url, init) => { fetchSignal = init?.signal; fetchStarted!(); return imageResponse(new ReadableStream()); } });
  const pending = serveThumbnail(new Request(request(), { signal: controller.signal }), 'asset-a', f.deps);
  await started;
  controller.abort();
  assert.equal((await pending).status, 499);
  await tick();
  assert.equal(fetchSignal?.aborted, true);
  assert.deepEqual(f.cache.stats(), { entries: 0, bytes: 0 });
  assert.equal(f.gate.stats().active, 0);
});

test('generic upstream errors are private, do not cache, and release permits for retry', async () => {
  const f = fixture({ fetcher: async () => { throw new Error('private token=secret source path'); } });
  const response = await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(response.status, 502);
  assert.equal(await response.text(), 'Thumbnail unavailable');
  assert.deepEqual(f.cache.stats(), { entries: 0, bytes: 0 });
  assert.equal(f.gate.stats().active, 0);
  f.deps.fetcher = async () => imageResponse();
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 200);
});


test('pre-aborted requests never query rows, fetch or enter cache', async () => {
  const controller = new AbortController();
  controller.abort();
  const f = fixture();
  assert.equal((await serveThumbnail(new Request(request(), { signal: controller.signal }), 'asset-a', f.deps)).status, 499);
  await tick();
  assert.deepEqual(f.events.filter(event => event !== 'auth'), []);
  assert.deepEqual(f.cache.stats(), { entries: 0, bytes: 0 });
});

test('authentication and ownership lookup failures fail closed without reading cache', async () => {
  for (const overrides of [
    { getUser: async () => { throw new Error('auth service failed'); } },
    { getOwnedAsset: async () => { throw new Error('database failed'); } },
  ]) {
    const f = fixture(overrides);
    f.cache.get = () => { throw new Error('must not read cache'); };
    const result = await serveThumbnail(request(), 'asset-a', f.deps);
    assert.equal(result.status, 500);
    assert.equal(await result.text(), 'Thumbnail unavailable');
    assert.equal(f.events.includes('source'), false);
    assert.equal(f.events.includes('fetch'), false);
  }
});

test('request query source and dimensions cannot change the original or transform', async () => {
  let fetched: string | URL | Request | undefined;
  const f = fixture({ fetcher: async url => { fetched = url; return imageResponse(); } });
  const req = new Request('https://app.example/api/media-bank/thumbnail/asset-a?url=https://evil.example/a&width=100000');
  assert.equal((await serveThumbnail(req, 'asset-a', f.deps)).status, 200);
  assert.equal(fetched, urlFor(asset().storage_path));
});

// Videos consume only previously saved image posters. GET never processes video bytes.
const videoAsset = (id = 'asset-a', user = owner): ThumbnailAsset => ({
  ...asset(id, user), storage_path: `${user}/library/${id}.mp4`, file_type: 'video/mp4', size_bytes: 43 * 1024 * 1024,
});
const posterPath = `${owner}/media-bank-posters/v1/asset-a.jpg`;
const eventPoster = (thumbnail_path: string | null = `${owner}/events/event-a/still.jpg`) => ({
  id: 'asset-a', user_id: owner, storage_path: videoAsset().storage_path, thumbnail_path,
});

test('owned video reads only its exact matching event image poster, despite a 43 MB original', async () => {
  const saved = eventPoster();
  const f = fixture({
    getOwnedAsset: async () => videoAsset(),
    getEventPoster: async (row, signal) => {
      assert.equal(row.storage_path, videoAsset().storage_path);
      assert.ok(signal instanceof AbortSignal);
      return saved;
    },
    fetcher: async url => { assert.equal(url, urlFor(saved.thumbnail_path!)); return imageResponse(); },
  });
  const response = await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'thumbnail');
});

test('video without an event thumbnail reads the deterministic saved JPEG path', async () => {
  for (const event of [null, eventPoster(null)]) {
    const sources: string[] = [];
    const f = fixture({
      getOwnedAsset: async () => videoAsset(), getEventPoster: async () => event,
      getSourceUrl: path => { sources.push(path); return urlFor(path); },
    });
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 200);
    assert.deepEqual(sources, [posterPath]);
  }
});

test('all known upload video MIME types use saved posters; unknown and parameterized MIME never resolve or fetch', async () => {
  for (const file_type of ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/x-msvideo']) {
    const f = fixture({ getOwnedAsset: async () => ({ ...videoAsset(), file_type }) });
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 200);
  }
  for (const file_type of ['video/unknown', 'video/mp4;codecs=h264', 'application/octet-stream']) {
    const f = fixture({
      getOwnedAsset: async () => ({ ...videoAsset(), file_type }),
      getEventPoster: async () => { throw new Error('must not resolve poster'); },
    });
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 415);
    assert.deepEqual(f.events, ['auth']);
  }
});

test('foreign or mismatched event rows never touch cache or storage', async () => {
  for (const event of [
    { ...eventPoster(), user_id: 'owner-b' },
    { ...eventPoster(), id: 'asset-b' },
    { ...eventPoster(), storage_path: `${owner}/library/other.mp4` },
  ]) {
    const f = fixture({ getOwnedAsset: async () => videoAsset(), getEventPoster: async () => event });
    f.cache.get = () => { throw new Error('must not touch cache'); };
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
    assert.deepEqual(f.events, ['auth']);
  }
});

test('foreign, URL, encoded, traversal and original-video event thumbnail paths never fetch', async () => {
  for (const path of ['owner-b/events/still.jpg', 'https://evil.example/still.jpg', `${owner}/../still.jpg`,
    `${owner}/events/%2e%2e/still.jpg`, `${owner}/events/still.jpg?url=evil`, `${owner}/events/still.svg`,
    videoAsset().storage_path, `${owner}/other-video.mp4`, '']) {
    const f = fixture({ getOwnedAsset: async () => videoAsset(), getEventPoster: async () => eventPoster(path) });
    f.cache.get = () => { throw new Error('must not touch cache'); };
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404, path);
    assert.deepEqual(f.events, ['auth']);
  }
});

test('an original video with an image-looking name still cannot be its own poster', async () => {
  const row = { ...videoAsset(), storage_path: `${owner}/library/disguised.jpg` };
  const f = fixture({ getOwnedAsset: async () => row,
    getEventPoster: async () => ({ ...eventPoster(row.storage_path), storage_path: row.storage_path }),
  });
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
  assert.deepEqual(f.events, ['auth']);
});

test('missing saved event or deterministic poster returns private 404 without trying the original', async () => {
  for (const event of [null, eventPoster()]) {
    const fetched: string[] = [];
    const f = fixture({
      getOwnedAsset: async () => videoAsset(), getEventPoster: async () => event,
      fetcher: async url => { fetched.push(String(url)); return new Response(null, { status: 404 }); },
    });
    const response = await serveThumbnail(request(), 'asset-a', f.deps);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Thumbnail unavailable');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(fetched, [urlFor(event?.thumbnail_path ?? posterPath)]);
    assert.equal(f.events.includes('render'), false);
    assert.equal(f.cache.stats().entries, 0);
  }
});

test('saved poster still enforces image MIME, bounded input bytes, and no redirects', async () => {
  for (const response of [
    new Response('video bytes', { headers: { 'Content-Type': 'video/mp4' } }),
    new Response('unknown bytes'),
    imageResponse('oversized', { 'Content-Length': String(THUMBNAIL_LIMITS.originalBytes + 1) }),
    new Response(null, { status: 302, headers: { Location: urlFor(videoAsset().storage_path) } }),
  ]) {
    let fetches = 0;
    const f = fixture({
      getOwnedAsset: async () => videoAsset(),
      fetcher: async (url, options) => {
        fetches++;
        assert.equal(url, urlFor(posterPath));
        assert.equal(options?.redirect, 'error');
        return response;
      },
    });
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
    assert.equal(fetches, 1);
    assert.equal(f.events.includes('render'), false);
  }
});

test('saved video posters run the bounded real image decoder; invalid or oversized pixels safely fail', async () => {
  const jpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: 'green' } }).jpeg().toBuffer();
  const good = fixture({ getOwnedAsset: async () => videoAsset(), fetcher: async () => imageResponse(new Uint8Array(jpeg)), render: renderThumbnail });
  const response = await serveThumbnail(request(), 'asset-a', good.deps);
  assert.equal(response.status, 200);
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 320);
  for (const f of [
    fixture({ getOwnedAsset: async () => videoAsset(), render: renderThumbnail }),
    fixture({ getOwnedAsset: async () => videoAsset(), fetcher: async () => imageResponse(new Uint8Array(jpeg)), render: renderThumbnail, limits: { inputPixels: 100 } }),
  ]) {
    assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
    assert.equal(f.cache.stats().entries, 0);
  }
});

test('video source query parameters or a compromised URL adapter cannot select arbitrary storage', async () => {
  const f = fixture({ getOwnedAsset: async () => videoAsset(),
    fetcher: async url => { assert.equal(url, urlFor(posterPath)); return imageResponse(); },
  });
  const malicious = new Request(`${request().url}?url=https://evil.example/movie&poster=owner-b/private.jpg`);
  assert.equal((await serveThumbnail(malicious, 'asset-a', f.deps)).status, 200);
  for (const source of ['https://evil.example/still.jpg', urlFor(videoAsset().storage_path), `${urlFor(posterPath)}?token=secret`]) {
    const bad = fixture({ getOwnedAsset: async () => videoAsset(), getSourceUrl: () => source });
    assert.equal((await serveThumbnail(request(), 'asset-a', bad.deps)).status, 404);
    assert.equal(bad.events.includes('fetch'), false);
  }
});

test('video authentication, ownership and current event binding are rechecked before cache hits', async () => {
  let eventLookups = 0;
  const f = fixture({ getOwnedAsset: async () => videoAsset(),
    getEventPoster: async () => { eventLookups++; return eventPoster(); },
  });
  for (let i = 0; i < 2; i++) assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 200);
  assert.equal(eventLookups, 2);
  assert.equal(f.events.filter(event => event === 'fetch').length, 1);
  f.deps.getUser = async () => null;
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 401);
  assert.equal(eventLookups, 2);
  f.deps.getUser = async () => ({ id: owner });
  f.deps.getOwnedAsset = async () => null;
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
  assert.equal(eventLookups, 2);
  f.deps.getOwnedAsset = async () => videoAsset();
  f.deps.getEventPoster = async () => ({ ...eventPoster(), storage_path: `${owner}/unrelated.mp4` });
  assert.equal((await serveThumbnail(request(), 'asset-a', f.deps)).status, 404);
  assert.equal(f.events.filter(event => event === 'fetch').length, 1);
});

test('video cache binds original source, poster path, asset ID and owner separately', async () => {
  const f = fixture({ getOwnedAsset: async () => videoAsset(), getEventPoster: async () => eventPoster() });
  await serveThumbnail(request(), 'asset-a', f.deps);
  f.deps.getEventPoster = async () => eventPoster(`${owner}/events/changed.jpg`);
  await serveThumbnail(request(), 'asset-a', f.deps);
  f.deps.getEventPoster = async () => null;
  await serveThumbnail(request(), 'asset-a', f.deps);
  f.deps.getOwnedAsset = async () => ({ ...videoAsset(), storage_path: `${owner}/library/replaced.mp4` });
  await serveThumbnail(request(), 'asset-a', f.deps);
  f.deps.getOwnedAsset = async (id, user) => videoAsset(id, user);
  await serveThumbnail(request(), 'asset-b', f.deps);
  f.deps.getUser = async () => ({ id: 'owner-b' });
  await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(f.events.filter(event => event === 'fetch').length, 6);
});

test('poster lookup errors fail closed without touching an existing cache or storage', async () => {
  const f = fixture({ getOwnedAsset: async () => videoAsset(), getEventPoster: async () => eventPoster() });
  await serveThumbnail(request(), 'asset-a', f.deps);
  f.deps.getEventPoster = async () => { throw new Error('private database detail'); };
  f.cache.get = () => { throw new Error('must not touch cache'); };
  const response = await serveThumbnail(request(), 'asset-a', f.deps);
  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'Thumbnail unavailable');
  assert.equal(f.events.filter(event => event === 'fetch').length, 1);
});
