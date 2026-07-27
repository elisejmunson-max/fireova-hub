'use client'

import { createClient, supabaseConfigured } from '@/lib/supabase/client'
import {
  createContentBankItemRecord,
  readAllContentBankItems,
  updateContentBankItem,
} from '@/lib/local-fireova-content-bank'

export type MediaLibraryMigrationResult = {
  migrated: number
  skipped: number
  failed: number
}

let activeMigration: Promise<MediaLibraryMigrationResult> | null = null
const REMOVED_MEDIA_LIBRARY_ASSETS_KEY = 'fireova-media-library-content-bank-removed-v1'

function readRemovedMediaLibraryAssetIds() {
  if (typeof window === 'undefined') return new Set<string>()

  try {
    const stored = JSON.parse(window.localStorage.getItem(REMOVED_MEDIA_LIBRARY_ASSETS_KEY) ?? '[]')
    return new Set<string>(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

export function markMediaLibraryAssetRemovedFromContentBank(assetId: string) {
  if (typeof window === 'undefined' || !assetId) return
  const removedIds = readRemovedMediaLibraryAssetIds()
  removedIds.add(assetId)
  window.localStorage.setItem(REMOVED_MEDIA_LIBRARY_ASSETS_KEY, JSON.stringify([...removedIds]))
}

export function migrateMediaLibraryToContentBank() {
  if (typeof window === 'undefined' || !supabaseConfigured) {
    return Promise.resolve({ migrated: 0, skipped: 0, failed: 0 })
  }

  if (activeMigration) return activeMigration

  activeMigration = runMigration().finally(() => {
    activeMigration = null
  })

  return activeMigration
}

async function runMigration(): Promise<MediaLibraryMigrationResult> {
  const supabase = createClient()
  const { data: assets, error } = await supabase
    .from('media_assets')
    .select('id, filename, storage_path, file_type, size_bytes, tags, notes, created_at, folder_id, photographer')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Media Library migration could not read assets.', error)
    return { migrated: 0, skipped: 0, failed: 1 }
  }

  const existingAssetIds = new Set(
    readAllContentBankItems()
      .map((item) => item.sourceMediaLibraryId)
      .filter((id): id is string => Boolean(id))
  )
  const removedAssetIds = readRemovedMediaLibraryAssetIds()
  const result: MediaLibraryMigrationResult = { migrated: 0, skipped: 0, failed: 0 }

  for (const asset of assets ?? []) {
    if (asset.folder_id === '__archive__' || existingAssetIds.has(asset.id) || removedAssetIds.has(asset.id)) {
      result.skipped += 1
      continue
    }

    try {
      const { data: blob, error: downloadError } = await supabase.storage.from('media').download(asset.storage_path)
      if (downloadError || !blob) throw downloadError ?? new Error('Media file could not be downloaded.')

      const file = new File([blob], asset.filename, {
        type: asset.file_type || blob.type,
        lastModified: Date.parse(asset.created_at) || Date.now(),
      })
      const item = await createContentBankItemRecord(file)
      updateContentBankItem(item.id, {
        tags: asset.tags ?? [],
        notes: asset.notes ?? '',
        photographerCreditRequired: Boolean(asset.photographer),
        photographerName: asset.photographer ?? '',
        sourceType: 'media_library',
        sourceMediaLibraryId: asset.id,
        suggestionSource: 'imported',
      })
      existingAssetIds.add(asset.id)
      result.migrated += 1
    } catch (migrationError) {
      result.failed += 1
      console.error(`Media Library asset ${asset.id} could not be moved to Content Bank.`, migrationError)
    }
  }

  return result
}
