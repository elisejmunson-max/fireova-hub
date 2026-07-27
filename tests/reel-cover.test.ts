import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  canApproveReelPost,
  DEFAULT_REEL_COVER_CROP,
  getDefaultReelCoverCrop,
  getInstagramPreviewAspectClassName,
  getReelCoverCropStyle,
  getReelCoverFadeClassName,
  getNextReelPreviewPlayingState,
  getRecommendedReelCoverSelection,
  getReelCoverPreviewMedia,
  getReelPreviewDisplay,
  getReelPreviewMedia,
  getReelPreviewStatusCopy,
  isDefaultReelCoverCrop,
  moveReelCoverCrop,
  REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME,
  REEL_PREVIEW_PLAY_LABEL,
  zoomReelCoverCrop,
} from '@/lib/content-studio-reel-cover'
import { createOneEventDraftForStudio } from '@/lib/local-fireova-content-studio'
import type { LocalFireovaEvent } from '@/lib/local-fireova-events'
import type { MockMedia } from '@/lib/mock-fireova-content'

const video: MockMedia = {
  id: 'event-video',
  type: 'video',
  src: 'blob:event-video',
  alt: 'Event Reel video',
}

const recommendedCover: MockMedia = {
  id: 'reel-cover-event-video-recommended',
  type: 'photo',
  src: 'blob:recommended-frame',
  alt: 'Recommended Reel cover frame',
}

const customCover: MockMedia = {
  id: 'uploaded-reel-cover-1-custom.jpg',
  type: 'photo',
  src: 'blob:custom-cover',
  alt: 'Uploaded custom Reel cover',
}

const event: LocalFireovaEvent = {
  id: 'event-1',
  name: 'Bailey & Madison',
  type: 'Wedding',
  date: '2026-07-11',
  status: 'Drafts Ready',
  draftCount: 0,
  cover: video,
  media: [video],
  createdAt: '2026-07-11T12:00:00.000Z',
}

const contentStudioSource = fs.readFileSync('app/(app)/content-studio/page.tsx', 'utf8')
const tailwindConfigSource = fs.readFileSync('tailwind.config.ts', 'utf8')

test('uploading a cover does not replace the Reel preview media', () => {
  const coverMedia = customCover

  assert.equal(getReelPreviewMedia(video), video)
  assert.notEqual(getReelPreviewMedia(video), coverMedia)
})

test('Reel preview initially shows the selected cover', () => {
  const display = getReelPreviewDisplay({ videoMedia: video, coverMedia: customCover, isPlaying: false })

  assert.equal(display.mode, 'cover')
  assert.equal(display.media, customCover)
})

test('larger Play button appears over the cover', () => {
  assert.match(REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME, /absolute/)
  assert.match(REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME, /h-\[76px\]/)
  assert.match(REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME, /w-\[76px\]/)
  assert.match(REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME, /bg-black\/75/)
  assert.match(REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME, /text-white/)
})

test('Play button has the correct accessible label', () => {
  assert.equal(REEL_PREVIEW_PLAY_LABEL, 'Play Reel preview')
})

test('internal Instagram Preview label is removed from the simulated post', () => {
  assert.equal(contentStudioSource.includes('Instagram Preview'), false)
})

test('Feed mode defaults to a 4:5 media area', () => {
  assert.equal(getInstagramPreviewAspectClassName('feed', 'video'), 'aspect-[4/5]')
  assert.equal(getInstagramPreviewAspectClassName('feed', 'photo'), 'aspect-[4/5]')
  assert.match(tailwindConfigSource, /safelist: \['aspect-\[4\/5\]', 'aspect-\[9\/16\]'\]/)
})

test('desktop Feed preview is secondary at 240px without transform scaling', () => {
  assert.match(contentStudioSource, /lg:grid-cols-\[270px_minmax\(0,1fr\)\]/)
  assert.match(contentStudioSource, /lg:max-w-\[270px\]/)
  assert.match(contentStudioSource, /lg:w-\[240px\]/)
  assert.doesNotMatch(contentStudioSource, /Fit to Screen/)
  assert.doesNotMatch(contentStudioSource, /Actual Size/)
  assert.doesNotMatch(contentStudioSource, /ResizeObserver/)
  assert.doesNotMatch(contentStudioSource, /transform: `scale/)
})

test('Full Reel mode uses a 9:16 media area for Reel posts', () => {
  assert.equal(getInstagramPreviewAspectClassName('full-reel', 'video'), 'aspect-[9/16]')
  assert.match(contentStudioSource, /instagramPreviewMode === 'full-reel' \? 'lg:w-\[190px\]' : 'lg:w-\[240px\]'/)
  assert.doesNotMatch(contentStudioSource, /max-h-\[620px\]/)
})

test('Reel video does not autoplay before Play is clicked', () => {
  const display = getReelPreviewDisplay({ videoMedia: video, coverMedia: recommendedCover, isPlaying: false })

  assert.equal(display.mode, 'cover')
  assert.equal('autoPlay' in display, false)
})

test('Feed mode uses the selected cover source instead of the raw video element', () => {
  const display = getReelPreviewDisplay({ videoMedia: video, coverMedia: recommendedCover, isPlaying: false })

  assert.equal(display.mode, 'cover')
  assert.equal(display.media, recommendedCover)
  assert.notEqual(display.media, video)
})

test('cover state copy appears before playback', () => {
  const display = getReelPreviewDisplay({ videoMedia: video, coverMedia: recommendedCover, isPlaying: false })

  assert.equal(getReelPreviewStatusCopy(display), 'Showing selected Reel cover. Press play to preview the video.')
})

test('clicking Play displays and plays the original Reel video', () => {
  const display = getReelPreviewDisplay({
    videoMedia: video,
    coverMedia: customCover,
    isPlaying: getNextReelPreviewPlayingState('play'),
  })

  assert.equal(display.mode, 'video')
  assert.equal(display.media, video)
  assert.equal(display.autoPlay, true)
})

test('caption renders with the account name inline', () => {
  assert.match(contentStudioSource, /<span className="font-semibold">Fireova Pizza<\/span>/)
})

test('header actions caption credits and hashtags remain visible in the compact post', () => {
  assert.match(contentStudioSource, /Fireova Pizza/)
  assert.match(contentStudioSource, /InstagramActionIcon kind="like"/)
  assert.match(contentStudioSource, /InstagramActionIcon kind="comment"/)
  assert.match(contentStudioSource, /InstagramHandleText value=\{instagramCredits\}/)
  assert.match(contentStudioSource, /instagramHashtags\.join\(' '\)/)
  assert.match(contentStudioSource, /data-instagram-caption-preview/)
  assert.doesNotMatch(contentStudioSource, /Liked by fireovapizza and others/)
})

test('caption truncates and expands with more', () => {
  assert.match(contentStudioSource, /instagramCaptionIsExpanded/)
  assert.match(contentStudioSource, /\[-webkit-line-clamp:2\]/)
  assert.match(contentStudioSource, /instagramCaptionIsExpanded \? 'less' : 'more'/)
  assert.match(contentStudioSource, /absolute bottom-0 right-0 bg-white pl-1/)
  assert.match(contentStudioSource, /setCaptionExpanded\(false\)/)
  assert.match(contentStudioSource, /\[instagramPreviewMode, primaryMedia\?\.id\]/)
})

test('playing state copy appears during playback', () => {
  const display = getReelPreviewDisplay({ videoMedia: video, coverMedia: recommendedCover, isPlaying: true })

  assert.equal(getReelPreviewStatusCopy(display), 'Previewing Reel.')
})

test('Reel preview remains the original video when cover media changes', () => {
  const firstPreview = getReelPreviewMedia(video)
  const coverPreview = getReelCoverPreviewMedia(customCover)
  const secondPreview = getReelPreviewMedia(video)

  assert.equal(firstPreview, video)
  assert.equal(coverPreview, customCover)
  assert.equal(secondPreview, video)
})

test('cover preview updates independently from the Reel video', () => {
  assert.equal(getReelCoverPreviewMedia(customCover), customCover)
  assert.equal(getReelPreviewMedia(video), video)
})

test('changing the cover updates both preview modes without replacing the video', () => {
  const feed = getReelPreviewDisplay({ videoMedia: video, coverMedia: customCover, isPlaying: false })
  const fullReel = getReelPreviewDisplay({ videoMedia: video, coverMedia: customCover, isPlaying: false })
  const playing = getReelPreviewDisplay({ videoMedia: video, coverMedia: customCover, isPlaying: true })

  assert.equal(getInstagramPreviewAspectClassName('feed', video.type), 'aspect-[4/5]')
  assert.equal(getInstagramPreviewAspectClassName('full-reel', video.type), 'aspect-[9/16]')
  assert.equal(feed.media, customCover)
  assert.equal(fullReel.media, customCover)
  assert.equal(playing.media, video)
})

test('Feed covers fill the 4:5 viewport while Full Reel preserves the complete source', () => {
  assert.match(contentStudioSource, /instagramPreviewMode === 'feed' \? 'object-cover' : 'object-contain'/)
  assert.match(contentStudioSource, /relative overflow-hidden \$\{instagramMediaAspectClassName\}/)
  assert.match(contentStudioSource, /style=\{instagramPreviewMode === 'feed' \? reelCoverCropStyle : undefined\}/)
})

test('vendor credits appear within the caption area', () => {
  const creditsPosition = contentStudioSource.indexOf('<InstagramHandleText value={instagramCredits} />')
  const captionPosition = contentStudioSource.indexOf('<span className="font-semibold">Fireova Pizza</span>')
  const hashtagsPosition = contentStudioSource.indexOf('instagramHashtags.join')

  assert.ok(captionPosition > -1)
  assert.ok(creditsPosition > captionPosition)
  assert.ok(hashtagsPosition > creditsPosition)
})

test('hashtags appear below the caption', () => {
  assert.match(contentStudioSource, /instagramHashtags\.length > 0/)
  assert.match(contentStudioSource, /instagramHashtags\.join\(' '\)/)
})

test('Edit Preview and editor controls are outside the simulated post', () => {
  const editPreviewPosition = contentStudioSource.indexOf('Edit Preview')
  const articleStart = contentStudioSource.indexOf('data-instagram-preview-post')
  const articleEnd = contentStudioSource.indexOf('</article>', articleStart)
  const reelCoverPosition = contentStudioSource.indexOf('Cover Photo')

  assert.ok(editPreviewPosition > -1)
  assert.ok(articleStart > -1)
  assert.ok(articleEnd > articleStart)
  assert.ok(editPreviewPosition < articleStart)
  assert.ok(reelCoverPosition > articleEnd)
})

test('crop controls live inside the unified Edit Preview modal', () => {
  const modalPosition = contentStudioSource.indexOf('previewEditorOpen &&')
  const dialogPosition = contentStudioSource.indexOf('aria-labelledby="preview-editor-title"')
  const moveLeftPosition = contentStudioSource.indexOf('Move left')

  assert.ok(modalPosition > -1)
  assert.ok(dialogPosition > modalPosition)
  assert.ok(moveLeftPosition > dialogPosition)
  assert.doesNotMatch(contentStudioSource, /Adjust Crop/)
})

test('default preview toolbar exposes only Edit Preview while display modes live in the panel', () => {
  const toolbarPosition = contentStudioSource.indexOf('data-preview-toolbar')
  const editPosition = contentStudioSource.indexOf('Edit Preview')
  const articlePosition = contentStudioSource.indexOf('data-instagram-preview-post')
  const modalPosition = contentStudioSource.indexOf('previewEditorOpen &&')
  const feedPreviewPosition = contentStudioSource.indexOf('Feed Preview')
  const fullReelPreviewPosition = contentStudioSource.indexOf('Full Reel Preview')

  assert.ok(toolbarPosition > -1)
  assert.ok(editPosition > toolbarPosition)
  assert.ok(editPosition < articlePosition)
  assert.ok(feedPreviewPosition > modalPosition)
  assert.ok(fullReelPreviewPosition > modalPosition)
  assert.match(contentStudioSource, /data-preview-toolbar className="[^"]*flex-nowrap[^"]*whitespace-nowrap"/)
  assert.doesNotMatch(contentStudioSource, /Change Photo/)
  assert.doesNotMatch(contentStudioSource.slice(toolbarPosition, articlePosition), />Feed</)
  assert.doesNotMatch(contentStudioSource.slice(toolbarPosition, articlePosition), />Full Reel</)
})

test('secondary preview tools use a fixed modal and do not increase normal page height', () => {
  assert.match(contentStudioSource, /fixed inset-0 z-50/)
  assert.match(contentStudioSource, /role="dialog" aria-modal="true"/)
  assert.match(contentStudioSource, /closePreviewEditor/)
  assert.match(contentStudioSource, /previewEditorTriggerRef\.current\?\.focus\(\)/)
  assert.match(contentStudioSource, /event\.key === 'Escape'/)
  assert.match(contentStudioSource, /event\.key !== 'Tab'/)
  assert.match(contentStudioSource, /h-full w-full max-w-lg/)
  assert.match(contentStudioSource, /Feed Preview/)
  assert.match(contentStudioSource, /Full Reel Preview/)
  assert.match(contentStudioSource, /previewEditorCoverRef/)
})

test('preview and editor remain side by side on desktop while mobile stacks', () => {
  assert.match(contentStudioSource, /grid gap-4 lg:grid-cols-\[270px_minmax\(0,1fr\)\]/)
})

test('editor aligns with the post below the toolbar and uses compact vertical spacing', () => {
  assert.match(contentStudioSource, /data-creative-review-checklist className="[^"]*lg:mt-\[33px\]"/)
  assert.match(contentStudioSource, /data-creative-review-checklist className="space-y-2/)
  assert.match(contentStudioSource, /rows=\{4\}/)
  assert.match(contentStudioSource, /min-h-\[104px\]/)
  assert.match(contentStudioSource, /\[field-sizing:content\]/)
  assert.match(contentStudioSource, />Caption</)
  assert.doesNotMatch(contentStudioSource, /Caption Workspace/)
  assert.match(contentStudioSource, /<div className="space-y-2">/)
  assert.match(contentStudioSource, /caption\.length\} characters/)
})

test('Cover Photo presents the selected image as a plain-language creative recommendation', () => {
  assert.match(contentStudioSource, /Cover Photo/)
  assert.match(contentStudioSource, /This image appears in the Instagram feed\./)
  assert.match(contentStudioSource, /reelCoverSaveState === 'saving'/)
  assert.match(contentStudioSource, /Auto Pick/)
  assert.doesNotMatch(contentStudioSource, />Current Cover</)
  assert.match(contentStudioSource, /availableReelCoverOptions\.slice\(0, 4\)/)
  assert.match(contentStudioSource, /Additional cover frames will appear after media analysis\./)
  assert.match(contentStudioSource, /onUnavailable=/)
})

test('Instagram proof has stronger subtle separation without changing its dimensions', () => {
  assert.match(contentStudioSource, /shadow-\[0_12px_32px_rgba\(28,25,23,0\.14\)\] ring-1 ring-stone-400/)
  assert.match(contentStudioSource, /lg:w-\[240px\]/)
})

test('creative review polish adds a compact ready status and intentional empty credits state', () => {
  assert.match(contentStudioSource, /reviewPosition=\{currentReviewIndex/)
  assert.match(contentStudioSource, /postFormat=\{source === 'event' \? \(isReelPost \? 'Reel' : 'Feed post'\) : undefined\}/)
  assert.match(contentStudioSource, /No vendor credits yet\./)
  assert.match(contentStudioSource, />\+ Add Vendor</)
  assert.match(contentStudioSource, /rounded-\[14px\] bg-white p-3/)
})

test('creative assistant language stays confident without duplicated status noise', () => {
  assert.match(contentStudioSource, />Strategy</)
  assert.match(contentStudioSource, /✨ Improve/)
  assert.match(contentStudioSource, />Why\?</)
  assert.match(contentStudioSource, />Change →</)
  assert.match(contentStudioSource, /Vendor Credits/)
  assert.match(contentStudioSource, /Hashtags/)
  assert.match(contentStudioSource, /Choose Different →/)
  assert.match(contentStudioSource, /Post \{reviewPosition\.current\} of \{reviewPosition\.total\}/)
  assert.match(contentStudioSource, />\s*Approve Post\s*</)
  assert.doesNotMatch(contentStudioSource, /Good storytelling opportunity/)
  assert.doesNotMatch(contentStudioSource, /ReviewCheck/)
  assert.doesNotMatch(contentStudioSource, /In sync/)
})

test('review workflow supports batch navigation, keyboard shortcuts, and compact actions', () => {
  assert.match(contentStudioSource, /Post \{reviewPosition\.current\} of \{reviewPosition\.total\}/)
  assert.match(contentStudioSource, /aria-label="Review progress"/)
  assert.match(contentStudioSource, /type="button" disabled[^>]*aria-label="Previous post"/)
  assert.match(contentStudioSource, /type="button" disabled[^>]*aria-label="Next post"/)
  assert.match(contentStudioSource, /aria-label="Previous post"/)
  assert.match(contentStudioSource, /aria-label="Next post"/)
  assert.match(contentStudioSource, /event\.key === 'ArrowLeft'/)
  assert.match(contentStudioSource, /event\.key === 'ArrowRight'/)
  assert.match(contentStudioSource, /event\.key === 'Enter'/)
  assert.match(contentStudioSource, /event\.metaKey \|\| event\.ctrlKey/)
  assert.match(contentStudioSource, /event\.key === 'Escape'/)
  assert.match(contentStudioSource, /aria-label="More post actions"/)
  assert.match(contentStudioSource, />Save Draft</)
  assert.match(contentStudioSource, />Duplicate</)
  assert.match(contentStudioSource, />Delete</)
})

test('approval advances through unreviewed posts and finishes with a completion summary', () => {
  assert.match(contentStudioSource, /reviewedIdsAfterApproval/)
  assert.match(contentStudioSource, /nextUnreviewedOpportunity/)
  assert.match(contentStudioSource, /router\.push\(buildEventContentStudioHref\(event\.id, nextUnreviewedOpportunity\)\)/)
  assert.match(contentStudioSource, /setReviewCompletion/)
  assert.match(contentStudioSource, /All posts reviewed/)
  assert.match(contentStudioSource, /approved/)
  assert.match(contentStudioSource, /skipped/)
  assert.match(contentStudioSource, /Return to Event/)
  assert.match(contentStudioSource, /View Draft Posts/)
})

test('caption autosave persists review edits across previous and next navigation', () => {
  assert.match(contentStudioSource, /readLocalPostEdits/)
  assert.match(contentStudioSource, /writeLocalPostEdits/)
  assert.match(contentStudioSource, /`review:\$\{opportunityId\}`/)
  assert.match(contentStudioSource, /savedReviewEdit\?\.caption \?\? suggestion/)
  assert.match(contentStudioSource, /setCaptionSaveState\('saved'\), 300/)
})

test('review progress bar reflects persisted and in-session reviews', () => {
  assert.match(contentStudioSource, /reviewedOpportunityCount/)
  assert.match(contentStudioSource, /reviewedInSessionIds\.includes\(opportunity\.id\)/)
  assert.match(contentStudioSource, /aria-label="Review progress bar"/)
  assert.match(contentStudioSource, /reviewedOpportunityCount \/ eventOpportunities\.length/)
  assert.match(contentStudioSource, /\{reviewedOpportunityCount\} of \{eventOpportunities\.length\} reviewed/)
})

test('one Improve menu exposes the requested caption transformations', () => {
  assert.match(contentStudioSource, /✨ Improve/)
  for (const label of ['Make Shorter', 'More Emotional', 'More Luxury', 'More Professional', 'More Fun', 'Add CTA', 'Add Emojis', 'Rewrite Completely']) {
    assert.match(contentStudioSource, new RegExp(`>${label}<`))
  }
  assert.doesNotMatch(contentStudioSource, />Improve Caption</)
  assert.doesNotMatch(contentStudioSource, />Why this caption\?</)
})

test('desktop preview is sticky while mobile keeps normal scrolling', () => {
  assert.match(contentStudioSource, /lg:sticky lg:top-2/)
  assert.match(contentStudioSource, /lg:max-w-\[270px\]/)
})

test('saved cropX cropY and cropZoom affect the preview style', () => {
  const style = getReelCoverCropStyle({ cropX: 35, cropY: 64, cropZoom: 1.3 })

  assert.equal(style.objectPosition, '35% 64%')
  assert.equal(style.transform, 'scale(1.3)')
  assert.equal(style.transformOrigin, '35% 64%')
})

test('compact preview sizing does not alter saved crop settings', () => {
  const crop = { cropX: 35, cropY: 64, cropZoom: 1.3 }

  assert.deepEqual(crop, { cropX: 35, cropY: 64, cropZoom: 1.3 })
  assert.equal(getReelCoverCropStyle(crop).objectPosition, '35% 64%')
})

test('crop controls update and reset the saved crop settings', () => {
  const moved = moveReelCoverCrop(DEFAULT_REEL_COVER_CROP, 'left')
  const zoomed = zoomReelCoverCrop(moved, 'in')
  const reset = getDefaultReelCoverCrop()

  assert.equal(moved.cropX, 45)
  assert.equal(zoomed.cropZoom, 1.1)
  assert.equal(isDefaultReelCoverCrop(zoomed), false)
  assert.deepEqual(reset, DEFAULT_REEL_COVER_CROP)
  assert.equal(isDefaultReelCoverCrop(reset), true)
})

test('the Reel Cover choices and Feed preview use the same selected cover state', () => {
  const previewCoverPosition = contentStudioSource.indexOf("style={instagramPreviewMode === 'feed' ? reelCoverCropStyle : undefined}")
  const coverChoicesPosition = contentStudioSource.indexOf('availableReelCoverOptions.slice(0, 4)')

  assert.ok(previewCoverPosition > -1)
  assert.ok(coverChoicesPosition > previewCoverPosition)
  assert.match(contentStudioSource, /reelCover\?\.id === cover\.id/)
})

test('changing the cover updates the static preview cover', () => {
  const first = getReelPreviewDisplay({ videoMedia: video, coverMedia: recommendedCover, isPlaying: false })
  const next = getReelPreviewDisplay({ videoMedia: video, coverMedia: customCover, isPlaying: false })

  assert.equal(first.mode, 'cover')
  assert.equal(first.media, recommendedCover)
  assert.equal(next.mode, 'cover')
  assert.equal(next.media, customCover)
})

test('changing the cover does not autoplay the Reel', () => {
  const isPlaying = getNextReelPreviewPlayingState('cover-changed')
  const display = getReelPreviewDisplay({ videoMedia: video, coverMedia: customCover, isPlaying })

  assert.equal(isPlaying, false)
  assert.equal(display.mode, 'cover')
  assert.equal('autoPlay' in display, false)
})

test('removing a custom cover restores the recommended cover', () => {
  const restored = getRecommendedReelCoverSelection([recommendedCover])

  assert.equal(restored.coverMedia, recommendedCover)
  assert.equal(restored.sourceLabel, 'Recommended Cover')
})

test('when playback ends the cover returns', () => {
  const playing = getReelPreviewDisplay({ videoMedia: video, coverMedia: customCover, isPlaying: true })
  const ended = getReelPreviewDisplay({
    videoMedia: video,
    coverMedia: customCover,
    isPlaying: getNextReelPreviewPlayingState('ended'),
  })

  assert.equal(playing.mode, 'video')
  assert.equal(ended.mode, 'cover')
  assert.equal(ended.media, customCover)
  assert.equal(getReelPreviewStatusCopy(ended), 'Showing selected Reel cover. Press play to preview the video.')
})

test('playing the Reel does not modify the saved crop', () => {
  const crop = { cropX: 42, cropY: 60, cropZoom: 1.2 }
  const display = getReelPreviewDisplay({
    videoMedia: video,
    coverMedia: customCover,
    isPlaying: getNextReelPreviewPlayingState('play'),
  })

  assert.equal(display.mode, 'video')
  assert.deepEqual(crop, { cropX: 42, cropY: 60, cropZoom: 1.2 })
})

test('playback end restores the cropped cover', () => {
  const crop = { cropX: 42, cropY: 60, cropZoom: 1.2 }
  const ended = getReelPreviewDisplay({
    videoMedia: video,
    coverMedia: customCover,
    isPlaying: getNextReelPreviewPlayingState('ended'),
  })

  assert.equal(ended.mode, 'cover')
  assert.equal(ended.media, customCover)
  assert.equal(getReelCoverCropStyle(crop).objectPosition, '42% 60%')
})

test('Full Reel mode preserves the actual video aspect ratio with contain rendering', () => {
  assert.equal(getInstagramPreviewAspectClassName('full-reel', video.type), 'aspect-[9/16]')
  assert.match(contentStudioSource, /media=\{reelPreviewDisplay\.media\}\s+className="h-full w-full object-contain"/)
})

test('reduced-motion users do not receive the fade transition', () => {
  assert.equal(getReelCoverFadeClassName(true), '')
  assert.match(getReelCoverFadeClassName(false), /duration-200/)
  assert.match(getReelCoverFadeClassName(false), /transition-opacity/)
})

test('reloading a draft restores cover and video separately', () => {
  const draft = createOneEventDraftForStudio({
    event,
    goal: 'Event Recap',
    media: [video],
    reelCover: customCover,
    caption: 'A few favorite moments.',
    hashtags: ['#FireovaPizza'],
  })
  const display = getReelPreviewDisplay({ videoMedia: draft.media, coverMedia: draft.reelCover, isPlaying: false })

  assert.equal(display.mode, 'cover')
  assert.equal(display.media, customCover)
  assert.equal(draft.media, video)
  assert.equal(draft.reelCover, customCover)
})

test('photo posts are unaffected by Reel preview cover behavior', () => {
  const photo: MockMedia = {
    id: 'photo-post',
    type: 'photo',
    src: 'blob:photo-post',
    alt: 'Photo post',
  }
  const display = getReelPreviewDisplay({ videoMedia: photo, coverMedia: customCover, isPlaying: false })

  assert.equal(display.mode, 'media')
  assert.equal(display.media, photo)
  assert.equal(canApproveReelPost(photo, null), true)
  assert.equal(getInstagramPreviewAspectClassName('full-reel', photo.type), 'aspect-[4/5]')
})

test('event Reel drafts persist video and cover media separately', () => {
  const draft = createOneEventDraftForStudio({
    event,
    goal: 'Event Recap',
    media: [video],
    reelCover: customCover,
    caption: 'A few favorite moments.',
    hashtags: ['#FireovaPizza'],
  })

  assert.equal(draft.media, video)
  assert.equal(draft.reelCover, customCover)
  assert.notEqual(draft.media, draft.reelCover)
})

test('approval remains allowed for Reels when a cover exists', () => {
  assert.equal(canApproveReelPost(video, null), false)
  assert.equal(canApproveReelPost(video, customCover), true)
})

test('event Reel drafts persist the selected cover image', () => {
  const reelCover: MockMedia = {
    id: 'reel-cover-event-video-frame-1',
    type: 'photo',
    src: 'blob:frame-1',
    alt: 'Reel cover frame',
  }

  const draft = createOneEventDraftForStudio({
    event,
    goal: 'Event Recap',
    media: [video],
    reelCover,
    caption: 'A few favorite moments.',
    hashtags: ['#FireovaPizza'],
  })

  assert.deepEqual(draft.reelCover, reelCover)
})

test('event Reel drafts persist feed crop position separately from video and cover', () => {
  const draft = createOneEventDraftForStudio({
    event,
    goal: 'Event Recap',
    media: [video],
    reelCover: customCover,
    reelCoverCrop: { cropX: 42, cropY: 60, cropZoom: 1.2 },
    caption: 'A few favorite moments.',
    hashtags: ['#FireovaPizza'],
  })

  assert.equal(draft.media, video)
  assert.equal(draft.reelCover, customCover)
  assert.deepEqual(draft.reelCoverCrop, { cropX: 42, cropY: 60, cropZoom: 1.2 })
})
