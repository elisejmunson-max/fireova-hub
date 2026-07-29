import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const uploadRouteSource = fs.readFileSync('app/(app)/events/page.tsx', 'utf8')
const savedRouteSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')
const inlineHeaderSource = fs.readFileSync('components/events/inline-event-details-header.tsx', 'utf8')

test('both Event Details flows render one shared section-level editor without route-level edit state', () => {
  assert.match(uploadRouteSource, /import InlineEventDetailsHeader/)
  assert.match(savedRouteSource, /import InlineEventDetailsHeader/)
  assert.match(uploadRouteSource, /<InlineEventDetailsHeader/)
  assert.match(savedRouteSource, /<InlineEventDetailsHeader/)
  assert.doesNotMatch(uploadRouteSource, /Edit event details|eventEditing|setEventEditing|EventIdentityEditor/)
  assert.doesNotMatch(savedRouteSource, /Edit event details|eventEditing|setEventEditing|EventIdentityEditor/)
})

test('read mode is clean and one Edit event action reveals the complete labeled form', () => {
  assert.match(inlineHeaderSource, /data-testid="event-details-read-mode"/)
  assert.match(inlineHeaderSource, />\s*Edit event\s*</)
  assert.match(inlineHeaderSource, /data-testid="event-details-edit-mode"/)
  assert.match(inlineHeaderSource, /const \[isEditingEvent, setIsEditingEvent\]/)
  assert.match(inlineHeaderSource, /const \[eventForm, setEventForm\]/)
  assert.match(inlineHeaderSource, />Event name<\/label>/)
  assert.match(inlineHeaderSource, />Event type<\/span>/)
  assert.match(inlineHeaderSource, />Event date<\/span>/)
  assert.match(inlineHeaderSource, />Venue<\/label>/)
  assert.match(inlineHeaderSource, /placeholder="Untitled Event"/)
  assert.match(inlineHeaderSource, /md:grid-cols-3/)
  assert.match(inlineHeaderSource, /md:text-\[30px\]/)
  assert.doesNotMatch(inlineHeaderSource, /Save event name|>✓</)
})

test('one Save changes action persists changed name type and date through the shared cloud callback', () => {
  assert.match(inlineHeaderSource, /if \(trimmedName !== savedForm\.name\) updates\.name = trimmedName/)
  assert.match(inlineHeaderSource, /if \(eventForm\.type !== savedForm\.type\) updates\.type = eventForm\.type/)
  assert.match(inlineHeaderSource, /type="date"/)
  assert.match(inlineHeaderSource, /updates\.date = dateValueMode === 'input' \? eventForm\.date/)
  assert.match(inlineHeaderSource, /\{saving \? 'Saving…' : 'Save changes'\}[\s\S]*?<\/button>/)
  assert.match(inlineHeaderSource, /disabled=\{!canSave\}/)
  assert.match(uploadRouteSource, /onSave=\{savePendingEventMetadataToCloud\}/)
  assert.match(savedRouteSource, /onSave=\{saveEventMetadata\}/)
})

test('venue selection and removal persist the existing cloud-backed relationship fields', () => {
  assert.match(inlineHeaderSource, /venueName: venue\.name/)
  assert.match(inlineHeaderSource, /venueInstagram: venue\.instagram \?\? ''/)
  assert.match(inlineHeaderSource, /venueVendorId: venue\.vendorId/)
  assert.match(inlineHeaderSource, /venueName: trimmedVenueName[\s\S]*?venueVendorId: undefined/)
  assert.match(inlineHeaderSource, /placeholder="Select or add venue"/)
  assert.match(inlineHeaderSource, /<VenueAutocomplete/)
  assert.match(inlineHeaderSource, /showAddNew/)
})

test('unified form preserves drafts on failure and Cancel restores saved values', () => {
  assert.match(inlineHeaderSource, /saving \? 'Saving…' : 'Save changes'/)
  assert.match(inlineHeaderSource, />Saved</)
  assert.match(inlineHeaderSource, /const requestKey = JSON\.stringify\(updates\)/)
  assert.match(inlineHeaderSource, /requestRef\.current && requestKeyRef\.current === requestKey/)
  assert.match(inlineHeaderSource, /function cancelEditing\(\)[\s\S]*?setEventForm\(savedForm\)[\s\S]*?setIsEditingEvent\(false\)/)
  assert.match(inlineHeaderSource, /catch \(error\)[\s\S]*?setSaveStatus\('error'\)/)
  assert.doesNotMatch(inlineHeaderSource, /catch \(error\)[\s\S]*?setIsEditingEvent\(false\)/)
  assert.doesNotMatch(inlineHeaderSource, /onChange=\{[\s\S]{0,180}onSave/)
})

test('upload-route edits reuse the canonical UUID and preserve attached media before reload', () => {
  const saveStart = uploadRouteSource.indexOf('async function savePendingEventMetadataToCloud')
  const saveEnd = uploadRouteSource.indexOf('function handleCreateEventClick', saveStart)
  const saveSource = uploadRouteSource.slice(saveStart, saveEnd)

  assert.match(saveSource, /await ensurePendingCloudEvent/)
  assert.match(saveSource, /await loadEventFromCloud\(createdEvent\.id\)/)
  assert.match(saveSource, /id: currentCloudEvent\.id/)
  assert.match(saveSource, /media: currentCloudEvent\.media/)
  assert.match(saveSource, /cover: currentCloudEvent\.cover/)
  assert.match(saveSource, /createdAt: currentCloudEvent\.createdAt/)
  assert.match(saveSource, /await saveEventToCloud\(updatedEvent\)/)
  assert.match(saveSource, /savedEvent\.id !== currentCloudEvent\.id/)
  assert.match(saveSource, /await loadEventFromCloud\(currentCloudEvent\.id\)/)
  assert.doesNotMatch(saveSource, /createCloudEventWithMedia\(\{[\s\S]*?createCloudEventWithMedia\(\{/)
  assert.doesNotMatch(saveSource, /localStorage|sessionStorage/)
})

test('upload creation is deduplicated and navigation waits for inline persistence', () => {
  const creationStart = uploadRouteSource.indexOf('function ensurePendingCloudEvent')
  const creationEnd = uploadRouteSource.indexOf('async function savePendingEventMetadataToCloud', creationStart)
  const creationSource = uploadRouteSource.slice(creationStart, creationEnd)
  const continueStart = uploadRouteSource.indexOf('async function continueWithPendingBatch')
  const continueEnd = uploadRouteSource.indexOf('function ensurePendingCloudEvent', continueStart)
  const continueSource = uploadRouteSource.slice(continueStart, continueEnd)

  assert.match(creationSource, /if \(eventId\) return loadEventFromCloud\(eventId\)/)
  assert.match(creationSource, /if \(cloudEventPromiseRef\.current\) return cloudEventPromiseRef\.current/)
  assert.match(creationSource, /cloudCreationKeyRef\.current/)
  assert.match(creationSource, /autoSavedEventIdRef\.current = confirmedEvent\.id/)
  assert.match(continueSource, /if \(pendingInlineSaveRef\.current\) await pendingInlineSaveRef\.current/)
  assert.match(continueSource, /const reloadedEvent = await loadEventFromCloud\(confirmedEvent\.id\)/)
  assert.match(continueSource, /router\.replace\(`\/events\/\$\{reloadedEvent\.id\}`\)/)
})

test('saved-route reload uses the updated same-UUID event with its media intact', () => {
  assert.match(savedRouteSource, /loadEventFromCloud\(params\.id\)/)
  assert.match(savedRouteSource, /saveLocalEvent\(cloudEvent\)/)
  assert.match(savedRouteSource, /media: localEvent\.media/)
  assert.match(savedRouteSource, /cover: localEvent\.cover/)
  assert.match(savedRouteSource, /await loadEventFromCloud\(localEvent\.id\)/)
})
