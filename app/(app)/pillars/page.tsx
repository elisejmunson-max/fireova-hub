'use client'

import { useState, useEffect, useRef } from 'react'
import { PILLAR_COLORS, SUB_PILLARS, SUB_PILLAR_ITEMS, PILLARS as DEFAULT_PILLARS } from '@/lib/constants'

const LS_PILLARS_KEY          = 'fireova_pillars'
const LS_SUB_PILLARS_KEY      = 'fireova_sub_pillars'
const LS_SUB_PILLAR_ITEMS_KEY = 'fireova_sub_pillar_items'

const PILLAR_COLOR_LIST = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-orange-100 text-orange-700',
  'bg-red-100 text-red-700',
  'bg-emerald-100 text-emerald-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-indigo-100 text-indigo-700',
]
function pickColor(i: number) { return PILLAR_COLOR_LIST[i % PILLAR_COLOR_LIST.length] }

// ── Inline editable label ─────────────────────────────────────────────────────
function InlineEdit({ value, onSave, className = '' }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)

  function commit() {
    const t = draft.trim()
    if (t && t !== value) onSave(t); else setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        className={`outline-none border-b border-ember-400 bg-transparent min-w-0 ${className}`}
        style={{ width: Math.max(draft.length, 3) + 'ch' }}
      />
    )
  }
  return (
    <span onClick={() => { setDraft(value); setEditing(true) }} title="Click to rename"
      className={`cursor-pointer hover:opacity-60 transition-opacity ${className}`}>
      {value}
    </span>
  )
}

// ── Quick add input ────────────────────────────────────────────────────────────
function QuickAdd({ placeholder, onAdd, onCancel }: { placeholder: string; onAdd: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  function submit() { const t = text.trim(); if (t) onAdd(t); else onCancel() }
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="inline-flex items-center gap-1">
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (!text.trim()) onCancel() }}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        placeholder={placeholder}
        className="text-xs border border-stone-300 rounded-full px-2 py-0.5 outline-none focus:border-ember-400 w-28"
      />
      <button type="submit" className="text-xs text-ember-600 font-medium hover:text-ember-700">Add</button>
      <button type="button" onClick={onCancel} className="text-xs text-stone-400 hover:text-stone-600">✕</button>
    </form>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function PillarsPage() {
  const [pillars,       setPillars]       = useState<string[]>([...DEFAULT_PILLARS])
  const [editableSubs,  setEditableSubs]  = useState<Record<string, string[]>>(
    Object.fromEntries(DEFAULT_PILLARS.map((p) => [p, SUB_PILLARS[p] ?? []]))
  )
  const [editableItems, setEditableItems] = useState<Record<string, string[]>>({ ...SUB_PILLAR_ITEMS })
  const [expandedSubs,  setExpandedSubs]  = useState<Set<string>>(new Set())
  const [addingSubFor,  setAddingSubFor]  = useState<string | null>(null)
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null)
  const [addingPillar,  setAddingPillar]  = useState(false)

  useEffect(() => {
    try { const p = localStorage.getItem(LS_PILLARS_KEY); if (p) setPillars(JSON.parse(p)) } catch {}
    try {
      const s = localStorage.getItem(LS_SUB_PILLARS_KEY)
      if (s) setEditableSubs((prev) => ({ ...prev, ...JSON.parse(s) }))
    } catch {}
    try {
      const i = localStorage.getItem(LS_SUB_PILLAR_ITEMS_KEY)
      if (i) setEditableItems((prev) => ({ ...SUB_PILLAR_ITEMS, ...prev, ...JSON.parse(i) }))
    } catch {}
  }, [])

  // saves
  function savePillars(next: string[]) { setPillars(next); localStorage.setItem(LS_PILLARS_KEY, JSON.stringify(next)) }
  function saveSubs(u: Record<string, string[]>) { setEditableSubs(u); localStorage.setItem(LS_SUB_PILLARS_KEY, JSON.stringify(u)) }
  function saveItems(u: Record<string, string[]>) { setEditableItems(u); localStorage.setItem(LS_SUB_PILLAR_ITEMS_KEY, JSON.stringify(u)) }

  // pillars
  function addPillar(name: string) {
    if (pillars.includes(name)) return
    const next = [...pillars, name]; savePillars(next)
    saveSubs({ ...editableSubs, [name]: [] }); setAddingPillar(false)
  }
  function removePillar(name: string) { savePillars(pillars.filter((p) => p !== name)) }
  function renamePillar(old: string, next: string) {
    if (pillars.includes(next)) return
    savePillars(pillars.map((p) => (p === old ? next : p)))
    const ns = { ...editableSubs, [next]: editableSubs[old] ?? [] }; delete ns[old]; saveSubs(ns)
  }

  // subs
  function addSub(pillar: string, name: string) { saveSubs({ ...editableSubs, [pillar]: [...(editableSubs[pillar] ?? []), name] }); setAddingSubFor(null) }
  function removeSub(pillar: string, sub: string) { saveSubs({ ...editableSubs, [pillar]: editableSubs[pillar].filter((s) => s !== sub) }) }
  function renameSub(pillar: string, old: string, next: string) {
    saveSubs({ ...editableSubs, [pillar]: editableSubs[pillar].map((s) => (s === old ? next : s)) })
    if (editableItems[old]) { const ni = { ...editableItems, [next]: editableItems[old] }; delete ni[old]; saveItems(ni) }
  }

  // items
  function addItem(sub: string, name: string) { saveItems({ ...editableItems, [sub]: [...(editableItems[sub] ?? []), name] }); setAddingItemFor(null) }
  function removeItem(sub: string, item: string) {
    const next = (editableItems[sub] ?? []).filter((i) => i !== item)
    if (next.length === 0) { const c = { ...editableItems }; delete c[sub]; saveItems(c) }
    else saveItems({ ...editableItems, [sub]: next })
  }
  function renameItem(sub: string, old: string, next: string) {
    saveItems({ ...editableItems, [sub]: (editableItems[sub] ?? []).map((i) => (i === old ? next : i)) })
  }

  function toggleSub(sub: string) {
    setExpandedSubs((prev) => { const n = new Set(prev); n.has(sub) ? n.delete(sub) : n.add(sub); return n })
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="text-xl font-semibold text-stone-900">Content Pillars</h1>
        <p className="text-stone-500 text-sm mt-0.5">Click any name to rename. Use × to remove. Expand a sub-pillar to manage its items.</p>
      </div>

      <div className="page-content max-w-2xl space-y-2">
        {pillars.map((name, pi) => {
          const color = PILLAR_COLORS[name] ?? pickColor(pi)
          const subs  = editableSubs[name] ?? []

          return (
            <div key={name} className="card p-3">
              {/* Pillar row */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${color}`}>
                  <InlineEdit value={name} onSave={(v) => renamePillar(name, v)} className="font-semibold" />
                </span>
                <span className="text-xs text-stone-400 flex-1">{subs.length} sub-pillar{subs.length !== 1 ? 's' : ''}</span>
                <button onClick={() => removePillar(name)} className="text-stone-300 hover:text-red-400 transition-colors" title="Remove pillar">
                  <XIcon />
                </button>
              </div>

              {/* Sub-pillars as chips */}
              <div className="flex flex-wrap gap-1.5 items-center pl-1">
                {subs.map((sub) => {
                  const items    = editableItems[sub] ?? []
                  const expanded = expandedSubs.has(sub)

                  return (
                    <div key={sub} className="inline-flex flex-col gap-1">
                      {/* Sub chip */}
                      <span className="inline-flex items-center gap-1 text-xs bg-stone-50 border border-stone-200 text-stone-700 px-2 py-0.5 rounded-full">
                        <InlineEdit value={sub} onSave={(v) => renameSub(name, sub, v)} />
                        {/* Toggle items button */}
                        <button
                          onClick={() => toggleSub(sub)}
                          title={expanded ? 'Hide items' : `${items.length} item${items.length !== 1 ? 's' : ''}`}
                          className="text-stone-300 hover:text-ember-500 transition-colors ml-0.5"
                        >
                          {expanded ? <ChevronUpIcon /> : <ChevronDownIcon count={items.length} />}
                        </button>
                        <button onClick={() => removeSub(name, sub)} className="text-stone-300 hover:text-red-400 transition-colors" title="Remove">
                          <XSmIcon />
                        </button>
                      </span>

                      {/* Items — shown when expanded */}
                      {expanded && (
                        <div className="flex flex-wrap gap-1 pl-1 items-center">
                          {items.map((item) => (
                            <span key={item} className="inline-flex items-center gap-0.5 text-[11px] bg-orange-50 border border-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                              <InlineEdit value={item} onSave={(v) => renameItem(sub, item, v)} />
                              <button onClick={() => removeItem(sub, item)} className="text-orange-300 hover:text-red-400 transition-colors"><XSmIcon /></button>
                            </span>
                          ))}
                          {addingItemFor === sub ? (
                            <QuickAdd placeholder="New item…" onAdd={(t) => addItem(sub, t)} onCancel={() => setAddingItemFor(null)} />
                          ) : (
                            <button onClick={() => setAddingItemFor(sub)}
                              className="text-[11px] text-stone-300 hover:text-orange-500 border border-dashed border-stone-200 hover:border-orange-300 px-1.5 py-0.5 rounded-full transition-colors">
                              + item
                            </button>
                          )}
                          {SUB_PILLAR_ITEMS[sub] && (
                            <button onClick={() => saveItems({ ...editableItems, [sub]: SUB_PILLAR_ITEMS[sub] })}
                              className="text-[11px] text-stone-300 hover:text-stone-500 transition-colors ml-0.5">
                              Reset
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Add sub-pillar */}
                {addingSubFor === name ? (
                  <QuickAdd placeholder="New sub-pillar…" onAdd={(t) => addSub(name, t)} onCancel={() => setAddingSubFor(null)} />
                ) : (
                  <button onClick={() => setAddingSubFor(name)}
                    className="text-xs text-stone-400 hover:text-ember-500 border border-dashed border-stone-300 hover:border-ember-400 px-2 py-0.5 rounded-full transition-colors">
                    + sub
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* Add pillar */}
        {addingPillar ? (
          <QuickAdd placeholder="New pillar…" onAdd={addPillar} onCancel={() => setAddingPillar(false)} />
        ) : (
          <button onClick={() => setAddingPillar(true)}
            className="w-full text-sm text-stone-400 hover:text-ember-600 border border-dashed border-stone-300 hover:border-ember-400 px-4 py-2 rounded-xl transition-colors">
            + Add pillar
          </button>
        )}
      </div>
    </div>
  )
}

function XIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
}
function XSmIcon() {
  return <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
}
function ChevronUpIcon() {
  return <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
}
function ChevronDownIcon({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {count > 0 && <span className="text-[9px] font-medium">{count}</span>}
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
    </span>
  )
}
