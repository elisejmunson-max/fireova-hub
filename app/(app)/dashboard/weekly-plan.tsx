'use client'

import { useState } from 'react'

type PreviewPost = {
  id: string
  day: string
  time: string
  format: string
  category: string
  title: string
  caption: string
  tags: string
  reason: string
  visual: string
}

const PREVIEW_POSTS: PreviewPost[] = [
  {
    id: 'experience',
    day: 'Tuesday',
    time: '11:30 AM',
    format: 'Reel',
    category: 'Experience',
    title: 'The part guests get to watch',
    caption: 'The best part of what we do isn’t the pizza… it’s watching people gather around it. 🍕🔥',
    tags: '#DFWCatering #EventCatering #WoodFiredPizza #FireovaPizza',
    reason: 'Strong people + experience moment. Leads the week with what makes Fireova feel different.',
    visual: 'Guests + oven + team interaction',
  },
  {
    id: 'food',
    day: 'Thursday',
    time: '6:15 PM',
    format: 'Photo',
    category: 'Food',
    title: 'A detail worth stopping for',
    caption: 'Meet the salami rose. 🌹 One of our favorite details on every grazing table. Each one has its own personality, and we love the way they bring the whole table together.',
    tags: '#GrazingTable #Charcuterie #DFWCatering #EventCatering',
    reason: 'Breaks up event content with a recognizable food detail and keeps the feed visually varied.',
    visual: 'Close-up food detail',
  },
  {
    id: 'inspiration',
    day: 'Saturday',
    time: '10:00 AM',
    format: 'Carousel',
    category: 'Planning Inspiration',
    title: 'Pizza, but make it part of the wedding',
    caption: 'Wedding decor, but make it pizza themed. 🍕🤍 From custom pizza boxes and personalized cutters to signed pizza peels and menus, there are so many fun ways to work pizza into the details of your wedding day. Save this one for a little pizza-themed wedding inspo.',
    tags: '#WeddingInspo #DFWWeddings #WeddingCatering #FireovaPizza',
    reason: 'Useful, saveable content. Adds wedding relevance without making the whole week wedding recaps.',
    visual: '3–5 decor/detail images',
  },
]

export default function WeeklyPlan() {
  const [statuses, setStatuses] = useState<Record<string, 'ready' | 'approved' | 'rejected'>>({
    experience: 'ready', food: 'ready', inspiration: 'ready',
  })
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const approve = (id: string) => setStatuses((s) => ({ ...s, [id]: 'approved' }))
  const reject = (id: string) => {
    if (rejecting !== id) { setRejecting(id); return }
    setStatuses((s) => ({ ...s, [id]: 'rejected' }))
    setRejecting(null)
  }

  return (
    <section>
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">This Week</h2>
          <p className="text-sm text-stone-500 mt-1">Three posts. Different jobs. One Fireova brand.</p>
        </div>
        <span className="badge bg-ember-50 text-ember-700">Preview recommendations</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {PREVIEW_POSTS.map((post) => {
          const status = statuses[post.id]
          return (
            <article key={post.id} className="card overflow-hidden flex flex-col">
              <div className="p-4 border-b border-stone-100 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-stone-900">{post.day}</span>
                    <span className="text-[11px] text-stone-400">{post.time}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="badge bg-stone-100 text-stone-600">{post.format}</span>
                    <span className="badge bg-ember-50 text-ember-700">{post.category}</span>
                  </div>
                </div>
                {status === 'approved' && <span className="text-xs font-semibold text-emerald-600">✓ Approved</span>}
                {status === 'rejected' && <span className="text-xs font-semibold text-red-500">Rejected</span>}
              </div>

              <div className="aspect-[4/3] bg-stone-100 border-b border-stone-200 flex flex-col items-center justify-center text-center px-6">
                <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-3 text-ember-600">{post.format === 'Reel' ? '▶' : post.format === 'Carousel' ? '▣' : '□'}</div>
                <p className="text-sm font-medium text-stone-700">{post.visual}</p>
                <p className="text-[11px] text-stone-400 mt-1">Actual selected media will replace this preview</p>
              </div>

              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-sm font-semibold text-stone-900">{post.title}</h3>
                <p className="text-sm leading-5 text-stone-600 mt-2 whitespace-pre-line">{post.caption}</p>
                <p className="text-xs leading-5 text-ember-700 mt-3">{post.tags}</p>

                <div className="mt-4 pt-3 border-t border-stone-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">Why this post</p>
                  <p className="text-xs leading-5 text-stone-500">{post.reason}</p>
                </div>

                {rejecting === post.id && status === 'ready' && (
                  <div className="mt-4 p-3 rounded-lg bg-stone-50 border border-stone-200">
                    <label className="text-xs font-semibold text-stone-700 block mb-2">Why isn’t this right?</label>
                    <textarea value={feedback[post.id] ?? ''} onChange={(e) => setFeedback((f) => ({ ...f, [post.id]: e.target.value }))} placeholder="Too wedding-heavy, wrong photo, caption sounds like AI..." className="input min-h-20 resize-none text-sm" />
                    <p className="text-[11px] text-stone-400 mt-2">This reason will become learning data when the real recommendation engine is connected.</p>
                  </div>
                )}

                <div className="mt-auto pt-4 flex gap-2">
                  {status === 'ready' ? <>
                    <button onClick={() => approve(post.id)} className="btn-primary flex-1 justify-center">Approve</button>
                    <button onClick={() => reject(post.id)} className="btn-secondary flex-1 justify-center">{rejecting === post.id ? 'Confirm Reject' : 'Reject'}</button>
                  </> : (
                    <button onClick={() => setStatuses((s) => ({ ...s, [post.id]: 'ready' }))} className="btn-secondary w-full justify-center">Undo {status}</button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <div className="mt-4 card px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-900">Your job: approve the plan.</p>
          <p className="text-xs text-stone-500 mt-1">The finished version will supply the actual media, final caption, tags, and posting time before anything is scheduled.</p>
        </div>
        <div className="text-xs text-stone-500">{Object.values(statuses).filter((s) => s === 'approved').length} of 3 approved</div>
      </div>
    </section>
  )
}
