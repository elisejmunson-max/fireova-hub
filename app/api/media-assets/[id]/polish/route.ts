import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'

function editedFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, '')
  return `${base}-polished.jpg`
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id === 'dev') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: asset, error: assetError } = await supabase
    .from('media_assets').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (assetError || !asset) return NextResponse.json({ error: assetError?.message || 'Media asset not found' }, { status: 404 })
  if (!String(asset.file_type || '').startsWith('image/')) return NextResponse.json({ error: 'Photo polish only supports images.' }, { status: 400 })

  const { data: original, error: downloadError } = await supabase.storage.from('media').download(asset.storage_path)
  if (downloadError || !original) return NextResponse.json({ error: downloadError?.message || 'Could not load original photo.' }, { status: 500 })

  const input = Buffer.from(await original.arrayBuffer())
  let output: Buffer
  try {
    output = await sharp(input).rotate().modulate({ brightness: 1.035, saturation: 1.025 })
      .linear(1.035, -2).sharpen({ sigma: 0.75, m1: 0.8, m2: 1.2 })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Photo processing failed.' }, { status: 500 })
  }

  const newId = crypto.randomUUID()
  const folder = asset.storage_path.includes('/') ? asset.storage_path.slice(0, asset.storage_path.lastIndexOf('/')) : `${user.id}/polished`
  const newName = editedFilename(asset.filename || 'photo.jpg')
  const newPath = `${folder}/${newId}-${newName}`
  const { error: uploadError } = await supabase.storage.from('media').upload(newPath, output, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const tags = Array.from(new Set([...(asset.tags || []), `edited-from:${asset.id}`, 'professional-polish']))
  const row = {
    id: newId, user_id: user.id, filename: newName, storage_path: newPath,
    file_type: 'image/jpeg', size_bytes: output.length, tags,
    notes: 'Professional polish created from original. Safe tonal and sharpness adjustments only.',
    created_at: new Date().toISOString(), folder_id: asset.folder_id ?? null,
    ai_status: 'pending', ai_reason: 'Edited copy is ready for AI re-review.',
    ai_categories: asset.ai_categories ?? [], ai_post_uses: asset.ai_post_uses ?? [], ai_edit_suggestion: null,
  }
  const { error: insertError } = await supabase.from('media_assets').insert(row)
  if (insertError) { await supabase.storage.from('media').remove([newPath]); return NextResponse.json({ error: insertError.message }, { status: 500 }) }

  const { data: eventSource } = await supabase.from('event_media').select('event_id,media_kind').eq('id', asset.id).eq('user_id', user.id).maybeSingle()
  if (eventSource?.event_id) await supabase.from('event_media').insert({
    id: newId, user_id: user.id, event_id: eventSource.event_id, storage_path: newPath,
    file_name: newName, file_type: 'image/jpeg', media_kind: 'photo', size_bytes: output.length,
    thumbnail_path: null, preview_url: supabase.storage.from('media').getPublicUrl(newPath).data.publicUrl,
    checksum: null, metadata: { editedFrom: asset.id, editType: 'professional-polish' },
  })

  return NextResponse.json({ original: { id: asset.id, filename: asset.filename, storage_path: asset.storage_path }, edited: { ...row, public_url: supabase.storage.from('media').getPublicUrl(newPath).data.publicUrl } })
}
