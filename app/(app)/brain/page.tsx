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
      return
    }
    setSaving(true)
    setMessage('Saving…')
    try {
      const response = await fetch('/api/fireova-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: cleanTopic, fact: cleanFact }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not save')
      setTopic('')
      setFact('')
      setMessage('Saved to Fireova Brain ✓')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string, itemFact: string) {
    const response = await fetch('/api/fireova-brain', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fact: itemFact }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(data.error || 'Could not delete that fact')
      return
    }
    setMessage('Removed from Fireova Brain')
    await load()
  }

  const visibleTopics = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return topics
    return topics.filter((item) => item.topic.toLowerCase().includes(query) || item.facts.some((itemFact) => itemFact.toLowerCase().includes(query)))
  }, [search, topics])

  const factCount = topics.reduce((total, item) => total + item.facts.length, 0)

  return <div>
    <div className="page-header py-4">
      <h1 className="text-xl font-semibold">Fireova Brain</h1>
      <p className="mt-1 text-sm text-stone-500">The Fireova details your caption writer can use.</p>
    </div>
    <div className="page-content">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-sm font-semibold">Teach the Brain something</p>
          <p className="mt-1 text-xs text-stone-500">Add the item first, then tell us what is important about it.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]">
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Item, like Stuffed Mushrooms" className="rounded-xl border px-3 py-2.5 text-sm" />
            <input value={fact} onChange={(event) => setFact(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add() }} placeholder="What should the Brain know?" className="rounded-xl border px-3 py-2.5 text-sm" />
            <button disabled={saving} onClick={() => void add()} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : '+ Add'}</button>
          </div>
          {message && <p className="mt-2 text-xs text-stone-500">{message}</p>}
        </div>

        <section className="rounded-2xl border bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-stone-900">What Fireova knows</h2>
              {!loading && !loadError && <p className="mt-1 text-xs text-stone-500">{topics.length} {topics.length === 1 ? 'item' : 'items'} · {factCount} saved {factCount === 1 ? 'detail' : 'details'}</p>}
            </div>
            {topics.length > 3 && <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved items…" className="rounded-xl border px-3 py-2 text-sm sm:w-64" />}
          </div>

          {loading && <div className="mt-5 rounded-xl bg-stone-50 px-4 py-5 text-sm text-stone-500">Loading saved Brain items…</div>}

          {!loading && loadError && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-4"><p className="text-sm font-medium text-red-800">The saved Brain items could not be loaded.</p><p className="mt-1 text-xs text-red-700">{loadError}</p><button onClick={() => void load()} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700">Try again</button></div>}

          {!loading && !loadError && topics.length === 0 && <div className="mt-5 rounded-xl bg-stone-50 px-4 py-5"><p className="text-sm font-medium text-stone-700">Nothing has been saved yet.</p><p className="mt-1 text-xs text-stone-500">Add an item and a detail above. Once saved, it will appear here and can be used when captions are created.</p></div>}

          {!loading && !loadError && topics.length > 0 && visibleTopics.length === 0 && <div className="mt-5 rounded-xl bg-stone-50 px-4 py-5 text-sm text-stone-500">No saved items match “{search}.”</div>}

          {!loading && !loadError && visibleTopics.length > 0 && <div className="mt-5 space-y-4">{visibleTopics.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-stone-200">
            <div className="border-b bg-stone-50 px-4 py-3"><h3 className="font-semibold text-stone-900">{item.topic}</h3><p className="mt-0.5 text-xs text-stone-500">{item.facts.length} saved {item.facts.length === 1 ? 'detail' : 'details'}</p></div>
            <div className="space-y-2 p-4">{item.facts.length > 0 ? item.facts.map((itemFact) => <div key={itemFact} className="flex items-start justify-between gap-3 rounded-lg bg-orange-50/60 px-3 py-2.5"><p className="text-sm leading-5 text-stone-700">{itemFact}</p><button onClick={() => void remove(item.id, itemFact)} className="shrink-0 text-xs font-medium text-stone-400 hover:text-red-600">Delete</button></div>) : <p className="text-sm text-stone-500">No details saved for this item.</p>}
              <AddAnother topic={item.topic} onAdd={add} saving={saving} />
            </div>
          </article>)}</div>}
        </section>
      </div>
    </div>
  </div>
}

function AddAnother({ topic, onAdd, saving }: { topic: string; onAdd: (topic: string, fact: string) => Promise<void>; saving: boolean }) {
  const [value, setValue] = useState('')
  async function submit() {
    if (!value.trim()) return
    await onAdd(topic, value)
    setValue('')
  }
  return <div className="mt-3 flex gap-2"><input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit() }} placeholder={`Add another detail about ${topic}…`} className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" /><button disabled={saving || !value.trim()} onClick={() => void submit()} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:opacity-40">Add detail</button></div>
}
