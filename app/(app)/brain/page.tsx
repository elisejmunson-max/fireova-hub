'use client'

import { useEffect, useState } from 'react'

type BrainTopic = { id: string; topic: string; facts: string[] }

export default function BrainPage() {
  const [topics, setTopics] = useState<BrainTopic[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [topic, setTopic] = useState('')
  const [fact, setFact] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/fireova-brain', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not load Fireova Brain')
      setTopics(data.topics || [])
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load Fireova Brain')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function add(selectedTopic = topic, selectedFact = fact) {
    if (!selectedTopic.trim() || !selectedFact.trim()) {
      setMessage('Add an item name and at least one detail.')
      return false
    }
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/fireova-brain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: selectedTopic.trim(), fact: selectedFact.trim() }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not save')
      setTopic('')
      setFact('')
      setShowAdd(false)
      await load()
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string, itemFact: string) {
    const response = await fetch('/api/fireova-brain', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, fact: itemFact }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return setMessage(data.error || 'Could not delete that detail')
    await load()
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return <div>
    <div className="page-header py-4">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-xl font-semibold">Fireova Brain</h1><p className="mt-1 text-sm text-stone-500">What the caption writer knows about Fireova.</p></div>
        <button onClick={() => { setMessage(''); setShowAdd(true) }} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white">+ Add knowledge</button>
      </div>
    </div>

    <div className="page-content">
      <div className="mx-auto max-w-3xl">
        {loading && <p className="py-12 text-center text-sm text-stone-400">Loading…</p>}
        {!loading && loadError && <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-sm text-red-800">{loadError}</p><button onClick={() => void load()} className="mt-2 text-sm font-semibold text-red-700 underline">Try again</button></div>}
        {!loading && !loadError && topics.length === 0 && <div className="rounded-xl border bg-white px-6 py-10 text-center"><h2 className="font-semibold text-stone-800">Nothing saved yet</h2><p className="mt-1 text-sm text-stone-500">Add something you want the caption writer to remember.</p></div>}
        {!loading && !loadError && topics.length > 0 && <div className="space-y-3">{topics.map((item) => {
          const isOpen = expanded.has(item.id)
          return <article key={item.id} className="overflow-hidden rounded-xl border bg-white">
            <button onClick={() => toggle(item.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-stone-50">
              <div><h2 className="text-base font-semibold text-stone-900">{item.topic}</h2><p className="mt-0.5 text-xs text-stone-400">{item.facts.length} {item.facts.length === 1 ? 'detail' : 'details'}</p></div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-lg text-stone-500" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && <div className="border-t px-5 pb-4 pt-1"><ul className="divide-y divide-stone-100">{item.facts.map((itemFact) => <li key={itemFact} className="flex items-start gap-3 py-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" /><span className="flex-1 text-sm leading-5 text-stone-700">{itemFact}</span><button onClick={() => void remove(item.id, itemFact)} className="shrink-0 text-xs text-stone-400 hover:text-red-600">Remove</button></li>)}</ul><AddDetail topic={item.topic} onAdd={add} saving={saving} /></div>}
          </article>
        })}</div>}
      </div>
    </div>

    {showAdd && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false) }}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Add to Fireova Brain</h2><button onClick={() => setShowAdd(false)} className="text-2xl leading-none text-stone-400">×</button></div>
      <label className="mt-5 block text-sm font-medium text-stone-700">Item</label><input autoFocus value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Stuffed Mushrooms" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm" />
      <label className="mt-4 block text-sm font-medium text-stone-700">What should the caption writer know?</label><textarea value={fact} onChange={(event) => setFact(event.target.value)} placeholder="Add one detail per line" rows={5} className="mt-1 w-full resize-none rounded-lg border px-3 py-2.5 text-sm leading-6" />
      {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
      <div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowAdd(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-stone-600">Cancel</button><button disabled={saving} onClick={() => void add()} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button></div>
    </div></div>}
  </div>
}

function AddDetail({ topic, onAdd, saving }: { topic: string; onAdd: (topic: string, fact: string) => Promise<boolean>; saving: boolean }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  async function submit() { if (value.trim() && await onAdd(topic, value)) { setValue(''); setOpen(false) } }
  if (!open) return <button onClick={() => setOpen(true)} className="mt-3 text-sm font-medium text-orange-700">+ Add another detail</button>
  return <div className="mt-3 flex gap-2"><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); if (event.key === 'Escape') setOpen(false) }} placeholder="New detail" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button disabled={saving || !value.trim()} onClick={() => void submit()} className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save</button><button onClick={() => setOpen(false)} className="px-2 text-xs text-stone-500">Cancel</button></div>
}
