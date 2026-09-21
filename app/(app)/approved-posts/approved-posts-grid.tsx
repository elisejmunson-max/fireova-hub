'use client'

import { useState } from 'react'

type Media = { id: string; url: string; file_type: string; credit?: string }
type Post = { id: string; format: string; caption: string; media: Media[]; credits: string[]; sort_order: number | null }

export default function ApprovedPostsGrid({ initialPosts }: { initialPosts: Post[] }) {
  const [posts, setPosts] = useState(initialPosts)
  const [open, setOpen] = useState<Post | null>(null)
  const [slide, setSlide] = useState(0)
  const [drag, setDrag] = useState<string | null>(null)
  const [dragMedia, setDragMedia] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [menu, setMenu] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function reorder(next: Post[]) {
    setPosts(next)
    setStatus('Saving order…')
    const response = await fetch('/api/approved-posts/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postIds: next.map((post) => post.id) }) })
    setStatus(response.ok ? 'Order saved ✓' : 'Could not save order')
    setTimeout(() => setStatus(''), 1800)
  }

  function drop(on: string) {
    if (!drag || drag === on) return setDrag(null)
    const from = posts.findIndex((post) => post.id === drag)
    const to = posts.findIndex((post) => post.id === on)
    if (from < 0 || to < 0) return
    const next = [...posts]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDrag(null)
    void reorder(next)
  }

  function show(post: Post) {
    setOpen(post); setSlide(0); setMenu(false); setRemoving(false); setDragMedia(null)
  }

  async function reorderCarousel(from: number, to: number) {
    if (!open || from === to || from < 0 || to < 0 || to >= open.media.length) return
    const previous = open
    const activeId = open.media[Math.min(slide, open.media.length - 1)]?.id
    const media = [...open.media]
    const [moved] = media.splice(from, 1)
    media.splice(to, 0, moved)
    const updated = { ...open, media }
    setOpen(updated)
    setPosts((current) => current.map((post) => post.id === updated.id ? updated : post))
    setSlide(Math.max(0, media.findIndex((item) => item.id === activeId)))
    setStatus('Saving carousel order…')
    try {
      const response = await fetch('/api/approved-posts/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: open.id, assetIds: media.map((item) => item.id) }) })
      if (!response.ok) throw new Error()
      setStatus('Carousel order saved ✓')
    } catch {
      setOpen(previous)
      setPosts((current) => current.map((post) => post.id === previous.id ? previous : post))
      setSlide(Math.max(0, previous.media.findIndex((item) => item.id === activeId)))
      setStatus('Could not save carousel order')
    }
    setTimeout(() => setStatus(''), 1800)
  }

  async function removeApproved() {
    if (!open || removing) return
    const removingId = open.id
    setRemoving(true)
    const response = await fetch('/api/approved-posts/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: removingId }) })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.ok) {
      setPosts((current) => current.filter((post) => post.id !== removingId))
      setOpen(null); setSlide(0); setMenu(false); setRemoving(false)
      setStatus('Removed from Approved Posts ✓')
      setTimeout(() => setStatus(''), 1800)
    } else {
      setStatus(data.error || 'Could not remove post'); setRemoving(false)
    }
  }

  const activeMedia = open?.media[Math.min(slide, (open?.media.length || 1) - 1)]

  return <>
    <div className="mx-auto mb-3 flex w-full max-w-[900px] items-center justify-between"><p className="text-sm text-stone-500">Drag posts to plan your Instagram grid. Click any post to open it.</p><span className="text-xs text-stone-400">{status}</span></div>
    <div className="mx-auto grid w-full max-w-[900px] grid-cols-3 gap-1 sm:gap-1.5">{posts.map((post) => { const media = post.media[0]; return <button key={post.id} draggable onDragStart={() => setDrag(post.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(post.id)} onClick={() => show(post)} className={`group relative aspect-square overflow-hidden bg-stone-100 ${drag === post.id ? 'opacity-40' : ''}`}>{media?.file_type.startsWith('video/') ? <video src={media.url} muted playsInline className="h-full w-full object-cover" /> : <img src={media?.url} alt="" className="h-full w-full object-cover" />}<span className="absolute right-2 top-2 text-lg text-white drop-shadow">{post.media.length > 1 ? '▣' : media?.file_type.startsWith('video/') ? '▶' : ''}</span><span className="absolute inset-0 hidden items-center justify-center bg-black/25 text-xs font-semibold text-white group-hover:flex">Open post</span></button> })}</div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) { setOpen(null); setRemoving(false) } }}><div className="relative max-h-[94vh] w-full max-w-[560px] overflow-y-auto rounded-xl bg-white shadow-2xl">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b bg-white px-4 py-3"><div><p className="font-semibold">fireovapizza</p><p className="text-xs text-stone-500">Approved post</p></div><div className="relative flex items-center gap-4"><button aria-label="Post options" onClick={() => setMenu((value) => !value)} className="text-2xl font-bold leading-none text-stone-700">•••</button>{menu && <div className="absolute right-8 top-9 z-30 w-60 overflow-hidden rounded-xl border bg-white shadow-xl"><button disabled={removing} onClick={() => void removeApproved()} className="block w-full px-4 py-3 text-left text-sm font-medium text-red-600 disabled:opacity-50">{removing ? 'Removing…' : 'Remove from Approved Posts'}<span className="mt-0.5 block text-xs font-normal text-stone-500">Media stays in your Media Bank</span></button></div>}<button aria-label="Close post" onClick={() => { setOpen(null); setRemoving(false) }} className="text-2xl text-stone-500">×</button></div></div>
      <div className="relative aspect-[4/5] bg-black">{activeMedia?.file_type.startsWith('video/') ? <video src={activeMedia.url} controls playsInline className="h-full w-full object-contain" /> : <img src={activeMedia?.url} alt="" className="h-full w-full object-contain" />}{open.media.length > 1 && <><button aria-label="Previous photo" onClick={() => setSlide((slide - 1 + open.media.length) % open.media.length)} className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/55 text-xl text-white">‹</button><button aria-label="Next photo" onClick={() => setSlide((slide + 1) % open.media.length)} className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/55 text-xl text-white">›</button><span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">{slide + 1}/{open.media.length}</span></>}</div>
      {open.media.length > 1 && <div className="border-t bg-stone-50 px-4 py-3"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-stone-700">Carousel order</p><p className="text-[11px] text-stone-500">Drag photos or use the arrows</p></div><div className="flex gap-2 overflow-x-auto pb-1">{open.media.map((media, index) => <div key={media.id} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; setDragMedia(index) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (dragMedia !== null) void reorderCarousel(dragMedia, index); setDragMedia(null) }} onDragEnd={() => setDragMedia(null)} className={`relative w-[76px] shrink-0 rounded-lg border-2 bg-white p-1 transition ${slide === index ? 'border-orange-500' : 'border-stone-200'} ${dragMedia === index ? 'opacity-40' : ''}`}><button type="button" onClick={() => setSlide(index)} className="block aspect-square w-full overflow-hidden rounded-md" aria-label={`View carousel photo ${index + 1}`}>{media.file_type.startsWith('video/') ? <video src={media.url} muted playsInline className="h-full w-full object-cover" /> : <img src={media.url} alt="" draggable={false} className="h-full w-full object-cover" />}</button><span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-bold text-white">{index + 1}</span><div className="mt-1 flex items-center justify-between"><button type="button" disabled={index === 0} onClick={() => void reorderCarousel(index, index - 1)} aria-label={`Move photo ${index + 1} left`} className="h-6 w-7 rounded text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-25">←</button><span className="cursor-grab text-xs text-stone-400" aria-hidden="true">⠿</span><button type="button" disabled={index === open.media.length - 1} onClick={() => void reorderCarousel(index, index + 1)} aria-label={`Move photo ${index + 1} right`} className="h-6 w-7 rounded text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-25">→</button></div></div>)}</div></div>}
      <div className="border-t px-4 py-3"><div className="mb-2 flex gap-5 text-2xl"><span>♡</span><span>◯</span><span>⌁</span><span className="ml-auto">⌑</span></div><p className="text-sm leading-6"><strong>fireovapizza</strong> {open.caption}</p>{open.credits.length > 0 && <p className="mt-3 text-xs text-stone-500">Photo: {open.credits.join(', ')}</p>}</div>
    </div></div>}
  </>
}
