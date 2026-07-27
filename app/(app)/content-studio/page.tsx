'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LocalMedia from '@/components/local-media'
import {
  closeCaptionTool,
  getCaptionToolArrow,
  getCaptionToolButtonClassName,
  getCaptionToolPanelId,
  isCaptionToolExpanded,
  shouldCloseCaptionToolForKey,
  shouldCloseCaptionToolForOutsideTarget,
  toggleCaptionTool,
  type CaptionTool,
} from '@/lib/content-studio-caption-tools'
import {
  canApproveReelPost,
  DEFAULT_REEL_COVER_CROP,
  getDefaultReelCoverCrop,
  getInstagramPreviewAspectClassName,
  getNextReelPreviewPlayingState,
  getRecommendedReelCoverSelection,
  getReelCoverCropStyle,
  getReelCoverFadeClassName,
  getReelPreviewDisplay,
  getReelPreviewMedia,
  isDefaultReelCoverCrop,
  isCustomReelCoverLabel,
  type InstagramPreviewMode,
  moveReelCoverCrop,
  REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME,
  REEL_PREVIEW_PLAY_LABEL,
  type ReelCoverCropSettings,
  zoomReelCoverCrop,
} from '@/lib/content-studio-reel-cover'
import {
  CONTENT_BANK_ANGLES,
  createContentBankDraftFromStudio,
  createMediaCreditText,
  createMediaCreditSnapshot,
  createMockMediaForContentBankItem,
  getContentBankDisplayTitle,
  getSelectedContentBankItems,
  readAllContentBankItems,
  type ContentBankAngle,
  type LocalContentBankItem,
} from '@/lib/local-fireova-content-bank'
import {
  readLocalEvents,
  readLocalGeneratedPosts,
  readLocalPostEdits,
  readLocalPostStatuses,
  writeLocalEvents,
  writeLocalGeneratedPosts,
  writeLocalPostEdits,
  writeLocalPostStatuses,
  type LocalFireovaEvent,
} from '@/lib/local-fireova-events'
import {
  buildEventCreditsForStudio,
  createEventCaptionSuggestion,
  createEventHashtags,
  createOneEventDraftForStudio,
  findEventForStudio,
  getRecommendedEventGoal,
  getUniqueEventMedia,
  type EventPostGoal,
} from '@/lib/local-fireova-content-studio'
import {
  isGenericFallbackOpportunity,
  updateMarketingOpportunity,
  type MarketingOpportunity,
} from '@/lib/local-fireova-opportunities'
import {
  getOrGenerateMarketingIntelligence,
  getVisibleSortedIntelligenceOpportunities,
} from '@/lib/local-fireova-marketing-intelligence'
import type { MockEvent, MockMedia } from '@/lib/mock-fireova-content'

const LOCAL_MEDIA_ANALYSIS_KEY = 'fireova-marketing-hub-media-analysis-v1'

type StudioSource = 'media' | 'event'
type StoryOption =
  | 'Celebrate the Couple'
  | 'Highlight the Food'
  | 'Fire Oven Experience'
  | 'Venue Spotlight'
  | 'Team Behind the Scenes'
  | 'Guest Experience'
  | 'Vendor Feature'
  | 'Event Recap'

const CAPTION_DIRECTION_OPTIONS: Array<{ story: StoryOption; label: string }> = [
  { story: 'Celebrate the Couple', label: 'Celebrate the Couple' },
  { story: 'Highlight the Food', label: 'Highlight the Food' },
  { story: 'Fire Oven Experience', label: 'Fire Oven Experience' },
  { story: 'Venue Spotlight', label: 'Venue Spotlight' },
  { story: 'Team Behind the Scenes', label: 'Team Behind the Scenes' },
  { story: 'Guest Experience', label: 'Guest Experience' },
  { story: 'Vendor Feature', label: 'Vendor Feature' },
  { story: 'Event Recap', label: 'Event Recap' },
]

const STORY_TO_MEDIA_GOAL: Record<StoryOption, ContentBankAngle> = {
  'Celebrate the Couple': 'Brand Awareness',
  'Highlight the Food': 'Food Feature',
  'Fire Oven Experience': 'Cooking Action',
  'Venue Spotlight': 'Brand Awareness',
  'Team Behind the Scenes': 'Team Spotlight',
  'Guest Experience': 'Brand Awareness',
  'Vendor Feature': 'Brand Awareness',
  'Event Recap': 'Behind the Scenes',
}

const STORY_TO_EVENT_GOAL: Record<StoryOption, EventPostGoal> = {
  'Celebrate the Couple': 'Wedding Moment',
  'Highlight the Food': 'Food Feature',
  'Fire Oven Experience': 'Interactive Experience',
  'Venue Spotlight': 'Venue Spotlight',
  'Team Behind the Scenes': 'Behind the Scenes',
  'Guest Experience': 'Guest Experience',
  'Vendor Feature': 'Vendor Spotlight',
  'Event Recap': 'Event Recap',
}

export default function ContentStudioPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const source = (searchParams?.get('source') === 'event' ? 'event' : 'media') as StudioSource
  const mediaIds = useMemo(
    () => (searchParams?.get('ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    [searchParams]
  )
  const eventId = searchParams?.get('eventId') ?? ''
  const opportunityId = searchParams?.get('opportunityId') ?? ''
  const draftId = searchParams?.get('draftId') ?? ''
  const builderMode = searchParams?.get('builder') === '1'
  const eventMediaIdsParam = searchParams?.get('mediaIds') ?? ''
  const angleParam = searchParams?.get('angle') ?? ''

  const [allMediaItems, setAllMediaItems] = useState<LocalContentBankItem[]>([])
  const [localEvents, setLocalEvents] = useState<LocalFireovaEvent[]>([])
  const [localSourcesLoaded, setLocalSourcesLoaded] = useState(false)
  const [selectedMediaItemIds, setSelectedMediaItemIds] = useState<string[]>(mediaIds)
  const [selectedEventMediaIds, setSelectedEventMediaIds] = useState<string[]>([])
  const [mediaGoal, setMediaGoal] = useState<ContentBankAngle>('Food Feature')
  const [eventGoal, setEventGoal] = useState<EventPostGoal>('Event Highlight')
  const [caption, setCaption] = useState('')
  const [lastSuggestion, setLastSuggestion] = useState('')
  const [suggestionVariant, setSuggestionVariant] = useState(0)
  const [hashtagsText, setHashtagsText] = useState('')
  const [creditsText, setCreditsText] = useState('')
  const [previewEditorOpen, setPreviewEditorOpen] = useState(false)
  const [previewEditorSection, setPreviewEditorSection] = useState<'media' | 'cover'>('media')
  const [activeCaptionTool, setActiveCaptionTool] = useState<CaptionTool | null>(null)
  const [reelCover, setReelCover] = useState<MockMedia | null>(null)
  const [reelCoverOptions, setReelCoverOptions] = useState<MockMedia[]>([])
  const [unavailableCoverIds, setUnavailableCoverIds] = useState<string[]>([])
  const [reelCoverSaveState, setReelCoverSaveState] = useState<'saving' | 'saved'>('saved')
  const [reelCoverSourceLabel, setReelCoverSourceLabel] = useState('Recommended')
  const [isReelPreviewPlaying, setIsReelPreviewPlaying] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isReelCoverVisible, setIsReelCoverVisible] = useState(true)
  const [instagramPreviewMode, setInstagramPreviewMode] = useState<InstagramPreviewMode>('feed')
  const [reelCoverCrop, setReelCoverCrop] = useState<ReelCoverCropSettings>(DEFAULT_REEL_COVER_CROP)
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [hashtagsOpen, setHashtagsOpen] = useState(false)
  const [captionSaveState, setCaptionSaveState] = useState<'saving' | 'saved'>('saved')
  const [notice, setNotice] = useState('')
  const [createdDraftId, setCreatedDraftId] = useState('')
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [reviewCompletion, setReviewCompletion] = useState<{ approved: number; skipped: number } | null>(null)
  const [reviewedInSessionIds, setReviewedInSessionIds] = useState<string[]>([])
  const captionToolRef = useRef<HTMLDivElement>(null)
  const previewEditorTriggerRef = useRef<HTMLButtonElement>(null)
  const previewEditorDialogRef = useRef<HTMLDivElement>(null)
  const previewEditorCoverRef = useRef<HTMLElement>(null)
  const reelCoverUploadRef = useRef<HTMLInputElement>(null)
  const reelPreviewVideoRef = useRef<HTMLVideoElement>(null)
  const reelPreviewPlayButtonRef = useRef<HTMLButtonElement>(null)
  const shouldRestorePlayFocusRef = useRef(false)
  const approvePostShortcutRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    setAllMediaItems(readAllContentBankItems())
    const events = readLocalEvents()
    setLocalEvents(events)
    setLocalSourcesLoaded(true)
  }, [])

  const mediaItems = useMemo(() => getSelectedContentBankItems(selectedMediaItemIds), [selectedMediaItemIds, allMediaItems])
  const primaryMediaItem = mediaItems[0] ?? null
  const event = useMemo(() => source === 'event' && eventId ? findEventForStudio(eventId, localEvents) : null, [eventId, localEvents, source])
  const existingEventDraft = useMemo(
    () => source === 'event' && event && draftId
      ? readLocalGeneratedPosts(event.id).find((draft) => draft.id === draftId) ?? null
      : null,
    [draftId, event, source]
  )
  const eventMedia = useMemo(() => event ? getUniqueEventMedia(event) : [], [event])
  const eventRecommendationReport = useMemo(
    () => source === 'event' && event ? getOrGenerateMarketingIntelligence(event) : null,
    [event, source]
  )
  const eventOpportunities = useMemo(
    () => eventRecommendationReport ? getVisibleSortedIntelligenceOpportunities(eventRecommendationReport) : [],
    [eventRecommendationReport]
  )
  const selectedEventMedia = useMemo(
    () => eventMedia.filter((media) => selectedEventMediaIds.includes(media.id)),
    [eventMedia, selectedEventMediaIds]
  )
  const selectedMedia = source === 'event'
    ? selectedEventMedia
    : mediaItems.map(createMockMediaForContentBankItem)
  const sourceLabel = source === 'event' ? event?.name ?? 'Event' : 'Content Library'
  const backHref = source === 'event' && event ? `/events/${event.id}` : '/content-bank'
  const changeHref = source === 'event' ? '/events' : '/content-bank'
  const eventCredits = event ? buildEventCreditsForStudio(event) : undefined
  const requiredMediaCredit = primaryMediaItem ? createMediaCreditSnapshot(primaryMediaItem) : undefined
  const requiredCreditMissing = Boolean(requiredMediaCredit?.creditText && !creditsText.includes(requiredMediaCredit.creditText))
  const primaryMedia = selectedMedia[0] ?? event?.cover
  const previewMedia = getReelPreviewMedia(primaryMedia)
  const isReelPost = primaryMedia?.type === 'video'
  const reelPreviewDisplay = getReelPreviewDisplay({
    videoMedia: previewMedia,
    coverMedia: reelCover,
    isPlaying: isReelPreviewPlaying,
  })
  const reelCoverFadeClassName = getReelCoverFadeClassName(prefersReducedMotion)
  const instagramMediaAspectClassName = getInstagramPreviewAspectClassName(instagramPreviewMode, primaryMedia?.type)
  const reelCoverCropStyle = getReelCoverCropStyle(reelCoverCrop)
  const instagramCaption = caption.trim()
  const instagramCredits = formatCreditsForDisplay(creditsText)
  const instagramHashtags = parseHashtags(hashtagsText)
  const instagramCaptionIsExpanded = captionExpanded
  const approveBlockedForCover = Boolean(source === 'event' && !canApproveReelPost(primaryMedia, reelCover))
  const activeStory = source === 'event' ? getStoryForEventGoal(eventGoal) : getStoryForMediaGoal(mediaGoal)
  const mediaChoices = source === 'event' ? eventMedia : allMediaItems.map(createMockMediaForContentBankItem)
  const contentContext = getStudioContentContext({ source, item: primaryMediaItem, event, media: primaryMedia })
  const creativeRead = getCreativeRead({ source, item: primaryMediaItem, event, activeStory })
  const hashtagPreview = parseHashtags(hashtagsText).slice(0, 4).join(' ')
  const creditChips = getCreditChips(creditsText)
  const availableReelCoverOptions = reelCoverOptions.filter((cover) => !unavailableCoverIds.includes(cover.id))
  const reviewReadyCount = [
    Boolean(caption.trim()),
    Boolean(primaryMedia && (!isReelPost || reelCover)),
    !requiredCreditMissing,
  ].filter(Boolean).length
  const currentReviewIndex = opportunityId ? eventOpportunities.findIndex((item) => item.id === opportunityId) : -1
  const previousOpportunity = currentReviewIndex > 0 ? eventOpportunities[currentReviewIndex - 1] : null
  const nextOpportunity = currentReviewIndex >= 0 && currentReviewIndex < eventOpportunities.length - 1 ? eventOpportunities[currentReviewIndex + 1] : null
  const previousReviewHref = event && previousOpportunity ? buildEventContentStudioHref(event.id, previousOpportunity) : ''
  const nextReviewHref = event && nextOpportunity ? buildEventContentStudioHref(event.id, nextOpportunity) : ''
  const currentOpportunity = currentReviewIndex >= 0 ? eventOpportunities[currentReviewIndex] : null
  const eventPostStatuses = event ? readLocalPostStatuses(event.id) : {}
  const reviewedOpportunityCount = eventOpportunities.filter((opportunity) => {
    if (reviewedInSessionIds.includes(opportunity.id)) return true
    const status = opportunity.generatedPostId ? eventPostStatuses[opportunity.generatedPostId] : undefined
    return status === 'Approved' || status === 'Skipped' || status === 'Scheduled' || status === 'Published'
  }).length
  const reviewContentType = currentOpportunity?.recommendedFormat === 'Carousel'
    ? 'Carousel'
    : isReelPost || currentOpportunity?.recommendedFormat === 'Reel'
      ? 'Reel'
      : 'Photo'

  useEffect(() => {
    if (!previewEditorOpen) return

    const dialog = previewEditorDialogRef.current
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    const initialFocus = previewEditorSection === 'cover'
      ? previewEditorCoverRef.current?.querySelector<HTMLElement>(focusableSelector)
      : dialog?.querySelector<HTMLElement>(focusableSelector)
    initialFocus?.focus()
    if (previewEditorSection === 'cover') previewEditorCoverRef.current?.scrollIntoView({ block: 'start' })

    function handlePreviewEditorKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePreviewEditor()
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handlePreviewEditorKeyDown)
    return () => document.removeEventListener('keydown', handlePreviewEditorKeyDown)
  }, [previewEditorOpen, previewEditorSection])

  useEffect(() => {
    if (!event || selectedEventMediaIds.length > 0) return
    const opportunityMediaIds = eventMediaIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
    setSelectedEventMediaIds(opportunityMediaIds.length > 0 ? opportunityMediaIds : getUniqueEventMedia(event).slice(0, 1).map((media) => media.id))
    setEventGoal(existingEventDraft ? existingEventDraft.tone as EventPostGoal : getRecommendedEventGoal(event))
  }, [event, eventMediaIdsParam, existingEventDraft, selectedEventMediaIds.length])

  useEffect(() => {
    if (source !== 'media' || !primaryMediaItem) return
    const suggestedGoal = isContentBankAngle(angleParam) ? angleParam : getRecommendedMediaGoal(primaryMediaItem)
    setMediaGoal(suggestedGoal)
  }, [angleParam, primaryMediaItem, source])

  useEffect(() => {
    if (source !== 'event' || !event) return
    const report = getOrGenerateMarketingIntelligence(event)
    const opportunity = opportunityId ? report.opportunities.find((item) => item.id === opportunityId) : null
    const suggestion = opportunity
      ? `${opportunity.summary}\n\n${createEventCaptionSuggestion(event, eventGoal, suggestionVariant)}`
      : createEventCaptionSuggestion(event, eventGoal, suggestionVariant)
    const savedReviewEdit = opportunityId ? readLocalPostEdits(event.id)[`review:${opportunityId}`] : undefined
    if (existingEventDraft) {
      setCaption(savedReviewEdit?.caption ?? existingEventDraft.caption)
    } else {
      setCaption(savedReviewEdit?.caption ?? suggestion)
    }
    setLastSuggestion(suggestion)
  }, [event, eventGoal, existingEventDraft?.caption, opportunityId, source, suggestionVariant])

  useEffect(() => {
    if (requiredCreditMissing) setCreditsOpen(true)
  }, [requiredCreditMissing])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    function updateReducedMotion(event: MediaQueryListEvent) {
      setPrefersReducedMotion(event.matches)
    }

    mediaQuery.addEventListener('change', updateReducedMotion)
    return () => mediaQuery.removeEventListener('change', updateReducedMotion)
  }, [])

  useEffect(() => {
    setReelCoverOptions(primaryMedia?.type === 'video' ? getReelCoverOptions(primaryMedia) : [])
    setUnavailableCoverIds([])
  }, [primaryMedia])

  useEffect(() => {
    if (!existingEventDraft) return
    setReelCover(existingEventDraft.reelCover ?? null)
    setReelCoverCrop(existingEventDraft.reelCoverCrop ?? DEFAULT_REEL_COVER_CROP)
  }, [existingEventDraft])

  useEffect(() => {
    if (!isReelPost) {
      setReelCover(null)
      setReelCoverSourceLabel('Recommended')
      return
    }

    if (existingEventDraft?.reelCover) return

    if (reelCover && reelCover.id.startsWith(`reel-cover-${primaryMedia?.id}-`)) return
    if (reelCover && reelCover.id.startsWith('uploaded-reel-cover-')) return

    const recommendedCover = getRecommendedReelCoverSelection(reelCoverOptions)
    if (recommendedCover.coverMedia) {
      setReelCover(recommendedCover.coverMedia)
      setReelCoverSourceLabel(recommendedCover.sourceLabel)
    }
  }, [existingEventDraft?.reelCover, isReelPost, primaryMedia?.id, reelCover, reelCoverOptions])

  useEffect(() => {
    if (!reelCover) return

    setReelCoverSaveState('saving')
    const timer = window.setTimeout(() => setReelCoverSaveState('saved'), 450)
    return () => window.clearTimeout(timer)
  }, [reelCover])

  useEffect(() => {
    setIsReelPreviewPlaying(getNextReelPreviewPlayingState('cover-changed'))
  }, [previewMedia?.id, reelCover?.id])

  useEffect(() => {
    setCaptionExpanded(false)
  }, [instagramPreviewMode, primaryMedia?.id])

  useEffect(() => {
    if (!reelCover?.id || prefersReducedMotion) {
      setIsReelCoverVisible(true)
      return
    }

    setIsReelCoverVisible(false)
    const timer = window.setTimeout(() => setIsReelCoverVisible(true), 20)
    return () => window.clearTimeout(timer)
  }, [prefersReducedMotion, reelCover?.id])

  useEffect(() => {
    if (isReelPreviewPlaying || !shouldRestorePlayFocusRef.current) return

    shouldRestorePlayFocusRef.current = false
    window.requestAnimationFrame(() => {
      reelPreviewPlayButtonRef.current?.focus()
    })
  }, [isReelPreviewPlaying])

  useEffect(() => {
    if (source !== 'media' || !primaryMediaItem) return
    const suggestion = createMediaCaptionSuggestion(primaryMediaItem, mediaGoal, suggestionVariant)
    setCaption(suggestion)
    setLastSuggestion(suggestion)
  }, [mediaGoal, primaryMediaItem, source, suggestionVariant])

  useEffect(() => {
    if (source === 'event' && event) {
      setHashtagsText(existingEventDraft?.hashtags.join(' ') ?? createEventHashtags(event, eventGoal).join(' '))
      setCreditsText(existingEventDraft?.vendorCreditBlock ?? eventCredits?.creditBlock ?? '')
      return
    }

    if (source === 'media' && primaryMediaItem) {
      setHashtagsText(createMediaHashtags(mediaItems, mediaGoal).join(' '))
      setCreditsText(createMediaCreditText(primaryMediaItem))
    }
  }, [event?.id, eventCredits?.creditBlock, eventGoal, existingEventDraft, mediaItems, mediaGoal, primaryMediaItem?.id, source])

  useEffect(() => {
    if (!caption.trim()) return

    setCaptionSaveState('saving')
    if (source === 'event' && event && opportunityId) {
      writeLocalPostEdits(event.id, {
        ...readLocalPostEdits(event.id),
        [`review:${opportunityId}`]: {
          caption,
          hashtags: parseHashtags(hashtagsText),
          vendorCreditBlock: creditsText,
        },
      })
    }
    const timer = window.setTimeout(() => setCaptionSaveState('saved'), 300)
    return () => window.clearTimeout(timer)
  }, [caption, creditsText, event, hashtagsText, opportunityId, source])

  useEffect(() => {
    if (!activeCaptionTool) return

    function onPointerDown(event: PointerEvent) {
      if (shouldCloseCaptionToolForOutsideTarget(captionToolRef.current, event.target)) {
        setActiveCaptionTool(closeCaptionTool())
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (shouldCloseCaptionToolForKey(event.key)) {
        setActiveCaptionTool(closeCaptionTool())
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [activeCaptionTool])

  useEffect(() => {
    if (source !== 'event' || !event || previewEditorOpen || activeCaptionTool) return

    function onReviewShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]')
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!approveBlockedForCover) approvePostShortcutRef.current?.()
        return
      }
      if (isEditing) return
      if (event.key === 'ArrowLeft' && previousReviewHref) {
        event.preventDefault()
        router.push(previousReviewHref)
      } else if (event.key === 'ArrowRight' && nextReviewHref) {
        event.preventDefault()
        router.push(nextReviewHref)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        router.push(backHref)
      }
    }

    document.addEventListener('keydown', onReviewShortcut)
    return () => document.removeEventListener('keydown', onReviewShortcut)
  }, [activeCaptionTool, approveBlockedForCover, backHref, event, nextReviewHref, previousReviewHref, previewEditorOpen, router, source])

  function toggleActiveCaptionTool(tool: CaptionTool) {
    setActiveCaptionTool((current) => toggleCaptionTool(current, tool))
  }

  function rewriteCaption() {
    setSuggestionVariant((value) => value + 1)
    setActiveCaptionTool(closeCaptionTool())
  }

  function makeCaptionFriendlier() {
    setCaption((value) => value.trim() ? `${value.trim()} We love getting to share moments like this.` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function makeCaptionMoreExciting() {
    setCaption((value) => value.trim() ? `${value.trim()} This one deserves a spot on the feed.` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function makeCaptionLonger() {
    setCaption((value) => value.trim() ? `${value.trim()} Every detail came together in a way that made this event feel warm, memorable, and easy to enjoy.` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function makeCaptionMoreEmotional() {
    setCaption((value) => value.trim() ? `${value.trim()} It is always special to be part of moments people will remember long after the last slice is served.` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function makeCaptionProfessional() {
    setCaption((value) => value.trim() ? `${value.trim()} Thoughtful service, fresh food, and a smooth event experience from start to finish.` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function makeCaptionLuxury() {
    setCaption((value) => value.trim() ? `${value.trim()} A polished celebration with thoughtful details, warm hospitality, and a Fireova spread made to feel effortless.` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function makeCaptionPlayful() {
    setCaption((value) => value.trim() ? `${value.trim()} Good people, hot pizza, and the kind of event energy we love.` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function shortenCaption() {
    setCaption((value) => {
      const trimmed = value.trim()
      if (!trimmed) return value

      const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [trimmed]
      return sentences.slice(0, Math.max(1, Math.min(2, sentences.length))).join(' ')
    })
    setActiveCaptionTool(closeCaptionTool())
  }

  function restoreSuggestion() {
    setCaption(lastSuggestion)
  }

  function chooseStory(story: StoryOption) {
    if (source === 'event') {
      setEventGoal(STORY_TO_EVENT_GOAL[story])
      setActiveCaptionTool(closeCaptionTool())
      return
    }

    setMediaGoal(STORY_TO_MEDIA_GOAL[story])
    setActiveCaptionTool(closeCaptionTool())
  }

  function emphasizeReason(reason: string) {
    const story = getStoryForReason(reason, source, event)
    chooseStory(story)
    setSuggestionVariant((value) => value + 1)
    setActiveCaptionTool(closeCaptionTool())
  }

  function openPreviewEditor(section: 'media' | 'cover' = 'media') {
    setPreviewEditorSection(section)
    setPreviewEditorOpen(true)
  }

  function closePreviewEditor() {
    setPreviewEditorOpen(false)
    window.requestAnimationFrame(() => previewEditorTriggerRef.current?.focus())
  }

  function chooseMedia(media: MockMedia) {
    if (source === 'event') {
      setSelectedEventMediaIds([media.id])
      setReelCover(null)
      return
    }

    setSelectedMediaItemIds([getItemIdForMedia(media.id, allMediaItems)])
    setReelCover(null)
  }

  function chooseReelCover(cover: MockMedia, label = 'Selected') {
    setReelCover(cover)
    setReelCoverSourceLabel(label)
    setReelCoverCrop(getDefaultReelCoverCrop())
  }

  function uploadReelCover(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return

    chooseReelCover({
      id: `uploaded-reel-cover-${Date.now()}-${file.name}`,
      type: 'photo',
      src: URL.createObjectURL(file),
      alt: file.name || 'Uploaded Reel cover',
    }, 'Custom Cover')
  }

  function removeCustomReelCover() {
    const recommendedCover = getRecommendedReelCoverSelection(reelCoverOptions)
    setReelCover(recommendedCover.coverMedia)
    setReelCoverSourceLabel(recommendedCover.sourceLabel)
  }

  function playReelPreview() {
    setIsReelPreviewPlaying(getNextReelPreviewPlayingState('play'))
  }

  function showReelCoverPreview(options: { restoreFocus?: boolean } = {}) {
    shouldRestorePlayFocusRef.current = Boolean(options.restoreFocus)
    setIsReelPreviewPlaying(getNextReelPreviewPlayingState('show-cover'))
  }

  function handleReelPreviewEnded() {
    shouldRestorePlayFocusRef.current = true
    setIsReelPreviewPlaying(getNextReelPreviewPlayingState('ended'))
  }

  function moveFeedCrop(direction: 'left' | 'right' | 'up' | 'down') {
    setReelCoverCrop((settings) => moveReelCoverCrop(settings, direction))
  }

  function zoomFeedCrop(direction: 'in' | 'out') {
    setReelCoverCrop((settings) => zoomReelCoverCrop(settings, direction))
  }

  function resetFeedCrop() {
    setReelCoverCrop(getDefaultReelCoverCrop())
  }

  function addCaptionEmojis() {
    setCaption((value) => value.trim() ? `${value.trim()} 🍕🔥` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function addCaptionCta() {
    setCaption((value) => value.trim() ? `${value.trim()} Ready to bring the Fireova experience to your event? Let’s make it happen.` : value)
    setActiveCaptionTool(closeCaptionTool())
  }

  function mentionVenue() {
    const venue = source === 'event' ? [event?.venueName, event?.venueLocation].filter(Boolean).join(' in ') : ''
    if (!venue) {
      setNotice('No venue is saved for this post yet.')
      setActiveCaptionTool(closeCaptionTool())
      return
    }

    setCaption((value) => appendSentence(value, `Hosted at ${venue}.`))
    setActiveCaptionTool(closeCaptionTool())
  }

  function mentionVendors() {
    const vendorHandles = eventCredits?.handles ?? []
    const vendorLine = vendorHandles.length > 0
      ? vendorHandles.join(' ')
      : eventCredits?.creditBlock?.split('\n').find((line) => line.trim() && !line.toLowerCase().includes('venue'))?.trim() ?? ''

    if (!vendorLine) {
      setNotice('No vendor credits are saved for this post yet.')
      setActiveCaptionTool(closeCaptionTool())
      return
    }

    setCaption((value) => appendSentence(value, `Vendor love: ${vendorLine}`))
    setActiveCaptionTool(closeCaptionTool())
  }

  function createMediaDraft() {
    if (mediaItems.length === 0) {
      setNotice('Choose a photo before saving this post.')
      return
    }

    if (requiredCreditMissing) {
      setNotice('This post needs the saved photo credit before it can be saved.')
      return
    }

    const draft = createContentBankDraftFromStudio({
      items: mediaItems,
      angle: mediaGoal,
      caption,
      hashtags: parseHashtags(hashtagsText),
      mediaCreditText: creditsText.trim(),
    })

    if (!draft) return
    setCreatedDraftId(draft.id)
    router.push('/draft-posts')
  }

  function createEventDraft(status: 'Draft' | 'Approved' = 'Draft') {
    if (!event) return
    if (status === 'Approved' && !canApproveReelPost(primaryMedia, reelCover)) {
      setNotice('Choose a Reel cover before approving this post.')
      return
    }

    const media = selectedEventMedia.length > 0 ? selectedEventMedia : eventMedia.slice(0, 1)
    const generatedDraft = createOneEventDraftForStudio({
      event,
      goal: eventGoal,
      media,
      reelCover: isReelPost ? reelCover ?? undefined : undefined,
      reelCoverCrop: isReelPost ? reelCoverCrop : undefined,
      caption,
      hashtags: parseHashtags(hashtagsText),
      vendorCreditBlock: creditsText,
    })
    const draft = existingEventDraft
      ? { ...generatedDraft, id: existingEventDraft.id }
      : generatedDraft
    const existingDrafts = readLocalGeneratedPosts(event.id)
    const nextDrafts = [draft, ...existingDrafts.filter((item) => item.id !== draft.id)]
    writeLocalGeneratedPosts(event.id, nextDrafts)
    const previousStatuses = readLocalPostStatuses(event.id)
    const nextStatuses = status === 'Approved'
      ? { ...previousStatuses, [draft.id]: 'Approved' as const }
      : previousStatuses
    if (status === 'Approved') writeLocalPostStatuses(event.id, nextStatuses)
    updateEventDraftCount(event.id, nextDrafts.length)
    if (opportunityId) {
      updateMarketingOpportunity(event.id, opportunityId, {
        generatedPostId: draft.id,
        status: 'Converted to Post',
      })
      getOrGenerateMarketingIntelligence(event, { forceRegenerate: true })
    }
    setCreatedDraftId(draft.id)
    if (status !== 'Approved' || !opportunityId) {
      router.push('/draft-posts')
      return
    }

    const reviewedIdsAfterApproval = new Set([...reviewedInSessionIds, opportunityId])
    setReviewedInSessionIds([...reviewedIdsAfterApproval])
    const remainingOpportunities = [
      ...eventOpportunities.slice(currentReviewIndex + 1),
      ...eventOpportunities.slice(0, currentReviewIndex),
    ].filter((opportunity) => {
      if (reviewedIdsAfterApproval.has(opportunity.id)) return false
      const existingStatus = opportunity.generatedPostId ? nextStatuses[opportunity.generatedPostId] : undefined
      return existingStatus !== 'Approved' && existingStatus !== 'Skipped' && existingStatus !== 'Scheduled' && existingStatus !== 'Published'
    })
    const nextUnreviewedOpportunity = remainingOpportunities[0]

    if (nextUnreviewedOpportunity) {
      router.push(buildEventContentStudioHref(event.id, nextUnreviewedOpportunity))
      return
    }

    const completionStatuses = Object.values(nextStatuses)
    setReviewCompletion({
      approved: completionStatuses.filter((postStatus) => postStatus === 'Approved' || postStatus === 'Scheduled' || postStatus === 'Published').length,
      skipped: completionStatuses.filter((postStatus) => postStatus === 'Skipped').length,
    })
  }

  function updateEventDraftCount(id: string, draftCount: number) {
    writeLocalEvents(readLocalEvents().map((item) => item.id === id ? { ...item, draftCount } : item))
  }

  const saveDraft = source === 'event' ? createEventDraft : createMediaDraft
  const approvePost = source === 'event' ? () => createEventDraft('Approved') : undefined
  approvePostShortcutRef.current = approvePost

  if (source === 'event' && eventId && !localSourcesLoaded) {
    return <LoadingSource />
  }

  if (source === 'event' && eventId && localSourcesLoaded && !event) {
    return <MissingSource title="Event not found" href="/events" />
  }

  if (source === 'media' && mediaIds.length > 0 && allMediaItems.length > 0 && mediaItems.length === 0) {
    return <MissingSource title="Content not found" href="/content-bank" />
  }

  if (reviewCompletion && event) {
    return <ReviewCompletion event={event} approved={reviewCompletion.approved} skipped={reviewCompletion.skipped} />
  }

  if (source === 'event' && event && !opportunityId && !builderMode) {
    return (
      <EventOpportunitySelection
        event={event}
        opportunities={eventOpportunities}
      />
    )
  }

  return (
    <div className="min-h-full bg-stone-50 pb-8">
      <header className="border-b border-stone-200 bg-white px-5 pb-2 pt-3 sm:px-8 sm:pb-2 sm:pt-3">
        <div className="mx-auto max-w-6xl">
          <SourceHeader
            eyebrow={source === 'event' ? event?.name ?? 'Event' : 'Social post workspace'}
            title={source === 'event' ? 'Review Post' : 'Create Post'}
            backHref={backHref}
            changeHref={changeHref}
            onSaveDraft={saveDraft}
            onApprove={approvePost}
            approveDisabled={approveBlockedForCover}
            source={source}
            postFormat={source === 'event' ? (isReelPost ? 'Reel' : 'Feed post') : undefined}
            reviewReadyCount={source === 'event' ? reviewReadyCount : undefined}
            reviewPosition={currentReviewIndex >= 0 ? { current: currentReviewIndex + 1, total: eventOpportunities.length } : undefined}
            contentType={source === 'event' ? reviewContentType : undefined}
            previousHref={previousReviewHref}
            nextHref={nextReviewHref}
            menuOpen={headerMenuOpen}
            onToggleMenu={() => setHeaderMenuOpen((value) => !value)}
          />
        </div>
      </header>

      <main className="px-5 pt-2 sm:px-8 sm:pt-2">
        <div className="mx-auto max-w-5xl">
            <section className="rounded-[20px] bg-[#f5f2ee] p-2.5 shadow-[0_14px_44px_rgba(28,25,23,0.06)] ring-1 ring-stone-200">
              <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)] lg:items-start">
                <div className="mx-auto w-full max-w-full lg:sticky lg:top-2 lg:max-w-[270px]">
                <div data-preview-toolbar className="relative mb-1.5 flex flex-nowrap items-center justify-end whitespace-nowrap">
                  <div className="flex min-w-0 shrink-0 items-center">
                    <button
                      ref={previewEditorTriggerRef}
                      type="button"
                      onClick={() => openPreviewEditor('media')}
                      className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-50"
                      aria-haspopup="dialog"
                    >
                      Edit Preview
                    </button>
                  </div>
                </div>

                <article
                  data-instagram-preview-post
                  className={`mx-auto w-full max-w-full overflow-hidden rounded-[16px] bg-white text-stone-950 shadow-[0_12px_32px_rgba(28,25,23,0.14)] ring-1 ring-stone-400 transition-shadow duration-200 hover:shadow-[0_16px_38px_rgba(28,25,23,0.17)] motion-reduce:transition-none ${instagramPreviewMode === 'full-reel' ? 'lg:w-[190px]' : 'lg:w-[240px]'}`}
                >
                  <div className="flex items-center gap-2.5 border-b border-stone-100 px-2.5 py-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-ember-600 via-rose-500 to-yellow-400 p-[2px] ring-1 ring-stone-200">
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-stone-950 text-[11px] font-semibold text-white">F</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-4 text-stone-950">Fireova Pizza</p>
                      {(event?.venueName || event?.venueLocation) && (
                        <p className="truncate text-[11px] leading-4 text-stone-500">{[event?.venueName, event?.venueLocation].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                    <button type="button" className="rounded-full p-1 text-stone-900 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950" aria-label="Post options">
                      <InstagramActionIcon kind="menu" />
                    </button>
                  </div>

                  <div className={`relative overflow-hidden ${instagramMediaAspectClassName} bg-stone-100`}>
                    {reelPreviewDisplay.mode === 'cover' ? (
                      <>
                        <LocalMedia media={reelPreviewDisplay.media} className={`h-full w-full ${instagramPreviewMode === 'feed' ? 'object-cover' : 'object-contain'} ${reelCoverFadeClassName} ${isReelCoverVisible ? 'opacity-100' : 'opacity-0'}`} style={instagramPreviewMode === 'feed' ? reelCoverCropStyle : undefined} />
                        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/65 px-2 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm">Reel</span>
                        <button
                          ref={reelPreviewPlayButtonRef}
                          type="button"
                          onClick={playReelPreview}
                          className={REEL_PREVIEW_PLAY_BUTTON_CLASS_NAME}
                          aria-label={REEL_PREVIEW_PLAY_LABEL}
                        >
                          ▶
                        </button>
                      </>
                    ) : reelPreviewDisplay.mode === 'video' ? (
                      <>
                        <LocalMedia
                          media={reelPreviewDisplay.media}
                          className="h-full w-full object-contain"
                          controls
                          muted={false}
                          autoPlay={reelPreviewDisplay.autoPlay}
                          onEnded={handleReelPreviewEnded}
                          videoRef={reelPreviewVideoRef}
                        />
                        {isReelPreviewPlaying && (
                          <button
                            type="button"
                            onClick={() => showReelCoverPreview({ restoreFocus: true })}
                            className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-stone-800 ring-1 ring-stone-200 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                          >
                            Show Cover
                          </button>
                        )}
                      </>
                    ) : reelPreviewDisplay.mode === 'media' ? (
                      <LocalMedia media={reelPreviewDisplay.media} className="h-full w-full object-cover object-center" controls={reelPreviewDisplay.media.type === 'video'} muted={false} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm font-semibold text-stone-400">Post image</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-2.5 py-1">
                    <div className="flex items-center gap-4">
                      <button type="button" className="text-stone-950 hover:text-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950" aria-label="Like preview post">
                        <InstagramActionIcon kind="like" />
                      </button>
                      <button type="button" className="text-stone-950 hover:text-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950" aria-label="Comment on preview post">
                        <InstagramActionIcon kind="comment" />
                      </button>
                      <button type="button" className="text-stone-950 hover:text-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950" aria-label="Share preview post">
                        <InstagramActionIcon kind="share" />
                      </button>
                    </div>
                    <button type="button" className="text-stone-950 hover:text-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950" aria-label="Save preview post">
                      <InstagramActionIcon kind="save" />
                    </button>
                  </div>

                  <div data-instagram-caption-preview className="space-y-0.5 px-2 pb-1.5 text-[13px] leading-4">
                    <div className="relative">
                      <p className={`whitespace-pre-line pr-9 text-stone-900 ${instagramCaptionIsExpanded ? '' : '[display:-webkit-box] overflow-hidden [-webkit-box-orient:vertical] [-webkit-line-clamp:2]'}`}>
                        <span className="font-semibold">Fireova Pizza</span>{' '}
                        {instagramCaption || 'Write the caption...'}
                      </p>
                      {instagramCaption && (
                        <button
                          type="button"
                          onClick={() => setCaptionExpanded((value) => !value)}
                          className="absolute bottom-0 right-0 bg-white pl-1 text-[13px] leading-4 text-stone-500 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
                        >
                          {instagramCaptionIsExpanded ? 'less' : 'more'}
                        </button>
                      )}
                    </div>
                    {instagramCredits && (
                      <p className="truncate text-[13px] leading-4 text-stone-900">
                        <InstagramHandleText value={instagramCredits} />
                      </p>
                    )}
                    {instagramHashtags.length > 0 && (
                      <p className="[display:-webkit-box] overflow-hidden text-[13px] font-medium leading-4 text-sky-800 [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{instagramHashtags.join(' ')}</p>
                    )}
                  </div>
                </article>
                </div>

                <div ref={captionToolRef} data-creative-review-checklist className="space-y-2 lg:mt-[33px]">
                  {eventOpportunities.length > 0 && currentReviewIndex >= 0 && (
                    <section className="rounded-[14px] bg-white px-3 py-2.5 shadow-[0_4px_16px_rgba(28,25,23,0.035)] ring-1 ring-stone-200" aria-label="Review progress bar">
                      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-ember-500 transition-[width] duration-300 motion-reduce:transition-none"
                          style={{ width: `${Math.round((reviewedOpportunityCount / eventOpportunities.length) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] font-medium text-stone-500">{reviewedOpportunityCount} of {eventOpportunities.length} reviewed</p>
                    </section>
                  )}
                  <section className="rounded-[14px] bg-white px-3 py-2.5 shadow-[0_4px_16px_rgba(28,25,23,0.035)] ring-1 ring-stone-200 transition-colors duration-200 motion-reduce:transition-none">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-base shadow-sm ring-1 ring-ember-100" aria-hidden="true">{getDirectionIcon(activeStory)}</span>
                        <div className="min-w-0">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Strategy</span>
                          <span className="block truncate text-sm font-semibold text-stone-900">{getStoryDisplayLabel(activeStory, primaryMediaItem)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => toggleActiveCaptionTool('why')} className="px-2 py-1 text-xs font-semibold text-stone-500 hover:text-stone-800" aria-expanded={activeCaptionTool === 'why'}>Why?</button>
                        <button type="button" onClick={() => toggleActiveCaptionTool('direction')} className={getCaptionToolButtonClassName(activeCaptionTool, 'direction')} aria-expanded={isCaptionToolExpanded(activeCaptionTool, 'direction')} aria-controls={getCaptionToolPanelId('direction')} aria-label="Explore creative directions">Change →</button>
                      </div>
                    </div>
                    {activeCaptionTool === 'why' && <p className="mt-1 pl-[42px] text-[11px] leading-4 text-stone-600">{creativeRead.explanation}</p>}
                    {activeCaptionTool === 'direction' && (
                      <div id={getCaptionToolPanelId('direction')} className="relative z-20 mt-3 rounded-[14px] bg-stone-50 p-2 ring-1 ring-stone-100">
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {CAPTION_DIRECTION_OPTIONS.map(({ story, label }) => {
                            const selected = activeStory === story
                            return (
                              <button
                                key={story}
                                type="button"
                                onClick={() => chooseStory(story)}
                                className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${selected ? 'bg-stone-950 text-white' : 'text-stone-700 hover:bg-white'}`}
                              >
                                {getDirectionIcon(story)} {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </section>
                  <section className="rounded-[14px] bg-white p-3 shadow-[0_4px_16px_rgba(28,25,23,0.035)] ring-1 ring-stone-200">
                  <label className="block">
                    <span className="text-[11px] font-semibold text-stone-700">Caption</span>
                    <textarea
                      rows={4}
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      className="mt-1 min-h-[104px] w-full resize-none overflow-hidden rounded-[12px] border border-transparent bg-stone-50/50 px-3 py-2.5 text-[15px] leading-6 text-stone-800 outline-none transition-colors duration-200 [field-sizing:content] placeholder:text-stone-300 hover:bg-stone-50 focus:border-stone-300 focus:bg-white motion-reduce:transition-none"
                      placeholder="Write the caption..."
                    />
                  </label>
                  <div className="relative z-10 mt-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActiveCaptionTool('improve')}
                        className={getCaptionToolButtonClassName(activeCaptionTool, 'improve')}
                        aria-expanded={isCaptionToolExpanded(activeCaptionTool, 'improve')}
                        aria-controls={getCaptionToolPanelId('improve')}
                        aria-label="Shape caption with Fireova AI"
                      >
                        ✨ Improve {getCaptionToolArrow(activeCaptionTool, 'improve')}
                      </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-stone-400">{caption.length} characters</span>
                        <span className="text-xs font-semibold text-stone-400">
                          {captionSaveState === 'saving' ? 'Saving...' : 'Saved'}
                        </span>
                        {lastSuggestion && caption.trim() !== lastSuggestion.trim() && (
                          <button type="button" onClick={restoreSuggestion} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                            ↺ Restore Original
                          </button>
                        )}
                      </div>
                    </div>

                    {activeCaptionTool === 'improve' && (
                    <div id={getCaptionToolPanelId('improve')} className="relative z-20 mt-2 rounded-[14px] bg-white p-2 ring-1 ring-stone-200">
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        <button type="button" onClick={shortenCaption} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">Make Shorter</button>
                        <button type="button" onClick={makeCaptionMoreEmotional} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">More Emotional</button>
                        <button type="button" onClick={makeCaptionLuxury} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">More Luxury</button>
                        <button type="button" onClick={makeCaptionProfessional} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">More Professional</button>
                        <button type="button" onClick={makeCaptionPlayful} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">More Fun</button>
                        <button type="button" onClick={addCaptionCta} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">Add CTA</button>
                        <button type="button" onClick={addCaptionEmojis} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">Add Emojis</button>
                        <button type="button" onClick={rewriteCaption} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">Rewrite Completely</button>
                      </div>
                    </div>
                  )}
                  </div>
                  </section>

                  <div className="space-y-2">
                    {isReelPost && (
                      <section className="rounded-[14px] bg-white p-3 shadow-[0_4px_16px_rgba(28,25,23,0.035)] ring-1 ring-stone-200 transition-colors duration-200 motion-reduce:transition-none">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold text-stone-700">Cover Photo</p>
                            <p className="mt-1 text-xs text-stone-500">This image appears in the Instagram feed.</p>
                          </div>
                          <span />
                        </div>

                        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
                          {availableReelCoverOptions.slice(0, 4).map((cover, index) => {
                            const selected = reelCover?.id === cover.id
                            return (
                              <button key={cover.id} type="button" onClick={() => chooseReelCover(cover, index === 0 ? 'Recommended Cover' : 'Custom Cover')} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-100 ring-2 ${selected ? 'ring-ember-600' : 'ring-transparent hover:ring-stone-300'}`} aria-label={`Choose cover option ${index + 1}`}>
                                <LocalMedia media={cover} className="h-full w-full object-cover" onUnavailable={() => setUnavailableCoverIds((ids) => ids.includes(cover.id) ? ids : [...ids, cover.id])} />
                                {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 py-0.5 text-[8px] font-semibold text-white">Auto Pick</span>}
                              </button>
                            )
                          })}
                          {availableReelCoverOptions.length < 4 && (
                            <p className="max-w-[210px] text-xs leading-4 text-stone-400">Additional cover frames will appear after media analysis.</p>
                          )}
                          <div className="min-w-0 pl-1">
                            {!reelCover && (
                              <p className="mb-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-100">
                                Fireova needs one cover moment before this Reel is ready.
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => openPreviewEditor('cover')}
                                className="rounded-full bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                              >
                                Choose Different →
                              </button>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    <section className="rounded-[14px] bg-white p-3 shadow-[0_4px_16px_rgba(28,25,23,0.035)] ring-1 ring-stone-200 transition-colors duration-200 motion-reduce:transition-none">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold text-stone-700">Vendor Credits</p>
                        </div>
                        {(creditsText.trim() || creditsOpen || requiredCreditMissing) && (
                          <button
                            type="button"
                            onClick={() => setCreditsOpen((value) => !value)}
                            className="rounded-full bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                            aria-expanded={creditsOpen || requiredCreditMissing}
                          >
                            {creditsOpen || requiredCreditMissing ? 'Done' : 'Edit'}
                          </button>
                        )}
                      </div>
                      {creditChips.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {creditChips.slice(0, 3).map((credit) => <span key={credit} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">{credit}</span>)}
                          {creditChips.length > 3 && <button type="button" onClick={() => setCreditsOpen(true)} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">+{creditChips.length - 3}</button>}
                        </div>
                      ) : !creditsOpen && !requiredCreditMissing ? (
                        <div className="flex min-h-[82px] flex-col items-center justify-center text-center">
                          <p className="text-sm text-stone-400">No vendor credits yet.</p>
                          <button type="button" onClick={() => setCreditsOpen(true)} className="mt-2 text-xs font-semibold text-ember-700 hover:text-ember-800">+ Add Vendor</button>
                        </div>
                      ) : null}
                      {requiredCreditMissing && (
                        <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-100">
                          <p>This post needs the saved photo credit.</p>
                          <button type="button" onClick={() => setCreditsText(requiredMediaCredit?.creditText ?? '')} className="mt-2 rounded-full bg-amber-900 px-3 py-2 text-xs text-white">
                            Add Credit
                          </button>
                        </div>
                      )}
                      {(creditsOpen || requiredCreditMissing) && (
                        <textarea
                          value={creditsText}
                          onChange={(event) => setCreditsText(event.target.value)}
                          className="mt-2 min-h-[70px] w-full resize-y rounded-[16px] bg-stone-50 px-3 py-2.5 text-sm leading-5 text-stone-800 outline-none ring-1 ring-stone-200 focus:ring-2 focus:ring-stone-950"
                          placeholder="Photo credit, vendor credit, or usage note..."
                        />
                      )}
                    </section>

                    <section className="rounded-[14px] bg-white p-3 shadow-[0_4px_16px_rgba(28,25,23,0.035)] ring-1 ring-stone-200 transition-colors duration-200 motion-reduce:transition-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-stone-700">Hashtags <span className="font-normal text-stone-400">Optional</span></p>
                          <p className="mt-1 truncate text-xs leading-5 text-stone-500">{hashtagPreview || 'Hidden unless you want to edit them.'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHashtagsOpen((value) => !value)}
                          className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                          aria-expanded={hashtagsOpen}
                        >
                          {hashtagsOpen ? 'Hide' : 'Edit'}
                        </button>
                      </div>
                      {hashtagsOpen && (
                        <textarea
                          value={hashtagsText}
                          onChange={(event) => setHashtagsText(event.target.value)}
                          className="mt-2 min-h-[70px] w-full resize-y rounded-[16px] bg-stone-50 px-3 py-2.5 text-sm leading-5 text-stone-800 outline-none ring-1 ring-stone-200 focus:ring-2 focus:ring-stone-950"
                          placeholder="#FireovaPizza #DFWCatering"
                        />
                      )}
                    </section>
                  </div>
                </div>
              </div>
            </section>

            {previewEditorOpen && (
              <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="preview-editor-title">
                <button type="button" className="absolute inset-0 bg-stone-950/45 backdrop-blur-[2px]" onClick={closePreviewEditor} aria-label="Close Edit Preview" />
                <div ref={previewEditorDialogRef} className="relative z-10 h-full w-full max-w-lg overflow-y-auto bg-white shadow-[-24px_0_70px_rgba(28,25,23,0.24)] ring-1 ring-stone-200 sm:rounded-l-[24px]">
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white/95 px-5 py-4 backdrop-blur">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-600">Preview tools</p>
                      <h2 id="preview-editor-title" className="mt-0.5 text-xl font-semibold tracking-tight text-stone-950">Edit Preview</h2>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-stone-400">{reelCoverSaveState === 'saving' ? 'Saving...' : 'Saved'}</span>
                      <button type="button" onClick={closePreviewEditor} className="rounded-full bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200">Close</button>
                    </div>
                  </div>

                  <div className="space-y-6 p-5">
                    <section className="rounded-[18px] bg-stone-50 p-3 ring-1 ring-stone-200">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-stone-950">Current preview</h3>
                        <div className="inline-flex rounded-full bg-white p-0.5 ring-1 ring-stone-200" aria-label="Preview mode">
                          <button type="button" onClick={() => { setInstagramPreviewMode('feed'); showReelCoverPreview() }} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${instagramPreviewMode === 'feed' ? 'bg-stone-950 text-white' : 'text-stone-500'}`}>Feed Preview</button>
                          <button type="button" onClick={() => { setInstagramPreviewMode('full-reel'); showReelCoverPreview() }} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${instagramPreviewMode === 'full-reel' ? 'bg-stone-950 text-white' : 'text-stone-500'}`}>Full Reel Preview</button>
                        </div>
                      </div>
                      <div className={`mx-auto mt-3 overflow-hidden rounded-[14px] bg-stone-100 ring-1 ring-stone-200 ${instagramPreviewMode === 'full-reel' && isReelPost ? 'w-[135px] aspect-[9/16]' : 'w-[180px] aspect-[4/5]'}`}>
                        {reelPreviewDisplay.media ? (
                          <LocalMedia media={reelPreviewDisplay.media} className={`h-full w-full ${instagramPreviewMode === 'feed' ? 'object-cover' : 'object-contain'}`} style={instagramPreviewMode === 'feed' && reelPreviewDisplay.mode === 'cover' ? reelCoverCropStyle : undefined} muted />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs font-semibold text-stone-400">Post image</div>
                        )}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold text-stone-950">Choose the visual</h3>
                        <p className="text-xs text-stone-500">Select what appears in the post.</p>
                      </div>
                      <div className="mt-3 grid max-h-[260px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
                        {mediaChoices.map((media) => {
                          const selected = primaryMedia?.id === media.id
                          return (
                            <button
                              key={media.id}
                              type="button"
                              onClick={() => chooseMedia(media)}
                              className={`overflow-hidden rounded-xl bg-stone-100 ring-2 transition ${selected ? 'ring-ember-600' : 'ring-transparent hover:ring-stone-300'}`}
                              aria-label="Choose this photo"
                            >
                              <div className="aspect-square">
                                <LocalMedia media={media} className="h-full w-full object-cover" muted />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </section>

                    {isReelPost && (
                      <>
                        <section ref={previewEditorCoverRef} className="scroll-mt-24 border-t border-stone-200 pt-5">
                          <h3 className="text-sm font-semibold text-stone-950">Adjust the Feed crop</h3>
                          <p className="mt-1 text-xs text-stone-500">Fine-tune which part of the cover appears in the 4:5 Instagram feed.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => moveFeedCrop('left')} className="rounded-full bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Move left</button>
                            <button type="button" onClick={() => moveFeedCrop('right')} className="rounded-full bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Move right</button>
                            <button type="button" onClick={() => moveFeedCrop('up')} className="rounded-full bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Move up</button>
                            <button type="button" onClick={() => moveFeedCrop('down')} className="rounded-full bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Move down</button>
                            <button type="button" onClick={() => zoomFeedCrop('in')} className="rounded-full bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Zoom in</button>
                            <button type="button" onClick={() => zoomFeedCrop('out')} className="rounded-full bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Zoom out</button>
                            <button type="button" onClick={resetFeedCrop} disabled={isDefaultReelCoverCrop(reelCoverCrop)} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300">Reset crop</button>
                          </div>
                        </section>

                        <section className="border-t border-stone-200 pt-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-stone-950">Cover Photo</h3>
                              <p className="mt-1 text-xs text-stone-500">This image appears in the Instagram feed.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => reelCoverUploadRef.current?.click()} className="rounded-full bg-stone-950 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800">Upload photo</button>
                              {isCustomReelCoverLabel(reelCoverSourceLabel) && (
                                <button type="button" onClick={removeCustomReelCover} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50">Use Fireova’s pick</button>
                              )}
                              <input ref={reelCoverUploadRef} type="file" accept="image/*" className="hidden" onChange={(event) => uploadReelCover(event.target.files?.[0])} />
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                            {reelCoverOptions.map((cover) => {
                              const selected = reelCover?.id === cover.id
                              return (
                                <button
                                  key={cover.id}
                                  type="button"
                                  onClick={() => chooseReelCover(cover, cover.id.includes('-frame-') ? 'Custom Cover' : 'Recommended Cover')}
                                  className={`h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100 ring-2 transition ${selected ? 'ring-ember-600' : 'ring-transparent hover:ring-stone-300'}`}
                                  aria-label="Select this Reel cover"
                                >
                                  <LocalMedia media={cover} className="h-full w-full object-cover" />
                                </button>
                              )
                            })}
                          </div>
                        </section>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {notice && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-100">{notice}</p>}
            {createdDraftId && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">Draft saved.</p>}

        </div>
      </main>
    </div>
  )
}

function InstagramActionIcon({ kind }: { kind: 'like' | 'comment' | 'share' | 'save' | 'menu' }) {
  const commonProps = {
    width: 21,
    height: 21,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (kind === 'like') {
    return (
      <svg {...commonProps}>
        <path d="M20.8 4.6c-1.8-1.7-4.5-1.6-6.2.2L12 7.5 9.4 4.8C7.7 3 5 2.9 3.2 4.6c-1.9 1.8-2 4.8-.2 6.7l9 8.7 9-8.7c1.8-1.9 1.7-4.9-.2-6.7Z" />
      </svg>
    )
  }

  if (kind === 'comment') {
    return (
      <svg {...commonProps}>
        <path d="M20 11.5a7.5 7.5 0 0 1-8.6 7.4L5 21l1.7-5.1A7.5 7.5 0 1 1 20 11.5Z" />
      </svg>
    )
  }

  if (kind === 'share') {
    return (
      <svg {...commonProps}>
        <path d="m21 3-8.8 18-2.1-8.1L3 9.2 21 3Z" />
      </svg>
    )
  }

  if (kind === 'save') {
    return (
      <svg {...commonProps}>
        <path d="M6 3h12v18l-6-3.8L6 21V3Z" />
      </svg>
    )
  }

  return (
    <svg {...commonProps}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  )
}

function InstagramHandleText({ value }: { value: string }) {
  return (
    <>
      {value.split(/(@[a-zA-Z0-9._]+)/g).map((part, index) => {
        if (!part) return null
        if (part.startsWith('@')) {
          return <span key={`${part}-${index}`} className="text-sky-800">{part}</span>
        }
        return part
      })}
    </>
  )
}

function SourceHeader({
  eyebrow,
  title,
  backHref,
  changeHref,
  onSaveDraft,
  onApprove,
  approveDisabled = false,
  source,
  postFormat,
  reviewReadyCount,
  reviewPosition,
  contentType,
  previousHref,
  nextHref,
  menuOpen,
  onToggleMenu,
}: {
  eyebrow: string
  title: string
  backHref: string
  changeHref: string
  onSaveDraft: () => void
  onApprove?: () => void
  approveDisabled?: boolean
  source: StudioSource
  postFormat?: string
  reviewReadyCount?: number
  reviewPosition?: { current: number; total: number }
  contentType?: 'Photo' | 'Carousel' | 'Reel'
  previousHref?: string
  nextHref?: string
  menuOpen: boolean
  onToggleMenu: () => void
}) {
  return (
    <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{eyebrow}</p>
        <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-[-0.02em] text-stone-950 sm:text-3xl">{title}</h1>
        {reviewPosition ? (
          <div className="mt-2 flex flex-wrap items-center gap-3" aria-label="Review progress">
            <p className="min-w-[86px] text-xs font-semibold text-stone-600">Post {reviewPosition.current} of {reviewPosition.total}{contentType ? <span className="font-medium text-stone-400"> · {contentType}</span> : null}</p>
            <nav className="inline-flex rounded-full bg-stone-50 p-0.5 ring-1 ring-stone-200" aria-label="Review navigation">
              {previousHref ? (
                <Link href={previousHref} className="rounded-full px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-white" aria-label="Previous post">← Previous</Link>
              ) : (
                <button type="button" disabled className="rounded-full px-3 py-1.5 text-xs font-semibold text-stone-300" aria-label="Previous post">← Previous</button>
              )}
              {nextHref ? (
                <Link href={nextHref} className="rounded-full px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-white" aria-label="Next post">Next →</Link>
              ) : (
                <button type="button" disabled className="rounded-full px-3 py-1.5 text-xs font-semibold text-stone-300" aria-label="Next post">Next →</button>
              )}
            </nav>
          </div>
        ) : postFormat ? <p className="mt-1 text-xs font-medium text-stone-500">{postFormat}{contentType ? ` • ${contentType}` : ''}{reviewReadyCount === 3 ? ' • Ready' : ''}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={backHref} className="rounded-full px-4 py-2.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50">Back</Link>
        {onApprove && (
          <button
            type="button"
            onClick={() => onApprove()}
            disabled={approveDisabled}
            className="rounded-full bg-ember-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ember-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            title={approveDisabled ? 'Choose a Reel cover before approving.' : undefined}
          >
            Approve Post
          </button>
        )}
        <div className="relative">
          <button type="button" onClick={onToggleMenu} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50" aria-label="More post actions" aria-expanded={menuOpen}>•••</button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-30 w-40 overflow-hidden rounded-xl bg-white py-1 shadow-[0_16px_40px_rgba(28,25,23,0.16)] ring-1 ring-stone-200">
              <button type="button" onClick={() => { onSaveDraft(); onToggleMenu() }} className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">Save Draft</button>
              <button type="button" onClick={() => { onSaveDraft(); onToggleMenu() }} className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50">Duplicate</button>
              <button type="button" disabled className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-stone-300" title="Save the post before deleting it.">Delete</button>
            </div>
          )}
        </div>
        {source !== 'event' && (
          <Link href={changeHref} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">
            Choose Different Photo
          </Link>
        )}
      </div>
    </div>
  )
}

function EventOpportunitySelection({
  event,
  opportunities,
}: {
  event: LocalFireovaEvent
  opportunities: MarketingOpportunity[]
}) {
  const recommendedOpportunity = opportunities[0] ?? null
  const moreOpportunities = opportunities.slice(1)
  const eventMetadata = formatEventMetadata(event)

  return (
    <div className="min-h-full bg-white pb-28">
      <main className="px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="max-w-3xl pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Create Content</p>
            <h1 className="mt-2 text-2xl font-semibold text-stone-950 sm:text-3xl">{event.name || 'Event'}</h1>
            {eventMetadata && <p className="mt-1 text-sm font-medium text-stone-500">{eventMetadata}</p>}
            <p className="mt-4 text-base font-medium text-stone-700">Choose the first post you&apos;d like to create.</p>
          </div>

          {recommendedOpportunity ? (
            <RecommendedOpportunityCard
              eventId={event.id}
              eventName={event.name}
              eventMedia={event.media}
              opportunity={recommendedOpportunity}
            />
          ) : (
            <section className="rounded-[20px] border border-stone-200 bg-white p-6">
              <p className="text-sm font-semibold text-stone-950">No content opportunities are ready yet.</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">Review the event details or Marketing Intelligence to prepare a stronger recommendation.</p>
            </section>
          )}

          {moreOpportunities.length > 0 && (
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">More Ideas</p>
                  <h2 className="mt-1 text-2xl font-semibold text-stone-950">Other strong directions</h2>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {moreOpportunities.map((opportunity) => (
                  <ContentIdeaCard
                    key={opportunity.id}
                    eventName={event.name}
                    opportunity={opportunity}
                    eventMedia={event.media}
                    href={buildEventContentStudioHref(event.id, opportunity)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

function ReviewCompletion({
  event,
  approved,
  skipped,
}: {
  event: LocalFireovaEvent
  approved: number
  skipped: number
}) {
  return (
    <div className="flex min-h-full items-center justify-center bg-stone-50 px-5 py-16 sm:px-8">
      <main className="w-full max-w-lg rounded-[24px] bg-white p-7 text-center shadow-[0_20px_60px_rgba(28,25,23,0.08)] ring-1 ring-stone-200 sm:p-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl font-semibold text-emerald-700 ring-1 ring-emerald-100" aria-hidden="true">✓</span>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{event.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-stone-950">All posts reviewed</h1>
        <div className="mt-5 flex items-center justify-center gap-5 text-sm text-stone-600" aria-label="Review totals">
          <span><strong className="font-semibold text-stone-950">{approved}</strong> approved</span>
          <span><strong className="font-semibold text-stone-950">{skipped}</strong> skipped</span>
        </div>
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href={`/events/${event.id}`} className="rounded-full bg-ember-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ember-700">Return to Event</Link>
          <Link href="/draft-posts" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-50">View Draft Posts</Link>
        </div>
      </main>
    </div>
  )
}

function RecommendedOpportunityCard({
  eventId,
  eventName,
  opportunity,
  eventMedia,
}: {
  eventId: string
  eventName: string
  opportunity: MarketingOpportunity
  eventMedia: MockMedia[]
}) {
  const showConfidence = shouldShowConfidence(opportunity)
  const visibleReasons = opportunity.reasons.slice(0, 4).map(formatOpportunityReasonForDisplay)

  return (
    <section className="rounded-[24px] border border-ember-100 bg-white p-5 shadow-[0_22px_70px_rgba(28,25,23,0.08)] sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-ember-50 px-3 py-1.5 text-xs font-semibold text-ember-800 ring-1 ring-ember-100">⭐ Recommended</span>
        <FormatBadge format={opportunity.recommendedFormat} />
        {showConfidence && <ConfidenceBadge confidence={opportunity.confidenceLabel} />}
      </div>
      <h2 className="mt-4 text-3xl font-semibold leading-tight text-stone-950 sm:text-4xl">{getOpportunityDisplayTitle(opportunity.title, eventName)}</h2>
      <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">{opportunity.summary}</p>
      <OpportunityMediaSummary opportunity={opportunity} eventMedia={eventMedia} />

      <div className={`mt-6 grid gap-4 ${visibleReasons.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end' : 'lg:justify-end'}`}>
        {visibleReasons.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Why this works</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {visibleReasons.map((reason) => (
                <li key={reason} className="flex gap-2 text-sm leading-6 text-stone-700">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ember-500" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href={buildEventContentStudioHref(eventId, opportunity)} className="inline-flex w-full justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 sm:w-auto">
          Create Post →
        </Link>
      </div>
    </section>
  )
}

function ContentIdeaCard({
  eventName,
  opportunity,
  href,
  eventMedia,
}: {
  eventName: string
  opportunity: MarketingOpportunity
  href: string
  eventMedia: MockMedia[]
}) {
  const showConfidence = shouldShowConfidence(opportunity)

  return (
    <article className="rounded-[18px] border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300">
      <div className="flex h-full flex-col justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <FormatBadge format={opportunity.recommendedFormat} />
            {showConfidence && <ConfidenceBadge confidence={opportunity.confidenceLabel} compact />}
          </div>
          <h3 className="mt-3 text-base font-semibold text-stone-950">{getOpportunityDisplayTitle(opportunity.title, eventName)}</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">{opportunity.summary}</p>
          <OpportunityMediaSummary opportunity={opportunity} eventMedia={eventMedia} compact />
        </div>
        <Link href={href} className="inline-flex w-fit rounded-full bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-200">
          Create Post →
        </Link>
      </div>
    </article>
  )
}

function OpportunityMediaSummary({
  opportunity,
  eventMedia,
  compact = false,
}: {
  opportunity: MarketingOpportunity
  eventMedia: MockMedia[]
  compact?: boolean
}) {
  const mediaIds = opportunity.bestMediaIds?.length ? opportunity.bestMediaIds : opportunity.mediaIds
  const media = mediaIds.map((id) => eventMedia.find((item) => item.id === id)).filter((item): item is MockMedia => Boolean(item)).slice(0, compact ? 3 : 4)
  if (media.length === 0 && !opportunity.suggestedCaptionDirection) return null

  return (
    <div className="mt-4 flex items-end justify-between gap-3 rounded-[14px] bg-stone-50 p-2.5 ring-1 ring-stone-100">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Best media</p>
        <div className="mt-2 flex gap-1.5">
          {media.map((item) => (
            <div key={item.id} className={`${compact ? 'h-10 w-10' : 'h-14 w-14'} overflow-hidden rounded-lg bg-stone-200 ring-1 ring-stone-200`}>
              <LocalMedia media={item} className="h-full w-full object-cover" muted />
            </div>
          ))}
        </div>
      </div>
      {opportunity.suggestedCaptionDirection && (
        <div className="min-w-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Caption direction</p>
          <p className="mt-1 truncate text-xs font-semibold text-stone-700">{opportunity.suggestedCaptionDirection}</p>
        </div>
      )}
    </div>
  )
}

function FormatBadge({ format }: { format: MarketingOpportunity['recommendedFormat'] }) {
  return (
    <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
      {getFormatLabel(format)}
    </span>
  )
}

function ConfidenceBadge({
  confidence,
  compact = false,
}: {
  confidence?: MarketingOpportunity['confidenceLabel']
  compact?: boolean
}) {
  if (!confidence) return null

  return (
    <span className={`inline-flex rounded-full bg-stone-50 text-xs font-semibold text-stone-500 ring-1 ring-stone-200 ${compact ? 'px-2.5 py-1' : 'px-3 py-1.5'}`}>
      {confidence} confidence
    </span>
  )
}

function getFormatLabel(format: MarketingOpportunity['recommendedFormat']) {
  if (format === 'Story Set') return 'Story'
  return format
}

function shouldShowConfidence(opportunity: MarketingOpportunity) {
  return !isGenericFallbackOpportunity(opportunity)
}

function formatOpportunityReasonForDisplay(reason: string) {
  if (reason === 'This event has usable local media.') return 'Uses the strongest moments from the event.'
  if (reason === 'Includes video media for a Reel option.') return 'Video is available for a Reel.'
  return reason
}

function formatCreditsForDisplay(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^vendor team:?$/i.test(line))
    .join('\n')
}

function getCreditChips(value: string) {
  const handles = value.match(/@[a-zA-Z0-9._]+/g) ?? []
  if (handles.length > 0) return Array.from(new Set(handles))
  return formatCreditsForDisplay(value).split(/\n|,/).map((item) => item.trim()).filter(Boolean)
}

function getOpportunityDisplayTitle(title: string, eventName: string) {
  const cleanTitle = title.trim()
  const cleanEventName = eventName.trim()
  if (!cleanEventName) return cleanTitle

  const lowerTitle = cleanTitle.toLowerCase()
  const lowerEventName = cleanEventName.toLowerCase()
  if (lowerTitle === lowerEventName) return cleanTitle
  if (!lowerTitle.startsWith(`${lowerEventName} `)) return cleanTitle

  const nextTitle = cleanTitle.slice(cleanEventName.length).trim()
  return nextTitle || cleanTitle
}

function formatEventMetadata(event: LocalFireovaEvent) {
  return [event.type, formatEventDate(event.date)].filter(Boolean).join(' • ')
}

function formatEventDate(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = isoMatch
    ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    : new Date(trimmed)

  if (Number.isNaN(date.getTime())) return trimmed
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function buildEventContentStudioHref(eventId: string, opportunity: MarketingOpportunity | null) {
  const params = new URLSearchParams({ source: 'event', eventId, builder: '1' })

  if (opportunity && !isGenericFallbackOpportunity(opportunity)) {
    params.set('opportunityId', opportunity.id)
    const bestMediaIds = opportunity.bestMediaIds?.length ? opportunity.bestMediaIds : opportunity.mediaIds
    if (bestMediaIds.length > 0) params.set('mediaIds', bestMediaIds.join(','))
  }

  return `/content-studio?${params.toString()}`
}

function getStoryForMediaGoal(goal: ContentBankAngle): StoryOption {
  if (goal === 'Food Feature') return 'Highlight the Food'
  if (goal === 'Cooking Action') return 'Fire Oven Experience'
  if (goal === 'Behind the Scenes') return 'Event Recap'
  if (goal === 'Team Spotlight') return 'Team Behind the Scenes'
  return 'Guest Experience'
}

function getStoryForEventGoal(goal: EventPostGoal): StoryOption {
  if (goal === 'Wedding Moment' || goal === 'Celebration Moment' || goal === 'Couple Story' || goal === 'Bridal Celebration') return 'Celebrate the Couple'
  if (goal === 'Food Feature' || goal === 'Product Feature') return 'Highlight the Food'
  if (goal === 'Interactive Experience') return 'Fire Oven Experience'
  if (goal === 'Venue Spotlight') return 'Venue Spotlight'
  if (goal === 'Behind the Scenes') return 'Team Behind the Scenes'
  if (goal === 'Guest Experience' || goal === 'Guest Engagement') return 'Guest Experience'
  if (goal === 'Vendor Spotlight') return 'Vendor Feature'
  return 'Event Recap'
}

function getStoryForReason(reason: string, source: StudioSource, event: LocalFireovaEvent | null): StoryOption {
  const normalized = reason.toLowerCase()

  if (normalized.includes('pizza') || normalized.includes('food')) return 'Highlight the Food'
  if (normalized.includes('emotional')) return source === 'event' && event?.type.toLowerCase().includes('wedding') ? 'Celebrate the Couple' : 'Guest Experience'
  if (normalized.includes('branding')) return 'Fire Oven Experience'
  if (normalized.includes('storytelling')) return 'Guest Experience'
  if (normalized.includes('creator')) return 'Event Recap'
  if (normalized.includes('event context')) return 'Event Recap'

  return 'Guest Experience'
}

function MissingSource({ title, href }: { title: string; href: string }) {
  return (
    <div className="min-h-full bg-white px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl rounded-[30px] bg-stone-50 px-6 py-14 text-center ring-1 ring-stone-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Content Studio</p>
        <h1 className="mt-3 text-3xl font-semibold text-stone-950">{title}</h1>
        <Link href={href} className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white">Choose Photo</Link>
      </div>
    </div>
  )
}

function LoadingSource() {
  return (
    <div className="min-h-full bg-white px-5 py-10 sm:px-8" aria-live="polite">
      <div className="mx-auto max-w-4xl rounded-[30px] bg-stone-50 px-6 py-14 text-center ring-1 ring-stone-100">
        <p className="text-sm font-semibold text-stone-500">Opening your event in Content Studio...</p>
      </div>
    </div>
  )
}

function createMediaCaptionSuggestion(item: LocalContentBankItem, goal: ContentBankAngle, variant: number) {
  const food = item.foodItems[0] ?? (item.category !== 'Other' ? item.category.toLowerCase() : 'wood-fired favorites')
  const theme = item.contentTheme.trim()
  const lead = theme ? `${theme} in motion, ` : ''
  const options: Record<ContentBankAngle, string[]> = {
    'Food Feature': [
      `Fresh, hot, and ready for the table. ${lead}${capitalize(food)} is one of those details guests remember.`,
      `${capitalize(food)} looking exactly the way it should: warm, generous, and ready to share.`,
    ],
    'Behind the Scenes': [
      `A little look behind the Fireova setup: ${lead}fresh prep, live fire, and the details that make service feel easy.`,
      'The best event moments usually start before guests ever see the first plate.',
    ],
    'Cooking Action': [
      `Live-fire cooking is where the energy starts. ${lead}${food} moving from prep to plate, with that Fireova finish.`,
    ],
    Educational: [
      `Good catering starts before the first slice is served. ${lead}Timing, heat, and ingredients all matter.`,
    ],
    'Team Spotlight': [
      `The Fireova crew makes the hard parts look calm: ${lead}setup, service, and keeping the oven moving.`,
    ],
    'Catering Promotion': [
      `Planning a gathering? Fireova brings the oven, the food, and the warm service that keeps guests coming back for another bite.`,
    ],
    Seasonal: [
      `Seasonal gatherings deserve food that feels fresh, warm, and easy to share. ${lead}${food} is always a strong place to start.`,
    ],
    'Brand Awareness': [
      `This is the Fireova rhythm: ${lead}real ingredients, live fire, and catering that feels relaxed from the first plate to the last.`,
    ],
  }

  const goalOptions = options[goal] ?? options['Food Feature']
  return goalOptions[variant % goalOptions.length].replace(/\s+/g, ' ').trim()
}

function createMediaHashtags(items: LocalContentBankItem[], goal: ContentBankAngle) {
  const rawTags = ['FireovaPizza', 'WoodFiredPizza', 'DFWCatering', goal, ...items.flatMap((item) => [item.category, item.contentTheme, ...item.foodItems, ...item.tags])]
  return Array.from(new Set(rawTags))
    .map((tag) => `#${tag.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '')}`)
    .filter((tag) => tag.length > 1 && !tag.startsWith('#@'))
    .slice(0, 10)
}

function getRecommendedMediaGoal(item: LocalContentBankItem): ContentBankAngle {
  if (item.category === 'Team') return 'Team Spotlight'
  if (item.category === 'Behind the Scenes' || item.contentTheme.toLowerCase().includes('behind')) return 'Behind the Scenes'
  if (item.category === 'Brand') return 'Brand Awareness'
  if (item.category === 'Other') return 'Brand Awareness'
  return CONTENT_BANK_ANGLES.includes('Food Feature') ? 'Food Feature' : CONTENT_BANK_ANGLES[0]
}

function isContentBankAngle(value: string): value is ContentBankAngle {
  return CONTENT_BANK_ANGLES.includes(value as ContentBankAngle)
}

function parseHashtags(value: string) {
  return Array.from(new Set(
    value
      .split(/[\s,]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => !tag.startsWith('@'))
      .map((tag) => tag.startsWith('#') ? tag : `#${tag}`)
      .map((tag) => `#${tag.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '')}`)
      .filter((tag) => tag.length > 1)
  ))
}

function getItemIdForMedia(mediaId: string, items: LocalContentBankItem[]) {
  return items.find((item) => item.mediaId === mediaId)?.id ?? mediaId
}

function getStudioContentContext({
  source,
  item,
  event,
  media,
}: {
  source: StudioSource
  item: LocalContentBankItem | null
  event: LocalFireovaEvent | null
  media?: MockMedia
}) {
  if (source === 'event') {
    return {
      title: getUsefulStudioTitle(event?.name) || 'Untitled Event',
      metaLine: uniqueClean([event?.type, event?.venueName, event?.venueLocation]).join(' · ') || 'Event post',
      needsReview: false,
    }
  }

  if (!item) {
    return {
      title: media ? 'Untitled Content' : 'Choose content',
      metaLine: media ? 'Ready for a post' : 'Pick a photo or video to start',
      needsReview: Boolean(media),
    }
  }

  const approvedTitle = item.metadataReviewStatus === 'Approved' || item.metadataReviewStatus === 'Manually Edited'
    ? item.title
    : ''
  const displayItem = { ...item, title: approvedTitle || item.title }
  const title = getContentBankDisplayTitle(displayItem)
  const contentTheme = getUsefulStudioTitle(item.contentTheme)
  const context = getPrimaryContextTag(item, 'title')
  const metaLine = uniqueClean([item.category, contentTheme, context]).join(' · ') || 'Needs details'

  return {
    title,
    metaLine,
    needsReview: title === 'Untitled Content',
  }
}

function getCreativeRead({
  source,
  item,
  event,
  activeStory,
}: {
  source: StudioSource
  item: LocalContentBankItem | null
  event: LocalFireovaEvent | null
  activeStory: StoryOption
}) {
  const reasons: string[] = []
  const explanation = getCreativeExplanation({ source, item, event, activeStory })

  if (source === 'event') {
    const eventText = [event?.name, event?.type, event?.notes].join(' ').toLowerCase()
    if (/wedding|couple|bridal|rehearsal/.test(eventText)) reasons.push('Natural storytelling')
    if (/guest|party|celebration|event/.test(eventText)) reasons.push('Emotional connection')
    if (/pizza|oven|fire|food|menu/.test(eventText)) reasons.push('Food is clearly visible')
    if (event?.venueName || event?.venueLocation) reasons.push('Clear event context')
  } else if (item) {
    const text = [item.category, item.contentTheme, item.description, item.notes, ...item.foodItems, ...item.tags].join(' ').toLowerCase()
    if (/guest|serving|table|moment|couple|wedding|celebration/.test(text)) reasons.push('Emotional connection')
    if (/pizza|oven|slice|dough|fire|food|charcuterie|shrimp|appetizer|small bite|salami|grazing|dessert|buffet/.test(text)) reasons.push('Food is clearly visible')
    if (/brand|setup|fireova|team|truck|sign/.test(text) || item.category === 'Brand' || item.category === 'Fireova Setup') reasons.push('Strong branding')
    if (/behind|craft|prep|making|stretch|cutting|story|moment/.test(text)) reasons.push('Natural storytelling')
    if (item.photographerCreditRequired) reasons.push('Creator credit is already tracked')
  }

  if (activeStory === 'Highlight the Food' && !reasons.includes('Food is clearly visible')) reasons.push('Food is clearly visible')
  if (activeStory === 'Guest Experience' && !reasons.includes('Natural storytelling')) reasons.push('Natural storytelling')
  if (activeStory === 'Celebrate the Couple' && !reasons.includes('Emotional connection')) reasons.push('Emotional connection')
  if ((activeStory === 'Fire Oven Experience' || activeStory === 'Team Behind the Scenes') && !reasons.includes('Natural storytelling')) reasons.push('Natural storytelling')

  const fallbackReasons = ['Natural storytelling', 'Strong branding']
  fallbackReasons.forEach((reason) => {
    if (reasons.length < 2 && !reasons.includes(reason)) reasons.push(reason)
  })

  return {
    explanation,
    reasons: reasons.slice(0, 4),
  }
}


function getStoryDisplayLabel(story: StoryOption, item: LocalContentBankItem | null) {
  if (story !== 'Highlight the Food') return story

  const food = item?.foodItems.find((value) => value.trim())?.trim()
  if (food) return `Highlight ${food}`

  const theme = item?.contentTheme.trim()
  if (theme && !/^food styling$/i.test(theme)) return `Highlight ${theme}`

  return 'Highlight the Food'
}

function getDirectionIcon(story: StoryOption) {
  if (story === 'Highlight the Food') return '🍽️'
  if (story === 'Celebrate the Couple') return '💛'
  if (story === 'Fire Oven Experience') return '🔥'
  if (story === 'Venue Spotlight') return '📍'
  if (story === 'Team Behind the Scenes') return '🤝'
  if (story === 'Vendor Feature') return '✨'
  if (story === 'Event Recap') return '📸'
  return '✨'
}

function getReelCoverOptions(media: MockMedia) {
  const frameCovers = readRepresentativeFramesForMedia(media.id)
    ?.filter(hasFrameAsset)
    .map((frame) => createReelCoverFromFrame(media, frame)) ?? []
  const fallbackCover = createFallbackReelCover(media)
  const options = fallbackCover ? [fallbackCover, ...frameCovers] : frameCovers
  const seen = new Set<string>()

  return options.filter((cover) => {
    if (seen.has(cover.src)) return false
    seen.add(cover.src)
    return true
  })
}

type ReelCoverFrame = {
  id: string
  timestampSeconds: number
  localAssetReference: string
}

function readRepresentativeFramesForMedia(mediaId: string): ReelCoverFrame[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(LOCAL_MEDIA_ANALYSIS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const analysis = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, { representativeFrames?: unknown }>)[mediaId]
      : undefined
    return Array.isArray(analysis?.representativeFrames)
      ? analysis.representativeFrames.filter(isReelCoverFrame)
      : []
  } catch {
    return []
  }
}

function isReelCoverFrame(value: unknown): value is ReelCoverFrame {
  if (!value || typeof value !== 'object') return false
  const frame = value as Partial<ReelCoverFrame>
  return typeof frame.id === 'string' &&
    typeof frame.timestampSeconds === 'number' &&
    typeof frame.localAssetReference === 'string'
}

function hasFrameAsset(frame: ReelCoverFrame) {
  return Boolean(frame.localAssetReference)
}

function createReelCoverFromFrame(media: MockMedia, frame: ReelCoverFrame): MockMedia {
  return {
    id: `reel-cover-${media.id}-${frame.id}`,
    type: 'photo',
    src: frame.localAssetReference,
    alt: `Reel cover frame at ${Math.round(frame.timestampSeconds)} seconds`,
  }
}

function createFallbackReelCover(media: MockMedia): MockMedia | null {
  const src = media.posterSrc || media.src
  if (!src) return null

  return {
    id: `reel-cover-${media.id}-recommended`,
    type: 'photo',
    src,
    alt: `${media.alt} cover`,
  }
}

function getCreativeExplanation({
  source,
  item,
  event,
  activeStory,
}: {
  source: StudioSource
  item: LocalContentBankItem | null
  event: LocalFireovaEvent | null
  activeStory: StoryOption
}) {
  if (activeStory === 'Highlight the Food') {
    return 'The food is the clearest hook in this moment, so I led with it.'
  }

  if (activeStory === 'Celebrate the Couple') {
    return 'The celebration feels like the heart of this post, so I put it first.'
  }

  if (activeStory === 'Fire Oven Experience' || activeStory === 'Team Behind the Scenes') {
    return 'The hands-on detail is the strongest creative signal, so I made the craft the focus.'
  }

  if (source === 'event' && event?.venueName) {
    return 'The setting gives this moment useful context, so I grounded the story there.'
  }

  if (item?.category === 'Team') {
    return 'The people give this image its warmth, so I wrote from that angle.'
  }

  if (item?.category === 'Brand' || item?.category === 'Fireova Setup') {
    return 'The Fireova presence is the strongest signal here, so I kept the story brand-forward.'
  }

  return 'The atmosphere is the strongest part of this photo, so I started there.'
}

function getCategoryContextTitle(item: LocalContentBankItem, context: string) {
  const category = getUsefulStudioTitle(item.category)
  if (!category || category === 'Other') return ''

  if (context) return `${category} ${context}`
  if (category === 'Team') return 'Fireova Team'
  if (category === 'Fireova Setup') return 'Fireova Setup'
  if (category === 'Brand') return 'Fireova Brand'
  if (category === 'Behind the Scenes') return 'Behind the Scenes'
  return category
}

function appendSentence(value: string, sentence: string) {
  const trimmed = value.trim()
  return trimmed ? `${trimmed}\n\n${sentence}` : sentence
}

function getUsefulStudioTitle(value?: string) {
  const title = value?.trim() ?? ''
  if (!title || isLikelyTechnicalText(title)) return ''
  return title.replace(/\s+/g, ' ')
}

function isLikelyTechnicalText(value: string) {
  const trimmed = value.trim()
  const normalized = trimmed.replace(/\.[a-z0-9]{2,5}$/i, '')
  const compact = normalized.replace(/[^a-z0-9]/gi, '')

  return /^(img|dsc|dscf|pxl|mvimg|vid|image|photo|screenshot|screenrecording)[-_ ]?\d+/i.test(normalized)
    || /^\d{8}[-_ ]?\d{4,}/.test(normalized)
    || /\.(jpe?g|png|heic|heif|webp|gif|mov|mp4|m4v|avi)$/i.test(trimmed)
    || /^[a-f0-9]{12,}$/i.test(compact)
    || (/^[a-z0-9_-]{10,}$/i.test(trimmed) && /[0-9_-]/.test(trimmed) && !/\s/.test(trimmed))
}

function getPrimaryContextTag(item: LocalContentBankItem, style: 'label' | 'title') {
  const normalizedTags = uniqueClean(item.tags.map(normalizeContextTag))
  const orderedContexts = ['wedding', 'private event', 'corporate event', 'outdoor', 'guest', 'holiday', 'summer', 'fall', 'winter', 'spring']
  const match = orderedContexts.find((context) => normalizedTags.includes(context))
  if (!match) return ''
  return style === 'title' ? toTitleCase(match) : match
}

function normalizeContextTag(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'weddings' || normalized === 'wedding') return 'wedding'
  if (normalized === 'private events' || normalized === 'private event') return 'private event'
  if (normalized === 'corporate events' || normalized === 'corporate event') return 'corporate event'
  if (normalized === 'guests' || normalized === 'guest') return 'guest'
  return normalized
}

function uniqueClean(values: Array<string | undefined | null>) {
  const seen = new Set<string>()
  const cleaned: string[] = []

  values.forEach((value) => {
    const normalized = value?.trim()
    if (!normalized || seen.has(normalized.toLowerCase())) return
    seen.add(normalized.toLowerCase())
    cleaned.push(normalized)
  })

  return cleaned
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}
