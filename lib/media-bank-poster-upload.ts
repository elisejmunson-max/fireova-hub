import sharp from 'sharp';
// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { mediaBankPosterPath } from './media-bank-poster-path.ts';
// @ts-expect-error Direct Node TypeScript tests require the suffix.
import { ThumbnailGate } from './media-bank-thumbnail.ts';

const MAX_BYTES = 256 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/x-msvideo']);
type Asset = { id: string; user_id: string; file_type: string };
export type PosterUploadDependencies = {
  getUser: () => Promise<{ id: string } | null>;
  getOwnedAsset: (id: string, owner: string) => Promise<Asset | null>;
  upload: (path: string, bytes: Buffer) => Promise<boolean>;
  remove: (path: string) => Promise<void>;
  gate?: ThumbnailGate;
  requestMs?: number;
};

const posterGate = new ThumbnailGate({ concurrent: 2, concurrentPerOwner: 1, queued: 8, queuedPerOwner: 2, queueMs: 8000 });
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

/** A local-file derivative can be saved only for an already-owned video. No original is read. */
export async function saveMediaBankPoster(request: Request, id: string, deps: PosterUploadDependencies): Promise<Response> {
  const reply = (status: number) => Response.json({ ok: status === 201 }, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(abort, deps.requestMs ?? 20000);
  const signal = controller.signal;
  const check = () => { if (signal.aborted) throw new Error('aborted'); };
  async function work() {
    const user = await deps.getUser();
    check();
    if (!user || user.id === 'dev') return reply(401);
    const path = mediaBankPosterPath(user.id, id);
    if (!path) return reply(404);
    const asset = await deps.getOwnedAsset(id, user.id);
    check();
    if (!asset || asset.id !== id || asset.user_id !== user.id || !VIDEO_TYPES.has(asset.file_type)) return reply(404);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg') return reply(415);
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) return reply(413);
    if (!request.body) return reply(400);
    const release = await (deps.gate || posterGate).acquire(user.id, signal);
    try {
    check();
    const reader = request.body.getReader();
    const bytes = Buffer.allocUnsafeSlow(MAX_BYTES);
    let size = 0;
    const bodyController = new AbortController();
    const abortBody = () => bodyController.abort();
    signal.addEventListener('abort', abortBody, { once: true });
    if (signal.aborted) abortBody();
    const bodyTimer = setTimeout(abortBody, 8000);
    try {
      for (;;) {
        const chunk = await abortable(reader.read(), bodyController.signal);
        if (chunk.done) break;
        if (size + chunk.value.byteLength > MAX_BYTES) return reply(413);
        bytes.set(chunk.value, size); size += chunk.value.byteLength;
      }
    } finally {
      clearTimeout(bodyTimer);
      signal.removeEventListener('abort', abortBody);
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (!size || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return reply(415);
    const decoder = sharp(bytes.subarray(0, size), { limitInputPixels: 480 * 480, failOn: 'warning' }).timeout({ seconds: 3 });
    let output: Buffer;
    try {
      const info = await decoder.metadata();
      check();
      if (info.format !== 'jpeg' || !info.width || !info.height || info.width > 480 || info.height > 480) return reply(415);
      // Decode, normalize orientation and strip metadata before storing the small JPEG.
      output = await decoder.rotate().jpeg({ quality: 82 }).toBuffer();
      check();
    } catch { return reply(415); }
    finally { decoder.destroy(); }
    if (output.length > MAX_BYTES) return reply(413);
    check();
    const saved = await deps.upload(path, output);
    if (!saved) return reply(409);
    // Keep this cleanup running even if the caller disconnects while storage writes.
    // DELETE also removes the derivative after row removal, closing either ordering.
    let current: Asset | null;
    try { current = await deps.getOwnedAsset(id, user.id); }
    catch { await deps.remove(path); return reply(503); }
    if (!current || current.id !== id || current.user_id !== user.id || !VIDEO_TYPES.has(current.file_type)) {
      await deps.remove(path); return reply(404);
    }
    return reply(201);
    } finally { release(); }
  }
  try { return await abortable(work(), signal); }
  catch { return reply(503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); }
}
