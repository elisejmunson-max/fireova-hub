import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function normalizeName(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : ''
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function session() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { db: supabase as any, user: error ? null : user }
}

function mapVenue(row: any) {
  return {
    id: row.id,
    name: row.name,
    location: row.location ?? '',
    notes: row.notes ?? '',
    instagram: row.instagram_handle ?? '',
    vendorId: undefined,
  }
}

export async function GET() {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  try {
    const { data, error } = await db.from('venues')
      .select('id,name,location,notes,instagram_handle,created_at,updated_at')
      .eq('user_id', user.id)
      .order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ venues: (data ?? []).map(mapVenue) })
  } catch (error) {
    console.error('[Fireova Venues] LOAD_FAILED', error)
    return NextResponse.json({ error: 'Venues could not be loaded.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const name = clean(payload?.name)
  if (!name) return NextResponse.json({ error: 'Venue name is required.' }, { status: 400 })

  try {
    const row = {
      user_id: user.id,
      name,
      normalized_name: normalizeName(name),
      location: clean(payload?.location),
      notes: clean(payload?.notes),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await db.from('venues')
      .upsert(row, { onConflict: 'user_id,normalized_name' })
      .select('id,name,location,notes,instagram_handle,created_at,updated_at')
      .single()
    if (error) throw error
    return NextResponse.json({ venue: mapVenue(data) })
  } catch (error) {
    console.error('[Fireova Venues] SAVE_FAILED', error)
    return NextResponse.json({ error: 'The venue could not be saved.' }, { status: 500 })
  }
}
