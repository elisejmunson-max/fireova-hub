'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import LocalMedia from '@/components/local-media'
import {
  markMediaLibraryAssetRemovedFromContentBank,
  migrateMediaLibraryToContentBank,
} from '@/lib/local-fireova-media-library-migration'
import {
  CONTENT_BANK_ANGLES,
  CONTENT_BANK_CATEGORIES,
  CONTENT_BANK_THEMES,
  analyzeContentBankItemMetadata,
  createContentBankItemRecord,
  createMediaCreditText,
  createMockMediaForContentBankItem,
  deleteContentBankItemSafely,
  deleteContentBankItemsSafely,
  detectLikelyDuplicate,
  filterContentBankItems,
  getContentThemeSuggestions,
  getSelectedContentBankItems,
  hydrateContentBankFromSupabase,
  markContentBankItemUnused,
  markContentBankItemUsed,
  normalizeInstagramHandle,
  readAllContentBankItems,
  searchContentBankItems,
  sortContentBankItems,
  updateContentBankItem,
  updateContentBankItems,
  type ContentBankAngle,
  type ContentBankCategory,
  type ContentBankMetadataReviewStatus,
  type ContentBankDuplicateMatch,
  type ContentBankSort,
  type LocalContentBankItem,
} from '@/lib/local-fireova-content-bank'

type UploadQueueStatus = 'waiting' | 'checking_duplicate' | 'duplicate' | 'uploading' | 'analyzing' | 'saved' | 'failed' | 'canceled'

type UploadQueueItem = {
  id: string
  file: File
  previewUrl: string
  duplicate: ContentBankDuplicateMatch | null
  keepAnyway: boolean
  status: UploadQueueStatus
  statusChangedAt: number
  error?: string
}

type OrganizerMode = 'Apply to All' | 'Edit Individually'
type DetailMode = 'view' | 'edit'
type DrawerSaveStatus = 'idle' | 'saving' | 'saved'

const SORT_OPTIONS: ContentBankSort[] = ['Newest', 'Oldest', 'Favorites', 'Most Used', 'Least Used', 'Recently Used']
const CATEGORY_FILTER_OPTIONS = ['All', ...CONTENT_BANK_CATEGORIES] as const
const CONTENT_BANK_UPLOAD_INPUT_ID = 'content-bank-upload-input'
const AI_ANALYSIS_UNAVAILABLE_MESSAGE = "Visual AI analysis isn't configured yet. Local suggestions were used."

const emptyBulkMeta = {
  category: 'Other' as ContentBankCategory,
  contentTheme: '',
  foodItems: '',
  tags: '',
  favorite: false,
  notes: '',
  photographerCreditRequired: false,
  photographerName: '',
  photographerInstagram: '',
  photographerWebsite: '',
  photographerNotes: '',
}

export default function ContentBankPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reviewItemId = searchParams?.get('review') ?? ''
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadZoneRef = useRef<HTMLLabelElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchContainerRef = useRef<HTMLDivElement | null>(null)
  const categoryMenuRef = useRef<HTMLDivElement | null>(null)
  const libraryActionsButtonRef = useRef<HTMLButtonElement | null>(null)
  const libraryActionsMenuRef = useRef<HTMLDivElement | null>(null)
  const queueRef = useRef<UploadQueueItem[]>([])
  const processingQueueRef = useRef(false)
  const drawerSaveTimerRef = useRef<number | null>(null)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipeOffsetRef = useRef(0)
  const [items, setItems] = useState<LocalContentBankItem[]>([])
  const [loaded, setLoaded] = useState(true)
  const [queue, setQueue] = useState<UploadQueueItem[]>([])
  const [draggingUpload, setDraggingUpload] = useState(false)
  const [uploadExpanded, setUploadExpanded] = useState(false)
  const [storageInfoOpen, setStorageInfoOpen] = useState(false)
  const [organizingItems, setOrganizingItems] = useState<LocalContentBankItem[]>([])
  const [organizerMode, setOrganizerMode] = useState<OrganizerMode>('Apply to All')
  const [bulkMeta, setBulkMeta] = useState(emptyBulkMeta)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [mediaType, setMediaType] = useState<'All' | 'photo' | 'video'>('All')
  const [category, setCategory] = useState<'All' | ContentBankCategory>('All')
  const [contentTheme, setContentTheme] = useState<'All' | string>('All')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [usedFilter, setUsedFilter] = useState<'All' | 'Used' | 'Unused'>('All')
  const [creditRequiredOnly, setCreditRequiredOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<ContentBankSort>('Newest')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [lightboxMediaId, setLightboxMediaId] = useState<string | null>(null)
  const [detailMode, setDetailMode] = useState<DetailMode>('view')
  const [detailSectionOpen, setDetailSectionOpen] = useState(false)
  const [libraryActionsOpen, setLibraryActionsOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<LocalContentBankItem | null>(null)
  const [postAngle, setPostAngle] = useState<ContentBankAngle>('Food Feature')
  const [drawerSaveStatus, setDrawerSaveStatus] = useState<DrawerSaveStatus>('idle')
  const [metadataReviewNotice, setMetadataReviewNotice] = useState('')
  const [notice, setNotice] = useState('')
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [swipeIntent, setSwipeIntent] = useState<'approve' | 'discard' | null>(null)

  useEffect(() => {
    setItems(readAllContentBankItems())

    let active = true
    void hydrateContentBankFromSupabase()
      .then((cloudItems) => {
        if (active) setItems(cloudItems)
      })
      .catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : 'Could not load cloud media')
      })
    void migrateMediaLibraryToContentBank().then(({ migrated }) => {
      if (!active || migrated === 0) return
      setItems(readAllContentBankItems())
      setNotice(`${migrated} Media Library item${migrated === 1 ? '' : 's'} moved into Content Bank.`)
    })

    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!reviewItemId || items.length === 0) return
    if (!items.some((item) => item.id === reviewItemId)) return

    setActiveItemId(reviewItemId)
    setDetailMode('edit')
    setDetailSectionOpen(true)
  }, [items, reviewItemId])

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  useEffect(() => {
    if (queue.some((item) => item.status === 'waiting')) triggerQueueProcessing()
  }, [queue])

  useEffect(() => {
    function handlePageDragOver(event: DragEvent) {
      if (!hasDraggedFiles(event.dataTransfer)) return

      event.preventDefault()
      event.dataTransfer!.dropEffect = 'copy'
      setDraggingUpload(isPointerInsideElement(event, uploadZoneRef.current))
    }

    function handlePageDrop(event: DragEvent) {
      if (!hasDraggedFiles(event.dataTransfer)) return

      event.preventDefault()
      setDraggingUpload(false)

      if (!isPointerInsideElement(event, uploadZoneRef.current)) {
        setNotice('Drop files on the Upload Content panel.')
        return
      }

      event.stopPropagation()
      handleFiles(event.dataTransfer!.files)
    }

    window.addEventListener('dragover', handlePageDragOver, true)
    window.addEventListener('drop', handlePageDrop, true)

    return () => {
      window.removeEventListener('dragover', handlePageDragOver, true)
      window.removeEventListener('drop', handlePageDrop, true)
    }
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const interval = window.setInterval(() => {
      const now = Date.now()
      setQueue((current) => {
        let changed = false
        const nextQueue = current.map((item) => {
          if ((item.status === 'waiting' || item.status === 'uploading' || item.status === 'analyzing') && now - item.statusChangedAt > 30000) {
            changed = true
            debugUpload('queue item timed out', item.file.name, item.status)
            return { ...item, status: 'failed' as const, error: item.error ?? 'Upload timed out', statusChangedAt: now }
          }
          return item
        })
        if (changed) queueRef.current = nextQueue
        return changed ? nextQueue : current
      })
    }, 5000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    return () => {
      queueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      if (drawerSaveTimerRef.current) window.clearTimeout(drawerSaveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSearchOpen(false)
    }

    function handlePointerDown(event: PointerEvent) {
      if (!searchContainerRef.current?.contains(event.target as Node)) {
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

  useEffect(() => {
    if (!categoryMenuOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setCategoryMenuOpen(false)
    }

    function handlePointerDown(event: PointerEvent) {
      if (!categoryMenuRef.current?.contains(event.target as Node)) {
        setCategoryMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [categoryMenuOpen])

  useEffect(() => {
    if (!libraryActionsOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setLibraryActionsOpen(false)
        libraryActionsButtonRef.current?.focus()
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (libraryActionsMenuRef.current?.contains(target) || libraryActionsButtonRef.current?.contains(target)) {
        return
      }

      setLibraryActionsOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    window.setTimeout(() => libraryActionsMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus(), 0)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [libraryActionsOpen])

  const activeItem = items.find((item) => item.id === activeItemId) ?? null
  const hasContentBankItems = items.length > 0
  const uploadableQueue = queue.filter((item) => item.status === 'uploading' || item.status === 'analyzing' || item.status === 'waiting' || item.status === 'checking_duplicate')
  const actionableQueue = queue.filter((item) => item.status === 'waiting' || item.status === 'duplicate' || item.status === 'failed')
  const activeQuickFilter = favoriteOnly ? 'Favorites' : 'All'
  const availableThemes = useMemo(() => getContentThemeOptions(items, organizingItems), [items, organizingItems])
  const visibleItems = useMemo(() => {
    const searched = searchContentBankItems(items, query)
    const filtered = filterContentBankItems(searched, {
      mediaType,
      category,
      contentTheme,
      favorite: favoriteOnly,
      used: usedFilter === 'Used',
      unused: usedFilter === 'Unused',
      creditRequired: creditRequiredOnly,
      archived: showArchived,
    })
    return sortContentBankItems(filtered, sort)
  }, [category, contentTheme, creditRequiredOnly, favoriteOnly, items, mediaType, query, showArchived, sort, usedFilter])

  const selectedItems = useMemo(() => getSelectedContentBankItems(selectedIds), [selectedIds, items])
  const lightboxItem = items.find((item) => item.mediaId === lightboxMediaId) ?? null
  const activeMetadataMissingFields = activeItem ? getMissingMetadataFields(activeItem) : []

  useEffect(() => {
    if (!activeItem) return

    function handleReviewKeyDown(event: KeyboardEvent) {
      if (isInteractiveSwipeTarget(event.target)) return
      if (lightboxMediaId || itemToDelete || storageInfoOpen) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        approveActiveMetadata({ advance: true })
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        discardActiveItemFromReview()
      }
    }

    document.addEventListener('keydown', handleReviewKeyDown)

    return () => document.removeEventListener('keydown', handleReviewKeyDown)
  }, [activeItem, activeMetadataMissingFields.length, lightboxMediaId, itemToDelete, storageInfoOpen, visibleItems])

  function refreshItems() {
    setItems(readAllContentBankItems())
  }

  function clearFilters() {
    setQuery('')
    setMediaType('All')
    setCategory('All')
    setContentTheme('All')
    setFavoriteOnly(false)
    setCreditRequiredOnly(false)
    setUsedFilter('All')
    setShowArchived(false)
  }

  function applyQuickFilter(filter: 'All' | 'Favorites') {
    setFavoriteOnly(filter === 'Favorites')
  }

  function handleFiles(files: FileList | null) {
    if (!files) return

    debugUpload('files selected', files.length)

    setQueue((current) => {
      const nextQueue = [...current]

      Array.from(files).forEach((file) => {
        if (!isSupportedContentBankUploadFile(file)) return

        const duplicate = detectLikelyDuplicate(file, [], nextQueue.map((item) => item.file))
        if (duplicate?.queued) return

        const queuedItem: UploadQueueItem = {
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          duplicate: null,
          keepAnyway: false,
          status: 'waiting',
          statusChangedAt: Date.now(),
        }

        debugUpload('queue item created', queuedItem.id, file.name, queuedItem.status)
        nextQueue.push(queuedItem)
      })

      queueRef.current = nextQueue
      return nextQueue
    })

    triggerQueueProcessing()

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(event: ReactDragEvent<HTMLLabelElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDraggingUpload(false)

    handleFiles(event.dataTransfer.files)
  }

  function clearQueue() {
    setQueue((current) => {
      const removable = current.filter((item) => item.status === 'duplicate' || item.status === 'failed' || item.status === 'waiting' || item.status === 'canceled')
      removable.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      const nextQueue = current.filter((item) => item.status === 'uploading' || item.status === 'analyzing' || item.status === 'saved')
      queueRef.current = nextQueue
      return nextQueue
    })
  }

  function removeQueueItem(id: string) {
    setQueue((current) => {
      const item = current.find((queued) => queued.id === id)
      if (!item || item.status === 'uploading' || item.status === 'analyzing' || item.status === 'checking_duplicate' || item.status === 'saved') return current

      URL.revokeObjectURL(item.previewUrl)
      const nextQueue = current.filter((queued) => queued.id !== id)
      queueRef.current = nextQueue
      return nextQueue
    })
  }

  function triggerQueueProcessing() {
    window.setTimeout(() => {
      void processUploadQueue()
    }, 0)
  }

  async function processUploadQueue() {
    if (processingQueueRef.current) return
    processingQueueRef.current = true
    debugUpload('processor triggered')

    try {
      while (true) {
        const queuedItem = queueRef.current.find((item) => item.status === 'waiting')
        if (!queuedItem) return
        await processQueueItem(queuedItem.id)
      }
    } finally {
      processingQueueRef.current = false
      if (queueRef.current.some((item) => item.status === 'waiting')) triggerQueueProcessing()
    }
  }

  async function processQueueItem(id: string) {
    const queuedItem = queueRef.current.find((item) => item.id === id)
    if (!queuedItem || queuedItem.status !== 'waiting') return

    try {
      setQueueStatus(id, 'checking_duplicate')
      debugUpload('duplicate check started', queuedItem.file.name)
      const duplicate = queuedItem.keepAnyway
        ? null
        : detectLikelyDuplicate(
            queuedItem.file,
            readAllContentBankItems(),
            queueRef.current.filter((item) => item.id !== id && item.status !== 'saved').map((item) => item.file)
          )
      debugUpload('duplicate check completed', queuedItem.file.name, duplicate?.reason ?? 'none')

      if (duplicate && !queuedItem.keepAnyway) {
        updateQueueItemState(id, { status: 'duplicate', duplicate, statusChangedAt: Date.now() })
        return
      }

      setQueueStatus(id, 'uploading')
      debugUpload('media save started', queuedItem.file.name)
      const saved = await createContentBankItemRecord(queuedItem.file)
      debugUpload('media save completed', saved.mediaId)
      debugUpload('metadata save completed', saved.id)
      setItems(readAllContentBankItems())
      setOrganizingItems((current) => [saved, ...current])
      setUploadExpanded(false)
      setQueueStatus(id, 'analyzing')
      debugUpload('metadata analysis started', queuedItem.file.name)
      const created = await analyzeContentBankItemMetadata(saved.id, queuedItem.file)
      debugUpload('media save completed', created.mediaId)
      debugUpload('metadata analysis completed', created.id)
      setItems(readAllContentBankItems())
      setOrganizingItems((current) => current.map((item) => item.id === created.id ? created : item))
      setQueueStatus(id, 'saved')
      setNotice(created.aiAnalysisUnavailable ? '1 item added with local suggestions' : '1 item added')
      if (created.aiAnalysisUnavailable) {
        setActiveItemId(created.id)
        setMetadataReviewNotice(AI_ANALYSIS_UNAVAILABLE_MESSAGE)
      } else {
        setMetadataReviewNotice('')
      }
      debugUpload('queue item saved', queuedItem.file.name)
      window.setTimeout(() => removeSavedQueueItem(id), 1500)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      debugUpload('queue item failed', queuedItem.file.name, message)
      updateQueueItemState(id, { status: 'failed', error: message, statusChangedAt: Date.now() })
    }
  }

  function setQueueStatus(id: string, status: UploadQueueStatus) {
    updateQueueItemState(id, { status, error: undefined, statusChangedAt: Date.now() })
  }

  function updateQueueItemState(id: string, updates: Partial<UploadQueueItem>) {
    const nextQueue = queueRef.current.map((item) => item.id === id ? { ...item, ...updates } : item)
    queueRef.current = nextQueue
    setQueue(nextQueue)
  }

  function keepDuplicateAnyway(id: string) {
    setQueue((current) => {
      const nextQueue = current.map((item) => item.id === id ? { ...item, keepAnyway: true, status: 'waiting' as const, error: undefined, statusChangedAt: Date.now() } : item)
      queueRef.current = nextQueue
      return nextQueue
    })
    triggerQueueProcessing()
  }

  function retryQueueItem(id: string) {
    setQueue((current) => {
      const nextQueue = current.map((item) => item.id === id ? { ...item, status: 'waiting' as const, error: undefined, statusChangedAt: Date.now() } : item)
      queueRef.current = nextQueue
      return nextQueue
    })
    triggerQueueProcessing()
  }

  function removeSavedQueueItem(id: string) {
    setQueue((current) => {
      const item = current.find((queued) => queued.id === id)
      if (!item || item.status !== 'saved') return current

      URL.revokeObjectURL(item.previewUrl)
      const nextQueue = current.filter((queued) => queued.id !== id)
      queueRef.current = nextQueue
      return nextQueue
    })
  }

  function applyOrganization() {
    const updates = {
      category: bulkMeta.category,
      contentTheme: bulkMeta.contentTheme.trim(),
      foodItems: splitList(bulkMeta.foodItems),
      tags: splitList(bulkMeta.tags),
      favorite: bulkMeta.favorite,
      notes: bulkMeta.notes,
      photographerCreditRequired: bulkMeta.photographerCreditRequired,
      photographerName: bulkMeta.photographerName,
      photographerInstagram: normalizeInstagramHandle(bulkMeta.photographerInstagram),
      photographerWebsite: bulkMeta.photographerWebsite,
      photographerNotes: bulkMeta.photographerNotes,
    }

    updateContentBankItems(organizingItems.map((item) => item.id), updates)
    setOrganizingItems([])
    setBulkMeta(emptyBulkMeta)
    refreshItems()
  }

  function updateIndividualOrganization(id: string, updates: Partial<LocalContentBankItem>) {
    updateContentBankItem(id, updates)
    refreshItems()
    setOrganizingItems((current) => current.map((item) => item.id === id ? { ...item, ...updates } : item))
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function openDetail(item: LocalContentBankItem) {
    if (selectMode) {
      toggleSelection(item.id)
      return
    }

    setLightboxMediaId(item.mediaId)
  }

  function updateActiveItem(updates: Partial<LocalContentBankItem>) {
    if (!activeItem) return

    updateContentBankItem(activeItem.id, updates)
    refreshItems()
  }

  function updateActiveMetadata(updates: Partial<LocalContentBankItem>) {
    if (!activeItem) return

    const nextStatus = getNextMetadataReviewStatus(activeItem.metadataReviewStatus, updates)
    setMetadataReviewNotice('')
    setDrawerSaveStatus('saving')
    updateContentBankItem(activeItem.id, {
      ...updates,
      metadataReviewStatus: nextStatus,
      suggestionSource: 'manual',
    })
    refreshItems()
    if (drawerSaveTimerRef.current) window.clearTimeout(drawerSaveTimerRef.current)
    drawerSaveTimerRef.current = window.setTimeout(() => setDrawerSaveStatus('saved'), 180)
  }

  function approveActiveMetadata(options: { advance?: boolean } = {}) {
    if (!activeItem) return
    const missingFields = getMissingMetadataFields(activeItem)
    if (missingFields.length > 0) {
      setMetadataReviewNotice(`Add a ${missingFields[0]} before approving.`)
      document.getElementById(`metadata-field-${missingFields[0].toLowerCase().replace(/\s+/g, '-')}`)?.focus()
      return
    }

    const reviewedItemId = activeItem.id
    setDrawerSaveStatus('saving')
    setMetadataReviewNotice('')
    updateContentBankItem(reviewedItemId, { metadataReviewStatus: 'Approved' })
    refreshItems()
    if (drawerSaveTimerRef.current) window.clearTimeout(drawerSaveTimerRef.current)
    drawerSaveTimerRef.current = window.setTimeout(() => setDrawerSaveStatus('saved'), 180)
    if (options.advance) {
      setNotice('Approved.')
      moveToNextReviewItem(reviewedItemId)
    }
  }

  function discardActiveItemFromReview() {
    if (!activeItem) return

    const trashedItemId = activeItem.id
    updateContentBankItem(trashedItemId, { archived: true })
    refreshItems()
    setNotice('Discarded.')
    moveToNextReviewItem(trashedItemId)
  }

  function moveToNextReviewItem(currentId: string) {
    const reviewableItems = visibleItems.filter((item) => item.id !== currentId && !item.archived && item.metadataReviewStatus !== 'Approved')
    if (reviewableItems.length === 0) {
      setActiveItemId(null)
      setSwipeOffset(0)
      swipeOffsetRef.current = 0
      setSwipeIntent(null)
      return
    }

    const currentIndex = visibleItems.findIndex((item) => item.id === currentId)
    const afterCurrent = visibleItems.slice(Math.max(currentIndex + 1, 0))
    const beforeCurrent = currentIndex > 0 ? visibleItems.slice(0, currentIndex) : []
    const nextItem = [...afterCurrent, ...beforeCurrent].find((item) => reviewableItems.some((candidate) => candidate.id === item.id)) ?? reviewableItems[0]

    setActiveItemId(nextItem.id)
    setDetailMode('view')
    setDetailSectionOpen(false)
    setLibraryActionsOpen(false)
    setDrawerSaveStatus('idle')
    setMetadataReviewNotice('')
    setSwipeOffset(0)
    swipeOffsetRef.current = 0
    setSwipeIntent(null)
  }

  function handleReviewSwipeStart(event: ReactPointerEvent<HTMLElement>) {
    if (isInteractiveSwipeTarget(event.target)) return

    swipeStartRef.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleReviewSwipeMove(event: ReactPointerEvent<HTMLElement>) {
    if (!swipeStartRef.current) return

    const deltaX = event.clientX - swipeStartRef.current.x
    const deltaY = event.clientY - swipeStartRef.current.y
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 24) return

    const clampedOffset = Math.max(-180, Math.min(180, deltaX))
    swipeOffsetRef.current = clampedOffset
    setSwipeOffset(clampedOffset)
    setSwipeIntent(clampedOffset > 72 ? 'approve' : clampedOffset < -72 ? 'discard' : null)
  }

  function handleReviewSwipeEnd() {
    if (!swipeStartRef.current) return

    const finalOffset = swipeOffsetRef.current
    swipeStartRef.current = null
    swipeOffsetRef.current = 0
    setSwipeOffset(0)
    setSwipeIntent(null)

    if (finalOffset > 120) {
      approveActiveMetadata({ advance: true })
      return
    }

    if (finalOffset < -120) {
      discardActiveItemFromReview()
    }
  }

  function toggleFavorite(item: LocalContentBankItem) {
    updateContentBankItem(item.id, { favorite: !item.favorite })
    refreshItems()
  }

  function toggleFavoriteFromMenu(item: LocalContentBankItem) {
    toggleFavorite(item)
    setLibraryActionsOpen(false)
  }

  function toggleUsedFromMenu(item: LocalContentBankItem) {
    item.usedStatus === 'Used' ? markContentBankItemUnused(item.id) : markContentBankItemUsed(item.id)
    refreshItems()
    setLibraryActionsOpen(false)
  }

  function archiveFromMenu(item: LocalContentBankItem) {
    updateContentBankItem(item.id, { archived: true })
    refreshItems()
    setLibraryActionsOpen(false)
  }

  function requestDeleteItem(item: LocalContentBankItem) {
    setLibraryActionsOpen(false)
    setItemToDelete(item)
  }

  function openDraftComposer(itemsToCompose: LocalContentBankItem[], angle: ContentBankAngle = postAngle) {
    if (itemsToCompose.length === 0) return
    if (itemsToCompose.length > 1) {
      setNotice('Content Studio currently opens one media item at a time.')
      return
    }

    const ids = itemsToCompose.map((item) => item.id).join(',')
    router.push(`/content-studio?source=media&ids=${encodeURIComponent(ids)}&angle=${encodeURIComponent(angle)}`)
  }

  async function deleteItem(item: LocalContentBankItem) {
    await deleteContentBankItemSafely(item.id)
    if (item.sourceMediaLibraryId) {
      markMediaLibraryAssetRemovedFromContentBank(item.sourceMediaLibraryId)
    }
    setItemToDelete(null)
    setActiveItemId(null)
    setDetailSectionOpen(false)
    setLibraryActionsOpen(false)
    setLightboxMediaId((current) => current === item.mediaId ? null : current)
    refreshItems()
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) return
    const confirmed = window.confirm(`Delete ${selectedIds.length} selected Content Library item${selectedIds.length === 1 ? '' : 's'}? Event archives will not be deleted.`)
    if (!confirmed) return

    await deleteContentBankItemsSafely(selectedIds)
    selectedItems.forEach((item) => {
      if (item.sourceMediaLibraryId) {
        markMediaLibraryAssetRemovedFromContentBank(item.sourceMediaLibraryId)
      }
    })
    setSelectedIds([])
    refreshItems()
  }

  function addBulkTags() {
    const tags = window.prompt('Tags to add, separated by commas')
    if (!tags) return

    const tagsToAdd = splitList(tags)
    selectedItems.forEach((item) => updateContentBankItem(item.id, { tags: unique([...item.tags, ...tagsToAdd]) }))
    refreshItems()
  }

  function removeBulkTags() {
    const tags = window.prompt('Tags to remove, separated by commas')
    if (!tags) return

    const tagsToRemove = new Set(splitList(tags).map((tag) => tag.toLowerCase()))
    selectedItems.forEach((item) => updateContentBankItem(item.id, { tags: item.tags.filter((tag) => !tagsToRemove.has(tag.toLowerCase())) }))
    refreshItems()
  }

  function changeBulkCategory() {
    const nextCategory = window.prompt(`Category: ${CONTENT_BANK_CATEGORIES.join(', ')}`, 'Pizza')
    if (!nextCategory || !CONTENT_BANK_CATEGORIES.includes(nextCategory as ContentBankCategory)) return

    updateContentBankItems(selectedIds, { category: nextCategory as ContentBankCategory })
    refreshItems()
  }

  function setBulkPhotoCredit() {
    if (selectedIds.length === 0) return

    const mode = window.prompt('Set photo credit required? Enter yes or no.', 'yes')
    if (!mode) return

    const creditRequired = mode.trim().toLowerCase().startsWith('y')
    if (!creditRequired) {
      const confirmed = window.confirm(`Remove required photo credit from ${selectedIds.length} selected item${selectedIds.length === 1 ? '' : 's'}?`)
      if (!confirmed) return

      updateContentBankItems(selectedIds, {
        photographerCreditRequired: false,
        photographerName: '',
        photographerInstagram: '',
        photographerWebsite: '',
        photographerNotes: '',
      })
      refreshItems()
      return
    }

    const photographerName = window.prompt('Photographer / creator name', '') ?? ''
    const photographerInstagram = window.prompt('Instagram handle', '') ?? ''
    const photographerWebsite = window.prompt('Website', '') ?? ''
    const photographerNotes = window.prompt('Notes', '') ?? ''

    if (!photographerName.trim() && !photographerInstagram.trim() && !photographerWebsite.trim()) {
      setNotice('Add at least one credit value before requiring photo credit.')
      return
    }

    updateContentBankItems(selectedIds, {
      photographerCreditRequired: true,
      photographerName,
      photographerInstagram: normalizeInstagramHandle(photographerInstagram),
      photographerWebsite,
      photographerNotes,
    })
    refreshItems()
  }

  return (
    <div className="min-h-full bg-white pb-28">
      <header className="px-4 pb-3 pt-6 sm:px-8 sm:pt-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Local Content Library</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold leading-tight text-stone-950 sm:text-4xl">Content Library</h1>
                <button
                  type="button"
                  onClick={() => setStorageInfoOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950"
                >
                  <span aria-hidden="true">ⓘ</span>
                  Storage Info
                </button>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">Curate the best reusable Fireova photos and videos for future marketing.</p>
            </div>
          </div>

          <label
            ref={uploadZoneRef}
            role="button"
            tabIndex={0}
            aria-label="Upload photos or videos to the Content Library"
            aria-describedby="content-bank-upload-help"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'copy'
              setUploadExpanded(true)
              setDraggingUpload(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'copy'
              setDraggingUpload(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDraggingUpload(false)
              }
            }}
            onDrop={handleDrop}
            className={`relative block cursor-pointer overflow-hidden rounded-lg border-2 border-dashed p-5 transition focus-within:outline-none focus-within:ring-2 focus-within:ring-stone-950 sm:p-6 ${
              draggingUpload
                ? 'border-ember-500 bg-ember-50 text-stone-950'
                : 'border-stone-300 bg-stone-50 text-stone-800 hover:border-stone-400 hover:bg-stone-100/70'
            }`}
          >
            <input
              id={CONTENT_BANK_UPLOAD_INPUT_ID}
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.heic,.heif,.mov,.m4v"
              multiple
              capture={undefined}
              aria-label="Upload content"
              onChange={(event) => handleFiles(event.target.files)}
              onDragEnter={(event) => {
                event.stopPropagation()
                setUploadExpanded(true)
                setDraggingUpload(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'copy'
                setDraggingUpload(true)
              }}
              onDragLeave={(event) => {
                event.stopPropagation()
                setDraggingUpload(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setDraggingUpload(false)
                handleFiles(event.dataTransfer.files)
              }}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
            <div className="pointer-events-none flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${draggingUpload ? 'bg-white text-ember-700' : 'bg-white text-stone-700'} ring-1 ring-stone-200`}>
                  <svg className="h-5 w-5" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-stone-950 sm:text-lg">
                    {uploadableQueue.length > 0 ? `Uploading ${uploadableQueue.length} file${uploadableQueue.length === 1 ? '' : 's'}...` : draggingUpload ? 'Drop to upload' : 'Upload Content'}
                  </h2>
                  <p id="content-bank-upload-help" className="mt-1 text-sm leading-5 text-stone-500">
                    <span>Drag files here or click anywhere to browse.</span>
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    Photos and videos · Multiple files supported
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <span className="text-xs font-semibold text-stone-500" aria-live="polite">
                  {queue.length > 0 ? `${queue.length} active upload${queue.length === 1 ? '' : 's'}` : notice || 'Ready for upload'}
                </span>
              </div>
            </div>
          </label>

          {notice && (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">{notice}</p>
          )}
        </div>
      </header>

      <main className="px-4 py-3 sm:px-8">
        <div className="mx-auto max-w-7xl space-y-4">

          {queue.length > 0 && (
            <section className="rounded-lg bg-stone-50 p-4 ring-1 ring-stone-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-950">Upload Progress</h2>
                  <p className="text-sm text-stone-500">Files save automatically at full quality in this browser.</p>
                </div>
                {actionableQueue.length > 0 && (
                  <button type="button" onClick={clearQueue} className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                    Clear Queue
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-2">
                {queue.map((queued) => (
                  <article key={queued.id} className="grid grid-cols-[72px_1fr] gap-3 rounded-lg bg-white p-2 ring-1 ring-stone-200 sm:grid-cols-[88px_1fr_auto] sm:items-center">
                    <div className="aspect-square overflow-hidden rounded-md bg-stone-100">
                      {queued.file.type.startsWith('video/') ? (
                        <video src={queued.previewUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                      ) : (
                        <img src={queued.previewUrl} alt={queued.file.name} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-stone-950">{queued.file.name}</p>
                      <p className="text-xs font-medium text-stone-500">{queued.file.type.startsWith('video/') ? 'Video' : 'Photo'} · {formatBytes(queued.file.size)}</p>
                      <p className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${uploadStatusClass(queued.status)}`} aria-live="polite">
                        {getUploadStatusLabel(queued)}
                      </p>
                      {queued.duplicate && queued.status === 'duplicate' && (
                        <p className="text-xs font-semibold leading-5 text-amber-900">Likely duplicate: {queued.duplicate.reason}</p>
                      )}
                      {queued.status === 'failed' && queued.error && (
                        <p className="text-xs font-semibold leading-5 text-red-700">{queued.error}</p>
                      )}
                    </div>
                    <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:justify-end">
                      {queued.status === 'duplicate' && (
                        <>
                          <button type="button" onClick={() => removeQueueItem(queued.id)} className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-amber-200 hover:bg-amber-50">Skip Duplicate</button>
                          <button type="button" onClick={() => keepDuplicateAnyway(queued.id)} className="rounded-md bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800">Keep Anyway</button>
                        </>
                      )}
                      {queued.status === 'failed' && (
                        <>
                          <button type="button" onClick={() => retryQueueItem(queued.id)} className="rounded-md bg-stone-950 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800">Retry</button>
                          <button type="button" onClick={() => removeQueueItem(queued.id)} className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">Remove</button>
                        </>
                      )}
                      {queued.status === 'waiting' && (
                        <button type="button" onClick={() => removeQueueItem(queued.id)} className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">Cancel</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {organizingItems.length > 0 && (
            <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-950">Quick Organization</h2>
                  <p className="text-sm text-stone-500">Add helpful metadata now, or skip and edit details later.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setOrganizerMode('Apply to All')} className={modeButtonClass(organizerMode === 'Apply to All')}>Apply to All</button>
                  <button type="button" onClick={() => setOrganizerMode('Edit Individually')} className={modeButtonClass(organizerMode === 'Edit Individually')}>Edit Individually</button>
                </div>
              </div>

              {organizerMode === 'Apply to All' ? (
                <MetadataForm
                  values={bulkMeta}
                  onChange={setBulkMeta}
                  className="mt-4"
                />
              ) : (
                <div className="mt-4 space-y-4">
                  {organizingItems.map((item) => (
                    <div key={item.id} className="rounded-lg bg-stone-50 p-3 ring-1 ring-stone-100">
                      <p className="mb-3 text-sm font-semibold text-stone-950">{item.originalFileName}</p>
                      <MetadataForm
                        values={{
                          category: item.category,
                          contentTheme: item.contentTheme,
                          foodItems: item.foodItems.join(', '),
                          tags: item.tags.join(', '),
                          favorite: item.favorite,
                          notes: item.notes,
                          photographerCreditRequired: item.photographerCreditRequired,
                          photographerName: item.photographerName,
                          photographerInstagram: item.photographerInstagram,
                          photographerWebsite: item.photographerWebsite,
                          photographerNotes: item.photographerNotes,
                        }}
                        onChange={(values) => updateIndividualOrganization(item.id, {
                          category: values.category,
                          contentTheme: values.contentTheme.trim(),
                          foodItems: splitList(values.foodItems),
                          tags: splitList(values.tags),
                          favorite: values.favorite,
                          notes: values.notes,
                          photographerCreditRequired: values.photographerCreditRequired,
                          photographerName: values.photographerName,
                          photographerInstagram: normalizeInstagramHandle(values.photographerInstagram),
                          photographerWebsite: values.photographerWebsite,
                          photographerNotes: values.photographerNotes,
                        })}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="sticky bottom-3 mt-4 flex flex-col gap-2 rounded-lg bg-white/95 p-2 shadow-[0_14px_44px_rgba(28,25,23,0.12)] ring-1 ring-stone-200 backdrop-blur sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOrganizingItems([])} className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">Skip for Now</button>
                <button type="button" onClick={applyOrganization} className="rounded-lg bg-stone-950 px-4 py-3 text-sm font-semibold text-white">Save Organization</button>
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-lg bg-white p-3 ring-1 ring-stone-200">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {(['All', 'Favorites'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => applyQuickFilter(filter)}
                    className={quickFilterButtonClass(activeQuickFilter === filter)}
                    aria-pressed={activeQuickFilter === filter}
                  >
                    {filter}
                  </button>
                ))}

                <div ref={categoryMenuRef} className="relative w-full sm:w-48">
                  <button
                    type="button"
                    onClick={() => setCategoryMenuOpen((value) => !value)}
                    className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 ${
                      category === 'All'
                        ? 'bg-stone-50 text-stone-700 ring-stone-200 hover:bg-stone-100'
                        : 'bg-white text-stone-950 ring-stone-300 hover:bg-stone-50'
                    }`}
                    aria-haspopup="listbox"
                    aria-expanded={categoryMenuOpen}
                  >
                    <span className="truncate">{category === 'All' ? 'All Categories' : category}</span>
                    <svg className={`h-4 w-4 flex-shrink-0 text-stone-500 transition-transform ${categoryMenuOpen ? 'rotate-180' : ''}`} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {categoryMenuOpen && (
                    <div className="absolute left-0 top-full z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-lg bg-white p-1.5 shadow-[0_18px_50px_rgba(28,25,23,0.14)] ring-1 ring-stone-200" role="listbox" aria-label="Category filter">
                      {CATEGORY_FILTER_OPTIONS.map((option) => {
                        const active = category === option
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setCategory(option)
                              setCategoryMenuOpen(false)
                            }}
                            className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                              active ? 'bg-stone-950 text-white' : 'text-stone-700 hover:bg-stone-50'
                            }`}
                            role="option"
                            aria-selected={active}
                          >
                            <span className="truncate">{option === 'All' ? 'All Categories' : option}</span>
                            {active && (
                              <svg className="h-4 w-4 flex-shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
                <div ref={searchContainerRef} className="min-w-0 sm:max-w-md sm:flex-1 lg:flex-none">
                  {searchOpen ? (
                    <label className="block">
                      <span className="sr-only">Search Content Library</span>
                      <input
                        ref={searchInputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search categories, themes, menu items, tags..."
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

                {(query || mediaType !== 'All' || contentTheme !== 'All' || favoriteOnly || usedFilter !== 'All' || creditRequiredOnly || showArchived) && (
                  <button type="button" onClick={clearFilters} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                    Clear
                  </button>
                )}
                <button type="button" onClick={() => setFiltersOpen((value) => !value)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ring-1 ${
                  filtersOpen ? 'bg-ember-50 text-ember-800 ring-ember-200' : 'bg-white text-stone-700 ring-stone-200 hover:bg-stone-50'
                }`}>
                  Filter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((value) => !value)
                    setSelectedIds([])
                  }}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold ring-1 ${selectMode ? 'bg-ember-50 text-ember-800 ring-ember-200' : 'bg-white text-stone-700 ring-stone-200 hover:bg-stone-50'}`}
                >
                  Manage Library
                </button>
              </div>
            </div>

            {filtersOpen && (
              <div className="grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select label="Media" value={mediaType} onChange={(value) => setMediaType(value as 'All' | 'photo' | 'video')} options={['All', 'photo', 'video']} />
                <Select label="Category" value={category} onChange={(value) => setCategory(value as 'All' | ContentBankCategory)} options={['All', ...CONTENT_BANK_CATEGORIES]} />
                <ThemeFilterInput value={contentTheme} onChange={setContentTheme} options={availableThemes} />
                <Select
                  label="Status"
                  value={usedFilter === 'Unused' ? 'Never Posted' : usedFilter}
                  onChange={(value) => setUsedFilter(value === 'Never Posted' ? 'Unused' : value as 'All' | 'Used')}
                  options={['All', 'Used', 'Never Posted']}
                />
                <Select label="Sort" value={sort} onChange={(value) => setSort(value as ContentBankSort)} options={SORT_OPTIONS} />
                <Toggle label="Favorites only" checked={favoriteOnly} onChange={setFavoriteOnly} />
                <Toggle label="Credit Required" checked={creditRequiredOnly} onChange={setCreditRequiredOnly} />
                <Toggle label="Show archived" checked={showArchived} onChange={setShowArchived} />
              </div>
            )}
          </section>

          {selectMode && selectedIds.length > 0 && (
            <section className="sticky top-16 z-20 rounded-lg bg-stone-950 p-3 text-white shadow-[0_16px_50px_rgba(28,25,23,0.18)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold">{selectedIds.length} selected</span>
                  <Select label="Angle" value={postAngle} onChange={(value) => setPostAngle(value as ContentBankAngle)} options={CONTENT_BANK_ANGLES} dark />
                </div>
                <div className="flex flex-wrap gap-2">
                  <BulkButton onClick={addBulkTags}>Add Tags</BulkButton>
                  <BulkButton onClick={removeBulkTags}>Remove Tags</BulkButton>
                  <BulkButton onClick={changeBulkCategory}>Change Category</BulkButton>
                  <BulkButton onClick={setBulkPhotoCredit}>Set Photo Credit</BulkButton>
                  <BulkButton onClick={() => { updateContentBankItems(selectedIds, { favorite: true }); refreshItems() }}>Mark Favorite</BulkButton>
                  <BulkButton onClick={() => { updateContentBankItems(selectedIds, { favorite: false }); refreshItems() }}>Remove Favorite</BulkButton>
                  <BulkButton onClick={() => { updateContentBankItems(selectedIds, { usedStatus: 'Used', lastUsedAt: new Date().toISOString() }); refreshItems() }}>Mark Used</BulkButton>
                  <BulkButton onClick={() => { updateContentBankItems(selectedIds, { usedStatus: 'Unused', lastUsedAt: undefined }); refreshItems() }}>Mark Unused</BulkButton>
                  <BulkButton onClick={() => { updateContentBankItems(selectedIds, { archived: true }); refreshItems() }}>Archive</BulkButton>
                  <BulkButton onClick={bulkDelete}>Delete</BulkButton>
                  <button type="button" onClick={() => openDraftComposer(selectedItems)} className="rounded-lg bg-ember-600 px-3 py-2 text-xs font-semibold text-white hover:bg-ember-700">Create Content</button>
                </div>
              </div>
            </section>
          )}

          {!loaded ? (
            <div className="rounded-lg bg-stone-50 px-6 py-16 text-center ring-1 ring-stone-100">Loading Content Library...</div>
          ) : items.length === 0 ? (
            <section className="rounded-lg bg-stone-50 px-6 py-16 text-center ring-1 ring-stone-100">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Build your Content Library</p>
              <h2 className="text-2xl font-semibold text-stone-950">Add reusable marketing assets</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
                Add your best food, team, cooking, setup, and brand content for future marketing.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
                  Upload Content
                </button>
                <Link href="/events" className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                  Add from an Event
                </Link>
              </div>
            </section>
          ) : visibleItems.length === 0 ? (
            <section className="rounded-lg bg-stone-50 px-6 py-14 text-center ring-1 ring-stone-100">
              <h2 className="text-xl font-semibold text-stone-950">No media matches those filters</h2>
              <p className="mt-2 text-sm text-stone-500">Try clearing category or content theme filters to broaden the library.</p>
              <button type="button" onClick={clearFilters} className="mt-5 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">
                Clear Filters
              </button>
            </section>
          ) : (
            <section className="grid grid-cols-1 gap-3 min-[580px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItems.map((item) => {
                const galleryCategory = getCardCategory(item)
                const galleryTitle = getGalleryTitle(item)

                return (
                  <article
                    key={item.id}
                    className={`group overflow-hidden rounded-lg bg-white ring-1 transition ${selectedIds.includes(item.id) ? 'ring-2 ring-ember-500' : 'ring-stone-200 hover:ring-stone-300'}`}
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => openDetail(item)}
                        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950"
                        aria-label={`Open ${galleryTitle}`}
                      >
                        <div className="relative aspect-square bg-stone-100">
                          <LocalMedia media={createMockMediaForContentBankItem(item)} className="h-full w-full object-cover" />
                          {item.mediaType === 'video' && (
                            <div className="absolute left-2 top-2 rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold text-stone-700 shadow-sm backdrop-blur">
                              Video
                            </div>
                          )}
                          {item.photographerCreditRequired && (
                            <div
                              className="absolute bottom-2 right-2 rounded-full bg-white/90 px-1.5 py-1 text-[11px] font-semibold text-stone-700 shadow-sm backdrop-blur"
                              aria-label="Credit required"
                              title="Photographer credit required"
                            >
                              📸
                            </div>
                          )}
                          {selectMode && <div className={`absolute bottom-2 left-2 h-6 w-6 rounded-md border-2 ${selectedIds.includes(item.id) ? 'border-ember-500 bg-ember-500' : 'border-white bg-black/20'}`} />}
                        </div>
                      </button>
                      {!selectMode && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            requestDeleteItem(item)
                          }}
                          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-stone-500 shadow-sm ring-1 ring-stone-200 backdrop-blur transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          aria-label={`Delete ${galleryTitle}`}
                          title="Delete media"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7h16" />
                            <path d="M9 7V4h6v3" />
                            <path d="m6 7 1 13h10l1-13" />
                            <path d="M10 11v5M14 11v5" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="flex min-h-[52px] items-start gap-2 p-3">
                      <button type="button" onClick={() => openDetail(item)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950">
                        <div className="space-y-1">
                          <h3 className="truncate text-[15px] font-semibold leading-5 text-stone-950">{galleryTitle}</h3>
                          <p className="truncate text-xs font-semibold text-stone-500">{galleryCategory}</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleFavorite(item)
                        }}
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-stone-50 text-lg ring-1 ring-stone-200 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 ${item.favorite ? 'text-ember-600' : 'text-stone-500'}`}
                        aria-label={item.favorite ? `Remove ${galleryTitle} from favorites` : `Mark ${galleryTitle} as favorite`}
                        aria-pressed={item.favorite}
                      >
                        {item.favorite ? '♥' : '♡'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </section>
          )}
        </div>
      </main>

      {activeItem && (
        <div className="fixed inset-0 z-50 hidden justify-end bg-black/40" onClick={() => setActiveItemId(null)}>
          <aside
            className="h-full w-[min(100vw,620px)] overflow-y-auto bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-end border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
              <button
                type="button"
                onClick={() => setActiveItemId(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-lg text-stone-700 hover:bg-stone-200"
                aria-label="Close media drawer"
              >
                ×
              </button>
            </div>

            <div className="space-y-6 p-4 sm:p-5">
              <section
                className="relative -m-1 space-y-4 rounded-[28px] p-1 touch-pan-y"
                onPointerDown={handleReviewSwipeStart}
                onPointerMove={handleReviewSwipeMove}
                onPointerUp={handleReviewSwipeEnd}
                onPointerCancel={handleReviewSwipeEnd}
                style={{
                  transform: `translateX(${swipeOffset}px) rotate(${swipeOffset / 28}deg)`,
                  transition: swipeStartRef.current ? 'none' : 'transform 180ms ease',
                }}
                aria-label="Swipe right to keep this content or left to discard it"
              >
                {swipeIntent && (
                  <div
                    className={`pointer-events-none absolute right-4 top-16 z-10 rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-lg ring-1 ${
                      swipeIntent === 'approve'
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-red-50 text-red-700 ring-red-200'
                    }`}
                  >
                    {swipeIntent === 'approve' ? 'Keep' : 'Discard'}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <ReviewStatusPill status={activeMetadataMissingFields.length > 0 ? 'Needs Review' : activeItem.metadataReviewStatus} />
                  <SaveStatus status={drawerSaveStatus} />
                </div>
                {activeItem.sourceType === 'event' && activeItem.sourceEventName && (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-stone-500">
                    <span>From {activeItem.sourceEventName}</span>
                    {activeItem.sourceEventId && (
                      <Link href={`/events/${activeItem.sourceEventId}`} className="font-semibold text-stone-800 underline underline-offset-4">
                        Open Event
                      </Link>
                    )}
                  </div>
                )}
                {activeMetadataMissingFields.length > 0 && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-100">
                    Complete {formatMissingFields(activeMetadataMissingFields)} before approving.
                  </p>
                )}
                <p className="text-xs font-semibold text-stone-400">Swipe on mobile · Use ← Discard / → Keep on desktop</p>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="w-full space-y-3 sm:w-[240px] sm:flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setLightboxMediaId(activeItem.mediaId)}
                      className="flex aspect-[6/5] w-full items-center justify-center overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 sm:h-[200px] sm:aspect-auto"
                      aria-label="View full media"
                    >
                      <LocalMedia
                        media={createMockMediaForContentBankItem(activeItem)}
                        className="h-full w-full object-cover object-center"
                        controls={activeItem.mediaType === 'video'}
                        muted={false}
                      />
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={discardActiveItemFromReview}
                        className="rounded-xl bg-white px-3 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                      >
                        ← Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => approveActiveMetadata({ advance: true })}
                        disabled={activeMetadataMissingFields.length > 0}
                        className="rounded-xl bg-stone-950 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                      >
                        Keep →
                      </button>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-2xl font-semibold leading-tight text-stone-950">{getCreativeDrawerTitle(activeItem)}</h3>
                        <p className="mt-1 text-sm font-medium text-stone-500">{getCreativeDrawerMetaLine(activeItem)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(activeItem)}
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-lg ring-1 ring-stone-200 transition hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 ${activeItem.favorite ? 'text-ember-600' : 'text-stone-500'}`}
                        aria-label={activeItem.favorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-pressed={activeItem.favorite}
                      >
                        {activeItem.favorite ? '♥' : '♡'}
                      </button>
                    </div>

                    <div className="space-y-1.5 text-sm text-stone-600">
                      <p className="font-medium text-stone-500">{activeItem.mediaType === 'video' ? 'Video' : 'Photo'}</p>
                      {activeItem.photographerCreditRequired && (
                        <p className="font-medium text-amber-800">{createPhotoCreditDisplay(activeItem) || 'Credit required'}</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <MetadataReviewForm
                item={activeItem}
                onChange={updateActiveMetadata}
                missingFields={activeMetadataMissingFields}
              />

              <section className="grid gap-2 border-t border-stone-200 pt-5 sm:grid-cols-2">
                {metadataReviewNotice && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-100 sm:col-span-2">
                    {metadataReviewNotice}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => openDraftComposer([activeItem])}
                  className="rounded-xl bg-ember-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-ember-700"
                >
                  Create Content
                </button>
                <div className="relative">
                  <button
                    ref={libraryActionsButtonRef}
                    type="button"
                    onClick={() => setLibraryActionsOpen((current) => !current)}
                    className="w-full rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950"
                    aria-expanded={libraryActionsOpen}
                    aria-haspopup="menu"
                  >
                    More
                  </button>

                  {libraryActionsOpen && (
                    <div
                      ref={libraryActionsMenuRef}
                      role="menu"
                      className="absolute bottom-full right-0 z-20 mb-2 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-[0_18px_50px_rgba(28,25,23,0.18)] ring-1 ring-stone-200"
                    >
                    <button
                      type="button"
                        role="menuitem"
                        onClick={() => toggleFavoriteFromMenu(activeItem)}
                        className="block w-full px-4 py-3 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:bg-stone-50"
                    >
                        {activeItem.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                    </button>
                    <button
                      type="button"
                        role="menuitem"
                        onClick={() => toggleUsedFromMenu(activeItem)}
                        className="block w-full px-4 py-3 text-left text-sm font-semibold text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:bg-stone-50"
                    >
                      {activeItem.usedStatus === 'Used' ? 'Mark Unused' : 'Mark Used'}
                    </button>
                      {!activeItem.archived && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => archiveFromMenu(activeItem)}
                          className="block w-full px-4 py-3 text-left text-sm font-semibold text-stone-500 hover:bg-stone-50 focus-visible:outline-none focus-visible:bg-stone-50"
                        >
                          Archive
                        </button>
                      )}
                    <button
                      type="button"
                        role="menuitem"
                        onClick={() => requestDeleteItem(activeItem)}
                        className="block w-full px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                  )}
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}

      {itemToDelete && (
        <DeleteMediaDialog
          item={itemToDelete}
          onCancel={() => setItemToDelete(null)}
          onConfirm={() => deleteItem(itemToDelete)}
        />
      )}

      {lightboxItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 py-6" onClick={() => setLightboxMediaId(null)}>
          <div className="relative w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxMediaId(null)}
              className="absolute right-0 top-0 z-10 rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm hover:bg-white"
            >
              Close
            </button>
            <div className="flex max-h-[85vh] items-center justify-center overflow-hidden rounded-xl bg-stone-950 p-4 pt-14">
              <LocalMedia
                media={createMockMediaForContentBankItem(lightboxItem)}
                className="max-h-[75vh] w-full object-contain"
                controls={lightboxItem.mediaType === 'video'}
                muted={false}
              />
            </div>
          </div>
        </div>
      )}

      {storageInfoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4" onClick={() => setStorageInfoOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="storage-info-title"
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl ring-1 ring-stone-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ember-600">Local Storage</p>
                <h2 id="storage-info-title" className="mt-1 text-xl font-semibold text-stone-950">Storage Info</h2>
              </div>
              <button
                type="button"
                onClick={() => setStorageInfoOpen(false)}
                className="rounded-lg bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
              <p>Media is stored in this browser on this device.</p>
              <p>Cloud sync and cross-device access are coming later.</p>
              <p>Clearing browser data may remove local Content Library media and metadata.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function MetadataForm({
  values,
  onChange,
  className = '',
}: {
  values: typeof emptyBulkMeta
  onChange: (values: typeof emptyBulkMeta) => void
  className?: string
}) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      <Select label="Category" value={values.category} onChange={(value) => onChange({ ...values, category: value as ContentBankCategory })} options={CONTENT_BANK_CATEGORIES} />
      <ThemeInput label="Content Theme" value={values.contentTheme} onChange={(contentTheme) => onChange({ ...values, contentTheme })} />
      <TextInput label="Menu Items" value={values.foodItems} onChange={(value) => onChange({ ...values, foodItems: value })} placeholder="Margherita Pizza, roasted vegetables" />
      <TextInput label="Tags" value={values.tags} onChange={(value) => onChange({ ...values, tags: value })} placeholder="close-up, prep, buffet" />
      <Toggle label="Favorite" checked={values.favorite} onChange={(favorite) => onChange({ ...values, favorite })} />
      <label className="block sm:col-span-2 lg:col-span-3">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">Notes</span>
        <textarea value={values.notes} onChange={(event) => onChange({ ...values, notes: event.target.value })} className="textarea min-h-[90px]" />
      </label>
      <PhotoCreditForm values={values} onChange={onChange} />
    </div>
  )
}

function EditDetailsForm({ item, onChange }: { item: LocalContentBankItem; onChange: (updates: Partial<LocalContentBankItem>) => void }) {
  return (
    <div className="space-y-3">
      <TextInput label="Title" value={item.title} onChange={(title) => onChange({ title })} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">Description</span>
        <textarea value={item.description} onChange={(event) => onChange({ description: event.target.value })} className="textarea min-h-[90px]" />
      </label>
      <Select label="Category" value={item.category} onChange={(category) => onChange({ category: category as ContentBankCategory })} options={CONTENT_BANK_CATEGORIES} />
      <ThemeInput label="Content Theme" value={item.contentTheme} onChange={(contentTheme) => onChange({ contentTheme })} />
      <TextInput label="Menu Items" value={item.foodItems.join(', ')} onChange={(value) => onChange({ foodItems: splitList(value) })} />
      <TextInput label="Tags" value={item.tags.join(', ')} onChange={(value) => onChange({ tags: splitList(value) })} />
      <Toggle label="Favorite" checked={item.favorite} onChange={(favorite) => onChange({ favorite })} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">Notes</span>
        <textarea value={item.notes} onChange={(event) => onChange({ notes: event.target.value })} className="textarea min-h-[90px]" />
      </label>
      <PhotoCreditForm
        values={{
          category: item.category,
          contentTheme: item.contentTheme,
          foodItems: item.foodItems.join(', '),
          tags: item.tags.join(', '),
          favorite: item.favorite,
          notes: item.notes,
          photographerCreditRequired: item.photographerCreditRequired,
          photographerName: item.photographerName,
          photographerInstagram: item.photographerInstagram,
          photographerWebsite: item.photographerWebsite,
          photographerNotes: item.photographerNotes,
        }}
        onChange={(values) => onChange({
          photographerCreditRequired: values.photographerCreditRequired,
          photographerName: values.photographerName,
          photographerInstagram: normalizeInstagramHandle(values.photographerInstagram),
          photographerWebsite: values.photographerWebsite,
          photographerNotes: values.photographerNotes,
        })}
      />
    </div>
  )
}

function MetadataReviewForm({
  item,
  onChange,
  missingFields,
}: {
  item: LocalContentBankItem
  onChange: (updates: Partial<LocalContentBankItem>) => void
  missingFields: string[]
}) {
  const autoSuggested = item.metadataReviewStatus === 'Auto-suggested' || item.metadataReviewStatus === 'Needs Review'
  const aiSuggested = item.metadataReviewStatus === 'AI Suggested'
  const suggestedState: ReviewFieldState | undefined = aiSuggested ? 'AI generated' : autoSuggested ? 'Auto-suggested' : undefined
  const themeSuggestions = getContentThemeSuggestions({
    title: item.title,
    category: item.category,
    contentTheme: '',
    menuItems: item.foodItems,
    tags: item.tags,
    description: item.description,
  })
  const contentThemeState = getContentThemeFieldState(item)

  return (
    <section className="space-y-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
      <div>
        <h3 className="text-base font-semibold text-stone-950">Details Review</h3>
        <p className="mt-1 text-sm leading-6 text-stone-500">
          {aiSuggested
            ? 'These suggestions came from visual AI analysis of the uploaded photo.'
            : 'These suggestions are based on filenames and saved metadata.'}
        </p>
      </div>

      <ReviewTextInput label="Title" value={item.title} onChange={(title) => onChange({ title })} state={suggestedState} />
      <label className="block min-w-0">
        <ReviewFieldLabel label="Category" state={suggestedState} />
        <select
          value={item.category}
          onChange={(event) => onChange({ category: event.target.value as ContentBankCategory })}
          className="select"
        >
          {CONTENT_BANK_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <div>
        <ReviewFieldLabel label="Content Theme" state={contentThemeState} />
        <ThemeCombobox
          inputId="metadata-field-content-theme"
          label=""
          value={item.contentTheme}
          onChange={(contentTheme) => onChange({ contentTheme })}
          options={themeSuggestions}
          placeholder="Choose or create a theme"
        />
        {contentThemeState === 'Needs input' && <FieldWarning>Add a Content Theme before approving.</FieldWarning>}
      </div>
      <ChipEditor label="Menu Items" values={item.foodItems} onChange={(foodItems) => onChange({ foodItems })} placeholder="Add menu item..." state={suggestedState} />
      <ChipEditor label="Tags" values={item.tags} onChange={(tags) => onChange({ tags })} placeholder="Add tag..." state={suggestedState} />
      <PhotoCreditReviewFields item={item} onChange={onChange} state={suggestedState} />
      {item.metadataReasoning?.trim() && (
        <div className="rounded-xl bg-white p-3 text-xs leading-5 text-stone-500 ring-1 ring-stone-200">
          <ReviewFieldLabel label="Reasoning" state={aiSuggested ? 'AI generated' : undefined} />
          <p>{item.metadataReasoning}</p>
        </div>
      )}
    </section>
  )
}

function DeleteMediaDialog({
  item,
  onCancel,
  onConfirm,
}: {
  item: LocalContentBankItem
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 px-4 py-4 backdrop-blur-sm sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_24px_80px_rgba(28,25,23,0.24)]" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-xl font-semibold text-stone-950">Delete this media?</h2>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          This removes the Content Library record and its stored local media. Existing drafts that reference it may no longer display the asset.
        </p>
        <p className="mt-3 truncate text-xs font-semibold text-stone-400">{getCreativeDrawerTitle(item)}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
          >
            Delete Media
          </button>
        </div>
      </div>
    </div>
  )
}

function PhotoCreditReviewFields({
  item,
  onChange,
  state,
}: {
  item: LocalContentBankItem
  onChange: (updates: Partial<LocalContentBankItem>) => void
  state?: ReviewFieldState
}) {
  const hasCreditValue = Boolean(item.photographerName.trim() || item.photographerInstagram.trim() || item.photographerWebsite.trim())

  return (
    <section className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-stone-200">
      <div>
        <ReviewFieldLabel label="Photographer / Creator Credit" state={state} />
        <p className="mt-1 text-xs leading-5 text-stone-500">This credit follows the media into Content Studio drafts.</p>
      </div>
      <Toggle
        label="Credit Required"
        checked={item.photographerCreditRequired}
        onChange={(photographerCreditRequired) => onChange({ photographerCreditRequired })}
      />
      {item.photographerCreditRequired && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ReviewTextInput label="Name" value={item.photographerName} onChange={(photographerName) => onChange({ photographerName })} />
          <ReviewTextInput label="Instagram" value={item.photographerInstagram} onChange={(photographerInstagram) => onChange({ photographerInstagram: normalizeInstagramHandle(photographerInstagram) })} placeholder="@creator" />
          <ReviewTextInput label="Website" value={item.photographerWebsite} onChange={(photographerWebsite) => onChange({ photographerWebsite })} />
          <label className="block sm:col-span-2">
            <ReviewFieldLabel label="Credit Notes" />
            <DebouncedTextarea value={item.photographerNotes} onChange={(photographerNotes) => onChange({ photographerNotes })} className="textarea min-h-[72px]" />
          </label>
          {!hasCreditValue && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-100 sm:col-span-2">
              Add at least one credit value when credit is required.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function ReviewTextInput({
  label,
  value,
  onChange,
  placeholder = '',
  autoSuggested = false,
  state,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoSuggested?: boolean
  state?: ReviewFieldState
}) {
  const [inputValue, setInputValue] = useState(value)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    if (inputValue === value) return

    const timer = window.setTimeout(() => onChange(inputValue), 320)
    return () => window.clearTimeout(timer)
  }, [inputValue, onChange, value])

  return (
    <label className="block">
      <ReviewFieldLabel label={label} autoSuggested={autoSuggested} state={state} />
      <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder={placeholder} className="input" />
    </label>
  )
}

function DebouncedTextarea({
  value,
  onChange,
  className,
  placeholder = '',
}: {
  value: string
  onChange: (value: string) => void
  className: string
  placeholder?: string
}) {
  const [inputValue, setInputValue] = useState(value)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    if (inputValue === value) return

    const timer = window.setTimeout(() => onChange(inputValue), 320)
    return () => window.clearTimeout(timer)
  }, [inputValue, onChange, value])

  return <textarea value={inputValue} onChange={(event) => setInputValue(event.target.value)} className={className} placeholder={placeholder} />
}

type ReviewFieldState = 'Auto-suggested' | 'AI generated' | 'Manually entered' | 'Needs input'

function ReviewFieldLabel({
  label,
  autoSuggested = false,
  state,
}: {
  label: string
  autoSuggested?: boolean
  state?: ReviewFieldState
}) {
  const visibleState = state ?? (autoSuggested ? 'Auto-suggested' : '')

  return (
    <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
      {label}
      {visibleState && (
        <span className={`normal-case tracking-normal ${visibleState === 'Needs input' ? 'text-amber-700' : 'text-stone-400'}`}>
          {visibleState}
        </span>
      )}
    </span>
  )
}

function FieldWarning({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs font-semibold text-amber-800">{children}</p>
}

function ChipEditor({
  label,
  values,
  onChange,
  placeholder,
  autoSuggested = false,
  state,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder: string
  autoSuggested?: boolean
  state?: ReviewFieldState
}) {
  const [inputValue, setInputValue] = useState('')

  function addValues(rawValue: string) {
    const nextValues = splitList(rawValue).map(normalizeChipValue).filter(Boolean)
    if (nextValues.length === 0) return

    onChange(uniqueByLowercase([...values.map(normalizeChipValue), ...nextValues].filter(Boolean)))
    setInputValue('')
  }

  function removeValue(value: string) {
    onChange(values.filter((item) => item.toLowerCase() !== value.toLowerCase()))
  }

  return (
    <div>
      <ReviewFieldLabel label={label} autoSuggested={autoSuggested} state={state} />
      <div className="rounded-xl bg-white p-2 ring-1 ring-stone-200">
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span key={value} className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
              {value}
              <button type="button" onClick={() => removeValue(value)} className="text-stone-400 hover:text-red-600" aria-label={`Remove ${value}`}>
                ×
              </button>
            </span>
          ))}
          <input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onPaste={(event) => {
              const pastedText = event.clipboardData.getData('text')
              if (!pastedText.includes(',')) return
              event.preventDefault()
              addValues(pastedText)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                addValues(inputValue)
              }
              if (event.key === 'Backspace' && !inputValue && values.length > 0) {
                removeValue(values[values.length - 1])
              }
            }}
            onBlur={() => addValues(inputValue)}
            placeholder={placeholder}
            className="min-h-[34px] min-w-[130px] flex-1 bg-transparent px-2 text-sm text-stone-900 outline-none placeholder:text-stone-400"
          />
        </div>
      </div>
    </div>
  )
}

function ReviewStatusPill({ status }: { status: ContentBankMetadataReviewStatus }) {
  const className = {
    'Needs Review': 'bg-amber-50 text-amber-800 ring-amber-100',
    'Auto-suggested': 'bg-sky-50 text-sky-800 ring-sky-100',
    'AI Suggested': 'bg-violet-50 text-violet-800 ring-violet-100',
    Approved: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    'Manually Edited': 'bg-stone-100 text-stone-700 ring-stone-200',
  }[status]

  return <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${className}`}>{status}</span>
}

function SaveStatus({ status }: { status: DrawerSaveStatus }) {
  if (status === 'saving') return <span className="text-xs font-semibold text-stone-500">Saving...</span>
  if (status === 'saved') return <span className="text-xs font-semibold text-emerald-700">✓ Saved</span>
  return null
}

function DetailFacts({ item }: { item: LocalContentBankItem }) {
  const creditText = createPhotoCreditDisplay(item)
  const menuItems = item.foodItems.join(', ')
  const tags = item.tags.join(' · ')

  return (
    <section className="space-y-6">
      <DetailTextBlock label="Category" value={item.category} />
      <DetailTextBlock label="Content Theme" value={item.contentTheme} />
      <DetailTextBlock label="Menu Item" value={menuItems} />
      <DetailTextBlock label="Photographer" value={creditText} />
      <DetailTextBlock label="Tags" value={tags} />

      {item.description.trim() && <DetailTextBlock label="Description" value={item.description} />}
      {item.notes.trim() && <DetailTextBlock label="Notes" value={item.notes} />}

      {item.photographerCreditRequired && (
        <p className="text-xs font-semibold text-amber-700">Credit is required whenever this media is used.</p>
      )}
    </section>
  )
}

function getNextMetadataReviewStatus(
  currentStatus: ContentBankMetadataReviewStatus,
  updates: Partial<LocalContentBankItem>
): ContentBankMetadataReviewStatus {
  if (updates.metadataReviewStatus) return updates.metadataReviewStatus
  if (currentStatus === 'Approved') return 'Manually Edited'
  if (currentStatus === 'Manually Edited') return 'Manually Edited'
  return 'Needs Review'
}

function getMissingMetadataFields(item: LocalContentBankItem) {
  const missingFields: string[] = []

  if (!item.category.trim()) missingFields.push('Category')
  if (!item.contentTheme.trim()) missingFields.push('Content Theme')

  return missingFields
}

function formatMissingFields(fields: string[]) {
  if (fields.length === 1) return fields[0]
  if (fields.length === 2) return `${fields[0]} and ${fields[1]}`
  return `${fields.slice(0, -1).join(', ')}, and ${fields[fields.length - 1]}`
}

function getContentThemeFieldState(item: LocalContentBankItem): ReviewFieldState {
  if (!item.contentTheme.trim()) return 'Needs input'
  if (item.metadataReviewStatus === 'AI Suggested') return 'AI generated'
  if (item.metadataReviewStatus === 'Auto-suggested' || item.metadataReviewStatus === 'Needs Review') return 'Auto-suggested'
  return 'Manually entered'
}

function getSuggestionSourceLabel(item: LocalContentBankItem) {
  if (item.suggestionSource === 'ai') return 'AI generated'
  if (item.suggestionSource === 'manual' || item.metadataReviewStatus === 'Manually Edited') return 'User entered'
  if (item.suggestionSource === 'imported') return 'Imported'
  return 'Local metadata rules'
}

function normalizeChipValue(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) => part.length > 2 || part === part.toUpperCase() ? capitalize(part.toLowerCase()) : part.toLowerCase())
    .join(' ')
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

function uniqueByLowercase(values: string[]) {
  const seen = new Set<string>()

  return values.filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-sm font-semibold text-stone-900">{value}</p>
    </div>
  )
}

function DetailTextBlock({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-sm leading-6 text-stone-700">{value}</p>
    </div>
  )
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{children}</p>
}

function PhotoCreditForm({
  values,
  onChange,
}: {
  values: typeof emptyBulkMeta
  onChange: (values: typeof emptyBulkMeta) => void
}) {
  const hasCreditValue = Boolean(values.photographerName.trim() || values.photographerInstagram.trim() || values.photographerWebsite.trim())

  return (
    <section className="space-y-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-100 sm:col-span-2 lg:col-span-3">
      <div>
        <h3 className="text-sm font-semibold text-stone-950">Photo Credit</h3>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          This credit will be included whenever this media is used in a post.
        </p>
      </div>
      <Toggle
        label="This media was created by someone outside Fireova"
        checked={values.photographerCreditRequired}
        onChange={(photographerCreditRequired) => onChange({ ...values, photographerCreditRequired })}
      />
      {values.photographerCreditRequired && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Photographer / Creator Name" value={values.photographerName} onChange={(photographerName) => onChange({ ...values, photographerName })} />
          <TextInput label="Instagram Handle" value={values.photographerInstagram} onChange={(photographerInstagram) => onChange({ ...values, photographerInstagram: normalizeInstagramHandle(photographerInstagram) })} placeholder="@janephoto" />
          <TextInput label="Website" value={values.photographerWebsite} onChange={(photographerWebsite) => onChange({ ...values, photographerWebsite })} />
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">Notes</span>
            <textarea value={values.photographerNotes} onChange={(event) => onChange({ ...values, photographerNotes: event.target.value })} className="textarea min-h-[80px]" />
          </label>
          {!hasCreditValue && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-100 sm:col-span-2">
              Add at least one credit value when credit is required.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 text-sm">
      <span className="font-semibold text-stone-500">{label}</span>
      <span className="min-w-0 text-stone-900">{value}</span>
    </div>
  )
}

function Select({ label, value, onChange, options, dark = false }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; dark?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className={`mb-1.5 block text-xs font-semibold uppercase tracking-wide ${dark ? 'text-stone-300' : 'text-stone-500'}`}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={dark ? 'w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-white' : 'select'}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function TextInput({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="input" />
    </label>
  )
}

function ThemeInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <ThemeCombobox
      label={label}
      value={value}
      onChange={onChange}
      options={CONTENT_BANK_THEMES}
      placeholder="Choose or create a theme"
    />
  )
}

function ThemeFilterInput({
  value,
  onChange,
  options,
}: {
  value: 'All' | string
  onChange: (value: 'All' | string) => void
  options: string[]
}) {
  return (
    <ThemeCombobox
      label="Content Theme"
      value={value === 'All' ? '' : value}
      onChange={(nextValue) => onChange(nextValue.trim() ? nextValue : 'All')}
      options={options}
      placeholder="All Themes"
      clearLabel="All Themes"
    />
  )
}

function ThemeCombobox({
  inputId,
  label,
  value,
  onChange,
  options,
  placeholder,
  clearLabel = 'Clear',
}: {
  inputId?: string
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder: string
  clearLabel?: string
}) {
  const generatedId = useId()
  const listId = inputId ?? generatedId
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [inputValue, setInputValue] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const filteredOptions = useMemo(() => {
    const normalizedInput = inputValue.trim().toLowerCase()
    const baseOptions = unique(options.map((option) => option.trim()).filter(Boolean))

    if (!normalizedInput) return baseOptions

    return baseOptions.filter((option) => option.toLowerCase().includes(normalizedInput))
  }, [inputValue, options])

  function commitValue(nextValue: string) {
    const trimmedValue = nextValue.trim()
    setInputValue(trimmedValue)
    onChange(trimmedValue)
    setOpen(false)
    setHighlightedIndex(-1)
  }

  function clearValue() {
    setInputValue('')
    onChange('')
    setOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  return (
    <div ref={wrapperRef} className="block">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {label ? <label htmlFor={listId} className="block text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</label> : <span />}
        {inputValue.trim() && (
          <button
            type="button"
            onClick={clearValue}
            className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950"
          >
            {clearLabel}
          </button>
        )}
      </div>
      <div className="relative">
        <input
          id={listId}
          ref={inputRef}
          value={inputValue}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            const nextValue = event.target.value
            setInputValue(nextValue)
            onChange(nextValue)
            setOpen(true)
            setHighlightedIndex(0)
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false)
              setInputValue((currentValue) => {
                const trimmedValue = currentValue.trim()
                onChange(trimmedValue)
                return trimmedValue
              })
            }, 120)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setHighlightedIndex((currentIndex) => {
                if (filteredOptions.length === 0) return -1
                return currentIndex < filteredOptions.length - 1 ? currentIndex + 1 : 0
              })
              return
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              setHighlightedIndex((currentIndex) => {
                if (filteredOptions.length === 0) return -1
                return currentIndex > 0 ? currentIndex - 1 : filteredOptions.length - 1
              })
              return
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              if (open && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
                commitValue(filteredOptions[highlightedIndex])
                return
              }
              commitValue(inputValue)
              return
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              setHighlightedIndex(-1)
            }
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined}
          className="input"
        />
        {open && filteredOptions.length > 0 && (
          <div
            id={`${listId}-listbox`}
            role="listbox"
            className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-[0_18px_40px_rgba(28,25,23,0.12)]"
          >
            {filteredOptions.map((option, index) => {
              const highlighted = index === highlightedIndex

              return (
                <button
                  key={option}
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={highlighted}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitValue(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
                    highlighted ? 'bg-stone-950 text-white' : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {option}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-[42px] items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-stone-200">
      <span className="text-sm font-semibold text-stone-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-stone-950" />
    </label>
  )
}

function BulkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15">{children}</button>
}

function modeButtonClass(active: boolean) {
  return `rounded-lg px-3 py-2 text-xs font-semibold ${active ? 'bg-stone-950 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200'}`
}

function quickFilterButtonClass(active: boolean) {
  return `rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950 ${
    active ? 'bg-stone-950 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50'
  }`
}

function getCardCategory(item: LocalContentBankItem) {
  return item.category?.trim() || 'Uncategorized'
}

function getGalleryTitle(item: LocalContentBankItem) {
  const explicitTitle = getMeaningfulTitle(item.title, item.originalFileName)
  if (explicitTitle) return explicitTitle

  const menuItem = getPrimaryMenuItem(item)
  if (menuItem && isFoodCategory(item.category)) return finalizeDrawerCopy(menuItem)

  const contentTheme = normalizeHumanLabel(item.contentTheme)
  const contextTitle = getPrimaryContextTag(item, 'title')

  if (contentTheme && contextTitle === 'Wedding') return finalizeDrawerCopy(`Wedding ${contentTheme}`)
  if (item.category === 'Team') return contentTheme ? finalizeDrawerCopy(`Fireova ${contentTheme}`) : 'Fireova Team'
  if (item.category === 'Fireova Setup') return contentTheme ? finalizeDrawerCopy(`Fireova ${contentTheme}`) : 'Fireova Setup'
  if (contentTheme) return contentTheme

  return getCategoryFallbackTitle(item.category)
}

function getMeaningfulTitle(value: string, originalFileName: string) {
  const title = value.trim()
  return title && !isFileNameLikeCardTitle(title, originalFileName) ? title : ''
}

function getCreativeDrawerTitle(item: LocalContentBankItem) {
  const explicitTitle = getMeaningfulTitle(item.title, item.originalFileName)
  if (explicitTitle) return explicitTitle

  const menuItem = getPrimaryMenuItem(item)
  const contentTheme = normalizeHumanLabel(item.contentTheme)
  const contextTitle = getPrimaryContextTag(item, 'title')

  if (contentTheme && contextTitle === 'Wedding') {
    return finalizeDrawerCopy(`Wedding ${contentTheme}`)
  }

  if (item.category === 'Fireova Setup' && contextTitle) {
    return finalizeDrawerCopy(`Fireova ${contextTitle} Setup`)
  }

  if (item.category === 'Team' && contentTheme) {
    return finalizeDrawerCopy(`Team ${contentTheme}`)
  }

  if (menuItem && isFoodCategory(item.category)) {
    return finalizeDrawerCopy(menuItem)
  }

  if (contentTheme && contextTitle) {
    return finalizeDrawerCopy(`${contextTitle} ${contentTheme}`)
  }

  if (menuItem && contentTheme) {
    return finalizeDrawerCopy(`${menuItem}`)
  }

  if (item.category && contentTheme) {
    return finalizeDrawerCopy(`${item.category} ${contentTheme}`)
  }

  if (menuItem) return finalizeDrawerCopy(menuItem)
  if (contentTheme) return finalizeDrawerCopy(contentTheme)

  return finalizeDrawerCopy(getCategoryFallbackTitle(item.category))
}

function getCreativeDrawerEyebrow(item: LocalContentBankItem) {
  return [item.category, item.contentTheme.trim()].filter(Boolean).join(' • ') || item.category
}

function getCreativeDrawerMetaLine(item: LocalContentBankItem) {
  const values = [
    item.category,
    normalizeHumanLabel(item.contentTheme),
    getPrimaryContextTag(item, 'title'),
  ].filter(Boolean)

  return unique(values).join(' · ') || item.category
}

function getSuggestedPostIdeas(item: LocalContentBankItem) {
  const contentTheme = item.contentTheme.trim().toLowerCase()
  const category = item.category.trim().toLowerCase()
  const context = getPrimaryContextTag(item, 'label')
  const menuItem = getPrimaryMenuItem(item)
  const ideas: Array<{ angle: ContentBankAngle; label: string }> = []

  function addIdea(angle: ContentBankAngle, label?: string) {
    if (!ideas.some((idea) => idea.label === (label ?? angle))) {
      ideas.push({ angle, label: label ?? angle })
    }
  }

  if (context === 'wedding') {
    addIdea('Brand Awareness', 'Wedding Highlight')
  }

  if (contentTheme.includes('couple')) {
    addIdea('Brand Awareness', 'Couple Moment')
  }

  if (category.includes('pizza') || contentTheme.includes('pizza') || contentTheme.includes('slice') || contentTheme.includes('oven')) {
    addIdea('Food Feature', 'Pizza Feature')
  }

  if (item.category === 'Team') {
    addIdea('Team Spotlight')
  }

  if (contentTheme.includes('guest') || contentTheme.includes('serving') || context === 'guest') {
    addIdea('Catering Promotion', 'Guest Experience')
  }

  if (category.includes('charcuterie') || category.includes('salads') || category.includes('small bites') || category.includes('desserts') || Boolean(menuItem)) {
    addIdea('Food Feature')
  }

  if (item.category === 'Charcuterie' || item.category === 'Fireova Setup') {
    addIdea('Catering Promotion', 'Event Detail')
  }

  if (category.includes('brand') || category.includes('team') || contentTheme.includes('behind') || item.category === 'Fireova Setup') {
    addIdea('Behind the Scenes')
  }

  if (item.category === 'Brand' || item.category === 'Behind the Scenes' || item.category === 'Fireova Setup') {
    addIdea('Brand Awareness')
  }

  if (ideas.length === 0) {
    addIdea(isFoodCategory(item.category) ? 'Food Feature' : 'Brand Awareness')
  }

  return ideas.slice(0, 4)
}

function getDetailDrawerHeading(item: LocalContentBankItem) {
  return getMeaningfulTitle(item.title, item.originalFileName) || 'Media Details'
}

function getWhyThisPhotoWorks(item: LocalContentBankItem) {
  const contentTheme = normalizeHumanLabel(item.contentTheme).toLowerCase()
  const menuItem = getPrimaryMenuItem(item)
  const context = getPrimaryContextTag(item, 'label')

  if (item.category === 'Team' && (contentTheme.includes('serving guests') || context === 'guest')) {
    return finalizeDrawerCopy('Shows the Fireova team actively serving guests, which makes the brand feel personal and approachable.')
  }

  if (context === 'wedding' && isPizzaLike(item) && contentTheme.includes('cutting')) {
    return finalizeDrawerCopy('Captures a memorable wedding moment while clearly featuring Fireova’s pizza. Strong for a couple-focused or wedding-highlight post.')
  }

  if (item.category === 'Charcuterie' && menuItem) {
    return finalizeDrawerCopy('The presentation and close detail make this a strong food-feature image for catering and event marketing.')
  }

  if (menuItem && isFoodCategory(item.category)) {
    return finalizeDrawerCopy(`Highlights ${menuItem} in a way that feels specific and appetizing. Strong choice for a food-focused or catering post.`)
  }

  if (contentTheme && item.category === 'Team') {
    return finalizeDrawerCopy(`Shows the Fireova team during ${contentTheme}, which helps the brand feel hands-on and approachable.`)
  }

  if (contentTheme && context) {
    return finalizeDrawerCopy(`Gives you a clear ${context}-focused ${contentTheme} moment, which makes the post direction easy to define.`)
  }

  if (contentTheme) {
    return finalizeDrawerCopy(`The ${contentTheme} angle gives this asset a clear story, which makes it easier to turn into focused marketing content.`)
  }

  return finalizeDrawerCopy(`A simple, flexible ${getCategoryDescriptor(item)} asset that can support menu, event, or brand storytelling.`)
}

function getWhyThisMediaWorksBullets(item: LocalContentBankItem) {
  const bullets: string[] = []
  const contentTheme = normalizeHumanLabel(item.contentTheme)
  const menuItem = getPrimaryMenuItem(item)
  const context = getPrimaryContextTag(item, 'label')

  function addBullet(value: string) {
    const cleaned = finalizeDrawerCopy(value)
    if (cleaned && !bullets.includes(cleaned)) {
      bullets.push(cleaned)
    }
  }

  if (context === 'wedding') {
    addBullet('Wedding context gives the image a clear celebration angle.')
  }

  if (contentTheme) {
    addBullet(`${contentTheme} gives the post a specific built-in story.`)
  }

  if (menuItem && isFoodCategory(item.category)) {
    addBullet(`${menuItem} keeps the food focus clear.`)
  }

  if (item.category === 'Team') {
    addBullet('The Fireova team is the clear subject, which supports people-first brand storytelling.')
  }

  if (item.category === 'Fireova Setup') {
    addBullet('Setup-focused content helps show the event experience beyond the finished food.')
  }

  if (item.category === 'Charcuterie') {
    addBullet('Charcuterie content works well for catering, grazing-table, and event-detail storytelling.')
  }

  if ((contentTheme.toLowerCase().includes('serving') || context === 'guest') && item.category === 'Team') {
    addBullet('Guest-facing action makes the service experience feel more personal.')
  }

  if (isPizzaLike(item)) {
    addBullet('Fireova pizza is central to the story, which makes the content feel on-brand.')
  }

  if (item.photographerCreditRequired && createPhotoCreditDisplay(item)) {
    addBullet(`Credit is already tracked as ${createPhotoCreditDisplay(item)}.`)
  }

  if (bullets.length === 0) {
    addBullet(`${item.category} gives the post a clear subject without relying on extra context.`)
  }

  return bullets.slice(0, 3)
}

function getSuggestedCaption(item: LocalContentBankItem, selectedIdeaLabel: string, variant: number, angle: ContentBankAngle) {
  const menuItem = getPrimaryMenuItem(item)
  const contentTheme = normalizeHumanLabel(item.contentTheme)
  const context = getPrimaryContextTag(item, 'label')
  const idea = selectedIdeaLabel || angle
  const lowerIdea = idea.toLowerCase()
  const captionOptions: string[] = []

  if (lowerIdea.includes('wedding')) {
    captionOptions.push(
      'A wedding cake moment, but make it pizza. We loved watching this couple share their first cut with a fresh Fireova pie.',
      'A fresh Fireova pie and a wedding moment worth remembering. This is such a fun way to make the first cut feel personal.',
      `Wedding food should feel just as memorable as the rest of the celebration. ${menuItem ? `${menuItem} made this moment even better.` : 'Fireova made this moment even more fun.'}`
    )
  }

  if (lowerIdea.includes('couple')) {
    captionOptions.push(
      'A sweet moment, a fresh pie, and a celebration built around sharing good food. This is one of our favorite kinds of wedding memories.',
      'There are a lot of ways to make a wedding meal memorable. Sharing a fresh Fireova pizza is a pretty great one.',
      'A couple moment that feels personal, relaxed, and genuinely fun. Fireova pizza fit right into the celebration.'
    )
  }

  if (lowerIdea.includes('pizza') || angle === 'Food Feature') {
    captionOptions.push(
      menuItem
        ? `${menuItem} looking exactly the way it should: hot, fresh, and ready for one more slice.`
        : 'Fresh from the oven and ready to disappear slice by slice. This is the kind of Fireova pizza people remember.',
      menuItem
        ? `This is why ${menuItem} is always a crowd favorite at Fireova events.`
        : 'Good pizza has a way of bringing everyone closer to the table. Fireova is happy to help with that.',
      menuItem
        ? `${menuItem} is doing all the talking here.`
        : 'Simple, fresh, and made to be shared. That is the Fireova way.'
    )
  }

  if (lowerIdea.includes('team') || item.category === 'Team') {
    captionOptions.push(
      'Fresh pizza, smiling faces, and a team that loves taking care of the details. This is what event day looks like with Fireova.',
      contentTheme
        ? `From ${contentTheme.toLowerCase()} to the final handoff, the Fireova team keeps the experience smooth and welcoming.`
        : 'Behind every great Fireova event is a team that cares about the details and the people in front of them.',
      'The food matters, but so does the team behind it. This is the kind of service that makes an event feel easy.'
    )
  }

  if (lowerIdea.includes('guest')) {
    captionOptions.push(
      'Good food always brings people together. Fireova loves being part of the moments guests remember most.',
      'When the food is fresh and the service feels easy, guests notice. That is what we aim for at every Fireova event.',
      'Gather, grab a slice, and go back for another. That is the energy we love bringing to events.'
    )
  }

  if (lowerIdea.includes('event detail') || item.category === 'Fireova Setup') {
    captionOptions.push(
      context === 'wedding'
        ? 'The little details help set the tone for the whole wedding, and Fireova loves being part of that atmosphere.'
        : 'The setup matters just as much as the food. Fireova aims for an experience that feels polished from the start.',
      'A strong event setup makes the whole experience feel more inviting before the first slice is even served.',
      'Details like this help guests understand the experience before they even take a bite.'
    )
  }

  if (item.category === 'Charcuterie' || lowerIdea.includes('catering')) {
    captionOptions.push(
      'A colorful spread built for grazing, gathering, and going back for one more bite.',
      menuItem
        ? `${menuItem} brings the kind of detail that makes a catering spread feel thoughtful and abundant.`
        : 'Built for sharing and easy conversation, this is the kind of spread guests keep circling back to.',
      'Good catering should feel generous, beautiful, and easy to enjoy. This spread checks all three boxes.'
    )
  }

  if (captionOptions.length === 0) {
    captionOptions.push(
      `A strong ${getCategoryDescriptor(item)} moment from Fireova, ready to support a warm and story-driven post.`,
      contentTheme
        ? `${contentTheme} is doing the heavy lifting here, giving this Fireova asset a clear and useful direction.`
        : 'A simple Fireova moment that can flex across menu, brand, or event storytelling.',
      context
        ? `A natural fit for ${context} marketing, without needing to force the story.`
        : 'Easy to build into a clean, warm Fireova post without overexplaining the moment.'
    )
  }

  return finalizeDrawerCopy(captionOptions[variant % captionOptions.length])
}

function getPrimaryMenuItem(item: LocalContentBankItem) {
  return item.foodItems.find((value) => value.trim())?.trim() ?? ''
}

function isFoodCategory(category: ContentBankCategory) {
  return ['Pizza', 'Salads', 'Charcuterie', 'Small Bites', 'Sides', 'Desserts'].includes(category)
}

function isPizzaLike(item: LocalContentBankItem) {
  const category = item.category.toLowerCase()
  const theme = item.contentTheme.toLowerCase()
  const menuItem = getPrimaryMenuItem(item).toLowerCase()
  return category.includes('pizza') || theme.includes('pizza') || theme.includes('slice') || theme.includes('oven') || menuItem.includes('pizza')
}

function getPrimaryContextTag(item: LocalContentBankItem, style: 'label' | 'title') {
  const normalizedTags = unique(item.tags.map((tag) => normalizeContextTag(tag)).filter(Boolean))
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

function normalizeHumanLabel(value: string) {
  return finalizeDrawerCopy(value.replace(/\s+/g, ' ').trim())
}

function getCategoryFallbackTitle(category: ContentBankCategory) {
  switch (category) {
    case 'Team':
      return 'Fireova Team'
    case 'Fireova Setup':
      return 'Fireova Setup'
    case 'Brand':
      return 'Fireova Brand'
    case 'Behind the Scenes':
      return 'Behind the Scenes'
    default:
      return category
  }
}

function getCategoryDescriptor(item: LocalContentBankItem) {
  switch (item.category) {
    case 'Team':
      return 'team-focused'
    case 'Charcuterie':
      return 'charcuterie'
    case 'Fireova Setup':
      return 'event setup'
    case 'Brand':
      return 'brand'
    case 'Behind the Scenes':
      return 'behind-the-scenes'
    default:
      return item.category.toLowerCase()
  }
}

function toTitleCase(value: string) {
  return value
    .split(' ')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}

function finalizeDrawerCopy(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\b(\w+)\s+\1\b/gi, '$1')
    .replace(/\bWeddings\b/g, 'Wedding')
    .replace(/\bwith a weddings context\b/gi, 'for wedding marketing')
    .replace(/\bmaria marketing\b/gi, 'marketing')
    .replace(/\bteam media\b/gi, 'the Fireova team')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()
}

function createPhotoCreditDisplay(item: LocalContentBankItem) {
  const creditText = createMediaCreditText(item)
  if (!creditText) return ''

  return creditText.replace(/^Photo:/, 'Photo by').replace(/^Video:/, 'Video by')
}

function isFileNameLikeCardTitle(value: string, originalFileName: string) {
  const normalizedValue = normalizeCardText(value)
  const normalizedFileName = normalizeCardText(originalFileName)
  const normalizedFileStem = normalizeCardText(originalFileName.replace(/\.[^.]+$/, ''))
  const compactValue = normalizedValue.replace(/[^a-z0-9]/g, '')
  const compactFileName = normalizedFileName.replace(/[^a-z0-9]/g, '')
  const compactFileStem = normalizedFileStem.replace(/[^a-z0-9]/g, '')
  const trimmedValue = value.trim()

  return (
    normalizedValue === normalizedFileName ||
    normalizedValue === normalizedFileStem ||
    compactValue === compactFileName ||
    compactValue === compactFileStem ||
    /\.(jpe?g|png|heic|webp|gif|mov|mp4|m4v|avi)$/i.test(trimmedValue) ||
    /^img[\s_-]*\d{3,}$/i.test(trimmedValue) ||
    /^\d{8,}$/.test(compactValue) ||
    (compactValue.length >= 10 && /^\d/.test(compactValue)) ||
    (/^[a-z0-9_-]{10,}$/i.test(trimmedValue) && /[0-9_-]/.test(trimmedValue))
  )
}

function normalizeCardText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function splitList(value: string) {
  return unique(value.split(',').map((item) => item.trim()).filter(Boolean))
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function getContentThemeOptions(...collections: LocalContentBankItem[][]) {
  return unique(
    [...CONTENT_BANK_THEMES, ...collections.flatMap((items) => items.map((item) => item.contentTheme.trim()))]
      .map((theme) => theme.trim())
      .filter(Boolean)
  )
}

function getUploadStatusLabel(item: UploadQueueItem) {
  switch (item.status) {
    case 'waiting':
      return 'Waiting...'
    case 'checking_duplicate':
      return 'Checking duplicate...'
    case 'uploading':
      return 'Uploading...'
    case 'analyzing':
      return 'Analyzing...'
    case 'saved':
      return 'Saved'
    case 'duplicate':
      return 'Duplicate found'
    case 'failed':
      return 'Upload failed'
    case 'canceled':
      return 'Canceled'
    default:
      return 'Waiting...'
  }
}

function uploadStatusClass(status: UploadQueueStatus) {
  switch (status) {
    case 'waiting':
      return 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
    case 'checking_duplicate':
      return 'bg-amber-50 text-amber-900 ring-1 ring-amber-100'
    case 'uploading':
      return 'bg-sky-50 text-sky-800 ring-1 ring-sky-100'
    case 'analyzing':
      return 'bg-violet-50 text-violet-800 ring-1 ring-violet-100'
    case 'saved':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
    case 'duplicate':
      return 'bg-amber-50 text-amber-900 ring-1 ring-amber-100'
    case 'failed':
      return 'bg-red-50 text-red-700 ring-1 ring-red-100'
    case 'canceled':
      return 'bg-stone-100 text-stone-500 ring-1 ring-stone-200'
    default:
      return 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'
  }
}

function debugUpload(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'development') return
  console.debug('[Fireova upload]', ...args)
}

function isSupportedContentBankUploadFile(file: File) {
  if (file.name.startsWith('.') || file.name === '.DS_Store') return false
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true

  return /\.(jpe?g|png|webp|heic|heif|gif|mp4|mov|m4v|avi|webm)$/i.test(file.name)
}


function isInteractiveSwipeTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select, [role="button"], [role="menuitem"]'))
}

function hasDraggedFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types ?? []).includes('Files')
}

function isPointerInsideElement(event: DragEvent, element: HTMLElement | null) {
  if (!element) return false

  const rect = element.getBoundingClientRect()
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
