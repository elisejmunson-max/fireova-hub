import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type EventPayload = {
  id?: unknown
  data?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  migrationOnly?: unknown
}

type EventData = Record<string, unknown> & {
  name?: string
  type?: string
  date?: string
  notes?: string
  venueName?: string
  venueLocation?: string
  venueInstagram?: string
  vendors?: Array<Record<string, unknown>>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeName(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : ''
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function getSession() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase: supabase as any, user: error ? null : user }
}

async function loadEventRows(db: any, userId: string, eventId?: string) {
  let query = db.from('event_projects')
    .select('id,user_id,legacy_id,data,venue_id,created_at,updated_at,deleted_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('creation_status', 'complete')
    .order('updated_at', { ascending: false })
  if (eventId) query = query.eq('id', eventId)
  const { data: events, error } = await query
  if (error) throw error
  if (!events?.length) return []

  const eventIds = events.map((event: any) => event.id)
  const venueIds = events.map((event: any) => event.venue_id).filter(Boolean)
  const [
    { data: venues, error: venueError },
    { data: links, error: linkError },
    { data: mediaRows, error: mediaError },
  ] = await Promise.all([
    venueIds.length
      ? db.from('venues').select('*').eq('user_id', userId).in('id', venueIds)
      : Promise.resolve({ data: [], error: null }),
    db.from('event_vendors')
      .select('id,event_id,vendor_id,category_id,instagram_override,notes')
      .eq('user_id', userId)
      .in('event_id', eventIds),
    db.from('event_media')
      .select('id,event_id,storage_path,file_name,media_kind,thumbnail_path,preview_url,created_at')
      .eq('user_id', userId)
      .in('event_id', eventIds)
      .order('created_at', { ascending: true }),
  ])
  if (venueError) throw venueError
  if (linkError) throw linkError
  if (mediaError) throw mediaError

  const vendorIds = (links ?? []).map((link: any) => link.vendor_id)
  const categoryIds = (links ?? []).map((link: any) => link.category_id)
  const [{ data: vendors, error: vendorError }, { data: categories, error: categoryError }] = await Promise.all([
    vendorIds.length
      ? db.from('vendors').select('*').eq('user_id', userId).in('id', vendorIds)
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length
      ? db.from('vendor_categories').select('id,name').eq('user_id', userId).in('id', categoryIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (vendorError) throw vendorError
  if (categoryError) throw categoryError

  const venueMap = new Map<string, any>((venues ?? []).map((venue: any) => [venue.id, venue]))
  const vendorMap = new Map<string, any>((vendors ?? []).map((vendor: any) => [vendor.id, vendor]))
  const categoryMap = new Map<string, string>((categories ?? []).map((category: any) => [category.id, category.name]))

  return events.map((row: any) => {
    const venue = row.venue_id ? venueMap.get(row.venue_id) : null
    const eventVendors = (links ?? []).filter((link: any) => link.event_id === row.id).flatMap((link: any) => {
      const vendor = vendorMap.get(link.vendor_id)
      if (!vendor) return []
      return [{
        id: link.id,
        vendorId: vendor.id,
        category: categoryMap.get(link.category_id) ?? 'Other',
        businessName: vendor.business_name,
        instagramOverride: link.instagram_override ?? undefined,
        notes: link.notes ?? vendor.notes ?? undefined,
      }]
    })
    const details = row.data && typeof row.data === 'object' ? row.data : {}
    const cloudMedia = (mediaRows ?? []).filter((media: any) => media.event_id === row.id).map((media: any) => ({
      id: media.id,
      type: media.media_kind,
      src: media.preview_url,
      posterSrc: media.thumbnail_path
        ? db.storage.from('media').getPublicUrl(media.thumbnail_path).data.publicUrl
        : undefined,
      alt: media.file_name,
      storagePath: media.storage_path,
    }))
    return {
      ...details,
      id: row.id,
      legacyId: row.legacy_id ?? undefined,
      name: details.name ?? 'New Event',
      date: details.date ?? '',
      type: details.type ?? 'Other',
      notes: details.notes ?? undefined,
      venueName: venue?.name ?? undefined,
      venueLocation: venue?.location ?? undefined,
      venueInstagram: venue?.instagram_handle ?? undefined,
      venueVendorId: undefined,
      vendors: eventVendors,
      media: cloudMedia,
      cover: cloudMedia[0],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

async function ensureVenue(db: any, userId: string, data: EventData) {
  const name = clean(data.venueName)
  if (!name) return null
  const normalized = normalizeName(name)
  const { data: venue, error } = await db.from('venues').upsert({
    user_id: userId,
    name,
    normalized_name: normalized,
    location: clean(data.venueLocation),
    instagram_handle: clean(data.venueInstagram)?.replace(/^@/, '') ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,normalized_name' }).select('id').single()
  if (error) throw error
  return venue.id as string
}

async function ensureCategory(db: any, userId: string, categoryName: unknown) {
  const name = clean(categoryName) ?? 'Other'
  const { data, error } = await db.from('vendor_categories').upsert({
    user_id: userId,
    name,
    normalized_name: normalizeName(name),
    is_system: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,normalized_name' }).select('id').single()
  if (error) throw error
  return data.id as string
}

async function replaceEventVendors(db: any, userId: string, eventId: string, items: EventData['vendors']) {
  const { error: clearError } = await db.from('event_vendors').delete()
    .eq('user_id', userId).eq('event_id', eventId)
  if (clearError) throw clearError

  for (const item of items ?? []) {
    const categoryId = await ensureCategory(db, userId, item.category)
    const legacyId = clean(item.vendorId)
    let vendorId = legacyId && UUID_PATTERN.test(legacyId) ? legacyId : null
    if (vendorId) {
      const { data: owned } = await db.from('vendors').select('id')
        .eq('user_id', userId).eq('id', vendorId).maybeSingle()
      if (!owned) vendorId = null
    }
    if (!vendorId && legacyId) {
      const { data: legacy } = await db.from('vendors').select('id')
        .eq('user_id', userId).eq('legacy_id', legacyId).maybeSingle()
      vendorId = legacy?.id ?? null
    }
    if (!vendorId) {
      const businessName = clean(item.businessName) ?? clean(item.instagramHandle) ?? clean(item.instagramOverride) ?? 'Vendor'
      const { data: vendor, error } = await db.from('vendors').insert({
        user_id: userId,
        legacy_id: legacyId,
        category_id: categoryId,
        business_name: businessName,
        normalized_name: normalizeName(businessName),
        instagram_handle: (clean(item.instagramHandle) ?? clean(item.instagramOverride))?.replace(/^@/, '') ?? null,
        notes: clean(item.notes),
      }).select('id').single()
      if (error) throw error
      vendorId = vendor.id
    } else {
      const vendorPatch: Record<string, unknown> = {
        category_id: categoryId,
        updated_at: new Date().toISOString(),
      }
      const businessName = clean(item.businessName)
      const instagram = clean(item.instagramHandle) ?? clean(item.instagramOverride)
      if (businessName) {
        vendorPatch.business_name = businessName
        vendorPatch.normalized_name = normalizeName(businessName)
      }
      if (instagram) vendorPatch.instagram_handle = instagram.replace(/^@/, '')
      if (clean(item.notes)) vendorPatch.notes = clean(item.notes)
      const { error } = await db.from('vendors').update(vendorPatch)
        .eq('user_id', userId).eq('id', vendorId)
      if (error) throw error
    }
    const { error } = await db.from('event_vendors').insert({
      user_id: userId,
      event_id: eventId,
      vendor_id: vendorId,
      category_id: categoryId,
      instagram_override: clean(item.instagramOverride)?.replace(/^@/, '') ?? null,
      notes: clean(item.notes),
    })
    if (error) throw error
  }
}

export async function GET(request: Request) {
  const { supabase: db, user } = await getSession()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  const eventId = new URL(request.url).searchParams.get('id') ?? undefined
  try {
    const events = await loadEventRows(db, user.id, eventId)
    console.info('[Fireova Diagnostics] EVENT_LIST_QUERY', {
      userId: user.id,
      requestedEventId: eventId ?? null,
      eventCount: events.length,
      eventIds: events.map((event: any) => event.id),
      mediaCounts: events.map((event: any) => ({ eventId: event.id, count: event.media?.length ?? 0 })),
    })
    return NextResponse.json({
      events,
      account: { email: user.email ?? null, userId: user.id },
    })
  } catch (error) {
    console.error('[Fireova Phase 1] EVENT_READ_FAILED', error)
    return NextResponse.json({ error: 'Events could not be loaded from your account.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { supabase: db, user } = await getSession()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again and retry.' }, { status: 401 })
  let payload: EventPayload
  try { payload = await request.json() } catch {
    return NextResponse.json({ error: 'The event data was invalid.' }, { status: 400 })
  }
  if (!payload.data || typeof payload.data !== 'object') {
    return NextResponse.json({ error: 'The event is missing required information.' }, { status: 400 })
  }

  const data = payload.data as EventData
  const incomingId = typeof payload.id === 'string' ? payload.id : ''
  let canonicalId = UUID_PATTERN.test(incomingId) ? incomingId : null
  const legacyId = canonicalId ? clean((data as any).legacyId) : clean(incomingId)
  console.info('[Fireova Diagnostics] EVENT_SAVE_REQUEST', {
    userId: user.id,
    incomingId,
    canonicalId,
    legacyId,
    eventName: clean(data.name),
    migrationOnly: Boolean(payload.migrationOnly),
  })

  try {
    if (payload.migrationOnly && legacyId) {
      const { data: existing } = await db.from('event_projects').select('id')
        .eq('user_id', user.id).eq('legacy_id', legacyId).maybeSingle()
      if (existing) {
        const events = await loadEventRows(db, user.id, existing.id)
        return NextResponse.json({ ok: true, migrated: false, event: events[0] })
      }
    }
    if (!canonicalId && legacyId && !payload.migrationOnly) {
      const { data: retryTarget, error: retryLookupError } = await db.from('event_projects')
        .select('id').eq('user_id', user.id).eq('legacy_id', legacyId).maybeSingle()
      if (retryLookupError) throw retryLookupError
      canonicalId = retryTarget?.id ?? null
    }

    const venueId = await ensureVenue(db, user.id, data)
    const now = new Date().toISOString()
    const row = {
      ...(canonicalId ? { id: canonicalId } : {}),
      user_id: user.id,
      ...(legacyId ? { legacy_id: legacyId } : {}),
      venue_id: venueId,
      data,
      created_at: clean(payload.createdAt) ?? now,
      updated_at: now,
      deleted_at: null,
      creation_status: 'complete',
    }
    const query = canonicalId
      ? db.from('event_projects').update(row).eq('user_id', user.id).eq('id', canonicalId)
      : db.from('event_projects').insert(row)
    const { data: saved, error } = await query.select('id').single()
    if (error) throw error

    await replaceEventVendors(db, user.id, saved.id, data.vendors)
    const events = await loadEventRows(db, user.id, saved.id)
    console.info('[Fireova Phase 1] EVENT_WRITE_CONFIRMED', {
      userId: user.id,
      eventId: saved.id,
      legacyId,
    })
    return NextResponse.json({ ok: true, migrated: Boolean(payload.migrationOnly), event: events[0] })
  } catch (error: any) {
    const code = typeof error?.code === 'string' ? error.code : null
    const message = typeof error?.message === 'string' ? error.message : 'Unknown Supabase error.'
    console.error('[Fireova Phase 1] EVENT_WRITE_FAILED', {
      code, message, userId: user.id, eventId: incomingId,
    })
    return NextResponse.json({
      error: `Event update failed${code ? ` (${code})` : ''}: ${message}`,
    }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const { supabase: db, user } = await getSession()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 })
  const { error } = await db.from('event_projects').delete().eq('user_id', user.id).eq('id', id)
  if (error) return NextResponse.json({ error: 'The event could not be deleted.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
