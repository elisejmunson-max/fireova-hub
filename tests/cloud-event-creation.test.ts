import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..', '..')
const creationSource = fs.readFileSync(path.join(root, 'lib/cloud-event-creation.ts'), 'utf8')
const eventsSource = fs.readFileSync(path.join(root, 'app/(app)/events/page.tsx'), 'utf8')
const uploadRouteSource = fs.readFileSync(path.join(root, 'app/api/events/uploads/route.ts'), 'utf8')
const migrationSource = fs.readFileSync(path.join(root, 'supabase/phase1-cloud-event-creation.sql'), 'utf8')

test('event creation uploads media before confirming and loading the canonical UUID', () => {
  const start = creationSource.indexOf("action: 'start'")
  const upload = creationSource.indexOf(".storage.from('media').uploadToSignedUrl")
  const complete = creationSource.indexOf("action: 'complete'")
  const confirm = creationSource.lastIndexOf('loadEventFromCloud(confirmed.id)')
  assert.ok(start > -1)
  assert.ok(upload > start)
  assert.ok(complete > upload)
  assert.ok(confirm > complete)
})

test('Create Event no longer calls the IndexedDB event builder', () => {
  assert.match(eventsSource, /createCloudEventWithMedia/)
  assert.match(eventsSource, /await continueWithPendingBatch\(batch\.items, batch\.details\)/)
  assert.doesNotMatch(eventsSource, /createDraftEventFromFiles\(/)
  assert.doesNotMatch(eventsSource, /getPostCreateEventHref\(.*untitled-event/)
})

test('incomplete cloud creation has compensating Storage and database cleanup', () => {
  assert.match(uploadRouteSource, /createSignedUploadUrl/)
  assert.match(uploadRouteSource, /storage\.from\('media'\)\.remove/)
  assert.match(uploadRouteSource, /\.eq\('creation_status', 'uploading'\)/)
  assert.match(uploadRouteSource, /EVENT_MEDIA_CONFIRMED/)
})

test('new UUID events tolerate the legacy text-id constraint during rollout', () => {
  assert.match(uploadRouteSource, /legacy_id: `cloud-upload-\$\{eventId\}`/)
  assert.match(migrationSource, /alter column legacy_id drop not null/)
  assert.match(uploadRouteSource, /stage = 'event_projects insert'/)
  assert.match(uploadRouteSource, /UPLOAD_START_FAILED/)
})
