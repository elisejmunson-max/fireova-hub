'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PILLARS, FORMATS, HASHTAG_POOL, PILLAR_FOLDER_IDS, PILLAR_SUBFOLDER_IDS } from '@/lib/constants'
import { getDynamicPillarData } from '@/lib/pillar-utils'
import type { PostInsert, MediaAsset } from '@/lib/types'

type Format = 'Reel' | 'Carousel' | 'Photo'
type Status = 'draft' | 'scheduled' | 'published'


const EMPTY_FORM = {
  title: '',
  pillar: '',
  topic: '',
  format: 'Reel' as Format,
  caption_option1: '',
  caption_option2: '',
  hashtags: ['', '', '', ''],
  shot_ideas: ['', '', ''],
  status: 'draft' as Status,
  scheduled_date: '',
  notes: '',
}

type PreviewPlatform = 'instagram' | 'facebook' | 'tiktok'

export default function CreatePage() {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPlatform, setPreviewPlatform] = useState<PreviewPlatform>('instagram')
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
  const [showRefine, setShowRefine] = useState<Record<1 | 2, boolean>>({ 1: false, 2: false })
  const [refineText, setRefineText] = useState<Record<1 | 2, string>>({ 1: '', 2: '' })
  const [refining, setRefining] = useState<1 | 2 | null>(null)
  const [refineError, setRefineError] = useState<string | null>(null)
  const [subPillar, setSubPillar] = useState('')
  const [subPillarItem, setSubPillarItem] = useState('')
  const [dynSubPillars, setDynSubPillars] = useState<Record<string, string[]>>({})
  const [dynSubPillarItems, setDynSubPillarItems] = useState<Record<string, string[]>>({})

  useEffect(() => {
    try {
      const d = getDynamicPillarData()
      setDynSubPillars(d.subPillars)
      setDynSubPillarItems(d.subPillarItems)
    } catch {}
  }, [])

  function update(field: keyof typeof EMPTY_FORM, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateHashtag(index: number, value: string) {
    const next = [...form.hashtags]
    next[index] = value
    update('hashtags', next)
  }

  function updateShot(index: number, value: string) {
    const next = [...form.shot_ideas]
    next[index] = value
    update('shot_ideas', next)
  }

  function addHashtagFromPool(tag: string) {
    const empty = form.hashtags.findIndex((h) => h === '')
    if (empty === -1) return
    updateHashtag(empty, tag)
  }

  // ---------------------------------------------------------------------------
  // Approved examples — saved captions feed back into future AI generation
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
  // Refine a single caption option
  // ---------------------------------------------------------------------------
  async function refineCaption(opt: 1 | 2) {
    const captionText = opt === 1 ? form.caption_option1 : form.caption_option2
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
      update(opt === 1 ? 'caption_option1' : 'caption_option2', revised.trim())
      setRefineText((prev) => ({ ...prev, [opt]: '' }))
      setShowRefine((prev) => ({ ...prev, [opt]: false }))
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setRefining(null)
    }
  }

  async function handleSave(status: Status, approval?: 'review' | 'approved') {
    if (!form.title || !form.pillar) {
      setError('Title and pillar are required.')
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? 'dev'

    const payload: PostInsert = {
      user_id: userId,
      title: form.title,
      pillar: form.pillar,
      topic: form.topic || null,
      format: form.format,
      caption_option1: form.caption_option1 || null,
      caption_option2: form.caption_option2 || null,
      hashtags: form.hashtags.filter(Boolean),
      shot_ideas: form.shot_ideas.filter(Boolean),
      status,
      scheduled_date: status === 'scheduled' && form.scheduled_date ? form.scheduled_date : null,
      notes: form.notes || null,
    }

    const { data: post, error: saveError } = await supabase
      .from('posts')
      .insert(payload)
      .select()
      .single()

    if (saveError || !post) {
      if (saveError) {
        setError(saveError.message)
        setSaving(false)
        return
      }
    } else {
      if (selectedMedia.length > 0) {
        try {
          await supabase.from('post_media').insert(
            selectedMedia.map((m, i) => ({ post_id: post.id, asset_id: m.id, display_order: i }))
          )
        } catch {}
      }
      if (approval) {
        try {
          const REVIEW_KEY = 'fireova_review_posts'
          const APPROVED_KEY = 'fireova_approved_posts'
          const reviewSet = new Set<string>(JSON.parse(localStorage.getItem(REVIEW_KEY) ?? '[]'))
          const approvedSet = new Set<string>(JSON.parse(localStorage.getItem(APPROVED_KEY) ?? '[]'))
          if (approval === 'review') { reviewSet.add(post.id); approvedSet.delete(post.id) }
          else {
            approvedSet.add(post.id); reviewSet.delete(post.id)
            // Save non-empty captions to the approved examples pool
            if (form.caption_option1.trim()) saveApprovedExample(form.caption_option1.trim())
            if (form.caption_option2.trim()) saveApprovedExample(form.caption_option2.trim())
          }
          localStorage.setItem(REVIEW_KEY, JSON.stringify([...reviewSet]))
          localStorage.setItem(APPROVED_KEY, JSON.stringify([...approvedSet]))
        } catch {}
      }
    }

    setSaved(true)
    setTimeout(() => router.push('/content-bank'), 800)
  }

  async function generateCaption() {
    setGenerating(true)
    setGenError(null)

    // Get public URLs for any selected images
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
          pillar: [form.pillar, subPillar, subPillarItem].filter(Boolean).join(' > '),
          format: form.format,
          topic: form.topic,
          notes: form.notes,
          approvedExamples: loadApprovedExamples(),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Generation failed.')
      }
      if (!res.body) throw new Error('No response body')

      // Stream the response and parse JSON when complete
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let raw = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        raw += decoder.decode(value, { stream: true })
      }

      // Parse the JSON Claude returned
      const jsonStart = raw.indexOf('{')
      const jsonEnd = raw.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('Unexpected response format.')
      const data = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
        option1?: string
        option2?: string
        hashtags?: string[]
        shot_ideas?: string[]
      }

      // Populate form fields
      if (data.option1) update('caption_option1', data.option1)
      if (data.option2) update('caption_option2', data.option2)
      if (data.hashtags?.length) {
        const tags = data.hashtags.slice(0, 4)
        while (tags.length < 4) tags.push('')
        update('hashtags', tags)
      }
      if (data.shot_ideas?.length) {
        const shots = data.shot_ideas.slice(0, 3)
        while (shots.length < 3) shots.push('')
        update('shot_ideas', shots)
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setGenerating(false)
    }
  }

  const usedHashtags = new Set(form.hashtags.filter(Boolean))

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Create Post</h1>
            <p className="text-stone-500 text-sm mt-0.5">
              Build a post that feels like Fireova, not a template.
            </p>
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
        {error && (
          <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — main content */}
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
                  <PlusIcon className="w-3.5 h-3.5" />
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

            {/* Core fields */}
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-stone-900">Post Details</h2>

              <div>
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="e.g. Arugula prosciutto on the oven — wedding edition"
                  className="input"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Pillar <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select
                      value={form.pillar}
                      onChange={(e) => { update('pillar', e.target.value); setSubPillar(''); setSubPillarItem('') }}
                      className="select pr-8"
                    >
                      <option value="">Select a pillar</option>
                      {PILLARS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                  </div>
                  {form.pillar && (dynSubPillars[form.pillar] ?? []).length > 0 && (
                    <div className="relative mt-2">
                      <select
                        value={subPillar}
                        onChange={(e) => { setSubPillar(e.target.value); setSubPillarItem('') }}
                        className="select pr-8"
                      >
                        <option value="">Sub-pillar (optional)</option>
                        {(dynSubPillars[form.pillar] ?? []).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                    </div>
                  )}
                  {subPillar && (dynSubPillarItems[subPillar] ?? []).length > 0 && (
                    <div className="relative mt-2">
                      <select
                        value={subPillarItem}
                        onChange={(e) => setSubPillarItem(e.target.value)}
                        className="select pr-8"
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
                        onClick={() => update('format', f)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          form.format === f
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
                  value={form.topic}
                  onChange={(e) => update('topic', e.target.value)}
                  placeholder="e.g. Behind-the-scenes pizza prep at a Dallas wedding"
                  className="input"
                />
              </div>
            </div>

            {/* AI Generate */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">Generate with AI</h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {selectedMedia.length > 0
                      ? `Claude will write captions based on your ${selectedMedia.length} selected photo${selectedMedia.length !== 1 ? 's' : ''} and post details.`
                      : 'Select media above or fill in the pillar and topic, then let Claude write the captions.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={generateCaption}
                  disabled={generating}
                  className="btn-primary flex-shrink-0 py-2"
                >
                  {generating ? (
                    <><Spinner /><span>Writing...</span></>
                  ) : (
                    <><SparkleIcon className="w-4 h-4" /><span>Write Captions</span></>
                  )}
                </button>
              </div>
              {generating && (
                <div className="mt-3 text-xs text-stone-400 flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-ember-400 animate-pulse" />
                  Claude is writing in the Fireova voice...
                </div>
              )}
              {genError && (
                <p className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{genError}</p>
              )}
            </div>

            {/* Caption Option 1 — Instagram / Facebook */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">Option 1: Instagram / Facebook</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  2 to 4 sentences. Warm, flowing, and conversational. Reads like a real person talking.
                </p>
              </div>
              <textarea
                value={form.caption_option1}
                onChange={(e) => update('caption_option1', e.target.value)}
                rows={6}
                placeholder={`Open with something personal and specific to the event or moment.\n\nFlow into a line about the food, the experience, or the people.\n\nEnd with a short warm close.`}
                className="textarea"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-stone-400">{form.caption_option1.length} characters</p>
                {form.caption_option1.trim() && !showRefine[1] && (
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
                      {refining === 1 ? <><Spinner /><span>Rewriting...</span></> : 'Apply'}
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

            {/* Caption Option 2 — TikTok */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">Option 2: TikTok</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Shorter and punchier. 1 to 2 sentences. 1 to 2 emojis allowed if they fit naturally.
                </p>
              </div>
              <textarea
                value={form.caption_option2}
                onChange={(e) => update('caption_option2', e.target.value)}
                rows={4}
                placeholder={`One punchy line that pulls them in immediately.\n\nKeep it short — let the video do the talking.`}
                className="textarea"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-stone-400">{form.caption_option2.length} characters</p>
                {form.caption_option2.trim() && !showRefine[2] && (
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
                      {refining === 2 ? <><Spinner /><span>Rewriting...</span></> : 'Apply'}
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
          </div>

          {/* Right column — metadata */}
          <div className="space-y-5">
            {/* Publish */}
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-stone-900">Publish</h2>
              <div>
                <label className="label">Status</label>
                <div className="relative">
                  <select
                    value={form.status}
                    onChange={(e) => update('status', e.target.value as Status)}
                    className="select pr-8"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                  </select>
                  <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                </div>
              </div>

              {form.status === 'scheduled' && (
                <div>
                  <label className="label">Scheduled Date</label>
                  <input
                    type="date"
                    value={form.scheduled_date}
                    onChange={(e) => update('scheduled_date', e.target.value)}
                    className="input"
                  />
                </div>
              )}

              <div className="space-y-2 pt-1">
                <button
                  onClick={() => handleSave('draft')}
                  disabled={saving || saved}
                  className="btn-secondary w-full justify-center"
                >
                  {saving ? <Spinner /> : <SaveIcon className="w-4 h-4" />}
                  Save Draft
                </button>
                <button
                  onClick={() => handleSave('published')}
                  disabled={saving || saved}
                  className="btn-primary w-full justify-center"
                >
                  {saving ? <Spinner /> : null}
                  Save as Published
                </button>
              </div>

              {/* Approval */}
              <div className="pt-3 border-t border-stone-100 space-y-2">
                <p className="text-xs text-stone-400 font-medium">Approval</p>
                <button
                  onClick={() => handleSave('draft', 'review')}
                  disabled={saving || saved}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-50 transition-colors disabled:opacity-50"
                >
                  <ClockSmIcon className="w-3.5 h-3.5" />
                  Submit for Review
                </button>
                <button
                  onClick={() => handleSave('draft', 'approved')}
                  disabled={saving || saved}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors disabled:opacity-50"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  Approve Post
                </button>
              </div>
            </div>

            {/* Hashtags */}
            <div className="card p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">Hashtags</h2>
                <p className="text-xs text-stone-500 mt-0.5">Exactly 4 per post.</p>
              </div>
              <div className="space-y-2">
                {form.hashtags.map((tag, i) => (
                  <input
                    key={i}
                    type="text"
                    value={tag}
                    onChange={(e) => updateHashtag(i, e.target.value)}
                    placeholder={`Hashtag ${i + 1}`}
                    className="input text-xs"
                  />
                ))}
              </div>
              <div>
                <p className="text-xs text-stone-400 mb-2">Quick add from pool:</p>
                <div className="flex flex-wrap gap-1.5">
                  {HASHTAG_POOL.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addHashtagFromPool(tag)}
                      disabled={usedHashtags.has(tag)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                        usedHashtags.has(tag)
                          ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-default'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-ember-400 hover:text-ember-700'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Shot ideas */}
            <div className="card p-5 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">Shot Ideas</h2>
                <p className="text-xs text-stone-500 mt-0.5">3 specific ideas for this post.</p>
              </div>
              {form.shot_ideas.map((idea, i) => (
                <div key={i}>
                  <label className="text-xs text-stone-400 mb-1 block">Shot {i + 1}</label>
                  <input
                    type="text"
                    value={idea}
                    onChange={(e) => updateShot(i, e.target.value)}
                    placeholder={
                      i === 0 ? 'Close-up of dough stretching over the peel'
                      : i === 1 ? 'Wide shot of guests gathered around the oven'
                      : 'Overhead of the finished pizza coming out'
                    }
                    className="input text-xs"
                  />
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-stone-900">Notes</h2>
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                rows={3}
                placeholder="Event details, venue name, photographer tag, anything relevant..."
                className="textarea text-xs"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Media picker modal */}
      {pickerOpen && (
        <MediaPicker
          selected={selectedMedia}
          pillar={form.pillar || undefined}
          onConfirm={(assets) => { setSelectedMedia(assets); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Preview side panel — fixed drawer sliding in from the right */}
      <div
        className={`fixed top-0 right-0 h-screen w-[360px] z-40 bg-white border-l border-stone-200 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          previewOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 flex-shrink-0">
          <span className="text-sm font-semibold text-stone-900">Post Preview</span>
          <button
            onClick={() => setPreviewOpen(false)}
            className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 transition-colors"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">
          <PostPreview
            platform={previewPlatform}
            onPlatformChange={setPreviewPlatform}
            caption={
              previewPlatform === 'tiktok'
                ? form.caption_option2 || form.caption_option1 || ''
                : form.caption_option1 || form.caption_option2 || ''
            }
            hashtags={form.hashtags.filter(Boolean)}
            title={form.title}
            media={selectedMedia}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Selected media thumbnail
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
        title="Remove"
      >
        <CloseIcon className="w-3 h-3" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <p className="text-[9px] text-white truncate">{asset.filename}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Media picker modal
// ---------------------------------------------------------------------------

function MediaPicker({
  selected,
  pillar,
  onConfirm,
  onClose,
}: {
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
    // Load folder assignments from localStorage
    try {
      const raw = localStorage.getItem('fireova_asset_meta')
      if (raw) setAssetMeta(JSON.parse(raw))
    } catch {}

    // Load dynamic pillar → folder mappings
    try {
      const d = getDynamicPillarData()
      setDynPillarFolderIds(d.pillarFolderIds)
      setDynPillarSubfolderIds(d.pillarSubfolderIds)
      setDynPillars(d.pillars)
    } catch {}

    const supabase = createClient()
    supabase
      .from('media_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAssets(data ?? [])
        setLoading(false)
      })
  }, [])

  // Build a lookup: assetId → folderId (from localStorage meta)
  function getFolderId(assetId: string): string | null {
    return assetMeta[assetId]?.folder_id ?? null
  }

  // Check if an asset belongs to a given pillar (including sub-folders)
  function assetInPillar(assetId: string, p: string): boolean {
    const rootId = dynPillarFolderIds[p]
    if (!rootId) return false
    const folderId = getFolderId(assetId)
    if (!folderId) return false
    if (folderId === rootId) return true
    const subs = dynPillarSubfolderIds[rootId] ?? []
    return subs.includes(folderId)
  }

  const filtered = assets.filter((a) => {
    if (pillarFilter && !assetInPillar(a.id, pillarFilter)) return false
    if (search.trim() && !a.filename.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Which pillars actually have media assigned?
  const pillarsWithMedia = dynPillars.filter((p) =>
    assets.some((a) => assetInPillar(a.id, p))
  )

  function toggle(id: string) {
    setPicks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirm() {
    onConfirm(assets.filter((a) => picks.has(a.id)))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Pick Media</h2>
            <p className="text-xs text-stone-500 mt-0.5">{picks.size} selected</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="input pl-8 text-xs py-1.5 w-44"
                autoFocus
              />
            </div>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pillar filter tabs */}
        {pillarsWithMedia.length > 0 && (
          <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-stone-100 overflow-x-auto">
            <button
              onClick={() => setPillarFilter(null)}
              className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                pillarFilter === null
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
              }`}
            >
              All
            </button>
            {pillarsWithMedia.map((p) => (
              <button
                key={p}
                onClick={() => setPillarFilter(pillarFilter === p ? null : p)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  pillarFilter === p
                    ? 'bg-ember-600 text-white border-ember-600'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-stone-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              {assets.length === 0 ? 'No media uploaded yet. Add some in the Media Bank first.' : 'No results.'}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {filtered.map((asset) => (
                <PickerThumb
                  key={asset.id}
                  asset={asset}
                  selected={picks.has(asset.id)}
                  onToggle={() => toggle(asset.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
          <button onClick={() => setPicks(new Set())} className="text-xs text-stone-400 hover:text-stone-600">
            Clear all
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm py-1.5">Cancel</button>
            <button onClick={confirm} className="btn-primary text-sm py-1.5">
              {picks.size > 0 ? `Attach ${picks.size} file${picks.size !== 1 ? 's' : ''}` : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PickerThumb({
  asset,
  selected,
  onToggle,
}: {
  asset: MediaAsset
  selected: boolean
  onToggle: () => void
}) {
  const supabase = createClient()
  const url = supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl
  const isImage = asset.file_type.startsWith('image/')
  const canPreview = isImage && !['image/heic', 'image/heif'].includes(asset.file_type.toLowerCase())
  const isVideo = asset.file_type.startsWith('video/')

  return (
    <button
      onClick={onToggle}
      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
        selected ? 'border-ember-500 ring-2 ring-ember-300' : 'border-transparent hover:border-stone-300'
      } bg-stone-100`}
    >
      {canPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={asset.filename} className="w-full h-full object-cover" />
      ) : isVideo ? (
        <div className="w-full h-full flex items-center justify-center">
          <VideoIcon className="w-7 h-7 text-stone-400" />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-7 h-7 text-stone-300" />
        </div>
      )}

      {/* Selected checkmark */}
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-ember-500 flex items-center justify-center shadow">
          <CheckIcon className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Filename tooltip on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1.5 opacity-0 hover:opacity-100 transition-opacity">
        <p className="text-[9px] text-white truncate leading-tight">{asset.filename}</p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevronIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
}
function SaveIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
}
function CheckIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
}
function PlusIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
}
function CloseIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
}
function ImageIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" /></svg>
}
function SparkleIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" /><path d="M19 15l1.09 3.26L23 19l-2.91.74L19 23l-1.09-3.26L15 19l2.91-.74L19 15z" /><path d="M5 3l.73 2.27L8 6l-2.27.73L5 9l-.73-2.27L2 6l2.27-.73L5 3z" /></svg>
}
function WandIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
}
function Spinner() {
  return <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
}
function EyeIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
}
function ClockSmIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" /></svg>
}

// ---------------------------------------------------------------------------
// Post Preview — live mock of Instagram / Facebook / TikTok
// ---------------------------------------------------------------------------

function PostPreview({
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
  const firstImage = media.find((a) => a.file_type.startsWith('image/') && !['image/heic','image/heif'].includes(a.file_type.toLowerCase()))
  const firstVideo = media.find((a) => a.file_type.startsWith('video/'))
  const previewAsset = firstImage ?? firstVideo ?? null
  const previewUrl  = previewAsset ? supabase.storage.from('media').getPublicUrl(previewAsset.storage_path).data.publicUrl : null

  const platforms: { id: PreviewPlatform; label: string }[] = [
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook',  label: 'Facebook'  },
    { id: 'tiktok',    label: 'TikTok'    },
  ]

  const displayCaption = caption || (title ? `${title}...` : 'Your caption will appear here once you start writing.')
  const hashtagStr     = hashtags.length > 0 ? hashtags.join(' ') : ''

  return (
    <div className="space-y-3">
      {/* Platform tabs */}
      <div className="flex rounded-xl overflow-hidden border border-stone-200 bg-stone-50">
        {platforms.map((p) => (
          <button
            key={p.id}
            onClick={() => onPlatformChange(p.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              platform === p.id
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Mock frame */}
      {platform === 'instagram' && (
        <InstagramPreview previewUrl={previewUrl} caption={displayCaption} hashtags={hashtagStr} isVideo={!!firstVideo && !firstImage} />
      )}
      {platform === 'facebook' && (
        <FacebookPreview previewUrl={previewUrl} caption={displayCaption} hashtags={hashtagStr} isVideo={!!firstVideo && !firstImage} />
      )}
      {platform === 'tiktok' && (
        <TikTokPreview previewUrl={previewUrl} caption={displayCaption} hashtags={hashtagStr} />
      )}

      <p className="text-[10px] text-stone-400 text-center">Preview only. Actual post may vary.</p>
    </div>
  )
}

// ── Instagram ────────────────────────────────────────────────────────────────
function InstagramPreview({ previewUrl, caption, hashtags, isVideo }: { previewUrl: string | null; caption: string; hashtags: string; isVideo: boolean }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden text-[11px] shadow-sm">
      {/* Header */}
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

      {/* Image */}
      <div className="aspect-square bg-stone-100 relative">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-300">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-[10px]">Add media to preview</p>
          </div>
        )}
        {isVideo && (
          <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-white text-[9px] font-medium">▶ VIDEO</div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-lg">🤍</span>
            <span className="text-lg">💬</span>
            <span className="text-lg">↗</span>
          </div>
          <span className="text-lg">🔖</span>
        </div>
        {/* Caption */}
        <div className="space-y-0.5">
          <p className="text-stone-900 leading-relaxed">
            <span className="font-semibold">fireovapizza </span>
            <span className="line-clamp-3">{caption}</span>
          </p>
          {hashtags && (
            <p className="text-blue-500 line-clamp-2">{hashtags}</p>
          )}
        </div>
        <p className="text-stone-400 mt-1.5 text-[10px] uppercase tracking-wide">2 hours ago</p>
      </div>
    </div>
  )
}

// ── Facebook ─────────────────────────────────────────────────────────────────
function FacebookPreview({ previewUrl, caption, hashtags, isVideo }: { previewUrl: string | null; caption: string; hashtags: string; isVideo: boolean }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden text-[11px] shadow-sm">
      {/* Header */}
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

      {/* Caption above image (Facebook style) */}
      {caption && (
        <div className="px-3 pb-2">
          <p className="text-stone-800 line-clamp-3 leading-relaxed">{caption}</p>
          {hashtags && <p className="text-blue-600 text-[10px] mt-1 line-clamp-1">{hashtags}</p>}
        </div>
      )}

      {/* Image — 4:3 landscape */}
      <div className="aspect-video bg-stone-100 relative">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-300">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-[10px]">Add media to preview</p>
          </div>
        )}
        {isVideo && (
          <div className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-white text-[9px] font-medium">▶ VIDEO</div>
        )}
      </div>

      {/* Reactions bar */}
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

// ── TikTok ───────────────────────────────────────────────────────────────────
function TikTokPreview({ previewUrl, caption, hashtags }: { previewUrl: string | null; caption: string; hashtags: string }) {
  return (
    <div className="bg-black rounded-2xl overflow-hidden shadow-sm relative" style={{ aspectRatio: '9/16', maxHeight: '480px' }}>
      {/* Background image/video */}
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-600">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <p className="text-[10px] text-stone-500">Add media to preview</p>
        </div>
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      {/* Right action bar */}
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

      {/* Bottom caption */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-3 pr-12">
        <p className="text-white font-semibold text-[11px] mb-1">@fireovapizza</p>
        <p className="text-white text-[10px] leading-snug line-clamp-3">{caption}</p>
        {hashtags && (
          <p className="text-white/80 text-[10px] mt-1 line-clamp-1">{hashtags}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-white text-[10px]">♪</span>
          <p className="text-white text-[10px] truncate">Original sound - fireovapizza</p>
        </div>
      </div>
    </div>
  )
}
