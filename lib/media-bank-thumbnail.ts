import sharp from 'sharp';
// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { mediaBankPosterPath } from './media-bank-poster-path.ts';

// Process-local bounds; each deployment instance has its own cache and queue.
export const THUMBNAIL_LIMITS = Object.freeze({
  originalBytes: 12 * 1024 * 1024,
  inputPixels: 24_000_000,
  decodedBytes: 128 * 1024 * 1024,
  outputBytes: 512 * 1024,
  requestMs: 20_000,
  downloadMs: 8_000,
  processingSeconds: 3,
  concurrent: 2,
  concurrentPerOwner: 2,
  queued: 32,
  queuedPerOwner: 24,
  queueMs: 8_000,
  cacheBytes: 32 * 1024 * 1024,
  cacheBytesPerOwner: 8 * 1024 * 1024,
  cacheEntries: 256,
  cacheEntriesPerOwner: 96,
  cacheTtlMs: 5 * 60_000,
});

type Limits = { [K in keyof typeof THUMBNAIL_LIMITS]: number };
export type ThumbnailAsset = {
  id: string;
  user_id: string;
  storage_path: string;
  file_type: string;
  size_bytes?: number | null;
  created_at?: string;
};

export type ThumbnailEventPoster = {
  id: string;
  user_id: string;
  storage_path: string;
  thumbnail_path: string | null;
};

export class ThumbnailError extends Error {
  status: number;
  constructor(status: number) {
    super('Thumbnail unavailable');
    this.status = status;
  }
}

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff']);
const supportedFormats = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'tiff']);
const supportedVideoTypes = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/x-msvideo']);

/** Object keys, never URLs. All upload paths in this application start with user.id. */
export function validThumbnailPath(path: unknown, owner: string): path is string {
  if (typeof path !== 'string' || !owner || path.length > 1024 || !path.startsWith(`${owner}/`)) return false;
  // Reject encoded separators/traversal as well as URL syntax before SDK normalization.
  if (/[%\\\u0000-\u001f\u007f?#:]/.test(path)) return false;
  return path.split('/').every(part => part.length > 0 && part.length <= 255 && part !== '.' && part !== '..');
}

/** Only the public object URL generated for this exact media key is permitted. */
export function validatedThumbnailUrl(source: string, supabaseUrl: string, path: string): string {
  try {
    const base = new URL(supabaseUrl);
    const url = new URL(source);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error();
    if (url.origin !== base.origin || url.username || url.password || url.search || url.hash) throw new Error();
    const expected = `/storage/v1/object/public/media/${path}`;
    if (decodeURIComponent(url.pathname) !== expected) throw new Error();
    return url.href;
  } catch {
    throw new ThumbnailError(404);
  }
}

function checkSignal(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason instanceof ThumbnailError ? signal.reason : new ThumbnailError(499);
}

/** Race for prompt responses, while the original promise retains its work permit until settled. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void work.catch(() => {});
    return Promise.reject(signal.reason || new ThumbnailError(499));
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new ThumbnailError(499));
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function linkedController(parent: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason instanceof ThumbnailError ? parent.reason : new ThumbnailError(499));
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  const timer = setTimeout(() => controller.abort(new ThumbnailError(504)), timeoutMs);
  return {
    controller,
    dispose: () => { clearTimeout(timer); parent.removeEventListener('abort', abort); },
  };
}

/** Read only up to the byte limit, regardless of an absent or dishonest Content-Length. */
export async function readThumbnailOriginal(
  url: string,
  parent: AbortSignal,
  fetcher: typeof fetch = fetch,
  limits: Limits = THUMBNAIL_LIMITS,
): Promise<Buffer> {
  const { controller, dispose } = linkedController(parent, limits.downloadMs);
  const signal = controller.signal;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    checkSignal(signal);
    response = await abortable(fetcher(url, {
      signal, redirect: 'error', cache: 'no-store', credentials: 'omit',
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff' },
    }), signal);
    if (response.status !== 200 || response.redirected) throw new ThumbnailError(404);
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!supportedTypes.has(type)) throw new ThumbnailError(415);
    const encoding = response.headers.get('content-encoding');
    if (encoding && encoding.toLowerCase() !== 'identity') throw new ThumbnailError(415);
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > limits.originalBytes)) {
      throw new ThumbnailError(413);
    }
    if (!response.body) throw new ThumbnailError(404);
    reader = response.body.getReader();
    // One fixed allocation also bounds overhead for millions of tiny chunks.
    const buffer = Buffer.allocUnsafeSlow(limits.originalBytes);
    let size = 0;
    for (;;) {
      checkSignal(signal);
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) break;
      if (size + chunk.value.byteLength > limits.originalBytes) throw new ThumbnailError(413);
      buffer.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
    if (!size) throw new ThumbnailError(415);
    return buffer.subarray(0, size);
  } catch (error) {
    controller.abort(error);
    if (error instanceof ThumbnailError) throw error;
    throw new ThumbnailError(signal.reason instanceof ThumbnailError ? signal.reason.status : 502);
  } finally {
    // Do not wait on a hostile/stalled stream's cancel implementation.
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    else if (response?.body) void response.body.cancel().catch(() => {});
    dispose();
  }
}

function rasterSignature(input: Buffer): boolean {
  const ascii = (start: number, end: number) => input.toString('ascii', start, end);
  return (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff)
    || (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
    || ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
    || ['49492a00', '4d4d002a', '49492b00', '4d4d002b'].includes(input.subarray(0, 4).toString('hex'))
    || (ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12)));
}

/** Reject non-raster input before native parsing, then check decoded dimensions too. */
export async function renderThumbnail(input: Buffer, signal: AbortSignal, limits: Limits = THUMBNAIL_LIMITS): Promise<Buffer> {
  checkSignal(signal);
  if (!input.length || input.length > limits.originalBytes) throw new ThumbnailError(413);
  if (!rasterSignature(input)) throw new ThumbnailError(415);
  const options = { limitInputPixels: limits.inputPixels, sequentialRead: true, failOn: 'warning' as const, pages: 1, animated: false };
  const image = sharp(input, options).timeout({ seconds: limits.processingSeconds });
  try {
    const metadata = await image.metadata();
    checkSignal(signal);
    if (!metadata.format || !supportedFormats.has(metadata.format) || !metadata.width || !metadata.height) throw new ThumbnailError(415);
    const pixels = metadata.width * metadata.height;
    if (pixels > limits.inputPixels) throw new ThumbnailError(413);
    const bytesPerChannel = metadata.depth === 'uchar' ? 1 : metadata.depth === 'ushort' ? 2 : 0;
    if (!bytesPerChannel || !metadata.channels || metadata.channels > 4) throw new ThumbnailError(415);
    if (pixels * metadata.channels * bytesPerChannel > limits.decodedBytes) throw new ThumbnailError(413);
    // Preserve source framing; the shared gallery tile performs the single 3:4 preview crop.
    const output = await image.rotate().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    checkSignal(signal);
    if (!output.length || output.length > limits.outputBytes) throw new ThumbnailError(413);
    return output;
  } catch (error) {
    if (error instanceof ThumbnailError) throw error;
    // Never expose Sharp details, storage paths, or URLs to the browser.
    throw new ThumbnailError(error instanceof Error && /timeout/i.test(error.message) ? 504
      : error instanceof Error && /pixel limit/i.test(error.message) ? 413 : 415);
  } finally {
    image.destroy();
  }
}

type CacheEntry = { owner: string; bytes: Buffer; expires: number };
export class ThumbnailCache {
  private entries = new Map<string, CacheEntry>();
  private totalBytes = 0;
  private limits: Limits;
  private now: () => number;
  constructor(limits: Partial<Limits> = {}, now: () => number = Date.now) {
    this.limits = { ...THUMBNAIL_LIMITS, ...limits };
    this.now = now;
  }
  private drop(key: string) {
    const value = this.entries.get(key);
    if (value) this.totalBytes -= value.bytes.length;
    this.entries.delete(key);
  }
  private prune() {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expires <= now) this.drop(key);
  }
  get(owner: string, key: string): Buffer | undefined {
    this.prune();
    const entry = this.entries.get(JSON.stringify([owner, key]));
    if (!entry) return undefined;
    const scopedKey = JSON.stringify([owner, key]);
    this.entries.delete(scopedKey);
    this.entries.set(scopedKey, entry);
    return entry.bytes;
  }
  set(owner: string, key: string, bytes: Buffer) {
    this.prune();
    const limits = this.limits;
    if (!bytes.length || bytes.length > Math.min(limits.outputBytes, limits.cacheBytes, limits.cacheBytesPerOwner)) return;
    const scopedKey = JSON.stringify([owner, key]);
    this.drop(scopedKey);
    // At most 256 entries: scans stay bounded and no unbounded per-owner map is retained.
    const ownerEntries = [...this.entries].filter(([, entry]) => entry.owner === owner);
    let ownerBytes = ownerEntries.reduce((sum, [, entry]) => sum + entry.bytes.length, 0);
    while (ownerEntries.length >= limits.cacheEntriesPerOwner || ownerBytes + bytes.length > limits.cacheBytesPerOwner) {
      const oldest = ownerEntries.shift();
      if (!oldest) return;
      ownerBytes -= oldest[1].bytes.length;
      this.drop(oldest[0]);
    }
    while (this.entries.size >= limits.cacheEntries || this.totalBytes + bytes.length > limits.cacheBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.drop(oldest);
    }
    // Cache holds only the bounded derivative, never originals or credentials.
    this.entries.set(scopedKey, { owner, bytes: Buffer.from(bytes), expires: this.now() + limits.cacheTtlMs });
    this.totalBytes += bytes.length;
  }
  stats() { return { entries: this.entries.size, bytes: this.totalBytes }; }
}

type Waiter = { owner: string; start: () => void; cancel: () => void };
export class ThumbnailGate {
  private active = 0;
  private owners = new Map<string, number>();
  private waiting: Waiter[] = [];
  private limits: Limits;
  constructor(limits: Partial<Limits> = {}) { this.limits = { ...THUMBNAIL_LIMITS, ...limits }; }
  private available(owner: string) { return this.active < this.limits.concurrent && (this.owners.get(owner) || 0) < this.limits.concurrentPerOwner; }
  private permit(owner: string) {
    this.active++;
    this.owners.set(owner, (this.owners.get(owner) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const count = (this.owners.get(owner) || 1) - 1;
      if (count) this.owners.set(owner, count); else this.owners.delete(owner);
      for (const item of [...this.waiting]) if (this.available(item.owner)) item.start();
    };
  }
  async acquire(owner: string, signal: AbortSignal): Promise<() => void> {
    checkSignal(signal);
    if (this.available(owner)) return this.permit(owner);
    if (this.waiting.length >= this.limits.queued || this.waiting.filter(item => item.owner === owner).length >= this.limits.queuedPerOwner) throw new ThumbnailError(503);
    return new Promise((resolve, reject) => {
      let settled = false;
      const remove = () => {
        this.waiting = this.waiting.filter(item => item !== waiter);
        clearTimeout(timer);
        signal.removeEventListener('abort', waiter.cancel);
      };
      const waiter: Waiter = {
        owner,
        start: () => { if (!settled) { settled = true; remove(); resolve(this.permit(owner)); } },
        cancel: () => { if (!settled) { settled = true; remove(); reject(signal.reason || new ThumbnailError(503)); } },
      };
      const timer = setTimeout(waiter.cancel, this.limits.queueMs);
      this.waiting.push(waiter);
      signal.addEventListener('abort', waiter.cancel, { once: true });
      if (signal.aborted) waiter.cancel();
    });
  }
  stats() { return { active: this.active, queued: this.waiting.length, owners: this.owners.size }; }
}

export type ThumbnailDependencies = {
  getUser: (signal: AbortSignal) => Promise<{ id: string } | null>;
  getOwnedAsset: (id: string, owner: string, signal: AbortSignal) => Promise<ThumbnailAsset | null>;
  getEventPoster?: (asset: ThumbnailAsset, signal: AbortSignal) => Promise<ThumbnailEventPoster | null>;
  getSourceUrl: (path: string) => string;
  supabaseUrl: string;
  fetcher?: typeof fetch;
  render?: typeof renderThumbnail;
  cache?: ThumbnailCache;
  gate?: ThumbnailGate;
  limits?: Partial<Limits>;
};

// Share only derivative data and work limits across requests. Never share authenticated clients.
const thumbnailCache = new ThumbnailCache();
const thumbnailGate = new ThumbnailGate();
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };

export async function serveThumbnail(request: Request, id: string, deps: ThumbnailDependencies): Promise<Response> {
  const limits = { ...THUMBNAIL_LIMITS, ...deps.limits };
  const { controller, dispose } = linkedController(request.signal, limits.requestMs);
  const signal = controller.signal;
  const cache = deps.cache || thumbnailCache;
  const gate = deps.gate || thumbnailGate;
  async function work() {
    const user = await deps.getUser(signal);
    checkSignal(signal);
    if (!user) throw new ThumbnailError(401);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new ThumbnailError(404);
    const asset = await deps.getOwnedAsset(id, user.id, signal);
    checkSignal(signal);
    // Recheck ownership, even if the adapter/database unexpectedly returns a foreign row.
    if (!asset || asset.id !== id || asset.user_id !== user.id || !validThumbnailPath(asset.storage_path, user.id)) throw new ThumbnailError(404);
    const isVideo = supportedVideoTypes.has(asset.file_type);
    if (!isVideo && !supportedTypes.has(asset.file_type)) throw new ThumbnailError(415);
    // A video can be large: only its saved image poster is read and byte-limited.
    if (!isVideo && typeof asset.size_bytes === 'number' && asset.size_bytes > limits.originalBytes) throw new ThumbnailError(413);
    let sourcePath = asset.storage_path;
    if (isVideo) {
      const event = deps.getEventPoster ? await deps.getEventPoster(asset, signal) : null;
      checkSignal(signal);
      // Event sync preserves all three identifiers. A mismatched adapter result is
      // not permission to read an unrelated event's poster, even for the same owner.
      if (event && (event.id !== asset.id || event.user_id !== user.id || event.storage_path !== asset.storage_path)) throw new ThumbnailError(404);
      const posterPath = event?.thumbnail_path ?? mediaBankPosterPath(user.id, asset.id);
      if (!validThumbnailPath(posterPath, user.id) || posterPath === asset.storage_path
        || !/\.(?:jpe?g|png|webp|gif|avif|tiff?)$/i.test(posterPath)) throw new ThumbnailError(404);
      sourcePath = posterPath;
    }
    // No original fetch, URL resolution, or cache lookup may move above the ownership gate.
    // Include the original identity/source AND the selected poster. Poster changes
    // therefore cannot hit an older event/deterministic derivative cache entry.
    const key = JSON.stringify([asset.id, asset.storage_path, asset.file_type, asset.size_bytes, asset.created_at, sourcePath, '480-inside-webp72-v2']);
    const response = (bytes: Buffer) => new Response(new Uint8Array(bytes), {
      headers: { ...privateHeaders, 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length) },
    });
    const cached = cache.get(user.id, key);
    if (cached) return response(cached);
    const release = await gate.acquire(user.id, signal);
    try {
      checkSignal(signal);
      // A preceding request may have populated this entry while this request waited.
      const warmed = cache.get(user.id, key);
      if (warmed) return response(warmed);
      const url = validatedThumbnailUrl(deps.getSourceUrl(sourcePath), deps.supabaseUrl, sourcePath);
      let output: Buffer;
      try {
        const input = await readThumbnailOriginal(url, signal, deps.fetcher, limits);
        output = await (deps.render || renderThumbnail)(input, signal, limits);
      } catch (error) {
        // Missing/invalid saved posters are a safe fallback. Never retry with the
        // original video, decode it, or generate/upload a still on this GET path.
        if (isVideo && !(error instanceof ThumbnailError && [499, 504].includes(error.status))) throw new ThumbnailError(404);
        throw error;
      }
      checkSignal(signal);
      if (!output.length || output.length > limits.outputBytes) throw new ThumbnailError(413);
      cache.set(user.id, key, output);
      return response(output);
    } finally { release(); }
  }
  try {
    return await abortable(work(), signal);
  } catch (error) {
    const status = error instanceof ThumbnailError ? error.status : 500;
    return new Response(status === 401 ? 'Unauthorized' : 'Thumbnail unavailable', {
      status, headers: { ...privateHeaders, ...(status === 503 ? { 'Retry-After': '2' } : {}) },
    });
  } finally { dispose(); }
}
