'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const CATEGORIES = ['Catering Coordinator', 'Oven/Driver', 'Pizza Cook', 'Prep'] as const
type Category = typeof CATEGORIES[number]

interface Section {
  heading: string
  body: string
}

interface Manual {
  id: string
  user_id: string
  title: string
  category: Category
  sections: Section[]
  created_at: string
  updated_at: string
}

type ManualForm = Omit<Manual, 'id' | 'user_id' | 'created_at' | 'updated_at'>

const EMPTY_FORM: ManualForm = {
  title: '',
  category: 'Catering Coordinator',
  sections: [{ heading: '', body: '' }],
}

const CATEGORY_COLORS: Record<Category, string> = {
  'Catering Coordinator': 'bg-blue-100 text-blue-700',
  'Oven/Driver': 'bg-orange-100 text-orange-700',
  'Pizza Cook': 'bg-red-100 text-red-700',
  'Prep': 'bg-emerald-100 text-emerald-700',
}

export default function TrainingPage() {
  const [manuals, setManuals] = useState<Manual[]>([])
  const [selected, setSelected] = useState<Manual | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    loadManuals()
  }, [])

  async function loadManuals() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('training_manuals')
      .select('*')
      .eq('user_id', user.id)
      .order('title')

    setManuals(data ?? [])
    setLoading(false)
  }

  function openManual(manual: Manual) {
    setSelected(manual)
    setIsNew(false)
    setMode('view')
    setForm({
      title: manual.title,
      category: manual.category as Category,
      sections: manual.sections?.length ? manual.sections : [{ heading: '', body: '' }],
    })
    setConfirmDelete(false)
    setError(null)
    setSaved(false)
  }

  function openNew() {
    setSelected(null)
    setIsNew(true)
    setMode('edit')
    setForm(EMPTY_FORM)
    setConfirmDelete(false)
    setError(null)
    setSaved(false)
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setSaving(false); return }

    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      category: form.category,
      sections: form.sections.filter((s) => s.heading.trim() || s.body.trim()),
      updated_at: new Date().toISOString(),
    }

    if (isNew) {
      const { data, error: err } = await supabase.from('training_manuals').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      const created = data as Manual
      setManuals((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title)))
      setSelected(created)
      setIsNew(false)
      setMode('view')
    } else if (selected) {
      const { data, error: err } = await supabase
        .from('training_manuals')
        .update(payload)
        .eq('id', selected.id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      const updated = data as Manual
      setManuals((prev) => prev.map((m) => m.id === updated.id ? updated : m).sort((a, b) => a.title.localeCompare(b.title)))
      setSelected(updated)
      setMode('view')
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('training_manuals').delete().eq('id', selected.id)
    if (err) { setError(err.message); setDeleting(false); return }
    setManuals((prev) => prev.filter((m) => m.id !== selected.id))
    setSelected(null)
    setIsNew(false)
    setConfirmDelete(false)
    setDeleting(false)
  }

  // Section helpers
  function updateSection(index: number, field: keyof Section, value: string) {
    setForm((prev) => {
      const next = [...prev.sections]
      next[index] = { ...next[index], [field]: value }
      return { ...prev, sections: next }
    })
  }
  function addSection() {
    setForm((prev) => ({ ...prev, sections: [...prev.sections, { heading: '', body: '' }] }))
  }
  function removeSection(index: number) {
    setForm((prev) => ({ ...prev, sections: prev.sections.filter((_, i) => i !== index) }))
  }
  function moveSection(index: number, direction: -1 | 1) {
    setForm((prev) => {
      const next = [...prev.sections]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, sections: next }
    })
  }

  // Group manuals by category
  const grouped = CATEGORIES.reduce<Record<string, Manual[]>>((acc, cat) => {
    const items = manuals.filter((m) => m.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  const showPanel = isNew || selected !== null

  return (
    <div>
      <div className="page-header">
        <h1 className="text-xl font-semibold text-stone-900">Training Manuals</h1>
        <p className="text-stone-500 text-sm mt-0.5">Document processes and training materials for the Fireova team.</p>
      </div>

      <div className="page-content">
        <div className="flex gap-5 items-start">
          {/* Left panel */}
          <div className="w-56 flex-shrink-0">
            <button
              onClick={openNew}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-ember-600 hover:bg-ember-700 text-white text-sm font-medium transition-colors mb-4"
            >
              <PlusIcon className="w-4 h-4" />
              New Manual
            </button>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-stone-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : manuals.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">No manuals yet.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(grouped).map(([cat, items]) => (
                  <div key={cat}>
                    <p className="text-[10px] font-semibold tracking-wider text-stone-400 uppercase px-1 mb-1">{cat}</p>
                    <div className="space-y-0.5">
                      {items.map((manual) => {
                        const isActive = selected?.id === manual.id && !isNew
                        return (
                          <button
                            key={manual.id}
                            onClick={() => openManual(manual)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                              isActive
                                ? 'bg-stone-800 text-white'
                                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                            }`}
                          >
                            {manual.title}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="flex-1 min-w-0">
            {!showPanel ? (
              <div className="card p-10 flex flex-col items-center justify-center text-center min-h-[320px]">
                <BookIcon className="w-10 h-10 text-stone-300 mb-3" />
                <p className="text-stone-500 text-sm font-medium">Select a manual or create a new one</p>
                <p className="text-stone-400 text-xs mt-1">Keep your team aligned with clear, accessible documentation.</p>
              </div>
            ) : (
              <div className="card p-6 space-y-5">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-stone-900">
                      {isNew ? 'New Manual' : form.title || 'Untitled Manual'}
                    </h2>
                    {!isNew && selected && (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[selected.category as Category]}`}>
                        {selected.category}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {saved && (
                      <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                        <CheckIcon className="w-4 h-4" />
                        Saved
                      </span>
                    )}

                    {/* View / Edit toggle */}
                    {!isNew && (
                      <div className="flex items-center rounded-lg border border-stone-200 overflow-hidden text-xs font-medium">
                        <button
                          onClick={() => setMode('view')}
                          className={`px-3 py-1.5 transition-colors ${mode === 'view' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
                        >
                          View
                        </button>
                        <button
                          onClick={() => setMode('edit')}
                          className={`px-3 py-1.5 transition-colors ${mode === 'edit' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
                        >
                          Edit
                        </button>
                      </div>
                    )}

                    {!isNew && !confirmDelete && mode === 'edit' && (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="text-xs text-stone-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )}
                    {confirmDelete && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500">Are you sure?</span>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          {deleting ? 'Deleting...' : 'Yes, delete'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="text-xs text-stone-500 hover:text-stone-700 px-2 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {(isNew || mode === 'edit') && (
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ember-600 hover:bg-ember-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                      >
                        {saving && <Spinner />}
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                {/* VIEW MODE */}
                {mode === 'view' && selected && !isNew && (
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-2xl font-bold text-stone-900">{selected.title}</h1>
                      <span className={`inline-block mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full ${CATEGORY_COLORS[selected.category as Category]}`}>
                        {selected.category}
                      </span>
                    </div>
                    {selected.sections.filter((s) => s.heading || s.body).length === 0 ? (
                      <p className="text-sm text-stone-400 italic">No sections added yet. Switch to Edit to add content.</p>
                    ) : (
                      <div className="space-y-6">
                        {selected.sections.filter((s) => s.heading || s.body).map((section, idx) => (
                          <div key={idx}>
                            {section.heading && (
                              <h3 className="text-base font-semibold text-stone-800 mb-2">{section.heading}</h3>
                            )}
                            {section.body && (
                              <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">{section.body}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* EDIT MODE */}
                {(mode === 'edit' || isNew) && (
                  <div className="space-y-5">
                    {/* Title + Category */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Title <span className="text-red-400">*</span></label>
                        <input
                          type="text"
                          value={form.title}
                          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                          placeholder="e.g. Oven Operations Guide"
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">Category</label>
                        <select
                          value={form.category}
                          onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as Category }))}
                          className="input"
                        >
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Sections */}
                    <div>
                      <label className="label">Sections</label>
                      <div className="space-y-4">
                        {form.sections.map((section, idx) => (
                          <div key={idx} className="rounded-xl border border-stone-200 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Section {idx + 1}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => moveSection(idx, -1)}
                                  disabled={idx === 0}
                                  className="text-stone-300 hover:text-stone-500 disabled:opacity-30 p-1 transition-colors"
                                  title="Move up"
                                >
                                  <ChevronUpIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => moveSection(idx, 1)}
                                  disabled={idx === form.sections.length - 1}
                                  className="text-stone-300 hover:text-stone-500 disabled:opacity-30 p-1 transition-colors"
                                  title="Move down"
                                >
                                  <ChevronDownIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => removeSection(idx)}
                                  className="text-stone-300 hover:text-red-400 p-1 transition-colors"
                                  title="Remove section"
                                >
                                  <XIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <input
                              type="text"
                              value={section.heading}
                              onChange={(e) => updateSection(idx, 'heading', e.target.value)}
                              placeholder="Section heading"
                              className="input"
                            />
                            <textarea
                              value={section.body}
                              onChange={(e) => updateSection(idx, 'body', e.target.value)}
                              placeholder="Section content..."
                              rows={4}
                              className="input resize-none"
                            />
                          </div>
                        ))}
                        <button
                          onClick={addSection}
                          className="text-xs text-stone-400 hover:text-ember-600 border border-dashed border-stone-300 hover:border-ember-400 px-3 py-1.5 rounded-lg w-full transition-colors"
                        >
                          + Add section
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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
