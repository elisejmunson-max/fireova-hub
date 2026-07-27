import type { MockMedia } from '@/lib/mock-fireova-content'
import { deleteMediaAnalysis } from '@/lib/local-fireova-media-analysis'

export type EventProjectStatus = 'Needs Content' | 'Needs Review' | 'In Progress' | 'Ready to Schedule' | 'Scheduled' | 'Complete'
export type FireovaStoredEventStatus = EventProjectStatus | 'Needs Analysis' | 'Drafts Ready' | 'Approved'

export type LocalFireovaEvent = {
  id: string
  name: string
  type: string
  date: string
  venueName?: string
  venueLocation?: string
  venueInstagram?: string
  venueVendorId?: string
  vendors?: LocalEventVendor[]
  notes?: string
  status: FireovaStoredEventStatus
  draftCount: number
  cover: MockMedia
  media: MockMedia[]
  createdAt: string
  updatedAt?: string
}

export type LocalEventVendorCategory = string

export type LocalEventVendor = {
  id: string
  vendorId?: string
  category: LocalEventVendorCategory
  businessName?: string
  instagramHandle?: string
  website?: string
  instagramOverride?: string
  notes?: string
}

export type LocalEventMetadataUpdate = Pick<
  LocalFireovaEvent,
  'name' | 'type' | 'date' | 'venueName' | 'venueLocation' | 'venueInstagram' | 'venueVendorId' | 'vendors' | 'notes'
>

export const FIREOVA_EVENT_TYPES = [
  'Wedding',
  'Baby Shower',
  'Bridal Shower',
  'Rehearsal Dinner',
  'Corporate',
  'Birthday',
  'Graduation',
  'Promotions',
  'Interactive Catering',
  'Other',
] as const

export type FireovaEventType = typeof FIREOVA_EVENT_TYPES[number]

export type LocalPostDraftStatus = 'Draft' | 'Approved' | 'Skipped' | 'Scheduled' | 'Published'

export type LocalPostDraftEdit = {
  caption: string
  hashtags: string[]
  vendorCreditBlock?: string
}

export type LocalGeneratedPostVendorCredit = {
  id: string
  vendorId?: string
  category: LocalEventVendorCategory
  label: string
  businessName?: string
  instagramHandle?: string
  displayValue: string
  notes?: string
  preferredVendor?: boolean
  isVenue: boolean
  usedEventOverride: boolean
}

export type LocalGeneratedPostVendorSnapshot = {
  eventName: string
  eventDate: string
  eventType: string
  venueName?: string
  venueLocation?: string
  venue?: LocalGeneratedPostVendorCredit
  nonVenueVendors: LocalGeneratedPostVendorCredit[]
  allVendors: LocalGeneratedPostVendorCredit[]
  creditBlock: string
  handles: string[]
  generatedAt: string
}

export type LocalGeneratedPostDraft = {
  id: string
  tone: string
  caption: string
  hashtags: string[]
  media: MockMedia
  mediaItems?: MockMedia[]
  reelCover?: MockMedia
  reelCoverCrop?: {
    cropX: number
    cropY: number
    cropZoom: number
  }
  sourceType?: 'Event' | 'Media Library'
  sourceId?: string
  sourceLabel?: string
  vendorCreditBlock?: string
  vendorSnapshot?: LocalGeneratedPostVendorSnapshot
}

export const LOCAL_FIREOVA_EVENTS_KEY = 'fireova-marketing-hub-events-v1'
export const FIREOVA_EVENTS_CHANGED_EVENT = 'fireova-events-changed'
export const LOCAL_POST_STATUSES_KEY = 'fireova-marketing-hub-post-statuses-v1'
export const LOCAL_POST_EDITS_KEY = 'fireova-marketing-hub-post-edits-v1'
export const LOCAL_GENERATED_POSTS_KEY = 'fireova-marketing-hub-generated-posts-v1'
const LOCAL_MARKETING_INTELLIGENCE_KEY = 'fireova-marketing-hub-marketing-intelligence-v1'

export function createLocalEventId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'event'}-${Date.now()}`
}

export function getEventDetailPath(eventId: string) {
  return `/events/${eventId}`
}

export function readLocalEvents(): LocalFireovaEvent[] {
  if (typeof window === 'undefined') return []

  try {
    const rawEvents = window.localStorage.getItem(LOCAL_FIREOVA_EVENTS_KEY)
    if (!rawEvents) return []

    const parsed = JSON.parse(rawEvents)
    if (!Array.isArray(parsed)) return []

    const events = parsed.filter(isLocalFireovaEvent)
    const normalizedEvents = events.map(normalizeLocalEventMedia)

    if (events.some((event, index) => event.media.length !== normalizedEvents[index].media.length)) {
      window.localStorage.setItem(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify(normalizedEvents))
    }

    return normalizedEvents
  } catch {
    return []
  }
}

export function writeLocalEvents(
  events: LocalFireovaEvent[],
  options: { source?: 'local' | 'cloud'; deletedEventId?: string } = {}
) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify(events))
  if (typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return

  window.dispatchEvent(new CustomEvent(FIREOVA_EVENTS_CHANGED_EVENT, {
    detail: {
      source: options.source ?? 'local',
      deletedEventId: options.deletedEventId,
    },
  }))
}

export function readLocalEvent(eventId: string) {
  return readLocalEvents().find((event) => event.id === eventId) ?? null
}

export function verifyLocalEventPersistence(expected: LocalFireovaEvent) {
  const persisted = readLocalEvent(expected.id)
  if (!persisted) {
    throw new Error(`Event ${expected.id} was not found after saving.`)
  }

  if (!hasMatchingPersistedEventPayload(expected, persisted)) {
    throw new Error(`Event ${expected.id} did not match the saved event payload.`)
  }

  return persisted
}

export function saveLocalEvent(event: LocalFireovaEvent) {
  const events = readLocalEvents()
  const normalizedEvent = normalizeLocalEventMedia({
    ...event,
    updatedAt: new Date().toISOString(),
  })
  const withoutExisting = events.filter((item) => item.id !== normalizedEvent.id)
  const nextEvents = [normalizedEvent, ...withoutExisting]

  try {
    writeLocalEvents(nextEvents)
  } catch (error) {
    writeLocalEvents(compactEventsForStorage(nextEvents))
  }

  return verifyLocalEventPersistence(normalizedEvent)
}

export function updateLocalEventMetadata(eventId: string, updates: LocalEventMetadataUpdate): LocalFireovaEvent | null {
  const events = readLocalEvents()
  let updatedEvent: LocalFireovaEvent | null = null

  const nextEvents = events.map((event) => {
    if (event.id !== eventId) return event

    updatedEvent = normalizeLocalEventMetadata({
      ...event,
      ...updates,
      id: event.id,
      status: event.status,
      draftCount: event.draftCount,
      cover: event.cover,
      media: event.media,
      createdAt: event.createdAt,
      updatedAt: new Date().toISOString(),
    })
    return updatedEvent
  })

  if (!updatedEvent) return null

  writeLocalEvents(nextEvents)
  return updatedEvent as LocalFireovaEvent
}

export function deleteLocalEvent(eventId: string) {
  if (typeof window === 'undefined') return

  const event = readLocalEvents().find((item) => item.id === eventId)
  writeLocalEvents(readLocalEvents().filter((event) => event.id !== eventId), { deletedEventId: eventId })
  event?.media.forEach((media) => deleteMediaAnalysis(media.id))
  if (event?.cover.id) deleteMediaAnalysis(event.cover.id)
  removeEventKey(LOCAL_MARKETING_INTELLIGENCE_KEY, eventId)
  removeEventKey(LOCAL_GENERATED_POSTS_KEY, eventId)
  removeEventKey(LOCAL_POST_EDITS_KEY, eventId)
  removeEventKey(LOCAL_POST_STATUSES_KEY, eventId)
}

export function dedupeMedia<T extends MockMedia>(media: T[]): T[] {
  const seen = new Set<string>()

  return media.filter((item) => {
    const key = getMediaIdentity(item)
    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

export function isFireovaEventType(value: unknown): value is FireovaEventType {
  return typeof value === 'string' && FIREOVA_EVENT_TYPES.includes(value as FireovaEventType)
}

export function normalizeEventType(value: unknown): FireovaEventType {
  if (value === 'Festival') return 'Promotions'

  return isFireovaEventType(value) ? value : 'Other'
}

export function getEventTypeLabel(value: unknown) {
  return normalizeEventType(value)
}

export function getEventWorkflowSummary(
  event: Pick<LocalFireovaEvent, 'id' | 'media'>,
  drafts = readLocalGeneratedPosts(event.id),
  statuses = readLocalPostStatuses(event.id)
): { status: EventProjectStatus; progress: string } {
  const statusFor = (draftId: string) => statuses[draftId] ?? 'Draft'
  const draftCount = drafts.filter((draft) => statusFor(draft.id) === 'Draft').length
  const approvedCount = drafts.filter((draft) => statusFor(draft.id) === 'Approved').length
  const skippedCount = drafts.filter((draft) => statusFor(draft.id) === 'Skipped').length
  const scheduledCount = drafts.filter((draft) => statusFor(draft.id) === 'Scheduled').length
  const publishedCount = drafts.filter((draft) => statusFor(draft.id) === 'Published').length
  const reviewedCount = approvedCount + skippedCount + scheduledCount + publishedCount

  if (drafts.length === 0) {
    return {
      status: 'Needs Content',
      progress: event.media.length > 0 ? 'No drafts yet' : 'Add event media',
    }
  }

  if (publishedCount + skippedCount === drafts.length) {
    return { status: 'Complete', progress: 'Complete' }
  }

  if (draftCount > 0 && reviewedCount === 0) {
    return { status: 'Needs Review', progress: `${draftCount} draft${draftCount === 1 ? '' : 's'} need review` }
  }

  if (draftCount > 0) {
    return { status: 'In Progress', progress: `${draftCount} draft${draftCount === 1 ? '' : 's'} need review` }
  }

  if (scheduledCount > 0 && approvedCount === 0) {
    return { status: 'Scheduled', progress: scheduledCount === 1 ? '1 scheduled post' : `${scheduledCount} scheduled posts` }
  }

  if (approvedCount > 0) {
    return {
      status: 'Ready to Schedule',
      progress: approvedCount === 1 ? '1 approved post' : `${approvedCount} approved posts`,
    }
  }

  return { status: 'Complete', progress: 'Review complete' }
}

export function getEventCoverMedia(event: Pick<LocalFireovaEvent, 'cover' | 'media'>, drafts: LocalGeneratedPostDraft[] = []) {
  const uniqueMedia = dedupeMedia(event.media)
  const eventMediaKeys = new Set(uniqueMedia.map(getMediaIdentity))
  const firstMediaKey = uniqueMedia[0] ? getMediaIdentity(uniqueMedia[0]) : ''
  const coverKey = event.cover ? getMediaIdentity(event.cover) : ''
  const explicitCover = event.cover && eventMediaKeys.has(coverKey) && coverKey !== firstMediaKey ? event.cover : undefined
  const draftMedia = drafts
    .flatMap((draft) => draft.mediaItems && draft.mediaItems.length > 0 ? draft.mediaItems : [draft.media])
    .find((media) => eventMediaKeys.has(getMediaIdentity(media)))

  return explicitCover ?? draftMedia ?? uniqueMedia.find((media) => Boolean(media.src || media.posterSrc)) ?? uniqueMedia[0]
}

export function readLocalPostStatuses(eventId: string): Record<string, LocalPostDraftStatus> {
  if (typeof window === 'undefined') return {}

  try {
    const rawStatuses = window.localStorage.getItem(LOCAL_POST_STATUSES_KEY)
    if (!rawStatuses) return {}

    const parsed = JSON.parse(rawStatuses)
    if (!parsed || typeof parsed !== 'object') return {}

    const eventStatuses = (parsed as Record<string, unknown>)[eventId]
    if (!eventStatuses || typeof eventStatuses !== 'object') return {}

    return Object.entries(eventStatuses as Record<string, unknown>).reduce<Record<string, LocalPostDraftStatus>>(
      (acc, [draftId, status]) => {
        if (status === 'Draft' || status === 'Approved' || status === 'Skipped' || status === 'Scheduled' || status === 'Published') {
          acc[draftId] = status
        }
        return acc
      },
      {}
    )
  } catch {
    return {}
  }
}

export function writeLocalPostStatuses(eventId: string, statuses: Record<string, LocalPostDraftStatus>) {
  if (typeof window === 'undefined') return

  let allStatuses: Record<string, Record<string, LocalPostDraftStatus>> = {}

  try {
    const rawStatuses = window.localStorage.getItem(LOCAL_POST_STATUSES_KEY)
    const parsed = rawStatuses ? JSON.parse(rawStatuses) : {}
    if (parsed && typeof parsed === 'object') {
      allStatuses = parsed
    }
  } catch {
    allStatuses = {}
  }

  allStatuses[eventId] = statuses
  window.localStorage.setItem(LOCAL_POST_STATUSES_KEY, JSON.stringify(allStatuses))
}

export function readLocalPostEdits(eventId: string): Record<string, LocalPostDraftEdit> {
  if (typeof window === 'undefined') return {}

  try {
    const rawEdits = window.localStorage.getItem(LOCAL_POST_EDITS_KEY)
    if (!rawEdits) return {}

    const parsed = JSON.parse(rawEdits)
    if (!parsed || typeof parsed !== 'object') return {}

    const eventEdits = (parsed as Record<string, unknown>)[eventId]
    if (!eventEdits || typeof eventEdits !== 'object') return {}

    return Object.entries(eventEdits as Record<string, unknown>).reduce<Record<string, LocalPostDraftEdit>>(
      (acc, [draftId, edit]) => {
        if (isLocalPostDraftEdit(edit)) {
          acc[draftId] = edit
        }
        return acc
      },
      {}
    )
  } catch {
    return {}
  }
}

export function writeLocalPostEdits(eventId: string, edits: Record<string, LocalPostDraftEdit>) {
  if (typeof window === 'undefined') return

  let allEdits: Record<string, Record<string, LocalPostDraftEdit>> = {}

  try {
    const rawEdits = window.localStorage.getItem(LOCAL_POST_EDITS_KEY)
    const parsed = rawEdits ? JSON.parse(rawEdits) : {}
    if (parsed && typeof parsed === 'object') {
      allEdits = parsed
    }
  } catch {
    allEdits = {}
  }

  allEdits[eventId] = edits
  window.localStorage.setItem(LOCAL_POST_EDITS_KEY, JSON.stringify(allEdits))
}

export function readLocalGeneratedPosts(eventId: string): LocalGeneratedPostDraft[] {
  if (typeof window === 'undefined') return []

  try {
    const rawDrafts = window.localStorage.getItem(LOCAL_GENERATED_POSTS_KEY)
    if (!rawDrafts) return []

    const parsed = JSON.parse(rawDrafts)
    if (!parsed || typeof parsed !== 'object') return []

    const eventDrafts = (parsed as Record<string, unknown>)[eventId]
    if (!Array.isArray(eventDrafts)) return []

    return eventDrafts.filter(isLocalGeneratedPostDraft)
  } catch {
    return []
  }
}

export function readAllLocalGeneratedPosts(): Record<string, LocalGeneratedPostDraft[]> {
  if (typeof window === 'undefined') return {}

  try {
    const rawDrafts = window.localStorage.getItem(LOCAL_GENERATED_POSTS_KEY)
    if (!rawDrafts) return {}

    const parsed = JSON.parse(rawDrafts)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, LocalGeneratedPostDraft[]>>(
      (acc, [eventId, drafts]) => {
        if (Array.isArray(drafts)) {
          const validDrafts = drafts.filter(isLocalGeneratedPostDraft)
          if (validDrafts.length > 0) {
            acc[eventId] = validDrafts
          }
        }
        return acc
      },
      {}
    )
  } catch {
    return {}
  }
}

export function writeLocalGeneratedPosts(eventId: string, drafts: LocalGeneratedPostDraft[]) {
  if (typeof window === 'undefined') return

  let allDrafts: Record<string, LocalGeneratedPostDraft[]> = {}

  try {
    const rawDrafts = window.localStorage.getItem(LOCAL_GENERATED_POSTS_KEY)
    const parsed = rawDrafts ? JSON.parse(rawDrafts) : {}
    if (parsed && typeof parsed === 'object') {
      allDrafts = parsed
    }
  } catch {
    allDrafts = {}
  }

  allDrafts[eventId] = drafts
  window.localStorage.setItem(LOCAL_GENERATED_POSTS_KEY, JSON.stringify(allDrafts))
}

function removeEventKey(storageKey: string, eventId: string) {
  try {
    const rawValue = window.localStorage.getItem(storageKey)
    if (!rawValue) return

    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

    const nextValue = { ...(parsed as Record<string, unknown>) }
    delete nextValue[eventId]
    window.localStorage.setItem(storageKey, JSON.stringify(nextValue))
  } catch {
    return
  }
}

function isLocalFireovaEvent(value: unknown): value is LocalFireovaEvent {
  if (!value || typeof value !== 'object') return false

  const event = value as Partial<LocalFireovaEvent>
  return (
    typeof event.id === 'string' &&
    typeof event.name === 'string' &&
    typeof event.type === 'string' &&
    typeof event.date === 'string' &&
    Array.isArray(event.media) &&
    event.media.length > 0 &&
    Boolean(event.cover)
  )
}

function normalizeLocalEventMedia(event: LocalFireovaEvent): LocalFireovaEvent {
  const uniqueMedia = dedupeMedia(event.media).map(normalizeEventMediaKind)
  const cover = normalizeEventMediaKind(event.cover ?? uniqueMedia[0])

  return normalizeLocalEventMetadata({
    ...event,
    media: uniqueMedia,
    cover,
  })
}

function normalizeEventMediaKind(media: MockMedia): MockMedia {
  if (media.type === 'photo' && isVideoFileName(media.alt)) {
    return { ...media, type: 'video' }
  }

  return media
}

function normalizeLocalEventMetadata(event: LocalFireovaEvent): LocalFireovaEvent {
  return {
    ...event,
    type: normalizeEventType(event.type),
    status: normalizeStoredEventStatus(event.status),
    venueName: cleanOptionalString(event.venueName),
    venueLocation: cleanOptionalString(event.venueLocation),
    venueInstagram: cleanOptionalString(event.venueInstagram),
    venueVendorId: cleanOptionalString(event.venueVendorId),
    notes: cleanOptionalString(event.notes),
    vendors: normalizeLocalEventVendors(event.vendors),
  }
}

function normalizeStoredEventStatus(value: unknown): FireovaStoredEventStatus {
  if (
    value === 'Needs Content' ||
    value === 'Needs Review' ||
    value === 'In Progress' ||
    value === 'Ready to Schedule' ||
    value === 'Scheduled' ||
    value === 'Complete' ||
    value === 'Drafts Ready' ||
    value === 'Approved'
  ) {
    return value
  }

  return 'Needs Content'
}

function getMediaIdentity(media: MockMedia) {
  return media.src || media.id || media.alt
}

function hasMatchingPersistedEventPayload(expected: LocalFireovaEvent, persisted: LocalFireovaEvent) {
  const expectedVendorPayload = getPersistedVendorPayload(expected.vendors)
  const persistedVendorPayload = getPersistedVendorPayload(persisted.vendors)

  return (
    persisted.id === expected.id &&
    persisted.name === expected.name &&
    persisted.date === expected.date &&
    persisted.type === expected.type &&
    persisted.venueName === expected.venueName &&
    persisted.venueInstagram === expected.venueInstagram &&
    persisted.venueVendorId === expected.venueVendorId &&
    persisted.media.length === expected.media.length &&
    persisted.media.every((media, index) => getMediaIdentity(media) === getMediaIdentity(expected.media[index])) &&
    JSON.stringify(persistedVendorPayload) === JSON.stringify(expectedVendorPayload)
  )
}

function getPersistedVendorPayload(vendors: LocalEventVendor[] | undefined) {
  return (vendors ?? []).map((vendor) => ({
    id: vendor.id,
    vendorId: vendor.vendorId,
    category: vendor.category,
    businessName: vendor.businessName,
    instagramHandle: vendor.instagramHandle,
    instagramOverride: vendor.instagramOverride,
    notes: vendor.notes,
  }))
}

function isVideoFileName(value: string) {
  return /\.(mp4|mov|m4v|avi|webm)$/i.test(value.trim())
}

function cleanOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeLocalEventVendors(vendors: unknown): LocalEventVendor[] | undefined {
  if (!Array.isArray(vendors)) return undefined

  const normalizedVendors = vendors
    .filter(isLocalEventVendor)
    .map((vendor) => ({
      id: vendor.id,
      vendorId: cleanOptionalString(vendor.vendorId),
      category: vendor.category.trim(),
      businessName: cleanOptionalString(vendor.businessName),
      instagramHandle: cleanOptionalString(vendor.instagramHandle),
      website: cleanOptionalString(vendor.website),
      instagramOverride: cleanOptionalString(vendor.instagramOverride),
      notes: cleanOptionalString(vendor.notes),
    }))
    .filter((vendor) => vendor.vendorId || vendor.businessName || vendor.instagramHandle || vendor.instagramOverride)

  return normalizedVendors.length > 0 ? normalizedVendors : undefined
}

function isLocalEventVendor(value: unknown): value is LocalEventVendor {
  if (!value || typeof value !== 'object') return false

  const vendor = value as Partial<LocalEventVendor>
  return (
    typeof vendor.id === 'string' &&
    isLocalEventVendorCategory(vendor.category) &&
    (typeof vendor.vendorId === 'string' || typeof vendor.businessName === 'string')
  )
}

function isLocalEventVendorCategory(value: unknown): value is LocalEventVendorCategory {
  // Vendor Directory categories are user-managed, so event records must accept
  // custom values such as "Bar Cart" or "Coffee Cart" as well as defaults.
  return typeof value === 'string' && value.trim().length > 0
}

function isLocalPostDraftEdit(value: unknown): value is LocalPostDraftEdit {
  if (!value || typeof value !== 'object') return false

  const edit = value as Partial<LocalPostDraftEdit>
  return (
    typeof edit.caption === 'string' &&
    Array.isArray(edit.hashtags) &&
    edit.hashtags.every((tag) => typeof tag === 'string') &&
    (edit.vendorCreditBlock === undefined || typeof edit.vendorCreditBlock === 'string')
  )
}

function isLocalGeneratedPostDraft(value: unknown): value is LocalGeneratedPostDraft {
  if (!value || typeof value !== 'object') return false

  const draft = value as Partial<LocalGeneratedPostDraft>
  return (
    typeof draft.id === 'string' &&
    typeof draft.tone === 'string' &&
    typeof draft.caption === 'string' &&
    Array.isArray(draft.hashtags) &&
    draft.hashtags.every((tag) => typeof tag === 'string') &&
    Boolean(draft.media) &&
    typeof draft.media?.id === 'string' &&
    typeof draft.media?.src === 'string'
  )
}

function compactEventsForStorage(events: LocalFireovaEvent[]) {
  return events.slice(0, 12).map((event, eventIndex) => {
    if (eventIndex === 0) return event

    const compactMedia = event.media.slice(0, 6).map((item) => ({
      ...item,
      src: item.src.startsWith('data:') ? createCompactMediaPlaceholder(item.alt, item.type) : item.src,
    }))

    return {
      ...event,
      media: compactMedia,
      cover: compactMedia[0] ?? event.cover,
    }
  })
}

function createCompactMediaPlaceholder(label: string, type: MockMedia['type']) {
  const title = type === 'video' ? 'Video saved locally' : 'Photo saved locally'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
      <rect width="480" height="480" fill="#fafaf9"/>
      <rect x="52" y="52" width="376" height="376" rx="34" fill="#ffffff" stroke="#e7e5e4" stroke-width="3"/>
      <circle cx="240" cy="218" r="68" fill="#fed7aa"/>
      <path d="M220 182v72l62-36z" fill="#ea580c"/>
      <text x="240" y="338" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#44403c">${title}</text>
      <text x="240" y="374" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#78716c">${escapeSvgText(label)}</text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeSvgText(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return replacements[character]
  })
}
