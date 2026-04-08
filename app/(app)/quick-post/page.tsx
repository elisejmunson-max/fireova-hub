'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PILLARS, FORMATS, PILLAR_COLORS,
  PILLAR_FOLDER_IDS, PILLAR_SUBFOLDER_IDS,
} from '@/lib/constants'
import { getDynamicPillarData, toFolderSlug } from '@/lib/pillar-utils'
import type { MediaAsset, PostInsert } from '@/lib/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Format = 'Reel' | 'Carousel' | 'Photo'
type Status = 'draft' | 'scheduled' | 'published'

const LS_POST_MEDIA_KEY   = 'fireova_post_media'
const LS_ASSET_META_KEY   = 'fireova_asset_meta'
const LS_EXAMPLES_KEY     = 'fireova_approved_examples'
const REVIEW_KEY          = 'fireova_review_posts'
const APPROVED_KEY        = 'fireova_approved_posts'

// ---------------------------------------------------------------------------
// Approved examples helpers
// ---------------------------------------------------------------------------
function loadApprovedExamples(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_EXAMPLES_KEY) ?? '[]') } catch { return [] }
}
function saveApprovedExample(caption: string) {
  if (!caption.trim()) return
  try {
    const existing = loadApprovedExamples()
    const deduped = existing.filter((e) => e !== caption)
    localStorage.setItem(LS_EXAMPLES_KEY, JSON.stringify([caption, ...deduped].slice(0, 10)))
  } catch {}
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function QuickPostPage() {
  const router = useRouter()

  // Media browser state
  const [assets, setAssets]           = useState<MediaAsset[]>([])
  const [assetMeta, setAssetMeta]     = useState<Record<string, { folder_id?: string | null }>>({})
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [search, setSearch]           = useState('')
  const [pillarFilter, setPillarFilter] = useState<string | null>(null)
  const [subPillarFilter, setSubPillarFilter] = useState<string | null>(null)
  const [itemFilter, setItemFilter] = useState<string | null>(null)
  const [dynPillars, setDynPillars]   = useState<string[]>([...PILLARS])
  const [dynPillarFolderIds, setDynPillarFolderIds] = useState<Record<string, string>>(PILLAR_FOLDER_IDS)
  const [dynPillarSubfolderIds, setDynPillarSubfolderIds] = useState<Record<string, string[]>>(PILLAR_SUBFOLDER_IDS)
  const [dynSubPillars, setDynSubPillars] = useState<Record<string, string[]>>({})
  const [dynSubPillarItems, setDynSubPillarItems] = useState<Record<string, string[]>>({})
  const [folderNameById, setFolderNameById] = useState<Record<string, string>>({})

  // Selection + reordering
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset[]>([])
  const dragIndexRef = useRef<number | null>(null)

  // Post form
  const [title, setTitle]             = useState('')
  const [pillar, setPillar]           = useState('')
  const [subPillar, setSubPillar]     = useState('')
  const [subPillarItem, setSubPillarItem] = useState('')
  const [format, setFormat]           = useState<Format>('Reel')
  const [topic, setTopic]             = useState('')
  const [notes, setNotes]             = useState('')
  const [caption1, setCaption1]       = useState('')
  const [caption2, setCaption2]       = useState('')
  const [hashtags, setHashtags]       = useState(['', '', '', ''])
  const [shotIdeas, setShotIdeas]     = useState(['', '', ''])

  // Generation / refinement
  const [generating, setGenerating]   = useState(false)
  const [genError, setGenError]       = useState<string | null>(null)
  const [showRefine, setShowRefine]   = useState<Record<1|2, boolean>>({ 1: false, 2: false })
  const [refineText, setRefineText]   = useState<Record<1|2, string>>({ 1: '', 2: '' })
  const [refining, setRefining]       = useState<1|2|null>(null)
  const [refineError, setRefineError] = useState<string | null>(null)

  // Save state
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [saved, setSaved]             = useState(false)

  // ---------------------------------------------------------------------------
  // Load assets + meta
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ASSET_META_KEY)
      if (raw) setAssetMeta(JSON.parse(raw))
    } catch {}

    try {
      const d = getDynamicPillarData()
      setDynPillars(d.pillars)
      setDynPillarFolderIds(d.pillarFolderIds)
      setDynPillarSubfolderIds(d.pillarSubfolderIds)
      setDynSubPillars(d.subPillars)
      setDynSubPillarItems(d.subPillarItems)
      // Build folderId → name lookup for search
      const nameMap: Record<string, string> = {}
      for (const f of d.folderTree) nameMap[f.id] = f.name
      setFolderNameById(nameMap)
    } catch {}

    const supabase = createClient()
    supabase
      .from('media_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAssets(data ?? [])
        setLoadingAssets(false)
      })
  }, [])

  // ---------------------------------------------------------------------------
  // Auto-detect pillar from selected media
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (selectedMedia.length === 0) return
    const folderIds = selectedMedia
      .map((a) => assetMeta[a.id]?.folder_id ?? null)
      .filter(Boolean) as string[]

    // Find which pillar each folder belongs to
    const pillarCounts: Record<string, number> = {}
    for (const folderId of folderIds) {
      for (const p of dynPillars) {
        const rootId = dynPillarFolderIds[p]
        if (!rootId) continue
        const isRoot = folderId === rootId
        const isSub = (dynPillarSubfolderIds[rootId] ?? []).includes(folderId)
        if (isRoot || isSub) {
          pillarCounts[p] = (pillarCounts[p] ?? 0) + 1
        }
      }
    }
    const best = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0]
    if (best && !pillar) { setPillar(best[0]); setSubPillar(''); setSubPillarItem('') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMedia])

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getFolderId(assetId: string): string | null {
    return assetMeta[assetId]?.folder_id ?? null
  }

  function assetInPillar(assetId: string, p: string): boolean {
    const rootId = dynPillarFolderIds[p]
    if (!rootId) return false
    const folderId = getFolderId(assetId)
    if (!folderId) return false
    if (folderId === rootId) return true
    return (dynPillarSubfolderIds[rootId] ?? []).includes(folderId)
  }

  function getSubPillarFolderId(pillarName: string, subName: string): string {
    const pillarSlug = dynPillarFolderIds[pillarName]
    if (!pillarSlug) return ''
    return `${pillarSlug}--${toFolderSlug(subName)}`
  }

  function assetInSubPillar(assetId: string, pillarName: string, subName: string): boolean {
    const subId = getSubPillarFolderId(pillarName, subName)
    if (!subId) return false
    const folderId = getFolderId(assetId)
    if (!folderId) return false
    return folderId === subId || folderId.startsWith(subId + '--')
  }

  function getItemFolderId(pillarName: string, subName: string, itemName: string): string {
    const subId = getSubPillarFolderId(pillarName, subName)
    if (!subId) return ''
    return `${subId}--${toFolderSlug(itemName)}`
  }

  function assetInItem(assetId: string, pillarName: string, subName: string, itemName: string): boolean {
    const itemId = getItemFolderId(pillarName, subName, itemName)
    if (!itemId) return false
    const folderId = getFolderId(assetId)
    return folderId === itemId
  }

  function getPillarForAsset(assetId: string): string | null {
    for (const p of dynPillars) {
      if (assetInPillar(assetId, p)) return p
    }
    return null
  }

  function toggleSelect(asset: MediaAsset) {
    setSelectedMedia((prev) => {
      const exists = prev.find((a) => a.id === asset.id)
      if (exists) return prev.filter((a) => a.id !== asset.id)
      return [...prev, asset]
    })
  }

  function reorderMedia(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    setSelectedMedia((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Filtered asset grid
  // ---------------------------------------------------------------------------
  const pillarsWithMedia = dynPillars.filter((p) =>
    assets.some((a) => assetInPillar(a.id, p))
  )

  // Sub-pillars that have at least one asset assigned, for the active pillar filter
  const subPillarsWithMedia = pillarFilter
    ? (dynSubPillars[pillarFilter] ?? []).filter((s) =>
        assets.some((a) => assetInSubPillar(a.id, pillarFilter, s))
      )
    : []

  // Items that have at least one asset assigned, for the active sub-pillar filter
  const itemsWithMedia = (pillarFilter && subPillarFilter)
    ? (dynSubPillarItems[subPillarFilter] ?? []).filter((item) =>
        assets.some((a) => assetInItem(a.id, pillarFilter, subPillarFilter, item))
      )
    : []

  const filtered = assets.filter((a) => {
    if (pillarFilter && subPillarFilter && itemFilter) {
      if (!assetInItem(a.id, pillarFilter, subPillarFilter, itemFilter)) return false
    } else if (pillarFilter && subPillarFilter) {
      if (!assetInSubPillar(a.id, pillarFilter, subPillarFilter)) return false
    } else if (pillarFilter) {
      if (!assetInPillar(a.id, pillarFilter)) return false
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      const folderName = (getFolderId(a.id) ? (folderNameById[getFolderId(a.id)!] ?? '') : '').toLowerCase()
      if (!a.filename.toLowerCase().includes(q) && !folderName.includes(q)) return false
    }
    return true
  })

  // ---------------------------------------------------------------------------
  // Generate captions
  // ---------------------------------------------------------------------------
  async function generateCaption() {
    setGenerating(true)
    setGenError(null)

    const supabase = createClient()
    const imageUrls = selectedMedia
      .filter((a) => a.file_type.startsWith('image/') && !['image/heic', 'image/heif'].includes(a.file_type.toLowerCase()))
      .map((a) => supabase.storage.from('media').getPublicUrl(a.storage_path).data.publicUrl)

    try {
      const res = await fetch('/api/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls,
          pillar: [pillar, subPillar, subPillarItem].filter(Boolean).join(' > '),
          format,
          topic,
          notes,
          approvedExamples: loadApprovedExamples(),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Generation failed.')
      }
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let raw = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        raw += decoder.decode(value, { stream: true })
      }

      const jsonStart = raw.indexOf('{')
      const jsonEnd = raw.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('Unexpected response format.')
      const data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
        option1?: string; option2?: string
        hashtags?: string[]; shot_ideas?: string[]
      }

      if (data.option1) setCaption1(data.option1)
      if (data.option2) setCaption2(data.option2)
      if (data.hashtags?.length) {
        const tags = data.hashtags.slice(0, 4)
        while (tags.length < 4) tags.push('')
        setHashtags(tags)
      }
      if (data.shot_ideas?.length) {
        const shots = data.shot_ideas.slice(0, 3)
        while (shots.length < 3) shots.push('')
        setShotIdeas(shots)
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setGenerating(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Refine
  // ---------------------------------------------------------------------------
  async function refineCaption(opt: 1 | 2) {
    const captionText = opt === 1 ? caption1 : caption2
    const instruction = refineText[opt]
    if (!captionText.trim() || !instruction.trim()) return

    setRefining(opt)
    setRefineError(null)

    try {
      const res = await fetch('/api/refine-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: captionText,
          platform: opt === 1 ? 'Instagram / Facebook' : 'TikTok',
          instruction,
          approvedExamples: loadApprovedExamples(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Refinement failed.')
      }
      const revised = await res.text()
      if (opt === 1) setCaption1(revised.trim())
      else setCaption2(revised.trim())
      setRefineText((prev) => ({ ...prev, [opt]: '' }))
      setShowRefine((prev) => ({ ...prev, [opt]: false }))
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setRefining(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  async function handleSave(status: Status, approval?: 'review' | 'approved') {
    if (!title || !pillar) {
      setSaveError('Title and pillar are required.')
      return
    }

    setSaving(true)
    setSaveError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? 'dev'

    const payload: PostInsert = {
      user_id: userId,
      title,
      pillar,
      topic: topic || null,
      format,
      caption_option1: caption1 || null,
      caption_option2: caption2 || null,
      hashtags: hashtags.filter(Boolean),
      shot_ideas: shotIdeas.filter(Boolean),
      status,
      scheduled_date: null,
      notes: notes || null,
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert(payload)
      .select()
      .single()

    if (postError || !post) {
      setSaveError(postError?.message ?? 'Failed to save post.')
      setSaving(false)
      return
    }

    // Save media association
    if (selectedMedia.length > 0) {
      try {
        const raw = localStorage.getItem(LS_POST_MEDIA_KEY)
        const store: Record<string, string[]> = raw ? JSON.parse(raw) : {}
        store[post.id] = selectedMedia.map((m) => m.id)
        localStorage.setItem(LS_POST_MEDIA_KEY, JSON.stringify(store))
      } catch {}
    }

    // Save approval state
    if (approval) {
      try {
        const reviewSet  = new Set<string>(JSON.parse(localStorage.getItem(REVIEW_KEY) ?? '[]'))
        const approvedSet = new Set<string>(JSON.parse(localStorage.getItem(APPROVED_KEY) ?? '[]'))
        if (approval === 'review') { reviewSet.add(post.id); approvedSet.delete(post.id) }
        else {
          approvedSet.add(post.id); reviewSet.delete(post.id)
          if (caption1.trim()) saveApprovedExample(caption1.trim())
          if (caption2.trim()) saveApprovedExample(caption2.trim())
        }
        localStorage.setItem(REVIEW_KEY, JSON.stringify([...reviewSet]))
        localStorage.setItem(APPROVED_KEY, JSON.stringify([...approvedSet]))
      } catch {}
    }

    setSaved(true)
    setTimeout(() => router.push('/content-bank'), 800)
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const pillarColor = pillar ? (PILLAR_COLORS[pillar] ?? 'bg-stone-100 text-stone-600') : ''
  const hasCaption = caption1.trim() || caption2.trim()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Quick Post</h1>
            <p className="text-stone-500 text-sm mt-0.5">Pick photos from your Media Bank and build a post around them.</p>
          </div>
          {saved && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium bg-emerald-50 px-3 py-2 rounded-lg">
              <CheckIcon className="w-4 h-4" />
              Saved. Redirecting...
            </div>
          )}
        </div>
      </div>

      <div className="page-content">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* ----------------------------------------------------------------
              LEFT — Media browser (3/5)
          ---------------------------------------------------------------- */}
          <div className="lg:col-span-3 space-y-4">
            {/* Search + pillar filters */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search media..."
                    className="input pl-9 text-sm"
                  />
                </div>
                {selectedMedia.length > 0 && (
                  <button
                    onClick={() => setSelectedMedia([])}
                    className="text-xs text-stone-500 hover:text-red-500 transition-colors whitespace-nowrap"
                  >
                    Clear {selectedMedia.length} selected
                  </button>
                )}
              </div>

              {pillarsWithMedia.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Breadcrumb back button */}
                  {pillarFilter && (
                    <button
                      onClick={() => {
                        if (itemFilter) { setItemFilter(null) }
                        else if (subPillarFilter) { setSubPillarFilter(null) }
                        else { setPillarFilter(null) }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-stone-400 hover:text-stone-600 border border-stone-200 hover:border-stone-300 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      {itemFilter ? subPillarFilter : subPillarFilter ? pillarFilter : 'All'}
                    </button>
                  )}

                  {/* Current level label */}
                  {(subPillarFilter || pillarFilter) && (
                    <span className="text-xs text-stone-300 select-none">/</span>
                  )}

                  {/* Pills — show the deepest active level */}
                  {!pillarFilter && pillarsWithMedia.map((p) => (
                    <button key={p}
                      onClick={() => { setPillarFilter(p); setSubPillarFilter(null); setItemFilter(null) }}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white text-stone-500 border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-colors"
                    >{p}</button>
                  ))}

                  {pillarFilter && !subPillarFilter && subPillarsWithMedia.length > 0 && subPillarsWithMedia.map((s) => (
                    <button key={s}
                      onClick={() => { setSubPillarFilter(s); setItemFilter(null) }}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white text-stone-500 border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-colors"
                    >{s}</button>
                  ))}

                  {pillarFilter && !subPillarFilter && subPillarsWithMedia.length === 0 && pillarsWithMedia.map((p) => (
                    <button key={p}
                      onClick={() => { setPillarFilter(p); setSubPillarFilter(null); setItemFilter(null) }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        pillarFilter === p ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
                      }`}
                    >{p}</button>
                  ))}

                  {subPillarFilter && !itemFilter && itemsWithMedia.length > 0 && itemsWithMedia.map((item) => (
                    <button key={item}
                      onClick={() => setItemFilter(item)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white text-stone-500 border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-colors"
                    >{item}</button>
                  ))}

                  {subPillarFilter && !itemFilter && itemsWithMedia.length === 0 && subPillarsWithMedia.map((s) => (
                    <button key={s}
                      onClick={() => { setSubPillarFilter(s); setItemFilter(null) }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        subPillarFilter === s ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
                      }`}
                    >{s}</button>
                  ))}

                  {/* Active selection badge */}
                  {(itemFilter || (subPillarFilter && itemsWithMedia.length === 0) || (pillarFilter && subPillarsWithMedia.length === 0 && !subPillarFilter)) && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-stone-800 text-white">
                      {itemFilter ?? subPillarFilter ?? pillarFilter}
                      <button
                        onClick={() => {
                          if (itemFilter) setItemFilter(null)
                          else if (subPillarFilter) setSubPillarFilter(null)
                          else setPillarFilter(null)
                        }}
                        className="ml-0.5 hover:text-stone-300"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Asset grid */}
            <div className="card p-4">
              {loadingAssets ? (
                <div className="text-center py-12 text-stone-400 text-sm">Loading media...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-stone-400 text-sm">No media found.</p>
                  <a href="/media-bank" className="text-xs text-ember-600 hover:text-ember-700 font-medium mt-1 inline-block">
                    Upload in Media Bank
                  </a>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {filtered.map((asset) => {
                    const isSelected = selectedMedia.some((a) => a.id === asset.id)
                    const order = isSelected ? selectedMedia.findIndex((a) => a.id === asset.id) + 1 : null
                    const canPreview = asset.file_type.startsWith('image/')
                    const supabase = createClient()
                    const url = canPreview
                      ? supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl
                      : null
                    const assetPillar = getPillarForAsset(asset.id)
                    const color = assetPillar ? (PILLAR_COLORS[assetPillar] ?? '') : ''

                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => toggleSelect(asset)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected
                            ? 'border-ember-500 ring-2 ring-ember-200'
                            : 'border-transparent hover:border-stone-300'
                        }`}
                      >
                        {url ? (
                          <img
                            src={url}
                            alt={asset.filename}
                            draggable={false}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-stone-100 flex items-center justify-center">
                            <VideoIcon className="w-6 h-6 text-stone-400" />
                          </div>
                        )}

                        {/* Pillar badge */}
                        {assetPillar && !isSelected && (
                          <div className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium leading-tight ${color}`}>
                            {assetPillar.split(' ')[0]}
                          </div>
                        )}

                        {/* Selection number */}
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-ember-600 text-white text-xs font-bold flex items-center justify-center shadow">
                            {order}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ----------------------------------------------------------------
              RIGHT — Post builder (2/5)
          ---------------------------------------------------------------- */}
          <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-6">

            {/* Selected photos (reorderable) */}
            {selectedMedia.length > 0 && (
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-900">Selected ({selectedMedia.length})</h3>
                  <p className="text-xs text-stone-400">Drag to reorder</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedMedia.map((asset, idx) => {
                    const supabase = createClient()
                    const canPreview = asset.file_type.startsWith('image/')
                    const url = canPreview
                      ? supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl
                      : null

                    return (
                      <div
                        key={asset.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          dragIndexRef.current = idx
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIndexRef.current !== null) {
                            reorderMedia(dragIndexRef.current, idx)
                            dragIndexRef.current = null
                          }
                        }}
                        className="relative w-14 h-14 rounded-lg overflow-hidden border border-stone-200 cursor-grab active:cursor-grabbing group"
                      >
                        {url ? (
                          <img src={url} alt={asset.filename} draggable={false} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-stone-100 flex items-center justify-center">
                            <VideoIcon className="w-4 h-4 text-stone-400" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        <div className="absolute top-0.5 right-0.5 w-4.5 h-4.5 rounded-full bg-ember-600 text-white text-xs font-bold flex items-center justify-center" style={{ width: 18, height: 18, fontSize: 10 }}>
                          {idx + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedMedia((prev) => prev.filter((a) => a.id !== asset.id))}
                          className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <CloseIcon className="w-2.5 h-2.5 text-stone-700" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Post details */}
            <div className="card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-stone-900">Post Details</h3>

              {saveError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                  {saveError}
                </div>
              )}

              <div>
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Arugula prosciutto at the Henderson wedding"
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="label">
                  Pillar <span className="text-red-500">*</span>
                  {pillar && selectedMedia.length > 0 && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-normal ${pillarColor}`}>
                      auto-detected
                    </span>
                  )}
                </label>
                <div className="relative">
                  <select
                    value={pillar}
                    onChange={(e) => { setPillar(e.target.value); setSubPillar(''); setSubPillarItem('') }}
                    className="select text-sm pr-8"
                  >
                    <option value="">Select a pillar</option>
                    {dynPillars.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                </div>

                {/* Sub-pillar */}
                {pillar && (dynSubPillars[pillar] ?? []).length > 0 && (
                  <div className="mt-2 relative">
                    <select
                      value={subPillar}
                      onChange={(e) => { setSubPillar(e.target.value); setSubPillarItem('') }}
                      className="select text-sm pr-8"
                    >
                      <option value="">Sub-pillar (optional)</option>
                      {(dynSubPillars[pillar] ?? []).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                )}

                {/* Item */}
                {subPillar && (dynSubPillarItems[subPillar] ?? []).length > 0 && (
                  <div className="mt-2 relative">
                    <select
                      value={subPillarItem}
                      onChange={(e) => setSubPillarItem(e.target.value)}
                      className="select text-sm pr-8"
                    >
                      <option value="">Item (optional)</option>
                      {(dynSubPillarItems[subPillar] ?? []).map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                )}
              </div>

              <div>
                <label className="label">Format</label>
                <div className="flex gap-2">
                  {FORMATS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f as Format)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        format === f
                          ? 'bg-ember-600 text-white border-ember-600'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Wedding reception, backyard build-your-own"
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="label">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Photographer, couple's names, venue..."
                  className="input text-sm"
                />
              </div>
            </div>

            {/* Generate */}
            <div className="card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-900">Generate with AI</h3>
                {hasCaption && (
                  <button
                    type="button"
                    onClick={generateCaption}
                    disabled={generating}
                    className="text-xs text-ember-600 hover:text-ember-700 font-medium disabled:opacity-40"
                  >
                    Regenerate
                  </button>
                )}
              </div>

              {genError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                  {genError}
                </div>
              )}

              {!hasCaption && (
                <button
                  type="button"
                  onClick={generateCaption}
                  disabled={generating || !pillar}
                  className="btn-primary w-full text-sm disabled:opacity-40"
                >
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <SpinnerIcon className="w-4 h-4 animate-spin" />
                      Writing captions...
                    </span>
                  ) : (
                    'Generate Captions'
                  )}
                </button>
              )}

              {generating && hasCaption && (
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                  Rewriting...
                </div>
              )}

              {/* Caption 1 */}
              {(caption1 || generating) && (
                <div className="space-y-2">
                  <label className="label">Instagram / Facebook</label>
                  <textarea
                    value={caption1}
                    onChange={(e) => setCaption1(e.target.value)}
                    rows={4}
                    className="input text-sm resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRefine((v) => ({ ...v, 1: !v[1] }))}
                      className="text-xs text-stone-500 hover:text-stone-700 font-medium"
                    >
                      {showRefine[1] ? 'Cancel' : 'Refine'}
                    </button>
                  </div>
                  {showRefine[1] && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={refineText[1]}
                        onChange={(e) => setRefineText((v) => ({ ...v, 1: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && refineCaption(1)}
                        placeholder="e.g. shorter hook, mention the couple..."
                        className="input text-xs flex-1"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => refineCaption(1)}
                        disabled={refining === 1 || !refineText[1].trim()}
                        className="btn-primary text-xs px-3 disabled:opacity-40"
                      >
                        {refining === 1 ? '...' : 'Go'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Caption 2 */}
              {(caption2 || generating) && (
                <div className="space-y-2">
                  <label className="label">TikTok</label>
                  <textarea
                    value={caption2}
                    onChange={(e) => setCaption2(e.target.value)}
                    rows={3}
                    className="input text-sm resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRefine((v) => ({ ...v, 2: !v[2] }))}
                      className="text-xs text-stone-500 hover:text-stone-700 font-medium"
                    >
                      {showRefine[2] ? 'Cancel' : 'Refine'}
                    </button>
                  </div>
                  {showRefine[2] && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={refineText[2]}
                        onChange={(e) => setRefineText((v) => ({ ...v, 2: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && refineCaption(2)}
                        placeholder="e.g. punchier, add an emoji..."
                        className="input text-xs flex-1"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => refineCaption(2)}
                        disabled={refining === 2 || !refineText[2].trim()}
                        className="btn-primary text-xs px-3 disabled:opacity-40"
                      >
                        {refining === 2 ? '...' : 'Go'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {refineError && (
                <p className="text-xs text-red-600">{refineError}</p>
              )}

              {/* Hashtags */}
              {hashtags.some(Boolean) && (
                <div>
                  <label className="label">Hashtags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.filter(Boolean).map((tag, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Shot ideas */}
              {shotIdeas.some(Boolean) && (
                <div>
                  <label className="label">Shot Ideas</label>
                  <ul className="space-y-1">
                    {shotIdeas.filter(Boolean).map((idea, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-stone-600">
                        <span className="mt-0.5 w-4 h-4 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center flex-shrink-0 font-medium">{i + 1}</span>
                        {idea}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Save actions */}
            <div className="card p-4 space-y-2">
              <button
                type="button"
                onClick={() => handleSave('draft', 'approved')}
                disabled={saving || !title || !pillar}
                className="btn-primary w-full text-sm disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Approve & Save'}
              </button>
              <button
                type="button"
                onClick={() => handleSave('draft', 'review')}
                disabled={saving || !title || !pillar}
                className="btn-secondary w-full text-sm disabled:opacity-40"
              >
                Submit for Review
              </button>
              <button
                type="button"
                onClick={() => handleSave('draft')}
                disabled={saving || !title || !pillar}
                className="w-full py-2 rounded-lg text-sm font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 border border-transparent hover:border-stone-200 transition-colors disabled:opacity-40"
              >
                Save as Draft
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  )
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55-2.27A1 1 0 0121 8.72v6.56a1 1 0 01-1.45.9L15 14M4 8h7a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4a2 2 0 012-2z" />
    </svg>
  )
}
function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
    </svg>
  )
}
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
