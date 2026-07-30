import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { searchSavedVenues } from '@/lib/local-fireova-venues'

const workflowSource = fs.readFileSync('components/events/venue-selection-workflow.tsx', 'utf8')
const cloudVenueSource = fs.readFileSync('lib/cloud-venues.ts', 'utf8')
const venueRouteSource = fs.readFileSync('app/api/venues/route.ts', 'utf8')
const schemaSource = fs.readFileSync('supabase/venue-selection.sql', 'utf8')

test('Venue row opens one responsive selection workflow on mobile and desktop', () => {
  assert.match(workflowSource, /aria-haspopup="dialog"/)
  assert.match(workflowSource, /fixed inset-0 z-\[80\] bg-white/)
  assert.match(workflowSource, /md:flex md:items-center md:justify-center md:bg-black\/35/)
  assert.match(workflowSource, /md:max-w-2xl md:rounded-2xl md:shadow-2xl/)
  assert.match(workflowSource, />\s*← Back\s*</)
  assert.match(workflowSource, /'Select Venue'/)
  assert.match(workflowSource, /placeholder="Search venues\.\.\."/)
  assert.match(workflowSource, />\s*\+ Add New Venue\s*</)
  assert.match(workflowSource, /aria-label="Clear venue search"/)
  assert.match(workflowSource, />\s*Cancel\s*</)
  assert.match(workflowSource, />Saved Venues<\/h3>/)
  assert.match(workflowSource, /role="listbox"/)
})

test('venue search can always be cleared or dismissed without a dead end', () => {
  assert.match(workflowSource, /onClick=\{closeSelector\}[\s\S]*?>\s*← Back\s*</)
  assert.match(workflowSource, /function clearSearch\(\)[\s\S]*?setQuery\(''\)[\s\S]*?searchRef\.current\?\.focus\(\)/)
  assert.match(workflowSource, /function cancelSearch\(\)[\s\S]*?setQuery\(''\)[\s\S]*?searchRef\.current\?\.blur\(\)/)
  assert.match(workflowSource, /No venues found\./)
  assert.match(workflowSource, /Add &quot;\{query\.trim\(\)\}&quot; as a new venue/)
  assert.match(workflowSource, /!query\.trim\(\) && \([\s\S]*?>\s*\+ Add New Venue\s*</)
})

test('saved venue rows include location and return immediately after selection', () => {
  const venues = [
    { name: 'Hidden Pines', location: 'Highland Village, TX' },
    { name: 'The Mason', location: 'Dallas, TX' },
  ]
  assert.deepEqual(searchSavedVenues(venues, 'Dallas'), [venues[1]])
  assert.match(workflowSource, /\{venue\.location &&/)
  assert.match(workflowSource, /onSelect\(venue\)[\s\S]*?closeSelector\(\)/)
  assert.match(workflowSource, /aria-selected=\{normalizeVenueName\(venue\.name\)/)
})

test('new venues are saved to the owned Supabase venue table before selection', () => {
  assert.match(workflowSource, />Venue Name \*</)
  assert.match(workflowSource, />Location</)
  assert.match(workflowSource, />Notes \(optional\)</)
  assert.match(workflowSource, /await createCloudVenue/)
  assert.match(workflowSource, /onSelect\(venue\)[\s\S]*?closeSelector\(\)/)
  assert.match(cloudVenueSource, /fetch\('\/api\/venues'/)
  assert.match(venueRouteSource, /db\.from\('venues'\)\.upsert/)
  assert.match(venueRouteSource, /user_id: user\.id/)
  assert.match(venueRouteSource, /notes: clean\(payload\.notes\)/)
  assert.match(schemaSource, /add column if not exists notes text/)
})

test('venue workflow preserves accessible modal and keyboard dismissal behavior', () => {
  assert.match(workflowSource, /role="dialog"/)
  assert.match(workflowSource, /aria-modal="true"/)
  assert.match(workflowSource, /aria-labelledby="venue-selection-title"/)
  assert.match(workflowSource, /event\.key === 'Escape'/)
  assert.match(workflowSource, /event\.key !== 'Tab'/)
  assert.match(workflowSource, /querySelectorAll<HTMLElement>/)
  assert.match(workflowSource, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(workflowSource, /min-h-11/)
})

test('venue selection exposes no destructive venue actions or API handling', () => {
  assert.doesNotMatch(workflowSource, /onClear|Remove venue|Delete venue|Archive venue|trash|swipe/i)
  assert.doesNotMatch(venueRouteSource, /export async function DELETE|\.delete\(\)/)
})
