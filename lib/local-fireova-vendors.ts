import {
  LOCAL_FIREOVA_EVENTS_KEY,
  readLocalEvents,
  writeLocalEvents,
  type LocalEventVendor,
  type LocalEventVendorCategory,
  type LocalFireovaEvent,
} from '@/lib/local-fireova-events'

export type FireovaVendor = {
  id: string
  category: LocalEventVendorCategory
  businessName: string
  instagramHandle?: string
  website?: string
  email?: string
  phone?: string
  contactName?: string
  notes?: string
  preferredVendor: boolean
  createdAt: string
  updatedAt: string
}

export type FireovaVendorInput = Omit<FireovaVendor, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export type VendorDuplicateMatch = {
  vendor: FireovaVendor
  reasons: string[]
}

export type VendorCreditTextSource = {
  category: LocalEventVendorCategory
  businessName?: string
  instagramHandle?: string
}

export const LOCAL_FIREOVA_VENDORS_KEY = 'fireova-marketing-hub-vendors-v1'
export const LOCAL_FIREOVA_VENDOR_CATEGORIES_KEY = 'fireova-marketing-hub-vendor-categories-v1'

export const VENDOR_CATEGORIES: LocalEventVendorCategory[] = [
  'Venue',
  'Planner',
  'Coordinator',
  'Photographer',
  'Videographer',
  'Florist',
  'DJ',
  'Live Music / Band',
  'Bar',
  'Caterer',
  'Bakery',
  'Rentals',
  'Lighting / AV',
  'Entertainment',
  'Transportation',
  'Hair & Makeup',
  'Officiant',
  'Content Creator',
  'Other',
]

const VENDOR_CREDIT_LABELS: Record<string, string> = {
  Venue: 'Venue',
  Planner: 'Planning',
  Coordinator: 'Coordination',
  Photographer: 'Photography',
  Videographer: 'Videography',
  Florist: 'Florals',
  DJ: 'DJ',
  'Live Music / Band': 'Live Music',
  Bar: 'Bar',
  Caterer: 'Catering',
  Bakery: 'Cake',
  Rentals: 'Rentals',
  'Lighting / AV': 'Lighting / AV',
  Entertainment: 'Entertainment',
  Transportation: 'Transportation',
  'Hair & Makeup': 'Hair & Makeup',
  Officiant: 'Officiant',
  'Content Creator': 'Content Creator',
  Other: 'Vendor',
}

export function readLocalVendorCategories() {
  if (typeof window === 'undefined') return [...VENDOR_CATEGORIES]
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_FIREOVA_VENDOR_CATEGORIES_KEY) ?? 'null')
    if (!Array.isArray(parsed)) return [...VENDOR_CATEGORIES]
    const categories = parsed.filter((category): category is string => typeof category === 'string' && Boolean(category.trim()))
    return categories.length > 0 ? Array.from(new Set(categories.map((category) => category.trim()))) : [...VENDOR_CATEGORIES]
  } catch {
    return [...VENDOR_CATEGORIES]
  }
}

export function writeLocalVendorCategories(categories: string[]) {
  if (typeof window === 'undefined') return
  const normalized = Array.from(new Set(categories.map((category) => category.trim()).filter(Boolean)))
  window.localStorage.setItem(LOCAL_FIREOVA_VENDOR_CATEGORIES_KEY, JSON.stringify(normalized))
}

export function addLocalVendorCategory(category: string) {
  const normalized = category.trim()
  if (!normalized) return readLocalVendorCategories()
  const categories = readLocalVendorCategories()
  const existing = categories.find((item) => item.toLowerCase() === normalized.toLowerCase())
  if (existing) return categories
  const nextCategories = [...categories, normalized]
  writeLocalVendorCategories(nextCategories)
  return nextCategories
}

export function removeLocalVendorCategory(category: string, vendors = readLocalVendors()) {
  if (category === 'Venue' || category === 'Other') return { removed: false, reason: 'protected' as const, categories: readLocalVendorCategories() }
  if (vendors.some((vendor) => vendor.category === category)) return { removed: false, reason: 'in-use' as const, categories: readLocalVendorCategories() }
  const categories = readLocalVendorCategories().filter((item) => item !== category)
  writeLocalVendorCategories(categories)
  return { removed: true, reason: null, categories }
}

export function reassignAndRemoveLocalVendorCategory(
  category: string,
  replacementCategory: string,
  vendors = readLocalVendors()
) {
  const source = category.trim()
  const replacement = replacementCategory.trim()
  const categories = readLocalVendorCategories()
  if (source === 'Venue' || source === 'Other') return { removed: false, reason: 'protected' as const, categories, vendors }
  if (!replacement || replacement === source) return { removed: false, reason: 'invalid-replacement' as const, categories, vendors }

  const affectedVendorIds = new Set(vendors.filter((vendor) => vendor.category === source).map((vendor) => vendor.id))
  const nextVendors = vendors.map((vendor) => vendor.category === source ? { ...vendor, category: replacement, updatedAt: new Date().toISOString() } : vendor)
  writeLocalVendors(nextVendors)

  const nextEvents = readLocalEvents().map((event) => ({
    ...event,
    vendors: event.vendors?.map((vendor) =>
      vendor.category === source || (vendor.vendorId && affectedVendorIds.has(vendor.vendorId))
        ? { ...vendor, category: replacement }
        : vendor
    ),
  }))
  writeLocalEvents(nextEvents)

  const nextCategories = categories.filter((item) => item !== source)
  if (!nextCategories.includes(replacement)) nextCategories.push(replacement)
  writeLocalVendorCategories(nextCategories)
  return { removed: true, reason: null, categories: nextCategories, vendors: nextVendors }
}

export function getVendorCategoryOptions(vendors: Pick<FireovaVendor, 'category'>[] = [], savedCategories = readLocalVendorCategories()) {
  const customCategories = vendors
    .map((vendor) => vendor.category.trim())
    .filter((category) => category && !VENDOR_CATEGORIES.includes(category))
    .sort((left, right) => left.localeCompare(right))
  return Array.from(new Set([...savedCategories, ...customCategories]))
}

export function getVendorCreditLabel(category: LocalEventVendorCategory) {
  return VENDOR_CREDIT_LABELS[category] ?? category
}

export type CaptionVendorCredit = {
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

export type EventVendorCreditSnapshot = {
  eventName: string
  eventDate: string
  eventType: string
  venueName?: string
  venueLocation?: string
  venue?: CaptionVendorCredit
  nonVenueVendors: CaptionVendorCredit[]
  allVendors: CaptionVendorCredit[]
  creditBlock: string
  handles: string[]
  generatedAt: string
}

export function readLocalVendors(): FireovaVendor[] {
  if (typeof window === 'undefined') return []

  try {
    const rawVendors = window.localStorage.getItem(LOCAL_FIREOVA_VENDORS_KEY)
    if (!rawVendors) return []

    const parsed = JSON.parse(rawVendors)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isFireovaVendor).map(normalizeVendor)
  } catch {
    return []
  }
}

export function writeLocalVendors(vendors: FireovaVendor[]) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_FIREOVA_VENDORS_KEY, JSON.stringify(vendors.map(normalizeVendor)))
}

export function readLocalVendorById(id: string) {
  return readLocalVendors().find((vendor) => vendor.id === id) ?? null
}

export function createLocalVendor(input: FireovaVendorInput) {
  const vendors = readLocalVendors()
  const duplicate = findMatchingVendor(input, vendors)

  if (duplicate) return duplicate

  const now = new Date().toISOString()
  const vendor = normalizeVendor({
    ...input,
    id: input.id ?? createVendorId(input.businessName),
    preferredVendor: input.preferredVendor,
    createdAt: now,
    updatedAt: now,
  })

  writeLocalVendors([...vendors, vendor].sort(sortVendorsAlphabetically))
  return vendor
}

export function updateLocalVendor(id: string, input: Partial<FireovaVendorInput>) {
  const vendors = readLocalVendors()
  let updatedVendor: FireovaVendor | null = null

  const nextVendors = vendors.map((vendor) => {
    if (vendor.id !== id) return vendor

    updatedVendor = normalizeVendor({
      ...vendor,
      ...input,
      id: vendor.id,
      createdAt: vendor.createdAt,
      updatedAt: new Date().toISOString(),
    })
    return updatedVendor
  })

  if (!updatedVendor) return null

  writeLocalVendors(nextVendors.sort(sortVendorsAlphabetically))
  return updatedVendor
}

export function deleteLocalVendorSafely(id: string) {
  const linkedEvents = readEventsLinkedToVendor(id)
  if (linkedEvents.length > 0) {
    return { deleted: false, linkedEvents }
  }

  writeLocalVendors(readLocalVendors().filter((vendor) => vendor.id !== id))
  return { deleted: true, linkedEvents: [] }
}

export function searchLocalVendors(query: string, category: LocalEventVendorCategory | 'All' = 'All') {
  return filterVendorDirectoryEntries(readLocalVendors(), query, category)
}

export function filterVendorDirectoryEntries(
  vendors: FireovaVendor[],
  query: string,
  category: LocalEventVendorCategory | 'All' = 'All'
) {
  const normalizedQuery = query.trim().toLowerCase().replace(/^@/, '')

  return vendors.filter((vendor) => {
    const categoryMatches = category === 'All' || vendor.category === category
    if (!categoryMatches) return false
    if (!normalizedQuery) return true

    return [
      vendor.businessName,
      vendor.instagramHandle,
      vendor.category,
      vendor.website,
      vendor.email,
      vendor.phone,
      vendor.contactName,
      vendor.notes,
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedQuery))
  })
}

export function findPossibleVendorDuplicates(input: Partial<FireovaVendorInput>) {
  return readLocalVendors().flatMap((vendor) => {
    const reasons = getVendorMatchReasons(input, vendor)
    return reasons.length > 0 ? [{ vendor, reasons }] : []
  })
}

export function findMatchingVendor(input: Partial<FireovaVendorInput>, vendors = readLocalVendors()) {
  const matches = vendors.flatMap((vendor) => {
    const reasons = getVendorMatchReasons(input, vendor)
    return reasons.length > 0 ? [{ vendor, reasons }] : []
  })

  return matches.find((match) => match.reasons.some((reason) => reason !== 'businessName'))?.vendor ?? matches[0]?.vendor ?? null
}

export function readEventsLinkedToVendor(vendorId: string) {
  return readLocalEvents().filter((event) =>
    event.venueVendorId === vendorId || event.vendors?.some((vendor) => vendor.vendorId === vendorId)
  )
}

export function getVendorUsageSummary(vendorId: string) {
  const linkedEvents = readEventsLinkedToVendor(vendorId)
  const sortedEvents = [...linkedEvents].sort((a, b) => getDateTime(b.date) - getDateTime(a.date))

  return {
    linkedEvents,
    linkedEventCount: linkedEvents.length,
    mostRecentEvent: sortedEvents[0] ?? null,
  }
}

export function generateVendorCreditString(event: LocalFireovaEvent) {
  return buildEventVendorCreditSnapshot(event).creditBlock
}

export function getVendorDrawerButtonText(count: number) {
  return `Vendors (${Math.max(0, count)}) ▾`
}

export function getVendorDrawerButtonAriaLabel(eventName: string, count: number) {
  return `Open vendors for ${eventName}, ${count} linked vendor${count === 1 ? '' : 's'}`
}

export function getSimplifiedVendorBusinessName(
  category: LocalEventVendorCategory,
  instagram: string,
  existingBusinessName = ''
) {
  const legacyName = existingBusinessName.trim()
  if (legacyName) return legacyName

  const handle = normalizeInstagramHandle(instagram)
  return handle ? `@${handle}` : category
}

export function canSaveSimplifiedVendor(instagram: string, existingBusinessName = '') {
  return Boolean(normalizeInstagramHandle(instagram) || existingBusinessName.trim())
}

export function buildVendorCreditsText(vendors: VendorCreditTextSource[]) {
  const groupedHandles = getOrderedVendorHandleGroups(vendors)

  return groupedHandles
    .map((group) => `${getVendorCreditLabel(group.category)}: ${group.handles.join(' ')}`)
    .join('\n')
}

export function buildVendorHandlesText(vendors: VendorCreditTextSource[]) {
  return getOrderedVendorHandleGroups(vendors)
    .flatMap((group) => group.handles)
    .join('\n')
}

export function buildEventVendorCreditSnapshot(event: LocalFireovaEvent, vendors = readLocalVendors()): EventVendorCreditSnapshot {
  const vendorLookup = new Map(vendors.map((vendor) => [vendor.id, vendor]))
  const seen = new Set<string>()
  const credits: CaptionVendorCredit[] = []

  for (const eventVendor of event.vendors ?? []) {
    const credit = buildCaptionVendorCredit(eventVendor, vendorLookup)
    if (!credit || isFireovaCredit(credit)) continue

    const key = getVendorCreditKey(credit)
    if (seen.has(key)) continue

    seen.add(key)
    credits.push(credit)
  }

  const linkedVenue = credits.find((credit) => credit.isVenue)
  const venueDirectoryRecord = event.venueVendorId ? vendorLookup.get(event.venueVendorId) : undefined
  const venueCandidate = buildSavedVenueCredit(event, venueDirectoryRecord) ?? linkedVenue
  const venue = venueCandidate && !isFireovaCredit(venueCandidate) ? venueCandidate : undefined
  const venueHandle = normalizeInstagramHandle(venue?.instagramHandle)
  const venueName = normalizeName(venue?.businessName)
  const nonVenueVendors = credits.filter((credit) => {
    if (credit.isVenue) return false
    if (venueHandle && normalizeInstagramHandle(credit.instagramHandle) === venueHandle) return false
    return !venueName || normalizeName(credit.businessName) !== venueName
  })
  const allVendors = venue ? [venue, ...nonVenueVendors] : nonVenueVendors
  const creditBlockLines = allVendors.map((credit) => `${credit.label}: ${credit.displayValue}`)
  const handles = getUniqueCreditHandles(allVendors)

  return {
    eventName: event.name,
    eventDate: event.date,
    eventType: event.type,
    venueName: event.venueName,
    venueLocation: event.venueLocation,
    venue,
    nonVenueVendors,
    allVendors,
    creditBlock: creditBlockLines.length > 0 ? ['Vendor Team:', ...creditBlockLines].join('\n') : '',
    handles,
    generatedAt: new Date().toISOString(),
  }
}

export function migrateEmbeddedEventVendorsToDirectory() {
  if (typeof window === 'undefined') return { migratedEvents: 0, createdVendors: 0 }

  const events = readLocalEvents()
  let vendors = readLocalVendors()
  let migratedEvents = 0
  let createdVendors = 0
  let directoryChanged = false

  const nextEvents = events.map((event) => {
    let nextEvent = event
    const venueResult = linkEventVenueToDirectory(event, vendors)
    if (venueResult.vendor) {
      vendors = venueResult.vendors
      directoryChanged = true
      if (venueResult.created) createdVendors += 1
      if (venueResult.event !== event) {
        nextEvent = venueResult.event
        migratedEvents += 1
      }
    }

    if (!nextEvent.vendors || nextEvent.vendors.length === 0) return nextEvent

    let changed = false
    const nextEventVendors = nextEvent.vendors.map((eventVendor) => {
      if (eventVendor.category === 'Venue' && (nextEvent.venueName || nextEvent.venueInstagram)) return eventVendor
      if (eventVendor.vendorId) return eventVendor
      if (!eventVendor.businessName) return eventVendor

      const input: FireovaVendorInput = {
        category: eventVendor.category,
        businessName: eventVendor.businessName,
        instagramHandle: eventVendor.instagramHandle,
        website: eventVendor.website,
        email: undefined,
        phone: undefined,
        contactName: undefined,
        notes: undefined,
        preferredVendor: false,
      }
      let vendor = findMatchingVendor(input, vendors)

      if (!vendor) {
        const now = new Date().toISOString()
        vendor = normalizeVendor({
          ...input,
          id: createVendorId(input.businessName),
          createdAt: now,
          updatedAt: now,
        })
        vendors = [...vendors, vendor]
        createdVendors += 1
        directoryChanged = true
      }

      changed = true
      return {
        id: eventVendor.id,
        vendorId: vendor.id,
        category: eventVendor.category,
        instagramOverride: eventVendor.instagramHandle,
        notes: eventVendor.notes,
      }
    })

    if (!changed) return nextEvent

    migratedEvents += 1
    return { ...nextEvent, vendors: nextEventVendors }
  })

  if (directoryChanged) writeLocalVendors(vendors.sort(sortVendorsAlphabetically))
  if (migratedEvents > 0) {
    window.localStorage.setItem(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify(nextEvents))
  }

  return { migratedEvents, createdVendors }
}

export function syncEventVenueWithDirectory(event: LocalFireovaEvent) {
  if (typeof window === 'undefined') return event

  const result = linkEventVenueToDirectory(event, readLocalVendors())
  if (!result.vendor) {
    if (!event.venueVendorId) return event
    const nextEvent = { ...event, venueVendorId: undefined }
    writeLocalEvents(readLocalEvents().map((item) => item.id === event.id ? nextEvent : item))
    return nextEvent
  }

  writeLocalVendors(result.vendors.sort(sortVendorsAlphabetically))
  if (result.event !== event) {
    writeLocalEvents(readLocalEvents().map((item) => item.id === event.id ? result.event : item))
  }
  return result.event
}

export function getDisplayVendorForEventVendor(eventVendor: LocalEventVendor, vendors = readLocalVendors()) {
  const vendor = eventVendor.vendorId ? vendors.find((item) => item.id === eventVendor.vendorId) : null

  return {
    id: eventVendor.id,
    vendorId: eventVendor.vendorId,
    category: eventVendor.category,
    businessName: vendor?.businessName ?? eventVendor.businessName ?? '',
    instagramHandle: eventVendor.instagramOverride ?? vendor?.instagramHandle ?? eventVendor.instagramHandle,
    website: vendor?.website ?? eventVendor.website,
    email: vendor?.email,
    phone: vendor?.phone,
    contactName: vendor?.contactName,
    notes: eventVendor.notes,
    preferredVendor: vendor?.preferredVendor ?? false,
  }
}

export function normalizeInstagramHandle(value?: string) {
  if (!value) return undefined

  let handle = value.trim()
  if (!handle) return undefined

  try {
    const withProtocol = handle.startsWith('http://') || handle.startsWith('https://')
      ? handle
      : handle.includes('instagram.com/')
        ? `https://${handle.replace(/^\/+/, '')}`
        : ''
    if (withProtocol) {
      const url = new URL(withProtocol)
      if (url.hostname.replace(/^www\./, '').toLowerCase() === 'instagram.com') {
        handle = url.pathname.split('/').filter(Boolean)[0] ?? ''
      }
    }
  } catch {
    handle = handle.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
  }

  return handle
    .replace(/^@+/, '')
    .replace(/^instagram\.com\//i, '')
    .split(/[/?#\s]/)[0]
    ?.trim()
    .toLowerCase() || undefined
}

export function formatInstagramHandle(value?: string) {
  const handle = normalizeInstagramHandle(value)
  return handle ? `@${handle}` : undefined
}

export function normalizeWebsiteDomain(value?: string) {
  if (!value) return undefined

  try {
    const withProtocol = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
    return new URL(withProtocol).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return value.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase() || undefined
  }
}

function getVendorMatchReasons(input: Partial<FireovaVendorInput>, vendor: FireovaVendor) {
  const reasons: string[] = []
  const inputBusinessName = normalizeName(input.businessName)
  const inputHandle = normalizeInstagramHandle(input.instagramHandle)
  const inputDomain = normalizeWebsiteDomain(input.website)
  const inputEmail = input.email?.trim().toLowerCase()

  if (inputBusinessName && inputBusinessName === normalizeName(vendor.businessName)) reasons.push('businessName')
  if (inputHandle && inputHandle === normalizeInstagramHandle(vendor.instagramHandle)) reasons.push('instagramHandle')
  if (inputDomain && inputDomain === normalizeWebsiteDomain(vendor.website)) reasons.push('website')
  if (inputEmail && inputEmail === vendor.email?.trim().toLowerCase()) reasons.push('email')

  return reasons
}

function buildCaptionVendorCredit(
  eventVendor: LocalEventVendor,
  vendorLookup: Map<string, FireovaVendor>
): CaptionVendorCredit | null {
  const vendor = eventVendor.vendorId ? vendorLookup.get(eventVendor.vendorId) : null
  const instagramHandle = normalizeInstagramHandle(eventVendor.instagramOverride ?? vendor?.instagramHandle ?? eventVendor.instagramHandle)
  const businessName = cleanOptionalString(vendor?.businessName ?? eventVendor.businessName)
  const displayValue = instagramHandle ? `@${instagramHandle}` : businessName

  if (!displayValue) return null

  return {
    id: eventVendor.id,
    vendorId: eventVendor.vendorId,
    category: eventVendor.category,
    label: getVendorCreditLabel(eventVendor.category),
    businessName,
    instagramHandle,
    displayValue,
    notes: cleanOptionalString(eventVendor.notes),
    preferredVendor: vendor?.preferredVendor ?? false,
    isVenue: eventVendor.category === 'Venue',
    usedEventOverride: Boolean(eventVendor.instagramOverride),
  }
}

function buildSavedVenueCredit(event: LocalFireovaEvent, directoryVenue?: FireovaVendor): CaptionVendorCredit | undefined {
  const businessName = cleanOptionalString(event.venueName) ?? cleanOptionalString(directoryVenue?.businessName)
  const instagramHandle = normalizeInstagramHandle(event.venueInstagram ?? directoryVenue?.instagramHandle)
  if (!businessName && !instagramHandle) return undefined

  return {
    id: event.venueVendorId ?? `${event.id}-saved-venue`,
    vendorId: event.venueVendorId,
    category: 'Venue',
    label: VENDOR_CREDIT_LABELS.Venue,
    businessName,
    instagramHandle,
    displayValue: instagramHandle ? `@${instagramHandle}` : businessName ?? '',
    isVenue: true,
    usedEventOverride: false,
  }
}

function linkEventVenueToDirectory(event: LocalFireovaEvent, vendors: FireovaVendor[]) {
  const businessName = cleanOptionalString(event.venueName)
  const instagramHandle = normalizeInstagramHandle(event.venueInstagram)
  if (!businessName && !instagramHandle) {
    return { event, vendors, vendor: null, created: false }
  }

  const venueVendors = vendors.filter((vendor) => vendor.category === 'Venue')
  const linkedVendor = event.venueVendorId
    ? venueVendors.find((vendor) => vendor.id === event.venueVendorId)
    : undefined
  const matchedVendor = linkedVendor ?? findMatchingVendor({
    category: 'Venue',
    businessName,
    instagramHandle,
  }, venueVendors)
  const now = new Date().toISOString()

  if (matchedVendor) {
    const updatedVendor = normalizeVendor({
      ...matchedVendor,
      category: 'Venue',
      businessName: businessName ?? matchedVendor.businessName,
      instagramHandle: instagramHandle ?? matchedVendor.instagramHandle,
      updatedAt: now,
    })
    return {
      event: event.venueVendorId === updatedVendor.id ? event : { ...event, venueVendorId: updatedVendor.id },
      vendors: vendors.map((vendor) => vendor.id === updatedVendor.id ? updatedVendor : vendor),
      vendor: updatedVendor,
      created: false,
    }
  }

  const inputName = businessName ?? `@${instagramHandle}`
  const vendor = normalizeVendor({
    id: createVendorId(inputName),
    category: 'Venue',
    businessName: inputName,
    instagramHandle,
    preferredVendor: false,
    createdAt: now,
    updatedAt: now,
  })
  return {
    event: { ...event, venueVendorId: vendor.id },
    vendors: [...vendors, vendor],
    vendor,
    created: true,
  }
}

function getUniqueCreditHandles(credits: CaptionVendorCredit[]) {
  const seen = new Set<string>()
  return credits.reduce<string[]>((handles, credit) => {
    if (!credit.instagramHandle || seen.has(credit.instagramHandle)) return handles

    seen.add(credit.instagramHandle)
    return [...handles, `@${credit.instagramHandle}`]
  }, [])
}

function getOrderedVendorHandleGroups(vendors: VendorCreditTextSource[]) {
  const seenHandles = new Set<string>()

  return getVendorCategoryOptions(vendors)
    .map((category) => {
      const handles = vendors
        .filter((vendor) => vendor.category === category)
        .reduce<string[]>((categoryHandles, vendor) => {
          const handle = normalizeInstagramHandle(vendor.instagramHandle)
          if (!handle || seenHandles.has(handle) || isFireovaVendorCreditSource(vendor, handle)) return categoryHandles

          seenHandles.add(handle)
          return [...categoryHandles, `@${handle}`]
        }, [])

      return { category, handles }
    })
    .filter((group) => group.handles.length > 0)
}

function getVendorCreditKey(credit: CaptionVendorCredit) {
  return credit.instagramHandle ?? credit.vendorId ?? `${credit.category}-${credit.businessName?.trim().toLowerCase()}`
}

function isFireovaCredit(credit: CaptionVendorCredit) {
  const name = credit.businessName?.trim().toLowerCase() ?? ''
  const handle = normalizeInstagramHandle(credit.instagramHandle)

  return name.includes('fireova') || handle === 'fireova' || handle === 'fireovapizza'
}

function isFireovaVendorCreditSource(vendor: VendorCreditTextSource, normalizedHandle?: string) {
  const name = vendor.businessName?.trim().toLowerCase() ?? ''
  const handle = normalizedHandle ?? normalizeInstagramHandle(vendor.instagramHandle)

  return name.includes('fireova') || handle === 'fireova' || handle === 'fireovapizza'
}

function isFireovaVendor(value: unknown): value is FireovaVendor {
  if (!value || typeof value !== 'object') return false

  const vendor = value as Partial<FireovaVendor>
  return (
    typeof vendor.id === 'string' &&
    typeof vendor.businessName === 'string' &&
    typeof vendor.category === 'string' && Boolean(vendor.category.trim())
  )
}

function normalizeVendor(vendor: FireovaVendor): FireovaVendor {
  const now = new Date().toISOString()
  const instagramHandle = normalizeInstagramHandle(vendor.instagramHandle)

  return {
    ...vendor,
    category: vendor.category.trim() || 'Other',
    businessName: vendor.businessName.trim(),
    instagramHandle,
    website: cleanOptionalString(vendor.website),
    email: cleanOptionalString(vendor.email)?.toLowerCase(),
    phone: cleanOptionalString(vendor.phone),
    contactName: cleanOptionalString(vendor.contactName),
    notes: cleanOptionalString(vendor.notes),
    preferredVendor: Boolean(vendor.preferredVendor),
    createdAt: vendor.createdAt || now,
    updatedAt: vendor.updatedAt || now,
  }
}

function createVendorId(name: string) {
  const slug = normalizeName(name).replace(/\s+/g, '-') || 'vendor'
  return `${slug}-${Date.now()}-${crypto.randomUUID()}`
}

function normalizeName(value?: string) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ?? ''
}

function cleanOptionalString(value?: string) {
  return value && value.trim().length > 0 ? value.trim() : undefined
}

function sortVendorsAlphabetically(a: FireovaVendor, b: FireovaVendor) {
  return a.businessName.localeCompare(b.businessName)
}

function getDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}
