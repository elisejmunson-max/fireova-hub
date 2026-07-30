import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const workflowSource = fs.readFileSync('components/events/vendor-selection-workflow.tsx', 'utf8')
const cloudVendorSource = fs.readFileSync('lib/cloud-vendors.ts', 'utf8')
const savedEventSource = fs.readFileSync('app/(app)/events/[id]/page.tsx', 'utf8')
const uploadEventSource = fs.readFileSync('app/(app)/events/page.tsx', 'utf8')

test('Vendor Selection uses one responsive full-screen and desktop modal workflow', () => {
  assert.match(workflowSource, /fixed inset-0 z-\[80\] bg-white/)
  assert.match(workflowSource, /md:flex md:items-center md:justify-center md:bg-black\/35/)
  assert.match(workflowSource, /md:max-w-2xl md:rounded-2xl md:shadow-2xl/)
  assert.match(workflowSource, /safe-area-inset-top/)
  assert.match(workflowSource, />\s*← Back\s*</)
  assert.match(workflowSource, />\s*Select Vendors\s*</)
  assert.match(workflowSource, /\{saving \? 'Saving…' : 'Done'\}/)
  assert.match(workflowSource, /placeholder="Search vendors\.\.\."/)
  assert.match(workflowSource, />\s*\+ Add New Vendor\s*</)
  assert.match(workflowSource, />Vendor Directory<\/h3>/)
})

test('Vendor Directory supports accessible multi-select with checkmarks and one Done save', () => {
  assert.match(workflowSource, /aria-multiselectable="true"/)
  assert.match(workflowSource, /role="option"/)
  assert.match(workflowSource, /aria-selected=\{selected\}/)
  assert.match(workflowSource, /onClick=\{\(\) => toggleVendor\(vendor\.id\)\}/)
  assert.match(workflowSource, />\s*✓\s*</)
  assert.match(workflowSource, /await onDone\(availableVendors\.filter/)
  assert.match(workflowSource, /onClose\(\)/)
  assert.doesNotMatch(workflowSource, /Recently Used|Remove Vendor|Delete Vendor|Archive Vendor|trash|swipe/i)
})

test('new vendors are cloud-created, added to the directory, and selected automatically', () => {
  assert.match(workflowSource, /await createCloudVendor/)
  assert.match(workflowSource, /new Set\(current\)\.add\(result\.vendor\.id\)/)
  assert.match(workflowSource, /onDirectoryChange/)
  assert.match(cloudVendorSource, /fetch\('\/api\/vendors', \{ cache: 'no-store' \}\)/)
  assert.match(cloudVendorSource, /method: 'POST'/)
  assert.match(cloudVendorSource, /preferredVendor: false/)
})

test('saved and upload Event Editors share Vendor Selection', () => {
  assert.match(savedEventSource, /<VendorSelectionWorkflow/)
  assert.match(savedEventSource, /selectedVendorIds=\{selectedEventVendorIds\}/)
  assert.match(savedEventSource, /onDone=\{saveSelectedEventVendors\}/)
  assert.match(uploadEventSource, /<VendorSelectionWorkflow/)
  assert.match(uploadEventSource, /selectedVendorIds=\{selectedPendingVendorIds\}/)
  assert.match(uploadEventSource, /onDone=\{applyPendingVendorSelection\}/)
})

test('saved-event Done persists the same UUID and confirms the cloud result', () => {
  const start = savedEventSource.indexOf('async function saveSelectedEventVendors')
  const end = savedEventSource.indexOf('function removeSavedVenue', start)
  const saveSource = savedEventSource.slice(start, end)
  assert.match(saveSource, /id: localEvent\.id/)
  assert.match(saveSource, /media: localEvent\.media/)
  assert.match(saveSource, /cover: localEvent\.cover/)
  assert.match(saveSource, /await saveEventToCloud\(updatedEvent\)/)
  assert.match(saveSource, /await loadEventFromCloud\(localEvent\.id\)/)
  assert.match(saveSource, /saved\.id !== localEvent\.id/)
  assert.match(saveSource, /saveLocalEvent\(confirmed\)/)
})
