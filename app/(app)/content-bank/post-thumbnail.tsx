'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const LS_POST_MEDIA_KEY = 'fireova_post_media'

export default function PostThumbnail({ postId }: { postId: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const raw = localStorage.getItem(LS_POST_MEDIA_KEY)
        const store: Record<string, string[]> = raw ? JSON.parse(raw) : {}
        const ids = store[postId] ?? []
        if (ids.length === 0) return

        const supabase = createClient()
        const { data } = await supabase
          .from('media_assets')
          .select('storage_path, file_type')
          .in('id', ids)
          .order('created_at', { ascending: true })
          .limit(1)
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
