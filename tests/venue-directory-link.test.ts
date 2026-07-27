import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  LOCAL_FIREOVA_EVENTS_KEY,
  readLocalEvent,
  saveLocalEvent,
  type LocalFireovaEvent,
  verifyLocalEventPersistence,
} from '@/lib/local-fireova-events'
import {
  buildEventVendorCreditSnapshot,
  buildVendorCreditsText,
  LOCAL_FIREOVA_VENDORS_KEY,
  readLocalVendors,
  syncEventVenueWithDirectory,
} from '@/lib/local-fireova-vendors'

const createEventPageSource = fs.readFileSync('app/(app)/events/page.tsx', 'utf8')
const eventDetailSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')

test('entering a venue once creates and links one Venue directory record after event creation', () => withStorage((values) => {
  const event = eventFactory({ venueName: 'Davis and Grey Farm', venueInstagram: '@DavisAndGreyFarms' })
  values.set(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify([event]))

  const linked = syncEventVenueWithDirectory(event)
  const directory = readLocalVendors()

  assert.equal(directory.length, 1)
  assert.equal(directory[0].category, 'Venue')
  assert.equal(directory[0].businessName, 'Davis and Grey Farm')
  assert.equal(directory[0].instagramHandle, 'davisandgreyfarms')
  assert.equal(linked.venueVendorId, directory[0].id)
  const [storedEvent] = JSON.parse(values.get(LOCAL_FIREOVA_EVENTS_KEY) ?? '[]') as LocalFireovaEvent[]
  assert.equal(storedEvent.venueVendorId, directory[0].id)
}))

test('Create Event and Events list share storage and verify the full event payload before navigation', () => withStorage(() => {
  const event = eventFactory({
    name: 'Persisted Wedding',
    date: 'July 20, 2026',
    type: 'Wedding',
    venueName: 'Davis and Grey Farms',
    venueInstagram: '@davisandgreyfarms',
    vendors: [{ id: 'cake', category: 'Bakery', businessName: 'Sweets', instagramHandle: 'sweetsbyzeek' }],
  })

  const saved = saveLocalEvent(event)
  const listedEvent = readLocalEvent(event.id)
  const verified = verifyLocalEventPersistence(event)

  assert.equal(saved.id, event.id)
  assert.equal(listedEvent?.id, event.id)
  assert.equal(verified.name, event.name)
  assert.equal(verified.date, event.date)
  assert.equal(verified.type, event.type)
  assert.equal(verified.media.length, event.media.length)
  assert.equal(verified.venueName, event.venueName)
  assert.equal(verified.vendors?.[0].instagramHandle, 'sweetsbyzeek')
}))

test('a failed event write is surfaced and cannot produce a readable event', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error('storage unavailable') },
      },
    },
  })

  try {
    const event = eventFactory({})
    assert.throws(() => saveLocalEvent(event), /storage unavailable/)
    assert.equal(readLocalEvent(event.id), null)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('selecting an existing linked venue reuses its directory record', () => withStorage((values) => {
  const existingVenue = directoryVenue('venue-davis', 'Davis and Grey Farm', 'davisandgreyfarms')
  const event = eventFactory({
    venueName: 'Davis and Grey Farm',
    venueInstagram: '@davisandgreyfarms',
    venueVendorId: existingVenue.id,
  })
  values.set(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify([event]))
  values.set(LOCAL_FIREOVA_VENDORS_KEY, JSON.stringify([existingVenue]))

  syncEventVenueWithDirectory(event)
  assert.equal(readLocalVendors().length, 1)
  assert.equal(readLocalVendors()[0].id, existingVenue.id)
}))

test('a second event with the same venue reuses the first event directory record', () => withStorage((values) => {
  const firstEvent = eventFactory({ id: 'first-event', venueName: 'Davis and Grey Farms', venueInstagram: '@davisandgreyfarms' })
  values.set(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify([firstEvent]))
  const linkedFirst = syncEventVenueWithDirectory(firstEvent)

  const secondEvent = eventFactory({ id: 'second-event', venueName: '  davis AND grey farms ', venueInstagram: '@@DavisAndGreyFarms' })
  const storedFirst = JSON.parse(values.get(LOCAL_FIREOVA_EVENTS_KEY) ?? '[]') as LocalFireovaEvent[]
  values.set(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify([...storedFirst, secondEvent]))
  const linkedSecond = syncEventVenueWithDirectory(secondEvent)

  assert.equal(readLocalVendors().length, 1)
  assert.equal(linkedSecond.venueVendorId, linkedFirst.venueVendorId)
}))

test('editing a linked venue synchronizes the same directory record', () => withStorage((values) => {
  const existingVenue = directoryVenue('venue-davis', 'Davis Farm', 'davisfarm')
  const event = eventFactory({
    venueName: 'Davis and Grey Farm',
    venueInstagram: '@davisandgreyfarms',
    venueVendorId: existingVenue.id,
  })
  values.set(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify([event]))
  values.set(LOCAL_FIREOVA_VENDORS_KEY, JSON.stringify([existingVenue]))

  const linked = syncEventVenueWithDirectory(event)
  const [updatedVenue] = readLocalVendors()
  assert.equal(updatedVenue.id, existingVenue.id)
  assert.equal(updatedVenue.businessName, 'Davis and Grey Farm')
  assert.equal(updatedVenue.instagramHandle, 'davisandgreyfarms')
  assert.equal(linked.venueVendorId, existingVenue.id)
}))

test('dedicated venue fields win over legacy duplicate Venue vendor data in credits', () => {
  const venueDirectory = directoryVenue('venue-davis', 'Legacy Venue Name', 'legacyvenue')
  const event = eventFactory({
    venueName: 'Davis and Grey Farm',
    venueInstagram: '@davisandgreyfarms',
    venueVendorId: venueDirectory.id,
    vendors: [
      { id: 'legacy-venue', category: 'Venue', businessName: 'Legacy Venue Name', instagramHandle: 'legacyvenue' },
      { id: 'duplicate-handle', category: 'Photographer', businessName: 'Duplicate', instagramHandle: 'davisandgreyfarms' },
      { id: 'cake', category: 'Bakery', businessName: 'Sweets', instagramHandle: 'sweetsbyzeek' },
    ],
  })

  const snapshot = buildEventVendorCreditSnapshot(event, [venueDirectory])
  assert.equal(snapshot.venue?.businessName, 'Davis and Grey Farm')
  assert.equal(snapshot.venue?.instagramHandle, 'davisandgreyfarms')
  assert.equal(snapshot.nonVenueVendors.length, 1)
  assert.deepEqual(snapshot.handles, ['@davisandgreyfarms', '@sweetsbyzeek'])
  assert.equal(snapshot.creditBlock.match(/@davisandgreyfarms/g)?.length, 1)
  const copiedCredits = buildVendorCreditsText(snapshot.allVendors)
  assert.equal(copiedCredits.match(/@davisandgreyfarms/g)?.length, 1)
})

test('events without venue data continue without creating directory records', () => withStorage((values) => {
  const event = eventFactory({})
  values.set(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify([event]))

  const unchanged = syncEventVenueWithDirectory(event)
  assert.equal(unchanged.venueVendorId, undefined)
  assert.deepEqual(readLocalVendors(), [])
  assert.equal(buildEventVendorCreditSnapshot(event, []).venue, undefined)
}))

test('Create Event and Event Detail exclude Venue from visible vendor counts', () => {
  assert.match(createEventPageSource, /getPendingNonVenueVendors\(pendingEventDetails\)/)
  assert.doesNotMatch(createEventPageSource, /Vendors \(\{getPendingEventVendorCount/)
  assert.match(createEventPageSource, /getVendorCategoryOptions\(savedVendors\)\.filter\(\(category\) => category !== 'Venue'\)/)
  assert.match(eventDetailSource, /vendor\.category !== 'Venue'/)
  assert.match(eventDetailSource, />\s*\+ Add Vendor\s*<\/button>/)
  assert.match(eventDetailSource, />Venue</)
  assert.match(eventDetailSource, /Vendors \(\{vendors\.length\}\)/)
})

function eventFactory(overrides: Partial<LocalFireovaEvent>): LocalFireovaEvent {
  return {
    id: 'event-venue-test',
    name: 'Venue Test Event',
    type: 'Wedding',
    date: 'July 19, 2026',
    status: 'Needs Content',
    draftCount: 0,
    cover: { id: 'cover', type: 'photo', src: 'fireova-idb-media://cover', alt: 'Cover' },
    media: [{ id: 'cover', type: 'photo', src: 'fireova-idb-media://cover', alt: 'Cover' }],
    createdAt: '2026-07-19T12:00:00.000Z',
    ...overrides,
  }
}

function directoryVenue(id: string, businessName: string, instagramHandle: string) {
  return {
    id,
    category: 'Venue' as const,
    businessName,
    instagramHandle,
    preferredVendor: false,
    createdAt: '2026-07-19T12:00:00.000Z',
    updatedAt: '2026-07-19T12:00:00.000Z',
  }
}

function withStorage(run: (values: Map<string, string>) => void) {
  const values = new Map<string, string>()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  })

  try {
    run(values)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}
