import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mediaBankDeletionPaths, mediaBankPosterPath } from '@/lib/media-bank-poster-path'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id === 'dev') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .select('id,storage_path,file_type')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 })
  if (!asset) {
    // A retry after row deletion can finish an interrupted deterministic-poster cleanup.
    // The key always uses the authenticated owner's prefix; no foreign asset is touched.
    const poster = mediaBankPosterPath(user.id, params.id)
    if (poster) {
      const { error } = await supabase.storage.from('media').remove([poster])
      if (error) return NextResponse.json({ error: 'Preview cleanup could not finish' }, { status: 500 })
    }
    return NextResponse.json({ deleted: true, id: params.id })
  }

  const { data: eventMedia } = await supabase
    .from('event_media')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (asset.storage_path) {
    const paths = mediaBankDeletionPaths(user.id, asset)
    if (!paths) return NextResponse.json({ error: 'Invalid media path' }, { status: 404 })
    const { error: storageError } = await supabase.storage.from('media').remove(paths)
    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  if (eventMedia) {
    const { error } = await supabase.from('event_media').delete().eq('id', params.id).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const { error: mediaError } = await supabase.from('media_assets').delete().eq('id', params.id).eq('user_id', user.id)
  if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 })

  // A concurrent poster POST rechecks row ownership after its write as well.
  if (asset.file_type?.startsWith('video/')) {
    const poster = mediaBankPosterPath(user.id, asset.id)
    if (poster) {
      const { error } = await supabase.storage.from('media').remove([poster])
      if (error) return NextResponse.json({ error: 'Media removed; preview cleanup could not finish' }, { status: 500 })
    }
  }

  return NextResponse.json({ deleted: true, id: params.id })
}
