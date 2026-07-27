import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  buildVendorCreditsText,
  buildVendorHandlesText,
  canSaveSimplifiedVendor,
  getVendorDrawerButtonAriaLabel,
  getVendorDrawerButtonText,
  getSimplifiedVendorBusinessName,
  getVendorCategoryOptions,
  LOCAL_FIREOVA_VENDORS_KEY,
  LOCAL_FIREOVA_VENDOR_CATEGORIES_KEY,
  normalizeInstagramHandle,
  readLocalVendors,
  reassignAndRemoveLocalVendorCategory,
  type VendorCreditTextSource,
} from '@/lib/local-fireova-vendors'
import { LOCAL_FIREOVA_EVENTS_KEY, readLocalEvent, saveLocalEvent } from '@/lib/local-fireova-events'

const eventPageSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')
const vendorDirectorySource = fs.readFileSync('app/(app)/vendors/page.tsx', 'utf8')
const vendorFormSource = eventPageSource.slice(
  eventPageSource.indexOf('function VendorDrawerForm('),
  eventPageSource.indexOf('function normalizeVendorHandle')
)

test('event-page vendor button shows zero count with chevron', () => {
  assert.equal(getVendorDrawerButtonText(0), 'Vendors (0) ▾')
})

test('Vendor Directory supports adding and editing custom categories', () => {
  const categories = getVendorCategoryOptions([{ category: 'Coffee Cart' }, { category: 'Planner' }])
  assert.ok(categories.includes('Coffee Cart'))
  assert.equal(categories.filter((category) => category === 'Planner').length, 1)
  assert.match(vendorDirectorySource, /<option value="__new__">\+ Create new category…<\/option>/)
  assert.match(vendorDirectorySource, /placeholder="New category name"/)
  assert.match(vendorDirectorySource, /Choose a category or create a new one\./)
  assert.match(vendorDirectorySource, /category: category\.trim\(\)/)
  assert.equal(buildVendorCreditsText([{ category: 'Coffee Cart', instagramHandle: '@dailygrind' }]), 'Coffee Cart: @dailygrind')
})

test('saved events preserve vendors that use custom directory categories', () => {
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
    saveLocalEvent({
      id: 'custom-category-event',
      name: 'Custom Category Event',
      type: 'Wedding',
      date: 'July 20, 2026',
      status: 'Needs Content',
      draftCount: 0,
      cover: { id: 'photo', type: 'photo', src: 'fireova-idb-media://photo', alt: 'Event' },
      media: [{ id: 'photo', type: 'photo', src: 'fireova-idb-media://photo', alt: 'Event' }],
      vendors: [{ id: 'bar-cart-link', vendorId: 'bar-cart', category: 'Bar Cart' }],
      createdAt: '2026-07-20T00:00:00.000Z',
    })

    assert.equal(readLocalEvent('custom-category-event')?.vendors?.[0]?.category, 'Bar Cart')
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('Vendor Directory exposes category add and remove management', () => {
  assert.match(vendorDirectorySource, />Manage Categories<\/button>/)
  assert.match(vendorDirectorySource, /function CategoryManagerDialog/)
  assert.match(vendorDirectorySource, /placeholder="New category"/)
  assert.match(vendorDirectorySource, /action: 'category'/)
  assert.match(vendorDirectorySource, /action: 'delete-category'/)
  assert.match(vendorDirectorySource, /action: 'reassign-category'/)
  assert.match(vendorDirectorySource, />Move & Remove<\/button>/)
})

test('an in-use custom category can move linked vendors and then be removed', () => {
  const values = new Map<string, string>()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } },
  })
  values.set(LOCAL_FIREOVA_VENDOR_CATEGORIES_KEY, JSON.stringify(['Venue', 'Other', 'Coffee Cart']))
  values.set(LOCAL_FIREOVA_VENDORS_KEY, JSON.stringify([{
    id: 'coffee-vendor', category: 'Coffee Cart', businessName: '@coffee', instagramHandle: '@coffee', preferredVendor: false,
    createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
  }]))
  values.set(LOCAL_FIREOVA_EVENTS_KEY, JSON.stringify([{
    id: 'coffee-event', name: 'Coffee Event', type: 'Wedding', date: 'July 20, 2026', status: 'Needs Content', draftCount: 0,
    cover: { id: 'photo', type: 'photo', src: 'fireova-idb-media://photo', alt: 'Event' },
    media: [{ id: 'photo', type: 'photo', src: 'fireova-idb-media://photo', alt: 'Event' }],
    vendors: [{ id: 'coffee-link', vendorId: 'coffee-vendor', category: 'Coffee Cart' }], createdAt: '2026-07-20T00:00:00.000Z',
  }]))

  try {
    const result = reassignAndRemoveLocalVendorCategory('Coffee Cart', 'Other')
    assert.equal(result.removed, true)
    assert.equal(readLocalVendors()[0]?.category, 'Other')
    assert.equal(readLocalEvent('coffee-event')?.vendors?.[0]?.category, 'Other')
    assert.equal(result.categories.includes('Coffee Cart'), false)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('event-page vendor button shows dynamic count and accessible label', () => {
  assert.equal(getVendorDrawerButtonText(12), 'Vendors (12) ▾')
  assert.equal(getVendorDrawerButtonAriaLabel('Bailey & Madison', 1), 'Open vendors for Bailey & Madison, 1 linked vendor')
  assert.equal(getVendorDrawerButtonAriaLabel('Bailey & Madison', 12), 'Open vendors for Bailey & Madison, 12 linked vendors')
})

test('copy caption credits groups handles by ordered category and combines same-category vendors', () => {
  const vendors: VendorCreditTextSource[] = [
    { category: 'DJ', businessName: 'DJ Luxe', instagramHandle: '@djluxe' },
    { category: 'Venue', businessName: 'Dove Ridge Vineyard', instagramHandle: 'doveridgevineyard' },
    { category: 'Photographer', businessName: 'Wild Oak Photo', instagramHandle: '@wildoakphoto' },
    { category: 'Photographer', businessName: 'Second Shooter', instagramHandle: 'https://instagram.com/secondshooter/' },
    { category: 'Planner', businessName: 'Ashton Events', instagramHandle: 'instagram.com/ashtonevents?igsh=abc' },
    { category: 'Bar', businessName: 'Allora MIA', instagramHandle: '@alloramaeatx' },
  ]

  assert.equal(buildVendorCreditsText(vendors), [
    'Venue: @doveridgevineyard',
    'Planning: @ashtonevents',
    'Photography: @wildoakphoto @secondshooter',
    'DJ: @djluxe',
    'Bar: @alloramaeatx',
  ].join('\n'))
})

test('copy Instagram handles outputs unique normalized handles one per line', () => {
  const vendors: VendorCreditTextSource[] = [
    { category: 'Venue', businessName: 'Venue', instagramHandle: '@VenueTX' },
    { category: 'Planner', businessName: 'Planner', instagramHandle: 'https://www.instagram.com/plannerco/' },
    { category: 'Photographer', businessName: 'Photo', instagramHandle: '@VenueTX' },
  ]

  assert.equal(buildVendorHandlesText(vendors), [
    '@venuetx',
    '@plannerco',
  ].join('\n'))
})

test('copy helpers skip missing handles duplicates empty categories and Fireova', () => {
  const vendors: VendorCreditTextSource[] = [
    { category: 'Venue', businessName: 'No Handle Venue' },
    { category: 'Planner', businessName: 'Fireova Pizza', instagramHandle: '@fireovapizza' },
    { category: 'Photographer', businessName: 'Photo Co', instagramHandle: '@photoco' },
    { category: 'Videographer', businessName: 'Duplicate Video', instagramHandle: 'photoco' },
    { category: 'Caterer', businessName: 'Fireova', instagramHandle: '@anotherhandle' },
    { category: 'Other', businessName: 'Real Partner', instagramHandle: 'realpartner' },
  ]

  assert.equal(buildVendorCreditsText(vendors), [
    'Photography: @photoco',
    'Vendor: @realpartner',
  ].join('\n'))
  assert.equal(buildVendorHandlesText(vendors), [
    '@photoco',
    '@realpartner',
  ].join('\n'))
})

test('copy button eligibility can be derived from formatted copy output', () => {
  assert.equal(Boolean(buildVendorCreditsText([])), false)
  assert.equal(Boolean(buildVendorHandlesText([{ category: 'Venue', businessName: 'Venue Only' }])), false)
  assert.equal(Boolean(buildVendorCreditsText([{ category: 'Venue', businessName: 'Venue', instagramHandle: '@venue' }])), true)
})

test('instagram handles normalize malformed prefixes to one handle value', () => {
  assert.equal(normalizeInstagramHandle('@@WildOakPhoto'), 'wildoakphoto')
  assert.equal(normalizeInstagramHandle('https://instagram.com/WildOakPhoto/?igsh=abc'), 'wildoakphoto')
  assert.equal(normalizeInstagramHandle('www.instagram.com/WildOakPhoto/'), 'wildoakphoto')
})

test('simplified vendor form saves Category and Instagram with blank optional Notes', () => {
  assert.equal(canSaveSimplifiedVendor('@wildoakphoto'), true)
  assert.equal(getSimplifiedVendorBusinessName('Photographer', '@wildoakphoto'), '@wildoakphoto')
  assert.match(vendorFormSource, /Notes \(Optional\)/)
  assert.doesNotMatch(vendorFormSource, /required=/)
  assert.match(vendorFormSource, /mode === 'add' && !canSaveSimplifiedVendor\(form\.instagram\)/)
})

test('Business Name and Website are not rendered by the vendor drawer form', () => {
  assert.doesNotMatch(vendorFormSource, />Business Name</)
  assert.doesNotMatch(vendorFormSource, />Website</)
  assert.match(vendorFormSource, />Category</)
  assert.match(vendorFormSource, />Instagram</)
})

test('Bakery is presented as Cake without changing the stored category value', () => {
  assert.match(vendorFormSource, /value=\{category\}>\{getVendorFormCategoryLabel\(category\)\}/)
  assert.match(eventPageSource, /category === 'Bakery' \? 'Cake' : category/)
  assert.match(eventPageSource, /category === 'Bakery'\) return 'Cake'/)
})

test('existing vendor records with legacy name and website fields still load', () => {
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
  values.set(LOCAL_FIREOVA_VENDORS_KEY, JSON.stringify([{
    id: 'legacy-vendor',
    category: 'Planner',
    businessName: 'Legacy Planning Co.',
    instagramHandle: '@legacyplanner',
    website: 'https://legacy.example',
    preferredVendor: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }]))

  try {
    const [vendor] = readLocalVendors()
    assert.equal(vendor.businessName, 'Legacy Planning Co.')
    assert.equal(vendor.website, 'https://legacy.example')
    assert.equal(getSimplifiedVendorBusinessName('Planner', vendor.instagramHandle ?? '', vendor.businessName), vendor.businessName)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('vendor drawer retains its change persistence path and saved status', () => {
  assert.match(eventPageSource, /function updateForm\(updates: Partial<VendorDrawerFormState>\)/)
  assert.match(eventPageSource, /onVendorsChange\(nextEventVendors\)/)
  assert.match(eventPageSource, /✓ All changes saved/)
})
