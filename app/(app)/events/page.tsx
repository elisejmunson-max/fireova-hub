'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import LocalMedia from '@/components/local-media'
import QuickAddVendorModal from '@/components/events/quick-add-vendor-modal'
import InlineEventDetailsHeader from '@/components/events/inline-event-details-header'
import { isMediaIdReferencedElsewhere } from '@/lib/local-fireova-content-bank'
import { deleteIndexedDbMediaByIds } from '@/lib/local-fireova-media'
import {
  clearPendingEventMediaBatch,
  DEFAULT_PENDING_EVENT_DETAILS,
  collectDroppedMediaFiles,
  collectPendingEventMedia,
  DraftEventCreationError,
  getPendingEventDetailsWithMediaDate,
  getPendingEventMediaSummary,
  getPendingNonVenueVendors,
  getPendingVenuePreview,
  getUploadFilePath,
  hasPendingEventDetailErrors,
  hasPendingEventVendorDuplicate,
  hasDraggedFiles,
  isHiddenUploadFile,
  removePendingEventMediaItem,
  removePendingEventVendor,
  shouldOpenUploadPickerFromTray,
  shouldShowEventsBrowseWorkflow,
  upsertPendingEventVendor,
  validatePendingEventDetails,
  type PendingEventDetails,
  type PendingEventDetailsValidation,
  type PendingEventMediaItem,
} from '@/lib/local-fireova-event-upload'
import { deleteEventFromCloud, loadEventFromCloud, saveEventToCloud } from '@/lib/shared-fireova-events'
import { createCloudEventWithMedia } from '@/lib/cloud-event-creation'
import {
  deleteLocalEvent,
  FIREOVA_EVENTS_CHANGED_EVENT,
  getEventCoverMedia,
  getEventTypeLabel,
  readLocalEvent,
  readLocalEvents,
  saveLocalEvent,
  readLocalGeneratedPosts,
  FIREOVA_EVENT_TYPES,
  type LocalFireovaEvent,
  type LocalEventMetadataUpdate,
  type LocalEventVendor,
  type LocalEventVendorCategory,
} from '@/lib/local-fireova-events'
import {
  canSaveSimplifiedVendor,
  filterVendorDirectoryEntries,
  formatInstagramHandle,
  getVendorCategoryOptions,
  normalizeInstagramHandle,
  readLocalVendors,
  syncEventVenueWithDirectory,
  type FireovaVendor,
} from '@/lib/local-fireova-vendors'
import { getSavedVenueOptions, searchSavedVenues, type SavedVenueOption } from '@/lib/local-fireova-venues'

const EVENT_TYPE_OPTIONS = ['All Types', ...FIREOVA_EVENT_TYPES] as const
const EVENT_UPLOAD_INPUT_ID = 'event-upload-input'
const EVENT_FOLDER_UPLOAD_INPUT_ID = 'event-folder-upload-input'
const EVENT_REVIEW_PROGRESS_MESSAGES = [
  'Organizing your event...',
  'Preparing your photos and videos',
] as const
const PENDING_MEDIA_PREVIEW_LIMIT = 16
type EventTypeFilter = typeof EVENT_TYPE_OPTIONS[number]
type UploadPrepState = 'idle' | 'preparing' | 'error'
type PendingVendorForm = {
  category: LocalEventVendorCategory
  instagram: string
  notes: string
  vendorId?: string
  businessName?: string
}

const EMPTY_PENDING_VENDOR_FORM: PendingVendorForm = {
  category: 'Other',
  instagram: '',
  notes: '',
}

export default function EventsPage() {
  const router = useRouter()
  const [localEvents, setLocalEvents] = useState<LocalFireovaEvent[]>([])
  const [openMenuEventId, setOpenMenuEventId] = useState<string | null>(null)
  const [eventToDelete, setEventToDelete] = useState<LocalFireovaEvent | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>('All Types')
  const [uploadDragActive, setUploadDragActive] = useState(false)
  const [uploadPrepState, setUploadPrepState] = useState<UploadPrepState>('idle')
  const [uploadPrepMessage, setUploadPrepMessage] = useState('')
  const [createEventError, setCreateEventError] = useState('')
  const [additionFeedback, setAdditionFeedback] = useState<{ message: string; visible: boolean } | null>(null)
  const [pendingMediaItems, setPendingMediaItems] = useState<PendingEventMediaItem[]>([])
  const [selectedPendingMediaId, setSelectedPendingMediaId] = useState<string | null>(null)
  const [pendingEventDetails, setPendingEventDetails] = useState<PendingEventDetails>(DEFAULT_PENDING_EVENT_DETAILS)
  const [pendingEventDetailErrors, setPendingEventDetailErrors] = useState<PendingEventDetailsValidation>({})
  const [pendingEventDateTouched, setPendingEventDateTouched] = useState(false)
  const [pendingVendorDrawerOpen, setPendingVendorDrawerOpen] = useState(false)
  const [editingPendingVendorId, setEditingPendingVendorId] = useState<string | null>(null)
  const [pendingVendorForm, setPendingVendorForm] = useState<PendingVendorForm>(EMPTY_PENDING_VENDOR_FORM)
  const [vendorDirectory, setVendorDirectory] = useState<FireovaVendor[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const uploadZoneRef = useRef<HTMLDivElement | null>(null)
  const lastUploadFilesRef = useRef<File[]>([])
  const uploadDragDepthRef = useRef(0)
  const creatingEventRef = useRef(false)
  const autoSavedEventIdRef = useRef<string | null>(null)
  const cloudCreationKeyRef = useRef<string | null>(null)
  const cloudEventPromiseRef = useRef<Promise<LocalFireovaEvent> | null>(null)
  const pendingInlineSaveRef = useRef<Promise<LocalFireovaEvent> | null>(null)
  const pendingMediaItemsRef = useRef<PendingEventMediaItem[]>([])
  const pendingEventDetailsRef = useRef<PendingEventDetails>(DEFAULT_PENDING_EVENT_DETAILS)
  const additionFeedbackTimersRef = useRef<number[]>([])
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchContainerRef = useRef<HTMLDivElement | null>(null)
  const mobileSearchContainerRef = useRef<HTMLDivElement | null>(null)
  const events = localEvents
  const visibleEvents = useMemo(() => filterEvents(events, query, eventTypeFilter), [eventTypeFilter, events, query])
  const pendingSummary = useMemo(() => getPendingEventMediaSummary(pendingMediaItems), [pendingMediaItems])
  const savedVenueOptions = useMemo(
    () => getSavedVenueOptions(localEvents, vendorDirectory),
    [localEvents, vendorDirectory]
  )
  const pendingVenuePreview = getPendingVenuePreview(pendingEventDetails)
  const pendingNonVenueVendors = getPendingNonVenueVendors(pendingEventDetails)

  useEffect(() => {
    setLocalEvents(readLocalEvents())
    setVendorDirectory(readLocalVendors())
    if (new URLSearchParams(window.location.search).get('deleted') === '1') {
      setSuccessMessage('Event deleted.')
    }
  }, [])

  useEffect(() => {
    const refreshEvents = () => setLocalEvents(readLocalEvents())
    window.addEventListener(FIREOVA_EVENTS_CHANGED_EVENT, refreshEvents)
    return () => window.removeEventListener(FIREOVA_EVENTS_CHANGED_EVENT, refreshEvents)
  }, [])

  useEffect(() => {
    if (pendingMediaItems.length === 0) {
      setSelectedPendingMediaId(null)
      return
    }
    if (!selectedPendingMediaId || !pendingMediaItems.some((item) => item.id === selectedPendingMediaId)) {
      setSelectedPendingMediaId(pendingMediaItems[0].id)
    }
  }, [pendingMediaItems, selectedPendingMediaId])

  useEffect(() => {
    pendingMediaItemsRef.current = pendingMediaItems
  }, [pendingMediaItems])

  useEffect(() => {
    pendingEventDetailsRef.current = pendingEventDetails
  }, [pendingEventDetails])

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
    folderInputRef.current?.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    function preventPageFileDrop(event: DragEvent) {
      if (!hasDraggedFiles(event.dataTransfer)) return

      event.preventDefault()
      event.dataTransfer!.dropEffect = 'copy'
      setUploadDragActive(isPointerInsideElement(event, uploadZoneRef.current))
    }

    function handlePageDrop(event: DragEvent) {
      if (!hasDraggedFiles(event.dataTransfer)) return

      event.preventDefault()
      uploadDragDepthRef.current = 0
      setUploadDragActive(false)

      if (isPointerInsideElement(event, uploadZoneRef.current)) return

      setUploadPrepState('error')
      setUploadPrepMessage('Drop files on the Upload Event panel to start a new event.')
    }

    window.addEventListener('dragover', preventPageFileDrop, true)
    window.addEventListener('drop', handlePageDrop, true)

    return () => {
      window.removeEventListener('dragover', preventPageFileDrop, true)
      window.removeEventListener('drop', handlePageDrop, true)
    }
  }, [])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    return () => {
      additionFeedbackTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  useEffect(() => {
    if (!searchOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSearchOpen(false)
    }

    function handlePointerDown(event: PointerEvent) {
      if (!searchContainerRef.current?.contains(event.target as Node) && !mobileSearchContainerRef.current?.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [searchOpen])

  function requestDelete(event: LocalFireovaEvent) {
    setOpenMenuEventId(null)
    setEventToDelete(event)
  }

  async function confirmDelete() {
    if (!eventToDelete) return

    try {
      await deleteEventFromCloud(eventToDelete.id)
    } catch (error) {
      setCreateEventError(error instanceof Error ? error.message : 'The event could not be deleted.')
      return
    }
    deleteLocalEvent(eventToDelete.id)
    const safeToDelete = eventToDelete.media
      .map(getStoredMediaId)
      .filter((id): id is string => Boolean(id))
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .filter((id) => !isMediaIdReferencedElsewhere(id))
    await deleteIndexedDbMediaByIds(safeToDelete)
    setLocalEvents((currentEvents) => currentEvents.filter((event) => event.id !== eventToDelete.id))
    setEventToDelete(null)
    setSuccessMessage('Event deleted.')
  }

  function clearFilters() {
    setQuery('')
    setEventTypeFilter('All Types')
  }

  function collectPendingMedia(files: File[]) {
    lastUploadFilesRef.current = files
    const visibleFiles = files.filter((file) => !isHiddenUploadFile(file))
    if (visibleFiles.length > 0) setSuccessMessage('')
    if (visibleFiles.length === 0) {
      setUploadPrepState('error')
      setUploadPrepMessage('No supported photos or videos found. Try JPEG, PNG, WebP, HEIC, MP4, or MOV files.')
      return null
    }

    const result = collectPendingEventMedia(pendingMediaItems, visibleFiles)
    const currentSignatures = new Set(pendingMediaItems.map((item) => item.signature))
    const addedItems = result.items.filter((item) => !currentSignatures.has(item.signature))
    const nextDetails = getPendingEventDetailsWithMediaDate(pendingEventDetails, result.items, pendingEventDateTouched)
    setPendingMediaItems(result.items)
    setPendingEventDetails(nextDetails)
    setUploadPrepState('idle')
    setUploadPrepMessage(result.duplicateCount > 0 ? `${result.duplicateCount} duplicate item${result.duplicateCount === 1 ? '' : 's'} skipped.` : '')
    setPendingEventDetailErrors((currentErrors) => ({ ...currentErrors, media: undefined }))
    showAdditionFeedback(addedItems)
    debugEventUpload('pending event batch updated', {
      added: result.addedCount,
      duplicates: result.duplicateCount,
      total: result.items.length,
    })
    return { items: result.items, details: nextDetails }
  }

  async function handleUploadInput(files: FileList | null) {
    if (!files || files.length === 0) return
    const batch = collectPendingMedia(Array.from(files).filter((file) => !isHiddenUploadFile(file)))
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
    if (batch) await continueWithPendingBatch(batch.items, batch.details)
  }

  async function handleUploadDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    debugEventUpload('drop fired', getDataTransferDebug(event.dataTransfer))
    uploadDragDepthRef.current = 0
    setUploadDragActive(false)

    const files = await collectDroppedMediaFiles(event.dataTransfer)
    debugEventUpload('files collected from drop', files.length)
    const batch = collectPendingMedia(files)
    if (batch) await continueWithPendingBatch(batch.items, batch.details)
  }

  function setFolderInputElement(element: HTMLInputElement | null) {
    folderInputRef.current = element
    element?.setAttribute('webkitdirectory', '')
    element?.setAttribute('directory', '')
  }

  function openFilePickerFromZone(event: ReactMouseEvent<HTMLDivElement>) {
    if (!shouldOpenUploadPickerFromTray({
      activeBatch,
      preparing: uploadPrepState === 'preparing',
      interactiveTarget: isInteractiveUploadControl(event.target),
    })) return

    fileInputRef.current?.click()
  }

  function openUploadInputFromKeyboard(event: ReactKeyboardEvent, input: HTMLInputElement | null) {
    if (uploadPrepState === 'preparing') return
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    event.stopPropagation()
    input?.click()
  }

  async function continueWithPendingBatch(
    mediaItems = pendingMediaItems,
    eventDetails = pendingEventDetails
  ) {
    if (uploadPrepState === 'preparing' || creatingEventRef.current) return

    setCreateEventError('')

    const validationErrors = validatePendingEventDetails(mediaItems, eventDetails)
    setPendingEventDetailErrors(validationErrors)
    if (hasPendingEventDetailErrors(validationErrors)) {
      setUploadPrepState('error')
      const validationMessage = validationErrors.media ?? 'Check the event details before creating this event.'
      setUploadPrepMessage(validationMessage)
      setCreateEventError(validationMessage)
      return
    }

    setUploadPrepState('preparing')
    setUploadPrepMessage('Creating event...')
    creatingEventRef.current = true

    try {
      const confirmedEvent = await ensurePendingCloudEvent(mediaItems, eventDetails)
      if (pendingInlineSaveRef.current) await pendingInlineSaveRef.current
      setUploadPrepMessage('Opening saved event...')
      await waitForReviewTransition()
      if (pendingInlineSaveRef.current) await pendingInlineSaveRef.current
      const reloadedEvent = await loadEventFromCloud(confirmedEvent.id)
      saveLocalEvent(reloadedEvent)
      router.replace(`/events/${reloadedEvent.id}`)
    } catch (error) {
      console.error('[Fireova Create Event] CREATE_EVENT_FAILED', error)
      const errorMessage = error instanceof Error && error.message
        ? error.message
        : getDraftEventCreationErrorMessage(error)
      setUploadPrepState('error')
      setUploadPrepMessage(errorMessage)
      setCreateEventError(errorMessage)
      creatingEventRef.current = false
    }
  }

  function ensurePendingCloudEvent(
    mediaItems = pendingMediaItemsRef.current,
    eventDetails = pendingEventDetailsRef.current
  ) {
    const eventId = autoSavedEventIdRef.current
    if (eventId) return loadEventFromCloud(eventId)
    if (cloudEventPromiseRef.current) return cloudEventPromiseRef.current

    const creationKey = cloudCreationKeyRef.current ?? crypto.randomUUID()
    cloudCreationKeyRef.current = creationKey
    const request = createCloudEventWithMedia({
      creationKey,
      items: mediaItems,
      details: eventDetails,
      onProgress: ({ stage, completed, total, fileName }) => {
        if (stage === 'starting') setUploadPrepMessage('Creating event in Fireova Cloud...')
        else if (stage === 'uploading') setUploadPrepMessage(`Uploading ${fileName ?? 'media'} (${completed + 1} of ${total})...`)
        else setUploadPrepMessage('Confirming event and media in Fireova Cloud...')
      },
    }).then((confirmedEvent) => {
      saveLocalEvent(confirmedEvent)
      autoSavedEventIdRef.current = confirmedEvent.id
      setLocalEvents(readLocalEvents())
      return confirmedEvent
    })
    cloudEventPromiseRef.current = request
    void request.finally(() => {
      if (cloudEventPromiseRef.current === request) cloudEventPromiseRef.current = null
    }).catch(() => undefined)
    return request
  }

  async function savePendingEventMetadataToCloud(updates: Partial<LocalEventMetadataUpdate>) {
    const pendingUpdates: Partial<PendingEventDetails> = {}
    if (typeof updates.name === 'string') pendingUpdates.name = updates.name
    if (typeof updates.type === 'string') pendingUpdates.type = updates.type as PendingEventDetails['type']
    if (typeof updates.date === 'string') {
      pendingUpdates.date = updates.date
      setPendingEventDateTouched(true)
    }
    if ('venueName' in updates) pendingUpdates.venueName = updates.venueName
    if ('venueInstagram' in updates) pendingUpdates.venueInstagram = updates.venueInstagram
    if ('venueVendorId' in updates) pendingUpdates.venueVendorId = updates.venueVendorId

    const nextDetails = { ...pendingEventDetailsRef.current, ...pendingUpdates }
    pendingEventDetailsRef.current = nextDetails
    updatePendingEventDetails(pendingUpdates)

    const request = (async () => {
      const createdEvent = await ensurePendingCloudEvent(pendingMediaItemsRef.current, nextDetails)
      const currentCloudEvent = await loadEventFromCloud(createdEvent.id)
      const updatedEvent: LocalFireovaEvent = {
        ...currentCloudEvent,
        ...updates,
        id: currentCloudEvent.id,
        media: currentCloudEvent.media,
        cover: currentCloudEvent.cover,
        createdAt: currentCloudEvent.createdAt,
        updatedAt: new Date().toISOString(),
      }
      const savedEvent = await saveEventToCloud(updatedEvent)
      if (savedEvent.id !== currentCloudEvent.id) {
        throw new Error('Fireova Cloud returned a different event while saving.')
      }
      const confirmedEvent = await loadEventFromCloud(currentCloudEvent.id)
      if (confirmedEvent.id !== currentCloudEvent.id) {
        throw new Error('The saved event UUID could not be confirmed.')
      }
      saveLocalEvent(confirmedEvent)
      autoSavedEventIdRef.current = confirmedEvent.id
      setLocalEvents(readLocalEvents())
      return confirmedEvent
    })()

    pendingInlineSaveRef.current = request
    try {
      return await request
    } finally {
      if (pendingInlineSaveRef.current === request) pendingInlineSaveRef.current = null
    }
  }

  function handleCreateEventClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    void continueWithPendingBatch()
  }

  function clearPendingBatch() {
    if (pendingMediaItems.length > 0 && !window.confirm('Clear all event contents?')) return
    const autoSavedEventId = autoSavedEventIdRef.current
    const autoSavedEvent = autoSavedEventId ? readLocalEvent(autoSavedEventId) : null
    if (autoSavedEvent) {
      deleteLocalEvent(autoSavedEvent.id)
      void deleteEventFromCloud(autoSavedEvent.id).catch((error) => {
        console.error('[Fireova Create Event] CLEAR_CLOUD_EVENT_FAILED', error)
      })
      const autoSavedMediaIds = autoSavedEvent.media.map(getStoredMediaId).filter((id): id is string => Boolean(id))
      void deleteIndexedDbMediaByIds(autoSavedMediaIds)
      setLocalEvents(readLocalEvents())
    }
    autoSavedEventIdRef.current = null
    cloudEventPromiseRef.current = null
    pendingInlineSaveRef.current = null
    cloudCreationKeyRef.current = null
    const shouldClearDetails = window.confirm('Clear the event details, venue, and vendors too?')
    setPendingMediaItems(clearPendingEventMediaBatch())
    if (shouldClearDetails) {
      setPendingEventDetails(DEFAULT_PENDING_EVENT_DETAILS)
      setPendingVendorDrawerOpen(false)
      setEditingPendingVendorId(null)
      setPendingVendorForm(EMPTY_PENDING_VENDOR_FORM)
      setPendingEventDateTouched(false)
      setPendingEventDetailErrors({})
    } else {
      setPendingEventDetailErrors((currentErrors) => ({ ...currentErrors, media: undefined }))
    }
    setUploadPrepState('idle')
    setUploadPrepMessage('')
  }

  function openPendingVendorDrawer(vendor?: LocalEventVendor) {
    setEditingPendingVendorId(vendor?.id ?? null)
    setPendingVendorForm(vendor ? {
      category: vendor.category,
      instagram: vendor.instagramOverride ?? vendor.instagramHandle ?? '',
      notes: vendor.notes ?? '',
      vendorId: vendor.vendorId,
      businessName: vendor.businessName,
    } : EMPTY_PENDING_VENDOR_FORM)
    setPendingVendorDrawerOpen(true)
  }

  function savePendingVendor() {
    if (!canSaveSimplifiedVendor(pendingVendorForm.instagram)) return false
    if (pendingVendorForm.category === 'Venue') return false

    const instagramHandle = normalizeInstagramHandle(pendingVendorForm.instagram) ?? ''
    const vendor: LocalEventVendor = {
      id: editingPendingVendorId ?? `pending-event-vendor-${Date.now()}-${crypto.randomUUID()}`,
      vendorId: pendingVendorForm.vendorId,
      category: pendingVendorForm.category,
      businessName: pendingVendorForm.businessName ?? (!pendingVendorForm.vendorId ? `@${instagramHandle}` : undefined),
      instagramHandle: pendingVendorForm.vendorId ? undefined : instagramHandle,
      instagramOverride: pendingVendorForm.vendorId ? instagramHandle : undefined,
      notes: pendingVendorForm.notes.trim() || undefined,
    }
    return commitPendingVendor(vendor, editingPendingVendorId ?? undefined)
  }

  function commitPendingVendor(vendor: LocalEventVendor, ignoredVendorId?: string) {
    const currentVendors = pendingEventDetails.vendors ?? []
    if (vendor.category === 'Venue' || hasPendingEventVendorDuplicate(currentVendors, vendor, ignoredVendorId)) return false
    updatePendingEventDetails({ vendors: upsertPendingEventVendor(currentVendors, vendor) })
    setPendingVendorDrawerOpen(false)
    setEditingPendingVendorId(null)
    setPendingVendorForm(EMPTY_PENDING_VENDOR_FORM)
    return true
  }

  function quickAddSavedVendor(vendor: FireovaVendor) {
    const instagramHandle = normalizeInstagramHandle(vendor.instagramHandle)
    if (!instagramHandle || vendor.category === 'Venue') return false
    return commitPendingVendor({
      id: `pending-event-vendor-${Date.now()}-${crypto.randomUUID()}`,
      vendorId: vendor.id,
      category: vendor.category,
      businessName: vendor.businessName,
      instagramOverride: instagramHandle,
      notes: vendor.notes,
    })
  }

  function quickAddNewVendor(category: LocalEventVendorCategory, instagram: string) {
    const instagramHandle = normalizeInstagramHandle(instagram)
    if (!instagramHandle || category === 'Venue') return false
    return commitPendingVendor({
      id: `pending-event-vendor-${Date.now()}-${crypto.randomUUID()}`,
      category,
      businessName: `@${instagramHandle}`,
      instagramHandle,
    })
  }

  function removePendingVendor(vendorId: string) {
    updatePendingEventDetails({
      vendors: removePendingEventVendor(pendingEventDetails.vendors ?? [], vendorId),
    })
  }

  function showAdditionFeedback(addedItems: PendingEventMediaItem[]) {
    if (addedItems.length === 0) return

    additionFeedbackTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    const photos = addedItems.filter((item) => item.kind === 'photo').length
    const videos = addedItems.filter((item) => item.kind === 'video').length
    const message = formatAddedMediaFeedback(photos, videos)
    setAdditionFeedback({ message, visible: true })

    const fadeTimer = window.setTimeout(() => {
      setAdditionFeedback((currentFeedback) => currentFeedback ? { ...currentFeedback, visible: false } : null)
    }, 1800)
    const clearTimer = window.setTimeout(() => {
      setAdditionFeedback(null)
    }, 2200)
    additionFeedbackTimersRef.current = [fadeTimer, clearTimer]
  }

  function removePendingItem(id: string) {
    setPendingMediaItems((currentItems) => removePendingEventMediaItem(currentItems, id))
    setPendingEventDetailErrors((currentErrors) => ({ ...currentErrors, media: undefined }))
    setUploadPrepState('idle')
    setUploadPrepMessage('')
  }

  function updatePendingEventDetails(updates: Partial<PendingEventDetails>) {
    setPendingEventDetails((currentDetails) => {
      const nextDetails = { ...currentDetails, ...updates }
      pendingEventDetailsRef.current = nextDetails
      return nextDetails
    })
    setPendingEventDetailErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      Object.keys(updates).forEach((key) => {
        delete nextErrors[key as keyof PendingEventDetails]
      })
      return nextErrors
    })
    if (uploadPrepState === 'error') {
      setUploadPrepState('idle')
      setUploadPrepMessage('')
    }
  }

  const activeBatch = pendingSummary.total > 0
  const showBrowseWorkflow = shouldShowEventsBrowseWorkflow(activeBatch)
  const visiblePendingItems = pendingMediaItems.slice(0, PENDING_MEDIA_PREVIEW_LIMIT)
  const primaryPendingItem = visiblePendingItems.find((item) => item.id === selectedPendingMediaId) ?? visiblePendingItems[0]
  const visibleAdditionalPendingItems = visiblePendingItems.filter((item) => item.id !== primaryPendingItem?.id)
  const compactMediaPreview = pendingSummary.total > 6

  return (
    <div className="min-h-full bg-white pb-28 sm:pb-10">
      <style jsx global>{`
        @media (prefers-reduced-motion: no-preference) {
          .pending-media-card {
            animation: pendingMediaCardIn 180ms ease-out both;
          }

          @keyframes pendingMediaCardIn {
            from {
              opacity: 0.72;
              transform: scale(0.985);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        }
      `}</style>
      <div className={`px-4 pb-2 md:px-8 md:pb-3 ${activeBatch ? 'pt-2 md:pt-4' : 'pt-3 md:pt-8'}`}>
        <div className={`mx-auto ${activeBatch ? 'max-w-7xl' : 'max-w-7xl space-y-3 md:space-y-5'}`}>
          {!activeBatch && (
            <div>
              <h1 className="text-[28px] font-semibold leading-tight text-stone-950 md:text-4xl">Events</h1>
              <p className="mt-1.5 max-w-xl text-sm leading-5 text-stone-500 md:mt-3 md:text-[15px] md:leading-6">
                Organize event albums and turn them into content.
              </p>
            </div>
          )}

          <section>
            <div
              ref={uploadZoneRef}
              role={activeBatch ? undefined : 'button'}
              tabIndex={activeBatch ? -1 : 0}
              onClick={openFilePickerFromZone}
              onKeyDown={(event) => {
                if (activeBatch || isInteractiveUploadControl(event.target)) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (uploadPrepState !== 'preparing') fileInputRef.current?.click()
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'copy'
                uploadDragDepthRef.current += 1
                debugEventUpload('dragenter fired', getDataTransferDebug(event.dataTransfer))
                setUploadDragActive(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'copy'
                debugEventUpload('dragover fired', getDataTransferDebug(event.dataTransfer))
                setUploadDragActive(true)
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                event.stopPropagation()
                uploadDragDepthRef.current = Math.max(0, uploadDragDepthRef.current - 1)
                if (uploadDragDepthRef.current === 0) {
                  setUploadDragActive(false)
                }
              }}
              onDrop={handleUploadDrop}
              className={`block border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 ${
                uploadDragActive
                  ? 'rounded-xl border-ember-400 bg-ember-50 p-4 text-stone-950 shadow-[0_16px_48px_rgba(234,88,12,0.10)] sm:p-5'
                  : activeBatch
                    ? 'rounded-xl border-stone-200 bg-white p-6 text-stone-800 shadow-[0_8px_24px_rgba(28,25,23,0.05)] sm:px-5 sm:py-7'
                    : 'cursor-pointer rounded-lg border-dashed border-stone-300 bg-stone-50 p-4 text-stone-800 hover:border-stone-400 hover:bg-stone-100/70 md:p-6'
              }`}
              aria-label="Upload Event"
              aria-describedby="event-upload-help"
            >
              <input
                id={EVENT_UPLOAD_INPUT_ID}
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.heic,.heif,.mov,.m4v"
                multiple
                className="sr-only"
                onClick={(event) => { event.currentTarget.value = '' }}
                onChange={(event) => void handleUploadInput(event.target.files)}
              />
              <input
                id={EVENT_FOLDER_UPLOAD_INPUT_ID}
                ref={setFolderInputElement}
                type="file"
                accept="image/*,video/*,.heic,.heif,.mov,.m4v"
                multiple
                className="sr-only"
                onChange={(event) => void handleUploadInput(event.target.files)}
              />
              {!activeBatch && <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`flex shrink-0 items-center justify-center rounded-lg ${activeBatch ? 'h-8 w-8' : 'h-11 w-11'} ${uploadDragActive ? 'bg-white text-ember-700' : 'bg-white text-stone-700'} ring-1 ring-stone-200`}>
                    <svg className={activeBatch ? 'h-4 w-4' : 'h-5 w-5'} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="inline-flex items-center gap-2 text-base font-semibold text-stone-950 sm:text-lg">
                      {uploadPrepState === 'preparing'
                          ? EVENT_REVIEW_PROGRESS_MESSAGES[0]
                          : uploadDragActive
                            ? 'Drop to add'
                            : 'Upload Event'}
                    </h2>
                    <p className="mt-1 text-sm leading-5 text-stone-500 md:hidden">
                      Add photos and videos from this event
                    </p>
                    <p id="event-upload-help" className="mt-1 hidden text-sm leading-5 text-stone-500 md:block">
                      Drag files here or click anywhere to browse. Build the full event before continuing.
                    </p>
                    <p className="mt-2 hidden text-xs font-semibold text-stone-400 md:block">
                      Photos, videos, folders, and repeat drops supported
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
                    <label
                      htmlFor={EVENT_UPLOAD_INPUT_ID}
                      role="button"
                      tabIndex={uploadPrepState === 'preparing' ? -1 : 0}
                      onClick={(event) => {
                        event.stopPropagation()
                      }}
                      onKeyDown={(event) => openUploadInputFromKeyboard(event, fileInputRef.current)}
                      aria-disabled={uploadPrepState === 'preparing'}
                      className={`flex min-h-11 w-full items-center justify-center rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white ring-1 ring-stone-950 transition hover:bg-stone-800 md:min-h-0 md:w-auto md:bg-white md:px-3 md:text-xs md:text-stone-700 md:ring-stone-200 md:hover:bg-stone-50 ${
                        uploadPrepState === 'preparing' ? 'pointer-events-none cursor-wait opacity-60' : 'cursor-pointer'
                      }`}
                    >
                      <span className="md:hidden">Choose Photos &amp; Videos</span>
                      <span className="hidden md:inline">Add Files</span>
                    </label>
                  </div>
                </div>
              </div>}
              {activeBatch && (
                <div className="grid w-full min-w-0 gap-3 lg:grid-cols-[minmax(0,47fr)_minmax(0,53fr)] lg:items-start lg:gap-x-7">
                  <div className="min-w-0" data-testid="event-review-hero">
                    <div className="flex min-w-0 flex-col gap-2">
                      {primaryPendingItem && (
                        <PendingMediaCard
                          item={primaryPendingItem}
                          disabled={uploadPrepState === 'preparing'}
                          compact={false}
                          hero
                          mediaTypeLabel={primaryPendingItem.kind === 'video' ? 'Video' : 'Photo'}
                          showChangeMedia
                          onRemove={() => removePendingItem(primaryPendingItem.id)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 px-1 py-1 lg:px-0 lg:py-0">
                    <div className="max-w-2xl" data-testid="event-review-summary">
                      <InlineEventDetailsHeader
                        value={{
                          name: pendingEventDetails.name,
                          type: pendingEventDetails.type,
                          date: pendingEventDetails.date,
                          venueName: pendingEventDetails.venueName,
                          venueLocation: '',
                          venueInstagram: pendingEventDetails.venueInstagram,
                          venueVendorId: pendingEventDetails.venueVendorId,
                        }}
                        venues={savedVenueOptions}
                        onSave={savePendingEventMetadataToCloud}
                        dateValueMode="input"
                        nameError={pendingEventDetailErrors.name}
                      />
                    </div>
                  <div
                    className="mt-5 min-w-0"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <div className="min-w-0">
                      <section className="min-w-0 border-t border-stone-200/70 pt-5">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-700">Vendors</h3>
                          <button
                            type="button"
                            disabled={uploadPrepState === 'preparing'}
                            onClick={() => openPendingVendorDrawer()}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 hover:text-stone-950 disabled:opacity-50"
                          >
                            + Add Vendor
                          </button>
                        </div>
                        {(pendingVenuePreview || pendingNonVenueVendors.length > 0) ? (
                          <div className="min-w-0 space-y-0.5" data-testid="pending-vendor-list">
                            {pendingVenuePreview && (
                              <div className="group relative min-w-0" data-testid="pending-venue-vendor-row">
                                <p className="grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] gap-1.5 pr-10 text-[15px] leading-5 text-stone-900 sm:pr-28">
                                  <span className="font-medium text-stone-600">Venue:</span>
                                  <span className="truncate font-semibold">{pendingVenuePreview.instagramHandle}</span>
                                </p>
                                <span className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center sm:flex">
                                  <a href={getInstagramProfileHref(pendingVenuePreview.instagramHandle)} target="_blank" rel="noreferrer" aria-label={`Open ${pendingVenuePreview.instagramHandle} on Instagram`} className="flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-900"><InstagramIcon className="h-4 w-4" /></a>
                                  <button type="button" onClick={() => updatePendingEventDetails({ venueName: '', venueInstagram: '', venueVendorId: undefined })} aria-label="Remove venue" className="flex h-8 w-8 items-center justify-center rounded-md text-red-400 transition hover:bg-red-50 hover:text-red-600"><RemoveIcon className="h-4 w-4" /></button>
                                </span>
                                <details className="absolute right-0 top-1/2 -translate-y-1/2 sm:hidden">
                                  <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-lg leading-none text-stone-400 transition hover:bg-stone-100 hover:text-stone-700" aria-label="Actions for venue">⋯</summary>
                                  <div className="absolute right-0 top-9 z-20 min-w-28 rounded-lg bg-white p-1 shadow-lg ring-1 ring-stone-200">
                                    <button type="button" onClick={() => updatePendingEventDetails({ venueName: '', venueInstagram: '', venueVendorId: undefined })} className="block min-h-9 w-full rounded-md px-3 text-left text-xs font-semibold text-red-500 hover:bg-red-50">Remove</button>
                                  </div>
                                </details>
                              </div>
                            )}
                            {pendingNonVenueVendors.map((vendor) => (
                              <div key={vendor.id} className="group relative min-w-0" data-testid="pending-additional-vendor-row">
                                <p className="grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] gap-1.5 pr-10 text-[15px] leading-5 text-stone-900 sm:pr-28">
                                  <span className="whitespace-nowrap font-medium text-stone-600">{getPendingVendorCategoryLabel(vendor.category)}:</span>
                                  <span className="truncate font-semibold">{formatInstagramHandle(vendor.instagramOverride ?? vendor.instagramHandle)}</span>
                                </p>
                                <span className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center sm:flex">
                                  <a href={getInstagramProfileHref(vendor.instagramOverride ?? vendor.instagramHandle)} target="_blank" rel="noreferrer" aria-label={`Open ${formatInstagramHandle(vendor.instagramOverride ?? vendor.instagramHandle)} on Instagram`} className="flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition hover:bg-stone-100 hover:text-stone-900"><InstagramIcon className="h-4 w-4" /></a>
                                  <button type="button" onClick={() => removePendingVendor(vendor.id)} aria-label={`Remove ${formatInstagramHandle(vendor.instagramOverride ?? vendor.instagramHandle)}`} className="flex h-8 w-8 items-center justify-center rounded-md text-red-400 transition hover:bg-red-50 hover:text-red-600"><RemoveIcon className="h-4 w-4" /></button>
                                </span>
                                <details className="absolute right-0 top-1/2 -translate-y-1/2 sm:hidden">
                                  <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-lg leading-none text-stone-400 transition hover:bg-stone-100 hover:text-stone-700" aria-label={`Actions for ${formatInstagramHandle(vendor.instagramOverride ?? vendor.instagramHandle)}`}>⋯</summary>
                                  <div className="absolute right-0 top-9 z-20 min-w-28 rounded-lg bg-white p-1 shadow-lg ring-1 ring-stone-200">
                                    <button type="button" onClick={() => removePendingVendor(vendor.id)} className="block min-h-9 w-full rounded-md px-3 text-left text-xs font-semibold text-red-500 hover:bg-red-50">Remove</button>
                                  </div>
                                </details>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="py-0.5 text-xs font-medium text-stone-400">No vendors added yet.</p>
                        )}
                      </section>
                    </div>
                    <div className="mt-3 border-t border-stone-200/70 pt-5" data-testid="create-event-action-footer">
                      <button
                        type="button"
                        data-testid="create-event-submit"
                        disabled={uploadPrepState === 'preparing' || creatingEventRef.current}
                        onClick={handleCreateEventClick}
                        aria-describedby={createEventError ? 'create-event-submit-error' : undefined}
                        className="group inline-flex min-h-[54px] w-full items-center justify-center whitespace-nowrap rounded-xl bg-stone-950 px-7 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-stone-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                      >
                        {uploadPrepState === 'preparing' ? 'Creating Content...' : <>✨ Create Content <span className="ml-1.5 inline-block transition-transform duration-200 group-hover:translate-x-1">→</span></>}
                      </button>
                      {createEventError && (
                        <p id="create-event-submit-error" role="alert" className="mt-2 text-xs font-semibold leading-5 text-red-600">{createEventError}</p>
                      )}
                    </div>
                    <section className="mt-4 min-w-0" data-testid="event-media-gallery">
                      {pendingMediaItems.length > 1 && (
                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Event Media</h3>
                      )}
                      <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1" data-testid="event-media-thumbnails">
                        {visibleAdditionalPendingItems.length > 0 && (
                          <div className="inline-flex shrink-0 gap-2">
                            {visibleAdditionalPendingItems.map((item) => (
                              <PendingMediaCard key={item.id} item={item} disabled={uploadPrepState === 'preparing'} compact={compactMediaPreview} onSelect={() => setSelectedPendingMediaId(item.id)} onRemove={() => removePendingItem(item.id)} />
                            ))}
                          </div>
                        )}
                        {pendingMediaItems.length > visiblePendingItems.length && (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-stone-50 px-2 text-center text-[10px] font-semibold text-stone-500 ring-1 ring-stone-100">+{pendingMediaItems.length - visiblePendingItems.length} more</div>
                        )}
                        <label
                          htmlFor={EVENT_UPLOAD_INPUT_ID}
                          role="button"
                          data-testid="add-event-media-tile"
                          tabIndex={uploadPrepState === 'preparing' ? -1 : 0}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => openUploadInputFromKeyboard(event, fileInputRef.current)}
                          aria-disabled={uploadPrepState === 'preparing'}
                          className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 bg-stone-50/60 text-center text-stone-600 transition hover:border-stone-400 hover:bg-stone-50 ${compactMediaPreview ? 'h-16 w-16' : 'h-20 w-20'} ${uploadPrepState === 'preparing' ? 'pointer-events-none cursor-wait opacity-60' : 'cursor-pointer'}`}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                          <span className="text-[10px] font-semibold">Add media</span>
                        </label>
                      </div>
                    </section>
                  </div>
                  </div>
                  {pendingVendorDrawerOpen && (
                    editingPendingVendorId ? <PendingVendorDrawer
                      mode={editingPendingVendorId ? 'edit' : 'add'}
                      form={pendingVendorForm}
                      savedVendors={vendorDirectory}
                      onChange={(updates) => setPendingVendorForm((current) => ({ ...current, ...updates }))}
                      onSave={savePendingVendor}
                      onQuickAddSaved={quickAddSavedVendor}
                      onQuickAddNew={quickAddNewVendor}
                      onClose={() => {
                        setPendingVendorDrawerOpen(false)
                        setEditingPendingVendorId(null)
                        setPendingVendorForm(EMPTY_PENDING_VENDOR_FORM)
                      }}
                    /> : <QuickAddVendorModal
                      directoryVendors={vendorDirectory}
                      onAddSaved={quickAddSavedVendor}
                      onAddNew={quickAddNewVendor}
                      onClose={() => {
                        setPendingVendorDrawerOpen(false)
                        setEditingPendingVendorId(null)
                        setPendingVendorForm(EMPTY_PENDING_VENDOR_FORM)
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            {uploadPrepMessage && uploadPrepState === 'error' && (
              <div className={`mt-4 flex flex-col gap-2 rounded-lg px-3 py-2 text-xs font-semibold ring-1 sm:flex-row sm:items-center sm:justify-between ${
                uploadPrepState === 'error'
                  ? 'bg-red-50 text-red-700 ring-red-100'
                  : 'bg-stone-100 text-stone-700 ring-stone-200'
              }`}>
                <span>{uploadPrepMessage}</span>
                {uploadPrepState === 'error' && lastUploadFilesRef.current.length > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      collectPendingMedia(lastUploadFilesRef.current)
                    }}
                    className="w-fit rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-100"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </section>

          {showBrowseWorkflow && (
            <>
            <section className="space-y-2 md:hidden">
              <div className="flex min-w-0 items-center gap-2">
                <label className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg bg-white px-3 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-stone-950">
                  <span className="sr-only">Event type</span>
                  <select
                    value={eventTypeFilter}
                    onChange={(event) => setEventTypeFilter(event.target.value as EventTypeFilter)}
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold text-stone-950 outline-none"
                    aria-label="Event type filter"
                  >
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option === 'All Types' ? 'All Events' : option}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setSearchOpen((value) => !value)}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ${query ? 'bg-stone-950 text-white ring-stone-950' : 'bg-white text-stone-700 ring-stone-200'}`}
                  aria-label={query ? `Search active: ${query}` : 'Search events'}
                >
                  <svg className="h-5 w-5" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.2-4.2" />
                    <circle cx="11" cy="11" r="6.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((value) => !value)}
                  className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold ring-1 ${filtersOpen ? 'bg-ember-50 text-ember-800 ring-ember-200' : 'bg-white text-stone-700 ring-stone-200'}`}
                >
                  Filter
                </button>
              </div>
              {searchOpen && (
                <div ref={mobileSearchContainerRef} className="flex items-center gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Search Events</span>
                    <input
                      ref={searchInputRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search events..."
                      className="min-h-11 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950"
                    />
                  </label>
                  {query && <button type="button" onClick={() => setQuery('')} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-stone-600 ring-1 ring-stone-200">Clear</button>}
                </div>
              )}
              {filtersOpen && (
                <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-stone-200">
                  <Select label="Event Type" value={eventTypeFilter} onChange={(value) => setEventTypeFilter(value as EventTypeFilter)} options={EVENT_TYPE_OPTIONS} />
                </div>
              )}
            </section>

            <section className="hidden space-y-3 rounded-lg bg-white p-3 ring-1 ring-stone-200 md:block">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEventTypeFilter('All Types')}
                  className={quickFilterButtonClass(eventTypeFilter === 'All Types')}
                  aria-pressed={eventTypeFilter === 'All Types'}
                >
                  All Events
                </button>
                <label className="flex min-h-[42px] w-full items-center gap-2 rounded-lg bg-stone-50 px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-stone-950 sm:w-52">
                  <span className="sr-only">Event type</span>
                  <select
                    value={eventTypeFilter}
                    onChange={(event) => setEventTypeFilter(event.target.value as EventTypeFilter)}
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold text-stone-950 outline-none"
                    aria-label="Event type filter"
                  >
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
                <div ref={searchContainerRef} className="min-w-0 sm:max-w-md sm:flex-1 lg:flex-none">
                  {searchOpen ? (
                    <label className="block">
                      <span className="sr-only">Search Events</span>
                      <input
                        ref={searchInputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search events, venues, dates, vendors..."
                        className="input"
                      />
                    </label>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      className={`inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 sm:w-auto ${
                        query
                          ? 'bg-stone-950 text-white ring-stone-950'
                          : 'bg-stone-50 text-stone-700 ring-stone-200 hover:bg-stone-100'
                      }`}
                      aria-label={query ? `Search active: ${query}` : 'Open search'}
                    >
                      <svg className="h-4 w-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.2-4.2" />
                        <circle cx="11" cy="11" r="6.5" />
                      </svg>
                      <span className="truncate">{query ? `Search: ${query}` : 'Search'}</span>
                    </button>
                  )}
                </div>

                {(query || eventTypeFilter !== 'All Types') && (
                  <button type="button" onClick={clearFilters} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                    Clear
                  </button>
                )}
                <button type="button" onClick={() => setFiltersOpen((value) => !value)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ring-1 ${
                  filtersOpen ? 'bg-ember-50 text-ember-800 ring-ember-200' : 'bg-white text-stone-700 ring-stone-200 hover:bg-stone-50'
                }`}>
                  Filter
                </button>
              </div>
            </div>

            {filtersOpen && (
              <div className="grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select label="Event Type" value={eventTypeFilter} onChange={(value) => setEventTypeFilter(value as EventTypeFilter)} options={EVENT_TYPE_OPTIONS} />
              </div>
            )}
            </section>
            </>
          )}
        </div>
      </div>

      {showBrowseWorkflow && (
        <div className="px-4 pb-3 pt-1 md:px-8 md:py-3">
          <div className="mx-auto max-w-7xl space-y-4">
            {successMessage && !activeBatch && (
              <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
                {successMessage}
              </div>
            )}

            {events.length === 0 ? (
              <EmptyState onUploadClick={() => fileInputRef.current?.click()} />
            ) : visibleEvents.length === 0 ? (
              <section className="rounded-lg bg-stone-50 px-6 py-14 text-center ring-1 ring-stone-100">
                <h2 className="text-xl font-semibold text-stone-950">No events match those filters</h2>
                <p className="mt-2 text-sm text-stone-500">Try clearing search or event type filters.</p>
                <button type="button" onClick={clearFilters} className="mt-5 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">
                  Clear Filters
                </button>
              </section>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                {visibleEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    menuOpen={openMenuEventId === event.id}
                    onToggleMenu={() => setOpenMenuEventId((currentId) => currentId === event.id ? null : event.id)}
                    onDelete={() => requestDelete(event)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {eventToDelete && (
        <DeleteEventDialog
          eventName={eventToDelete.name}
          onCancel={() => setEventToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

    </div>
  )
}

function VenueAutocomplete({
  value,
  venues,
  disabled,
  onChange,
  onSelect,
}: {
  value: string
  venues: SavedVenueOption[]
  disabled: boolean
  onChange: (value: string) => void
  onSelect: (venue: SavedVenueOption) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const matches = searchSavedVenues(venues, value)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  function selectVenue(venue: SavedVenueOption) {
    onSelect(venue)
    setOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <label className="block">
        <span className="sr-only">Venue Name</span>
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="venue-autocomplete-results"
          value={value}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              return
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setActiveIndex((index) => Math.min(index + 1, matches.length - 1))
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => Math.max(index - 1, 0))
              return
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault()
              if (activeIndex >= 0 && matches[activeIndex]) selectVenue(matches[activeIndex])
              else setOpen(false)
            }
          }}
          placeholder="Venue Name"
          className="min-h-[38px] w-full rounded-lg bg-white px-3 text-sm font-medium text-stone-950 ring-1 ring-stone-200 outline-none transition placeholder:text-stone-400 focus:ring-2 focus:ring-stone-950 disabled:bg-stone-100"
        />
      </label>
      {open && (
        <div id="venue-autocomplete-results" role="listbox" className="absolute left-0 right-0 top-[42px] z-30 max-h-60 overflow-y-auto rounded-xl bg-white p-1.5 shadow-[0_16px_40px_rgba(28,25,23,0.14)] ring-1 ring-stone-200">
          {matches.length > 0 ? matches.map((venue, index) => (
            <button
              key={`${venue.name}-${venue.instagram ?? ''}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectVenue(venue)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${index === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
            >
              <span className="min-w-0 truncate text-sm font-semibold text-stone-800">{venue.name}</span>
              {venue.instagram && <span className="shrink-0 text-xs font-medium text-stone-500">{venue.instagram}</span>}
            </button>
          )) : (
            <button type="button" onClick={() => setOpen(false)} className="w-full rounded-lg px-3 py-2 text-left">
              <span className="block text-xs font-medium text-stone-400">No matches</span>
              <span className="mt-0.5 block text-sm font-semibold text-stone-800">Use new venue</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PendingEventTextField({
  label,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  label: string
  placeholder?: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? label}
        className="min-h-[38px] w-full rounded-lg bg-white px-3 text-sm font-medium text-stone-950 ring-1 ring-stone-200 outline-none transition placeholder:text-stone-400 focus:ring-2 focus:ring-stone-950 disabled:bg-stone-100"
      />
    </label>
  )
}

function PendingVendorDrawer({
  mode,
  form,
  savedVendors,
  onChange,
  onSave,
  onQuickAddSaved,
  onQuickAddNew,
  onClose,
}: {
  mode: 'add' | 'edit'
  form: PendingVendorForm
  savedVendors: FireovaVendor[]
  onChange: (updates: Partial<PendingVendorForm>) => void
  onSave: () => boolean
  onQuickAddSaved: (vendor: FireovaVendor) => boolean
  onQuickAddNew: (category: LocalEventVendorCategory, instagram: string) => boolean
  onClose: () => void
}) {
  const searchRef = useRef<HTMLDivElement>(null)
  const quickSearchInputRef = useRef<HTMLInputElement>(null)
  const [vendorSearch, setVendorSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [duplicateNotice, setDuplicateNotice] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newVendorCategory, setNewVendorCategory] = useState<LocalEventVendorCategory>('Other')
  const [newVendorInstagram, setNewVendorInstagram] = useState('')
  const matches = filterVendorDirectoryEntries(savedVendors, vendorSearch)
    .filter((vendor) => vendor.category !== 'Venue')
  const normalizedTypedHandle = formatInstagramHandle(vendorSearch)
  const vendorCategoryOptions = getVendorCategoryOptions(savedVendors).filter((category) => category !== 'Venue')

  useEffect(() => {
    if (mode === 'add') quickSearchInputRef.current?.focus()
  }, [mode])

  function selectSavedVendor(vendor: FireovaVendor) {
    if (!onQuickAddSaved(vendor)) {
      setDuplicateNotice('This vendor is already added to this event.')
    }
  }

  function beginNewVendor() {
    const instagram = normalizedTypedHandle ?? (vendorSearch.trim().startsWith('@') ? vendorSearch.trim() : '')
    setNewVendorInstagram(instagram)
    setCreatingNew(true)
    setActiveIndex(-1)
    setDuplicateNotice('')
  }

  function addNewVendor() {
    if (!onQuickAddNew(newVendorCategory, newVendorInstagram)) {
      setDuplicateNotice('Enter a valid Instagram handle that is not already added.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pending-vendor-drawer-title">
      <button type="button" aria-label="Close Add Vendor modal" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/30 backdrop-blur-[1px]" />
      <section className="relative z-10 flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_90px_rgba(28,25,23,0.28)] ring-1 ring-stone-200 sm:max-h-[70vh] sm:rounded-2xl">
        <div className="border-b border-stone-100 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="pending-vendor-drawer-title" className="text-xl font-semibold text-stone-950">{mode === 'edit' ? 'Edit Vendor' : 'Add Vendor'}</h2>
            <button type="button" onClick={onClose} aria-label="Close Add Vendor" className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-lg leading-none text-stone-500 hover:bg-stone-200 hover:text-stone-900">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {mode === 'add' ? (
            <div ref={searchRef} className="space-y-3">
              <label className="block">
                <span className="sr-only">Search vendors</span>
              <input
                ref={quickSearchInputRef}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={Boolean(vendorSearch.trim()) && !creatingNew}
                aria-controls="vendor-directory-results"
                value={vendorSearch}
                onChange={(event) => {
                  setVendorSearch(event.target.value)
                  setCreatingNew(false)
                  setActiveIndex(-1)
                  setDuplicateNotice('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    onClose()
                    return
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActiveIndex((index) => Math.min(index + 1, matches.length - 1))
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActiveIndex((index) => Math.max(index - 1, 0))
                    return
                  }
                  if (event.key === 'Enter' && vendorSearch.trim()) {
                    event.preventDefault()
                    if (activeIndex >= 0 && matches[activeIndex]) selectSavedVendor(matches[activeIndex])
                    else if (matches.length === 1) selectSavedVendor(matches[0])
                    else if (matches.length === 0) beginNewVendor()
                  }
                }}
                placeholder="Search vendors by name, category, or @handle"
                className="min-h-[46px] w-full rounded-lg bg-white px-3 text-sm font-semibold text-stone-950 ring-1 ring-stone-200 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-stone-950"
              />
              </label>
              {!vendorSearch.trim() && !creatingNew && (
                <div className="flex items-center justify-between gap-3 py-1">
                  <p className="text-sm font-medium text-stone-400">Search your Vendor Directory</p>
                  <button type="button" onClick={beginNewVendor} className="shrink-0 rounded-md px-2 py-1.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-stone-950">+ Create new vendor</button>
                </div>
              )}
              {vendorSearch.trim() && !creatingNew && (
                <div id="vendor-directory-results" role="listbox" className="max-h-[min(420px,55vh)] overflow-y-auto rounded-lg ring-1 ring-stone-200">
                  {matches.length > 0 ? matches.map((vendor, index) => (
                  <button
                    key={vendor.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => selectSavedVendor(vendor)}
                    className={`block min-h-11 w-full border-b border-stone-100 px-3 py-2.5 text-left text-sm last:border-b-0 ${index === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
                  >
                    <span className="font-semibold text-stone-800">{getPendingVendorCategoryLabel(vendor.category)}</span>
                    <span className="text-stone-400"> · </span>
                    <span className="font-semibold text-stone-950">{formatInstagramHandle(vendor.instagramHandle) ?? vendor.businessName}</span>
                  </button>
                  )) : (
                  <button type="button" onClick={beginNewVendor} className="min-h-11 w-full px-3 py-2.5 text-left text-sm font-semibold text-stone-800 hover:bg-stone-50">
                    Add new vendor: {normalizedTypedHandle ?? vendorSearch.trim()}
                  </button>
                  )}
                </div>
              )}
              {creatingNew && (
                <div className="grid gap-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
                  <label className="block">
                    <span className="text-xs font-semibold text-stone-500">Category</span>
                    <select value={newVendorCategory} onChange={(event) => setNewVendorCategory(event.target.value as LocalEventVendorCategory)} className="mt-1 min-h-10 w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950">
                      {vendorCategoryOptions.map((category) => <option key={category} value={category}>{getPendingVendorCategoryLabel(category)}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-stone-500">Instagram</span>
                    <input value={newVendorInstagram} onChange={(event) => { setNewVendorInstagram(event.target.value); setDuplicateNotice('') }} placeholder="@username" className="mt-1 min-h-10 w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950" />
                  </label>
                  <button type="button" disabled={!canSaveSimplifiedVendor(newVendorInstagram)} onClick={addNewVendor} className="justify-self-start rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50">Add Vendor</button>
                </div>
              )}
              {duplicateNotice && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{duplicateNotice}</p>}
            </div>
          ) : (
            <div className="space-y-3.5">
              <label className="block"><span className="text-xs font-semibold text-stone-500">Category</span><select value={form.category} onChange={(event) => onChange({ category: event.target.value as LocalEventVendorCategory })} className="mt-1 min-h-[44px] w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950">{vendorCategoryOptions.map((category) => <option key={category} value={category}>{getPendingVendorCategoryLabel(category)}</option>)}</select></label>
              <label className="block"><span className="text-xs font-semibold text-stone-500">Instagram</span><input value={form.instagram} onChange={(event) => onChange({ instagram: event.target.value })} className="mt-1 min-h-[44px] w-full rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950" /></label>
              <label className="block"><span className="text-xs font-semibold text-stone-500">Notes (Optional)</span><textarea value={form.notes} onChange={(event) => onChange({ notes: event.target.value })} className="mt-1 min-h-[100px] w-full resize-none rounded-lg bg-white px-3 py-3 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-stone-950" /></label>
              {duplicateNotice && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{duplicateNotice}</p>}
              <button type="button" onClick={() => { if (!onSave()) setDuplicateNotice('This vendor is already added to this event.') }} disabled={!canSaveSimplifiedVendor(form.instagram)} className="rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Done</button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function getPendingVendorCategoryLabel(category: LocalEventVendorCategory) {
  return category === 'Bakery' ? 'Cake' : category
}

function EventCard({
  event,
  menuOpen,
  onToggleMenu,
  onDelete,
}: {
  event: LocalFireovaEvent
  menuOpen: boolean
  onToggleMenu: () => void
  onDelete: () => void
}) {
  const drafts = readLocalGeneratedPosts(event.id)
  const cover = getEventCoverMedia(event, drafts)
  const eventType = getEventTypeLabel(event.type)

  return (
    <article className="group relative overflow-visible rounded-lg bg-white ring-1 ring-stone-200 transition hover:ring-stone-300">
      <Link
        href={`/events/${event.id}`}
        className="block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950"
        aria-label={`Open event ${event.name}`}
      >
        <div className="aspect-[4/3] overflow-hidden bg-stone-100">
          {cover ? (
            <LocalMedia media={cover} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" controls={cover.type === 'video'} muted />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-stone-100 text-3xl font-semibold text-stone-300">
              {getEventInitials(event.name)}
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-2 p-2 sm:gap-3 sm:p-3">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold leading-4 text-stone-950 sm:text-[15px] sm:leading-5">{event.name}</h2>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-stone-500 sm:mt-1 sm:text-xs">{eventType} · {event.date}</p>
          </div>
          <span className="shrink-0 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-stone-700" aria-hidden="true">→</span>
        </div>
      </Link>

      <div className="absolute right-1.5 top-1.5 z-10 sm:right-2 sm:top-2">
        <button
          type="button"
          onClick={onToggleMenu}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-stone-700 shadow-sm ring-1 ring-stone-200 backdrop-blur transition-colors hover:bg-stone-50 md:h-8 md:w-8"
          aria-label={`More actions for ${event.name}`}
        >
          <DotsIcon className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-10 w-44 overflow-hidden rounded-lg bg-white shadow-[0_18px_50px_rgba(28,25,23,0.16)] ring-1 ring-stone-200">
            <Link href={`/content-studio?source=event&eventId=${event.id}`} className="block px-4 py-3 text-left text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50">
              Create Content
            </Link>
            <button
              type="button"
              onClick={onDelete}
              className="w-full px-4 py-3 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              Delete Event
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function filterEvents(events: LocalFireovaEvent[], query: string, eventType: EventTypeFilter) {
  const normalizedQuery = query.trim().toLowerCase()

  return events.filter((event) => {
    const normalizedEventType = getEventTypeLabel(event.type)
    if (eventType !== 'All Types' && normalizeSearchValue(normalizedEventType) !== normalizeSearchValue(eventType)) return false
    if (!normalizedQuery) return true

    const haystack = [
      event.name,
      normalizedEventType,
      event.date,
      event.venueName,
      event.venueLocation,
      ...(event.vendors ?? []).flatMap((vendor) => [
        vendor.businessName,
        vendor.instagramHandle,
        vendor.instagramOverride,
        vendor.website,
        vendor.notes,
      ]),
    ].filter(Boolean).join(' ').toLowerCase()

    return haystack.includes(normalizedQuery)
  })
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase()
}

function getEventInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'E'
}

function isPointerInsideElement(event: DragEvent, element: HTMLElement | null) {
  if (!element) return false

  const rect = element.getBoundingClientRect()
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
}

function isInteractiveUploadControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('a,button,input,label,select,textarea'))
}

function getDataTransferDebug(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items ?? [])
  return {
    itemsLength: items.length,
    filesLength: dataTransfer.files?.length ?? 0,
    items: items.map((item) => ({ kind: item.kind, type: item.type })),
  }
}

function getDraftEventCreationErrorMessage(error: unknown) {
  if (error instanceof DraftEventCreationError) {
    if (error.code === 'NO_SUPPORTED_MEDIA') return 'No supported photos or videos found. Add media and try again.'
    if (error.code === 'MEDIA_SAVE_FAILED') return 'This browser could not save that media locally. Try a smaller file or a different browser.'
    if (error.code === 'EVENT_SAVE_FAILED') return 'This event is too large for local storage. Remove a few large videos or photos and try again.'
  }

  if (error instanceof Error && (error.message.includes('was not found after saving') || error.message.includes('did not match the saved event payload'))) {
    return 'The event could not be verified after saving. Your media and event details are still here. Try creating the event again.'
  }

  return 'Could not create the event. Try again or remove a few large videos.'
}

function debugEventUpload(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'development') return
  console.debug('[Fireova event upload]', ...args)
}

function waitForReviewTransition() {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return Promise.resolve()
  }

  return new Promise((resolve) => window.setTimeout(resolve, 350))
}

function formatPendingMediaSummary(summary: { photos: number; videos: number; folders: number }) {
  return [
    formatCount(summary.photos, 'photo'),
    formatCount(summary.videos, 'video'),
    formatCount(summary.folders, 'folder'),
  ].filter(Boolean).join(' · ')
}

function formatCount(value: number, label: string) {
  if (value <= 0) return ''
  return `${value} ${label}${value === 1 ? '' : 's'}`
}

function formatAddedMediaFeedback(photos: number, videos: number) {
  return `+${[
    formatCount(photos, 'photo'),
    formatCount(videos, 'video'),
  ].filter(Boolean).join(', ')} added`
}

function getFriendlyPendingFileName(path: string) {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

function PendingMediaCard({
  item,
  disabled,
  compact,
  hero = false,
  mediaTypeLabel,
  showChangeMedia = false,
  selected = false,
  onSelect,
  onRemove,
}: {
  item: PendingEventMediaItem
  disabled: boolean
  compact: boolean
  hero?: boolean
  mediaTypeLabel?: 'Video' | 'Photo'
  showChangeMedia?: boolean
  selected?: boolean
  onSelect?: () => void
  onRemove: () => void
}) {
  const [previewUrl, setPreviewUrl] = useState('')
  const [videoDuration, setVideoDuration] = useState(0)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoMuted, setVideoMuted] = useState(true)
  const [videoProgress, setVideoProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileName = getFriendlyPendingFileName(item.relativePath)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(item.file)
    setPreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [item.file])

  useEffect(() => {
    setVideoDuration(0)
    setVideoPlaying(false)
    setVideoMuted(true)
    setVideoProgress(0)
  }, [item.id])

  async function toggleVideoPlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      await video.play().catch(() => undefined)
    } else {
      video.pause()
    }
  }

  return (
    <div
      className={`pending-media-card group relative shrink-0 overflow-hidden rounded-xl bg-stone-100 ring-1 transition ${
        hero
          ? 'mx-auto aspect-[4/5] w-full ring-stone-200 lg:max-h-[calc(100vh-175px)] lg:max-w-[calc((100vh-175px)*4/5)]'
          : `${compact ? 'h-16 w-16' : 'h-20 w-20'} cursor-pointer ${selected ? 'ring-2 ring-ember-500' : 'ring-stone-200 hover:ring-stone-400'}`
      }`}
      role={!hero && onSelect ? 'button' : undefined}
      tabIndex={!hero && onSelect ? 0 : undefined}
      aria-label={!hero && onSelect ? `Preview ${fileName}` : undefined}
      onClick={!hero && onSelect ? onSelect : undefined}
      onKeyDown={!hero && onSelect ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect()
      } : undefined}
    >
      <div className={`relative overflow-hidden ${
        hero
          ? 'h-full w-full bg-stone-100'
          : 'h-full'
      }`} data-testid={hero ? 'media-preview-frame' : undefined}>
        {previewUrl && item.kind === 'video' ? (
          <video
            ref={videoRef}
            src={previewUrl}
            className={`h-full w-full object-cover object-center ${hero ? 'cursor-pointer' : ''}`}
            muted={videoMuted}
            playsInline
            preload="metadata"
            aria-label={`Video: ${fileName}`}
            onClick={hero ? () => void toggleVideoPlayback() : undefined}
            onPlay={() => setVideoPlaying(true)}
            onPause={() => setVideoPlaying(false)}
            onTimeUpdate={(event) => {
              const duration = event.currentTarget.duration
              setVideoProgress(Number.isFinite(duration) && duration > 0 ? event.currentTarget.currentTime / duration : 0)
            }}
            onEnded={() => {
              setVideoPlaying(false)
              setVideoProgress(0)
            }}
            onLoadedMetadata={(event) => {
              setVideoDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
            }}
          />
        ) : previewUrl ? (
          <Image
            src={previewUrl}
            alt={`Photo: ${fileName}`}
            fill
            sizes={hero ? '(min-width: 1024px) 47vw, 100vw' : compact ? '6rem' : '8rem'}
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-stone-200" />
        )}
      </div>
      {item.kind === 'video' && hero && !videoPlaying && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); void toggleVideoPlayback() }}
          className="absolute left-1/2 top-1/2 z-10 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={`Play ${fileName}`}
        >
          <svg className="ml-0.5 h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7.8v8.4c0 .7.8 1.1 1.4.7l6.3-4.2c.5-.3.5-1.1 0-1.4L10.4 7c-.6-.4-1.4 0-1.4.8Z" /></svg>
        </button>
      )}
      {item.kind === 'video' && !hero && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]" aria-label={`Video: ${fileName}`} role="img">
          <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 7.8v8.4c0 .7.8 1.1 1.4.7l6.3-4.2c.5-.3.5-1.1 0-1.4L10.4 7c-.6-.4-1.4 0-1.4.8Z" />
          </svg>
        </span>
      )}
      {item.kind === 'video' && hero && (
        <>
          <div className="pointer-events-none absolute bottom-12 left-3 right-3 z-10 h-1 overflow-hidden rounded-full bg-white/35" aria-hidden="true">
            <div className="h-full rounded-full bg-white transition-[width] duration-100" style={{ width: `${Math.min(100, Math.max(0, videoProgress * 100))}%` }} />
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              const nextMuted = !videoMuted
              setVideoMuted(nextMuted)
              if (videoRef.current) videoRef.current.muted = nextMuted
            }}
            className="absolute bottom-3 right-[7.25rem] z-10 flex h-8 min-w-8 items-center justify-center rounded-md bg-black/60 px-2 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/75"
            aria-label={videoMuted ? 'Unmute video' : 'Mute video'}
          >
            {videoMuted ? 'Muted' : 'Sound'}
          </button>
        </>
      )}
      {item.kind === 'video' && videoDuration > 0 && (
        <span className="pointer-events-none absolute left-3 top-3 z-10 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
          {formatMediaDuration(videoDuration)}
        </span>
      )}
      {hero && mediaTypeLabel && (
        <span className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md bg-black/65 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          {mediaTypeLabel}
        </span>
      )}
      {hero && showChangeMedia && (
        <label
          htmlFor={EVENT_UPLOAD_INPUT_ID}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            document.getElementById(EVENT_UPLOAD_INPUT_ID)?.click()
          }}
          aria-disabled={disabled}
          className={`absolute bottom-3 right-3 z-10 inline-flex min-h-8 items-center rounded-md bg-white/95 px-2.5 text-[11px] font-semibold text-stone-800 shadow-sm ring-1 ring-black/10 backdrop-blur-sm transition hover:bg-white ${disabled ? 'pointer-events-none cursor-wait opacity-60' : 'cursor-pointer'}`}
        >
          Change Media
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onRemove()
        }}
        className={`absolute right-3 top-3 z-10 flex min-h-8 items-center justify-center rounded-full bg-white/95 px-2.5 text-xs font-semibold text-stone-600 shadow-sm ring-1 ring-stone-200 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 disabled:cursor-wait disabled:opacity-60 ${hero ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'}`}
        aria-label={`Remove ${fileName}`}
      >
        ×{hero && <span className="ml-1">Remove</span>}
      </button>
    </div>
  )
}

function formatMediaDuration(durationSeconds: number) {
  const totalSeconds = Math.max(0, Math.round(durationSeconds))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-stone-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
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

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="16" cy="10" r="1.5" />
    </svg>
  )
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 5.5 18.5 9.5M5 19l3.8-.8L19 7a1.4 1.4 0 0 0-2-2L5.8 15.2 5 19Z" />
    </svg>
  )
}

function RemoveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7h15M9 7V4.8h6V7m-8 0 .8 12h8.4L17 7M10 10.5v5M14 10.5v5" />
    </svg>
  )
}

function getInstagramProfileHref(value?: string) {
  const handle = normalizeInstagramHandle(value)
  return `https://www.instagram.com/${handle ?? ''}`
}

function getPendingMetadataUpdate(details: PendingEventDetails): LocalEventMetadataUpdate {
  return {
    name: details.name,
    type: details.type,
    date: details.date,
    venueName: details.venueName,
    venueLocation: undefined,
    venueInstagram: details.venueInstagram,
    venueVendorId: details.venueVendorId,
    vendors: details.vendors,
    notes: undefined,
  }
}

function quickFilterButtonClass(active: boolean) {
  return `rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 ${
    active ? 'bg-stone-950 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50'
  }`
}

function EmptyState({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="rounded-[28px] bg-stone-50 px-6 py-12 text-center ring-1 ring-stone-200">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-stone-400 shadow-warm ring-1 ring-stone-100">
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5h16M7 4v7m10-7v7M6 20h12a2 2 0 0 0 2-2V7.5H4V18a2 2 0 0 0 2 2Z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-stone-950">No events yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500">
        Upload your first event to organize its media, venue, vendors, notes, and drafts.
      </p>
      <button
        type="button"
        onClick={onUploadClick}
        className="mt-5 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white"
      >
        Upload Event
      </button>
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
