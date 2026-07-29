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
const inlineEventDetailsHeaderSource = fs.readFileSync('components/events/inline-event-details-header.tsx', 'utf8')
const quickAddVendorModalSource = fs.readFileSync('components/events/quick-add-vendor-modal.tsx', 'utf8')
const sidebarSource = fs.readFileSync('components/layout/sidebar.tsx', 'utf8')

test('event cards open Event Details directly without an intermediate overview action', () => {
  assert.match(createEventPageSource, /<Link\s+href={`\/events\/\$\{event\.id\}`}/)
  assert.doesNotMatch(createEventPageSource, />\s*Open Event\s*</)
  assert.doesNotMatch(sidebarSource, /label: 'Create Event'/)
})

test('canonical and upload Event Details routes share the inline-edit header', () => {
  assert.match(eventDetailSource, /<InlineEventDetailsHeader/)
  assert.match(createEventPageSource, /<InlineEventDetailsHeader/)
  assert.match(eventDetailSource, /onSave={saveEventMetadata}/)
  assert.match(createEventPageSource, /onSave={savePendingEventMetadataToCloud}/)
  assert.match(inlineEventDetailsHeaderSource, /data-testid="inline-event-details-header"/)
  assert.doesNotMatch(createEventPageSource, /Edit event details|setEventEditing|eventEditing|EventIdentityEditor/)
  assert.doesNotMatch(eventDetailSource, /Edit event details|setEventEditing|eventEditing|EventIdentityEditor/)
  assert.match(eventDetailSource, /data-testid="saved-event-editor"/)
  assert.match(eventDetailSource, /lg:grid-cols-\[minmax\(0,47fr\)_minmax\(0,53fr\)\]/)
  assert.match(eventDetailSource, /<QuickAddVendorModal/)
})
test('canonical event edits await Supabase update and same-UUID reload', () => {
  const saveStart = eventDetailSource.indexOf('async function saveEventMetadata')
  const saveEnd = eventDetailSource.indexOf('function persistEventMedia', saveStart)
  const saveSource = eventDetailSource.slice(saveStart, saveEnd)

  assert.match(saveSource, /id: localEvent\.id/)
  assert.match(saveSource, /media: localEvent\.media/)
  assert.match(saveSource, /cover: localEvent\.cover/)
  assert.match(saveSource, /await saveEventToCloud\(updatedEvent\)/)
  assert.match(saveSource, /await loadEventFromCloud\(localEvent\.id\)/)
  assert.match(saveSource, /saved\.id !== localEvent\.id/)
  assert.doesNotMatch(saveSource, /updateLocalEventMetadata|localStorage|sessionStorage/)
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
  assert.doesNotMatch(createEventPageSource, /label="Venue Location"|pendingEventDetails\.venueLocation/)
  assert.doesNotMatch(inlineEventDetailsHeaderSource, />Venue Location</)
  assert.match(createEventPageSource, /<InlineEventDetailsHeader/)
  assert.doesNotMatch(createEventPageSource, /label="Venue Instagram"/)
})

test('Create Event uses responsive non-overflowing section layouts', () => {
  assert.match(createEventPageSource, /lg:grid-cols-\[minmax\(0,47fr\)_minmax\(0,53fr\)\]/)
  assert.match(createEventPageSource, /className="max-w-2xl" data-testid="event-review-summary"/)
  assert.match(createEventPageSource, /<InlineEventDetailsHeader/)
  assert.match(createEventPageSource, /group relative min-w-0/)
  assert.match(quickAddVendorModalSource, /max-w-\[520px\]/)
  assert.doesNotMatch(createEventPageSource, /absolute inset-y-0 right-0/)
})

test('active Create Event panel presents a balanced media and event-summary hero', () => {
  assert.match(createEventPageSource, /data-testid="event-review-hero"/)
  assert.match(createEventPageSource, /data-testid="event-review-summary"/)
  assert.match(createEventPageSource, /lg:grid-cols-\[minmax\(0,47fr\)_minmax\(0,53fr\)\]/)
  assert.match(createEventPageSource, /lg:gap-x-7/)
  assert.match(createEventPageSource, /hero\s+mediaTypeLabel=\{primaryPendingItem\.kind === 'video' \? 'Video' : 'Photo'\}/)
  assert.match(createEventPageSource, /✨ Create Content/)
  assert.doesNotMatch(createEventPageSource, /Edit event details|setEventEditing/)
})

test('right-side workspace follows event details vendors and final create order', () => {
  const titleIndex = createEventPageSource.indexOf('<InlineEventDetailsHeader')
  const vendorsIndex = createEventPageSource.indexOf('>Vendors</h3>')
  const createIndex = createEventPageSource.indexOf('data-testid="create-event-submit"')
  assert.ok(titleIndex > -1)
  assert.ok(vendorsIndex > titleIndex)
  assert.ok(createIndex > vendorsIndex)
  assert.doesNotMatch(createEventPageSource, /showAddFiles/)
})

test('venue remains in the labeled event form before the Vendors section', () => {
  const headerIndex = createEventPageSource.indexOf('<InlineEventDetailsHeader')
  const vendorsIndex = createEventPageSource.indexOf('>Vendors</h3>')
  assert.ok(headerIndex > -1)
  assert.ok(vendorsIndex > headerIndex)
  assert.match(inlineEventDetailsHeaderSource, />Venue<\/label>/)
  assert.match(inlineEventDetailsHeaderSource, /placeholder="Select or add venue"/)
  assert.match(createEventPageSource, /section className="min-w-0 border-t border-stone-200\/70 pt-5"/)
  assert.doesNotMatch(createEventPageSource, /<h3[^>]*>Venue<\/h3>/)
})

test('Vendors retains its aligned responsive credit list', () => {
  assert.match(createEventPageSource, /No vendors added yet\./)
  assert.match(createEventPageSource, />\s*\+ Add Vendor\s*</)
  assert.match(createEventPageSource, /data-testid="pending-vendor-list"/)
  assert.match(createEventPageSource, /data-testid="pending-additional-vendor-row"/)
  assert.match(createEventPageSource, /grid-cols-\[7\.5rem_minmax\(0,1fr\)\] gap-1\.5/)
  assert.match(createEventPageSource, /details className="absolute right-0 top-1\/2 -translate-y-1\/2 sm:hidden"/)
  assert.match(createEventPageSource, /aria-label=\{`Remove \$\{formatInstagramHandle/)
})

test('venue vendor credit stays attached to the inline venue relationship', () => {
  const venueRowSource = createEventPageSource.slice(
    createEventPageSource.indexOf('data-testid="pending-venue-vendor-row"'),
    createEventPageSource.indexOf('{pendingNonVenueVendors.map')
  )
  assert.match(venueRowSource, /pendingVenuePreview\.instagramHandle/)
  assert.match(venueRowSource, /aria-label="Remove venue"/)
  assert.match(venueRowSource, /updatePendingEventDetails\(\{ venueName: '', venueInstagram: '', venueVendorId: undefined \}\)/)
  assert.match(inlineEventDetailsHeaderSource, /venueVendorId: venue\.vendorId/)
})

test('shared event identity always uses one responsive edit form', () => {
  assert.match(createEventPageSource, /className="max-w-2xl" data-testid="event-review-summary"/)
  assert.match(inlineEventDetailsHeaderSource, /data-testid="event-details-form"/)
  assert.match(inlineEventDetailsHeaderSource, /placeholder="Enter event name"/)
  assert.match(inlineEventDetailsHeaderSource, /text-\[25px\] font-semibold[\s\S]*?text-\[#171717\][\s\S]*?md:text-\[30px\]/)
  assert.match(inlineEventDetailsHeaderSource, /placeholder:text-\[22px\][\s\S]*?md:placeholder:text-\[26px\]/)
  assert.match(inlineEventDetailsHeaderSource, /md:grid-cols-3/)
  assert.match(inlineEventDetailsHeaderSource, />Event type<\/span>/)
  assert.match(inlineEventDetailsHeaderSource, />Event date<\/span>/)
  assert.doesNotMatch(inlineEventDetailsHeaderSource, /event-details-read-mode|event-details-edit-mode/)
  assert.doesNotMatch(inlineEventDetailsHeaderSource, /isEditingEvent|setIsEditingEvent|>\s*Edit event\s*<|>\s*Cancel\s*<|>\s*Save changes\s*</)
  assert.match(inlineEventDetailsHeaderSource, /queueSave\('name', 700\)/)
  assert.match(inlineEventDetailsHeaderSource, /queueSave\('type'\)/)
  assert.match(inlineEventDetailsHeaderSource, /queueSave\('date'\)/)
  assert.match(inlineEventDetailsHeaderSource, /queueSave\('venueName'\)/)
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

test('Venue is the first Vendors list row and remains separate from vendors', () => {
  const venueRowIndex = createEventPageSource.indexOf('data-testid="pending-venue-vendor-row"')
  const vendorRowIndex = createEventPageSource.indexOf('data-testid="pending-additional-vendor-row"')
  assert.ok(venueRowIndex > -1)
  assert.ok(vendorRowIndex > venueRowIndex)
  assert.match(createEventPageSource, />\s*Vendors\s*</)
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
  assert.match(createEventPageSource, /disabled=\{uploadBusy \|\| creatingEventRef\.current\}/)
  assert.doesNotMatch(createEventPageSource, /Creating Content\.\.\./)
  assert.match(createEventPageSource, /✨ Create Content <span className="ml-1\.5 inline-block transition-transform duration-200 group-hover:translate-x-1">→<\/span>/)
})

test('active upload replaces the preview workspace with one focused status', () => {
  const focusedStart = createEventPageSource.indexOf('{uploadBusy ? (')
  const focusedEnd = createEventPageSource.indexOf(') : uploadFailureActive && activeBatch ? (', focusedStart)
  const focusedSource = createEventPageSource.slice(focusedStart, focusedEnd)
  assert.match(focusedSource, /data-testid="event-upload-focused-status"/)
  assert.match(focusedSource, /data-testid="event-upload-spinner"/)
  assert.equal((focusedSource.match(/data-testid="event-upload-spinner"/g) ?? []).length, 1)
  assert.match(focusedSource, />Uploading\.\.\.<\/p>/)
  assert.match(focusedSource, /Keep this screen open\./)
  assert.match(createEventPageSource, /Videos may take a little longer\./)
  assert.match(createEventPageSource, /border-transparent bg-transparent p-0 text-stone-800 shadow-none/)
  assert.match(createEventPageSource, /md:border-stone-200 md:bg-white/)
  assert.match(focusedSource, /min-h-\[calc\(100dvh-8rem\)\]/)
  assert.match(focusedSource, /mt-4 text-\[29px\]/)
  assert.match(focusedSource, /mt-2\.5 text-\[17px\]/)
  assert.match(createEventPageSource, /hidden md:mt-1 md:block/)
  assert.doesNotMatch(focusedSource, /min-h-\[min\(62vh,520px\)\]/)
  assert.match(focusedSource, /role="status"/)
  assert.match(focusedSource, /aria-live="polite"/)
  assert.match(focusedSource, /aria-atomic="true"/)
  assert.match(focusedSource, /motion-reduce:animate-none/)
  assert.doesNotMatch(focusedSource, /PendingMediaCard/)
  assert.doesNotMatch(focusedSource, /InlineEventDetailsHeader/)
  assert.doesNotMatch(focusedSource, /Add Vendor|Add media|Change Media|Remove/)
  assert.doesNotMatch(focusedSource, /role="progressbar"|percent/)
})

test('failed uploads show one retry screen and preserve the hidden preview form', () => {
  const submitSource = createEventPageSource.slice(
    createEventPageSource.indexOf('async function continueWithPendingBatch'),
    createEventPageSource.indexOf('function clearPendingBatch')
  )
  const failureStart = createEventPageSource.indexOf('uploadFailureActive && activeBatch ? (')
  const failureEnd = createEventPageSource.indexOf(') : (<>', failureStart)
  const failureSource = createEventPageSource.slice(failureStart, failureEnd)
  assert.match(createEventPageSource, /Photo upload failed/)
  assert.match(createEventPageSource, /Video upload failed/)
  assert.match(createEventPageSource, /Event could not be saved/)
  assert.match(failureSource, />Upload failed<\/h2>/)
  assert.match(failureSource, />\s*Retry upload\s*</)
  assert.match(failureSource, /onClick=\{showPreservedUploadPreview\}/)
  assert.match(failureSource, />\s*Go back\s*</)
  assert.match(failureSource, /min-h-11/)
  assert.match(createEventPageSource, /function showPreservedUploadPreview\(\)/)
  assert.doesNotMatch(submitSource, /setPendingMediaItems\(clearPendingEventMediaBatch\(\)\)/)
  assert.doesNotMatch(submitSource, /setPendingEventDetails\(DEFAULT_PENDING_EVENT_DETAILS\)/)
})

test('retry remains deduplicated while upload status wording stays internal', () => {
  assert.match(createEventPageSource, /if \(cloudEventPromiseRef\.current\) return cloudEventPromiseRef\.current/)
  assert.match(createEventPageSource, /cloudCreationKeyRef\.current \?\? crypto\.randomUUID\(\)/)
  assert.match(createEventPageSource, /<span className="sr-only">\{uploadPrepMessage\}<\/span>/)
  assert.doesNotMatch(createEventPageSource, /Creating Content\.\.\./)
})

test('successful upload reloads the same UUID with attached media before navigation', () => {
  const submitSource = createEventPageSource.slice(
    createEventPageSource.indexOf('async function continueWithPendingBatch'),
    createEventPageSource.indexOf('function ensurePendingCloudEvent')
  )
  assert.match(submitSource, /const reloadedEvent = await loadEventFromCloud\(confirmedEvent\.id\)/)
  assert.match(submitSource, /saveLocalEvent\(reloadedEvent\)/)
  assert.match(submitSource, /router\.replace\(`\/events\/\$\{reloadedEvent\.id\}`\)/)
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
