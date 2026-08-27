import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const eventId = body?.eventId
  if (typeof eventId !== 'string' || !UUID_PATTERN.test(eventId)) {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 })
  }

  const { data: event, error: eventError } = await supabase.from('event_projects')
    .select('id').eq('id', eventId).eq('user_id', user.id).eq('creation_status', 'complete').single()
  if (eventError || !event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const { data: media, error: mediaError } = await supabase.from('event_media')
    .select('id,storage_path,file_name,file_type,size_bytes,created_at')
    .eq('event_id', eventId).eq('user_id', user.id).order('created_at', { ascending: true })
  if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 })

  if (media?.length) {
    const rows = media.map((item: any) => ({
      id: item.id,
      user_id: user.id,
      filename: item.file_name,
      storage_path: item.storage_path,
      file_type: item.file_type,
      size_bytes: item.size_bytes ?? 0,
      tags: [`event:${eventId}`],
      notes: null,
      created_at: item.created_at,
    }))
    const { error } = await supabase.from('media_assets').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, eventId, count: media?.length ?? 0 })
}
