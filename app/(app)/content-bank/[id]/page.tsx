'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PILLARS, FORMATS, HASHTAG_POOL, STATUS_COLORS, PILLAR_FOLDER_IDS, PILLAR_SUBFOLDER_IDS } from '@/lib/constants'
import { getDynamicPillarData } from '@/lib/pillar-utils'
import type { Post, PostUpdate, MediaAsset } from '@/lib/types'

const LS_POST_MEDIA_KEY  = 'fireova_post_media'
const LS_APPROVED_KEY    = 'fireova_approved_captions'
const LS_REVIEW_KEY      = 'fireova_review_posts'
const LS_APPROVED_POSTS  = 'fireova_approved_posts'
const LS_FEEDBACK_KEY    = 'fireova_post_feedback'

type Format = 'Reel' | 'Carousel' | 'Photo'
type Status = 'draft' | 'scheduled' | 'published'

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const dragIndexRef = useRef<number | null>(null)

  function reorderMedia(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    setSelectedMedia((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }
  const [approvedOption, setApprovedOption] = useState<1 | 2 | null>(null)
  const [isInReview, setIsInReview] = useState(false)
  const [isApprovedPost, setIsApprovedPost] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [showRefine, setShowRefine] = useState<Record<1 | 2, boolean>>({ 1: false, 2: false })
  const [refineText, setRefineText] = useState<Record<1 | 2, string>>({ 1: '', 2: '' })
  const [refining, setRefining] = useState<1 | 2 | null>(null)
  const [refineError, setRefineError] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [pillar, setPillar] = useState('')
  const [topic, setTopic] = useState('')
  const [format, setFormat] = useState<Format>('Reel')
  const [status, setStatus] = useState<Status>('draft')
  const [scheduledDate, setScheduledDate] = useState('')
  const [captionOption1, setCaptionOption1] = useState('')
  const [captionOption2, setCaptionOption2] = useState('')
  const [hashtags, setHashtags] = useState(['', '', '', ''])
  const [shotIdeas, setShotIdeas] = useState(['', '', ''])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    loadPost()
  }, [id])

  async function loadPost() {
    const supabase = createClient()
    const { data, error } = await supabase.from('posts').select('*').eq('id', id).single()
    if (error || !data) { setNotFound(true); setLoading(false); return }

    const p = data as Post
    setPost(p)
    setTitle(p.title)
    setPillar(p.pillar)
    setTopic(p.topic ?? '')
    setFormat(p.format)
    setStatus(p.status)
    setScheduledDate(p.scheduled_date ?? '')
    setCaptionOption1(p.caption_option1 ?? '')
    setCaptionOption2(p.caption_option2 ?? '')
    const tags = [...p.hashtags]
    while (tags.length < 4) tags.push('')
    setHashtags(tags)
    const shots = [...p.shot_ideas]
    while (shots.length < 3) shots.push('')
    setShotIdeas(shots)
    setNotes(p.notes ?? '')

    // Load approved caption selection
    try {
      const raw = localStorage.getItem(LS_APPROVED_KEY)
      const store: Record<string, number> = raw ? JSON.parse(raw) : {}
      if (store[id]) setApprovedOption(store[id] as 1 | 2)
    } catch {}

    // Load review / approval folder state
    try {
      const reviewIds:   string[] = JSON.parse(localStorage.getItem(LS_REVIEW_KEY)     ?? '[]')
      const approvedIds: string[] = JSON.parse(localStorage.getItem(LS_APPROVED_POSTS) ?? '[]')
      setIsInReview(reviewIds.includes(id))
      setIsApprovedPost(approvedIds.includes(id))
    } catch {}

    // Load feedback
    try {
      const feedbackStore: Record<string, string> = JSON.parse(localStorage.getItem(LS_FEEDBACK_KEY) ?? '{}')
      setFeedback(feedbackStore[id] ?? '')
    } catch {}

    // Load associated media from localStorage
    try {
      const raw = localStorage.getItem(LS_POST_MEDIA_KEY)
      const store: Record<string, string[]> = raw ? JSON.parse(raw) : {}
      const assetIds = store[id] ?? []
      if (assetIds.length > 0) {
        const { data: mediaData } = await supabase.from('media_assets').select('*').in('id', assetIds)
        if (mediaData) setSelectedMedia(mediaData as MediaAsset[])
      }
    } catch {}

    setLoading(false)
  }

  function approveOption(opt: 1 | 2) {
    const next = approvedOption === opt ? null : opt
    setApprovedOption(next)
    try {
      const raw = localStorage.getItem(LS_APPROVED_KEY)
      const store: Record<string, number | null> = raw ? JSON.parse(raw) : {}
      if (next === null) delete store[id]
      else store[id] = next
      localStorage.setItem(LS_APPROVED_KEY, JSON.stringify(store))
    } catch {}
  }

  function saveMediaAssociation(assetIds: string[]) {
    try {
      const raw = localStorage.getItem(LS_POST_MEDIA_KEY)
      const store: Record<string, string[]> = raw ? JSON.parse(raw) : {}
      store[id] = assetIds
      localStorage.setItem(LS_POST_MEDIA_KEY, JSON.stringify(store))
    } catch {}
  }

  function saveFeedback(text: string) {
    setFeedback(text)
    try {
      const store: Record<string, string> = JSON.parse(localStorage.getItem(LS_FEEDBACK_KEY) ?? '{}')
      if (text.trim()) store[id] = text
      else delete store[id]
      localStorage.setItem(LS_FEEDBACK_KEY, JSON.stringify(store))
    } catch {}
  }

  function updateHashtag(i: number, val: string) {
    const next = [...hashtags]; next[i] = val; setHashtags(next)
  }

  function updateShot(i: number, val: string) {
    const next = [...shotIdeas]; next[i] = val; setShotIdeas(next)
  }

  function addHashtagFromPool(tag: string) {
    const empty = hashtags.findIndex((h) => h === '')
    if (empty === -1) return
    updateHashtag(empty, tag)
  }

  // ---------------------------------------------------------------------------
  // Approved examples helpers
  // ---------------------------------------------------------------------------
  const LS_EXAMPLES_KEY = 'fireova_approved_examples'

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
  // Refine a caption option with AI
  // ---------------------------------------------------------------------------
  async function refineCaption(opt: 1 | 2) {
    const captionText = opt === 1 ? captionOption1 : captionOption2
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
      if (opt === 1) setCaptionOption1(revised.trim())
      else setCaptionOption2(revised.trim())
      setRefineText((prev) => ({ ...prev, [opt]: '' }))
      setShowRefine((prev) => ({ ...prev, [opt]: false }))
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setRefining(null)
    }
  }

  async function handleSave() {
    if (!title || !pillar) { setError('Title and pillar are required.'); return }
    setSaving(true); setError(null)

    const payload: PostUpdate = {
      title,
      pillar,
      topic: topic || null,
      format,
      status,
      scheduled_date: status === 'scheduled' && scheduledDate ? scheduledDate : null,
      caption_option1: captionOption1 || null,
      caption_option2: captionOption2 || null,
      hashtags: hashtags.filter(Boolean),
      shot_ideas: shotIdeas.filter(Boolean),
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }

    const supabase = createClient()
    const { error: saveError } = await supabase.from('posts').update(payload as never).eq('id', id)

    if (saveError) { setError(saveError.message); setSaving(false); return }
    saveMediaAssociation(selectedMedia.map((m) => m.id))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    setSaving(false)
  }

  function handleSubmitForReview() {
    try {
      const reviewSet = new Set<string>(JSON.parse(localStorage.getItem(LS_REVIEW_KEY) ?? '[]'))
      const approvedSet = new Set<string>(JSON.parse(localStorage.getItem(LS_APPROVED_POSTS) ?? '[]'))
      if (isInReview) {
        reviewSet.delete(id)
      } else {
        reviewSet.add(id)
        approvedSet.delete(id)
        setIsApprovedPost(false)
      }
      localStorage.setItem(LS_REVIEW_KEY, JSON.stringify([...reviewSet]))
      localStorage.setItem(LS_APPROVED_POSTS, JSON.stringify([...approvedSet]))
      setIsInReview(!isInReview)
    } catch {}
  }

  function handleApprovePost() {
    try {
      const reviewSet = new Set<string>(JSON.parse(localStorage.getItem(LS_REVIEW_KEY) ?? '[]'))
      const approvedSet = new Set<string>(JSON.parse(localStorage.getItem(LS_APPROVED_POSTS) ?? '[]'))
      if (isApprovedPost) {
        approvedSet.delete(id)
      } else {
        approvedSet.add(id)
        reviewSet.delete(id)
        setIsInReview(false)
        // Save the approved caption(s) to the examples pool
        const toSave = approvedOption === 1 ? captionOption1 : approvedOption === 2 ? captionOption2 : null
        if (toSave?.trim()) saveApprovedExample(toSave.trim())
        else {
          if (captionOption1.trim()) saveApprovedExample(captionOption1.trim())
          if (captionOption2.trim()) saveApprovedExample(captionOption2.trim())
        }
      }
      localStorage.setItem(LS_REVIEW_KEY, JSON.stringify([...reviewSet]))
      localStorage.setItem(LS_APPROVED_POSTS, JSON.stringify([...approvedSet]))
      setIsApprovedPost(!isApprovedPost)
    } catch {}
  }

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('posts').delete().eq('id', id)
    router.push('/content-bank')
  }

  const usedHashtags = new Set(hashtags.filter(Boolean))

  if (loading) {
    return (
      <div className="page-content flex items-center justify-center h-64">
        <p className="text-sm text-stone-400">Loading...</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="page-content flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-sm text-stone-500">Post not found.</p>
        <Link href="/content-bank" className="btn-secondary text-sm">Back to Content Bank</Link>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/content-bank" className="text-stone-400 hover:text-stone-700 transition-colors">
              <ChevronLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-stone-900 truncate max-w-lg">{post?.title}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`badge ${STATUS_COLORS[status]}`}>{status}</span>
                {post?.created_at && (
                  <span className="text-xs text-stone-400">
                    Created {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <CheckIcon className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Folder status banner */}
        {isInReview && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <ClockIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">This post is waiting for approval. Review the feedback below before approving.</p>
          </div>
        )}
        {isApprovedPost && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <p className="text-sm text-emerald-800 font-medium">This post is approved and ready to schedule.</p>
          </div>
        )}

        {error && (
          <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Media */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">Media</h2>
                  <p className="text-xs text-stone-500 mt-0.5">Attach photos or videos from your Media Bank.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="btn-secondary text-xs py-1.5"
                >
                  <PlusSmIcon className="w-3.5 h-3.5" />
                  {selectedMedia.length > 0 ? 'Edit selection' : 'Add media'}
                </button>
              </div>
              {selectedMedia.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {selectedMedia.map((asset, idx) => (
                    <SelectedThumb
                      key={asset.id}
                      asset={asset}
                      index={idx}
                      onRemove={() => setSelectedMedia((prev) => prev.filter((a) => a.id !== asset.id))}
                      onDragStart={() => { dragIndexRef.current = idx }}
                      onDrop={() => { if (dragIndexRef.current !== null) reorderMedia(dragIndexRef.current, idx) }}
                    />
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full border-2 border-dashed border-stone-200 rounded-xl py-8 text-center hover:border-stone-300 hover:bg-stone-50 transition-colors"
                >
                  <ImageIcon className="w-6 h-6 text-stone-300 mx-auto mb-2" />
                  <p className="text-xs text-stone-400">Click to pick from Media Bank</p>
                </button>
              )}
            </div>

            {/* Post Details */}
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-stone-900">Post Details</h2>

              <div>
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Pillar <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select value={pillar} onChange={(e) => setPillar(e.target.value)} className="select pr-8">
                      <option value="">Select a pillar</option>
                      {PILLARS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="label">Format</label>
                  <div className="flex gap-2">
                    {FORMATS.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f as Format)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
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
              </div>

              <div>
                <label className="label">Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Behind-the-scenes pizza prep at a Dallas wedding"
                  className="input"
                />
              </div>
            </div>

            {/* Caption Option 1 */}
            <div className={`card p-5 space-y-4 transition-all ${approvedOption === 1 ? 'ring-2 ring-emerald-400' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">Option 1: Instagram / Facebook</h2>
                  <p className="text-xs text-stone-500 mt-0.5">2 to 4 sentences. Warm, flowing, and conversational.</p>
                </div>
                <button
                  onClick={() => approveOption(1)}
                  className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                    approvedOption === 1
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700'
                  }`}
                >
                  <ApproveIcon className="w-3.5 h-3.5" />
                  {approvedOption === 1 ? 'Approved' : 'Approve'}
                </button>
              </div>
              <textarea
                value={captionOption1}
                onChange={(e) => setCaptionOption1(e.target.value)}
                rows={6}
                className="textarea"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-stone-400">{captionOption1.length} characters</p>
                {captionOption1.trim() && !showRefine[1] && (
                  <button
                    type="button"
                    onClick={() => setShowRefine((p) => ({ ...p, 1: true }))}
                    className="text-xs text-stone-400 hover:text-ember-600 transition-colors flex items-center gap-1"
                  >
                    <WandIcon className="w-3 h-3" /> Refine with AI
                  </button>
                )}
              </div>
              {showRefine[1] && (
                <div className="border-t border-stone-100 pt-3 space-y-2">
                  <p className="text-xs text-stone-500 font-medium">What should change?</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={refineText[1]}
                      onChange={(e) => setRefineText((p) => ({ ...p, 1: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') refineCaption(1) }}
                      placeholder='e.g. "shorter hook" or "focus more on the couple"'
                      className="input text-xs flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => refineCaption(1)}
                      disabled={refining === 1 || !refineText[1].trim()}
                      className="btn-primary text-xs py-1.5 flex-shrink-0 disabled:opacity-50"
                    >
                      {refining === 1 ? 'Rewriting...' : 'Apply'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowRefine((p) => ({ ...p, 1: false })); setRefineText((p) => ({ ...p, 1: '' })) }}
                      className="text-stone-400 hover:text-stone-600 text-xs px-1"
                    >✕</button>
                  </div>
                  {refineError && refining !== 1 && (
                    <p className="text-xs text-red-500">{refineError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Caption Option 2 */}
            <div className={`card p-5 space-y-4 transition-all ${approvedOption === 2 ? 'ring-2 ring-emerald-400' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">Option 2: TikTok</h2>
                  <p className="text-xs text-stone-500 mt-0.5">Short and punchy. 1 to 2 sentences. Let the video do the talking.</p>
                </div>
                <button
                  onClick={() => approveOption(2)}
                  className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                    approvedOption === 2
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700'
                  }`}
                >
                  <ApproveIcon className="w-3.5 h-3.5" />
                  {approvedOption === 2 ? 'Approved' : 'Approve'}
                </button>
              </div>
              <textarea
                value={captionOption2}
                onChange={(e) => setCaptionOption2(e.target.value)}
                rows={6}
                className="textarea"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-stone-400">{captionOption2.length} characters</p>
                {captionOption2.trim() && !showRefine[2] && (
                  <button
                    type="button"
                    onClick={() => setShowRefine((p) => ({ ...p, 2: true }))}
                    className="text-xs text-stone-400 hover:text-ember-600 transition-colors flex items-center gap-1"
                  >
                    <WandIcon className="w-3 h-3" /> Refine with AI
                  </button>
                )}
              </div>
              {showRefine[2] && (
                <div className="border-t border-stone-100 pt-3 space-y-2">
                  <p className="text-xs text-stone-500 font-medium">What should change?</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={refineText[2]}
                      onChange={(e) => setRefineText((p) => ({ ...p, 2: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') refineCaption(2) }}
                      placeholder='e.g. "punchier" or "add a food detail"'
                      className="input text-xs flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => refineCaption(2)}
                      disabled={refining === 2 || !refineText[2].trim()}
                      className="btn-primary text-xs py-1.5 flex-shrink-0 disabled:opacity-50"
                    >
                      {refining === 2 ? 'Rewriting...' : 'Apply'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowRefine((p) => ({ ...p, 2: false })); setRefineText((p) => ({ ...p, 2: '' })) }}
                      className="text-stone-400 hover:text-stone-600 text-xs px-1"
                    >✕</button>
                  </div>
                  {refineError && refining !== 2 && (
                    <p className="text-xs text-red-500">{refineError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Hashtags */}
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-stone-900">Hashtags</h2>
              <div className="grid grid-cols-2 gap-2">
                {hashtags.map((tag, i) => (
                  <input
                    key={i}
                    type="text"
                    value={tag}
                    onChange={(e) => updateHashtag(i, e.target.value)}
                    placeholder={`#Hashtag ${i + 1}`}
                    className="input text-sm"
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {HASHTAG_POOL.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addHashtagFromPool(tag)}
                    disabled={usedHashtags.has(tag)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      usedHashtags.has(tag)
                        ? 'bg-stone-100 text-stone-300 border-stone-100 cursor-default'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-ember-300 hover:text-ember-700'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Shot Ideas */}
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-stone-900">Shot Ideas</h2>
              {shotIdeas.map((idea, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs font-medium text-stone-400 mt-2.5 w-4 flex-shrink-0">{i + 1}.</span>
                  <input
                    type="text"
                    value={idea}
                    onChange={(e) => updateShot(i, e.target.value)}
                    placeholder="Describe a shot or video idea"
                    className="input text-sm"
                  />
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-stone-900">Notes</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Internal notes, reminders, or context..."
                className="textarea"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Publish */}
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-stone-900">Publish</h2>
              <div>
                <label className="label">Status</label>
                <div className="relative">
                  <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="select pr-8">
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                  </select>
                  <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                </div>
              </div>
              {status === 'scheduled' && (
                <div>
                  <label className="label">Scheduled Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="input"
                  />
                </div>
              )}
              <button onClick={handleSave} disabled={saving} className="btn-primary w-full text-sm">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>

            {/* Feedback & Suggestions */}
            <div className={`card p-5 space-y-3 ${isInReview ? 'border-amber-200 ring-1 ring-amber-100' : ''}`}>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-stone-900">Feedback & Suggestions</h2>
                {isInReview && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Needs Review
                  </span>
                )}
              </div>
              <textarea
                value={feedback}
                onChange={(e) => saveFeedback(e.target.value)}
                rows={5}
                placeholder="Leave notes for suggested changes before approval. e.g. &quot;Shorten the hook, swap hashtag 3, try a warmer tone.&quot;"
                className="textarea text-sm"
              />
              {feedback.trim() && (
                <button
                  type="button"
                  onClick={() => saveFeedback('')}
                  className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                >
                  Clear feedback
                </button>
              )}
              {!feedback.trim() && (
                <p className="text-xs text-stone-400">Feedback is saved automatically as you type.</p>
              )}
            </div>

            {/* Approval */}
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-stone-900">Approval</h2>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                  isApprovedPost
                    ? 'bg-emerald-100 text-emerald-700'
                    : isInReview
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-stone-100 text-stone-500'
                }`}>
                  {isApprovedPost ? 'Approved' : isInReview ? 'Needs Approval' : 'Draft'}
                </span>
              </div>
              <button
                onClick={handleSubmitForReview}
                className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  isInReview
                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-amber-200 hover:text-amber-700 hover:bg-amber-50'
                }`}
              >
                <ClockIcon className="w-3.5 h-3.5" />
                {isInReview ? 'Pull Back from Review' : 'Submit for Review'}
              </button>
              <button
                onClick={handleApprovePost}
                className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  isApprovedPost
                    ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-emerald-200 hover:text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <ApproveIcon className="w-3.5 h-3.5" />
                {isApprovedPost ? 'Approved — Click to Undo' : 'Approve Post'}
              </button>
            </div>

            {/* Danger zone */}
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-stone-900">Danger Zone</h2>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2 px-3 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  Delete post
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-stone-500">Are you sure? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2 px-3 rounded-lg border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {pickerOpen && (
        <MediaPicker
          selected={selectedMedia}
          pillar={pillar || undefined}
          onConfirm={(assets) => { setSelectedMedia(assets); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Selected thumbnail
// ---------------------------------------------------------------------------

function SelectedThumb({
  asset,
  index,
  onRemove,
  onDragStart,
  onDrop,
}: {
  asset: MediaAsset
  index: number
  onRemove: () => void
  onDragStart: () => void
  onDrop: () => void
}) {
  const supabase = createClient()
  const url = supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl
  const isImage = asset.file_type.startsWith('image/')
  const canPreview = isImage && !['image/heic', 'image/heif'].includes(asset.file_type.toLowerCase())
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop() }}
      onDragEnd={() => setIsDragOver(false)}
      className={`relative group aspect-square rounded-lg overflow-hidden border bg-stone-100 cursor-grab active:cursor-grabbing transition-all ${
        isDragOver ? 'border-ember-400 ring-2 ring-ember-300 scale-105' : 'border-stone-200'
      }`}
    >
      {canPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={asset.filename} draggable={false} className="w-full h-full object-cover pointer-events-none" />
      ) : (
        <div className="w-full h-full flex items-center justify-center pointer-events-none">
          <VideoIcon className="w-6 h-6 text-stone-400" />
        </div>
      )}
      {/* Position number */}
      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/60 text-white text-[9px] font-bold flex items-center justify-center z-10 pointer-events-none">
        {index + 1}
      </div>
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
      >
        <XSmIcon className="w-3 h-3" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Media picker modal
// ---------------------------------------------------------------------------

function MediaPicker({ selected, pillar, onConfirm, onClose }: {
  selected: MediaAsset[]
  pillar?: string
  onConfirm: (assets: MediaAsset[]) => void
  onClose: () => void
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [picks, setPicks] = useState<Set<string>>(new Set(selected.map((a) => a.id)))
  const [assetMeta, setAssetMeta] = useState<Record<string, { folder_id?: string | null }>>({})
  const [pillarFilter, setPillarFilter] = useState<string | null>(pillar ?? null)
  const [dynPillarFolderIds, setDynPillarFolderIds] = useState<Record<string, string>>(PILLAR_FOLDER_IDS)
  const [dynPillarSubfolderIds, setDynPillarSubfolderIds] = useState<Record<string, string[]>>(PILLAR_SUBFOLDER_IDS)
  const [dynPillars, setDynPillars] = useState<string[]>([...PILLARS])

  useEffect(() => {
    try { const r = localStorage.getItem('fireova_asset_meta'); if (r) setAssetMeta(JSON.parse(r)) } catch {}
    try {
      const d = getDynamicPillarData()
      setDynPillarFolderIds(d.pillarFolderIds)
      setDynPillarSubfolderIds(d.pillarSubfolderIds)
      setDynPillars(d.pillars)
    } catch {}
    const supabase = createClient()
    supabase.from('media_assets').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setAssets(data ?? []); setLoading(false) })
  }, [])

  function assetInPillar(assetId: string, p: string): boolean {
    const rootId = dynPillarFolderIds[p]; if (!rootId) return false
    const folderId = assetMeta[assetId]?.folder_id ?? null; if (!folderId) return false
    if (folderId === rootId) return true
    return (dynPillarSubfolderIds[rootId] ?? []).includes(folderId)
  }

  const filtered = assets.filter((a) => {
    if (pillarFilter && !assetInPillar(a.id, pillarFilter)) return false
    if (search.trim() && !a.filename.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const pillarsWithMedia = dynPillars.filter((p) => assets.some((a) => assetInPillar(a.id, p)))

  function toggle(id: string) {
    setPicks((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Pick Media</h2>
            <p className="text-xs text-stone-500 mt-0.5">{picks.size} selected</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..." className="input text-xs py-1.5 w-44" autoFocus />
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><CloseIcon className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Pillar filter tabs */}
        {pillarsWithMedia.length > 0 && (
          <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-stone-100 overflow-x-auto">
            <button onClick={() => setPillarFilter(null)}
              className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${pillarFilter === null ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'}`}>
              All
            </button>
            {pillarsWithMedia.map((p) => (
              <button key={p} onClick={() => setPillarFilter(pillarFilter === p ? null : p)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${pillarFilter === p ? 'bg-ember-600 text-white border-ember-600' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'}`}>
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-square rounded-lg bg-stone-100 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              {pillarFilter && assets.length > 0
                ? `No media tagged to "${pillarFilter}" yet. Assign media to the ${pillarFilter} folder in the Media Bank.`
                : assets.length === 0 ? 'No media uploaded yet.' : 'No results.'}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {filtered.map((asset) => (
                <PickerThumb key={asset.id} asset={asset} selected={picks.has(asset.id)} onToggle={() => toggle(asset.id)} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
          <button onClick={() => setPicks(new Set())} className="text-xs text-stone-400 hover:text-stone-600">Clear all</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm py-1.5">Cancel</button>
            <button onClick={() => onConfirm(assets.filter((a) => picks.has(a.id)))} className="btn-primary text-sm py-1.5">
              {picks.size > 0 ? `Attach ${picks.size} file${picks.size !== 1 ? 's' : ''}` : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PickerThumb({ asset, selected, onToggle }: { asset: MediaAsset; selected: boolean; onToggle: () => void }) {
  const supabase = createClient()
  const url = supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl
  const canPreview = asset.file_type.startsWith('image/') && !['image/heic', 'image/heif'].includes(asset.file_type.toLowerCase())

  return (
    <button
      onClick={onToggle}
      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all bg-stone-100 ${
        selected ? 'border-ember-500 ring-2 ring-ember-300' : 'border-transparent hover:border-stone-300'
      }`}
    >
      {canPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={asset.filename} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <VideoIcon className="w-7 h-7 text-stone-400" />
        </div>
      )}
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-ember-500 flex items-center justify-center shadow">
          <CheckIcon className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function PlusSmIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
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

function XSmIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function ApproveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
function WandIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
}
