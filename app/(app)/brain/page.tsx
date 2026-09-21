'use client'

import { useEffect, useMemo, useState } from 'react'

type BrainTopic = { id: string; topic: string; facts: string[] }

export default function BrainPage() {
  const [topics, setTopics] = useState<BrainTopic[]>([])
  const [topic, setTopic] = useState('')
  const [fact, setFact] = useState('')
  const [search, setSearch] = useState('')
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
    const cleanTopic = selectedTopic.trim()
    const cleanFact = selectedFact.trim()
    if (!cleanTopic || !cleanFact) {
      setMessage('Enter both the item and what Fireova knows about it.')
      return false
    }
    setSaving(true)
    setMessage('Saving…')
    try {
      const response = await fetch('/api/fireova-brain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: cleanTopic, fact: cleanFact }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not save')
      setTopic('')
      setFact('')
      setMessage('Saved ✓')
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
    setMessage('Detail removed')
    await load()
  }

  const visibleTopics = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return topics
    return topics.filter((item) => item.topic.toLowerCase().includes(query) || item.facts.some((itemFact) => itemFact.toLowerCase().includes(query)))
  }, [search, topics])

  const factCount = topics.reduce((total, item) => total + item.facts.length, 0)

  return <div>
    <div className="page-header py-4"><h1 className="text-xl font-semibold">Fireova Brain</h1><p className="mt-1 text-sm text-stone-500">Details the caption writer can use.</p></div>
    <div className="page-content">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Add knowledge</h2><p className="mt-0.5 text-xs text-stone-500">Add one detail at a time, or separate several details with semicolons.</p></div>{message && <span className="text-xs text-stone-500">{message}</span>}</div>
          <div className="grid gap-2 md:grid-cols-[220px_1fr_auto]"><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Item name" className="rounded-lg border px-3 py-2 text-sm" /><input value={fact} onChange={(event) => setFact(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add() }} placeholder="What should the Brain know?" className="rounded-lg border px-3 py-2 text-sm" /><button disabled={saving} onClick={() => void add()} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : '+ Add'}</button></div>
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold text-stone-900">What Fireova knows</h2>{!loading && !loadError && <p className="mt-0.5 text-xs text-stone-500">{topics.length} {topics.length === 1 ? 'item' : 'items'} · {factCount} individual {factCount === 1 ? 'detail' : 'details'}</p>}</div>{topics.length > 3 && <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" className="rounded-lg border bg-white px-3 py-2 text-sm sm:w-60" />}</div>
          {loading && <p className="rounded-xl border bg-white px-4 py-5 text-sm text-stone-500">Loading saved items…</p>}
          {!loading && loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4"><p className="text-sm font-medium text-red-800">Saved items could not be loaded.</p><p className="mt-1 text-xs text-red-700">{loadError}</p><button onClick={() => void load()} className="mt-2 text-xs font-semibold text-red-700 underline">Try again</button></div>}
          {!loading && !loadError && topics.length === 0 && <p className="rounded-xl border bg-white px-4 py-5 text-sm text-stone-500">Nothing has been saved yet.</p>}
          {!loading && !loadError && topics.length > 0 && visibleTopics.length === 0 && <p className="rounded-xl border bg-white px-4 py-5 text-sm text-stone-500">No saved items match “{search}.”</p>}
          {!loading && !loadError && visibleTopics.length > 0 && <div className="overflow-hidden rounded-xl border bg-white">{visibleTopics.map((item, itemIndex) => <article key={item.id} className={`grid gap-3 p-4 md:grid-cols-[190px_1fr] ${itemIndex ? 'border-t' : ''}`}>
            <div><h3 className="font-semibold text-stone-900">{item.topic}</h3><p className="mt-0.5 text-xs text-stone-400">{item.facts.length} {item.facts.length === 1 ? 'detail' : 'details'}</p></div>
            <div><div className="flex flex-wrap gap-2">{item.facts.map((itemFact) => <div key={itemFact} className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-sm text-stone-700"><span>{itemFact}</span><button onClick={() => void remove(item.id, itemFact)} aria-label={`Delete ${itemFact}`} title="Delete this detail" className="text-base leading-none text-stone-400 hover:text-red-600">×</button></div>)}</div><AddDetail topic={item.topic} onAdd={add} saving={saving} /></div>
          </article>)}</div>}
        </section>
      </div>
    </div>
  </div>
}

function AddDetail({ topic, onAdd, saving }: { topic: string; onAdd: (topic: string, fact: string) => Promise<boolean>; saving: boolean }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  async function submit() {
    if (!value.trim()) return
    if (await onAdd(topic, value)) { setValue(''); setOpen(false) }
  }
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-orange-700">+ Add a detail</button>
  return <div className="mt-2 flex gap-2"><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); if (event.key === 'Escape') setOpen(false) }} placeholder="Add another detail…" className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm" /><button disabled={saving || !value.trim()} onClick={() => void submit()} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Save</button><button onClick={() => setOpen(false)} className="px-2 text-xs text-stone-500">Cancel</button></div>
}
