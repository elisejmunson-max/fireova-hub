import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const uploadRouteSource = fs.readFileSync('app/(app)/events/page.tsx', 'utf8')
const savedRouteSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')
const inlineHeaderSource = fs.readFileSync('components/events/inline-event-details-header.tsx', 'utf8')

test('both Event Details flows render one shared inline-edit header without page-level Edit mode', () => {
  assert.match(uploadRouteSource, /import InlineEventDetailsHeader/)
  assert.match(savedRouteSource, /import InlineEventDetailsHeader/)
  assert.match(uploadRouteSource, /<InlineEventDetailsHeader/)
  assert.match(savedRouteSource, /<InlineEventDetailsHeader/)
  assert.doesNotMatch(uploadRouteSource, /Edit event details|eventEditing|setEventEditing|EventIdentityEditor/)
  assert.doesNotMatch(savedRouteSource, /Edit event details|eventEditing|setEventEditing|EventIdentityEditor/)
})

test('event name saves on Enter blur or checkmark and Escape cancels', () => {
  assert.match(inlineHeaderSource, /onBlur=\{saveName\}/)
  assert.match(inlineHeaderSource, /event\.key === 'Enter'[\s\S]*?saveName\(\)/)
  assert.match(inlineHeaderSource, /aria-label="Save event name"/)
  assert.match(inlineHeaderSource, /event\.key === 'Escape'[\s\S]*?setNameDraft\(value\.name\)[\s\S]*?setNameEditing\(false\)/)
  assert.match(inlineHeaderSource, /save\(\{ name: nextName \}\)/)
})

test('event type and date selections persist through the shared cloud save callback', () => {
  assert.match(inlineHeaderSource, /save\(\{ type: nextType \}\)/)
  assert.match(inlineHeaderSource, /type="date"/)
  assert.match(inlineHeaderSource, /save\(\{ date: storedDate \}\)/)
  assert.match(uploadRouteSource, /onSave=\{savePendingEventMetadataToCloud\}/)
  assert.match(savedRouteSource, /onSave=\{saveEventMetadata\}/)
})

test('venue selection and removal persist the existing cloud-backed relationship fields', () => {
  assert.match(inlineHeaderSource, /venueName: venue\.name/)
  assert.match(inlineHeaderSource, /venueInstagram: venue\.instagram \?\? ''/)
  assert.match(inlineHeaderSource, /venueVendorId: venue\.vendorId/)
  assert.match(inlineHeaderSource, /venueName: ''[\s\S]*?venueVendorId: undefined/)
  assert.match(inlineHeaderSource, /value\.venueName \|\| '\+ Add venue'/)
})

test('inline edits expose Saving Saved and retry feedback without per-keystroke requests', () => {
  assert.match(inlineHeaderSource, />Saving…</)
  assert.match(inlineHeaderSource, />Saved</)
  assert.match(inlineHeaderSource, />\s*Retry\s*</)
  assert.match(inlineHeaderSource, /const requestKey = JSON\.stringify\(updates\)/)
  assert.match(inlineHeaderSource, /requestRef\.current && requestKeyRef\.current === requestKey/)
  assert.doesNotMatch(inlineHeaderSource, /onChange=\{[^}]*onSave/)
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
