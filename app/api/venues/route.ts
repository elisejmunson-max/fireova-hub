import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const clean = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
const normalize = (value: unknown) => clean(value)?.toLowerCase().replace(/\s+/g, ' ') ?? ''

async function session() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { db: supabase as any, user: error ? null : user }
}

function serializeVenue(venue: any) {
  return {
    id: venue.id,
    name: venue.name,
    location: venue.location ?? undefined,
    notes: venue.notes ?? undefined,
    instagram: venue.instagram_handle ? `@${venue.instagram_handle.replace(/^@/, '')}` : undefined,
  }
}

async function listVenues(db: any, userId: string) {
  const { data, error } = await db.from('venues')
    .select('id,name,location,notes,instagram_handle')
    .eq('user_id', userId)
    .order('name')
  if (error) throw error
  return (data ?? []).map(serializeVenue)
}

export async function GET() {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  try {
    return NextResponse.json({ venues: await listVenues(db, user.id) })
  } catch (error) {
    console.error('[Fireova Phase 1] VENUE_READ_FAILED', error)
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
    const { data, error } = await db.from('venues').upsert({
      user_id: user.id,
      name,
      normalized_name: normalize(name),
      location: clean(payload.location),
      notes: clean(payload.notes),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,normalized_name' })
      .select('id,name,location,notes,instagram_handle')
      .single()
    if (error) throw error
    return NextResponse.json({ venue: serializeVenue(data) })
  } catch (error) {
    console.error('[Fireova Phase 1] VENUE_WRITE_FAILED', error)
    return NextResponse.json({ error: 'The venue could not be saved.' }, { status: 500 })
  }
}
