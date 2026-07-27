'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PILLARS, PILLAR_COLORS, HASHTAG_POOL } from '@/lib/constants'
import type { CaptionTemplate, CaptionTemplateInsert } from '@/lib/types'

interface Props {
  initialTemplates: CaptionTemplate[]
  userId: string
}

const EMPTY_FORM: Omit<CaptionTemplateInsert, 'user_id'> = {
  name: '',
  pillar: '',
  option1: '',
  option2: '',
  hashtags: [],
  notes: '',
}

export default function CaptionsClient({ initialTemplates, userId }: Props) {
  const [templates, setTemplates] = useState<CaptionTemplate[]>(initialTemplates)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM, hashtags: ['', '', '', ''] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<{ id: string; which: 'option1' | 'option2' } | null>(null)
  const [filterPillar, setFilterPillar] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [knownCredits, setKnownCredits] = useState<string[]>([])

  // Load photographer credits saved in the media bank
  useEffect(() => {
    try {
      const meta: Record<string, { photographer?: string | null }> = JSON.parse(
        localStorage.getItem('fireova_asset_meta') ?? '{}'
      )
      const credits = [...new Set(
        Object.values(meta)
          .map((m) => m.photographer)
          .filter((c): c is string => !!c)
      )]
      setKnownCredits(credits)
    } catch {}
  }, [])

  function update(field: keyof typeof form, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateHashtag(index: number, value: string) {
    const next = [...form.hashtags]
    next[index] = value
    update('hashtags', next)
  }

  async function handleSave() {
    if (!form.name || !form.pillar) {
      setError('Name and pillar are required.')
      return
    }
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('caption_templates' as never)
      .insert({
        user_id: userId,
        name: form.name,
        pillar: form.pillar,
        option1: form.option1 || null,
        option2: form.option2 || null,
        hashtags: form.hashtags.filter(Boolean),
        notes: form.notes || null,
      } as never)
      .select()
      .single()

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setTemplates((prev) => [data, ...prev])
    setForm({ ...EMPTY_FORM, hashtags: ['', '', '', ''] })
    setShowForm(false)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('caption_templates').delete().eq('id', id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  async function copyToClipboard(text: string, id: string, which: 'option1' | 'option2') {
    await navigator.clipboard.writeText(text)
    setCopied({ id, which })
    setTimeout(() => setCopied(null), 2000)
  }

  const filtered = filterPillar
    ? templates.filter((t) => t.pillar === filterPillar)
    : templates

  return (
    <div>
      <div className="page-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Captions</h1>
            <p className="text-stone-500 text-sm mt-0.5">
              {templates.length} template{templates.length !== 1 ? 's' : ''} saved
            </p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <PlusIcon className="w-4 h-4" />
            New Template
          </button>
        </div>
      </div>

      <div className="page-content space-y-5">
        {/* New template form */}
        {showForm && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-900">New Caption Template</h2>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-600">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Template Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. Wedding oven close-up — fire punch"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Pillar <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    value={form.pillar}
                    onChange={(e) => update('pillar', e.target.value)}
                    className="select pr-8"
                  >
                    <option value="">Select a pillar</option>
                    {PILLARS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div>
              <label className="label">Option 1 — Instagram / Facebook</label>
              <textarea
                value={form.option1 ?? ''}
                onChange={(e) => update('option1', e.target.value)}
                rows={4}
                placeholder="2 to 4 sentences. Warm, flowing, reads like a real person."
                className="textarea"
              />
            </div>

            <div>
              <label className="label">Option 2 — TikTok</label>
              <textarea
                value={form.option2 ?? ''}
                onChange={(e) => update('option2', e.target.value)}
                rows={4}
                placeholder="Short and punchy. 1 to 2 sentences. Let the video do the talking."
                className="textarea"
              />
            </div>

            <div>
              <label className="label">Hashtags (up to 4)</label>
              <div className="grid grid-cols-2 gap-2">
                {form.hashtags.map((tag, i) => (
                  <input
                    key={i}
                    type="text"
                    value={tag}
                    onChange={(e) => updateHashtag(i, e.target.value)}
                    placeholder={HASHTAG_POOL[i] ?? `#hashtag${i + 1}`}
                    className="input text-xs"
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="label">Notes</label>
              <input
                type="text"
                value={form.notes ?? ''}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="When to use this template, event type, etc."
                className="input"
              />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <Spinner /> : null}
                Save Template
              </button>
            </div>
          </div>
        )}

        {/* Filter */}
        {templates.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterPillar('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                !filterPillar ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
            >
              All pillars
            </button>
            {[...new Set(templates.map((t) => t.pillar))].map((p) => (
              <button
                key={p}
                onClick={() => setFilterPillar(filterPillar === p ? '' : p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  filterPillar === p ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Templates */}
        {filtered.length === 0 ? (
          <EmptyState onNew={() => setShowForm(true)} hasFilter={!!filterPillar} />
        ) : (
          <div className="space-y-3">
            {filtered.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                expanded={expandedId === template.id}
                onToggle={() => setExpandedId(expandedId === template.id ? null : template.id)}
                onDelete={() => handleDelete(template.id)}
                onCopy={copyToClipboard}
                copied={copied}
                knownCredits={knownCredits}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  expanded,
  onToggle,
  onDelete,
  onCopy,
  copied,
  knownCredits,
}: {
  template: CaptionTemplate
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onCopy: (text: string, id: string, which: 'option1' | 'option2') => void
  copied: { id: string; which: 'option1' | 'option2' } | null
  knownCredits: string[]
}) {
  const [photoCredit, setPhotoCredit] = useState('')

  function copyWithCredit(text: string, which: 'option1' | 'option2') {
    const credit = photoCredit.trim()
    const full = credit
      ? `${text}\n\n📷 ${credit.startsWith('@') ? credit : `@${credit}`}`
      : text
    onCopy(full, template.id, which)
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-stone-50 transition-colors"
      >
        <ChevronIcon
          className={`w-4 h-4 text-stone-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-900 truncate">{template.name}</p>
          {template.notes && (
            <p className="text-xs text-stone-400 truncate mt-0.5">{template.notes}</p>
          )}
        </div>
        <span className={`badge flex-shrink-0 ${PILLAR_COLORS[template.pillar] ?? 'bg-stone-100 text-stone-600'}`}>
          {template.pillar}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-stone-100 px-5 py-4 space-y-4">
          {/* Photo Credit */}
          <div>
            <p className="text-xs font-medium text-stone-500 mb-1.5">Photo Credit</p>
            <input
              type="text"
              value={photoCredit}
              onChange={(e) => setPhotoCredit(e.target.value)}
              placeholder="@photographer — appended when you copy"
              className="input text-xs py-1.5"
              list={`credits-${template.id}`}
            />
            {knownCredits.length > 0 && (
              <datalist id={`credits-${template.id}`}>
                {knownCredits.map((c) => <option key={c} value={c} />)}
              </datalist>
            )}
            {photoCredit && (
              <p className="text-xs text-stone-400 mt-1">
                Will append: 📷 {photoCredit.startsWith('@') ? photoCredit : `@${photoCredit}`}
              </p>
            )}
          </div>

          {template.option1 && (
            <CaptionBlock
              label="Option 1 — Instagram / Facebook"
              text={template.option1}
              isCopied={copied?.id === template.id && copied?.which === 'option1'}
              onCopy={() => copyWithCredit(template.option1!, 'option1')}
            />
          )}
          {template.option2 && (
            <CaptionBlock
              label="Option 2 — TikTok"
              text={template.option2}
              isCopied={copied?.id === template.id && copied?.which === 'option2'}
              onCopy={() => copyWithCredit(template.option2!, 'option2')}
            />
          )}
          {template.hashtags.length > 0 && (
            <div>
              <p className="text-xs text-stone-400 mb-1.5">Hashtags</p>
              <div className="flex flex-wrap gap-1.5">
                {template.hashtags.map((tag) => (
                  <span key={tag} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button
              onClick={onDelete}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Delete template
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CaptionBlock({
  label,
  text,
  isCopied,
  onCopy,
}: {
  label: string
  text: string
  isCopied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-stone-500">{label}</p>
        <button
          onClick={onCopy}
          className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
            isCopied
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50 rounded-lg px-3 py-3">
        {text}
      </p>
    </div>
  )
}

function EmptyState({ onNew, hasFilter }: { onNew: () => void; hasFilter: boolean }) {
  return (
    <div className="card p-12 text-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
        <CaptionsIcon className="w-6 h-6 text-stone-400" />
      </div>
      <h3 className="text-sm font-semibold text-stone-900 mb-1">
        {hasFilter ? 'No templates for this pillar' : 'No caption templates saved'}
      </h3>
      <p className="text-sm text-stone-500 mb-5 max-w-xs mx-auto">
        {hasFilter
          ? 'Try a different pillar or clear the filter.'
          : 'When you find a caption structure that works, save it here. Reuse what earns.'}
      </p>
      {!hasFilter && (
        <button onClick={onNew} className="btn-primary">
          <PlusIcon className="w-4 h-4" />
          Create your first template
        </button>
      )}
    </div>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CaptionsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
