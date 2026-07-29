'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LocalMedia from '@/components/local-media'
import QuickAddVendorModal from '@/components/events/quick-add-vendor-modal'
import InlineEventDetailsHeader from '@/components/events/inline-event-details-header'
import { deleteIndexedDbMediaByIds } from '@/lib/local-fireova-media'
import {
  CONTENT_BANK_CATEGORIES,
  addEventMediaToContentBank,
  isMediaIdReferencedElsewhere,
  readAllContentBankItems,
  type ContentBankCategory,
  type LocalContentBankItem,
} from '@/lib/local-fireova-content-bank'
import {
  VENDOR_CATEGORIES,
  buildVendorCreditsText,
  buildVendorHandlesText,
  createLocalVendor,
  deleteLocalVendorSafely,
  filterVendorDirectoryEntries,
  formatInstagramHandle,
  getDisplayVendorForEventVendor,
  getVendorCategoryOptions,
  getVendorDrawerButtonAriaLabel,
  getVendorDrawerButtonText,
  canSaveSimplifiedVendor,
  getSimplifiedVendorBusinessName,
  migrateEmbeddedEventVendorsToDirectory,
  normalizeInstagramHandle,
  readLocalVendors,
  syncEventVenueWithDirectory,
  updateLocalVendor,
  type FireovaVendor,
} from '@/lib/local-fireova-vendors'
import {
  deleteLocalEvent,
  dedupeMedia,
  FIREOVA_EVENTS_CHANGED_EVENT,
  readLocalEvents,
  readLocalGeneratedPosts,
  readLocalPostStatuses,
  saveLocalEvent,
  type LocalFireovaEvent,
  type LocalEventMetadataUpdate,
  type LocalEventVendor,
  type LocalEventVendorCategory,
  type LocalGeneratedPostDraft,
  type LocalPostDraftStatus,
} from '@/lib/local-fireova-events'
import { getUploadFileMediaKind, saveIndexedDbMediaFile } from '@/lib/local-fireova-media'
import { readBusinessProfile } from '@/lib/local-fireova-business-profile'
import {
  analyzeEventMedia,
  getEventMediaAnalysisSummary,
  readMediaAnalysesForEvent,
  type AnalyzeEventMediaResult,
} from '@/lib/local-fireova-media-analysis'
import { safelyGetOrGenerateMarketingIntelligence } from '@/lib/local-fireova-marketing-intelligence'
import { getEventContentStudioEntryHref } from '@/lib/local-fireova-content-studio'
import { getSavedVenueOptions } from '@/lib/local-fireova-venues'
import { deleteEventFromCloud, loadEventFromCloud, saveEventToCloud, syncEventsWithCloud } from '@/lib/shared-fireova-events'

const EVENT_MEDIA_PREVIEW_LIMIT = 12
export default function EventDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [localEvent, setLocalEvent] = useState<LocalFireovaEvent | null>(null)
  const [postDrafts, setPostDrafts] = useState<LocalGeneratedPostDraft[]>([])
  const [postStatuses, setPostStatuses] = useState<Record<string, LocalPostDraftStatus>>({})
  const [mediaAnalysisSummary, setMediaAnalysisSummary] = useState<ReturnType<typeof getEventMediaAnalysisSummary> | null>(null)
  const [mediaAnalysisRunning, setMediaAnalysisRunning] = useState(false)
  const [mediaAnalysisNotice, setMediaAnalysisNotice] = useState('')
  const [vendors, setVendors] = useState<FireovaVendor[]>([])
  const [contentLibraryItems, setContentLibraryItems] = useState<LocalContentBankItem[]>([])
  const [contentLibraryNotice, setContentLibraryNotice] = useState('')
  const [mediaToCategorize, setMediaToCategorize] = useState<LocalFireovaEvent['media'][number] | null>(null)
  const [vendorsPanelOpen, setVendorsPanelOpen] = useState(false)
  const [vendorToEditId, setVendorToEditId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const [galleryExpanded, setGalleryExpanded] = useState(false)
  const [selectedMediaId, setSelectedMediaId] = useState('')
  const [mediaSaving, setMediaSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [eventLoadError, setEventLoadError] = useState('')
  const vendorsButtonRef = useRef<HTMLButtonElement>(null)
  const automaticReviewStartedRef = useRef('')
  const event = localEvent
  const legacyImportedQueryActive = searchParams?.get('imported') === '1' || searchParams?.get('draft') === '1'

  useEffect(() => {
    migrateEmbeddedEventVendorsToDirectory()
    setPostDrafts(readLocalGeneratedPosts(params.id))
    setPostStatuses(readLocalPostStatuses(params.id))
    setVendors(readLocalVendors())
    setContentLibraryItems(readAllContentBankItems())
    setLoaded(false)
    setEventLoadError('')
    let active = true
    void loadEventFromCloud(params.id).then((cloudEvent) => {
      if (!active) return
      const cachedEvent = saveLocalEvent(cloudEvent)
      setLocalEvent(cachedEvent)
      safelyGetOrGenerateMarketingIntelligence(cachedEvent, { profile: readBusinessProfile() })
      setMediaAnalysisSummary(getEventMediaAnalysisSummary(cachedEvent))
    }).catch((error) => {
      if (!active) return
      setLocalEvent(null)
      setEventLoadError(error instanceof Error ? error.message : 'The event could not be loaded from Fireova Cloud.')
    }).finally(() => {
      if (active) setLoaded(true)
    })
    return () => { active = false }
  }, [params.id])

  useEffect(() => {
    const refreshEvent = () => {
      const nextEvent = readLocalEvents().find((item) => item.id === params.id) ?? null
      setLocalEvent(nextEvent)
    }
    window.addEventListener(FIREOVA_EVENTS_CHANGED_EVENT, refreshEvent)
    return () => window.removeEventListener(FIREOVA_EVENTS_CHANGED_EVENT, refreshEvent)
  }, [params.id])

  useEffect(() => {
    if (!legacyImportedQueryActive) return
    router.replace(`/events/${params.id}`)
  }, [legacyImportedQueryActive, params.id, router])

  useEffect(() => {
    if (!vendorsPanelOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeVendorsDrawer()
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [vendorsPanelOpen])

  useEffect(() => {
    if (!localEvent || mediaAnalysisRunning) return
    if (!mediaAnalysisSummary || mediaAnalysisSummary.notAnalyzed === 0) return
    if (automaticReviewStartedRef.current === localEvent.id) return

    automaticReviewStartedRef.current = localEvent.id
    setMediaAnalysisRunning(true)
    setMediaAnalysisNotice('Organizing media')

    analyzeEventMedia(localEvent)
      .then((result: AnalyzeEventMediaResult) => {
        setMediaAnalysisSummary(getEventMediaAnalysisSummary(localEvent))
        setMediaAnalysisNotice(`${result.analyzed} of ${result.total} reviewed${result.failed > 0 ? `, ${result.failed} needs another look` : ''}.`)
        safelyGetOrGenerateMarketingIntelligence(localEvent, {
          profile: readBusinessProfile(),
          mediaAnalyses: readMediaAnalysesForEvent(localEvent),
          forceRegenerate: true,
          generatedAt: new Date().toISOString(),
        })
      })
      .finally(() => setMediaAnalysisRunning(false))
  }, [localEvent, mediaAnalysisRunning, mediaAnalysisSummary])

  function closeVendorsDrawer() {
    setVendorsPanelOpen(false)
    setVendorToEditId(null)
    window.setTimeout(() => vendorsButtonRef.current?.focus(), 0)
  }

  function openVendorsDrawer(vendorId: string | null = null) {
    setVendorToEditId(vendorId)
    setVendorsPanelOpen(true)
  }

  async function confirmDeleteEvent() {
    if (!localEvent) return

    try {
      await deleteEventFromCloud(localEvent.id)
    } catch {
      setConfirmingDelete(false)
      return
    }
    deleteLocalEvent(localEvent.id)
    const safeToDelete = localEvent.media
      .map(getStoredMediaId)
      .filter((id): id is string => Boolean(id))
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .filter((id) => !isMediaIdReferencedElsewhere(id))
    await deleteIndexedDbMediaByIds(safeToDelete)
    setConfirmingDelete(false)
    router.push('/events?deleted=1')
  }

  async function saveEventMetadata(updates: Partial<LocalEventMetadataUpdate>) {
    if (!localEvent) throw new Error('The canonical event is not loaded.')

    const updatedEvent: LocalFireovaEvent = {
      ...localEvent,
      ...updates,
      id: localEvent.id,
      media: localEvent.media,
      cover: localEvent.cover,
      createdAt: localEvent.createdAt,
      updatedAt: new Date().toISOString(),
    }
    const saved = await saveEventToCloud(updatedEvent)
    if (saved.id !== localEvent.id) throw new Error('Fireova returned a different event UUID.')
    const confirmed = await loadEventFromCloud(localEvent.id)
    if (confirmed.id !== localEvent.id) throw new Error('The saved event could not be confirmed by UUID.')
    const cached = saveLocalEvent(confirmed)
    setLocalEvent(cached)
    setVendors(readLocalVendors())
    await syncEventsWithCloud()
    return cached
  }

  function persistEventMedia(nextMedia: LocalFireovaEvent['media']) {
    if (!localEvent || nextMedia.length === 0) return null
    const nextEvent = saveLocalEvent({
      ...localEvent,
      media: nextMedia,
      cover: nextMedia[0],
    })
    setLocalEvent(nextEvent)
    return nextEvent
  }

  async function addEventMedia(files: FileList | null) {
    if (!files || files.length === 0 || !localEvent || mediaSaving) return
    setMediaSaving(true)
    try {
      const additions = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !/\.(heic|heif|mov|m4v|mp4|webm)$/i.test(file.name)) continue
        additions.push(await saveIndexedDbMediaFile(file, getUploadFileMediaKind(file)))
      }
      if (additions.length === 0) return
      persistEventMedia(dedupeMedia([...localEvent.media, ...additions]))
    } finally {
      setMediaSaving(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function removeEventMedia(mediaId: string) {
    if (!localEvent || localEvent.media.length <= 1) return
    const removed = localEvent.media.find((media) => media.id === mediaId)
    const nextMedia = localEvent.media.filter((media) => media.id !== mediaId)
    const updatedEvent = persistEventMedia(nextMedia)
    if (!updatedEvent) return
    if (selectedMediaId === mediaId) setSelectedMediaId(nextMedia[0]?.id ?? '')
    const storedId = removed ? getStoredMediaId(removed) : undefined
    if (storedId && !isMediaIdReferencedElsewhere(storedId)) await deleteIndexedDbMediaByIds([storedId])
  }

  function refreshMarketingIntelligence() {
    if (!event) return
    safelyGetOrGenerateMarketingIntelligence(event, {
      profile: readBusinessProfile(),
      mediaAnalyses: readMediaAnalysesForEvent(event),
      forceRegenerate: true,
      generatedAt: new Date().toISOString(),
    })
  }

  async function analyzeCurrentEventMedia(retryFailed = false) {
    if (!event || mediaAnalysisRunning) return

    setMediaAnalysisRunning(true)
    setMediaAnalysisNotice('Organizing media')
    try {
      const result: AnalyzeEventMediaResult = await analyzeEventMedia(event, {
        retryFailed,
        force: retryFailed,
      })
      setMediaAnalysisSummary(getEventMediaAnalysisSummary(event))
      setMediaAnalysisNotice(`${result.analyzed} of ${result.total} reviewed${result.failed > 0 ? `, ${result.failed} needs another look` : ''}.`)
      refreshMarketingIntelligence()
    } finally {
      setMediaAnalysisRunning(false)
    }
  }

  function refreshContentLibraryItems() {
    setContentLibraryItems(readAllContentBankItems())
  }

  function getContentLibraryItemForMedia(mediaId: string) {
    return contentLibraryItems.find((item) => item.mediaId === mediaId) ?? null
  }

  function addMediaToContentLibrary(media: LocalFireovaEvent['media'][number], category: ContentBankCategory) {
    if (!event) return

    const result = addEventMediaToContentBank({
      eventId: event.id,
      eventName: event.name,
      media,
      category,
    })

    refreshContentLibraryItems()
    setMediaToCategorize(null)
    setContentLibraryNotice(result?.created
      ? `Saved to Content Bank in ${category}.`
      : 'Already saved to Content Bank.'
    )
  }

  if (!event && loaded) {
    return (
      <div className="min-h-full bg-white px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-[28px] bg-stone-50 px-6 py-12 text-center ring-1 ring-stone-200">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">
            Fireova Content
          </p>
          <h1 className="text-2xl font-semibold text-stone-950">Event could not load</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500">
            {eventLoadError || 'This event could not be loaded from Fireova Cloud.'}
          </p>
          <Link
            href="/events"
            className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white"
          >
            Back to Events
          </Link>
        </div>
      </div>
    )
  }

  if (!event) {
    return <div className="min-h-full bg-white" />
  }

  const mediaTiles = dedupeMedia(event.media.length > 0 ? event.media : [event.cover])
  const venueInstagramHandle = normalizeVendorHandle(event.venueInstagram)
  const savedVenueOptions = getSavedVenueOptions(readLocalEvents(), vendors)
  const eventVendorDisplays = (event.vendors ?? [])
    .map((eventVendor) => getDisplayVendorForEventVendor(eventVendor, vendors))
    .filter((vendor) => vendor.category !== 'Venue' && (vendor.businessName || vendor.instagramHandle))
  const hasGeneratedPosts = postDrafts.length > 0
  const contentActionHref = getEventContentStudioEntryHref(event, postDrafts)
  const galleryCapped = mediaTiles.length > 20 && !galleryExpanded
  const visibleGalleryTiles = galleryCapped ? mediaTiles.slice(0, EVENT_MEDIA_PREVIEW_LIMIT) : mediaTiles
  const gallerySize = mediaTiles.length <= 4 ? 'small' : mediaTiles.length <= 20 ? 'medium' : 'large'
  const galleryGridClass = gallerySize === 'small'
    ? 'inline-grid max-w-full grid-cols-2 gap-1.5 sm:grid-flow-col sm:auto-cols-[minmax(176px,224px)] sm:grid-cols-none'
    : gallerySize === 'medium'
      ? 'grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4'
      : 'grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5'
  const galleryTileClass = gallerySize === 'small'
    ? 'group relative aspect-square max-h-48 overflow-hidden rounded-lg bg-stone-100 sm:max-h-none'
    : 'group relative aspect-square overflow-hidden rounded-lg bg-stone-100'
  const postCounts = postDrafts.reduce(
    (acc, draft) => {
      const status = postStatuses[draft.id] ?? 'Draft'
      acc[status] += 1
      return acc
    },
    { Draft: 0, Approved: 0, Skipped: 0, Scheduled: 0, Published: 0 } as Record<LocalPostDraftStatus, number>
  )

  function saveEventVendors(nextVendors: LocalEventVendor[]) {
    if (!localEvent) return null

    try {
      const previousEvent = localEvent
      // Use the same resilient event writer as media saves. It retries with a
      // compact event payload when older local events are close to storage limits.
      const updatedEvent = saveLocalEvent({ ...localEvent, vendors: nextVendors })
      setLocalEvent(updatedEvent)
      setVendors(readLocalVendors())
      void saveEventToCloud(updatedEvent).then((cloudEvent) => {
        setLocalEvent(cloudEvent)
        void syncEventsWithCloud()
      }).catch(() => {
        saveLocalEvent(previousEvent)
        setLocalEvent(previousEvent)
      })
      return updatedEvent
    } catch (error) {
      console.error('Unable to save event vendors', error)
      return null
    }
  }

  function removeSavedVendor(vendorId: string) {
    if (!localEvent) return
    saveEventVendors((localEvent.vendors ?? []).filter((vendor) => vendor.id !== vendorId))
  }

  function quickAddSavedVendor(vendor: FireovaVendor) {
    if (!localEvent || vendor.category === 'Venue') return false
    const normalizedHandle = normalizeVendorHandle(vendor.instagramHandle)
    const duplicate = eventVendorDisplays.some((item) =>
      item.vendorId === vendor.id || (normalizedHandle && normalizeVendorHandle(item.instagramHandle) === normalizedHandle)
    )
    if (duplicate) return false
    const updatedEvent = saveEventVendors([...(localEvent.vendors ?? []), {
      id: `event-vendor-${Date.now()}-${crypto.randomUUID()}`,
      vendorId: vendor.id,
      category: vendor.category,
      notes: vendor.notes ?? '',
    }])
    if (!updatedEvent) return false
    closeVendorsDrawer()
    return true
  }

  function quickAddNewVendor(category: LocalEventVendorCategory, instagram: string) {
    const normalizedHandle = formatInstagramHandle(instagram)
    if (!localEvent || !normalizedHandle || category === 'Venue') return false
    if (eventVendorDisplays.some((item) => normalizeVendorHandle(item.instagramHandle) === normalizeVendorHandle(normalizedHandle))) return false
    const vendor = createLocalVendor({
      category,
      businessName: getSimplifiedVendorBusinessName(category, normalizedHandle),
      instagramHandle: normalizedHandle,
      email: '',
      phone: '',
      contactName: '',
      notes: '',
      preferredVendor: false,
    })
    setVendors(readLocalVendors())
    return quickAddSavedVendor(vendor)
  }

  function removeSavedVenue() {
    if (!localEvent) return
    void saveEventMetadata({
      name: localEvent.name,
      type: localEvent.type,
      date: localEvent.date,
      venueName: '',
      venueLocation: '',
      venueInstagram: '',
      venueVendorId: undefined,
      vendors: localEvent.vendors ?? [],
      notes: localEvent.notes ?? '',
    })
  }

  const selectedMedia = mediaTiles.find((media) => media.id === selectedMediaId) ?? mediaTiles[0]
  const selectedContentBankItem = selectedMedia ? getContentLibraryItemForMedia(selectedMedia.id) : null

  return (
    <div className="min-h-full bg-white px-4 pb-24 pt-1 md:px-8 md:pb-10 md:pt-4">
      <div className="mx-auto max-w-7xl">
        <Link href="/events" className="mb-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-stone-500 transition hover:text-stone-950 md:min-h-0">
          <span className="md:hidden">← Events</span>
          <span className="hidden md:inline">← Back to Events</span>
        </Link>

        <main className="bg-transparent md:rounded-xl md:border md:border-stone-200 md:bg-white md:p-5 md:shadow-[0_8px_24px_rgba(28,25,23,0.05)]" data-testid="saved-event-editor">
          <div className="grid min-w-0 gap-3 md:gap-5 lg:grid-cols-[minmax(0,47fr)_minmax(0,53fr)] lg:items-start lg:gap-x-7">
            <section className="min-w-0" aria-label="Selected event media">
              {selectedMedia && (
                <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-[14px] bg-stone-100 md:aspect-[4/5] md:max-h-[calc(100vh-175px)] md:rounded-xl" data-testid="saved-event-media-preview">
                  <LocalMedia media={selectedMedia} className="h-full w-full object-cover" controls={selectedMedia.type === 'video'} muted={false} />
                  <button
                    type="button"
                    onClick={() => setMediaToCategorize(selectedMedia)}
                    disabled={Boolean(selectedContentBankItem)}
                    className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-sm ring-1 ring-white/25 backdrop-blur-md transition hover:scale-105 hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${selectedContentBankItem ? 'cursor-default text-ember-300' : ''}`}
                    aria-label={selectedContentBankItem ? 'Selected media saved to Content Bank' : 'Save selected media to Content Bank'}
                    title={selectedContentBankItem ? 'Saved to Content Bank' : 'Save to Content Bank'}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill={selectedContentBankItem ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
                    </svg>
                  </button>
                  <span className="absolute bottom-3 left-3 rounded-md bg-black/65 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur">
                    {selectedMedia.type === 'video' ? 'Video' : 'Photo'}
                  </span>
                </div>
              )}
              {contentLibraryNotice && <p className="mt-2 text-xs font-medium text-stone-500" role="status">{contentLibraryNotice}</p>}
            </section>

            <section className="min-w-0" aria-label="Event Details">
              <div className="min-w-0">
                <InlineEventDetailsHeader
                  value={{
                    name: event.name,
                    type: event.type,
                    date: event.date,
                    venueName: event.venueName,
                    venueLocation: event.venueLocation,
                    venueInstagram: event.venueInstagram,
                    venueVendorId: event.venueVendorId,
                  }}
                  venues={savedVenueOptions}
                  onSave={saveEventMetadata}
                  mobileActions={(
                    <div className="relative shrink-0 md:hidden">
                      <button type="button" onClick={() => setMobileActionsOpen((open) => !open)} className="flex h-[52px] w-11 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-stone-50 text-lg font-semibold text-stone-500" aria-label="Event actions" aria-expanded={mobileActionsOpen}>•••</button>
                      {mobileActionsOpen && (
                        <div className="absolute right-0 top-[60px] z-30 w-48 overflow-hidden rounded-xl bg-white py-1 shadow-[0_16px_40px_rgba(28,25,23,0.18)] ring-1 ring-stone-200">
                          <Link href="/events" className="flex min-h-11 items-center px-4 text-sm font-semibold text-stone-800">Back to Events</Link>
                          <button type="button" onClick={() => { setMobileActionsOpen(false); setConfirmingDelete(true) }} className="min-h-11 w-full px-4 text-left text-sm font-semibold text-red-600">Delete Event</button>
                        </div>
                      )}
                    </div>
                  )}
                />
              </div>

              <section className="mt-6 min-w-0 md:hidden" aria-label="Event media controls">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-stone-600">Media ({mediaTiles.length})</h2>
                <div className="flex max-w-full snap-x snap-mandatory flex-nowrap items-center gap-3 overflow-x-auto pb-2">
                  {mediaTiles.map((media) => (
                    <div key={media.id} className="group relative h-[72px] w-[72px] shrink-0 snap-start">
                      <button type="button" onClick={() => setSelectedMediaId(media.id)} className={`h-full w-full overflow-hidden rounded-xl bg-stone-100 ring-2 ${media.id === selectedMedia?.id ? 'ring-ember-500' : 'ring-stone-200'}`} aria-label={`Select ${media.alt || 'event media'}`} aria-current={media.id === selectedMedia?.id ? 'true' : undefined}>
                        <LocalMedia media={media} className="h-full w-full object-cover" muted />
                      </button>
                      {mediaTiles.length > 1 && (
                        <button type="button" onClick={(clickEvent) => { clickEvent.stopPropagation(); void removeEventMedia(media.id) }} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-sm font-semibold leading-none text-stone-700 shadow-sm ring-1 ring-black/5" aria-label={`Remove ${media.alt || 'event media'}`}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={mediaSaving} className="flex h-[72px] w-[72px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl bg-stone-100 text-stone-600 ring-2 ring-stone-200 disabled:opacity-60">
                    <span className="text-xl leading-none">+</span>
                    <span className="text-[11px] font-semibold">Add media</span>
                  </button>
                </div>
              </section>

              <details className="mt-1 border-t border-stone-200/70 pt-1 md:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-stone-800">
                  <span>Vendor Credits ({eventVendorDisplays.length + (venueInstagramHandle ? 1 : 0)})</span>
                  <span aria-hidden="true" className="text-stone-400">⌄</span>
                </summary>
                <div className="pb-2 pt-1">
                  <button ref={vendorsButtonRef} type="button" onClick={() => openVendorsDrawer()} className="mb-2 min-h-11 rounded-lg px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">+ Add Vendor</button>
                  <div className="space-y-1 text-sm leading-5">
                    {venueInstagramHandle && <p className="font-semibold text-stone-800">Venue · @{venueInstagramHandle}</p>}
                    {eventVendorDisplays.map((vendor) => <p key={vendor.id} className="font-semibold text-stone-800">{getVendorCreditCategoryLabel(vendor.category)} · @{normalizeVendorHandle(vendor.instagramHandle)}</p>)}
                    {!venueInstagramHandle && eventVendorDisplays.length === 0 && <p className="text-stone-400">No vendors added yet.</p>}
                  </div>
                </div>
              </details>

              <section className="mt-5 hidden border-t border-stone-200/70 pt-5 md:block">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-700">Vendor Credits</h2>
                  <button
                    ref={vendorsButtonRef}
                    type="button"
                    onClick={() => openVendorsDrawer()}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 hover:text-stone-950"
                  >
                    + Add Vendor
                  </button>
                </div>
                <div className="space-y-0.5 text-[15px] leading-5">
                  {venueInstagramHandle && (
                    <div className="group flex min-h-8 min-w-0 items-center gap-2">
                      <p className="grid min-w-0 flex-1 grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-2"><span className="truncate text-xs font-semibold uppercase tracking-[0.04em] text-stone-500">Venue <span aria-hidden="true" className="text-stone-300">·</span></span><span className="truncate font-semibold text-stone-950">@{venueInstagramHandle}</span></p>
                      <VendorCreditActions
                        handle={venueInstagramHandle}
                        label="venue"
                        onRemove={removeSavedVenue}
                      />
                    </div>
                  )}
                  {eventVendorDisplays.map((vendor) => (
                    <div key={vendor.id} className="group flex min-h-8 min-w-0 items-center gap-2">
                      <p className="grid min-w-0 flex-1 grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-2"><span className="truncate text-xs font-semibold uppercase tracking-[0.04em] text-stone-500" title={getVendorCreditCategoryLabel(vendor.category)}>{getVendorCreditCategoryLabel(vendor.category)} <span aria-hidden="true" className="text-stone-300">·</span></span><span className="truncate font-semibold text-stone-950">@{normalizeVendorHandle(vendor.instagramHandle)}</span></p>
                      <VendorCreditActions
                        handle={normalizeVendorHandle(vendor.instagramHandle)}
                        label={normalizeVendorHandle(vendor.instagramHandle) || vendor.businessName || vendor.category}
                        onRemove={() => removeSavedVendor(vendor.id)}
                      />
                    </div>
                  ))}
                  {!venueInstagramHandle && eventVendorDisplays.length === 0 && <p className="text-xs font-medium text-stone-400">No vendors added yet.</p>}
                </div>
              </section>

              <div className="mt-4 hidden border-t border-stone-200/70 pt-5 md:block">
                <Link href={contentActionHref} className="group inline-flex min-h-[54px] w-full items-center justify-center rounded-xl bg-stone-950 px-7 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800">
                  ✨ Create Content <span className="ml-1.5 inline-block transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>

              <section className="mt-4 hidden min-w-0 md:block" aria-label="Event media controls">
                {mediaTiles.length > 0 && <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Event Media</h2>}
                <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                  {mediaTiles.map((media) => (
                    <div key={media.id} className="group relative h-20 w-20 shrink-0">
                      <button type="button" onClick={() => setSelectedMediaId(media.id)} className={`h-full w-full overflow-hidden rounded-lg bg-stone-100 ring-2 ${media.id === selectedMedia?.id ? 'ring-ember-500' : 'ring-stone-200'}`} aria-label={`Select ${media.alt || 'event media'}`} aria-current={media.id === selectedMedia?.id ? 'true' : undefined}>
                        <LocalMedia media={media} className="h-full w-full object-cover" muted />
                      </button>
                      {mediaTiles.length > 1 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void removeEventMedia(media.id)
                          }}
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-sm font-semibold leading-none text-stone-700 shadow-sm ring-1 ring-black/5 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${media.alt || 'event media'}`}
                          title="Remove media"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={mediaSaving} className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 bg-stone-50/60 text-stone-600 transition hover:border-stone-400 hover:bg-stone-50 disabled:opacity-60">
                    <span className="text-lg leading-none">+</span>
                    <span className="text-[10px] font-semibold">Add media</span>
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*,.heic,.heif,.mov,.m4v" multiple className="sr-only" onChange={(changeEvent) => void addEventMedia(changeEvent.target.files)} />
                </div>
              </section>
            </section>
          </div>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 pt-2 backdrop-blur md:hidden" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}>
        <Link href={contentActionHref} className="group inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-stone-950 px-7 text-sm font-semibold text-white shadow-sm">
          ✨ Create Content <span className="ml-1.5">→</span>
        </Link>
      </div>

      {vendorsPanelOpen && (
        vendorToEditId ? (
          <VendorDrawer
            event={event}
            eventName={event.name}
            vendors={eventVendorDisplays}
            initialEditingVendorId={vendorToEditId}
            onClose={closeVendorsDrawer}
            onVendorsChange={saveEventVendors}
            onDirectoryChange={() => setVendors(readLocalVendors())}
          />
        ) : (
          <QuickAddVendorModal
            directoryVendors={vendors}
            onAddSaved={quickAddSavedVendor}
            onAddNew={quickAddNewVendor}
            onClose={closeVendorsDrawer}
          />
        )
      )}
      {confirmingDelete && (
        <DeleteEventDialog eventName={event.name} onCancel={() => setConfirmingDelete(false)} onConfirm={() => void confirmDeleteEvent()} />
      )}
      {mediaToCategorize && (
        <ContentBankCategoryDialog
          onCancel={() => setMediaToCategorize(null)}
          onSelect={(category) => addMediaToContentLibrary(mediaToCategorize, category)}
        />
      )}
    </div>
  )

}

function ContentBankCategoryDialog({
  onCancel,
  onSelect,
}: {
  onCancel: () => void
  onSelect: (category: ContentBankCategory) => void
}) {
  const [category, setCategory] = useState<ContentBankCategory>('Other')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-4 backdrop-blur-sm sm:items-center" onClick={onCancel}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-bank-category-title"
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.24)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="content-bank-category-title" className="text-xl font-semibold text-stone-950">Choose a category</h2>
            <p className="mt-1 text-sm text-stone-500">Choose where this media belongs in the Media Bank.</p>
          </div>
          <button type="button" onClick={onCancel} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-lg text-stone-500 hover:bg-stone-200" aria-label="Close category picker">×</button>
        </div>
        <label className="mt-5 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as ContentBankCategory)}
            className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-[15px] font-semibold text-stone-800 outline-none transition focus:border-transparent focus:ring-2 focus:ring-stone-950"
            autoFocus
          >
            {CONTENT_BANK_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-semibold text-stone-600 transition hover:bg-stone-100">Cancel</button>
          <button type="button" onClick={() => onSelect(category)} className="h-11 rounded-xl bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800">Save to Media Bank</button>
        </div>
      </section>
    </div>
  )
}

function StatusPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200">
      {value} {label}
    </span>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="h-4 w-4" width="16" height="16" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 4.75A1.75 1.75 0 018.5 3h7a1.75 1.75 0 011.75 1.75v15L12 16.5 6.75 19.75v-15Z" />
    </svg>
  )
}

function VendorCreditActions({ handle, label, onRemove }: {
  handle?: string
  label: string
  onRemove: () => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-0">
      {handle && (
        <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" aria-label={`Open @${handle} on Instagram`} className="flex h-8 w-7 items-center justify-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-900">
          <InstagramMiniIcon className="h-4 w-4" />
        </a>
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="flex h-8 w-7 items-center justify-center rounded-md text-red-400 transition hover:bg-red-50 hover:text-red-600">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </span>
  )
}

function SavedEventQuickAddVendorModal({
  directoryVendors,
  onAddSaved,
  onAddNew,
  onClose,
}: {
  directoryVendors: FireovaVendor[]
  onAddSaved: (vendor: FireovaVendor) => boolean
  onAddNew: (category: LocalEventVendorCategory, instagram: string) => boolean
  onClose: () => void
}) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [creatingNew, setCreatingNew] = useState(false)
  const [category, setCategory] = useState<LocalEventVendorCategory>('Other')
  const [instagram, setInstagram] = useState('')
  const [error, setError] = useState('')
  const matches = filterVendorDirectoryEntries(directoryVendors, search).filter((vendor) => vendor.category !== 'Venue')
  const categoryOptions = getVendorCategoryOptions(directoryVendors).filter((option) => option !== 'Venue')

  useEffect(() => searchInputRef.current?.focus(), [])

  function selectVendor(vendor: FireovaVendor) {
    if (!onAddSaved(vendor)) setError('This vendor is already added to this event.')
  }

  function beginNewVendor() {
    setInstagram(formatInstagramHandle(search) ?? (search.trim().startsWith('@') ? search.trim() : ''))
    setCreatingNew(true)
    setError('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="saved-event-add-vendor-title">
      <button type="button" aria-label="Close Add Vendor modal" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/30 backdrop-blur-[1px]" />
      <section className="relative z-10 flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_90px_rgba(28,25,23,0.28)] ring-1 ring-stone-200 sm:max-h-[70vh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-4">
          <h2 id="saved-event-add-vendor-title" className="text-xl font-semibold text-stone-950">Add Vendor</h2>
          <button type="button" onClick={onClose} aria-label="Close Add Vendor" className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-lg leading-none text-stone-500 hover:bg-stone-200 hover:text-stone-900">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!creatingNew ? (
            <div className="space-y-3">
              <input
                ref={searchInputRef}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={Boolean(search.trim())}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setActiveIndex(-1); setError('') }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)) }
                  if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)) }
                  if (event.key === 'Enter' && search.trim()) {
                    event.preventDefault()
                    if (activeIndex >= 0 && matches[activeIndex]) selectVendor(matches[activeIndex])
                    else if (matches.length === 1) selectVendor(matches[0])
                    else if (matches.length === 0) beginNewVendor()
                  }
                }}
                placeholder="Search vendors by name, category, or @handle"
                className="min-h-[46px] w-full rounded-lg bg-white px-3 text-sm font-semibold text-stone-950 ring-1 ring-stone-200 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-stone-950"
              />
              {!search.trim() ? (
                <div className="flex items-center justify-between gap-3 py-1">
                  <p className="text-sm font-medium text-stone-400">Search your Vendor Directory</p>
                  <button type="button" onClick={beginNewVendor} className="rounded-md px-2 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-100">+ Create new vendor</button>
                </div>
              ) : (
                <div role="listbox" className="max-h-[min(420px,55vh)] overflow-y-auto rounded-lg ring-1 ring-stone-200">
                  {matches.length > 0 ? matches.map((vendor, index) => (
                    <button key={vendor.id} type="button" role="option" aria-selected={index === activeIndex} onClick={() => selectVendor(vendor)} className={`block min-h-11 w-full border-b border-stone-100 px-3 py-2.5 text-left text-sm last:border-b-0 ${index === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                      <span className="font-semibold text-stone-800">{getVendorFormCategoryLabel(vendor.category)}</span><span className="text-stone-400"> · </span><span className="font-semibold text-stone-950">{formatInstagramHandle(vendor.instagramHandle) ?? vendor.businessName}</span>
                    </button>
                  )) : (
                    <button type="button" onClick={beginNewVendor} className="min-h-11 w-full px-3 py-2.5 text-left text-sm font-semibold text-stone-800 hover:bg-stone-50">Add new vendor: {formatInstagramHandle(search) ?? search.trim()}</button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
              <label><span className="text-xs font-semibold text-stone-500">Category</span><select value={category} onChange={(event) => setCategory(event.target.value as LocalEventVendorCategory)} className="mt-1 min-h-10 w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950">{categoryOptions.map((option) => <option key={option} value={option}>{getVendorFormCategoryLabel(option)}</option>)}</select></label>
              <label><span className="text-xs font-semibold text-stone-500">Instagram</span><input value={instagram} onChange={(event) => { setInstagram(event.target.value); setError('') }} placeholder="@username" className="mt-1 min-h-10 w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950" /></label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreatingNew(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100">Back</button>
                <button type="button" disabled={!canSaveSimplifiedVendor(instagram)} onClick={() => { if (!onAddNew(category, instagram)) setError('Enter a valid Instagram handle that is not already added.') }} className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add Vendor</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{error}</p>}
        </div>
      </section>
    </div>
  )
}

function VendorDrawer({
  event,
  eventName,
  vendors,
  initialEditingVendorId,
  onClose,
  onVendorsChange,
  onDirectoryChange,
}: {
  event: LocalFireovaEvent
  eventName: string
  vendors: DisplayEventVendor[]
  initialEditingVendorId?: string | null
  onClose: () => void
  onVendorsChange: (vendors: LocalEventVendor[]) => LocalFireovaEvent | null
  onDirectoryChange: () => void
}) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>(initialEditingVendorId ? 'edit' : 'list')
  const [editingVendorId, setEditingVendorId] = useState<string | null>(initialEditingVendorId ?? null)
  const [form, setForm] = useState<VendorDrawerFormState>(getEmptyVendorDrawerForm())
  const [vendorSearch, setVendorSearch] = useState('')
  const [copiedVendorId, setCopiedVendorId] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [openVendorMenuId, setOpenVendorMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'edit' || !editingVendorId) return

    const vendor = vendors.find((item) => item.id === editingVendorId)
    if (!vendor) {
      setMode('list')
      setEditingVendorId(null)
      return
    }

    setForm(getVendorDrawerFormFromVendor(vendor))
  }, [editingVendorId, mode, vendors])

  useEffect(() => {
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
    focusable?.[0]?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return

      const elements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )
      if (elements.length === 0) return

      const first = elements[0]
      const last = elements[elements.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function startAddVendor() {
    setForm(getEmptyVendorDrawerForm())
    setEditingVendorId(null)
    setMode('add')
  }

  function startEditVendor(vendor: DisplayEventVendor) {
    setForm(getVendorDrawerFormFromVendor(vendor))
    setEditingVendorId(vendor.id)
    setMode('edit')
  }

  function updateForm(updates: Partial<VendorDrawerFormState>) {
    setForm((current) => ({ ...current, ...updates }))
  }

  function saveNewVendor() {
    if (!canSaveSimplifiedVendor(form.instagram)) return

    const vendor = createLocalVendor({
      category: form.category,
      businessName: getSimplifiedVendorBusinessName(form.category, form.instagram),
      instagramHandle: form.instagram.trim(),
      email: '',
      phone: '',
      contactName: '',
      notes: form.notes.trim(),
      preferredVendor: false,
    })
    onDirectoryChange()
    const nextEventVendors = [
      ...(event.vendors ?? []),
      {
        id: `event-vendor-${Date.now()}-${crypto.randomUUID()}`,
        vendorId: vendor.id,
        category: form.category,
        notes: form.notes.trim(),
      },
    ]
    onVendorsChange(nextEventVendors)
    setMode('list')
    setForm(getEmptyVendorDrawerForm())
  }

  function saveExistingVendor() {
    if (!editingVendorId) return

    const currentEventVendor = event.vendors?.find((item) => item.id === editingVendorId)
    const currentDisplayVendor = vendors.find((item) => item.id === editingVendorId)
    if (!currentEventVendor || !currentDisplayVendor) return

    if (!canSaveSimplifiedVendor(form.instagram, currentDisplayVendor.businessName)) return

    let vendorId = currentEventVendor.vendorId
    if (vendorId) {
      updateLocalVendor(vendorId, {
        category: form.category,
        instagramHandle: form.instagram.trim(),
        notes: form.notes.trim(),
        preferredVendor: currentDisplayVendor.preferredVendor ?? false,
      })
    } else {
      const vendor = createLocalVendor({
        category: form.category,
        businessName: getSimplifiedVendorBusinessName(form.category, form.instagram, currentDisplayVendor.businessName),
        instagramHandle: form.instagram.trim(),
        website: currentDisplayVendor.website,
        email: '',
        phone: '',
        contactName: '',
        notes: form.notes.trim(),
        preferredVendor: false,
      })
      vendorId = vendor.id
    }

    onDirectoryChange()
    const nextEventVendors = (event.vendors ?? []).map((item) =>
      item.id === editingVendorId
        ? {
            id: item.id,
            vendorId,
            category: form.category,
            instagramOverride: form.instagram.trim(),
            notes: form.notes.trim(),
          }
        : item
    )
    onVendorsChange(nextEventVendors)
    setMode('list')
  }

  function deleteVendorFromEvent(vendorId = editingVendorId) {
    if (!vendorId) return

    const currentEventVendor = event.vendors?.find((item) => item.id === vendorId)
    const nextEventVendors = (event.vendors ?? []).filter((item) => item.id !== vendorId)
    onVendorsChange(nextEventVendors)
    if (currentEventVendor?.vendorId) deleteLocalVendorSafely(currentEventVendor.vendorId)
    onDirectoryChange()
    setOpenVendorMenuId(null)
    setEditingVendorId(null)
    setMode('list')
  }

  async function copyVendorInstagram(vendor: DisplayEventVendor) {
    const handle = normalizeVendorHandle(vendor.instagramHandle)
    if (!handle) return

    const copied = await copyTextToClipboard(`@${handle}`)
    if (!copied) {
      showCopyStatus('Couldn’t copy. Please try again.', 'error')
      return
    }

    setCopiedVendorId(vendor.id)
    window.setTimeout(() => setCopiedVendorId(null), 1400)
  }

  async function copyVendorCredits() {
    const copied = await copyTextToClipboard(vendorCreditsText)
    showCopyStatus(copied ? 'Caption credits copied' : 'Couldn’t copy. Please try again.', copied ? 'success' : 'error')
  }

  async function copyVendorHandles() {
    const copied = await copyTextToClipboard(vendorHandlesText)
    showCopyStatus(copied ? 'Instagram handles copied' : 'Couldn’t copy. Please try again.', copied ? 'success' : 'error')
  }

  function showCopyStatus(message: string, tone: 'success' | 'error') {
    setCopyStatus({ tone, message })
    window.setTimeout(() => setCopyStatus(null), 2000)
  }

  const normalizedSearch = vendorSearch.trim().toLowerCase()
  const visibleVendors = normalizedSearch
    ? vendors.filter((vendor) => {
        const handle = normalizeVendorHandle(vendor.instagramHandle) ?? ''
        return [
          vendor.businessName,
          vendor.category,
          handle,
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedSearch))
      })
    : vendors
  const groupedVendors = VENDOR_CATEGORIES
    .map((category) => ({
      category,
      vendors: visibleVendors.filter((vendor) => vendor.category === category),
    }))
    .filter((group) => group.vendors.length > 0)
  const showVendorSearch = vendors.length >= 8
  const venueCreditSource = event.venueName || event.venueInstagram ? [{
    category: 'Venue' as const,
    businessName: event.venueName,
    instagramHandle: event.venueInstagram,
  }] : []
  const creditSources = [...venueCreditSource, ...vendors]
  const vendorCreditsText = buildVendorCreditsText(creditSources)
  const vendorHandlesText = buildVendorHandlesText(creditSources)
  const canCopyVendorCredits = Boolean(vendorCreditsText)
  const copyDisabledTitle = canCopyVendorCredits ? undefined : 'Add a vendor with an Instagram handle to copy caption credits.'

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="vendor-drawer-title">
      <button
        type="button"
        aria-label="Close vendor drawer"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30 backdrop-blur-[1px]"
      />
      <aside
        ref={drawerRef}
        className="absolute inset-y-0 right-0 flex w-[min(100vw-24px,460px)] flex-col bg-white shadow-[0_24px_90px_rgba(28,25,23,0.28)] ring-1 ring-stone-200"
      >
        <div className="sticky top-0 z-10 border-b border-stone-100 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">
                Vendors
              </p>
              <h2 id="vendor-drawer-title" className="text-2xl font-semibold leading-tight text-stone-950">
                {eventName}
              </h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">
                {vendors.length} Vendor{vendors.length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-stone-100 px-4 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950"
            >
              Close
            </button>
          </div>
          {mode === 'list' && (
            <div className="mt-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">Tools</p>
              <button
                type="button"
                onClick={startAddVendor}
                className="w-full rounded-full bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:ring-offset-2"
              >
                + Add Vendor
              </button>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={copyVendorCredits}
                  disabled={!canCopyVendorCredits}
                  title={copyDisabledTitle}
                  aria-label="Copy caption credits"
                  className="rounded-full bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 ring-1 ring-stone-200 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400 disabled:ring-stone-100"
                >
                  Copy Caption Credits
                </button>
                <button
                  type="button"
                  onClick={copyVendorHandles}
                  disabled={!canCopyVendorCredits}
                  title={copyDisabledTitle}
                  aria-label="Copy Instagram handles"
                  className="rounded-full bg-white px-4 py-2.5 text-xs font-semibold text-stone-800 ring-1 ring-stone-200 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400 disabled:ring-stone-100"
                >
                  Copy Instagram Handles
                </button>
              </div>
              {copyStatus && (
                <p className={`rounded-2xl px-3 py-2 text-xs font-semibold ${
                  copyStatus.tone === 'success'
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                    : 'bg-red-50 text-red-600 ring-1 ring-red-100'
                }`}>
                  {copyStatus.message}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {mode === 'list' ? (
            <div className="space-y-7">
              {(event.venueName || event.venueInstagram) && (
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-stone-600">Venue</h3>
                  <div className="rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-stone-100">
                    {event.venueName && <p className="text-sm font-semibold text-stone-900">{event.venueName}</p>}
                    {normalizeInstagramHandle(event.venueInstagram) && (
                      <p className="mt-1 text-sm font-medium text-stone-500">@{normalizeInstagramHandle(event.venueInstagram)}</p>
                    )}
                  </div>
                </section>
              )}
              <h3 className="text-sm font-semibold text-stone-600">Vendors ({vendors.length})</h3>
              {vendors.length === 0 ? (
                <section>
                  <p className="text-sm leading-6 text-stone-500">No vendors yet.</p>
                </section>
              ) : (
                <>
                  {showVendorSearch && (
                    <label className="block">
                      <span className="sr-only">Search vendors</span>
                      <input
                        value={vendorSearch}
                        onChange={(event) => setVendorSearch(event.target.value)}
                        placeholder="Search vendors..."
                        className="h-10 w-full rounded-full border border-stone-200 bg-stone-50 px-4 text-sm font-medium text-stone-900 outline-none transition focus:border-transparent focus:bg-white focus:ring-2 focus:ring-stone-950"
                      />
                    </label>
                  )}

                  {groupedVendors.length === 0 ? (
                    <p className="text-sm leading-6 text-stone-500">No vendors match that search.</p>
                  ) : (
                    <div className="space-y-10">
                      {groupedVendors.map((group) => (
                        <section key={group.category}>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-stone-600">
                              {getVendorDrawerCategoryTitle(group.category, group.vendors.length)}
                            </h3>
                          </div>
                          <div className="divide-y divide-stone-100 border-y border-stone-100">
                            {group.vendors.map((vendor) => (
                              <VendorDrawerRow
                                key={vendor.id}
                                vendor={vendor}
                                copied={copiedVendorId === vendor.id}
                                menuOpen={openVendorMenuId === vendor.id}
                                onEdit={() => startEditVendor(vendor)}
                                onCopy={() => copyVendorInstagram(vendor)}
                                onDelete={() => deleteVendorFromEvent(vendor.id)}
                                onToggleMenu={() => setOpenVendorMenuId((current) => current === vendor.id ? null : vendor.id)}
                              />
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <VendorDrawerForm
              mode={mode}
              form={form}
              onChange={updateForm}
              onCancel={() => setMode('list')}
              onSave={mode === 'add' ? saveNewVendor : saveExistingVendor}
              onDelete={mode === 'edit' ? () => deleteVendorFromEvent() : undefined}
            />
          )}
        </div>
        <div className="border-t border-stone-100 bg-white px-5 py-2.5">
          <p className="text-[11px] font-medium text-stone-400">✓ All changes saved</p>
        </div>
      </aside>
    </div>
  )
}

type DisplayEventVendor = ReturnType<typeof getDisplayVendorForEventVendor>

function VendorDrawerRow({
  vendor,
  copied,
  menuOpen,
  onEdit,
  onCopy,
  onDelete,
  onToggleMenu,
}: {
  vendor: DisplayEventVendor
  copied: boolean
  menuOpen: boolean
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
  onToggleMenu: () => void
}) {
  const instagramHandle = normalizeVendorHandle(vendor.instagramHandle)
  const websiteHref = getVendorWebsiteHref(vendor.website)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onEdit()
        }
      }}
      className="group relative -mx-2 flex min-h-[58px] cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2.5 outline-none transition-colors hover:bg-stone-50 focus-visible:bg-stone-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-950"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-stone-950">{vendor.businessName || 'Unnamed vendor'}</p>
        {instagramHandle ? (
          <p className="mt-0.5 truncate text-xs font-semibold text-ember-700">@{instagramHandle}</p>
        ) : (
          <p className="mt-0.5 text-xs font-medium text-stone-400">No Instagram</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onCopy()
          }}
          disabled={!instagramHandle}
          className="rounded-full p-2 text-stone-500 transition-colors hover:bg-white hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Copy handle for ${vendor.businessName || 'vendor'}`}
          title="Copy handle"
        >
          {copied ? <CheckMiniIcon className="h-3.5 w-3.5" /> : <CopyMiniIcon className="h-3.5 w-3.5" />}
        </button>
        {instagramHandle && (
          <a
            href={`https://instagram.com/${instagramHandle}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="rounded-full p-2 text-stone-500 transition-colors hover:bg-white hover:text-stone-950"
            aria-label={`Open Instagram for ${vendor.businessName || 'vendor'}`}
            title="Open Instagram"
          >
            <InstagramMiniIcon className="h-3.5 w-3.5" />
          </a>
        )}
        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="rounded-full p-2 text-stone-500 transition-colors hover:bg-white hover:text-stone-950"
            aria-label={`Open website for ${vendor.businessName || 'vendor'}`}
            title="Open website"
          >
            <WebsiteMiniIcon className="h-3.5 w-3.5" />
          </a>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleMenu()
            }}
            aria-label={`More actions for ${vendor.businessName || 'vendor'}`}
            aria-expanded={menuOpen}
            className="rounded-full p-2 text-stone-500 transition-colors hover:bg-white hover:text-stone-950"
            title="More actions"
          >
            <DotsMiniIcon className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-20 min-w-40 overflow-hidden rounded-xl bg-white py-1 shadow-[0_12px_34px_rgba(28,25,23,0.18)] ring-1 ring-stone-200"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={onEdit}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onCopy}
                disabled={!instagramHandle}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
              >
                Copy Handle
              </button>
              {instagramHandle && (
                <a
                  href={`https://instagram.com/${instagramHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Open Instagram
                </a>
              )}
              {websiteHref && (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Open Website
                </a>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-red-500 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type VendorDrawerFormState = {
  category: LocalEventVendorCategory
  instagram: string
  notes: string
}

function getEmptyVendorDrawerForm(): VendorDrawerFormState {
  return {
    category: 'Other',
    instagram: '',
    notes: '',
  }
}

function getVendorDrawerFormFromVendor(vendor: DisplayEventVendor): VendorDrawerFormState {
  return {
    category: vendor.category,
    instagram: vendor.instagramHandle ?? '',
    notes: vendor.notes ?? '',
  }
}

function VendorDrawerForm({
  mode,
  form,
  onChange,
  onCancel,
  onSave,
  onDelete,
}: {
  mode: 'add' | 'edit'
  form: VendorDrawerFormState
  onChange: (updates: Partial<VendorDrawerFormState>) => void
  onCancel: () => void
  onSave: () => void
  onDelete?: () => void
}) {
  return (
    <div className="space-y-3.5">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Category</span>
        <select
          value={form.category}
          onChange={(event) => onChange({ category: event.target.value as LocalEventVendorCategory })}
          className="mt-1 min-h-[44px] w-full rounded-lg bg-white px-3 text-sm font-semibold text-stone-950 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950"
        >
          {VENDOR_CATEGORIES.filter((category) => category !== 'Venue').map((category) => (
            <option key={category} value={category}>{getVendorFormCategoryLabel(category)}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Instagram</span>
        <input
          value={form.instagram}
          onChange={(event) => onChange({ instagram: event.target.value })}
          className="mt-1 min-h-[44px] w-full rounded-lg bg-white px-3 text-sm font-semibold text-stone-950 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Notes (Optional)</span>
        <textarea
          value={form.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          className="mt-1 min-h-[110px] w-full resize-none rounded-lg bg-white px-3 py-3 text-sm leading-6 text-stone-950 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950"
        />
      </label>

      <div className="grid gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={mode === 'add' && !canSaveSimplifiedVendor(form.instagram)}
          className="rounded-full bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === 'add' ? 'Save' : 'Done'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-50"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-2 rounded-full px-4 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50"
          >
            Delete Vendor
          </button>
        )}
      </div>
    </div>
  )
}

function normalizeVendorHandle(value?: string) {
  return normalizeInstagramHandle(value)
}

async function copyTextToClipboard(value: string) {
  if (!value.trim()) return false

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', 'true')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      return copied
    } catch {
      return false
    }
  }
}

function getVendorDrawerGroupLabel(category: LocalEventVendorCategory) {
  if (category === 'Bakery') return 'Cake'
  if (category === 'Photographer') return 'Photography'
  if (category === 'Videographer') return 'Videography'
  if (category === 'Planner') return 'Planning'
  if (category === 'Florist') return 'Florals'
  if (category === 'Caterer') return 'Catering'
  return category
}

function getVendorFormCategoryLabel(category: LocalEventVendorCategory) {
  return category === 'Bakery' ? 'Cake' : category
}

function getVendorCreditCategoryLabel(category: LocalEventVendorCategory) {
  return getVendorFormCategoryLabel(category)
}

function getVendorDrawerCategoryTitle(category: LocalEventVendorCategory, count: number) {
  const label = getVendorDrawerGroupLabel(category)
  return count > 1 ? `${label} (${count})` : label
}

function getVendorWebsiteHref(value?: string) {
  const website = value?.trim()
  if (!website) return undefined
  return website.startsWith('http://') || website.startsWith('https://') ? website : `https://${website}`
}

function InstagramMiniIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  )
}

function WebsiteMiniIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7l-1.2 1.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7l1.2-1.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CopyMiniIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CheckMiniIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 4 4 10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DotsMiniIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="19" cy="12" r="1.7" fill="currentColor" />
    </svg>
  )
}

function DeleteEventDialog({
  eventName,
  onCancel,
  onConfirm,
}: {
  eventName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-5 py-5 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.24)]">
        <h2 className="text-xl font-semibold text-stone-950">Delete {eventName}?</h2>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          This will remove the event, its uploaded media previews, and its saved post drafts from this browser.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            Delete Event
          </button>
        </div>
      </div>
    </div>
  )
}

function getStoredMediaId(media: { id?: string; src: string; posterSrc?: string }) {
  if (media.id) return media.id
  const match = media.src.match(/^fireova-idb-media:\/\/(.+)$/)
  if (match?.[1]) return match[1]
  const posterMatch = media.posterSrc?.match(/^fireova-idb-poster:\/\/(.+)$/)
  return posterMatch?.[1]
}
