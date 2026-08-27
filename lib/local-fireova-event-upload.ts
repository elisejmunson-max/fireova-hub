import {
  createLocalEventId,
  dedupeMedia,
  deleteLocalEvent,
  FIREOVA_EVENT_TYPES,
  getEventDetailPath,
  normalizeEventType,
  saveLocalEvent,
  type FireovaEventType,
  type LocalEventVendor,
  type LocalFireovaEvent,
} from '@/lib/local-fireova-events'
import {
  deleteIndexedDbMediaByIds,
  getUploadFileMediaKind,
  isSupportedEventUploadFile,
  saveIndexedDbMediaFile,
} from '@/lib/local-fireova-media'
import type { MockMedia } from '@/lib/mock-fireova-content'
import { normalizeInstagramHandle } from '@/lib/local-fireova-vendors'

export type FileSystemEntryLike = {
  isFile: boolean
  isDirectory: boolean
  name: string
}

export type FileSystemFileEntryLike = FileSystemEntryLike & {
  file: (successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void
}

export type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader: () => {
    readEntries: (successCallback: (entries: FileSystemEntryLike[]) => void, errorCallback?: (error: DOMException) => void) => void
  }
}

export type DataTransferItemWithEntry = Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'> & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null
}

export type DataTransferWithUploadItems = Pick<DataTransfer, 'types'> & {
  files?: ArrayLike<File>
  items?: ArrayLike<DataTransferItemWithEntry>
}

export type PendingEventMediaItem = {
  id: string
  file: File
  signature: string
  relativePath: string
  kind: 'photo' | 'video'
}

export type PendingMediaPreviewType = 'Feed' | 'Reel' | 'Carousel'

export function getPendingMediaPreviewType(
  item: Pick<PendingEventMediaItem, 'kind'>,
  explicitlyGroupedAsCarousel = false
): PendingMediaPreviewType {
  if (explicitlyGroupedAsCarousel && item.kind === 'photo') return 'Carousel'
  return item.kind === 'video' ? 'Reel' : 'Feed'
}

export type PendingEventMediaBatchResult = {
  items: PendingEventMediaItem[]
  addedCount: number
  duplicateCount: number
}

export class DraftEventCreationError extends Error {
  constructor(
    public readonly code: 'NO_SUPPORTED_MEDIA' | 'MEDIA_SAVE_FAILED' | 'EVENT_SAVE_FAILED',
    message: string
  ) {
    super(message)
    this.name = 'DraftEventCreationError'
  }
}

export type DraftEventCreationResult = {
  event: LocalFireovaEvent
  acceptedCount: number
  rejectedCount: number
  duplicateCount: number
}

export type PendingEventDetails = {
  name: string
  date: string
  type: FireovaEventType
  venueName?: string
  venueInstagram?: string
  venueVendorId?: string
  vendors?: LocalEventVendor[]
}

export type PendingEventDetailsValidation = Partial<Record<keyof PendingEventDetails | 'media', string>>

export const DEFAULT_PENDING_EVENT_DETAILS: PendingEventDetails = {
  name: 'Untitled Event',
  date: formatEventDateInputValue(new Date()),
  type: 'Other',
  venueName: '',
  venueInstagram: '',
  venueVendorId: undefined,
  vendors: [],
}

export function getDraftEventDestination(eventId: string) {
  return getEventDetailPath(eventId)
}

export function buildDraftEventFromMedia(
  media: MockMedia[],
  now = new Date(),
  details: Partial<PendingEventDetails> = {}
): LocalFireovaEvent {
  const dedupedMedia = dedupeMedia(media)
  const cover = dedupedMedia[0]

  if (!cover) {
    throw new DraftEventCreationError('NO_SUPPORTED_MEDIA', 'No supported photos or videos were found.')
  }

  const eventName = normalizePendingEventName(details.name)
  return {
    id: createLocalEventId(eventName),
    name: eventName,
    type: normalizeEventType(details.type),
    date: formatEventDateForStorage(details.date) || formatEventDateForStorage(formatEventDateInputValue(now)),
    venueName: cleanPendingOptionalValue(details.venueName),
    venueInstagram: cleanPendingOptionalValue(details.venueInstagram),
    venueVendorId: cleanPendingOptionalValue(details.venueVendorId),
    vendors: details.vendors?.length ? details.vendors : undefined,
    status: 'Needs Content',
    draftCount: 0,
    cover,
    media: dedupedMedia,
    createdAt: now.toISOString(),
  }
}

export function validatePendingEventDetails(items: PendingEventMediaItem[], details: PendingEventDetails) {
  const errors: PendingEventDetailsValidation = {}

  if (items.length === 0) errors.media = 'Add at least one photo or video.'
  if (!details.name.trim()) errors.name = 'Add an event name.'
  if (!formatEventDateForStorage(details.date)) errors.date = 'Choose a valid event date.'
  if (!FIREOVA_EVENT_TYPES.includes(details.type)) errors.type = 'Choose an event type.'

  return errors
}

export function hasPendingEventDetailErrors(errors: PendingEventDetailsValidation) {
  return Object.keys(errors).length > 0
}

export function shouldOpenUploadPickerFromTray({
  activeBatch,
  preparing,
  interactiveTarget,
}: {
  activeBatch: boolean
  preparing: boolean
  interactiveTarget: boolean
}) {
  return !activeBatch && !preparing && !interactiveTarget
}

export function shouldShowEventsBrowseWorkflow(activeBatch: boolean) {
  return !activeBatch
}

export function getPendingEventDetailsWithMediaDate(
  details: PendingEventDetails,
  items: PendingEventMediaItem[],
  dateTouched: boolean
): PendingEventDetails {
  if (dateTouched || items.length === 0) return details

  const detectedDate = getDetectedEventDateInput(items)
  return detectedDate ? { ...details, date: detectedDate } : details
}

export function getDetectedEventDateInput(items: PendingEventMediaItem[]) {
  const timestamps = items
    .map((item) => item.file.lastModified)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)

  if (timestamps.length === 0) return ''
  return formatEventDateInputValue(new Date(Math.min(...timestamps)))
}

export function normalizePendingEventName(name: string | undefined) {
  return name?.trim() || DEFAULT_PENDING_EVENT_DETAILS.name
}

function cleanPendingOptionalValue(value: string | undefined) {
  return value?.trim() || undefined
}

export function formatEventDateForStorage(value: string | undefined) {
  if (!value) return ''

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatEventDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export async function collectDroppedMediaFiles(dataTransfer: DataTransferWithUploadItems) {
  const items = Array.from(dataTransfer.items ?? [])
  const entrySnapshots = items.map((item) => ({
    entry: item.webkitGetAsEntry?.() ?? null,
    file: item.kind === 'file' ? item.getAsFile() : null,
  }))
  const entryFiles = entrySnapshots.length > 0
    ? (await Promise.all(entrySnapshots.map((snapshot) => collectDataTransferSnapshotFiles(snapshot)))).flat()
    : []
  const files = entryFiles.length > 0 ? entryFiles : Array.from(dataTransfer.files ?? [])
  const visibleFiles = files.filter((file) => !isHiddenUploadFile(file))

  return visibleFiles
    .sort((a, b) => getUploadFilePath(a).localeCompare(getUploadFilePath(b), undefined, { numeric: true }))
}

export function collectPendingEventMedia(
  currentItems: PendingEventMediaItem[],
  files: File[]
): PendingEventMediaBatchResult {
  const seen = new Set(currentItems.map((item) => item.signature))
  const nextItems = [...currentItems]
  let duplicateCount = 0

  files
    .filter((file) => !isHiddenUploadFile(file))
    .forEach((file) => {
      const signature = createPendingMediaSignature(file)
      if (seen.has(signature)) {
        duplicateCount += 1
        return
      }

      seen.add(signature)
      nextItems.push({
        id: `pending-${signature}`,
        file,
        signature,
        relativePath: getUploadFilePath(file),
        kind: getPendingMediaKind(file),
      })
    })

  return {
    items: nextItems.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true })),
    addedCount: nextItems.length - currentItems.length,
    duplicateCount,
  }
}

export function removePendingEventMediaItem(items: PendingEventMediaItem[], id: string) {
  return items.filter((item) => item.id !== id)
}

export function clearPendingEventMediaBatch(): PendingEventMediaItem[] {
  return []
}

export function upsertPendingEventVendor(vendors: LocalEventVendor[], vendor: LocalEventVendor) {
  const existingIndex = vendors.findIndex((current) => current.id === vendor.id)
  if (existingIndex < 0) return [...vendors, vendor]
  return vendors.map((current) => current.id === vendor.id ? vendor : current)
}

export function removePendingEventVendor(vendors: LocalEventVendor[], vendorId: string) {
  return vendors.filter((vendor) => vendor.id !== vendorId)
}

export function getPendingEventVendorCount(details: Pick<PendingEventDetails, 'vendors'>) {
  return getPendingNonVenueVendors(details).length
}

export function getPendingNonVenueVendors(details: Pick<PendingEventDetails, 'vendors'>) {
  return (details.vendors ?? []).filter((vendor) => vendor.category !== 'Venue')
}

export function getPendingVenuePreview(details: Pick<PendingEventDetails, 'venueName' | 'venueInstagram'>) {
  const rawInstagram = details.venueInstagram?.trim() ?? ''
  if (!rawInstagram || /\s/.test(rawInstagram)) return null
  const handle = normalizeInstagramHandle(details.venueInstagram)
  if (!handle || !/^[a-z0-9._]{1,30}$/.test(handle)) return null

  return {
    category: 'Venue' as const,
    name: details.venueName?.trim() || undefined,
    instagramHandle: `@${handle}`,
  }
}

export function hasPendingEventVendorDuplicate(
  vendors: LocalEventVendor[],
  candidate: Pick<LocalEventVendor, 'vendorId' | 'instagramHandle' | 'instagramOverride'>,
  ignoreId?: string
) {
  const candidateHandle = normalizeInstagramHandle(candidate.instagramOverride ?? candidate.instagramHandle)
  return vendors.some((vendor) => {
    if (vendor.id === ignoreId) return false
    if (candidate.vendorId && vendor.vendorId === candidate.vendorId) return true
    const handle = normalizeInstagramHandle(vendor.instagramOverride ?? vendor.instagramHandle)
    return Boolean(candidateHandle && handle === candidateHandle)
  })
}

export function getPendingEventMediaSummary(items: PendingEventMediaItem[]) {
  const photos = items.filter((item) => item.kind === 'photo').length
  const videos = items.filter((item) => item.kind === 'video').length
  const folders = new Set(
    items
      .map((item) => item.relativePath.split('/').filter(Boolean))
      .filter((parts) => parts.length > 1)
      .map((parts) => parts[0])
  ).size

  return { total: items.length, photos, videos, folders }
}

export async function createEventFromPendingBatch<TEvent>(
  items: PendingEventMediaItem[],
  createEvent: (files: File[]) => Promise<TEvent>
) {
  const event = await createEvent(items.map((item) => item.file))
  return {
    event,
    items: clearPendingEventMediaBatch(),
  }
}

export async function createDraftEventFromFiles(
  fileList: File[],
  details: Partial<PendingEventDetails> = {}
): Promise<DraftEventCreationResult> {
  const acceptedFiles = fileList.filter(isSupportedEventUploadFile)
  const uniqueFiles: File[] = []
  const seen = new Set<string>()
  let duplicateCount = 0

  acceptedFiles.forEach((file) => {
    const signature = createPendingMediaSignature(file)
    if (seen.has(signature)) {
      duplicateCount += 1
      return
    }

    seen.add(signature)
    uniqueFiles.push(file)
  })

  if (uniqueFiles.length === 0) {
    throw new DraftEventCreationError('NO_SUPPORTED_MEDIA', 'No supported photos or videos were found.')
  }

  const media: MockMedia[] = []
  const savedMediaIds: string[] = []

  try {
    for (const file of uniqueFiles) {
      const kind = getUploadFileMediaKind(file)
      const savedMedia = await saveIndexedDbMediaFile(file, kind)
      media.push(savedMedia)
      savedMediaIds.push(savedMedia.id)
    }
  } catch {
    await deleteIndexedDbMediaByIds(savedMediaIds).catch(() => undefined)
    throw new DraftEventCreationError('MEDIA_SAVE_FAILED', 'This browser could not save that media locally.')
  }

  const now = new Date()
  let event: LocalFireovaEvent

  try {
    event = buildDraftEventFromMedia(media, now, details)
  } catch (error) {
    await deleteIndexedDbMediaByIds(savedMediaIds).catch(() => undefined)
    throw error
  }

  try {
    event = saveLocalEvent(event)
  } catch {
    deleteLocalEvent(event.id)
    await deleteIndexedDbMediaByIds(savedMediaIds).catch(() => undefined)
    throw new DraftEventCreationError('EVENT_SAVE_FAILED', 'This event is too large for local storage.')
  }

  return {
    event,
    acceptedCount: uniqueFiles.length,
    rejectedCount: fileList.length - acceptedFiles.length,
    duplicateCount,
  }
}

export function isHiddenUploadFile(file: File) {
  const path = getUploadFilePath(file)
  return path.split('/').some((part) => part.startsWith('.') || part === '.DS_Store')
}

export function getUploadFilePath(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
}

export function hasDraggedFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types ?? []).includes('Files')
}

async function collectDataTransferSnapshotFiles(snapshot: { entry: FileSystemEntryLike | null; file: File | null }): Promise<File[]> {
  if (snapshot.entry) return collectEntryFiles(snapshot.entry)
  return snapshot.file ? [snapshot.file] : []
}

function createPendingMediaSignature(file: File) {
  return [getUploadFilePath(file).trim().toLowerCase(), file.size, file.type, file.lastModified].join('|')
}

function getPendingMediaKind(file: File): 'photo' | 'video' {
  if (file.type.startsWith('video/')) return 'video'
  if (/\.(mp4|mov|m4v|avi|webm)$/i.test(file.name)) return 'video'
  return 'photo'
}

async function collectEntryFiles(entry: FileSystemEntryLike): Promise<File[]> {
  if (isHiddenEntry(entry)) return []

  if (entry.isFile) {
    return new Promise((resolve) => {
      ;(entry as FileSystemFileEntryLike).file(
        (file) => resolve(isHiddenUploadFile(file) ? [] : [file]),
        () => resolve([])
      )
    })
  }

  if (entry.isDirectory) {
    const directory = entry as FileSystemDirectoryEntryLike
    const reader = directory.createReader()
    const entries: FileSystemEntryLike[] = []

    while (true) {
      const batch = await new Promise<FileSystemEntryLike[]>((resolve) => {
        reader.readEntries(resolve, () => resolve([]))
      })
      if (batch.length === 0) break
      entries.push(...batch)
    }

    const nestedFiles = await Promise.all(entries.map((child) => collectEntryFiles(child)))
    return nestedFiles.flat()
  }

  return []
}

function isHiddenEntry(entry: FileSystemEntryLike) {
  return entry.name.startsWith('.') || entry.name === '.DS_Store'
}
