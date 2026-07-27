'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import LocalMedia from '@/components/local-media'
import {
  readAllLocalGeneratedPosts,
  readLocalEvents,
  readLocalPostStatuses,
  type LocalPostDraftStatus,
} from '@/lib/local-fireova-events'
import {
  readContentBankDrafts,
  readContentBankDraftStatuses,
} from '@/lib/local-fireova-content-bank'
import {
  readLocalScheduledPosts,
  removeLocalDraftSchedule,
  upsertLocalDraftSchedule,
  type LocalSchedulePlatform,
  type LocalScheduleSource,
  type LocalScheduledPost,
} from '@/lib/local-fireova-schedule'
import type { MockMedia } from '@/lib/mock-fireova-content'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PLATFORMS: LocalSchedulePlatform[] = ['Instagram', 'Facebook', 'Instagram + Facebook', 'Other']

type CalendarDraft = {
  id: string
  source: LocalScheduleSource
  eventId?: string
  contentBankItemId?: string
  title: string
  subtitle: string
  caption: string
  strategy: string
  media: MockMedia
  status: LocalPostDraftStatus
  schedule?: LocalScheduledPost
}

export default function CalendarPage() {
  const [loaded, setLoaded] = useState(false)
  const [today, setToday] = useState<Date | null>(null)
  const [cursor, setCursor] = useState<Date | null>(null)
  const [drafts, setDrafts] = useState<CalendarDraft[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [modalDraft, setModalDraft] = useState<CalendarDraft | null>(null)
  const [modalDate, setModalDate] = useState('')
  const [modalTime, setModalTime] = useState('')
  const [modalPlatform, setModalPlatform] = useState<LocalSchedulePlatform>('Instagram + Facebook')
  const [modalNotes, setModalNotes] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const mountedToday = new Date()
    setToday(mountedToday)
    setCursor(new Date(mountedToday.getFullYear(), mountedToday.getMonth(), 1))
    setSelectedDate(dateToStr(mountedToday))
    setDrafts(readCalendarDrafts())
    setLoaded(true)
  }, [])

  const calendarDays = useMemo(() => cursor ? getMonthCells(cursor) : [], [cursor])
  const scheduledByDate = useMemo(() => {
    const map: Record<string, CalendarDraft[]> = {}
    drafts.forEach((draft) => {
      if (!draft.schedule?.scheduledDate) return
      if (!map[draft.schedule.scheduledDate]) map[draft.schedule.scheduledDate] = []
      map[draft.schedule.scheduledDate].push(draft)
    })
    return map
  }, [drafts])

  const approvedUnscheduled = useMemo(() => drafts.filter((draft) => draft.status === 'Approved' && !draft.schedule), [drafts])
  const scheduledDrafts = useMemo(() => drafts.filter((draft) => draft.schedule), [drafts])
  const selectedDrafts = selectedDate ? scheduledByDate[selectedDate] ?? [] : []
  const monthLabel = cursor ? cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Calendar'

  function reloadDrafts(message?: string) {
    setDrafts(readCalendarDrafts())
    if (message) {
      setNotice(message)
      window.setTimeout(() => setNotice(''), 2200)
    }
  }

  function openScheduleModal(draft: CalendarDraft, date = selectedDate || dateToStr(today ?? new Date())) {
    setModalDraft(draft)
    setModalDate(draft.schedule?.scheduledDate ?? date)
    setModalTime(draft.schedule?.scheduledTime ?? '')
    setModalPlatform(draft.schedule?.scheduledPlatform ?? 'Instagram + Facebook')
    setModalNotes(draft.schedule?.schedulingNotes ?? '')
  }

  function saveSchedule(event: React.FormEvent) {
    event.preventDefault()
    if (!modalDraft || !modalDate) return

    upsertLocalDraftSchedule({
      source: modalDraft.source,
      draftId: modalDraft.id,
      eventId: modalDraft.eventId,
      contentBankItemId: modalDraft.contentBankItemId,
      scheduledDate: modalDate,
      scheduledTime: modalTime,
      scheduledPlatform: modalPlatform,
      schedulingNotes: modalNotes,
    })
    setModalDraft(null)
    reloadDrafts('Scheduled')
  }

  function removeSchedule(draft: CalendarDraft) {
    removeLocalDraftSchedule(draft.source, draft.id, draft.eventId)
    setModalDraft(null)
    reloadDrafts('Removed from calendar')
  }

  function prevMonth() {
    setCursor((current) => current ? new Date(current.getFullYear(), current.getMonth() - 1, 1) : current)
  }

  function nextMonth() {
    setCursor((current) => current ? new Date(current.getFullYear(), current.getMonth() + 1, 1) : current)
  }

  function goToToday() {
    const next = today ?? new Date()
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1))
    setSelectedDate(dateToStr(next))
  }

  if (!loaded || !cursor || !today) {
    return (
      <main className="min-h-full bg-white px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl rounded-[30px] bg-stone-50 px-6 py-12 text-center text-sm font-medium text-stone-500 ring-1 ring-stone-100">
          Loading calendar...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-full bg-white pb-12">
      <header className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Calendar</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[34px] font-semibold leading-none text-stone-950 sm:text-5xl">Calendar</h1>
              <p className="mt-3 max-w-xl text-[15px] leading-6 text-stone-500">
                Plan approved content and see what is coming up.
              </p>
            </div>
            <Link href="/draft-posts?status=Approved" className="inline-flex w-fit rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
              Open Review
            </Link>
          </div>
        </div>
      </header>

      <section className="px-5 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="rounded-[30px] bg-stone-50 p-4 ring-1 ring-stone-100 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="mr-auto text-2xl font-semibold text-stone-950">{monthLabel}</h2>
                {notice && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">{notice}</span>}
                <button type="button" onClick={prevMonth} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Previous</button>
                <button type="button" onClick={goToToday} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Today</button>
                <button type="button" onClick={nextMonth} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">Next</button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-400 sm:gap-2">
                {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
                {calendarDays.map((day, index) => {
                  const dayDrafts = day.date ? scheduledByDate[day.date] ?? [] : []
                  const active = day.date === selectedDate
                  const isToday = day.date === dateToStr(today)
                  return (
                    <button
                      key={`${day.date ?? 'blank'}-${index}`}
                      type="button"
                      disabled={!day.date}
                      onClick={() => day.date && setSelectedDate(day.date)}
                      className={`min-h-[74px] rounded-[18px] p-2 text-left transition sm:min-h-[118px] ${
                        !day.date
                          ? 'bg-transparent'
                          : active
                            ? 'bg-white ring-2 ring-ember-400'
                            : 'bg-white ring-1 ring-stone-200 hover:ring-ember-200'
                      }`}
                    >
                      {day.date && (
                        <>
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isToday ? 'bg-ember-500 text-white' : 'text-stone-700'}`}>
                            {day.day}
                          </span>
                          <div className="mt-2 space-y-1">
                            {dayDrafts.slice(0, 2).map((draft) => (
                              <div key={draft.id} className="flex items-center gap-1.5 overflow-hidden rounded-full bg-stone-50 px-1.5 py-1 ring-1 ring-stone-100">
                                <div className="h-5 w-5 flex-shrink-0 overflow-hidden rounded-full bg-stone-200">
                                  <LocalMedia media={draft.media} className="h-full w-full object-cover" />
                                </div>
                                <span className="hidden truncate text-[11px] font-semibold text-stone-700 sm:block">{draft.title}</span>
                              </div>
                            ))}
                            {dayDrafts.length > 2 && <p className="text-[11px] font-semibold text-stone-400">+{dayDrafts.length - 2} more</p>}
                          </div>
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[30px] bg-white p-5 shadow-[0_18px_60px_rgba(28,25,23,0.07)] ring-1 ring-stone-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-stone-950">{selectedDate ? formatDateLabel(selectedDate) : 'Select a date'}</h2>
                  <p className="mt-1 text-sm text-stone-500">{selectedDrafts.length === 0 ? 'No posts scheduled for this date.' : `${selectedDrafts.length} scheduled post${selectedDrafts.length === 1 ? '' : 's'}.`}</p>
                </div>
                {approvedUnscheduled[0] && selectedDate && (
                  <button type="button" onClick={() => openScheduleModal(approvedUnscheduled[0], selectedDate)} className="rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ember-600">
                    Add Post
                  </button>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {selectedDrafts.map((draft) => (
                  <ScheduledCard key={draft.id} draft={draft} onEdit={() => openScheduleModal(draft, draft.schedule?.scheduledDate)} onRemove={() => removeSchedule(draft)} />
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[30px] bg-stone-950 p-5 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-300">Approved and Unscheduled</p>
              <h2 className="mt-2 text-2xl font-semibold">{approvedUnscheduled.length}</h2>
              <p className="mt-1 text-sm text-stone-300">Approved posts waiting for a date.</p>
            </div>

            {approvedUnscheduled.length === 0 ? (
              <div className="rounded-[28px] bg-stone-50 p-5 text-sm text-stone-500 ring-1 ring-stone-100">
                <h3 className="font-semibold text-stone-950">Nothing is ready to schedule yet</h3>
                <p className="mt-2 leading-6">Review and approve a draft first.</p>
                <Link href="/draft-posts" className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">
                  Open Review
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {approvedUnscheduled.map((draft) => (
                  <ApprovedDraftCard key={draft.id} draft={draft} onSchedule={() => openScheduleModal(draft)} />
                ))}
              </div>
            )}

            <div className="rounded-[28px] bg-stone-50 p-5 ring-1 ring-stone-100">
              <h3 className="font-semibold text-stone-950">Coming Up</h3>
              {scheduledDrafts.length === 0 ? (
                <p className="mt-2 text-sm leading-6 text-stone-500">No posts scheduled yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {scheduledDrafts
                    .slice()
                    .sort((a, b) => (a.schedule?.scheduledDate ?? '').localeCompare(b.schedule?.scheduledDate ?? ''))
                    .slice(0, 5)
                    .map((draft) => (
                      <button key={draft.id} type="button" onClick={() => draft.schedule && setSelectedDate(draft.schedule.scheduledDate)} className="flex w-full items-center gap-3 rounded-[18px] bg-white p-2 text-left ring-1 ring-stone-100 hover:ring-ember-200">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-[14px] bg-stone-200">
                          <LocalMedia media={draft.media} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-950">{draft.title}</p>
                          <p className="text-xs text-stone-500">{draft.schedule ? formatDateLabel(draft.schedule.scheduledDate) : ''}</p>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {modalDraft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/35 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
          <form onSubmit={saveSchedule} className="w-full max-w-lg rounded-[30px] bg-white p-5 shadow-2xl ring-1 ring-stone-200">
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-[20px] bg-stone-100">
                <LocalMedia media={modalDraft.media} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ember-600">{modalDraft.source === 'event' ? 'Event' : 'Content Library'}</p>
                <h2 id="schedule-title" className="mt-1 text-2xl font-semibold leading-tight text-stone-950">{modalDraft.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-stone-500">{modalDraft.caption}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-stone-700">
                Date
                <input required type="date" value={modalDate} onChange={(event) => setModalDate(event.target.value)} className="input mt-2 w-full" />
              </label>
              <label className="block text-sm font-semibold text-stone-700">
                Time
                <input type="time" value={modalTime} onChange={(event) => setModalTime(event.target.value)} className="input mt-2 w-full" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-semibold text-stone-700">
              Platform
              <select value={modalPlatform} onChange={(event) => setModalPlatform(event.target.value as LocalSchedulePlatform)} className="input mt-2 w-full">
                {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold text-stone-700">
              Notes
              <textarea value={modalNotes} onChange={(event) => setModalNotes(event.target.value)} className="input mt-2 min-h-[90px] w-full resize-y" placeholder="Optional scheduling note" />
            </label>

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              {modalDraft.schedule && (
                <button type="button" onClick={() => removeSchedule(modalDraft)} className="rounded-full px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50">
                  Remove from Calendar
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setModalDraft(null)} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                  Cancel
                </button>
                <button type="submit" className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
                  {modalDraft.schedule ? 'Update Schedule' : 'Schedule Post'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}

function ApprovedDraftCard({ draft, onSchedule }: { draft: CalendarDraft; onSchedule: () => void }) {
  return (
    <article className="rounded-[24px] bg-white p-3 shadow-[0_12px_40px_rgba(28,25,23,0.06)] ring-1 ring-stone-200">
      <div className="flex gap-3">
        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-[18px] bg-stone-100">
          <LocalMedia media={draft.media} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ember-600">{draft.source === 'event' ? 'Event' : 'Content Library'}</p>
          <h3 className="mt-1 truncate text-sm font-semibold text-stone-950">{draft.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{draft.caption}</p>
        </div>
      </div>
      <button type="button" onClick={onSchedule} className="mt-3 w-full rounded-full bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800">
        Schedule
      </button>
    </article>
  )
}

function ScheduledCard({ draft, onEdit, onRemove }: { draft: CalendarDraft; onEdit: () => void; onRemove: () => void }) {
  return (
    <article className="rounded-[24px] bg-stone-50 p-3 ring-1 ring-stone-100">
      <div className="flex gap-3">
        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-[18px] bg-stone-200">
          <LocalMedia media={draft.media} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-emerald-700">{draft.schedule?.scheduledPlatform}</p>
          <h3 className="mt-1 truncate text-sm font-semibold text-stone-950">{draft.title}</h3>
          <p className="mt-1 text-xs text-stone-500">{draft.schedule?.scheduledTime || 'No time set'}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onEdit} className="flex-1 rounded-full bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">
          Edit Schedule
        </button>
        <button type="button" onClick={onRemove} className="rounded-full px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
          Remove
        </button>
      </div>
    </article>
  )
}

function readCalendarDrafts(): CalendarDraft[] {
  const schedules = readLocalScheduledPosts()
  const scheduleFor = (source: LocalScheduleSource, draftId: string, eventId?: string) =>
    schedules.find((schedule) => schedule.source === source && schedule.draftId === draftId && (source !== 'event' || schedule.eventId === eventId))

  const events = readLocalEvents()
  const generatedPosts = readAllLocalGeneratedPosts()
  const eventDrafts = Object.entries(generatedPosts).flatMap(([eventId, drafts]) => {
    const event = events.find((item) => item.id === eventId)
    if (!event) return []
    const statuses = readLocalPostStatuses(eventId)

    return drafts.flatMap((draft): CalendarDraft[] => {
      const schedule = scheduleFor('event', draft.id, eventId)
      const status = schedule ? 'Scheduled' : statuses[draft.id] ?? 'Draft'
      if (status !== 'Approved' && status !== 'Scheduled') return []
      return [{
        id: draft.id,
        source: 'event',
        eventId,
        title: event.name.trim() || draft.sourceLabel || 'Untitled Event',
        subtitle: event.type,
        caption: draft.caption,
        strategy: draft.tone,
        media: draft.media,
        status,
        schedule,
      }]
    })
  })

  const contentStatuses = readContentBankDraftStatuses()
  const contentDrafts = readContentBankDrafts().flatMap((draft): CalendarDraft[] => {
    const schedule = scheduleFor('content-library', draft.id)
    const status = schedule ? 'Scheduled' : contentStatuses[draft.id] ?? 'Draft'
    if (status !== 'Approved' && status !== 'Scheduled') return []
    return [{
      id: draft.id,
      source: 'content-library',
      contentBankItemId: draft.sourceId ?? draft.contentBankItemIds[0],
      title: draft.sourceLabel || draft.tone || 'Content Library Post',
      subtitle: draft.context.category,
      caption: draft.caption,
      strategy: draft.tone,
      media: draft.media,
      status,
      schedule,
    }]
  })

  return [...eventDrafts, ...contentDrafts].sort((a, b) => {
    const aDate = a.schedule?.scheduledDate ?? '9999-12-31'
    const bDate = b.schedule?.scheduledDate ?? '9999-12-31'
    return aDate.localeCompare(bDate) || a.title.localeCompare(b.title)
  })
}

function getMonthCells(cursor: Date) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ date: string | null; day: number }> = []

  for (let index = 0; index < firstDay; index++) cells.push({ date: null, day: 0 })
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, day })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: 0 })
  return cells
}

function dateToStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
