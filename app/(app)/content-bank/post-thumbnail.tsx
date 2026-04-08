'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PostThumbnail({ postId }: { postId: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()

        // First get asset_ids from post_media table
        const { data: postMedia } = await supabase
          .from('post_media')
          .select('asset_id')
          .eq('post_id', postId)
          .order('display_order', { ascending: true })
          .limit(1)

        if (!postMedia || postMedia.length === 0) return
        const assetId = postMedia[0].asset_id

        const { data } = await supabase
          .from('media_assets')
          .select('storage_path, file_type')
          .eq('id', assetId)
          .single() as { data: { storage_path: string; file_type: string } | null; error: unknown }

        if (!data) return
        const isImage = data.file_type.startsWith('image/')
        const canPreview = isImage && !['image/heic', 'image/heif'].includes(data.file_type.toLowerCase())
        if (!canPreview) return

        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(data.storage_path)
        setUrl(publicUrl)
      } catch {}
    }
    load()
  }, [postId])

  if (!url) {
    return (
      <div className="w-20 h-20 rounded-xl bg-stone-100 flex-shrink-0" />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="w-20 h-20 rounded-xl object-cover flex-shrink-0 border border-stone-200"
    />
  )
}
