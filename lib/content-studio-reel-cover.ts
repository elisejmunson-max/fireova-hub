import type { MockMedia } from '@/lib/mock-fireova-content'

export type ReelCoverSelection = {
  coverMedia: MockMedia | null
  sourceLabel: string
}

export type InstagramPreviewMode = 'feed' | 'full-reel'
export type ReelCoverCropSettings = {
  cropX: number
  cropY: number
  cropZoom: number
}

export type ReelPreviewDisplay =
  | { mode: 'cover'; media: MockMedia }
  | { mode: 'video'; media: MockMedia; autoPlay: boolean }
  | { mode: 'media'; media: MockMedia }
  | { mode: 'empty'; media: null }

export const REEL_PREVIEW_PLAY_LABEL = 'Play Reel preview'

export const REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME = [
  'absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
  'bg-black/75 text-3xl font-semibold leading-none text-white ring-2 ring-white/80',
  'transition hover:scale-[1.03] hover:bg-black/85 active:scale-[0.99]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-950',
  'motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
].join(' ')

export const DEFAULT_REEL_COVER_CROP: ReelCoverCropSettings = {
  cropX: 50,
  cropY: 58,
  cropZoom: 1,
}

export function getReelPreviewMedia(videoMedia: MockMedia | null | undefined) {
  return videoMedia ?? null
}

export function getReelPreviewDisplay({
  videoMedia,
  coverMedia,
  isPlaying,
}: {
  videoMedia: MockMedia | null | undefined
  coverMedia: MockMedia | null | undefined
  isPlaying: boolean
}): ReelPreviewDisplay {
  if (!videoMedia) return { mode: 'empty', media: null }
  if (videoMedia.type !== 'video') return { mode: 'media', media: videoMedia }
  if (isPlaying) return { mode: 'video', media: videoMedia, autoPlay: true }
  if (coverMedia) return { mode: 'cover', media: coverMedia }
  return { mode: 'video', media: videoMedia, autoPlay: false }
}

export function getNextReelPreviewPlayingState(action: 'play' | 'ended' | 'show-cover' | 'cover-changed') {
  return action === 'play'
}

export function getReelPreviewStatusCopy(display: ReelPreviewDisplay) {
  if (display.mode === 'video' && display.autoPlay) return 'Previewing Reel.'
  if (display.mode === 'cover') return 'Showing selected Reel cover. Press play to preview the video.'
  return ''
}

export function getReelCoverFadeClassName(prefersReducedMotion: boolean) {
  return prefersReducedMotion ? '' : 'transition-opacity duration-200 ease-out'
}

export function getInstagramPreviewAspectClassName(mode: InstagramPreviewMode, mediaType: MockMedia['type'] | undefined) {
  if (mediaType === 'video' && mode === 'full-reel') return 'aspect-[9/16]'
  return 'aspect-[4/5]'
}

export function getDefaultReelCoverCrop(): ReelCoverCropSettings {
  return { ...DEFAULT_REEL_COVER_CROP }
}

export function normalizeReelCoverCrop(settings: Partial<ReelCoverCropSettings> | null | undefined): ReelCoverCropSettings {
  return {
    cropX: clampCropValue(settings?.cropX ?? DEFAULT_REEL_COVER_CROP.cropX, 0, 100),
    cropY: clampCropValue(settings?.cropY ?? DEFAULT_REEL_COVER_CROP.cropY, 0, 100),
    cropZoom: clampCropValue(settings?.cropZoom ?? DEFAULT_REEL_COVER_CROP.cropZoom, 1, 2),
  }
}

export function moveReelCoverCrop(settings: ReelCoverCropSettings, direction: 'left' | 'right' | 'up' | 'down') {
  const next = { ...settings }
  const delta = 5

  if (direction === 'left') next.cropX -= delta
  if (direction === 'right') next.cropX += delta
  if (direction === 'up') next.cropY -= delta
  if (direction === 'down') next.cropY += delta

  return normalizeReelCoverCrop(next)
}

export function zoomReelCoverCrop(settings: ReelCoverCropSettings, direction: 'in' | 'out') {
  return normalizeReelCoverCrop({
    ...settings,
    cropZoom: settings.cropZoom + (direction === 'in' ? 0.1 : -0.1),
  })
}

export function getReelCoverCropStyle(settings: ReelCoverCropSettings) {
  const normalized = normalizeReelCoverCrop(settings)

  return {
    objectPosition: `${normalized.cropX}% ${normalized.cropY}%`,
    transform: `scale(${normalized.cropZoom})`,
    transformOrigin: `${normalized.cropX}% ${normalized.cropY}%`,
  }
}

export function isDefaultReelCoverCrop(settings: ReelCoverCropSettings) {
  const normalized = normalizeReelCoverCrop(settings)

  return (
    normalized.cropX === DEFAULT_REEL_COVER_CROP.cropX &&
    normalized.cropY === DEFAULT_REEL_COVER_CROP.cropY &&
    normalized.cropZoom === DEFAULT_REEL_COVER_CROP.cropZoom
  )
}

export function getReelCoverPreviewMedia(coverMedia: MockMedia | null | undefined) {
  return coverMedia ?? null
}

export function canApproveReelPost(videoMedia: MockMedia | null | undefined, coverMedia: MockMedia | null | undefined) {
  if (videoMedia?.type !== 'video') return true
  return Boolean(coverMedia)
}

export function getRecommendedReelCoverSelection(options: MockMedia[]): ReelCoverSelection {
  return {
    coverMedia: options[0] ?? null,
    sourceLabel: 'Recommended Cover',
  }
}

export function isCustomReelCoverLabel(label: string) {
  return label === 'Custom Cover'
}

function clampCropValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Number(value.toFixed(2))))
}
