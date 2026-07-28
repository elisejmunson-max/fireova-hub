'use client'

import { createClient } from '@/lib/supabase/client'
import type { PendingEventDetails, PendingEventMediaItem } from '@/lib/local-fireova-event-upload'
import { loadEventFromCloud, saveEventToCloud } from '@/lib/shared-fireova-events'
import type { LocalFireovaEvent } from '@/lib/local-fireova-events'
import { prepareCloudUploadFile } from '@/lib/cloud-upload-media'

export type UploadProgress = {
  stage: 'preparing' | 'uploading' | 'saving'
  completed: number
  total: number
  fileName?: string
  mediaKind?: 'photo' | 'video'
  percent?: number
}

async function responseBody(response: Response) {
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Fireova could not save this event.')
  return result
}

function stepError(step: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown cloud error.'
  return new Error(`${step} failed: ${message}`)
}

async function checksum(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createCloudEventWithMedia({
  creationKey,
  items,
  details,
  onProgress,
}: {
  creationKey: string
  items: PendingEventMediaItem[]
  details: PendingEventDetails
  onProgress?: (progress: UploadProgress) => void
}): Promise<LocalFireovaEvent> {
  onProgress?.({ stage: 'preparing', completed: 0, total: items.length })
  let prepared
  try {
    prepared = await Promise.all(items.map(async (item) => {
      const upload = await prepareCloudUploadFile(item.file)
      return {
        item,
        upload,
        descriptor: {
          id: crypto.randomUUID(),
          name: upload.file.name,
          type: upload.file.type,
          size: upload.file.size,
          kind: item.kind,
          checksum: await checksum(upload.file),
          originalName: upload.originalName,
          originalMimeType: upload.originalMimeType,
          detectedMimeType: upload.detectedMimeType,
          convertedFrom: upload.convertedFrom,
          thumbnailName: upload.thumbnail?.name,
          thumbnailType: upload.thumbnail?.type,
          thumbnailSize: upload.thumbnail?.size,
        },
      }
    }))
  } catch (error) {
    throw stepError('Media preparation', error)
  }
  const files = prepared.map((entry) => entry.descriptor)
  const event = {
    name: details.name.trim(),
    type: details.type,
    date: details.date,
    venueName: details.venueName?.trim() || undefined,
    venueInstagram: details.venueInstagram?.trim() || undefined,
    venueVendorId: details.venueVendorId,
    vendors: details.vendors?.length ? details.vendors : undefined,
    status: 'Needs Content',
    draftCount: 0,
  }

  let start
  try {
    start = await responseBody(await fetch('/api/events/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', creationKey, event, files }),
    }))
  } catch (error) {
    throw stepError('Event insert', error)
  }
  const eventId = start.eventId as string
  if (start.alreadyComplete) return loadEventFromCloud(eventId)

  const supabase = createClient()
  try {
    for (let index = 0; index < prepared.length; index += 1) {
      const { item, upload } = prepared[index]
      const descriptor = start.files[index]
      onProgress?.({
        stage: 'uploading',
        completed: index,
        total: items.length,
        fileName: item.file.name,
        mediaKind: item.kind,
        percent: Math.round((index / items.length) * 100),
      })
      if (!descriptor?.storagePath || !descriptor?.uploadToken) {
        throw stepError('Storage upload', new Error('The authenticated upload authorization was missing.'))
      }
      const { error } = await supabase.storage.from('media').uploadToSignedUrl(
        descriptor.storagePath,
        descriptor.uploadToken,
        upload.file,
        {
        contentType: upload.file.type,
        }
      )
      if (error) throw stepError('Storage upload', new Error(`${item.file.name}: ${error.message}`))
      if (upload.thumbnail && descriptor.thumbnailPath && descriptor.thumbnailUploadToken) {
        const { error: thumbnailError } = await supabase.storage.from('media').uploadToSignedUrl(
          descriptor.thumbnailPath,
          descriptor.thumbnailUploadToken,
          upload.thumbnail,
          { contentType: 'image/jpeg' }
        )
        if (thumbnailError) {
          throw stepError('Thumbnail upload', new Error(`${item.file.name}: ${thumbnailError.message}`))
        }
      }
      onProgress?.({
        stage: 'uploading',
        completed: index + 1,
        total: items.length,
        fileName: item.file.name,
        mediaKind: item.kind,
        percent: Math.round(((index + 1) / items.length) * 100),
      })
    }

    onProgress?.({
      stage: 'saving',
      completed: items.length,
      total: items.length,
      percent: 100,
    })
    try {
      await responseBody(await fetch('/api/events/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', eventId, files }),
      }))
    } catch (error) {
      throw stepError('Media record save', error)
    }
    let confirmed
    try {
      confirmed = await loadEventFromCloud(eventId)
    } catch (error) {
      throw stepError('Event reload', error)
    }
    if (!Array.isArray(confirmed.media) || confirmed.media.length < files.length ||
        confirmed.media.some((item) => !item.src || /^(blob:|fireova-idb-|file:)/.test(item.src))) {
      throw new Error('Media reload failed: Supabase did not return every uploaded media item.')
    }
    // Use the normal canonical update path to normalize venue and vendor FKs,
    // then re-read the same UUID before navigation.
    confirmed = await saveEventToCloud(confirmed)
    try {
      const reloaded = await loadEventFromCloud(confirmed.id)
      if (!Array.isArray(reloaded.media) || reloaded.media.length < files.length) {
        throw new Error('Supabase returned an incomplete media list.')
      }
      return reloaded
    } catch (error) {
      throw stepError('Media reload', error)
    }
  } catch (error) {
    await fetch(`/api/events/uploads?eventId=${encodeURIComponent(eventId)}&preserveForRetry=1`, {
      method: 'DELETE',
    }).catch(() => undefined)
    throw error
  }
}
