'use client'

import { useState } from 'react'

type ReviewItem = {
  id: string
  kind: 'Photo' | 'Video'
  status: 'Strong' | 'Edit' | 'Skip'
  title: string
  reason: string
  categories: string[]
  uses: string[]
  edit?: string
}

const ITEMS: ReviewItem[] = [
  { id: '1', kind: 'Photo', status: 'Strong', title: 'Happy guests near the oven', reason: 'Faces are visible, the energy feels warm, and the Fireova experience is obvious without explanation.', categories: ['People', 'Experience', 'Wedding'], uses: ['Reel cover', 'Feed photo', 'Carousel opener'] },
  { id: '2', kind: 'Photo', status: 'Edit', title: 'Buffet + grazing table detail', reason: 'Strong composition and useful food detail, but the image needs a quick lighting/color correction before posting.', categories: ['Food', 'Charcuterie', 'Details'], uses: ['Feed photo', 'Carousel detail'], edit: 'Correct white balance, lift shadows, keep food color natural.' },
  { id: '3', kind: 'Video', status: 'Strong', title: 'Pizza coming out of the oven', reason: 'Clear action, good movement, and an immediate wood-fired cue. Strong short-form video moment.', categories: ['Pizza', 'Process', 'Experience'], uses: ['Reel opening', 'B-roll', 'Story'] },
  { id: '4', kind: 'Photo', status: 'Skip', title: 'Soft duplicate from the same moment', reason: 'The subject is slightly soft and a stronger version of this same moment already exists.', categories: ['Duplicate'], uses: [] },
]

const style = {
  Strong: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Edit: 'bg-amber-50 text-amber-700 border-amber-200',
  Skip: 'bg-stone-100 text-stone-500 border-stone-200',
}

export default function MediaIntelligencePreview() {
  const [selected, setSelected] = useState(ITEMS[0])
  return (
    <section className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">AI Media Review</p>
          <h1 className="text-xl font-semibold text-stone-900 mt-1">Drop the event. We sort the content.</h1>
          <p className="text-sm text-stone-500 mt-1 max-w-2xl">Every photo and video gets a quality decision, a reason, content categories, and suggested post uses. You only spend editing time on content worth keeping.</p>
        </div>
        <span className="badge bg-ember-50 text-ember-700 whitespace-nowrap">Preview workflow</span>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-3 border-b border-stone-100 bg-stone-50/60">
          <div className="p-4 text-center"><p className="text-2xl font-semibold text-emerald-600">2</p><p className="text-xs text-stone-500 mt-1">Strong</p></div>
          <div className="p-4 text-center border-x border-stone-100"><p className="text-2xl font-semibold text-amber-600">1</p><p className="text-xs text-stone-500 mt-1">Worth editing</p></div>
          <div className="p-4 text-center"><p className="text-2xl font-semibold text-stone-500">1</p><p className="text-xs text-stone-500 mt-1">Skip</p></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] min-h-[350px]">
          <div className="divide-y divide-stone-100 border-r border-stone-100">
            {ITEMS.map((item) => (
              <button key={item.id} onClick={() => setSelected(item)} className={`w-full p-4 text-left hover:bg-stone-50 transition ${selected.id === item.id ? 'bg-stone-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-16 h-14 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-xs text-stone-400 flex-shrink-0">{item.kind === 'Video' ? '▶ Video' : 'Photo'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-stone-900 truncate">{item.title}</p><span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${style[item.status]}`}>{item.status === 'Edit' ? 'EDIT FIRST' : item.status.toUpperCase()}</span></div>
                    <p className="text-xs text-stone-500 mt-1 line-clamp-2">{item.reason}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">{item.categories.slice(0,3).map(c => <span key={c} className="badge bg-stone-100 text-stone-500">{c}</span>)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="p-5 bg-white">
            <div className="aspect-[4/3] rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 mb-4">Selected media preview</div>
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">AI decision</p><p className="text-base font-semibold text-stone-900 mt-1">{selected.status === 'Edit' ? 'Usable after edit' : selected.status}</p></div><span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${style[selected.status]}`}>{selected.status === 'Edit' ? 'EDIT FIRST' : selected.status.toUpperCase()}</span></div>
            <p className="text-sm leading-6 text-stone-600 mt-3">{selected.reason}</p>
            {selected.edit && <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Suggested edit</p><p className="text-xs leading-5 text-amber-900 mt-1">{selected.edit}</p></div>}
            {selected.uses.length > 0 && <div className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Best uses</p><div className="flex flex-wrap gap-2">{selected.uses.map(u => <span key={u} className="badge bg-ember-50 text-ember-700">{u}</span>)}</div></div>}
            <div className="mt-5 pt-4 border-t border-stone-100 flex gap-2"><button className="btn-secondary flex-1 justify-center">Change decision</button><button className="btn-primary flex-1 justify-center">Keep learning</button></div>
          </div>
        </div>
      </div>
    </section>
  )
}
