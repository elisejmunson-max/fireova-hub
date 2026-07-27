'use client'

import { createClient } from '@/lib/supabase/client'
import type { MediaAsset } from '@/lib/types'

export type PreviewPlatform = 'instagram' | 'facebook' | 'tiktok'

export function PostPreview({
  platform,
  onPlatformChange,
  caption,
  hashtags,
  title,
  media,
}: {
  platform: PreviewPlatform
  onPlatformChange: (p: PreviewPlatform) => void
  caption: string
  hashtags: string[]
  title: string
  media: MediaAsset[]
}) {
  const supabase = createClient()
  const firstImage = media.find(
    (a) => a.file_type.startsWith('image/') && !['image/heic', 'image/heif'].includes(a.file_type.toLowerCase())
  )
  const firstVideo = media.find((a) => a.file_type.startsWith('video/'))
  const previewAsset = firstImage ?? firstVideo ?? null
  const previewUrl = previewAsset
    ? supabase.storage.from('media').getPublicUrl(previewAsset.storage_path).data.publicUrl
    : null

  const platforms: { id: PreviewPlatform; label: string }[] = [
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'tiktok', label: 'TikTok' },
  ]

  const displayCaption =
    caption || (title ? `${title}...` : 'Your caption will appear here once you start writing.')
  const hashtagStr = hashtags.length > 0 ? hashtags.join(' ') : ''

  return (
    <div className="space-y-3">
      {/* Platform tabs */}
      <div className="flex rounded-xl overflow-hidden border border-stone-200 bg-stone-50">
        {platforms.map((p) => (
          <button
            key={p.id}
            onClick={() => onPlatformChange(p.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              platform === p.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {platform === 'instagram' && (
        <InstagramPreview
          previewUrl={previewUrl}
          caption={displayCaption}
          hashtags={hashtagStr}
          isVideo={!!firstVideo && !firstImage}
        />
      )}
      {platform === 'facebook' && (
        <FacebookPreview
          previewUrl={previewUrl}
          caption={displayCaption}
          hashtags={hashtagStr}
          isVideo={!!firstVideo && !firstImage}
        />
      )}
      {platform === 'tiktok' && (
        <TikTokPreview previewUrl={previewUrl} caption={displayCaption} hashtags={hashtagStr} />
      )}

      <p className="text-[10px] text-stone-400 text-center">Preview only. Actual post may vary.</p>
    </div>
  )
}

// ── Instagram ─────────────────────────────────────────────────────────────────
function InstagramPreview({
  previewUrl,
  caption,
  hashtags,
  isVideo,
}: {
  previewUrl: string | null
  caption: string
  hashtags: string
  isVideo: boolean
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden text-[11px] shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-stone-100">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 via-red-500 to-pink-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[9px] font-bold">F</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-900 text-[11px] leading-none">fireovapizza</p>
          <p className="text-stone-400 text-[9px] mt-0.5">Denton, TX</p>
        </div>
        <span className="text-stone-400 text-lg leading-none">···</span>
      </div>

      <div className="aspect-square bg-stone-100 relative">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-300">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-[10px]">No media attached</p>
          </div>
        )}
        {isVideo && (
          <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-white text-[9px] font-medium">
            ▶ VIDEO
          </div>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-lg">🤍</span>
            <span className="text-lg">💬</span>
            <span className="text-lg">↗</span>
          </div>
          <span className="text-lg">🔖</span>
        </div>
        <div className="space-y-0.5">
          <p className="text-stone-900 leading-relaxed">
            <span className="font-semibold">fireovapizza </span>
            <span className="line-clamp-3">{caption}</span>
          </p>
          {hashtags && <p className="text-blue-500 line-clamp-2">{hashtags}</p>}
        </div>
        <p className="text-stone-400 mt-1.5 text-[10px] uppercase tracking-wide">2 hours ago</p>
      </div>
    </div>
  )
}

// ── Facebook ──────────────────────────────────────────────────────────────────
function FacebookPreview({
  previewUrl,
  caption,
  hashtags,
  isVideo,
}: {
  previewUrl: string | null
  caption: string
  hashtags: string
  isVideo: boolean
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden text-[11px] shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[10px] font-bold">F</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-900 leading-none">Fireova Pizza</p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-stone-400 text-[9px]">Just now · </p>
            <span className="text-[9px] text-stone-400">🌐</span>
          </div>
        </div>
        <span className="text-stone-400 text-lg leading-none">···</span>
      </div>

      {caption && (
        <div className="px-3 pb-2">
          <p className="text-stone-800 line-clamp-3 leading-relaxed">{caption}</p>
          {hashtags && <p className="text-blue-600 text-[10px] mt-1 line-clamp-1">{hashtags}</p>}
        </div>
      )}

      <div className="aspect-video bg-stone-100 relative">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-300">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-[10px]">No media attached</p>
          </div>
        )}
        {isVideo && (
          <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-white text-[9px] font-medium">
            ▶ VIDEO
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-stone-100">
        <div className="flex items-center justify-around text-stone-500 text-[11px]">
          <button className="flex items-center gap-1 hover:text-blue-600 transition-colors py-1 px-2 rounded hover:bg-stone-50">
            👍 <span>Like</span>
          </button>
          <button className="flex items-center gap-1 hover:text-blue-600 transition-colors py-1 px-2 rounded hover:bg-stone-50">
            💬 <span>Comment</span>
          </button>
          <button className="flex items-center gap-1 hover:text-blue-600 transition-colors py-1 px-2 rounded hover:bg-stone-50">
            ↗ <span>Share</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TikTok ────────────────────────────────────────────────────────────────────
function TikTokPreview({
  previewUrl,
  caption,
  hashtags,
}: {
  previewUrl: string | null
  caption: string
  hashtags: string
}) {
  return (
    <div
      className="bg-black rounded-2xl overflow-hidden shadow-sm relative"
      style={{ aspectRatio: '9/16', maxHeight: '480px' }}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-600">
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-[10px] text-stone-500">No media attached</p>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 text-white">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">F</span>
          </div>
          <span className="text-white text-[9px]">+</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl">❤️</span>
          <span className="text-[9px]">12.4K</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl">💬</span>
          <span className="text-[9px]">284</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl">↗</span>
          <span className="text-[9px]">Share</span>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-3 py-3 pr-12">
        <p className="text-white font-semibold text-[11px] mb-1">@fireovapizza</p>
        <p className="text-white text-[10px] leading-snug line-clamp-3">{caption}</p>
        {hashtags && <p className="text-white/80 text-[10px] mt-1 line-clamp-1">{hashtags}</p>}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-white text-[10px]">♪</span>
          <p className="text-white text-[10px] truncate">Original sound - fireovapizza</p>
        </div>
      </div>
    </div>
  )
}
