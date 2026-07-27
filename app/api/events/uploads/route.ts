import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type FileDescriptor = {
  id: string
  name: string
  type: string
  size: number
  kind: 'photo' | 'video'
  checksum?: string
  originalName?: string
  originalMimeType?: string
  detectedMimeType?: string
  convertedFrom?: string
  thumbnailName?: string
  thumbnailType?: string
  thumbnailSize?: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeFileName(name: string) {
  const cleaned = name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'upload'
}

async function session() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { db: supabase as any, user: error ? null : user }
}

function validFiles(value: unknown): value is FileDescriptor[] {
  return Array.isArray(value) && value.length > 0 && value.every((file) =>
    file && typeof file === 'object' &&
    typeof file.id === 'string' && UUID_PATTERN.test(file.id) &&
    typeof file.name === 'string' && Boolean(file.name) &&
    typeof file.type === 'string' &&
    typeof file.size === 'number' && file.size >= 0 &&
    (file.kind === 'photo' || file.kind === 'video')
  )
}

export async function POST(request: Request) {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  const payload = await request.json().catch(() => null)
  console.info('[Fireova Diagnostics] UPLOAD_REQUEST', {
    userId: user.id,
    action: payload && typeof payload === 'object' ? payload.action ?? null : null,
    eventId: payload && typeof payload === 'object' ? payload.eventId ?? null : null,
    fileCount: payload && typeof payload === 'object' && Array.isArray(payload.files) ? payload.files.length : 0,
  })
  if (!payload || typeof payload !== 'object') return NextResponse.json({ error: 'Invalid event upload.' }, { status: 400 })

  if (payload.action === 'start') {
    if (typeof payload.creationKey !== 'string' || !payload.creationKey || !validFiles(payload.files) ||
        !payload.event || typeof payload.event !== 'object') {
      return NextResponse.json({ error: 'The event upload is missing required information.' }, { status: 400 })
    }
    let stage = 'creation-key lookup'
    try {
      const { data: existing, error: lookupError } = await db.from('event_projects')
        .select('id,creation_status').eq('user_id', user.id).eq('creation_key', payload.creationKey).maybeSingle()
      if (lookupError) throw lookupError
      if (existing?.creation_status === 'complete') {
        return NextResponse.json({ ok: true, eventId: existing.id, alreadyComplete: true })
      }

      const eventId = existing?.id ?? crypto.randomUUID()
      const now = new Date().toISOString()
      if (!existing) {
        stage = 'event_projects insert'
        const { error } = await db.from('event_projects').insert({
          id: eventId,
          // The original text primary key was renamed to legacy_id during the
          // UUID migration and may still be NOT NULL on older production
          // schemas. This value is metadata only; UUID remains canonical.
          legacy_id: `cloud-upload-${eventId}`,
          user_id: user.id,
          data: {
            ...payload.event,
            id: eventId,
            media: [],
            createdAt: now,
            updatedAt: now,
          },
          creation_key: payload.creationKey,
          creation_status: 'uploading',
          created_at: now,
          updated_at: now,
          deleted_at: null,
        })
        if (error) throw error
        console.info('[Fireova Diagnostics] EVENT_INSERT_CONFIRMED', {
          userId: user.id,
          eventId,
          fileCount: payload.files.length,
        })
      }

      const filePaths = (payload.files as FileDescriptor[]).map((file) => ({
        ...file,
        storagePath: `${user.id}/events/${eventId}/${file.id}-${safeFileName(file.name)}`,
      }))
      stage = 'Storage upload authorization'
      const files = await Promise.all(filePaths.map(async (file) => {
        const { data: signed, error: signedError } = await db.storage.from('media')
          .createSignedUploadUrl(file.storagePath, { upsert: false })
        if (signedError || !signed?.token) throw signedError ?? new Error('Signed upload URL was not created.')
        if (!file.thumbnailName) return { ...file, uploadToken: signed.token }
        const thumbnailPath = `${user.id}/events/${eventId}/${file.id}-thumbnail.jpg`
        const { data: thumbnailSigned, error: thumbnailSignedError } = await db.storage.from('media')
          .createSignedUploadUrl(thumbnailPath, { upsert: false })
        if (thumbnailSignedError || !thumbnailSigned?.token) {
          throw thumbnailSignedError ?? new Error('Thumbnail upload authorization was not created.')
        }
        return {
          ...file,
          uploadToken: signed.token,
          thumbnailPath,
          thumbnailUploadToken: thumbnailSigned.token,
        }
      }))
      return NextResponse.json({ ok: true, eventId, files })
    } catch (error: any) {
      const code = typeof error?.code === 'string' ? error.code : null
      const message = typeof error?.message === 'string' ? error.message : 'Unknown Supabase error.'
      console.info('[Fireova Diagnostics] UPLOAD_START_FAILED', {
        stage,
        code,
        message,
        userId: user.id,
        email: user.email ?? null,
      })
      return NextResponse.json({
        error: `${stage} failed${code ? ` (${code})` : ''}: ${message}`,
        stage,
      }, { status: 500 })
    }
  }

  if (payload.action === 'complete') {
    if (typeof payload.eventId !== 'string' || !UUID_PATTERN.test(payload.eventId) || !validFiles(payload.files)) {
      return NextResponse.json({ error: 'The completed upload information was invalid.' }, { status: 400 })
    }
    try {
      const { data: row, error: eventError } = await db.from('event_projects')
        .select('id,data,creation_status').eq('user_id', user.id).eq('id', payload.eventId).single()
      if (eventError) throw eventError
      if (row.creation_status === 'complete') return NextResponse.json({ ok: true, eventId: row.id })

      const directory = `${user.id}/events/${payload.eventId}`
      const { data: stored, error: listError } = await db.storage.from('media').list(directory, { limit: 1000 })
      if (listError) throw listError
      const storedNames = new Set((stored ?? []).map((item: any) => item.name))
      const descriptors = payload.files as Array<FileDescriptor & { storagePath?: string }>
      for (const file of descriptors) {
        const expectedName = `${file.id}-${safeFileName(file.name)}`
        if (!storedNames.has(expectedName)) throw new Error(`Missing uploaded file: ${file.name}`)
        if (file.thumbnailName && !storedNames.has(`${file.id}-thumbnail.jpg`)) {
          throw new Error(`Missing generated thumbnail: ${file.name}`)
        }
      }
      console.info('[Fireova Diagnostics] STORAGE_RELOAD_CONFIRMED', {
        userId: user.id,
        eventId: payload.eventId,
        storageDirectory: directory,
        fileCount: storedNames.size,
      })

      const media = descriptors.map((file) => {
        const storagePath = `${directory}/${file.id}-${safeFileName(file.name)}`
        const publicUrl = db.storage.from('media').getPublicUrl(storagePath).data.publicUrl
        return {
          id: file.id,
          type: file.kind,
          src: publicUrl,
          posterSrc: file.thumbnailName
            ? db.storage.from('media').getPublicUrl(`${directory}/${file.id}-thumbnail.jpg`).data.publicUrl
            : undefined,
          alt: file.name,
          storagePath,
        }
      })
      const { error: mediaError } = await db.from('event_media').upsert(descriptors.map((file) => {
        const storagePath = `${directory}/${file.id}-${safeFileName(file.name)}`
        return {
          id: file.id,
          user_id: user.id,
          event_id: payload.eventId,
          storage_path: storagePath,
          file_name: file.name,
          file_type: file.type || (file.kind === 'video' ? 'video/*' : 'image/*'),
          media_kind: file.kind,
          size_bytes: file.size,
          thumbnail_path: file.thumbnailName ? `${directory}/${file.id}-thumbnail.jpg` : null,
          preview_url: db.storage.from('media').getPublicUrl(storagePath).data.publicUrl,
          checksum: file.checksum || null,
          metadata: {
            originalFileName: file.originalName ?? file.name,
            originalMimeType: file.originalMimeType ?? file.type,
            detectedMimeType: file.detectedMimeType ?? file.type,
            convertedFrom: file.convertedFrom ?? null,
          },
        }
      }), { onConflict: 'id' })
      if (mediaError) throw mediaError
      const { data: confirmedMedia, error: mediaReloadError } = await db.from('event_media')
        .select('id,event_id,user_id,storage_path,preview_url')
        .eq('user_id', user.id).eq('event_id', payload.eventId)
      if (mediaReloadError) throw mediaReloadError
      if ((confirmedMedia ?? []).length < descriptors.length) {
        throw new Error('Media records could not be queried back after insertion.')
      }
      console.info('[Fireova Diagnostics] MEDIA_RELOAD_CONFIRMED', {
        userId: user.id,
        eventId: payload.eventId,
        mediaCount: confirmedMedia.length,
        storagePaths: confirmedMedia.map((item: any) => item.storage_path),
      })

      const now = new Date().toISOString()
      const eventData = {
        ...(row.data ?? {}),
        id: payload.eventId,
        cover: media[0],
        media,
        updatedAt: now,
      }
      const { error: finishError } = await db.from('event_projects').update({
        data: eventData,
        creation_status: 'complete',
        updated_at: now,
      }).eq('user_id', user.id).eq('id', payload.eventId)
      if (finishError) throw finishError
      const { data: confirmedEvent, error: eventReloadError } = await db.from('event_projects')
        .select('id,user_id,creation_status')
        .eq('user_id', user.id).eq('id', payload.eventId).single()
      if (eventReloadError) throw eventReloadError
      if (confirmedEvent.creation_status !== 'complete') throw new Error('Event was not complete after confirmation.')

      console.info('[Fireova Cloud Creation] EVENT_MEDIA_CONFIRMED', {
        userId: user.id,
        eventId: confirmedEvent.id,
        eventUserId: confirmedEvent.user_id,
        mediaCount: media.length,
      })
      return NextResponse.json({ ok: true, eventId: payload.eventId })
    } catch (error: any) {
      console.error('[Fireova Cloud Creation] COMPLETE_FAILED', {
        code: error?.code, message: error?.message, userId: user.id, eventId: payload.eventId,
      })
      return NextResponse.json({ error: 'The media upload could not be confirmed. The event was not published.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown upload action.' }, { status: 400 })
}

export async function DELETE(request: Request) {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  const eventId = new URL(request.url).searchParams.get('eventId')
  if (!eventId || !UUID_PATTERN.test(eventId)) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 })
  try {
    const directory = `${user.id}/events/${eventId}`
    const { data: stored } = await db.storage.from('media').list(directory, { limit: 1000 })
    const paths = (stored ?? []).map((item: any) => `${directory}/${item.name}`)
    if (paths.length) await db.storage.from('media').remove(paths)
    const { error } = await db.from('event_projects').delete()
      .eq('user_id', user.id).eq('id', eventId).eq('creation_status', 'uploading')
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Fireova Cloud Creation] ROLLBACK_FAILED', error)
    return NextResponse.json({ error: 'The incomplete event could not be cleaned up automatically.' }, { status: 500 })
  }
}
