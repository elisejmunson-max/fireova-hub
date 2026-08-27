import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id === 'dev') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .select('id,storage_path')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 })
  if (!asset) return NextResponse.json({ error: 'Media asset not found' }, { status: 404 })

  const { data: eventMedia } = await supabase
    .from('event_media')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (asset.storage_path) {
    const { error: storageError } = await supabase.storage.from('media').remove([asset.storage_path])
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  if (eventMedia) {
    const { error } = await supabase.from('event_media').delete().eq('id', params.id).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const { error: mediaError } = await supabase.from('media_assets').delete().eq('id', params.id).eq('user_id', user.id)
  if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 })

  return NextResponse.json({ deleted: true, id: params.id })
}
