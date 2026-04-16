'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PILLARS, FORMATS, PILLAR_COLORS, HASHTAG_POOL,
  PILLAR_FOLDER_IDS, PILLAR_SUBFOLDER_IDS,
} from '@/lib/constants'
import { getDynamicPillarData, toFolderSlug } from '@/lib/pillar-utils'
import type { MediaAsset, PostInsert } from '@/lib/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Format = 'Reel' | 'Carousel' | 'Photo'
type Status = 'draft' | 'scheduled' | 'published'
type PreviewPlatform = 'instagram' | 'facebook' | 'tiktok'

const LS_EXAMPLES_KEY = 'fireova_approved_examples'
const REVIEW_KEY      = 'fireova_review_posts'
const APPROVED_KEY    = 'fireova_approved_posts'

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
export default function NewPostPage() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())

  // Media browser
  const [assets, setAssets]           = useState<MediaAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [pillarFilter, setPillarFilter] = useState<string | null>(null)
  const [subPillarFilter, setSubPillarFilter] = useState<string | null>(null)
  const [itemFilter, setItemFilter]   = useState<string | null>(null)
  const [dynPillars, setDynPillars]   = useState<string[]>([...PILLARS])
  const [dynPillarFolderIds, setDynPillarFolderIds] = useState<Record<string, string>>(PILLAR_FOLDER_IDS)
  const [dynPillarSubfolderIds, setDynPillarSubfolderIds] = useState<Record<string, string[]>>(PILLAR_SUBFOLDER_IDS)
  const [dynSubPillars, setDynSubPillars] = useState<Record<string, string[]>>({})
  const [dynSubPillarItems, setDynSubPillarItems] = useState<Record<string, string[]>>({})

  // Selection + reordering
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset[]>([])
  const dragIndexRef = useRef<number | null>(null)

  // Post form
  const [title, setTitle]         = useState('')
  const [pillar, setPillar]       = useState('')
  const [subPillar, setSubPillar] = useState('')
  const [subPillarItem, setSubPillarItem] = useState('')
  const [format, setFormat]       = useState<Format>('Reel')
  const [topic, setTopic]         = useState('')
  const [notes, setNotes]         = useState('')
  const [caption1, setCaption1]   = useState('')
  const [caption2, setCaption2]   = useState('')
  const [hashtags, setHashtags]   = useState(['', '', '', ''])
  const [shotIdeas, setShotIdeas] = useState(['', '', ''])

  // Generation / refinement
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState<string | null>(null)
  const [showRefine, setShowRefine] = useState<Record<1|2, boolean>>({ 1: false, 2: false })
  const [refineText, setRefineText] = useState<Record<1|2, string>>({ 1: '', 2: '' })
  const [refining, setRefining]     = useState<1|2|null>(null)
  const [refineError, setRefineError] = useState<string | null>(null)

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPlatform, setPreviewPlatform] = useState<PreviewPlatform>('instagram')

  // Save
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved]       = useState(false)

  // ---------------------------------------------------------------------------
  // Load assets + pillar data
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const d = getDynamicPillarData()
      setDynPillars(d.pillars)
      setDynPillarFolderIds(d.pillarFolderIds)
      setDynPillarSubfolderIds(d.pillarSubfolderIds)
      setDynSubPillars(d.subPillars)
      setDynSubPillarItems(d.subPillarItems)
    } catch {}

    supabaseRef.current
      .from('media_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setAssets(data ?? [])
        setLoadingAssets(false)
      })
  }, [])

  // Auto-detect pillar from selected media
  useEffect(() => {
    if (selectedMedia.length === 0 || pillar) return
    const pillarCounts: Record<string, number> = {}
    for (const asset of selectedMedia) {
      const folderId = asset.folder_id ?? null
      if (!folderId) continue
      for (const p of dynPillars) {
        const rootId = dynPillarFolderIds[p]
        if (!rootId) continue
        if (folderId === rootId || (dynPillarSubfolderIds[rootId] ?? []).includes(folderId)) {
          pillarCounts[p] = (pillarCounts[p] ?? 0) + 1
        }
      }
    }
    const best = Object.entries(pillarCounts).sort((a, b) => b[1] - a[1])[0]
    if (best) { setPillar(best[0]); setSubPillar(''); setSubPillarItem('') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMedia])

  // ---------------------------------------------------------------------------
  // Media browser helpers
  // ---------------------------------------------------------------------------
  function getFolderId(assetId: string): string | null {
    return assets.find((a) => a.id === assetId)?.folder_id ?? null
  }
  function assetInPillar(assetId: string, p: string): boolean {
    const rootId = dynPillarFolderIds[p]
    if (!rootId) return false
    const folderId = getFolderId(assetId)
    if (!folderId) return false
    return folderId === rootId || (dynPillarSubfolderIds[rootId] ?? []).includes(folderId)
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
    return getFolderId(assetId) === itemId
  }
  function getPillarForAsset(assetId: string): string | null {
    for (const p of dynPillars) { if (assetInPillar(assetId, p)) return p }
    return null
  }
  function toggleSelect(asset: MediaAsset) {
    setSelectedMedia((prev) =>
      prev.find((a) => a.id === asset.id) ? prev.filter((a) => a.id !== asset.id) : [...prev, asset]
    )
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
  const subPillarsForPillar = pillarFilter ? (dynSubPillars[pillarFilter] ?? []) : []
  const itemsForSubPillar   = (pillarFilter && subPillarFilter) ? (dynSubPillarItems[subPillarFilter] ?? []) : []
  const filtered = !pillarFilter ? [] : assets.filter((a) => {
    if (pillarFilter && subPillarFilter && itemFilter)
      return assetInItem(a.id, pillarFilter, subPillarFilter, itemFilter)
    if (pillarFilter && subPillarFilter)
      return assetInSubPillar(a.id, pillarFilter, subPillarFilter)
    return assetInPillar(a.id, pillarFilter)
  })

  // ---------------------------------------------------------------------------
  // Generate captions
  // ---------------------------------------------------------------------------
  async function generateCaption() {
    setGenerating(true)
    setGenError(null)
    const imageUrls = selectedMedia
      .filter((a) => a.file_type.startsWith('image/') && !['image/heic', 'image/heif'].includes(a.file_type.toLowerCase()))
      .map((a) => supabaseRef.current.storage.from('media').getPublicUrl(a.storage_path, {
        transform: { width: 800, quality: 75 },
      }).data.publicUrl)
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
      const jsonEnd   = raw.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('Unexpected response format.')
      const data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
        option1?: string; option2?: string; hashtags?: string[]; shot_ideas?: string[]
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
    if (!title || !pillar) { setSaveError('Title and pillar are required.'); return }
    setSaving(true)
    setSaveError(null)
    const supabase = supabaseRef.current
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
    const { data: post, error: postError } = await supabase.from('posts').insert(payload).select().single()
    if (postError || !post) {
      setSaveError(postError?.message ?? 'Failed to save post.')
      setSaving(false)
      return
    }
    if (selectedMedia.length > 0) {
      try {
        await supabase.from('post_media').insert(
          selectedMedia.map((m, i) => ({ post_id: post.id, asset_id: m.id, display_order: i }))
        )
      } catch {}
    }
    if (approval) {
      try {
        const reviewSet   = new Set<string>(JSON.parse(localStorage.getItem(REVIEW_KEY) ?? '[]'))
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
  // Hashtag helpers
  // ---------------------------------------------------------------------------
  const usedHashtags = new Set(hashtags.filter(Boolean))
  function addHashtagFromPool(tag: string) {
    const emptyIdx = hashtags.findIndex((h) => h === '')
    if (emptyIdx === -1) return
    const next = [...hashtags]
    next[emptyIdx] = tag
    setHashtags(next)
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const pillarColor = pillar ? (PILLAR_COLORS[pillar] ?? 'bg-stone-100 text-stone-600') : ''
  const hasCaption  = caption1.trim() || caption2.trim()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">New Post</h1>
            <p className="text-stone-500 text-sm mt-0.5">Pick photos, generate captions, and save to your Content Bank.</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium bg-emerald-50 px-3 py-2 rounded-lg">
                <CheckIcon className="w-4 h-4" />
                Saved. Redirecting...
              </div>
            )}
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                previewOpen
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              <EyeIcon className="w-4 h-4" />
              Preview
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* ----------------------------------------------------------------
              LEFT — Media browser (3/5)
          ---------------------------------------------------------------- */}
          <div className="lg:col-span-3 space-y-4">
            {/* Pillar drill-down filters */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Browse by folder</p>
                {selectedMedia.length > 0 && (
                  <button
                    onClick={() => setSelectedMedia([])}
                    className="text-xs text-stone-500 hover:text-red-500 transition-colors"
                  >
                    Clear {selectedMedia.length} selected
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {pillarFilter && (
                  <button
                    onClick={() => {
                      if (itemFilter) setItemFilter(null)
                      else if (subPillarFilter) setSubPillarFilter(null)
                      else setPillarFilter(null)
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-stone-400 hover:text-stone-600 border border-stone-200 hover:border-stone-300 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    {itemFilter ? subPillarFilter : subPillarFilter ? pillarFilter : 'All'}
                  </button>
                )}
                {(subPillarFilter || pillarFilter) && (
                  <span className="text-xs text-stone-300 select-none">/</span>
                )}

                {!pillarFilter && dynPillars.map((p) => (
                  <button key={p}
                    onClick={() => { setPillarFilter(p); setSubPillarFilter(null); setItemFilter(null) }}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white text-stone-500 border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-colors"
                  >{p}</button>
                ))}
                {pillarFilter && !subPillarFilter && subPillarsForPillar.map((s) => (
                  <button key={s}
                    onClick={() => { setSubPillarFilter(s); setItemFilter(null) }}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white text-stone-500 border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-colors"
                  >{s}</button>
                ))}
                {subPillarFilter && !itemFilter && itemsForSubPillar.map((item) => (
                  <button key={item}
                    onClick={() => setItemFilter(item)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border bg-white text-stone-500 border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-colors"
                  >{item}</button>
                ))}
                {(itemFilter || (subPillarFilter && itemsForSubPillar.length === 0) || (pillarFilter && subPillarsForPillar.length === 0 && !subPillarFilter)) && (
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
            </div>

            {/* Asset grid */}
            <div className="card p-4">
              {loadingAssets ? (
                <div className="text-center py-12 text-stone-400 text-sm">Loading media...</div>
              ) : !pillarFilter ? (
                <div className="text-center py-10">
                  <p className="text-stone-400 text-sm">Pick a pillar above to browse photos.</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-stone-400 text-sm">No media in this folder yet.</p>
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
                    const url = canPreview
                      ? supabaseRef.current.storage.from('media').getPublicUrl(asset.storage_path, {
                          transform: { width: 200, height: 200, resize: 'cover' },
                        }).data.publicUrl
                      : null
                    const assetPillar = getPillarForAsset(asset.id)
                    const color = assetPillar ? (PILLAR_COLORS[assetPillar] ?? '') : ''
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => toggleSelect(asset)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected ? 'border-ember-500 ring-2 ring-ember-200' : 'border-transparent hover:border-stone-300'
                        }`}
                      >
                        {url ? (
                          <img src={url} alt={asset.filename} draggable={false} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-stone-100 flex items-center justify-center">
                            <VideoIcon className="w-6 h-6 text-stone-400" />
                          </div>
                        )}
                        {assetPillar && !isSelected && (
                          <div className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium leading-tight ${color}`}>
                            {assetPillar.split(' ')[0]}
                          </div>
                        )}
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

            {/* Selected photos */}
            {selectedMedia.length > 0 && (
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-900">Selected ({selectedMedia.length})</h3>
                  <p className="text-xs text-stone-400">Drag to reorder</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedMedia.map((asset, idx) => {
                    const url = asset.file_type.startsWith('image/')
                      ? supabaseRef.current.storage.from('media').getPublicUrl(asset.storage_path, {
                          transform: { width: 120, height: 120, resize: 'cover' },
                        }).data.publicUrl
                      : null
                    return (
                      <div
                        key={asset.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; dragIndexRef.current = idx }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => { if (dragIndexRef.current !== null) { reorderMedia(dragIndexRef.current, idx); dragIndexRef.current = null } }}
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
                          <CloseSmIcon className="w-2.5 h-2.5 text-stone-700" />
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
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{saveError}</div>
              )}
              <div>
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Arugula prosciutto at the Henderson wedding" className="input text-sm" />
              </div>
              <div>
                <label className="label">
                  Pillar <span className="text-red-500">*</span>
                  {pillar && selectedMedia.length > 0 && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-normal ${pillarColor}`}>auto-detected</span>
                  )}
                </label>
                <div className="relative">
                  <select value={pillar} onChange={(e) => { setPillar(e.target.value); setSubPillar(''); setSubPillarItem('') }} className="select text-sm pr-8">
                    <option value="">Select a pillar</option>
                    {dynPillars.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                </div>
                {pillar && (dynSubPillars[pillar] ?? []).length > 0 && (
                  <div className="mt-2 relative">
                    <select value={subPillar} onChange={(e) => { setSubPillar(e.target.value); setSubPillarItem('') }} className="select text-sm pr-8">
                      <option value="">Sub-pillar (optional)</option>
                      {(dynSubPillars[pillar] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                )}
                {subPillar && (dynSubPillarItems[subPillar] ?? []).length > 0 && (
                  <div className="mt-2 relative">
                    <select value={subPillarItem} onChange={(e) => setSubPillarItem(e.target.value)} className="select text-sm pr-8">
                      <option value="">Item (optional)</option>
                      {(dynSubPillarItems[subPillar] ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                )}
              </div>
              <div>
                <label className="label">Format</label>
                <div className="flex gap-2">
                  {FORMATS.map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f as Format)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        format === f ? 'bg-ember-600 text-white border-ember-600' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                      }`}
                    >{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Topic</label>
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Wedding reception, backyard build-your-own" className="input text-sm" />
              </div>
              <div>
                <label className="label">Notes</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Photographer, couple's names, venue..." className="input text-sm" />
              </div>
            </div>

            {/* Generate */}
            <div className="card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-900">Generate with AI</h3>
                {hasCaption && (
                  <button type="button" onClick={generateCaption} disabled={generating}
                    className="text-xs text-ember-600 hover:text-ember-700 font-medium disabled:opacity-40">
                    Regenerate
                  </button>
                )}
              </div>
              {genError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{genError}</div>
              )}
              {!hasCaption && (
                <button type="button" onClick={generateCaption} disabled={generating || !pillar}
                  className="btn-primary w-full text-sm disabled:opacity-40">
                  {generating ? (
                    <span className="flex items-center justify-center gap-2">
                      <SpinnerIcon className="w-4 h-4 animate-spin" />
                      Writing captions...
                    </span>
                  ) : 'Generate Captions'}
                </button>
              )}
              {generating && hasCaption && (
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                  Rewriting...
                </div>
              )}

              {/* Caption 1 — Instagram / Facebook */}
              {(caption1 || generating) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">Instagram / Facebook</label>
                    <span className="text-xs text-stone-400">{caption1.length}</span>
                  </div>
                  <textarea value={caption1} onChange={(e) => setCaption1(e.target.value)} rows={4} className="input text-sm resize-none" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShowRefine((v) => ({ ...v, 1: !v[1] }))}
                      className="text-xs text-stone-500 hover:text-stone-700 font-medium">
                      {showRefine[1] ? 'Cancel' : 'Refine'}
                    </button>
                  </div>
                  {showRefine[1] && (
                    <div className="flex gap-2">
                      <input type="text" value={refineText[1]} onChange={(e) => setRefineText((v) => ({ ...v, 1: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && refineCaption(1)}
                        placeholder="e.g. shorter hook, mention the couple..." className="input text-xs flex-1" autoFocus />
                      <button type="button" onClick={() => refineCaption(1)} disabled={refining === 1 || !refineText[1].trim()}
                        className="btn-primary text-xs px-3 disabled:opacity-40">
                        {refining === 1 ? '...' : 'Go'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Caption 2 — TikTok */}
              {(caption2 || generating) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">TikTok</label>
                    <span className="text-xs text-stone-400">{caption2.length}</span>
                  </div>
                  <textarea value={caption2} onChange={(e) => setCaption2(e.target.value)} rows={3} className="input text-sm resize-none" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShowRefine((v) => ({ ...v, 2: !v[2] }))}
                      className="text-xs text-stone-500 hover:text-stone-700 font-medium">
                      {showRefine[2] ? 'Cancel' : 'Refine'}
                    </button>
                  </div>
                  {showRefine[2] && (
                    <div className="flex gap-2">
                      <input type="text" value={refineText[2]} onChange={(e) => setRefineText((v) => ({ ...v, 2: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && refineCaption(2)}
                        placeholder="e.g. punchier, add an emoji..." className="input text-xs flex-1" autoFocus />
                      <button type="button" onClick={() => refineCaption(2)} disabled={refining === 2 || !refineText[2].trim()}
                        className="btn-primary text-xs px-3 disabled:opacity-40">
                        {refining === 2 ? '...' : 'Go'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {refineError && <p className="text-xs text-red-600">{refineError}</p>}
            </div>

            {/* Hashtags */}
            <div className="card p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Hashtags</h3>
                <p className="text-xs text-stone-400 mt-0.5">Exactly 4 per post.</p>
              </div>
              <div className="space-y-2">
                {hashtags.map((tag, i) => (
                  <input key={i} type="text" value={tag} onChange={(e) => {
                    const next = [...hashtags]; next[i] = e.target.value; setHashtags(next)
                  }} placeholder={`Hashtag ${i + 1}`} className="input text-xs" />
                ))}
              </div>
              <div>
                <p className="text-xs text-stone-400 mb-1.5">Quick add:</p>
                <div className="flex flex-wrap gap-1.5">
                  {HASHTAG_POOL.map((tag) => (
                    <button key={tag} type="button" onClick={() => addHashtagFromPool(tag)} disabled={usedHashtags.has(tag)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                        usedHashtags.has(tag)
                          ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-default'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-ember-400 hover:text-ember-700'
                      }`}
                    >{tag}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Shot Ideas */}
            <div className="card p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Shot Ideas</h3>
                <p className="text-xs text-stone-400 mt-0.5">3 specific ideas for this post.</p>
              </div>
              {shotIdeas.map((idea, i) => (
                <div key={i}>
                  <label className="text-xs text-stone-400 mb-1 block">Shot {i + 1}</label>
                  <input type="text" value={idea} onChange={(e) => {
                    const next = [...shotIdeas]; next[i] = e.target.value; setShotIdeas(next)
                  }}
                  placeholder={i === 0 ? 'Close-up of dough stretching over the peel' : i === 1 ? 'Wide shot of guests gathered around the oven' : 'Overhead of the finished pizza coming out'}
                  className="input text-xs" />
                </div>
              ))}
            </div>

            {/* Save actions */}
            <div className="card p-4 space-y-2">
              <button type="button" onClick={() => handleSave('draft', 'approved')}
                disabled={saving || !title || !pillar} className="btn-primary w-full text-sm disabled:opacity-40">
                {saving ? 'Saving...' : 'Approve & Save'}
              </button>
              <button type="button" onClick={() => handleSave('draft', 'review')}
                disabled={saving || !title || !pillar} className="btn-secondary w-full text-sm disabled:opacity-40">
                Submit for Review
              </button>
              <button type="button" onClick={() => handleSave('draft')}
                disabled={saving || !title || !pillar}
                className="w-full py-2 rounded-lg text-sm font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 border border-transparent hover:border-stone-200 transition-colors disabled:opacity-40">
                Save as Draft
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Preview drawer */}
      <div className={`fixed top-0 right-0 h-screen w-[360px] z-40 bg-white border-l border-stone-200 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
        previewOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 flex-shrink-0">
          <span className="text-sm font-semibold text-stone-900">Post Preview</span>
          <button onClick={() => setPreviewOpen(false)}
            className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 transition-colors">
            <CloseSmIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <PostPreview
            platform={previewPlatform}
            onPlatformChange={setPreviewPlatform}
            caption={previewPlatform === 'tiktok' ? caption2 || caption1 || '' : caption1 || caption2 || ''}
            hashtags={hashtags.filter(Boolean)}
            title={title}
            media={selectedMedia}
            supabase={supabaseRef.current}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Post Preview
// ---------------------------------------------------------------------------
function PostPreview({
  platform, onPlatformChange, caption, hashtags, title, media, supabase,
}: {
  platform: PreviewPlatform
  onPlatformChange: (p: PreviewPlatform) => void
  caption: string
  hashtags: string[]
  title: string
  media: MediaAsset[]
  supabase: ReturnType<typeof createClient>
}) {
  const firstImage = media.find((a) => a.file_type.startsWith('image/') && !['image/heic','image/heif'].includes(a.file_type.toLowerCase()))
  const firstVideo = media.find((a) => a.file_type.startsWith('video/'))
  const previewAsset = firstImage ?? firstVideo ?? null
  const previewUrl   = previewAsset ? supabase.storage.from('media').getPublicUrl(previewAsset.storage_path).data.publicUrl : null
  const displayCaption = caption || (title ? `${title}...` : 'Your caption will appear here.')
  const hashtagStr = hashtags.join(' ')
  const platforms: { id: PreviewPlatform; label: string }[] = [
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook',  label: 'Facebook'  },
    { id: 'tiktok',    label: 'TikTok'    },
  ]
  return (
    <div className="space-y-3">
      <div className="flex rounded-xl overflow-hidden border border-stone-200 bg-stone-50">
        {platforms.map((p) => (
          <button key={p.id} onClick={() => onPlatformChange(p.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              platform === p.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
            }`}>{p.label}</button>
        ))}
      </div>
      {platform === 'instagram' && <InstagramPreview previewUrl={previewUrl} caption={displayCaption} hashtags={hashtagStr} isVideo={!!firstVideo && !firstImage} />}
      {platform === 'facebook'  && <FacebookPreview  previewUrl={previewUrl} caption={displayCaption} hashtags={hashtagStr} isVideo={!!firstVideo && !firstImage} />}
      {platform === 'tiktok'    && <TikTokPreview    previewUrl={previewUrl} caption={displayCaption} hashtags={hashtagStr} />}
      <p className="text-[10px] text-stone-400 text-center">Preview only. Actual post may vary.</p>
    </div>
  )
}

function InstagramPreview({ previewUrl, caption, hashtags, isVideo }: { previewUrl: string | null; caption: string; hashtags: string; isVideo: boolean }) {
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
        {previewUrl ? <img src={previewUrl} alt="preview" className="w-full h-full object-cover" /> : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-300">
            <ImagePlaceholderIcon className="w-8 h-8" />
            <p className="text-[10px]">Add media to preview</p>
          </div>
        )}
        {isVideo && <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-white text-[9px] font-medium">▶ VIDEO</div>}
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3"><span className="text-lg">🤍</span><span className="text-lg">💬</span><span className="text-lg">↗</span></div>
          <span className="text-lg">🔖</span>
        </div>
        <div className="space-y-0.5">
          <p className="text-stone-900 leading-relaxed"><span className="font-semibold">fireovapizza </span><span className="line-clamp-3">{caption}</span></p>
          {hashtags && <p className="text-blue-500 line-clamp-2">{hashtags}</p>}
        </div>
        <p className="text-stone-400 mt-1.5 text-[10px] uppercase tracking-wide">2 hours ago</p>
      </div>
    </div>
  )
}

function FacebookPreview({ previewUrl, caption, hashtags, isVideo }: { previewUrl: string | null; caption: string; hashtags: string; isVideo: boolean }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden text-[11px] shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[10px] font-bold">F</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-900 leading-none">Fireova Pizza</p>
          <p className="text-stone-400 text-[9px] mt-0.5">Just now · 🌐</p>
        </div>
        <span className="text-stone-400 text-lg leading-none">···</span>
      </div>
      {caption && <div className="px-3 pb-2"><p className="text-stone-800 line-clamp-3 leading-relaxed">{caption}</p>{hashtags && <p className="text-blue-600 text-[10px] mt-1 line-clamp-1">{hashtags}</p>}</div>}
      <div className="aspect-video bg-stone-100 relative">
        {previewUrl ? <img src={previewUrl} alt="preview" className="w-full h-full object-cover" /> : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-300">
            <ImagePlaceholderIcon className="w-8 h-8" />
            <p className="text-[10px]">Add media to preview</p>
          </div>
        )}
        {isVideo && <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-white text-[9px] font-medium">▶ VIDEO</div>}
      </div>
      <div className="px-3 py-2 border-t border-stone-100">
        <div className="flex items-center justify-around text-stone-500 text-[11px]">
          <button className="flex items-center gap-1 hover:text-blue-600 py-1 px-2 rounded hover:bg-stone-50">👍 Like</button>
          <button className="flex items-center gap-1 hover:text-blue-600 py-1 px-2 rounded hover:bg-stone-50">💬 Comment</button>
          <button className="flex items-center gap-1 hover:text-blue-600 py-1 px-2 rounded hover:bg-stone-50">↗ Share</button>
        </div>
      </div>
    </div>
  )
}

function TikTokPreview({ previewUrl, caption, hashtags }: { previewUrl: string | null; caption: string; hashtags: string }) {
  return (
    <div className="bg-black rounded-2xl overflow-hidden shadow-sm relative" style={{ aspectRatio: '9/16', maxHeight: '480px' }}>
      {previewUrl ? <img src={previewUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover" /> : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-600">
          <ImagePlaceholderIcon className="w-8 h-8" />
          <p className="text-[10px] text-stone-500">Add media to preview</p>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 text-white">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center"><span className="text-white text-[9px] font-bold">F</span></div>
          <span className="text-white text-[9px]">+</span>
        </div>
        <div className="flex flex-col items-center gap-0.5"><span className="text-2xl">❤️</span><span className="text-[9px]">12.4K</span></div>
        <div className="flex flex-col items-center gap-0.5"><span className="text-2xl">💬</span><span className="text-[9px]">284</span></div>
        <div className="flex flex-col items-center gap-0.5"><span className="text-2xl">↗</span><span className="text-[9px]">Share</span></div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-3 py-3 pr-12">
        <p className="text-white font-semibold text-[11px] mb-1">@fireovapizza</p>
        <p className="text-white text-[10px] leading-snug line-clamp-3">{caption}</p>
        {hashtags && <p className="text-white/80 text-[10px] mt-1 line-clamp-1">{hashtags}</p>}
        <div className="flex items-center gap-1.5 mt-2"><span className="text-white text-[10px]">♪</span><p className="text-white text-[10px] truncate">Original sound - fireovapizza</p></div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function CheckIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
}
function CloseSmIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55-2.27A1 1 0 0121 8.72v6.56a1 1 0 01-1.45.9L15 14M4 8h7a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4a2 2 0 012-2z" /></svg>
}
function SpinnerIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" /></svg>
}
function ChevronIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
}
function EyeIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
}
function ImagePlaceholderIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
