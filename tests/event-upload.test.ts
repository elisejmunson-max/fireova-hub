import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  clearPendingEventMediaBatch,
  collectPendingEventMedia,
  collectDroppedMediaFiles,
  buildDraftEventFromMedia,
  createEventFromPendingBatch,
  DEFAULT_PENDING_EVENT_DETAILS,
  getDraftEventDestination,
  getPendingEventDetailsWithMediaDate,
  getPendingEventVendorCount,
  getPendingNonVenueVendors,
  getPendingVenuePreview,
  hasPendingEventVendorDuplicate,
  hasPendingEventDetailErrors,
  removePendingEventMediaItem,
  removePendingEventVendor,
  shouldOpenUploadPickerFromTray,
  shouldShowEventsBrowseWorkflow,
  upsertPendingEventVendor,
  validatePendingEventDetails,
  type PendingEventDetails,
  type DataTransferItemWithEntry,
  type FileSystemDirectoryEntryLike,
  type FileSystemEntryLike,
  type FileSystemFileEntryLike,
} from '@/lib/local-fireova-event-upload'
import { getDisplayVendorForEventVendor } from '@/lib/local-fireova-vendors'

const createEventPageSource = fs.readFileSync('app/(app)/events/page.tsx', 'utf8')
const eventDetailSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')
const eventIdentityEditorSource = fs.readFileSync('components/events/event-identity-editor.tsx', 'utf8')
const venueAutocompleteSource = fs.readFileSync('components/events/venue-autocomplete.tsx', 'utf8')
const quickAddVendorModalSource = fs.readFileSync('components/events/quick-add-vendor-modal.tsx', 'utf8')
const sidebarSource = fs.readFileSync('components/layout/sidebar.tsx', 'utf8')

test('event cards open Event Details directly without an intermediate overview action', () => {
  assert.match(createEventPageSource, /<Link\s+href={`\/events\/\$\{event\.id\}`}/)
  assert.doesNotMatch(createEventPageSource, />\s*Open Event\s*</)
  assert.doesNotMatch(sidebarSource, /label: 'Create Event'/)
})

test('canonical Event Details route renders the saved two-column event editor', () => {
  const newEditorIndex = eventDetailSource.indexOf('data-testid="saved-event-editor"')
  const legacyOverviewIndex = eventDetailSource.indexOf('Turn this event into posts.')

  assert.ok(newEditorIndex >= 0)
  assert.ok(legacyOverviewIndex < 0 || newEditorIndex < legacyOverviewIndex)
  assert.match(eventDetailSource, /lg:grid-cols-\[minmax\(0,47fr\)_minmax\(0,53fr\)\]/)
  assert.match(eventDetailSource, /← Back to Events/)
  assert.doesNotMatch(eventDetailSource, /Change Media/)
  assert.match(eventDetailSource, /\+ Add Vendor/)
  assert.match(eventDetailSource, /Add media/)
  assert.match(eventDetailSource, /function VendorCreditActions/)
  assert.match(eventDetailSource, /Open @\$\{handle\} on Instagram/)
  assert.doesNotMatch(eventDetailSource, /onEdit=\{\(\) => openVendorsDrawer\(vendor\.id\)\}/)
  assert.match(eventDetailSource, /onRemove=\{\(\) => removeSavedVendor\(vendor\.id\)\}/)
  assert.match(eventDetailSource, /async function finishEditing\(\)/)
  assert.match(eventDetailSource, /<EventIdentityEditor/)
  assert.match(eventDetailSource, /onDone=\{\(\) => void finishEditing\(\)\}/)
  assert.match(eventIdentityEditorSource, />Done<\/button>/)
  assert.match(eventDetailSource, /<QuickAddVendorModal/)
  assert.match(quickAddVendorModalSource, /Search vendors by name, category, or @handle/)
  assert.match(quickAddVendorModalSource, /\+ Create new vendor/)
  assert.match(eventDetailSource, />\+ Add venue</)
})

test('canonical event edits await Supabase update and UUID reload before closing', () => {
  const saveStart = eventDetailSource.indexOf('async function saveEventMetadata')
  const saveEnd = eventDetailSource.indexOf('function persistEventMedia', saveStart)
  const saveSource = eventDetailSource.slice(saveStart, saveEnd)
  const dialogStart = eventDetailSource.indexOf('function EditEventDialog')
  const dialogSource = eventDetailSource.slice(dialogStart)

  assert.match(saveSource, /id: localEvent\.id/)
  assert.match(saveSource, /media: localEvent\.media/)
  assert.match(saveSource, /await saveEventToCloud\(updatedEvent\)/)
  assert.match(saveSource, /await loadEventFromCloud\(localEvent\.id\)/)
  assert.match(saveSource, /saved\.id !== localEvent\.id/)
  assert.doesNotMatch(saveSource, /updateLocalEventMetadata/)
  assert.match(dialogSource, /await saveCurrentEventDetails\(\)/)
  assert.ok(dialogSource.indexOf('await saveCurrentEventDetails()') < dialogSource.indexOf('onClose()'))
  assert.match(dialogSource, /role="alert"/)
})

test('canonical Event Details initially loads from Supabase instead of local browser state', () => {
  assert.match(eventDetailSource, /loadEventFromCloud\(params\.id\)/)
  assert.match(eventDetailSource, /saveLocalEvent\(cloudEvent\)/)
  assert.match(eventDetailSource, /This event could not be loaded from Fireova Cloud/)
})

test('saved Event Details adds a selected directory vendor before closing the modal', () => {
  const quickAddStart = eventDetailSource.indexOf('function quickAddSavedVendor')
  const quickAddEnd = eventDetailSource.indexOf('function quickAddNewVendor', quickAddStart)
  const quickAddSource = eventDetailSource.slice(quickAddStart, quickAddEnd)
  const saveStart = eventDetailSource.indexOf('function saveEventVendors')
  const saveEnd = eventDetailSource.indexOf('function removeSavedVendor', saveStart)
  const saveSource = eventDetailSource.slice(saveStart, saveEnd)

  assert.match(saveSource, /saveLocalEvent\(\{ \.\.\.localEvent, vendors: nextVendors \}\)/)
  assert.match(saveSource, /console\.error\('Unable to save event vendors'/)
  assert.match(quickAddSource, /const updatedEvent = saveEventVendors/)
  assert.match(quickAddSource, /if \(!updatedEvent\) return false/)
  assert.ok(quickAddSource.indexOf('if (!updatedEvent) return false') < quickAddSource.indexOf('closeVendorsDrawer()'))
  assert.match(quickAddVendorModalSource, /onClick=\{\(\) => select\(vendor\)\}/)
  assert.match(quickAddVendorModalSource, /This vendor could not be added\. Please try again\./)
})

test('adding saved event media preserves the current main preview selection', () => {
  const eventDetailSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')
  const addMediaSource = eventDetailSource.slice(
    eventDetailSource.indexOf('async function addEventMedia'),
    eventDetailSource.indexOf('async function removeEventMedia')
  )

  assert.match(addMediaSource, /persistEventMedia\(dedupeMedia\(\[\.\.\.localEvent\.media, \.\.\.additions\]\)\)/)
  assert.doesNotMatch(addMediaSource, /setSelectedMediaId\(additions\[0\]\.id\)/)
})

test('selected saved-event media can be added to Content Bank', () => {
  const eventDetailSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')

  assert.match(eventDetailSource, /onClick=\{\(\) => setMediaToCategorize\(selectedMedia\)\}/)
  assert.match(eventDetailSource, /Choose a category/)
  assert.match(eventDetailSource, /onSelect=\{\(category\) => addMediaToContentLibrary\(mediaToCategorize, category\)\}/)
  assert.match(eventDetailSource, /Save selected media to Content Bank/)
  assert.match(eventDetailSource, /title=\{selectedContentBankItem \? 'Saved to Content Bank' : 'Save to Content Bank'\}/)
  assert.match(eventDetailSource, /fill=\{selectedContentBankItem \? 'currentColor' : 'none'\}/)
  assert.match(eventDetailSource, /selectedContentBankItem = selectedMedia \? getContentLibraryItemForMedia\(selectedMedia\.id\) : null/)
})

test('collects 50+ dropped photos as one batch', async () => {
  const files = Array.from({ length: 55 }, (_item, index) =>
    fileFactory(`event/photo-${String(index + 1).padStart(3, '0')}.jpg`, 'image/jpeg')
  )
  const collected = await collectDroppedMediaFiles(dataTransferFromFiles(files))

  assert.equal(collected.length, 55)
  assert.equal(collected[0].name, 'photo-001.jpg')
  assert.equal(collected[54].name, 'photo-055.jpg')
})

test('collects mixed photos and videos from one drop', async () => {
  const files = [
    fileFactory('event/oven.mov', 'video/quicktime'),
    fileFactory('event/table.jpg', 'image/jpeg'),
    fileFactory('event/setup.mp4', 'video/mp4'),
    fileFactory('event/pizza.png', 'image/png'),
  ]
  const collected = await collectDroppedMediaFiles(dataTransferFromFiles(files))

  assert.equal(collected.length, 4)
  assert.deepEqual(collected.map((file) => file.name).sort(), ['oven.mov', 'pizza.png', 'setup.mp4', 'table.jpg'])
})

test('collects every file from a complete dropped folder', async () => {
  const folder = directoryEntry('Wedding Folder', [
    fileEntry(fileFactory('Wedding Folder/photo-1.jpg', 'image/jpeg')),
    fileEntry(fileFactory('Wedding Folder/photo-2.jpg', 'image/jpeg')),
    fileEntry(fileFactory('Wedding Folder/clip-1.mov', 'video/quicktime')),
  ], 1)
  const collected = await collectDroppedMediaFiles(dataTransferFromEntries([folder]))

  assert.equal(collected.length, 3)
  assert.deepEqual(collected.map((file) => file.name).sort(), ['clip-1.mov', 'photo-1.jpg', 'photo-2.jpg'])
})

test('recursively collects nested dropped folders across readEntries batches', async () => {
  const folder = directoryEntry('Event', [
    directoryEntry('Photos', [
      fileEntry(fileFactory('Event/Photos/photo-1.jpg', 'image/jpeg')),
      fileEntry(fileFactory('Event/Photos/photo-2.jpg', 'image/jpeg')),
    ], 1),
    directoryEntry('Videos', [
      fileEntry(fileFactory('Event/Videos/clip-1.mov', 'video/quicktime')),
      directoryEntry('More', [
        fileEntry(fileFactory('Event/Videos/More/clip-2.mp4', 'video/mp4')),
      ], 1),
    ], 1),
    fileEntry(fileFactory('Event/.DS_Store', 'application/octet-stream')),
  ], 2)
  const collected = await collectDroppedMediaFiles(dataTransferFromEntries([folder]))

  assert.equal(collected.length, 4)
  assert.deepEqual(collected.map((file) => file.name).sort(), ['clip-1.mov', 'clip-2.mp4', 'photo-1.jpg', 'photo-2.jpg'])
})

test('first drop adds media but does not create an event or navigate', () => {
  let created = 0
  let navigated = 0
  const result = collectPendingEventMedia([], [fileFactory('event/photo.jpg', 'image/jpeg')])

  assert.equal(result.items.length, 1)
  assert.equal(result.addedCount, 1)
  assert.equal(created, 0)
  assert.equal(navigated, 0)
})

test('second drop appends to the same pending batch', () => {
  const first = collectPendingEventMedia([], [fileFactory('event/photo-1.jpg', 'image/jpeg')])
  const second = collectPendingEventMedia(first.items, [
    fileFactory('event/photo-2.jpg', 'image/jpeg'),
    fileFactory('event/clip-1.mov', 'video/quicktime'),
  ])

  assert.equal(second.items.length, 3)
  assert.equal(second.addedCount, 2)
})

test('folder addition appends to existing loose files', () => {
  const loose = collectPendingEventMedia([], [fileFactory('loose-photo.jpg', 'image/jpeg')])
  const folder = collectPendingEventMedia(loose.items, [
    fileFactory('Wedding Folder/photo-1.jpg', 'image/jpeg'),
    fileFactory('Wedding Folder/clip-1.mp4', 'video/mp4'),
  ])

  assert.equal(folder.items.length, 3)
  assert.equal(folder.items.filter((item) => item.relativePath.includes('Wedding Folder')).length, 2)
})

test('repeated additions still create only one event when continued', async () => {
  const first = collectPendingEventMedia([], [fileFactory('event/photo-1.jpg', 'image/jpeg')])
  const second = collectPendingEventMedia(first.items, [fileFactory('event/photo-2.jpg', 'image/jpeg')])
  const third = collectPendingEventMedia(second.items, [fileFactory('event/clip-1.mov', 'video/quicktime')])
  let created = 0

  const result = await createEventFromPendingBatch(third.items, async (files) => {
    created += 1
    return { id: 'event-1', mediaCount: files.length }
  })

  assert.equal(created, 1)
  assert.equal(result.event.mediaCount, 3)
  assert.equal(result.items.length, 0)
})

test('continue creates one event containing the entire combined batch', async () => {
  const first = collectPendingEventMedia([], [
    fileFactory('event/photo-1.jpg', 'image/jpeg'),
    fileFactory('event/photo-2.jpg', 'image/jpeg'),
  ])
  const second = collectPendingEventMedia(first.items, [
    fileFactory('event/videos/clip-1.mov', 'video/quicktime'),
    fileFactory('event/videos/clip-2.mp4', 'video/mp4'),
  ])

  const result = await createEventFromPendingBatch(second.items, async (files) => ({
    id: 'event-1',
    media: files.map((file) => file.name),
  }))

  assert.equal(result.event.media.length, 4)
  assert.deepEqual(result.event.media.sort(), ['clip-1.mov', 'clip-2.mp4', 'photo-1.jpg', 'photo-2.jpg'])
})

test('continue from pending upload tray creates one event and navigates directly to canonical details', async () => {
  const batch = collectPendingEventMedia([], [
    fileFactory('event/photo-1.jpg', 'image/jpeg'),
    fileFactory('event/clip-1.mp4', 'video/mp4'),
  ])
  let created = 0

  const result = await createEventFromPendingBatch(batch.items, async (files) => {
    created += 1
    return {
      event: {
        id: 'event-1',
        name: 'Untitled Event',
        type: 'Other',
        date: 'July 16, 2026',
        media: files.map((file) => file.name),
      },
    }
  })
  const destination = getDraftEventDestination(result.event.event.id)

  assert.equal(created, 1)
  assert.equal(destination, '/events/event-1')
  assert.equal(destination.includes('draft=1'), false)
  assert.equal(destination.includes('imported=1'), false)
  assert.equal(result.items.length, 0)
})

test('event name date and type can be entered before creation', () => {
  const details: PendingEventDetails = {
    name: 'Smith Wedding',
    date: '2026-08-01',
    type: 'Wedding',
  }
  const batch = collectPendingEventMedia([], [fileFactory('event/photo-1.jpg', 'image/jpeg')])
  const errors = validatePendingEventDetails(batch.items, details)
  const event = buildDraftEventFromMedia([mockMediaFactory('photo-1', 'photo')], new Date('2026-07-16T12:00:00.000Z'), details)

  assert.equal(hasPendingEventDetailErrors(errors), false)
  assert.equal(event.name, 'Smith Wedding')
  assert.equal(event.date, 'August 1, 2026')
  assert.equal(event.type, 'Wedding')
})

test('adding more media preserves entered event details', () => {
  const details: PendingEventDetails = {
    name: 'Graduation Lunch',
    date: '2026-05-20',
    type: 'Graduation',
  }
  const first = collectPendingEventMedia([], [fileFactory('event/photo-1.jpg', 'image/jpeg', 1779235200000)])
  const second = collectPendingEventMedia(first.items, [fileFactory('event/clip-1.mp4', 'video/mp4', 1779321600000)])
  const nextDetails = getPendingEventDetailsWithMediaDate(details, second.items, true)

  assert.equal(nextDetails.name, 'Graduation Lunch')
  assert.equal(nextDetails.date, '2026-05-20')
  assert.equal(nextDetails.type, 'Graduation')
})

test('removing media preserves entered event details', () => {
  const details: PendingEventDetails = {
    name: 'Corporate Tasting',
    date: '2026-09-12',
    type: 'Corporate',
  }
  const batch = collectPendingEventMedia([], [
    fileFactory('event/photo-1.jpg', 'image/jpeg'),
    fileFactory('event/photo-2.jpg', 'image/jpeg'),
  ])
  const nextItems = removePendingEventMediaItem(batch.items, batch.items[0].id)

  assert.equal(nextItems.length, 1)
  assert.deepEqual(details, {
    name: 'Corporate Tasting',
    date: '2026-09-12',
    type: 'Corporate',
  })
})

test('no second continue action is required after upload destination is created', () => {
  const destination = getDraftEventDestination('event-1')

  assert.equal(destination, '/events/event-1')
  assert.equal(destination.includes('Continue'), false)
})

test('draft event builder preserves imported media and safe defaults', () => {
  const event = buildDraftEventFromMedia([
    mockMediaFactory('photo-1', 'photo'),
    mockMediaFactory('clip-1', 'video'),
  ], new Date('2026-07-16T12:00:00.000Z'))

  assert.equal(event.name, 'Untitled Event')
  assert.equal(event.type, 'Other')
  assert.equal(event.date, 'July 16, 2026')
  assert.equal(event.status, 'Needs Content')
  assert.equal(event.draftCount, 0)
  assert.equal(event.media.length, 2)
  assert.deepEqual(event.media.map((media) => media.type), ['photo', 'video'])
  assert.equal(event.cover.id, 'photo-1')
  assert.equal('importedReviewStatus' in event, false)
})

test('draft event builder saves entered name date and type', () => {
  const event = buildDraftEventFromMedia([
    mockMediaFactory('photo-1', 'photo'),
    mockMediaFactory('clip-1', 'video'),
  ], new Date('2026-07-16T12:00:00.000Z'), {
    name: 'Menu Launch',
    date: '2026-10-05',
    type: 'Promotions',
  })

  assert.equal(event.name, 'Menu Launch')
  assert.equal(event.date, 'October 5, 2026')
  assert.equal(event.type, 'Promotions')
  assert.equal(event.media.length, 2)
})

test('creating an event without venue or vendors remains supported', () => {
  const event = buildDraftEventFromMedia(
    [mockMediaFactory('photo-1', 'photo')],
    new Date('2026-07-16T12:00:00.000Z'),
    DEFAULT_PENDING_EVENT_DETAILS
  )

  assert.equal(event.venueName, undefined)
  assert.equal(event.venueLocation, undefined)
  assert.equal(event.venueInstagram, undefined)
  assert.equal(event.vendors, undefined)
})

test('creating an event persists Venue Name and Venue Instagram', () => {
  const event = buildDraftEventFromMedia(
    [mockMediaFactory('photo-1', 'photo')],
    new Date('2026-07-16T12:00:00.000Z'),
    {
      ...DEFAULT_PENDING_EVENT_DETAILS,
      venueName: 'Dove Ridge Vineyard',
      venueInstagram: '@doveridgevineyard',
    }
  )

  assert.equal(event.venueName, 'Dove Ridge Vineyard')
  assert.equal(event.venueInstagram, '@doveridgevineyard')
})

test('multiple pending vendors are added before event creation', () => {
  const planner = { id: 'planner', category: 'Planner' as const, instagramHandle: 'plannerco' }
  const photographer = { id: 'photo', category: 'Photographer' as const, instagramHandle: 'photoco', notes: 'Lead photographer' }
  const vendors = upsertPendingEventVendor(upsertPendingEventVendor([], planner), photographer)
  const event = buildDraftEventFromMedia(
    [mockMediaFactory('photo-1', 'photo')],
    new Date('2026-07-16T12:00:00.000Z'),
    { ...DEFAULT_PENDING_EVENT_DETAILS, vendors }
  )

  assert.equal(event.vendors?.length, 2)
  assert.equal(event.vendors?.[0].instagramHandle, 'plannerco')
  assert.equal(event.vendors?.[1].notes, 'Lead photographer')
})

test('a pending vendor can be edited and removed', () => {
  const original = { id: 'planner', category: 'Planner' as const, instagramHandle: 'plannerco' }
  const edited = { ...original, category: 'Coordinator' as const, instagramHandle: 'coordco', notes: 'Day-of lead' }
  const afterEdit = upsertPendingEventVendor([original], edited)
  const afterRemove = removePendingEventVendor(afterEdit, edited.id)

  assert.deepEqual(afterEdit, [edited])
  assert.deepEqual(afterRemove, [])
})

test('duplicate pending vendors are detected by directory id or normalized Instagram handle', () => {
  const vendors = [{ id: 'one', vendorId: 'directory-1', category: 'Planner' as const, instagramOverride: 'PlannerCo' }]

  assert.equal(hasPendingEventVendorDuplicate(vendors, { vendorId: 'directory-1' }), true)
  assert.equal(hasPendingEventVendorDuplicate(vendors, { instagramHandle: '@@plannerco' }), true)
  assert.equal(hasPendingEventVendorDuplicate(vendors, { instagramHandle: '@different' }), false)
  assert.equal(hasPendingEventVendorDuplicate(vendors, { vendorId: 'directory-1' }, 'one'), false)
})

test('venue is separate from the pending vendor count', () => {
  const details: PendingEventDetails = {
    ...DEFAULT_PENDING_EVENT_DETAILS,
    venueName: 'Dove Ridge Vineyard',
    venueInstagram: '@doveridgevineyard',
    vendors: [{ id: 'planner', category: 'Planner', instagramHandle: 'plannerco' }],
  }

  assert.equal(getPendingEventVendorCount(details), 1)
})

test('a valid Venue Instagram creates a normalized live Venue preview', () => {
  assert.deepEqual(getPendingVenuePreview({
    venueName: 'Davis and Grey Farms',
    venueInstagram: '@@DavisAndGreyFarms',
  }), {
    category: 'Venue',
    name: 'Davis and Grey Farms',
    instagramHandle: '@davisandgreyfarms',
  })
})

test('the live Venue preview follows name edits and disappears when Instagram is cleared', () => {
  assert.equal(getPendingVenuePreview({ venueName: 'Updated Farm', venueInstagram: '@farm' })?.name, 'Updated Farm')
  assert.equal(getPendingVenuePreview({ venueName: '', venueInstagram: '@farm' })?.instagramHandle, '@farm')
  assert.equal(getPendingVenuePreview({ venueName: 'Updated Farm', venueInstagram: '' }), null)
  assert.equal(getPendingVenuePreview({ venueName: 'Updated Farm', venueInstagram: 'not a valid handle!' }), null)
})

test('legacy Venue vendors are excluded from the pending non-Venue list and count', () => {
  const details: PendingEventDetails = {
    ...DEFAULT_PENDING_EVENT_DETAILS,
    venueName: 'Davis and Grey Farms',
    venueInstagram: '@davisandgreyfarms',
    vendors: [
      { id: 'legacy-venue', category: 'Venue', businessName: 'Davis and Grey Farms', instagramHandle: 'davisandgreyfarms' },
      { id: 'cake', category: 'Bakery', instagramHandle: 'sweetsbyzeek' },
    ],
  }

  assert.equal(getPendingEventVendorCount(details), 1)
  assert.deepEqual(getPendingNonVenueVendors(details).map((vendor) => vendor.id), ['cake'])
})

test('created venue and vendors are available to the Event Detail presentation', () => {
  const eventVendor = { id: 'photo', category: 'Photographer' as const, instagramHandle: 'photoco' }
  const event = buildDraftEventFromMedia(
    [mockMediaFactory('photo-1', 'photo')],
    new Date('2026-07-16T12:00:00.000Z'),
    {
      ...DEFAULT_PENDING_EVENT_DETAILS,
      venueName: 'Dove Ridge Vineyard',
      venueInstagram: '@doveridgevineyard',
      vendors: [eventVendor],
    }
  )
  const displayVendor = getDisplayVendorForEventVendor(event.vendors![0], [])

  assert.equal(event.venueName, 'Dove Ridge Vineyard')
  assert.equal(event.venueInstagram, '@doveridgevineyard')
  assert.equal(displayVendor.category, 'Photographer')
  assert.equal(displayVendor.instagramHandle, 'photoco')
})

test('Create Event no longer renders Venue Location', () => {
  assert.doesNotMatch(createEventPageSource, /label="Venue Location"/)
  assert.doesNotMatch(createEventPageSource, /pendingEventDetails\.venueLocation/)
  assert.match(createEventPageSource, /<EventIdentityEditor/)
  assert.match(venueAutocompleteSource, /export default function VenueAutocomplete/)
  assert.doesNotMatch(createEventPageSource, /label="Venue Instagram"/)
})

test('Create Event uses responsive non-overflowing section layouts', () => {
  assert.match(createEventPageSource, /lg:grid-cols-\[minmax\(0,47fr\)_minmax\(0,53fr\)\]/)
  assert.match(createEventPageSource, /data-testid="event-summary-venue"[\s\S]*?<EventIdentityEditor/)
  assert.match(createEventPageSource, /group relative min-w-0/)
  assert.match(quickAddVendorModalSource, /max-w-\[520px\]/)
  assert.match(quickAddVendorModalSource, /sm:items-center/)
  assert.match(quickAddVendorModalSource, /sm:max-h-\[70vh\] sm:rounded-2xl/)
  assert.doesNotMatch(createEventPageSource, /absolute inset-y-0 right-0/)
})

test('active Create Event panel presents a balanced media and event-summary hero', () => {
  assert.match(createEventPageSource, />\s*Add Files\s*</)
  assert.doesNotMatch(createEventPageSource, />\s*Add Folder\s*</)
  assert.doesNotMatch(createEventPageSource, /Drop media here/)
  assert.doesNotMatch(createEventPageSource, /aria-label="Clear all media"/)
  assert.doesNotMatch(createEventPageSource, /Building your event/)
  assert.doesNotMatch(createEventPageSource, />\s*Event contents\s*</)
  assert.match(createEventPageSource, /rounded-xl border-stone-200 bg-white/)
  assert.match(createEventPageSource, /flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto/)
  assert.match(createEventPageSource, /inline-flex shrink-0 gap-2/)
  assert.match(createEventPageSource, /data-testid="event-review-hero"/)
  assert.match(createEventPageSource, /div className="min-w-0" data-testid="event-review-hero"/)
  assert.match(createEventPageSource, /activeBatch \? 'max-w-7xl' : 'max-w-7xl space-y-5'/)
  assert.match(createEventPageSource, /\{!activeBatch && \(\s*<div>/)
  assert.doesNotMatch(createEventPageSource, /\{activeBatch \? 'Create Event' : 'Events'\}/)
  assert.doesNotMatch(createEventPageSource, />← Events<\/Link>/)
  assert.match(createEventPageSource, /lg:grid-cols-\[minmax\(0,47fr\)_minmax\(0,53fr\)\]/)
  assert.match(createEventPageSource, /lg:gap-x-7/)
  assert.doesNotMatch(createEventPageSource, /lg:min-h-\[42rem\]|lg:h-full/)
  assert.doesNotMatch(createEventPageSource, /formatEventSummaryDate/)
  assert.doesNotMatch(createEventPageSource, /formatMediaCountSummary/)
  assert.match(createEventPageSource, /hero\s+mediaTypeLabel=\{primaryPendingItem\.kind === 'video' \? 'Video' : 'Photo'\}[\s\S]*?showChangeMedia\s+onRemove=/)
  assert.doesNotMatch(createEventPageSource, /Ready to shape into content/)
  assert.doesNotMatch(createEventPageSource, />\s*Edit details\s*</)
  assert.doesNotMatch(createEventPageSource, /SectionCompletionCheck/)
  assert.match(createEventPageSource, /✨ Create Content/)
  const activeHeroSource = createEventPageSource.slice(
    createEventPageSource.indexOf('data-testid="event-review-hero"'),
    createEventPageSource.indexOf('<div className="min-w-0 px-1 py-1 lg:px-0 lg:py-0">')
  )
  assert.doesNotMatch(activeHeroSource, /Add Folder/)
  assert.match(createEventPageSource, /min-w-0 px-1 py-1 lg:px-0 lg:py-0/)
  assert.match(createEventPageSource, /className="mt-5 min-w-0"/)
  assert.doesNotMatch(createEventPageSource, /lg:row-span-3|lg:row-start-2|lg:row-span-2/)
})

test('right-side workspace follows event venue vendors and final create order', () => {
  const titleIndex = createEventPageSource.indexOf('<EventIdentityEditor')
  const venueIndex = createEventPageSource.indexOf('data-testid="event-summary-venue"')
  const vendorsIndex = createEventPageSource.indexOf('>Vendors</h3>')
  const createIndex = createEventPageSource.indexOf('data-testid="create-event-submit"')
  assert.ok(titleIndex > -1)
  assert.match(eventIdentityEditorSource, /aria-label="Event Date"/)
  assert.ok(venueIndex <= titleIndex)
  assert.ok(vendorsIndex > venueIndex)
  assert.ok(createIndex > vendorsIndex)
  assert.doesNotMatch(createEventPageSource, /showAddFiles/)
})

test('Create Event preview uses one bounded 4:5 review frame with overlay controls', () => {
  assert.match(createEventPageSource, /aspect-\[4\/5\] w-full.+lg:max-h-\[calc\(100vh-175px\)\].+lg:max-w-\[calc\(\(100vh-175px\)\*4\/5\)\]/)
  assert.doesNotMatch(createEventPageSource, /lg:w-auto/)
  assert.match(createEventPageSource, /sizes=\{hero \? '\(min-width: 1024px\) 47vw, 100vw'/)
  assert.match(createEventPageSource, /className="object-cover"/)
  assert.match(createEventPageSource, /mediaTypeLabel=\{primaryPendingItem\.kind === 'video' \? 'Video' : 'Photo'\}/)
  assert.match(createEventPageSource, /mediaTypeLabel\?: 'Video' \| 'Photo'/)
  assert.doesNotMatch(createEventPageSource, /controls=\{hero\}|\scontrols(?:\s|>)/)
  assert.match(createEventPageSource, /onClick=\{hero \? \(\) => void toggleVideoPlayback\(\) : undefined\}/)
  assert.match(createEventPageSource, />\s*Change Media\s*</)
  assert.match(createEventPageSource, /×\{hero && <span className="ml-1">Remove<\/span>\}/)
  assert.doesNotMatch(createEventPageSource, /title=\{fileName\}/)
  assert.doesNotMatch(createEventPageSource, /getPendingMediaPreviewType|previewAspect|setPreviewAspect/)
})

test('Create Event renders one clean media frame without a blurred or dark stage', () => {
  const mediaCardSource = createEventPageSource.slice(
    createEventPageSource.indexOf('function PendingMediaCard('),
    createEventPageSource.indexOf('function formatMediaDuration')
  )
  assert.doesNotMatch(mediaCardSource, /data-testid="media-stage-backdrop"|blur-2xl|bg-black\/30/)
  assert.match(mediaCardSource, /data-testid=\{hero \? 'media-preview-frame' : undefined\}/)
  assert.match(mediaCardSource, /hero[\s\S]*?\? 'h-full w-full bg-stone-100'/)
  assert.doesNotMatch(mediaCardSource, /shadow-\[0_12px_36px_rgba\(0,0,0,0\.28\)\]|ring-white\/15/)
})

test('mobile keeps the 4:5 event-review ratio without a forced stage height', () => {
  assert.match(createEventPageSource, /aspect-\[4\/5\] w-full ring-stone-200 lg:max-h-/)
  assert.doesNotMatch(createEventPageSource, /(?<!lg:)max-h-\[calc\(100vh-175px\)\]/)
})

test('video preview uses compact Instagram-style playback controls', () => {
  assert.match(createEventPageSource, /function toggleVideoPlayback\(\)/)
  assert.match(createEventPageSource, /videoPlaying &&|!videoPlaying &&/)
  assert.match(createEventPageSource, /aria-label=\{`Play \$\{fileName\}`\}/)
  assert.match(createEventPageSource, /videoProgress \* 100/)
  assert.match(createEventPageSource, /aria-label=\{videoMuted \? 'Unmute video' : 'Mute video'\}/)
  assert.match(createEventPageSource, /bottom-12 left-3 right-3 z-10/)
  assert.match(createEventPageSource, /left-3 top-3 z-10/)
  assert.match(createEventPageSource, /right-3 top-3 z-10/)
  assert.match(createEventPageSource, /bottom-3 left-3 z-10/)
  assert.match(createEventPageSource, /bottom-3 right-3 z-10/)
})

test('Create Event describes media kind without inferring a post format', () => {
  assert.match(createEventPageSource, /primaryPendingItem\.kind === 'video' \? 'Video' : 'Photo'/)
  assert.doesNotMatch(createEventPageSource, /'Reel' \| 'Feed' \| 'Carousel'/)
  assert.doesNotMatch(createEventPageSource, /mediaTypeLabel=\{[^}]*Reel|mediaTypeLabel=\{[^}]*Feed|mediaTypeLabel=\{[^}]*Carousel/)
  assert.match(createEventPageSource, /visiblePendingItems\.find\(\(item\) => item\.id === selectedPendingMediaId\)/)
  assert.doesNotMatch(createEventPageSource, /item\.kind === 'video' \? 'reel'/)
})

test('Event Media omits the selected preview and keeps additional media selectable', () => {
  assert.match(createEventPageSource, /visibleAdditionalPendingItems = visiblePendingItems\.filter\(\(item\) => item\.id !== primaryPendingItem\?\.id\)/)
  assert.match(createEventPageSource, /visibleAdditionalPendingItems\.map/)
  assert.match(createEventPageSource, /onSelect=\{\(\) => setSelectedPendingMediaId\(item\.id\)\}/)
  assert.match(createEventPageSource, /overflow-x-auto/)
  assert.match(createEventPageSource, /role=\{!hero && onSelect \? 'button' : undefined\}/)
  assert.match(createEventPageSource, /data-testid="event-media-gallery"/)
  assert.match(createEventPageSource, /pendingMediaItems\.length > 1 && \([\s\S]*?>Event Media<\/h3>/)
  assert.match(createEventPageSource, /visibleAdditionalPendingItems\.length > 0 && \(/)
  assert.match(createEventPageSource, /compact \? 'h-16 w-16' : 'h-20 w-20'/)
  assert.ok(createEventPageSource.indexOf('data-testid="event-media-gallery"') > createEventPageSource.indexOf('data-testid="create-event-submit"'))
})

test('saved Event Media thumbnails can be removed without changing the selected preview', () => {
  const eventDetailSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')
  assert.match(eventDetailSource, /\{mediaTiles\.map\(\(media\) => \(/)
  assert.match(eventDetailSource, /media\.id === selectedMedia\?\.id \? 'ring-ember-500' : 'ring-stone-200'/)
  assert.match(eventDetailSource, /aria-current=\{media\.id === selectedMedia\?\.id \? 'true' : undefined\}/)
  assert.match(eventDetailSource, /aria-label={`Remove \${media\.alt \|\| 'event media'}`}/)
  assert.match(eventDetailSource, /void removeEventMedia\(media\.id\)/)
  assert.match(eventDetailSource, /if \(selectedMediaId === mediaId\) setSelectedMediaId\(nextMedia\[0\]\?\.id \?\? ''\)/)
})

test('single-media events render only Add media without a heading or duplicate thumbnail', () => {
  const galleryStart = createEventPageSource.indexOf('<section className="mt-4 min-w-0" data-testid="event-media-gallery">')
  const galleryEnd = createEventPageSource.indexOf('</section>', galleryStart)
  const gallerySource = createEventPageSource.slice(galleryStart, galleryEnd)

  assert.match(gallerySource, /pendingMediaItems\.length > 1 &&/)
  assert.match(gallerySource, /visibleAdditionalPendingItems\.length > 0 &&/)
  assert.match(gallerySource, /data-testid="add-event-media-tile"/)
  assert.ok(gallerySource.indexOf('visibleAdditionalPendingItems.map') < gallerySource.indexOf('data-testid="add-event-media-tile"'))
})

test('hero contains the only editable Event Details controls', () => {
  assert.equal(createEventPageSource.match(/<EventIdentityEditor/g)?.length, 1)
  assert.match(createEventPageSource, /onNameChange=\{\(name\) => updatePendingEventDetails\(\{ name \}\)\}/)
  assert.match(eventIdentityEditorSource, /aria-label="Event Date"/)
  assert.match(eventIdentityEditorSource, /aria-label="Event Type"/)
  assert.doesNotMatch(createEventPageSource, />\s*Event Details\s*</)
  assert.match(createEventPageSource, /\{eventEditing \? \(/)
  assert.match(createEventPageSource, /onClick=\{beginEventEditing\}/)
  assert.match(createEventPageSource, /onDone=\{finishEventEditing\}/)
  assert.match(createEventPageSource, /onCancel=\{cancelEventEditing\}/)
  assert.match(createEventPageSource, /object-cover/)
})

test('event header defaults to a compact summary and exposes controls only while editing', () => {
  const editBranchStart = createEventPageSource.indexOf('{eventEditing ? (')
  const reviewBranchStart = createEventPageSource.indexOf(') : (', editBranchStart)
  const summaryEnd = createEventPageSource.indexOf('\n                      )}\n                    </div>', reviewBranchStart)
  const editBranch = createEventPageSource.slice(editBranchStart, reviewBranchStart)
  const reviewBranch = createEventPageSource.slice(reviewBranchStart, summaryEnd)

  assert.match(editBranch, /<EventIdentityEditor/)
  assert.match(eventIdentityEditorSource, /aria-label="Event Type"/)
  assert.match(eventIdentityEditorSource, /aria-label="Event Date"/)
  assert.match(eventIdentityEditorSource, />Done<\/button>/)
  assert.match(eventIdentityEditorSource, />Cancel<\/button>/)
  assert.doesNotMatch(reviewBranch, /aria-label="Event Type"/)
  assert.doesNotMatch(reviewBranch, /aria-label="Event Date"/)
  assert.doesNotMatch(reviewBranch, />Done<\/button>/)
  assert.match(reviewBranch, /\{pendingEventDetails\.type\}[\s\S]*?•[\s\S]*?\{formatPendingEventDate\(pendingEventDetails\.date\)\}/)
  assert.match(reviewBranch, /onClick=\{beginEventEditing\}/)
})

test('event edit session commits with Done and restores its snapshot with Cancel', () => {
  assert.match(createEventPageSource, /function beginEventEditing\(\)[\s\S]*?setEventEditSnapshot\(\{[\s\S]*?name: pendingEventDetails\.name,[\s\S]*?type: pendingEventDetails\.type,[\s\S]*?date: pendingEventDetails\.date,[\s\S]*?venueName: pendingEventDetails\.venueName,[\s\S]*?venueInstagram: pendingEventDetails\.venueInstagram,[\s\S]*?venueVendorId: pendingEventDetails\.venueVendorId,[\s\S]*?setEventEditing\(true\)/)
  assert.match(createEventPageSource, /function finishEventEditing\(\)[\s\S]*?setEventEditSnapshot\(null\)[\s\S]*?setEventEditing\(false\)/)
  assert.match(createEventPageSource, /function cancelEventEditing\(\)[\s\S]*?setPendingEventDetails\(\(currentDetails\) => \(\{ \.\.\.currentDetails, \.\.\.eventEditSnapshot \}\)\)[\s\S]*?setEventEditing\(false\)/)
})

test('venue is merged into the event summary and Vendors follows one divider later', () => {
  assert.doesNotMatch(createEventPageSource, /SectionAccentIcon/)
  assert.doesNotMatch(createEventPageSource, /data-testid="selected-venue-summary"/)
  assert.match(createEventPageSource, /data-testid="event-summary-venue"/)
  assert.match(createEventPageSource, /section className="min-w-0 border-t border-stone-200\/70 pt-5"/)
  assert.match(createEventPageSource, /uppercase tracking-\[0\.06em\]/)
  assert.doesNotMatch(createEventPageSource, /space-y-4 border-t border-stone-100 pt-4/)
  assert.doesNotMatch(createEventPageSource, /label="Venue Instagram"|venueEditing|setVenueEditing/)
  assert.match(createEventPageSource, /\{eventEditing \? \(/)
  assert.match(createEventPageSource, /hasPendingVenueName \? pendingEventDetails\.venueName : '\+ Add venue'/)
  assert.doesNotMatch(createEventPageSource, /<h3[^>]*>Venue<\/h3>/)
  assert.match(createEventPageSource, />\s*Vendors\s*</)
  assert.doesNotMatch(createEventPageSource, /Vendors \(\{getPendingEventVendorCount/)
  assert.doesNotMatch(createEventPageSource, /Additional Vendors \(/)
})

test('Vendors renders one aligned single-line credit list with responsive actions', () => {
  assert.match(createEventPageSource, /No vendors added yet\./)
  assert.match(createEventPageSource, />\s*\+ Add Vendor\s*</)
  assert.match(createEventPageSource, /pendingNonVenueVendors\.map/)
  assert.match(createEventPageSource, /data-testid="pending-vendor-list"/)
  assert.match(createEventPageSource, /data-testid="pending-additional-vendor-row"/)
  assert.doesNotMatch(createEventPageSource, /divide-y divide-stone-100/)
  assert.match(createEventPageSource, /section className="min-w-0 border-t border-stone-200\/70 pt-5"/)
  assert.doesNotMatch(createEventPageSource, /VendorListIcon/)
  assert.match(createEventPageSource, /space-y-0\.5/)
  assert.match(createEventPageSource, /grid-cols-\[7\.5rem_minmax\(0,1fr\)\] gap-1\.5[^\n]+text-\[15px\] leading-5/)
  assert.match(createEventPageSource, /whitespace-nowrap font-medium text-stone-600/)
  assert.match(createEventPageSource, /group relative min-w-0/)
  assert.match(createEventPageSource, /className="rounded-md px-2 py-1 text-xs font-semibold text-stone-700/)
  assert.match(createEventPageSource, /className="absolute right-0 top-1\/2 hidden -translate-y-1\/2 items-center sm:flex"/)
  assert.match(createEventPageSource, /details className="absolute right-0 top-1\/2 -translate-y-1\/2 sm:hidden"/)
  assert.match(createEventPageSource, /aria-label=\{`Actions for \$\{formatInstagramHandle/)
  assert.match(createEventPageSource, /<span className="truncate font-semibold">\{formatInstagramHandle/)
  assert.doesNotMatch(createEventPageSource, /aria-label=\{`Edit \$\{formatInstagramHandle/)
  assert.match(createEventPageSource, /aria-label=\{`Remove \$\{formatInstagramHandle/)
  assert.match(createEventPageSource, /aria-label=\{`Open \$\{formatInstagramHandle[^\n]+on Instagram`\}/)
  assert.match(createEventPageSource, /target="_blank" rel="noreferrer"/)
  assert.match(createEventPageSource, /<InstagramIcon className="h-4 w-4" \/>/)
  assert.match(createEventPageSource, /<RemoveIcon className="h-4 w-4" \/>/)
  assert.match(createEventPageSource, />Edit<\/button>/)
  assert.match(createEventPageSource, />Remove<\/button>/)
  assert.doesNotMatch(createEventPageSource, /EditMiniIcon/)
  assert.doesNotMatch(createEventPageSource, /TrashMiniIcon/)
  const vendorsHeadingIndex = createEventPageSource.indexOf('>Vendors</h3>')
  const addVendorIndex = createEventPageSource.indexOf('>\n                            + Add Vendor')
  const vendorListIndex = createEventPageSource.indexOf('data-testid="pending-vendor-list"')
  assert.ok(vendorsHeadingIndex > -1)
  assert.ok(addVendorIndex > vendorsHeadingIndex)
  assert.ok(vendorListIndex > addVendorIndex)
})

test('Create Content is followed by a thumbnail-style Add media tile', () => {
  assert.doesNotMatch(createEventPageSource, /showAddFiles/)
  const activeWorkspaceStart = createEventPageSource.indexOf('data-testid="event-review-summary"')
  const createButtonIndex = createEventPageSource.indexOf('data-testid="create-event-submit"', activeWorkspaceStart)
  const galleryIndex = createEventPageSource.indexOf('data-testid="event-media-gallery"', createButtonIndex)
  const addMediaIndex = createEventPageSource.indexOf('data-testid="add-event-media-tile"', galleryIndex)
  const activeWorkspace = createEventPageSource.slice(activeWorkspaceStart, addMediaIndex)

  assert.doesNotMatch(activeWorkspace, />\s*Add Files\s*</)
  assert.ok(createButtonIndex > activeWorkspaceStart)
  assert.ok(galleryIndex > createButtonIndex)
  assert.ok(addMediaIndex > galleryIndex)
  assert.match(createEventPageSource, /htmlFor=\{EVENT_UPLOAD_INPUT_ID\}[\s\S]*?data-testid="add-event-media-tile"/)
  assert.match(createEventPageSource, /border border-dashed border-stone-300/)
  assert.match(createEventPageSource, />Add media<\/span>/)
  assert.match(createEventPageSource, /flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto/)
  assert.match(createEventPageSource, /className="mt-3 border-t border-stone-200\/70 pt-5" data-testid="create-event-action-footer"/)
  assert.doesNotMatch(createEventPageSource, /border-t-2 border-stone-900/)
  assert.match(createEventPageSource, /min-h-\[54px\] w-full/)
})

test('Vendors flows naturally into a compact divided action footer', () => {
  assert.match(createEventPageSource, /data-testid="pending-vendor-list"/)
  assert.match(createEventPageSource, /className="mt-3 border-t border-stone-200\/70 pt-5" data-testid="create-event-action-footer"/)
  assert.doesNotMatch(createEventPageSource, /data-testid="pending-vendor-list"[^>]*(?:min-h-|h-full|grow|flex-1|pb-|py-)/)
})

test('vendor card renders a live autocomplete-driven Venue row without changing its count', () => {
  assert.match(createEventPageSource, /data-testid="pending-venue-vendor-row"/)
  assert.match(createEventPageSource, /pendingVenuePreview\.instagramHandle/)
  const venueRowSource = createEventPageSource.slice(
    createEventPageSource.indexOf('data-testid="pending-venue-vendor-row"'),
    createEventPageSource.indexOf('{pendingNonVenueVendors.map')
  )
  assert.doesNotMatch(venueRowSource, /pendingVenuePreview\.name/)
  assert.doesNotMatch(venueRowSource, /aria-label="Edit venue"/)
  assert.match(venueRowSource, /aria-label="Remove venue"/)
  assert.match(venueRowSource, /updatePendingEventDetails\(\{ venueName: '', venueInstagram: '', venueVendorId: undefined \}\)/)
  assert.match(createEventPageSource, /group relative min-w-0[^\n]+data-testid="pending-venue-vendor-row"/)
  assert.match(createEventPageSource, /<span className="font-medium text-stone-600">Venue:<\/span>/)
  assert.doesNotMatch(createEventPageSource, /grid-cols-\[8rem_minmax\(0,1fr\)/)
  assert.match(venueRowSource, />Venue:<\/span>/)
  assert.doesNotMatch(venueRowSource, /bg-ember/)
  assert.doesNotMatch(createEventPageSource, /No other vendors added\./)
  assert.match(createEventPageSource, /venueVendorId: venue\.vendorId/)
})

test('Venue is the first Vendors list row and remains separate from vendors', () => {
  const venueRowIndex = createEventPageSource.indexOf('data-testid="pending-venue-vendor-row"')
  const vendorRowIndex = createEventPageSource.indexOf('data-testid="pending-additional-vendor-row"')
  assert.ok(venueRowIndex > -1)
  assert.ok(vendorRowIndex > venueRowIndex)
  assert.match(createEventPageSource, />\s*Vendors\s*</)
})

test('event summary presents the venue name or quiet Add venue action', () => {
  assert.match(createEventPageSource, /data-testid="event-summary-venue"/)
  assert.match(createEventPageSource, /aria-label=\{hasPendingVenueName \? 'Edit venue' : 'Add venue'\}/)
  assert.match(createEventPageSource, /onClick=\{beginEventEditing\}/)
  assert.doesNotMatch(createEventPageSource, /Will automatically be included in vendor credits\./)
  const metadataSource = createEventPageSource.slice(
    createEventPageSource.indexOf('data-testid="event-summary-metadata"'),
    createEventPageSource.indexOf('</div>\n                        </div>', createEventPageSource.indexOf('data-testid="event-summary-metadata"'))
  )
  assert.match(metadataSource, /pendingEventDetails\.type/)
  assert.match(metadataSource, /formatPendingEventDate\(pendingEventDetails\.date\)/)
  assert.match(metadataSource, /pendingEventDetails\.venueName/)
  assert.match(metadataSource, /'\+ Add venue'/)
  assert.doesNotMatch(metadataSource, /pendingVenuePreview\.instagramHandle|pendingEventDetails\.venueInstagram/)
  assert.equal(metadataSource.match(/>Done<\/button>/g)?.length ?? 0, 0)
  assert.equal(getPendingVenuePreview({ venueInstagram: '' }), null)
  assert.equal(getPendingVenuePreview({ venueInstagram: '@davisandgreyfarms' })?.instagramHandle, '@davisandgreyfarms')
})

test('Event and Venue use compact review summaries with edit modes', () => {
  const eventSummaryIndex = createEventPageSource.indexOf('data-testid="event-review-summary"')
  const venueIndex = createEventPageSource.indexOf('data-testid="event-summary-venue"')
  const vendorsIndex = createEventPageSource.indexOf('>Vendors</h3>')
  assert.ok(eventSummaryIndex > -1)
  assert.ok(venueIndex > eventSummaryIndex)
  assert.ok(vendorsIndex > venueIndex)
  assert.match(createEventPageSource, /data-testid="event-summary-metadata"[\s\S]*?\{pendingEventDetails\.type\}[\s\S]*?>•<\/span>[\s\S]*?\{formatPendingEventDate\(pendingEventDetails\.date\)\}[\s\S]*?>•<\/span>/)
  assert.match(createEventPageSource, /hasPendingVenueName \? pendingEventDetails\.venueName : '\+ Add venue'/)
  assert.match(createEventPageSource, /onClick=\{beginEventEditing\}/)
  assert.match(createEventPageSource, /setEventEditing\(true\)/)
})

test('collapsed event identity uses one readable wrapping metadata line', () => {
  assert.match(createEventPageSource, /className="max-w-2xl" data-testid="event-review-summary"/)
  assert.match(createEventPageSource, /sm:text-\[42px\]/)
  assert.match(createEventPageSource, /flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1/)
  assert.match(createEventPageSource, /data-testid="event-summary-metadata"/)
})

test('venue edit mode exposes only Venue Name and shares the event Done and Cancel actions', () => {
  const summaryStart = createEventPageSource.indexOf('data-testid="event-review-summary"')
  const summaryEnd = createEventPageSource.indexOf('<div\n                    className="mt-5 min-w-0"', summaryStart)
  const summarySource = createEventPageSource.slice(summaryStart, summaryEnd)

  assert.match(summarySource, /<EventIdentityEditor/)
  assert.match(eventIdentityEditorSource, /<VenueAutocomplete/)
  assert.doesNotMatch(eventIdentityEditorSource, /label="Venue Instagram"/)
  assert.equal(eventIdentityEditorSource.match(/>Done<\/button>/g)?.length, 1)
  assert.equal(eventIdentityEditorSource.match(/>Cancel<\/button>/g)?.length, 1)
  assert.match(summarySource, /venueInstagram: venue\.instagram \?\? ''/)
  assert.match(summarySource, /venueInstagram: ''/)
})

test('imported media appears in the standard event gallery data', () => {
  const event = buildDraftEventFromMedia([
    mockMediaFactory('photo-1', 'photo'),
    mockMediaFactory('photo-2', 'photo'),
    mockMediaFactory('clip-1', 'video'),
  ], new Date('2026-07-16T12:00:00.000Z'))

  assert.equal(event.media.length, 3)
  assert.deepEqual(event.media.map((media) => media.id), ['photo-1', 'photo-2', 'clip-1'])
})

test('legacy imported query urls normalize to the canonical standard event page', () => {
  const canonical = getDraftEventDestination('event-1')

  assert.equal(canonical, '/events/event-1')
  assert.equal(canonical, new URL('http://fireova.local/events/event-1?draft=1&imported=1').pathname)
})

test('event fields remain editable through metadata updates after upload', () => {
  const event = buildDraftEventFromMedia([mockMediaFactory('photo-1', 'photo')], new Date('2026-07-16T12:00:00.000Z'))
  const edited = {
    ...event,
    name: 'Updated Event',
    type: 'Wedding',
    date: 'August 1, 2026',
    venueName: 'The Venue',
    venueLocation: 'Dallas',
    notes: 'Edited later',
  }

  assert.equal(edited.name, 'Updated Event')
  assert.equal(edited.type, 'Wedding')
  assert.equal(edited.date, 'August 1, 2026')
  assert.equal(edited.venueName, 'The Venue')
  assert.equal(edited.venueLocation, 'Dallas')
  assert.equal(edited.notes, 'Edited later')
})

test('media analysis can begin after upload without blocking canonical navigation', async () => {
  const batch = collectPendingEventMedia([], [fileFactory('event/photo-1.jpg', 'image/jpeg')])
  let reviewStarted = false

  const result = await createEventFromPendingBatch(batch.items, async () => ({
    event: { id: 'event-1' },
  }))
  const destination = getDraftEventDestination(result.event.event.id)
  reviewStarted = true

  assert.equal(destination, '/events/event-1')
  assert.equal(reviewStarted, true)
})

test('pending media and details remain after a failed creation attempt', async () => {
  const details: PendingEventDetails = {
    name: 'Failed Retry Event',
    date: '2026-07-16',
    type: 'Other',
  }
  const batch = collectPendingEventMedia([], [fileFactory('event/photo.jpg', 'image/jpeg')])

  await assert.rejects(
    createEventFromPendingBatch(batch.items, async () => {
      throw new Error('event creation failed')
    }),
    /event creation failed/
  )

  assert.equal(batch.items.length, 1)
  assert.deepEqual(details, {
    name: 'Failed Retry Event',
    date: '2026-07-16',
    type: 'Other',
  })
})

test('double clicking create event does not create duplicates when submission is already preparing', async () => {
  const batch = collectPendingEventMedia([], [fileFactory('event/photo.jpg', 'image/jpeg')])
  let creating = false
  let created = 0

  async function guardedCreate() {
    if (creating) return null
    creating = true
    const result = await createEventFromPendingBatch(batch.items, async () => {
      created += 1
      return { id: 'event-1' }
    })
    return result
  }

  const first = guardedCreate()
  const second = guardedCreate()
  const results = await Promise.all([first, second])

  assert.equal(created, 1)
  assert.equal(results.filter(Boolean).length, 1)
})

test('the visible Create Event button invokes the guarded submit handler and exposes progress', () => {
  assert.match(createEventPageSource, /function handleCreateEventClick\(event: ReactMouseEvent<HTMLButtonElement>\)/)
  assert.match(createEventPageSource, /data-testid="create-event-submit"/)
  assert.match(createEventPageSource, /onClick=\{handleCreateEventClick\}/)
  assert.match(createEventPageSource, /void continueWithPendingBatch\(\)/)
  assert.match(createEventPageSource, /disabled=\{uploadPrepState === 'preparing' \|\| creatingEventRef\.current\}/)
  assert.match(createEventPageSource, /\? 'Creating Content\.\.\.'/)
  assert.match(createEventPageSource, /✨ Create Content <span className="ml-1\.5 inline-block transition-transform duration-200 group-hover:translate-x-1">→<\/span>/)
})

test('Create Event failures render inline without clearing pending form state', () => {
  const submitSource = createEventPageSource.slice(
    createEventPageSource.indexOf('async function continueWithPendingBatch'),
    createEventPageSource.indexOf('function clearPendingBatch')
  )
  assert.match(createEventPageSource, /id="create-event-submit-error" role="alert"/)
  assert.match(submitSource, /setCreateEventError\(errorMessage\)/)
  assert.match(submitSource, /console\.error\('\[Fireova Create Event\] CREATE_EVENT_FAILED', error\)/)
  assert.doesNotMatch(submitSource, /setPendingMediaItems\(clearPendingEventMediaBatch\(\)\)/)
  assert.doesNotMatch(submitSource, /setPendingEventDetails\(DEFAULT_PENDING_EVENT_DETAILS\)/)
})

test('successful Create Event navigation replaces history after all saved data is synchronized', () => {
  const submitSource = createEventPageSource.slice(
    createEventPageSource.indexOf('async function continueWithPendingBatch'),
    createEventPageSource.indexOf('function clearPendingBatch')
  )
  const createIndex = submitSource.indexOf('createCloudEventWithMedia({')
  const routeIndex = submitSource.indexOf('`/events/${confirmedEvent.id}`')
  const replaceIndex = submitSource.indexOf('router.replace(redirectHref)')

  assert.ok(createIndex > -1)
  assert.ok(routeIndex > createIndex)
  assert.ok(replaceIndex > routeIndex)
  assert.doesNotMatch(submitSource, /router\.push\(/)
  assert.doesNotMatch(submitSource, /setPendingMediaItems\(result\.items\)/)
  assert.doesNotMatch(submitSource, /setPendingEventDetails\(DEFAULT_PENDING_EVENT_DETAILS\)/)
  assert.match(submitSource, /uploadPrepState === 'preparing' \|\| creatingEventRef\.current/)
})

test('media collection stays temporary until cloud event and media are confirmed', () => {
  assert.match(createEventPageSource, /createCloudEventWithMedia\(\{/)
  assert.match(createEventPageSource, /items: mediaItems/)
  assert.match(createEventPageSource, /saveLocalEvent\(confirmedEvent\)/)
  assert.match(createEventPageSource, /`\/events\/\$\{confirmedEvent\.id\}`/)
  assert.match(createEventPageSource, /await continueWithPendingBatch\(batch\.items, batch\.details\)/)
  assert.doesNotMatch(createEventPageSource, /createDraftEventFromFiles\(items\.map/)
  assert.doesNotMatch(createEventPageSource, /Event saved automatically/)
})

test('refreshing canonical event url stays on standard event page', () => {
  const firstLoad = getDraftEventDestination('event-1')
  const refreshed = getDraftEventDestination('event-1')

  assert.equal(firstLoad, '/events/event-1')
  assert.equal(refreshed, firstLoad)
})

test('pending state clears only after successful creation', async () => {
  const batch = collectPendingEventMedia([], [fileFactory('event/photo.jpg', 'image/jpeg')])
  const failedItems = batch.items
  await assert.rejects(
    createEventFromPendingBatch(batch.items, async () => {
      throw new Error('save failed')
    }),
    /save failed/
  )

  const result = await createEventFromPendingBatch(batch.items, async () => ({ id: 'event-1' }))

  assert.equal(failedItems.length, 1)
  assert.equal(result.items.length, 0)
})

test('validation prevents creation with no media', () => {
  const errors = validatePendingEventDetails([], DEFAULT_PENDING_EVENT_DETAILS)

  assert.equal(errors.media, 'Add at least one photo or video.')
  assert.equal(hasPendingEventDetailErrors(errors), true)
})

test('validation prevents an empty event name', () => {
  const batch = collectPendingEventMedia([], [fileFactory('event/photo.jpg', 'image/jpeg')])
  const errors = validatePendingEventDetails(batch.items, {
    ...DEFAULT_PENDING_EVENT_DETAILS,
    name: '  ',
  })

  assert.equal(errors.name, 'Add an event name.')
  assert.equal(hasPendingEventDetailErrors(errors), true)
})

test('clicking Event Name focuses editing instead of invoking the file input', () => {
  const shouldOpen = shouldOpenUploadPickerFromTray({
    activeBatch: true,
    preparing: false,
    interactiveTarget: true,
  })

  assert.equal(shouldOpen, false)
})

test('typing in Event Name does not invoke the file input', () => {
  const shouldOpen = shouldOpenUploadPickerFromTray({
    activeBatch: true,
    preparing: false,
    interactiveTarget: true,
  })
  const details = {
    ...DEFAULT_PENDING_EVENT_DETAILS,
    name: 'Smith Wedding',
  }

  assert.equal(shouldOpen, false)
  assert.equal(details.name, 'Smith Wedding')
})

test('clicking Event Date does not invoke the file input', () => {
  const shouldOpen = shouldOpenUploadPickerFromTray({
    activeBatch: true,
    preparing: false,
    interactiveTarget: true,
  })

  assert.equal(shouldOpen, false)
})

test('clicking Event Type does not invoke the file input', () => {
  const shouldOpen = shouldOpenUploadPickerFromTray({
    activeBatch: true,
    preparing: false,
    interactiveTarget: true,
  })

  assert.equal(shouldOpen, false)
})

test('Add Files still opens the file picker before an event batch exists', () => {
  const shouldOpen = shouldOpenUploadPickerFromTray({
    activeBatch: false,
    preparing: false,
    interactiveTarget: false,
  })

  assert.equal(shouldOpen, true)
})

test('Add Files remains a normal file picker rather than a directory picker', () => {
  const fileInputSource = createEventPageSource.slice(
    createEventPageSource.indexOf(`id={EVENT_UPLOAD_INPUT_ID}`),
    createEventPageSource.indexOf(`id={EVENT_FOLDER_UPLOAD_INPUT_ID}`)
  )
  assert.match(fileInputSource, /multiple/)
  assert.match(fileInputSource, /onChange=\{\(event\) => void handleUploadInput\(event\.target\.files\)\}/)
  assert.match(fileInputSource, /event\.currentTarget\.value = ''/)
  assert.doesNotMatch(fileInputSource, /webkitdirectory|directory:/)
})

test('folder collection remains available internally without an explicit Add Folder control', () => {
  const detailsClickCanOpen = shouldOpenUploadPickerFromTray({
    activeBatch: true,
    preparing: false,
    interactiveTarget: true,
  })

  assert.doesNotMatch(createEventPageSource, />\s*Add Folder\s*</)
  assert.match(createEventPageSource, /id=\{EVENT_FOLDER_UPLOAD_INPUT_ID\}/)
  assert.match(createEventPageSource, /collectDroppedMediaFiles\(event\.dataTransfer\)/)
  assert.equal(detailsClickCanOpen, false)
})

test('drag and drop still collects files across the intended drop target', async () => {
  const files = [
    fileFactory('event/photo-1.jpg', 'image/jpeg'),
    fileFactory('event/clip-1.mp4', 'video/mp4'),
  ]
  const collected = await collectDroppedMediaFiles(dataTransferFromFiles(files))

  assert.deepEqual(collected.map((file) => file.name).sort(), ['clip-1.mp4', 'photo-1.jpg'])
})

test('existing pending media is preserved while editing event details', () => {
  const batch = collectPendingEventMedia([], [fileFactory('event/photo.jpg', 'image/jpeg')])
  const details = {
    ...DEFAULT_PENDING_EVENT_DETAILS,
    name: 'Edited Name',
  }

  assert.equal(batch.items.length, 1)
  assert.equal(details.name, 'Edited Name')
})

test('events browsing workflow is visible before a pending batch starts', () => {
  assert.equal(shouldShowEventsBrowseWorkflow(false), true)
})

test('events browsing workflow is hidden while building a pending event', () => {
  assert.equal(shouldShowEventsBrowseWorkflow(true), false)
})

test('clear removes the pending batch without creating an event', () => {
  let created = 0
  const batch = collectPendingEventMedia([], [fileFactory('event/photo.jpg', 'image/jpeg')])
  const cleared = clearPendingEventMediaBatch()

  assert.equal(batch.items.length, 1)
  assert.equal(cleared.length, 0)
  assert.equal(created, 0)
})

test('removing one item preserves the rest of the batch', () => {
  const batch = collectPendingEventMedia([], [
    fileFactory('event/photo-1.jpg', 'image/jpeg'),
    fileFactory('event/photo-2.jpg', 'image/jpeg'),
    fileFactory('event/clip-1.mov', 'video/quicktime'),
  ])
  const itemToRemove = batch.items.find((item) => item.file.name === 'photo-2.jpg')
  assert.ok(itemToRemove)
  const next = removePendingEventMediaItem(batch.items, itemToRemove.id)

  assert.equal(next.length, 2)
  assert.deepEqual(next.map((item) => item.file.name).sort(), ['clip-1.mov', 'photo-1.jpg'])
})

test('duplicate media is skipped safely', () => {
  const file = fileFactory('event/photo.jpg', 'image/jpeg')
  const first = collectPendingEventMedia([], [file])
  const second = collectPendingEventMedia(first.items, [file])

  assert.equal(second.items.length, 1)
  assert.equal(second.addedCount, 0)
  assert.equal(second.duplicateCount, 1)
})

test('pending batch is cleared only after successful event creation', async () => {
  const batch = collectPendingEventMedia([], [fileFactory('event/photo.jpg', 'image/jpeg')])
  await assert.rejects(
    createEventFromPendingBatch(batch.items, async () => {
      throw new Error('event creation failed')
    }),
    /event creation failed/
  )

  assert.equal(batch.items.length, 1)

  const result = await createEventFromPendingBatch(batch.items, async () => ({ id: 'event-1' }))
  assert.equal(result.items.length, 0)
})

function fileFactory(path: string, type: string, lastModified = 1) {
  const name = path.split('/').at(-1) ?? path
  const file = new File(['test'], name, { type, lastModified })
  Object.defineProperty(file, 'webkitRelativePath', {
    value: path,
    configurable: true,
  })
  return file
}

function mockMediaFactory(id: string, type: 'photo' | 'video') {
  return {
    id,
    type,
    src: `fireova-idb-media://${id}`,
    alt: `${id}.${type === 'video' ? 'mp4' : 'jpg'}`,
  }
}

function dataTransferFromFiles(files: File[]) {
  return {
    types: ['Files'],
    files,
    items: files.map((file): DataTransferItemWithEntry => ({
      kind: 'file',
      type: file.type,
      getAsFile: () => file,
      webkitGetAsEntry: () => fileEntry(file),
    })),
  }
}

function dataTransferFromEntries(entries: FileSystemEntryLike[]) {
  return {
    types: ['Files'],
    files: [],
    items: entries.map((entry): DataTransferItemWithEntry => ({
      kind: 'file',
      type: '',
      getAsFile: () => null,
      webkitGetAsEntry: () => entry,
    })),
  }
}

function fileEntry(file: File): FileSystemFileEntryLike {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    file: (successCallback) => successCallback(file),
  }
}

function directoryEntry(name: string, entries: FileSystemEntryLike[], batchSize: number): FileSystemDirectoryEntryLike {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let index = 0
      return {
        readEntries: (successCallback) => {
          const batch = entries.slice(index, index + batchSize)
          index += batchSize
          successCallback(batch)
        },
      }
    },
  }
}
