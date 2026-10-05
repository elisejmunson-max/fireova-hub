/**
 * Saved JPEG posters live beside the original library, in the existing media bucket.
 * Asset IDs are immutable identities; generating/uploading this object is a separate
 * operation. Thumbnail GETs only read it and never create or replace an object.
 */
export function mediaBankPosterPath(owner: string, assetId: string): string | null {
  const identifier = /^[a-zA-Z0-9_-]{1,100}$/;
  if (typeof owner !== 'string' || typeof assetId !== 'string' || !identifier.test(owner) || !identifier.test(assetId)) return null;
  return `${owner}/media-bank-posters/v1/${assetId}.jpg`;
}

/** Keep deletion tied to the owned source and its own generated derivative. */
export function mediaBankDeletionPaths(owner: string, asset: { id: string; storage_path: string; file_type?: string }): string[] | null {
  const poster = mediaBankPosterPath(owner, asset.id);
  const path = asset.storage_path;
  if (!poster || typeof path !== 'string' || !path.startsWith(`${owner}/`)
    || /[%\\\u0000-\u001f\u007f?#:]/.test(path)
    || !path.split('/').every(part => part && part !== '.' && part !== '..')) return null;
  return asset.file_type?.startsWith('video/') ? [...new Set([path, poster])] : [path];
}
