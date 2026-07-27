import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const sidebarSource = fs.readFileSync(path.join(root, 'components/layout/sidebar.tsx'), 'utf8')
const legacyRouteSource = fs.readFileSync(path.join(root, 'app/(app)/media-bank/page.tsx'), 'utf8')
const contentBankSource = fs.readFileSync(path.join(root, 'app/(app)/content-bank/page.tsx'), 'utf8')
const migrationSource = fs.readFileSync(path.join(root, 'lib/local-fireova-media-library-migration.ts'), 'utf8')

test('Content Bank is the single media-library destination', () => {
  assert.doesNotMatch(sidebarSource, /label: 'Media Library'/)
  assert.match(sidebarSource, /href: '\/content-bank', label: 'Media Bank'/)
  assert.match(legacyRouteSource, /redirect\('\/content-bank'\)/)
})

test('paused content workflows are hidden from the primary sidebar', () => {
  assert.doesNotMatch(sidebarSource, /label: 'Content Studio'/)
  assert.doesNotMatch(sidebarSource, /label: 'Draft Posts'/)
  assert.doesNotMatch(sidebarSource, /label: 'Calendar'/)
  assert.doesNotMatch(sidebarSource, /label: 'Publish'/)
})

test('Content Bank safely imports legacy Media Library assets once', () => {
  assert.match(contentBankSource, /migrateMediaLibraryToContentBank/)
  assert.match(migrationSource, /sourceMediaLibraryId/)
  assert.match(migrationSource, /createContentBankItemRecord\(file\)/)
  assert.match(migrationSource, /storage\.from\('media'\)\.download/)
  assert.doesNotMatch(migrationSource, /from\('media_assets'\)\.delete/)
})

test('Media Bank cards can be deleted without legacy imports returning', () => {
  assert.match(contentBankSource, /aria-label={`Delete \${galleryTitle}`}/)
  assert.match(contentBankSource, /requestDeleteItem\(item\)/)
  assert.match(contentBankSource, /markMediaLibraryAssetRemovedFromContentBank/)
  assert.match(migrationSource, /REMOVED_MEDIA_LIBRARY_ASSETS_KEY/)
  assert.match(migrationSource, /removedAssetIds\.has\(asset\.id\)/)
})
