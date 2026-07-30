import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { buildDraftEventFromMedia, DEFAULT_PENDING_EVENT_DETAILS } from '@/lib/local-fireova-event-upload'
import type { LocalFireovaEvent } from '@/lib/local-fireova-events'
import {
  filterVendorDirectoryEntries,
  formatInstagramHandle,
  type FireovaVendor,
} from '@/lib/local-fireova-vendors'
import { getSavedVenueOptions, searchSavedVenues } from '@/lib/local-fireova-venues'

const createEventPageSource = fs.readFileSync('app/(app)/events/page.tsx', 'utf8')
const inlineEventDetailsHeaderSource = fs.readFileSync('components/events/inline-event-details-header.tsx', 'utf8')
const vendorSelectionWorkflowSource = fs.readFileSync('components/events/vendor-selection-workflow.tsx', 'utf8')

test('saved event venues are deduplicated case-insensitively and missing Instagram is merged', () => {
  const venues = getSavedVenueOptions([
    eventFactory('one', 'The Mason', undefined),
    eventFactory('two', '  the   mason ', '@TheMasonVenue'),
    eventFactory('three', 'Wild Oak', '@wildoak'),
  ])

  assert.deepEqual(venues, [
    { name: 'The Mason', instagram: '@themasonvenue' },
    { name: 'Wild Oak', instagram: '@wildoak' },
  ])
  assert.deepEqual(searchSavedVenues(venues, 'mason'), [{ name: 'The Mason', instagram: '@themasonvenue' }])
  assert.deepEqual(searchSavedVenues(venues, '@wildoak'), [{ name: 'Wild Oak', instagram: '@wildoak' }])
})

test('Venue autocomplete includes category-Venue records from the Vendor Directory', () => {
  const directoryVenue = vendorFactory('venue-directory', 'Venue', 'Davis and Grey Farms', 'davisandgreyfarms')
  const nonVenue = vendorFactory('planner-directory', 'Planner', 'Planning Co', 'planningco')
  const venues = getSavedVenueOptions([], [directoryVenue, nonVenue])

  assert.deepEqual(venues, [{
    name: 'Davis and Grey Farms',
    instagram: '@davisandgreyfarms',
    vendorId: 'venue-directory',
  }])
})

test('venue selection supports saved and newly created cloud venues', () => {
  assert.match(createEventPageSource, /venues=\{savedVenueOptions\}/)
  assert.match(inlineEventDetailsHeaderSource, /const venue = selectedVenue/)
  assert.match(inlineEventDetailsHeaderSource, /venueName: venue\.name/)
  assert.match(inlineEventDetailsHeaderSource, /venueLocation: venue\.location \?\? ''/)
  assert.match(inlineEventDetailsHeaderSource, /venueInstagram: venue\.instagram \?\? ''/)
  assert.match(inlineEventDetailsHeaderSource, /venueVendorId: venue\.vendorId/)
  assert.match(inlineEventDetailsHeaderSource, /venueName: nextVenueName/)
  assert.match(inlineEventDetailsHeaderSource, /<VenueSelectionWorkflow/)
  assert.doesNotMatch(inlineEventDetailsHeaderSource, /<VenueAutocomplete/)

  const event = buildDraftEventFromMedia([
    { id: 'new-venue-photo', type: 'photo', src: 'fireova-idb-media://new-venue-photo', alt: 'Venue' },
  ], new Date('2026-07-19T12:00:00.000Z'), {
    ...DEFAULT_PENDING_EVENT_DETAILS,
    name: 'New Venue Event',
    venueName: 'A Brand New Venue',
    venueInstagram: '@newvenue',
  })
  assert.equal(event.venueName, 'A Brand New Venue')
  assert.equal(event.venueInstagram, '@newvenue')
})

test('Vendor Directory search matches Instagram, category, and legacy business name', () => {
  const vendors = [vendorFactory('photo', 'Photographer', 'Wild Oak Photography', 'wildoakphoto')]

  assert.equal(filterVendorDirectoryEntries(vendors, '@wildoak').length, 1)
  assert.equal(filterVendorDirectoryEntries(vendors, 'photographer').length, 1)
  assert.equal(filterVendorDirectoryEntries(vendors, 'Wild Oak Photography').length, 1)
  assert.equal(filterVendorDirectoryEntries(vendors, 'planner').length, 0)
})

test('vendor selection immediately commits directory data and offers compact manual entry', () => {
  assert.match(createEventPageSource, /vendorId: vendor\.id/)
  assert.match(createEventPageSource, /businessName: vendor\.businessName/)
  assert.match(createEventPageSource, /category: vendor\.category/)
  assert.match(createEventPageSource, /instagramOverride: instagramHandle/)
  assert.match(createEventPageSource, /notes: vendor\.notes/)
  assert.match(createEventPageSource, /Add new vendor:/)
  assert.match(createEventPageSource, /onQuickAddSaved\(vendor\)/)
  assert.match(createEventPageSource, /onQuickAddNew\(newVendorCategory, newVendorInstagram\)/)
})

test('autocomplete interactions support keyboard dismissal and outside clicks', () => {
  assert.match(createEventPageSource, /event\.key === 'ArrowDown'/)
  assert.match(createEventPageSource, /event\.key === 'ArrowUp'/)
  assert.match(createEventPageSource, /event\.key === 'Enter'/)
  assert.match(createEventPageSource, /event\.key === 'Escape'/)
  assert.match(createEventPageSource, /aria-label="Close Add Vendor modal" onClick=\{onClose\}/)
})

test('quick Add Vendor mode defaults to one search box without the long form', () => {
  const addModeSource = createEventPageSource.slice(
    createEventPageSource.indexOf("{mode === 'add' ? ("),
    createEventPageSource.indexOf('<div className="space-y-3.5">', createEventPageSource.indexOf("{mode === 'add' ? ("))
  )
  assert.match(addModeSource, /Search vendors by name, category, or @handle/)
  assert.match(addModeSource, /Search your Vendor Directory/)
  assert.doesNotMatch(addModeSource, /Notes \(Optional\)|>Save<|>Cancel<|Pending until event creation/)
  assert.match(addModeSource, /\{creatingNew && \(/)
  assert.match(addModeSource, />Category<\/span>/)
  assert.match(addModeSource, />Instagram<\/span>/)
  assert.match(createEventPageSource, /quickSearchInputRef\.current\?\.focus\(\)/)
})

test('Add Vendor uses full-screen mobile selection and a centered desktop modal', () => {
  assert.match(createEventPageSource, /<VendorSelectionWorkflow/)
  assert.match(vendorSelectionWorkflowSource, /fixed inset-0 z-\[80\] bg-white/)
  assert.match(vendorSelectionWorkflowSource, /md:flex md:items-center md:justify-center md:bg-black\/35/)
  assert.match(vendorSelectionWorkflowSource, /md:max-w-2xl md:rounded-2xl md:shadow-2xl/)
})

test('Add Vendor offers an explicit new-vendor path before searching', () => {
  assert.match(createEventPageSource, />\+ Create new vendor<\/button>/)
  assert.match(createEventPageSource, /onClick=\{beginNewVendor\}/)
  assert.match(createEventPageSource, /!vendorSearch\.trim\(\) && !creatingNew/)
  assert.match(createEventPageSource, /{creatingNew && \(/)
  assert.match(createEventPageSource, />Category<\/span>/)
  assert.match(createEventPageSource, />Instagram<\/span>/)
})

test('directory synchronization follows confirmed cloud event persistence', () => {
  const createEventSection = createEventPageSource.slice(
    createEventPageSource.indexOf('async function continueWithPendingBatch'),
    createEventPageSource.indexOf('function handleCreateEventClick')
  )
  assert.doesNotMatch(createEventPageSource, /createLocalVendor|writeLocalVendors/)
  assert.match(createEventSection, /ensurePendingCloudEvent/)
  assert.match(createEventSection, /saveEventToCloud\(updatedEvent\)/)
  assert.match(createEventSection, /loadEventFromCloud\(currentCloudEvent\.id\)/)
  assert.match(createEventSection, /router\.replace\(`\/events\/\$\{reloadedEvent\.id\}`\)/)
})

test('Instagram handles render with exactly one normalized leading at-sign', () => {
  assert.equal(formatInstagramHandle('@@WildOakPhoto'), '@wildoakphoto')
  assert.equal(formatInstagramHandle('https://instagram.com/WildOakPhoto/'), '@wildoakphoto')
})

function eventFactory(id: string, venueName: string, venueInstagram?: string): LocalFireovaEvent {
  return {
    id,
    name: `Event ${id}`,
    date: 'July 19, 2026',
    type: 'Wedding',
    venueName,
    venueInstagram,
    status: 'Needs Content',
    draftCount: 0,
    cover: { id: `cover-${id}`, type: 'photo', src: '', alt: '' },
    createdAt: '2026-07-19T12:00:00.000Z',
    media: [],
  }
}

function vendorFactory(id: string, category: FireovaVendor['category'], businessName: string, instagramHandle: string): FireovaVendor {
  return {
    id,
    category,
    businessName,
    instagramHandle,
    preferredVendor: false,
    createdAt: '2026-07-19T12:00:00.000Z',
    updatedAt: '2026-07-19T12:00:00.000Z',
  }
}
