import type { ManualAsset, ManualKind, ManualPost } from './manual-content-drafts';

export type MediaMode = 'photo' | 'video';
export const mediaMode = (media: ManualAsset[]): MediaMode => media.some(asset => asset.file_type.startsWith('video/')) ? 'video' : 'photo';
export const editableMedia = (asset: ManualAsset) => !asset.missing && (asset.file_type.startsWith('image/') || asset.file_type.startsWith('video/'));
export function mediaSelectionError(media: ManualAsset[]): string {
  if (!media.length) return 'Choose at least one photo or one video.';
  if (media.some(asset => !editableMedia(asset))) return 'Remove or replace unavailable media before saving.';
  if (new Set(media.map(asset => asset.id)).size !== media.length) return 'Each media item can only appear once.';
  const videos = media.filter(asset => asset.file_type.startsWith('video/'));
  if (videos.length && media.length !== 1) return 'A Reel uses one video. Photos and videos cannot be mixed.';
  if (media.length > 10) return 'A carousel can contain up to 10 photos.';
  return '';
}
export function updatedPostMedia(post: ManualPost, media: ManualAsset[]): ManualPost {
  const error = mediaSelectionError(media);
  if (error) throw new Error(error);
  const kind: ManualKind = mediaMode(media) === 'video' ? 'Reel' : media.length > 1 ? 'Carousel' : 'Photo';
  return { ...post, media: [...media], kind };
}
export function movePostMedia(media: ManualAsset[], index: number, direction: -1 | 1) {
  const to = index + direction;
  if (index < 0 || index >= media.length || to < 0 || to >= media.length) return media;
  const next = [...media];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
