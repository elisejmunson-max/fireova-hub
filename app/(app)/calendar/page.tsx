'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PILLARS, SUB_PILLARS, SUB_PILLAR_ITEMS } from '@/lib/constants'
import { PostPreview, type PreviewPlatform } from '@/app/(app)/_components/post-preview'
import type { Post, MediaAsset } from '@/lib/types'

const LS_PLANNING_KEY = 'fireova_calendar_planning'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type CalendarEvent = { date: string; label: string }
type TodoItem = { id: string; text: string; done: boolean }
type ViewMode = 'month' | '2weeks'

// Returns the Monday on or before a given date
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay() // 0=Sun
  const diff = (day + 6) % 7  // Mon=0
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ROTATION_EPOCH = new Date(2026, 0, 5) // Monday Jan 5 2026
const LS_SUB_PILLARS_KEY = 'fireova_sub_pillars'
const LS_SUB_PILLAR_ITEMS_KEY = 'fireova_sub_pillar_items'

type RotationEntry = { pillar: string; sub: string; item?: string }

function buildRotationList(
  subs: Record<string, string[]>,
  items: Record<string, string[]>
): RotationEntry[] {
  // Expand each pillar's sub-pillars, then round-robin WITHIN the pillar so sub-pillar
  // categories alternate (e.g. Pizza → Charcuterie → Small Bites → Pizza → …)
  // rather than exhausting one sub-pillar before moving to the next.
  const byPillar = PILLARS.map((p, pillarIdx) => {
    // Build a list-per-sub first
    const subGroups = (subs[p] ?? [p]).map((sub) => {
      const subItems = items[sub]
      if (subItems && subItems.length > 0) {
        return subItems.map((item) => ({ pillar: p, sub, item, pillarIdx }))
      }
      return [{ pillar: p, sub, item: undefined as string | undefined, pillarIdx }]
    })
    // Round-robin across sub-groups so categories interleave within the pillar
    const interleaved: { pillar: string; sub: string; item: string | undefined; pillarIdx: number }[] = []
    const maxLen = Math.max(...subGroups.map((g) => g.length))
    for (let i = 0; i < maxLen; i++) {
      for (const group of subGroups) {
        if (i < group.length) interleaved.push(group[i])
      }
    }
    return interleaved
  }).filter((entries) => entries.length > 0)

  // Greedy scheduler: always pick the pillar with the most remaining entries
  // that isn't the same as the last pillar used — guarantees no back-to-back same pillar
  const queues = byPillar.map((entries) => [...entries])
  const result: RotationEntry[] = []
  let lastPillarIdx = -1

  while (queues.some((q) => q.length > 0)) {
    let bestIdx = -1
    let bestCount = -1
    for (let i = 0; i < queues.length; i++) {
      if (queues[i].length === 0) continue
      if (queues[i][0].pillarIdx === lastPillarIdx) continue
      if (queues[i].length > bestCount) {
        bestCount = queues[i].length
        bestIdx = i
      }
    }
    if (bestIdx === -1) {
      // All other pillars exhausted — must repeat last pillar
      bestIdx = queues.findIndex((q) => q.length > 0)
    }
    const entry = queues[bestIdx].shift()!
    result.push({ pillar: entry.pillar, sub: entry.sub, item: entry.item })
    lastPillarIdx = entry.pillarIdx
  }

  return result
}

function getSuggestedPillarFromList(
  dateStr: string,
  list: RotationEntry[]
): RotationEntry | null {
  if (list.length === 0) return null
  const d = new Date(dateStr + 'T12:00:00')
  const diffMs = d.getTime() - ROTATION_EPOCH.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0 || diffDays % 2 !== 0) return null
  const index = Math.floor(diffDays / 2) % list.length
  return list[index]
}

// Returns the Nth weekday of a month (e.g. 3rd Monday of January)
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  // weekday: 0=Sun,1=Mon,...6=Sat. n: 1-based (1=first, -1=last)
  if (n > 0) {
    const d = new Date(year, month, 1)
    const diff = (weekday - d.getDay() + 7) % 7
    d.setDate(1 + diff + (n - 1) * 7)
    return d
  } else {
    // n=-1 means last
    const d = new Date(year, month + 1, 0) // last day of month
    const diff = (d.getDay() - weekday + 7) % 7
    d.setDate(d.getDate() - diff)
    return d
  }
}

// Computes Easter Sunday for a given year (Anonymous Gregorian algorithm)
function getEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const hh = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - hh - k) % 7
  const m = Math.floor((a + 11 * hh + 22 * l) / 451)
  const month = Math.floor((hh + l - 7 * m + 114) / 31) - 1
  const day = ((hh + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

// Returns pizza and food-related dates worth posting about
function getPizzaDates(year: number): CalendarEvent[] {
  const h = (d: Date, label: string) => ({ date: dateToStr(d), label })
  return [
    h(new Date(year, 1, 9),   '🍕 National Pizza Day'),
    h(new Date(year, 1, 13),  '🇮🇹 National Italian Food Day'),
    h(new Date(year, 2, 14),  '🥧 Pi Day (3.14)'),
    h(new Date(year, 3, 5),   '🍕 National Deep Dish Pizza Day'),
    h(nthWeekday(year, 4, 5, 3), '🎉 National Pizza Party Day'),  // 3rd Friday of May
    h(new Date(year, 5, 4),   '🧀 National Cheese Day'),
    h(new Date(year, 5, 16),  '🍮 National Cannoli Day'),
    h(new Date(year, 5, 28),  '🧀 National Charcuterie Day'),
    h(new Date(year, 8, 5),   '🍕 National Cheese Pizza Day'),
    h(new Date(year, 8, 20),  '🍕 National Pepperoni Pizza Day'),
  ]
}

// Returns US federal holidays as { date: string, label: string }[]
function getUSHolidays(year: number): CalendarEvent[] {
  const h = (d: Date, label: string) => ({ date: dateToStr(d), label })
  return [
    h(new Date(year, 0, 1),   "New Year's Day"),
    h(nthWeekday(year, 0, 1, 3), 'MLK Jr. Day'),
    h(getEaster(year), 'Easter'),
    h(nthWeekday(year, 1, 1, 3), "Presidents' Day"),
    h(nthWeekday(year, 4, 1, -1), 'Memorial Day'),
    h(new Date(year, 5, 19),  'Juneteenth'),
    h(new Date(year, 6, 4),   'Independence Day'),
    h(nthWeekday(year, 8, 1, 1), 'Labor Day'),
    h(nthWeekday(year, 9, 1, 2), 'Columbus Day'),
    h(new Date(year, 10, 11), 'Veterans Day'),
    h(nthWeekday(year, 10, 4, 4), 'Thanksgiving'),
    h(new Date(year, 11, 25), 'Christmas Day'),
  ]
}

export default function CalendarPage() {
  const today = new Date()
  const todayStr = dateToStr(today)

  const [view, setView] = useState<ViewMode>('month')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  // 2-week view: track the Monday that starts the window
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(today))

  const [rotationList, setRotationList] = useState(() => buildRotationList(SUB_PILLARS, SUB_PILLAR_ITEMS))
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Scheduling
  const [schedulingDraftId, setSchedulingDraftId] = useState<string>('')
  const [schedulingDate, setSchedulingDate] = useState<string>('')
  const [scheduling, setScheduling] = useState(false)
  const [draftPillarFilter, setDraftPillarFilter] = useState<string>('')

  // Post preview modal
  const [previewPost, setPreviewPost] = useState<Post | null>(null)
  const [previewMedia, setPreviewMedia] = useState<MediaAsset[]>([])
  const [previewPlatform, setPreviewPlatform] = useState<PreviewPlatform>('instagram')
  const [previewLoading, setPreviewLoading] = useState(false)

  // Events & todos — keyed by "YYYY-MM" (month of the first visible date)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [newEventLabel, setNewEventLabel] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [newTodo, setNewTodo] = useState('')

  // planningKey follows the currently visible month
  const planningKey = view === 'month'
    ? `${year}-${String(month + 1).padStart(2, '0')}`
    : `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}`

  // Load custom sub-pillars and items from localStorage
  useEffect(() => {
    try {
      const storedSubs = localStorage.getItem(LS_SUB_PILLARS_KEY)
      const storedItems = localStorage.getItem(LS_SUB_PILLAR_ITEMS_KEY)
      const subs = storedSubs ? JSON.parse(storedSubs) : SUB_PILLARS
      const items = storedItems ? { ...SUB_PILLAR_ITEMS, ...JSON.parse(storedItems) } : SUB_PILLAR_ITEMS
      setRotationList(buildRotationList(subs, items))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PLANNING_KEY)
      const store: Record<string, { events: CalendarEvent[]; todos: TodoItem[] }> = raw ? JSON.parse(raw) : {}
      const data = store[planningKey] ?? { events: [], todos: [] }
      setEvents(data.events ?? [])
      setTodos(data.todos ?? [])
      setNewEventLabel('')
      setNewEventDate('')
      setNewTodo('')
    } catch {}
  }, [planningKey])

  function savePlanning(nextEvents: CalendarEvent[], nextTodos: TodoItem[]) {
    try {
      const raw = localStorage.getItem(LS_PLANNING_KEY)
      const store: Record<string, { events: CalendarEvent[]; todos: TodoItem[] }> = raw ? JSON.parse(raw) : {}
      store[planningKey] = { events: nextEvents, todos: nextTodos }
      localStorage.setItem(LS_PLANNING_KEY, JSON.stringify(store))
    } catch {}
  }

  function addEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!newEventLabel.trim() || !newEventDate) return
    const next = [...events, { date: newEventDate, label: newEventLabel.trim() }]
    setEvents(next); savePlanning(next, todos)
    setNewEventLabel(''); setNewEventDate('')
  }

  function removeEvent(i: number) {
    const next = events.filter((_, idx) => idx !== i)
    setEvents(next); savePlanning(next, todos)
  }

  function addTodo(e: React.FormEvent) {
    e.preventDefault()
    if (!newTodo.trim()) return
    const next = [...todos, { id: Date.now().toString(), text: newTodo.trim(), done: false }]
    setTodos(next); savePlanning(events, next)
    setNewTodo('')
  }

  function toggleTodo(id: string) {
    const next = todos.map((t) => t.id === id ? { ...t, done: !t.done } : t)
    setTodos(next); savePlanning(events, next)
  }

  function removeTodo(id: string) {
    const next = todos.filter((t) => t.id !== id)
    setTodos(next); savePlanning(events, next)
  }

  const [showHolidays, setShowHolidays] = useState(true)
  const [showPizzaDates, setShowPizzaDates] = useState(true)
  const [showPillarGuide, setShowPillarGuide] = useState(false)

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  const holidaysByDate = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const h of getUSHolidays(year)) {
      if (!map[h.date]) map[h.date] = []
      map[h.date].push(h.label)
    }
    if (month === 11) {
      for (const h of getUSHolidays(year + 1)) {
        if (h.label === "New Year's Day") {
          if (!map[h.date]) map[h.date] = []
          map[h.date].push(h.label)
        }
      }
    }
    return map
  }, [year, month])

  const pizzaDatesByDate = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const p of getPizzaDates(year)) {
      if (!map[p.date]) map[p.date] = []
      map[p.date].push(p.label)
    }
    return map
  }, [year])

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    try {
      const supabase = createClient()
      const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
      if (data) setPosts(data as Post[])
    } catch {
      // swallow error — calendar still renders without posts
    } finally {
      setLoading(false)
    }
  }

  // Month view cells
  const calendarDays = useMemo(() => {
    const rawFirstDay = new Date(year, month, 1).getDay()
    const firstDay = (rawFirstDay + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()
    const cells: Array<{ date: string | null; day: number; currentMonth: boolean }> = []

    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: null, day: daysInPrevMonth - i, currentMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ date: dateStr, day: d, currentMonth: true })
    }
    // Only fill to complete the last row — no extra rows
    const remaining = (7 - (cells.length % 7)) % 7
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: null, day: d, currentMonth: false })
    }
    return cells
  }, [year, month])

  // 2-week view cells — always exactly 14 days from weekStart
  const twoWeekDays = useMemo(() => {
    const cells: Array<{ date: string; day: number; dayName: string }> = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      cells.push({
        date: dateToStr(d),
        day: d.getDate(),
        dayName: DAYS[i % 7],
      })
    }
    return cells
  }, [weekStart])

  const postsByDate = useMemo(() => {
    const map: Record<string, Post[]> = {}
    for (const post of posts) {
      if (post.scheduled_date) {
        const key = post.scheduled_date.slice(0, 10)
        if (!map[key]) map[key] = []
        map[key].push(post)
      }
    }
    return map
  }, [posts])

  const drafts = posts.filter((p) => p.status === 'draft' && p.approved)
  const filteredDrafts = draftPillarFilter ? drafts.filter((d) => d.pillar === draftPillarFilter) : drafts
  const selectedPosts = selectedDate ? (postsByDate[selectedDate] ?? []) : []
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : []
  const selectedHolidays = (selectedDate && showHolidays) ? (holidaysByDate[selectedDate] ?? []) : []
  const selectedPizzaDates = (selectedDate && showPizzaDates) ? (pizzaDatesByDate[selectedDate] ?? []) : []

  // Month nav
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }
  function goToToday() {
    setMonth(today.getMonth()); setYear(today.getFullYear())
    setWeekStart(getMonday(today))
  }

  // 2-week nav
  function prevTwoWeeks() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 14)
    setWeekStart(d)
  }
  function nextTwoWeeks() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 14)
    setWeekStart(d)
  }

  // Switch view and sync states
  function switchView(v: ViewMode) {
    setView(v)
    setSelectedDate(null)
    if (v === '2weeks') {
      // Start 2-week view at the Monday of the current week
      setWeekStart(getMonday(today))
    } else {
      // Sync month view to the week start's month
      setMonth(weekStart.getMonth())
      setYear(weekStart.getFullYear())
    }
  }

  // Header label
  function twoWeekLabel() {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 13)
    const startLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const endLabel = end.toLocaleDateString('en-US', {
      month: end.getMonth() === weekStart.getMonth() ? undefined : 'short',
      day: 'numeric',
      year: end.getFullYear() !== weekStart.getFullYear() ? 'numeric' : undefined,
    })
    const yearLabel = weekStart.getFullYear()
    return `${startLabel} – ${endLabel}, ${yearLabel}`
  }

  // Pre-fill the scheduling date when a calendar date is selected
  useEffect(() => {
    if (selectedDate) setSchedulingDate(selectedDate)
  }, [selectedDate])

  async function schedulePost(e?: React.FormEvent) {
    e?.preventDefault()
    if (!schedulingDraftId || !schedulingDate) return
    setScheduling(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('posts') as any).update({ scheduled_date: schedulingDate, status: 'scheduled' }).eq('id', schedulingDraftId)
    await loadPosts()
    setSchedulingDraftId('')
    setScheduling(false)
  }

  // Auto-schedule as soon as a draft is picked (when date is already selected from calendar)
  async function handleDraftSelect(draftId: string) {
    setSchedulingDraftId(draftId)
    if (draftId && schedulingDate) {
      setScheduling(true)
      const supabase = createClient()
      await supabase.from('posts').update({ scheduled_date: schedulingDate, status: 'scheduled' } as never).eq('id', draftId)
      await loadPosts()
      setSchedulingDraftId('')
      setScheduling(false)
    }
  }

  async function unschedulePost(postId: string) {
    const supabase = createClient()
    await supabase.from('posts').update({ scheduled_date: null, status: 'draft' } as never).eq('id', postId)
    await loadPosts()
  }

  async function openPostPreview(post: Post) {
    setPreviewPost(post)
    setPreviewPlatform('instagram')
    setPreviewMedia([])
    setPreviewLoading(true)
    try {
      const supabase = createClient()
      const { data: postMedia } = await supabase
        .from('post_media').select('asset_id').eq('post_id', post.id)
        .order('display_order', { ascending: true })
      if (postMedia && postMedia.length > 0) {
        const assetIds = postMedia.map((m: { asset_id: string }) => m.asset_id)
        const { data } = await supabase.from('media_assets').select('*').in('id', assetIds)
        if (data) setPreviewMedia(data as MediaAsset[])
      }
    } catch {}
    setPreviewLoading(false)
  }

  function formatDate(date: string) {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    })
  }

  function formatShortDate(date: string) {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Shared cell renderer
  function CalendarCell({ date, day, currentMonth }: { date: string | null; day: number; currentMonth: boolean }) {
    const isToday    = date === todayStr
    const isPast     = date !== null && date < todayStr
    const isSelected = date !== null && date === selectedDate
    const dayPosts = date ? (postsByDate[date] ?? []) : []
    const dayEvents = date ? (eventsByDate[date] ?? []) : []
    const dayHolidays = (showHolidays && date) ? (holidaysByDate[date] ?? []) : []
    const dayPizzaDates = (showPizzaDates && date) ? (pizzaDatesByDate[date] ?? []) : []
    const suggestion = date ? getSuggestedPillarFromList(date, rotationList) : null

    function handleClick() {
      if (!date) return
      if (date === selectedDate) {
        setSelectedDate(null)
        setDraftPillarFilter('')
      } else {
        setSelectedDate(date)
        if (suggestion) setDraftPillarFilter(suggestion.pillar)
        else setDraftPillarFilter('')
      }
    }

    return (
      <div
        onClick={handleClick}
        className={`flex flex-col h-full transition-colors ${
          isSelected
            ? 'bg-ember-50'
            : isPast
            ? 'bg-stone-50/70'
            : currentMonth
            ? 'bg-white hover:bg-stone-50'
            : 'bg-stone-50 hover:bg-stone-100/60'
        } ${date ? 'cursor-pointer' : ''}`}
      >
        {/* Date number */}
        <div className="px-2 pt-2 pb-1">
          <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
            isToday
              ? 'bg-ember-600 text-white'
              : isSelected
              ? 'text-ember-700'
              : isPast
              ? 'text-stone-300'
              : currentMonth
              ? 'text-stone-700'
              : 'text-stone-350'
          }`}>
            {day}
          </div>
        </div>
        {/* Content */}
        <div className={`px-1.5 pb-1.5 space-y-1 flex-1 ${isPast ? 'opacity-40' : ''}`}>
          {dayHolidays.map((h, hi) => (
            <div key={`h-${hi}`} className="text-xs truncate px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 font-medium leading-tight">
              {h}
            </div>
          ))}
          {dayPizzaDates.map((p, pi) => (
            <div key={`p-${pi}`} className="text-xs truncate px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700 font-medium leading-tight">
              {p}
            </div>
          ))}
          {dayEvents.map((ev, ei) => (
            <div key={`ev-${ei}`} className="text-xs truncate px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 font-medium leading-tight">
              {ev.label}
            </div>
          ))}
          {dayPosts.slice(0, 3).map((post) => (
            <div key={post.id} className="text-xs truncate px-1.5 py-0.5 rounded-md bg-ember-100 text-ember-800 font-medium leading-tight">
              {post.title}
            </div>
          ))}
          {dayPosts.length > 3 && (
            <div className="text-xs text-stone-400 px-1">+{dayPosts.length - 3} more</div>
          )}
        </div>
        {/* Suggested pillar + sub-pillar */}
        {showPillarGuide && suggestion && currentMonth && !isPast && (
          <div className="px-1.5 pb-1.5 mt-auto">
            <div className={`px-1.5 py-0.5 rounded border leading-tight ${
              isSelected ? 'border-ember-200 bg-ember-50' : 'border-stone-200 bg-stone-50'
            }`}>
              <div className={`text-xs font-semibold truncate ${isSelected ? 'text-ember-600' : 'text-stone-500'}`}>
                {suggestion.item ?? suggestion.sub}
              </div>
              <div className={`text-xs truncate ${isSelected ? 'text-ember-400' : 'text-stone-300'}`}>
                {suggestion.item ? suggestion.sub : suggestion.pillar}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Current side panel month label
  const sidePanelMonth = view === 'month' ? MONTHS[month] : MONTHS[weekStart.getMonth()]

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Content Calendar</h1>
            <p className="text-stone-500 text-sm mt-0.5">Schedule posts and plan your month.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
              <button
                onClick={() => switchView('month')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === 'month' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => switchView('2weeks')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === '2weeks' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                2 Weeks
              </button>
            </div>
            <Link href="/create" className="btn-primary text-sm">
              <PlusIcon className="w-4 h-4" />
              New Post
            </Link>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="flex gap-5 items-start">

          {/* Calendar grid */}
          <div className="flex-1 min-w-0">
            <div className="card p-5">
              {/* Navigation header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-stone-900">
                  {view === 'month' ? `${MONTHS[month]} ${year}` : twoWeekLabel()}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={view === 'month' ? prevMonth : prevTwoWeeks}
                    className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition-colors"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToToday}
                    className="px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={view === 'month' ? nextMonth : nextTwoWeeks}
                    className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition-colors"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border border-stone-200 rounded-t-lg bg-stone-50 mb-0">
                {DAYS.map((d, i) => (
                  <div key={d} className={`text-center text-xs font-semibold text-stone-500 py-2.5 tracking-wide uppercase ${i < 6 ? 'border-r border-stone-200' : ''}`}>{d}</div>
                ))}
              </div>

              {loading ? (
                <div className="h-64 flex items-center justify-center text-sm text-stone-400">Loading...</div>
              ) : view === 'month' ? (
                /* Month grid */
                <div className="border border-stone-200 rounded-b-lg overflow-hidden">
                  <div className="grid grid-cols-7 gap-px bg-stone-200">
                    {calendarDays.map((cell, i) => (
                      <div key={i} className="min-h-[100px]">
                        <CalendarCell date={cell.date} day={cell.day} currentMonth={cell.currentMonth} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* 2-week grid — two rows of 7 */
                <div className="border border-stone-200 rounded-b-lg overflow-hidden">
                  <div className="grid grid-cols-7 gap-px bg-stone-200">
                    {twoWeekDays.map((cell, i) => (
                      <div key={i} className="min-h-[160px]">
                        <CalendarCell date={cell.date} day={cell.day} currentMonth={true} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Legend + toggles */}
            <div className="mt-3 flex items-center gap-2 px-1 flex-wrap">
              <div className="flex items-center gap-1.5 mr-2">
                <div className="w-3 h-3 rounded-full bg-ember-600" />
                <span className="text-xs text-stone-500">Today</span>
              </div>
              <div className="flex items-center gap-1.5 mr-2">
                <div className="w-8 h-3.5 rounded bg-ember-100 border border-ember-200" />
                <span className="text-xs text-stone-500">Post</span>
              </div>
              <button
                onClick={() => setShowHolidays((v) => !v)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium transition-colors ${
                  showHolidays
                    ? 'bg-sky-500 text-white border-sky-500'
                    : 'bg-white text-stone-400 border-stone-200 hover:border-stone-300 line-through'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${showHolidays ? 'bg-white' : 'bg-sky-300'}`} />
                Holidays
              </button>
              <button
                onClick={() => setShowPizzaDates((v) => !v)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium transition-colors ${
                  showPizzaDates
                    ? 'bg-orange-400 text-white border-orange-400'
                    : 'bg-white text-stone-400 border-stone-200 hover:border-stone-300 line-through'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${showPizzaDates ? 'bg-white' : 'bg-orange-300'}`} />
                Pizza Days
              </button>
              <button
                onClick={() => setShowPillarGuide((v) => !v)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium transition-colors ${
                  showPillarGuide
                    ? 'bg-stone-800 text-white border-stone-800'
                    : 'bg-white text-stone-400 border-stone-200 hover:border-stone-300 line-through'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${showPillarGuide ? 'bg-white' : 'bg-stone-400'}`} />
                Pillar Guide
              </button>
            </div>
          </div>

          {/* Always-visible side panel */}
          <div className="w-72 flex-shrink-0 space-y-4 sticky top-6">

            {/* Selected date detail */}
            {selectedDate ? (
              <div className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-stone-900 leading-snug">
                    {formatDate(selectedDate)}
                  </h3>
                  <button onClick={() => setSelectedDate(null)} className="text-stone-400 hover:text-stone-600 flex-shrink-0 mt-0.5">
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Suggested pillar + sub-pillar for this day */}
                {selectedDate && getSuggestedPillarFromList(selectedDate, rotationList) && (
                  <div className="flex items-center justify-between px-2.5 py-2 bg-stone-50 rounded-lg border border-stone-200">
                    <div>
                      {(() => {
                        const s = getSuggestedPillarFromList(selectedDate, rotationList)!
                        return (
                          <>
                            <p className="text-xs text-stone-400">
                              {s.item ? `${s.pillar} · ${s.sub}` : s.pillar}
                            </p>
                            <p className="text-sm font-semibold text-stone-900">
                              {s.item ?? s.sub}
                            </p>
                          </>
                        )
                      })()}
                    </div>
                    <Link
                      href="/create"
                      className="text-xs text-ember-600 hover:text-ember-700 font-medium flex-shrink-0"
                    >
                      + New post
                    </Link>
                  </div>
                )}

                {selectedPosts.length > 0 || selectedEvents.length > 0 || selectedHolidays.length > 0 || selectedPizzaDates.length > 0 ? (
                  <div className="space-y-2">
                    {selectedHolidays.map((h, i) => (
                      <div key={`sh-${i}`} className="flex items-center gap-2 p-2.5 bg-sky-50 rounded-lg border border-sky-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0" />
                        <span className="text-sm text-sky-700 font-medium">{h}</span>
                      </div>
                    ))}
                    {selectedPizzaDates.map((p, i) => (
                      <div key={`sp-${i}`} className="flex items-center gap-2 p-2.5 bg-orange-50 rounded-lg border border-orange-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                        <span className="text-sm text-orange-700 font-medium">{p}</span>
                      </div>
                    ))}
                    {selectedEvents.map((ev, i) => {
                      const globalIdx = events.findIndex((e) => e.date === ev.date && e.label === ev.label)
                      return (
                        <div key={`sev-${i}`} className="flex items-center justify-between gap-2 group p-2.5 bg-violet-50 rounded-lg border border-violet-100">
                          <span className="flex items-center gap-1.5 text-sm text-violet-700 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                            <span className="truncate font-medium">{ev.label}</span>
                          </span>
                          <button onClick={() => removeEvent(globalIdx)} className="text-violet-300 hover:text-red-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                    {selectedPosts.map((post) => (
                      <div key={post.id} className="p-2.5 bg-stone-50 rounded-lg border border-stone-100">
                        <p className="text-sm font-medium text-stone-900 truncate">{post.title}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{post.pillar} · {post.format}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => openPostPreview(post)}
                            className="text-xs text-ember-600 hover:text-ember-700 font-medium transition-colors"
                          >
                            Preview
                          </button>
                          <Link href={`/content-bank/${post.id}`} className="text-xs text-stone-500 hover:text-stone-700 font-medium">
                            Edit
                          </Link>
                          <button onClick={() => unschedulePost(post.id)} className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-stone-400">Nothing on this day yet.</p>
                )}
              </div>
            ) : null}

            {/* Schedule a Post */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarAddIcon className="w-4 h-4 text-ember-500" />
                <h3 className="text-sm font-semibold text-stone-900">Schedule a Post</h3>
              </div>

              {drafts.length === 0 ? (
                <div className="text-center py-2">
                  <p className="text-xs text-stone-400">No approved drafts yet.</p>
                  <Link href="/content-bank" className="text-xs text-ember-600 hover:text-ember-700 font-medium mt-1 inline-block">
                    Approve posts in Content Bank
                  </Link>
                </div>
              ) : (
                <form onSubmit={schedulePost} className="space-y-3">
                  {/* Pillar filter — suggested pill + All */}
                  {(() => {
                    const suggestion = selectedDate ? getSuggestedPillarFromList(selectedDate, rotationList) : null
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => { setDraftPillarFilter(''); setSchedulingDraftId('') }}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            draftPillarFilter === '' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          All
                        </button>
                        {suggestion && (
                          <button
                            type="button"
                            onClick={() => { setDraftPillarFilter(suggestion.pillar); setSchedulingDraftId('') }}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              draftPillarFilter === suggestion.pillar ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                            }`}
                          >
                            {suggestion.pillar}
                            <span className={`ml-1 ${draftPillarFilter === suggestion.pillar ? 'text-stone-300' : 'text-stone-400'}`}>
                              · {suggestion.sub}
                            </span>
                          </button>
                        )}
                      </div>
                    )
                  })()}
                  {/* removed all-pillars list — kept intentionally minimal: just All + suggested */}
                  {false && PILLARS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => { setDraftPillarFilter(p); setSchedulingDraftId('') }}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            draftPillarFilter === p ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          {p}
                        </button>
                      ))}

                  {/* Date — pre-filled from calendar click, or manual entry */}
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={schedulingDate}
                      onChange={(e) => setSchedulingDate(e.target.value)}
                      className="input text-sm flex-1"
                    />
                    {selectedDate && schedulingDate === selectedDate && (
                      <span className="text-xs text-ember-600 font-medium flex-shrink-0">Selected date</span>
                    )}
                  </div>

                  {/* Draft picker — auto-schedules on select if date is set */}
                  <select
                    value={schedulingDraftId}
                    onChange={(e) => handleDraftSelect(e.target.value)}
                    disabled={scheduling}
                    className="input text-sm w-full disabled:opacity-60"
                  >
                    <option value="">
                      {scheduling ? 'Scheduling...' : filteredDrafts.length === 0 ? 'No drafts for this pillar' : 'Pick a draft to schedule →'}
                    </option>
                    {filteredDrafts.map((d) => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>

                  {/* Manual submit — only needed if no calendar date is selected */}
                  {!selectedDate && (
                    <button
                      type="submit"
                      disabled={!schedulingDraftId || !schedulingDate || scheduling}
                      className="btn-primary w-full text-sm disabled:opacity-40"
                    >
                      {scheduling ? 'Scheduling...' : 'Schedule Post'}
                    </button>
                  )}
                </form>
              )}
            </div>

            {/* To-Do List */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ChecklistIcon className="w-4 h-4 text-stone-500" />
                <h3 className="text-sm font-semibold text-stone-900">To-Do List</h3>
                <span className="ml-auto text-xs text-stone-400">{sidePanelMonth}</span>
              </div>

              {todos.length > 0 ? (
                <div className="space-y-1.5">
                  {todos.map((todo) => (
                    <div key={todo.id} className="flex items-start gap-2 group">
                      <button
                        onClick={() => toggleTodo(todo.id)}
                        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                          todo.done ? 'bg-ember-600 border-ember-600' : 'border-stone-300 hover:border-ember-400'
                        }`}
                      >
                        {todo.done && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                      </button>
                      <span className={`text-sm flex-1 min-w-0 ${todo.done ? 'line-through text-stone-400' : 'text-stone-700'}`}>
                        {todo.text}
                      </span>
                      <button
                        onClick={() => removeTodo(todo.id)}
                        className="text-stone-300 hover:text-red-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-400">No tasks yet for {sidePanelMonth}.</p>
              )}

              {todos.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-stone-400">{todos.filter((t) => t.done).length} of {todos.length} done</span>
                    <span className="text-xs text-stone-400">{Math.round((todos.filter((t) => t.done).length / todos.length) * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className="h-full bg-ember-500 rounded-full transition-all"
                      style={{ width: `${(todos.filter((t) => t.done).length / todos.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <form onSubmit={addTodo} className="flex gap-2 pt-1 border-t border-stone-100">
                <input
                  type="text"
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  placeholder="Add a task..."
                  className="input text-sm flex-1"
                />
                <button type="submit" disabled={!newTodo.trim()} className="btn-secondary text-sm px-3 flex-shrink-0 disabled:opacity-40">
                  <PlusIcon className="w-4 h-4" />
                </button>
              </form>
            </div>

          </div>
        </div>

        {/* Special Events — below calendar */}
        <div className="mt-5 card p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <StarIcon className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-semibold text-stone-900">Special Events</h3>
              <span className="text-xs text-stone-400">{sidePanelMonth}</span>
            </div>
          </div>

          <form onSubmit={addEvent} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-stone-500 mb-1 block">Event name</label>
              <input
                type="text"
                value={newEventLabel}
                onChange={(e) => setNewEventLabel(e.target.value)}
                placeholder="e.g. Bridal Expo, Corporate Happy Hour..."
                className="input text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Date</label>
              <input
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
                className="input text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!newEventLabel.trim() || !newEventDate}
              className="btn-secondary text-sm disabled:opacity-40 flex-shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
              Add Event
            </button>
          </form>
        </div>

      </div>

      {/* Post Preview Modal */}
      {previewPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setPreviewPost(null)}
          />
          {/* Panel */}
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 flex-shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">{previewPost.title}</p>
                <p className="text-xs text-stone-400 mt-0.5">{previewPost.pillar} · {previewPost.format}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <Link
                  href={`/content-bank/${previewPost.id}`}
                  className="text-xs text-ember-600 hover:text-ember-700 font-medium"
                  onClick={() => setPreviewPost(null)}
                >
                  Edit post
                </Link>
                <button
                  onClick={() => setPreviewPost(null)}
                  className="p-1 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Scrollable preview */}
            <div className="flex-1 overflow-y-auto p-4">
              {previewLoading ? (
                <div className="flex items-center justify-center h-40">
                  <svg className="animate-spin w-5 h-5 text-stone-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : (
                <PostPreview
                  platform={previewPlatform}
                  onPlatformChange={setPreviewPlatform}
                  caption={
                    previewPlatform === 'tiktok'
                      ? previewPost.caption_option2 ?? previewPost.caption_option1 ?? ''
                      : previewPost.caption_option1 ?? previewPost.caption_option2 ?? ''
                  }
                  hashtags={previewPost.hashtags ?? []}
                  title={previewPost.title}
                  media={previewMedia}
                />
              )}
            </div>
          </div>
        </div>
      )}
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

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function CalendarAddIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 13v4m-2-2h4" />
    </svg>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  )
}

function ChecklistIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}
