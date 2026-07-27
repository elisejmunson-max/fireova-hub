'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import LocalMedia from '@/components/local-media'
import {
  readAllLocalGeneratedPosts,
  readLocalEvents,
  readLocalPostStatuses,
  writeLocalPostStatuses,
  type LocalGeneratedPostDraft,
  type LocalPostDraftStatus,
} from '@/lib/local-fireova-events'
import {
  readContentBankDrafts,
  readContentBankDraftStatuses,
  writeContentBankDraftStatuses,
  type ContentBankDraft,
} from '@/lib/local-fireova-content-bank'
import { mockEvents, type MockMedia } from '@/lib/mock-fireova-content'

type ReviewStatus = LocalPostDraftStatus | 'Scheduled' | 'Published'
type ReviewFilter = 'Needs Review' | 'Approved' | 'Scheduled' | 'Published' | 'Skipped'

type ReviewPost = {
  source: 'Event' | 'Content Library'
  sourceId?: string
  sourceLabel: string
  subtitle: string
  href: string
  draft: LocalGeneratedPostDraft | ContentBankDraft
  status: ReviewStatus
  eventOrder: number
  draftOrder: number
  eventTotal: number
  eventReviewed: number
  eventMedia?: MockMedia[]
  eventCreatedAt?: string
}

type EventProgress = {
  eventId: string
  eventName: string
  subtitle: string
  href: string
  heroMedia?: MockMedia
  projectStatus: string
  reviewed: number
  total: number
  remaining: number
  percent: number
  remainingWork: string
  estimate: string
  lastActivity?: string
  statusCount: number
  eventOrder: number
}

const FILTERS: ReviewFilter[] = ['Needs Review', 'Approved', 'Scheduled', 'Published', 'Skipped']

const STATUS_STYLES: Record<ReviewStatus, string> = {
  Draft: 'bg-amber-50 text-amber-800 ring-amber-100',
  Approved: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  Scheduled: 'bg-sky-50 text-sky-800 ring-sky-100',
  Published: 'bg-stone-950 text-white ring-stone-950',
  Skipped: 'bg-stone-100 text-stone-600 ring-stone-200',
}

const FILTER_TO_STATUS: Record<ReviewFilter, ReviewStatus> = {
  'Needs Review': 'Draft',
  Approved: 'Approved',
  Scheduled: 'Scheduled',
  Published: 'Published',
  Skipped: 'Skipped',
}

const STATUS_RANK: Record<ReviewStatus, number> = {
  Draft: 0,
  Approved: 1,
  Scheduled: 2,
  Published: 3,
  Skipped: 4,
}

export default function ReviewPage() {
  const [posts, setPosts] = useState<ReviewPost[]>([])
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('Needs Review')
  const [contentBankStatuses, setContentBankStatuses] = useState<Record<string, LocalPostDraftStatus>>({})
  const [eventStatuses, setEventStatuses] = useState<Record<string, Record<string, LocalPostDraftStatus>>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const localEvents = readLocalEvents()
    const events = [...localEvents, ...mockEvents]
    const eventLookup = new Map(events.map((event) => [event.id, event]))
    const eventOrder = new Map(events.map((event, index) => [event.id, index]))
    const generatedPosts = readAllLocalGeneratedPosts()
    const nextEventStatuses: Record<string, Record<string, LocalPostDraftStatus>> = {}

    const eventPosts = Object.entries(generatedPosts).flatMap(([eventId, drafts]) => {
      const event = eventLookup.get(eventId)
      if (!event) return []

      const statuses = readLocalPostStatuses(eventId)
      nextEventStatuses[eventId] = statuses
      const reviewed = drafts.filter((draft) => (statuses[draft.id] ?? 'Draft') !== 'Draft').length

      return drafts.map((draft, draftOrder) => ({
        source: 'Event' as const,
        sourceId: event.id,
        sourceLabel: event.name,
        subtitle: event.type,
        href: `/content-studio?source=event&eventId=${event.id}`,
        draft,
        status: statuses[draft.id] ?? 'Draft',
        eventOrder: eventOrder.get(eventId) ?? events.length,
        draftOrder,
        eventTotal: drafts.length,
        eventReviewed: reviewed,
        eventMedia: event.media,
        eventCreatedAt: 'createdAt' in event ? event.createdAt : undefined,
      }))
    })

    const contentStatuses = readContentBankDraftStatuses()
    const mediaPosts = readContentBankDrafts().map((draft, draftOrder) => ({
      source: 'Content Library' as const,
      sourceId: draft.sourceId ?? draft.contentBankItemIds[0],
      sourceLabel: draft.sourceLabel ?? draft.angle,
      subtitle: [draft.context.category, draft.context.mediaType === 'video' ? 'Video' : 'Photo'].filter(Boolean).join(' / '),
      href: `/content-studio?source=media&ids=${encodeURIComponent(draft.contentBankItemIds[0] ?? '')}`,
      draft,
      status: contentStatuses[draft.id] ?? 'Draft',
      eventOrder: -1,
      draftOrder,
      eventTotal: 1,
      eventReviewed: contentStatuses[draft.id] && contentStatuses[draft.id] !== 'Draft' ? 1 : 0,
    }))

    setEventStatuses(nextEventStatuses)
    setContentBankStatuses(contentStatuses)
    setPosts(sortPosts([...mediaPosts, ...eventPosts]))
    setLoaded(true)
  }, [])

  function setPostStatus(post: ReviewPost, status: LocalPostDraftStatus) {
    if (post.source === 'Event' && post.sourceId) {
      const nextEventStatuses = {
        ...eventStatuses,
        [post.sourceId]: {
          ...(eventStatuses[post.sourceId] ?? {}),
          [post.draft.id]: status,
        },
      }
      setEventStatuses(nextEventStatuses)
      writeLocalPostStatuses(post.sourceId, nextEventStatuses[post.sourceId])
      setPosts((current) => refreshEventProgress(sortPosts(current.map((item) => (
        item.source === 'Event' && item.sourceId === post.sourceId && item.draft.id === post.draft.id
          ? { ...item, status }
          : item
      )))))
      return
    }

    const nextStatuses = { ...contentBankStatuses, [post.draft.id]: status }
    setContentBankStatuses(nextStatuses)
    writeContentBankDraftStatuses(nextStatuses)
    setPosts((current) => sortPosts(current.map((item) => (
      item.source === 'Content Library' && item.draft.id === post.draft.id ? { ...item, status } : item
    ))))
  }

  const counts = useMemo(() => {
    return FILTERS.reduce<Record<ReviewFilter, number>>((acc, filter) => {
      const status = FILTER_TO_STATUS[filter]
      acc[filter] = posts.filter((post) => post.status === status).length
      return acc
    }, {
      'Needs Review': 0,
      Approved: 0,
      Scheduled: 0,
      Published: 0,
      Skipped: 0,
    })
  }, [posts])

  const filteredPosts = useMemo(() => {
    const status = FILTER_TO_STATUS[activeFilter]
    return posts.filter((post) => post.status === status)
  }, [activeFilter, posts])

  const eventProjects = useMemo(() => getEventProjects(posts, activeFilter), [activeFilter, posts])
  const standalonePosts = useMemo(() => filteredPosts.filter((post) => post.source === 'Content Library'), [filteredPosts])
  const hasReviewWork = eventProjects.length > 0 || standalonePosts.length > 0

  return (
    <div className="min-h-full bg-white pb-10">
      <div className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Review</p>
          <h1 className="text-[34px] font-semibold leading-none text-stone-950 sm:text-5xl">Review</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-stone-500">
            Review, approve, and move content toward scheduling.
          </p>
        </div>
      </div>

      <main className="px-5 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <nav className="flex gap-2 overflow-x-auto rounded-[26px] bg-stone-50 p-2 ring-1 ring-stone-100" aria-label="Review status filters">
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
            <EmptyState title="Loading review queue" actionHref="/content-studio" actionLabel="Create Content" />
          ) : !hasReviewWork ? (
            <EmptyState
              title={activeFilter === 'Needs Review' ? 'Nothing needs review.' : `No ${activeFilter.toLowerCase()} content.`}
              actionHref="/content-studio"
              actionLabel="Create Content"
            />
          ) : (
            <div className="space-y-8">
              <section>
                <SectionHeading title="Event Projects" detail="Review event work as a single project." />
                {eventProjects.length > 0 ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {eventProjects.map((event) => (
                      <EventProjectCard key={event.eventId} event={event} />
                    ))}
                  </div>
                ) : (
                  <QuietState text={`No event projects are ${activeFilter.toLowerCase()}.`} />
                )}
              </section>

              <section>
                <SectionHeading title="Evergreen Content" detail="Content Library drafts that can be used anytime." />
                {standalonePosts.length > 0 ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {standalonePosts.map((post) => (
                      <ReviewCard
                        key={`${post.source}-${post.sourceId ?? 'library'}-${post.draft.id}`}
                        post={post}
                        onSetStatus={(status) => setPostStatus(post, status)}
                      />
                    ))}
                  </div>
                ) : (
                  <QuietState text={`No evergreen content is ${activeFilter.toLowerCase()}.`} />
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-stone-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-stone-500">{detail}</p>
    </div>
  )
}

function EventProjectCard({ event }: { event: EventProgress }) {
  return (
    <article className="overflow-hidden rounded-[28px] bg-stone-50 ring-1 ring-stone-100">
      <div className="grid gap-0 sm:grid-cols-[160px_minmax(0,1fr)]">
        <Link href={event.href} className="block p-3">
          <div className="aspect-[4/3] overflow-hidden rounded-[22px] bg-stone-200 sm:aspect-[4/5]">
            {event.heroMedia ? (
              <MediaPreview media={event.heroMedia} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-stone-100 text-xs font-semibold uppercase tracking-wide text-stone-400">
                Event
              </div>
            )}
          </div>
        </Link>

        <div className="flex flex-col justify-between gap-5 p-5 pl-5 sm:pl-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ember-600">{event.subtitle}</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200">
                {event.projectStatus}
              </span>
            </div>
            <h3 className="mt-2 text-2xl font-semibold leading-tight text-stone-950">{event.eventName}</h3>

            <div className="mt-4 space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-stone-200">
                <div className="h-full rounded-full bg-ember-500" style={{ width: `${event.percent}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-stone-700">
                <span>{event.percent}% complete</span>
                <span>{event.reviewed} of {event.total} reviewed</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
              <span>{event.remainingWork}</span>
              <span>{event.estimate}</span>
              {event.lastActivity && <span>{event.lastActivity}</span>}
            </div>
          </div>
          <Link href={event.href} className="inline-flex w-full justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 sm:w-fit">
            {getEventActionLabel(event)}
          </Link>
        </div>
      </div>
    </article>
  )
}

function ReviewCard({
  post,
  onSetStatus,
}: {
  post: ReviewPost
  onSetStatus: (status: LocalPostDraftStatus) => void
}) {
  const action = getCardAction(post)

  return (
    <article className="overflow-hidden rounded-[28px] bg-white shadow-[0_18px_60px_rgba(28,25,23,0.07)] ring-1 ring-stone-200">
      <div className="grid gap-0 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Link href={action.href} className="block p-2.5">
          <div className="relative aspect-square overflow-hidden rounded-[22px] bg-stone-100 sm:aspect-[4/5]">
            <MediaPreview media={post.draft.media} />
            <span className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${STATUS_STYLES[post.status]}`}>
              {post.status === 'Draft' ? 'Needs Review' : post.status}
            </span>
          </div>
        </Link>

        <div className="flex flex-col justify-between gap-5 p-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ember-50 px-3 py-1.5 text-xs font-semibold text-ember-800 ring-1 ring-ember-100">
                {post.draft.tone}
              </span>
              <span className="rounded-full bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-500 ring-1 ring-stone-100">
                {post.source}
              </span>
            </div>
            <h2 className="text-xl font-semibold leading-tight text-stone-950">{post.sourceLabel}</h2>
            <p className="mt-1 text-sm font-medium text-stone-500">{post.subtitle}</p>
            <p className="mt-4 line-clamp-4 text-[15px] leading-6 text-stone-700">
              {post.draft.caption.trim() || 'Needs Caption'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {post.status === 'Skipped' ? (
              <button type="button" onClick={() => onSetStatus('Draft')} className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
                Restore
              </button>
            ) : (
              <Link href={action.href} className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
                {action.label}
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

function QuietState({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-[24px] bg-stone-50 px-5 py-8 text-sm font-medium text-stone-500 ring-1 ring-stone-100">
      {text}
    </div>
  )
}

function MediaPreview({ media }: { media: MockMedia }) {
  return <LocalMedia media={media} className="h-full w-full object-cover" />
}

function getCardAction(post: ReviewPost) {
  if (post.status === 'Approved') return { label: 'Schedule', href: '/calendar' }
  if (post.status === 'Scheduled') return { label: 'View Calendar', href: '/calendar' }
  if (post.status === 'Published') return { label: 'View Calendar', href: '/calendar' }
  if (post.status === 'Skipped') return { label: 'Restore', href: post.href }
  return { label: 'Review', href: post.href }
}

function getEventProjects(posts: ReviewPost[], activeFilter: ReviewFilter): EventProgress[] {
  const byEvent = new Map<string, EventProgress & { drafts: ReviewPost[] }>()
  const activeStatus = FILTER_TO_STATUS[activeFilter]

  posts.forEach((post) => {
    if (post.source !== 'Event' || !post.sourceId) return
    const current = byEvent.get(post.sourceId) ?? {
      eventId: post.sourceId,
      eventName: post.sourceLabel,
      subtitle: post.subtitle,
      href: '',
      heroMedia: undefined,
      projectStatus: 'Needs Review',
      reviewed: 0,
      total: 0,
      remaining: 0,
      percent: 0,
      remainingWork: '',
      estimate: '',
      lastActivity: formatLastActivity(post.eventCreatedAt),
      statusCount: 0,
      eventOrder: post.eventOrder,
      drafts: [],
    }

    current.drafts.push(post)
    current.total += 1
    if (isReviewedStatus(post.status)) current.reviewed += 1
    if (post.status === 'Draft') current.remaining += 1
    if (post.status === activeStatus) current.statusCount += 1
    if (!current.heroMedia) current.heroMedia = post.draft.media ?? post.eventMedia?.[0]
    byEvent.set(post.sourceId, current)
  })

  return Array.from(byEvent.values())
    .filter((event) => event.statusCount > 0)
    .map((event) => {
      const percent = Math.round((event.reviewed / Math.max(event.total, 1)) * 100)
      const nextDraft = event.drafts.find((post) => post.status === 'Draft')
      const approvedCount = event.drafts.filter((post) => post.status === 'Approved').length
      const scheduledCount = event.drafts.filter((post) => post.status === 'Scheduled').length
      const publishedCount = event.drafts.filter((post) => post.status === 'Published').length
      const skippedCount = event.drafts.filter((post) => post.status === 'Skipped').length
      const projectStatus = getProjectStatus({
        total: event.total,
        reviewed: event.reviewed,
        remaining: event.remaining,
        approvedCount,
        scheduledCount,
        publishedCount,
        skippedCount,
      })
      const targetFilter = nextDraft ? 'Needs Review' : approvedCount > 0 ? 'Approved' : activeFilter
      const targetDraft = nextDraft ?? event.drafts.find((post) => post.status === 'Approved') ?? event.drafts[0]
      const href = projectStatus === 'Ready to Schedule' || projectStatus === 'Scheduled'
        ? '/calendar'
        : projectStatus === 'Complete'
          ? `/events/${event.eventId}`
          : `/events/${event.eventId}/review?status=${encodeURIComponent(targetFilter)}${targetDraft ? `&postId=${encodeURIComponent(targetDraft.draft.id)}` : ''}`

      return {
        ...event,
        href,
        projectStatus,
        percent,
        remainingWork: getRemainingWork(event.remaining, approvedCount),
        estimate: getTimeEstimate(event.drafts, event.remaining, approvedCount),
      }
    })
    .sort((a, b) => a.eventOrder - b.eventOrder)
}

function refreshEventProgress(posts: ReviewPost[]) {
  const byEvent = new Map<string, { reviewed: number; total: number }>()

  posts.forEach((post) => {
    if (post.source !== 'Event' || !post.sourceId) return
    const current = byEvent.get(post.sourceId) ?? { reviewed: 0, total: 0 }
    current.total += 1
    if (isReviewedStatus(post.status)) current.reviewed += 1
    byEvent.set(post.sourceId, current)
  })

  return posts.map((post) => {
    if (post.source !== 'Event' || !post.sourceId) return post
    const progress = byEvent.get(post.sourceId)
    return progress ? { ...post, eventReviewed: progress.reviewed, eventTotal: progress.total } : post
  })
}

function getEventActionLabel(event: EventProgress) {
  if (event.projectStatus === 'Ready to Schedule') return 'Schedule Posts'
  if (event.projectStatus === 'Scheduled') return 'View Calendar'
  if (event.projectStatus === 'Complete') return 'View Project'
  return 'Continue Review'
}

function getProjectStatus({
  total,
  reviewed,
  remaining,
  approvedCount,
  scheduledCount,
  publishedCount,
  skippedCount,
}: {
  total: number
  reviewed: number
  remaining: number
  approvedCount: number
  scheduledCount: number
  publishedCount: number
  skippedCount: number
}) {
  if (total > 0 && publishedCount + skippedCount === total) return 'Complete'
  if (remaining === 0 && approvedCount > 0) return 'Ready to Schedule'
  if (approvedCount === 0 && remaining === 0 && scheduledCount > 0) return 'Scheduled'
  if (reviewed > 0 && remaining > 0) return 'In Progress'
  return 'Needs Review'
}

function getRemainingWork(remaining: number, approvedCount: number) {
  if (remaining > 0) return `${remaining} draft${remaining === 1 ? '' : 's'} waiting`
  if (approvedCount > 0) return `${approvedCount} approved post${approvedCount === 1 ? '' : 's'} ready to schedule`
  return 'Review complete'
}

function getTimeEstimate(posts: ReviewPost[], remaining: number, approvedCount: number) {
  if (remaining === 0 && approvedCount > 0) return 'Ready to schedule'
  const minutes = posts.reduce((total, post) => {
    if (post.status !== 'Draft') return total
    let estimate = 1
    if (!post.draft.caption.trim()) estimate += 1
    if (isCreditMissing(post.draft)) estimate += 1
    return total + estimate
  }, 0)

  return `About ${Math.max(minutes, 1)} min`
}

function isCreditMissing(draft: LocalGeneratedPostDraft | ContentBankDraft) {
  if (!('vendorSnapshot' in draft) || !draft.vendorSnapshot?.creditBlock.trim()) return false
  return !draft.vendorCreditBlock?.includes(draft.vendorSnapshot.creditBlock.trim())
}

function isReviewedStatus(status: ReviewStatus) {
  return status !== 'Draft'
}

function formatLastActivity(value?: string) {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000)

  if (diffDays === 0) return 'Updated today'
  if (diffDays === 1) return 'Updated yesterday'
  return `Updated ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function sortPosts(posts: ReviewPost[]) {
  return [...posts].sort((a, b) => {
    const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (statusDiff !== 0) return statusDiff
    if (a.eventOrder !== b.eventOrder) return a.eventOrder - b.eventOrder
    return a.draftOrder - b.draftOrder
  })
}
