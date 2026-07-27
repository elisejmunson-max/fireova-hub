'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import LocalMedia from '@/components/local-media'
import {
  readLocalEvents,
  readLocalGeneratedPosts,
  readLocalPostStatuses,
  writeLocalPostStatuses,
  type LocalGeneratedPostDraft,
  type LocalPostDraftStatus,
} from '@/lib/local-fireova-events'
import type { MockMedia } from '@/lib/mock-fireova-content'

type ReviewStatus = LocalPostDraftStatus | 'Scheduled' | 'Published'
type ReviewFilter = 'Needs Review' | 'Approved' | 'Scheduled' | 'Published' | 'Skipped'

type EventReviewDraft = {
  draft: LocalGeneratedPostDraft
  status: ReviewStatus
  order: number
}

const FILTERS: ReviewFilter[] = ['Needs Review', 'Approved', 'Scheduled', 'Published', 'Skipped']

const FILTER_TO_STATUS: Record<ReviewFilter, ReviewStatus> = {
  'Needs Review': 'Draft',
  Approved: 'Approved',
  Scheduled: 'Scheduled',
  Published: 'Published',
  Skipped: 'Skipped',
}

const STATUS_STYLES: Record<ReviewStatus, string> = {
  Draft: 'bg-amber-50 text-amber-800 ring-amber-100',
  Approved: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  Scheduled: 'bg-sky-50 text-sky-800 ring-sky-100',
  Published: 'bg-stone-950 text-white ring-stone-950',
  Skipped: 'bg-stone-100 text-stone-600 ring-stone-200',
}

export default function EventReviewPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams()
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})
  const [drafts, setDrafts] = useState<EventReviewDraft[]>([])
  const [statuses, setStatuses] = useState<Record<string, LocalPostDraftStatus>>({})
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('Needs Review')
  const [loaded, setLoaded] = useState(false)
  const event = useMemo(() => readLocalEvents().find((item) => item.id === params.id) ?? null, [params.id])

  useEffect(() => {
    const requestedStatus = searchParams?.get('status')

    const nextStatuses = readLocalPostStatuses(params.id)
    const nextDrafts = readLocalGeneratedPosts(params.id).map((draft, order) => ({
      draft,
      status: nextStatuses[draft.id] ?? 'Draft',
      order,
    }))
    const requestedDraft = nextDrafts.find((item) => item.draft.id === searchParams?.get('postId'))

    if (requestedDraft) {
      setActiveFilter(statusToFilter(requestedDraft.status))
    } else if (isReviewFilter(requestedStatus)) {
      setActiveFilter(requestedStatus)
    }
    setStatuses(nextStatuses)
    setDrafts(nextDrafts)
    setLoaded(true)
  }, [params.id, searchParams])

  useEffect(() => {
    const postId = searchParams?.get('postId')
    if (!postId || drafts.length === 0) return
    window.setTimeout(() => {
      cardRefs.current[postId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }, [drafts, searchParams])

  function setDraftStatus(draftId: string, status: LocalPostDraftStatus) {
    const nextStatuses = { ...statuses, [draftId]: status }
    setStatuses(nextStatuses)
    writeLocalPostStatuses(params.id, nextStatuses)
    setDrafts((current) => current.map((item) => item.draft.id === draftId ? { ...item, status } : item))
  }

  const counts = useMemo(() => {
    return FILTERS.reduce<Record<ReviewFilter, number>>((acc, filter) => {
      const status = FILTER_TO_STATUS[filter]
      acc[filter] = drafts.filter((item) => item.status === status).length
      return acc
    }, {
      'Needs Review': 0,
      Approved: 0,
      Scheduled: 0,
      Published: 0,
      Skipped: 0,
    })
  }, [drafts])

  const reviewed = drafts.filter((item) => item.status !== 'Draft').length
  const remaining = drafts.filter((item) => item.status === 'Draft').length
  const percent = Math.round((reviewed / Math.max(drafts.length, 1)) * 100)
  const filteredDrafts = drafts.filter((item) => item.status === FILTER_TO_STATUS[activeFilter])
  const requestedPostId = searchParams?.get('postId')
  const currentDraft = drafts.find((item) => item.draft.id === requestedPostId) ?? filteredDrafts[0] ?? drafts[0]
  const nextUnfinishedDraft = drafts.find((item) => item.status === 'Draft' && item.draft.id !== currentDraft?.draft.id)

  if (!event && loaded) {
    return (
      <div className="min-h-full bg-white px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-[28px] bg-stone-50 px-6 py-12 text-center ring-1 ring-stone-200">
          <h1 className="text-2xl font-semibold text-stone-950">Event not found</h1>
          <Link href="/draft-posts" className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white">
            Back to Review
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-white pb-10">
      <div className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/draft-posts" className="mb-5 inline-flex text-sm font-semibold text-stone-500 hover:text-stone-950">
            Back to Review
          </Link>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Event Review</p>
          <h1 className="text-[34px] font-semibold leading-none text-stone-950 sm:text-5xl">{event?.name ?? 'Event Review'}</h1>
          {currentDraft && (
            <p className="mt-3 text-sm font-semibold text-stone-500">
              Reviewing Post {currentDraft.order + 1} of {drafts.length}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-stone-50 px-3 py-1.5 text-sm font-semibold text-stone-800 ring-1 ring-stone-200">
              {reviewed} of {drafts.length} Reviewed
            </span>
            <span className="rounded-full bg-stone-50 px-3 py-1.5 text-sm font-semibold text-stone-800 ring-1 ring-stone-200">
              {remaining} Draft{remaining === 1 ? '' : 's'} Remaining
            </span>
          </div>
          <div className="mt-4 max-w-xl space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-stone-100 ring-1 ring-stone-200">
              <div className="h-full rounded-full bg-ember-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-sm font-semibold text-stone-600">{percent}% complete</p>
          </div>
        </div>
      </div>

      <main className="px-5 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <nav className="flex gap-2 overflow-x-auto rounded-[26px] bg-stone-50 p-2 ring-1 ring-stone-100" aria-label="Event review status filters">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`whitespace-nowrap rounded-[20px] px-4 py-3 text-sm font-semibold transition-colors ${
                  activeFilter === filter
                    ? 'bg-white text-stone-950 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-stone-200'
                    : 'text-stone-500 hover:bg-white/70 hover:text-stone-800'
                }`}
              >
                {filter}
                <span className="ml-2 text-xs text-stone-400">{counts[filter]}</span>
              </button>
            ))}
          </nav>

          {!loaded ? (
            <EmptyState title="Loading event review" actionHref="/draft-posts" actionLabel="Back to Review" />
          ) : drafts.length === 0 ? (
            <EmptyState title="No drafts for this event yet." actionHref={`/content-studio?source=event&eventId=${params.id}`} actionLabel="Create Content" />
          ) : filteredDrafts.length === 0 ? (
            <EmptyState title={`No ${activeFilter.toLowerCase()} drafts for this event.`} actionHref={`/content-studio?source=event&eventId=${params.id}`} actionLabel="Open Content Studio" />
          ) : (
            <section className="grid gap-4 lg:grid-cols-2">
              {filteredDrafts.map((item) => (
                <EventDraftCard
                  key={item.draft.id}
                  item={item}
                  eventId={params.id}
                  active={item.draft.id === currentDraft?.draft.id}
                  nextDraftId={nextUnfinishedDraft?.draft.id}
                  refCallback={(node) => {
                    cardRefs.current[item.draft.id] = node
                  }}
                  onSetStatus={setDraftStatus}
                />
              ))}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

function EventDraftCard({
  item,
  eventId,
  active,
  nextDraftId,
  refCallback,
  onSetStatus,
}: {
  item: EventReviewDraft
  eventId: string
  active: boolean
  nextDraftId?: string
  refCallback: (node: HTMLElement | null) => void
  onSetStatus: (draftId: string, status: LocalPostDraftStatus) => void
}) {
  const action = getCardAction(item.status, eventId)

  return (
    <article ref={refCallback} id={`draft-${item.draft.id}`} className={`overflow-hidden rounded-[28px] bg-white shadow-[0_18px_60px_rgba(28,25,23,0.07)] ring-1 ${active ? 'ring-ember-300' : 'ring-stone-200'}`}>
      <div className="grid gap-0 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Link href={action.href} className="block p-2.5">
          <div className="relative aspect-square overflow-hidden rounded-[22px] bg-stone-100 sm:aspect-[4/5]">
            <MediaPreview media={item.draft.media} />
            <span className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${STATUS_STYLES[item.status]}`}>
              {item.status === 'Draft' ? 'Needs Review' : item.status}
            </span>
          </div>
        </Link>

        <div className="flex flex-col justify-between gap-5 p-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ember-50 px-3 py-1.5 text-xs font-semibold text-ember-800 ring-1 ring-ember-100">
                {item.draft.tone}
              </span>
              <span className="rounded-full bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-100">
                Post {item.order + 1}
              </span>
            </div>
            <p className="line-clamp-6 text-[15px] leading-6 text-stone-700">
              {item.draft.caption.trim() || 'Needs Caption'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={action.href} className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
              {action.label}
            </Link>
            {item.status === 'Draft' && (
              <>
                <button type="button" onClick={() => onSetStatus(item.draft.id, 'Approved')} className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                  Approve
                </button>
                <button type="button" onClick={() => onSetStatus(item.draft.id, 'Skipped')} className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                  Skip
                </button>
              </>
            )}
            {item.status === 'Skipped' && (
              <button type="button" onClick={() => onSetStatus(item.draft.id, 'Draft')} className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                Restore
              </button>
            )}
            {nextDraftId && (
              <Link href={`/events/${eventId}/review?status=Needs+Review&postId=${encodeURIComponent(nextDraftId)}`} className="rounded-full bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-200">
                Review Next Draft
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function EmptyState({ title, actionHref, actionLabel }: { title: string; actionHref: string; actionLabel: string }) {
  return (
    <section className="rounded-[30px] bg-stone-50 px-6 py-12 text-center ring-1 ring-stone-100">
      <h2 className="text-2xl font-semibold text-stone-950">{title}</h2>
      <Link href={actionHref} className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100">
        {actionLabel}
      </Link>
    </section>
  )
}

function MediaPreview({ media }: { media: MockMedia }) {
  return <LocalMedia media={media} className="h-full w-full object-cover" />
}

function getCardAction(status: ReviewStatus, eventId: string) {
  const studioHref = `/content-studio?source=event&eventId=${eventId}`
  if (status === 'Approved') return { label: 'Schedule', href: '/calendar' }
  if (status === 'Scheduled') return { label: 'View Calendar', href: '/calendar' }
  if (status === 'Published') return { label: 'View Details', href: studioHref }
  if (status === 'Skipped') return { label: 'View Details', href: studioHref }
  return { label: 'Open Studio', href: studioHref }
}

function isReviewFilter(value: string | null): value is ReviewFilter {
  return FILTERS.includes(value as ReviewFilter)
}

function statusToFilter(status: ReviewStatus): ReviewFilter {
  if (status === 'Draft') return 'Needs Review'
  return status
}
