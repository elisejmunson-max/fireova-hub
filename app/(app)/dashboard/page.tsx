'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import LocalMedia from '@/components/local-media'
import {
  getActiveGoals,
  getGoalRule,
  readBusinessProfile,
  type BusinessGoal,
  type BusinessProfile,
  type ProfileFormat,
} from '@/lib/local-fireova-business-profile'
import {
  getEventCoverMedia,
  readAllLocalGeneratedPosts,
  readLocalEvents,
  readLocalPostStatuses,
  type LocalFireovaEvent,
  type LocalGeneratedPostDraft,
  type LocalPostDraftStatus,
} from '@/lib/local-fireova-events'
import {
  createMockMediaForContentBankItem,
  readAllContentBankItems,
  readContentBankDrafts,
  readContentBankDraftStatuses,
  type ContentBankDraft,
  type LocalContentBankItem,
} from '@/lib/local-fireova-content-bank'
import {
  getOpportunityMedia,
  type MarketingOpportunity,
} from '@/lib/local-fireova-opportunities'
import {
  safelyGetOrGenerateMarketingIntelligence,
  type MarketingIntelligence,
} from '@/lib/local-fireova-marketing-intelligence'
import type { MockMedia } from '@/lib/mock-fireova-content'

type FeedStatus = 'Ready' | 'Needs Review' | 'Missing Content'

type DirectorData = {
  profile: BusinessProfile | null
  events: LocalFireovaEvent[]
  eventDrafts: EventDraftContext[]
  mediaItems: LocalContentBankItem[]
  mediaDrafts: MediaDraftContext[]
  opportunities: OpportunityContext[]
  intelligenceReports: MarketingIntelligence[]
}

type EventDraftContext = {
  source: 'event'
  event: LocalFireovaEvent
  draft: LocalGeneratedPostDraft
  status: LocalPostDraftStatus
}

type MediaDraftContext = {
  source: 'content-bank'
  draft: ContentBankDraft
  status: LocalPostDraftStatus
}

type OpportunityContext = {
  event: LocalFireovaEvent
  opportunity: MarketingOpportunity
}

type FeedRecommendation = {
  id: string
  day: string
  title: string
  eventName?: string
  purpose: string
  format: ProfileFormat
  status: FeedStatus
  reason: string
  action: {
    label: string
    href: string
  }
  media?: MockMedia
  score: number
  goalLabels: string[]
  featuredService?: string
  summary?: string
  opportunityId?: string
}

type StorySuggestion = {
  id: string
  title: string
  detail: string
  href: string
}

type ContentGap = {
  id: string
  title: string
  detail: string
  action: {
    label: string
    href: string
  }
}

type DailyTask = {
  id: string
  label: string
  href: string
  minutes: number
}

const EMPTY_DIRECTOR_DATA: DirectorData = {
  profile: null,
  events: [],
  eventDrafts: [],
  mediaItems: [],
  mediaDrafts: [],
  opportunities: [],
  intelligenceReports: [],
}

const POSTING_DAYS = ['Tuesday', 'Thursday', 'Saturday']

const STATUS_STYLES: Record<FeedStatus, string> = {
  Ready: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  'Needs Review': 'bg-amber-50 text-amber-800 ring-amber-100',
  'Missing Content': 'bg-stone-100 text-stone-700 ring-stone-200',
}

export default function DashboardPage() {
  const [loaded, setLoaded] = useState(false)
  const [greeting, setGreeting] = useState('Hello')
  const [data, setData] = useState<DirectorData>(EMPTY_DIRECTOR_DATA)

  useEffect(() => {
    setGreeting(getGreeting())

    const profile = readBusinessProfile()
    const events = readLocalEvents()
    const generatedPosts = readAllLocalGeneratedPosts()
    const eventDrafts = Object.entries(generatedPosts).flatMap(([eventId, drafts]) => {
      const event = events.find((item) => item.id === eventId)
      if (!event) return []

      const statuses = readLocalPostStatuses(eventId)
      return drafts.map((draft) => ({
        source: 'event' as const,
        event,
        draft,
        status: statuses[draft.id] ?? 'Draft',
      }))
    })
    const mediaDraftStatuses = readContentBankDraftStatuses()
    const mediaDrafts = readContentBankDrafts().map((draft) => ({
      source: 'content-bank' as const,
      draft,
      status: mediaDraftStatuses[draft.id] ?? 'Draft',
    }))
    const intelligenceReports = events
      .map((event) => safelyGetOrGenerateMarketingIntelligence(event, { profile }))
      .map((result) => result.report)
      .filter((report): report is MarketingIntelligence => Boolean(report))
    const opportunities = intelligenceReports.flatMap((report) => {
      const event = events.find((item) => item.id === report.eventId)
      if (!event) return []
      return report.opportunities
        .filter((opportunity) => opportunity.status !== 'Dismissed')
        .map((opportunity) => ({ event, opportunity }))
    })

    setData({
      profile,
      events,
      eventDrafts,
      mediaItems: readAllContentBankItems(),
      mediaDrafts,
      opportunities,
      intelligenceReports,
    })
    setLoaded(true)
  }, [])

  const activeGoals = useMemo(() => data.profile ? getActiveGoals(data.profile) : [], [data.profile])
  const weeklyPlan = useMemo(() => data.profile ? buildWeeklyPlan(data, data.profile) : [], [data])
  const stories = useMemo(() => buildStorySuggestions(data), [data])
  const gaps = useMemo(() => data.profile ? buildContentGaps(data, data.profile) : [], [data])
  const briefing = useMemo(() => data.profile ? buildDailyBriefing(activeGoals, weeklyPlan, gaps) : null, [activeGoals, data.profile, gaps, weeklyPlan])

  return (
    <div className="min-h-full bg-white pb-10">
      <header className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-9">
        <div className="mx-auto max-w-6xl">
          {briefing ? (
            <DailyBriefing greeting={greeting} focus={briefing.focus} tasks={briefing.tasks} estimatedMinutes={briefing.estimatedMinutes} />
          ) : (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Marketing</p>
              <h1 className="text-[34px] font-semibold leading-tight text-stone-950 sm:text-5xl">Getting today&apos;s plan ready.</h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-6 text-stone-500">
                Reviewing your posts, events, and Business Profile so the next step is clear.
              </p>
            </>
          )}
        </div>
      </header>

      <main className="px-5 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {!loaded || !data.profile ? (
            <LoadingDirector />
          ) : (
            <>
              <WeeklyPlanSection recommendations={weeklyPlan} />
              <ActiveGoalsCard activeGoals={activeGoals} profile={data.profile} />
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                  <StorySuggestionsSection suggestions={stories} />
                  <ContentGapsSection gaps={gaps} />
                </div>
                <QuickActions />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function DailyBriefing({ greeting, focus, tasks, estimatedMinutes }: { greeting: string; focus: string; tasks: DailyTask[]; estimatedMinutes: number }) {
  return (
    <section className="rounded-[22px] bg-[#fffaf4] p-5 ring-1 ring-ember-100 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Today&apos;s Marketing Plan</p>
      <h1 className="mt-2 text-[34px] font-semibold leading-tight text-stone-950 sm:text-5xl">{greeting}. Here&apos;s what to do today.</h1>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div>
          <p className="text-sm font-semibold text-stone-950">Today&apos;s focus: <span className="text-ember-700">{focus}</span></p>
          <p className="mt-4 text-sm font-semibold text-stone-950">If you only have 20 minutes today:</p>
          <ol className="mt-3 grid gap-2">
            {tasks.map((task, index) => (
              <li key={task.id} className="flex gap-3 text-sm leading-6 text-stone-700">
                <span className="font-semibold text-ember-700">{index + 1}.</span>
                <Link href={task.href} className="font-medium underline decoration-stone-300 underline-offset-4 hover:text-ember-700">
                  {task.label}
                </Link>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-ember-100">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Estimated marketing time</p>
          <p className="mt-2 text-3xl font-semibold text-stone-950">{estimatedMinutes} minutes</p>
          <p className="mt-2 text-sm leading-6 text-stone-500">Enough to move the week forward without overthinking it.</p>
        </div>
      </div>
    </section>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function LoadingDirector() {
  return (
    <section className="rounded-lg bg-stone-50 p-5 ring-1 ring-stone-100">
      <p className="text-sm font-semibold text-stone-950">Loading Marketing</p>
      <p className="mt-2 text-sm leading-6 text-stone-500">Reviewing your Business Profile, local events, draft posts, and approvals.</p>
    </section>
  )
}

function ActiveGoalsCard({ activeGoals, profile }: { activeGoals: BusinessGoal[]; profile: BusinessProfile }) {
  return (
    <section className="rounded-[16px] bg-stone-50 p-4 ring-1 ring-stone-100">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Why these posts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeGoals.length > 0 ? activeGoals.slice(0, 4).map((goal, index) => (
              <p key={goal.id} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                <span className="mr-1 text-ember-600">{index + 1}.</span>{goal.label}
              </p>
            )) : (
              <p className="text-sm text-stone-500">No active goals yet.</p>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-stone-500">
            {profile.businessDetails.businessName || 'This business'} is being guided by these active priorities from the Business Profile.
          </p>
        </div>
        <Link href="/settings" className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-stone-800 ring-1 ring-stone-200">
          Edit Goals
        </Link>
      </div>
    </section>
  )
}

function WeeklyPlanSection({ recommendations }: { recommendations: FeedRecommendation[] }) {
  const [hero, ...nextItems] = recommendations

  return (
    <section>
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Best Recommendation</p>
        <h2 className="mt-1 text-2xl font-semibold text-stone-950">Post this first.</h2>
      </div>

      {hero && <PostThisFirstCard item={hero} />}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-stone-950">After that</h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {nextItems.slice(0, 2).map((item, index) => (
            <NextRecommendationCard key={item.id} item={item} priority={index === 0 ? 'Next' : 'Later'} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PostThisFirstCard({ item }: { item: FeedRecommendation }) {
  return (
    <article className="overflow-hidden rounded-[22px] bg-stone-950 text-white shadow-[0_24px_70px_rgba(28,25,23,0.18)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
        <div className="relative min-h-[220px] bg-stone-900 lg:min-h-[360px]">
          {item.media ? (
            <LocalMedia media={item.media} className="h-full w-full object-cover" controls={item.media.type === 'video'} muted />
          ) : (
            <div className="flex h-full min-h-[260px] items-center justify-center px-6 text-center text-sm font-semibold text-stone-400">
              Content needed
            </div>
          )}
          <div className="absolute left-4 top-4 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-stone-950 shadow-sm">
            {item.day || 'Today'}
          </div>
        </div>

        <div className="flex flex-col p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-300">Post This First</p>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STATUS_STYLES[item.status]}`}>
              {getFriendlyStatus(item.status)}
            </span>
          </div>

          {item.eventName && <p className="mt-4 text-sm font-semibold text-stone-300">{item.eventName}</p>}
          <h3 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl">{item.title}</h3>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <AdvicePoint label="Recommended Format" value={item.format} />
            <AdvicePoint label="Recommended Day" value={item.day || 'Today'} />
            <AdvicePoint label="Featured Service" value={item.featuredService ?? 'Your strongest current offer'} />
            <AdvicePoint label="Reason for Recommendation" value={item.reason} />
          </div>

          {item.goalLabels.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Business Goals Supported</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.goalLabels.slice(0, 3).map((goal) => (
                  <span key={goal} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/10">
                    {goal}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="mt-5 text-sm leading-6 text-stone-200">{item.summary ?? `This gives you a clear ${item.format.toLowerCase()} to review and post without rebuilding the idea from scratch.`}</p>

          <Link href={item.action.href} className="mt-7 inline-flex min-h-[48px] w-full items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-stone-950 sm:w-auto">
            Review Post
          </Link>
        </div>
      </div>
    </article>
  )
}

function AdvicePoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-4 ring-1 ring-white/10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{label}</p>
      <p className="mt-2 text-sm leading-6 text-stone-100">{value}</p>
    </div>
  )
}

function NextRecommendationCard({ item, priority }: { item: FeedRecommendation; priority: 'Next' | 'Later' }) {
  return (
    <article className="grid gap-0 overflow-hidden rounded-[16px] bg-white ring-1 ring-stone-200 sm:grid-cols-[168px_minmax(0,1fr)]">
      <div className="relative h-40 bg-stone-100 sm:h-full">
        {item.media ? (
          <LocalMedia media={item.media} className="h-full w-full object-cover" controls={item.media.type === 'video'} muted />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs font-semibold text-stone-400">
            Content needed
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-stone-950 shadow-sm">
          {item.day}
        </div>
      </div>

      <div className="flex min-w-0 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ember-600">{priority}</p>
            <h4 className="text-lg font-semibold leading-snug text-stone-950">{item.title}</h4>
            {item.eventName && <p className="mt-1 text-sm text-stone-500">{item.eventName}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STATUS_STYLES[item.status]}`}>
            {getFriendlyStatus(item.status)}
          </span>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-500">{item.reason}</p>
        {item.goalLabels.length > 0 && (
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-ember-700">
            Supports {item.goalLabels.slice(0, 2).join(' + ')}
          </p>
        )}
        <Link href={item.action.href} className="mt-4 inline-flex min-h-[40px] items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white">
          {item.action.label}
        </Link>
      </div>
    </article>
  )
}

function StorySuggestionsSection({ suggestions }: { suggestions: StorySuggestion[] }) {
  return (
    <section className="rounded-[18px] bg-stone-50 p-4 ring-1 ring-stone-100 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Easy Story Ideas</p>
      <div className="mt-4 grid gap-3">
        {suggestions.map((suggestion) => (
          <Link key={suggestion.id} href={suggestion.href} className="rounded-lg bg-white p-4 ring-1 ring-stone-200 transition-colors hover:bg-stone-50">
            <h3 className="text-sm font-semibold text-stone-950">{suggestion.title}</h3>
            <p className="mt-1 text-sm leading-6 text-stone-500">{suggestion.detail}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

function ContentGapsSection({ gaps }: { gaps: ContentGap[] }) {
  return (
    <section className="rounded-[18px] bg-white p-4 ring-1 ring-stone-200 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">What to Strengthen Next</p>
      <div className="mt-4 grid gap-3">
        {gaps.map((gap) => (
          <article key={gap.id} className="flex flex-col gap-3 rounded-lg bg-stone-50 p-4 ring-1 ring-stone-100 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-950">{gap.title}</h3>
              <p className="mt-1 text-sm leading-6 text-stone-500">{gap.detail}</p>
            </div>
            <Link href={gap.action.href} className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-stone-800 ring-1 ring-stone-200">
              {gap.action.label}
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}

function QuickActions() {
  return (
    <section className="rounded-[18px] bg-white p-4 ring-1 ring-stone-200 sm:p-5 lg:self-start">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">Quick Actions</p>
      <div className="mt-4 grid gap-3">
        <QuickAction href="/events" title="Upload an Event" detail="Add fresh moments from a recent event." />
        <QuickAction href="/draft-posts" title="Review Drafts" detail="Give prepared posts a quick yes or edit." />
        <QuickAction href="/events" title="Look at Events" detail="See what each event can still become." />
        <QuickAction href="/content-bank" title="Browse Content" detail="Find a useful photo or clip fast." />
      </div>
    </section>
  )
}

function buildDailyBriefing(activeGoals: BusinessGoal[], recommendations: FeedRecommendation[], gaps: ContentGap[]) {
  const focus = activeGoals[0]?.label ?? recommendations[0]?.goalLabels[0] ?? 'getting one strong post out'
  const tasks: DailyTask[] = []
  const [hero, next] = recommendations

  if (hero) {
    tasks.push({
      id: `briefing-${hero.id}`,
      label: `${getActionVerb(hero)} ${hero.eventName ? `${hero.eventName} - ` : ''}${hero.title}`,
      href: hero.action.href,
      minutes: getTaskMinutes(hero),
    })
  }

  if (next) {
    tasks.push({
      id: `briefing-${next.id}`,
      label: `${getActionVerb(next)} ${next.eventName ? `${next.eventName} - ` : ''}${next.title}`,
      href: next.action.href,
      minutes: getTaskMinutes(next),
    })
  }

  const firstGap = gaps.find((gap) => !tasks.some((task) => task.href === gap.action.href))
  if (firstGap) {
    tasks.push({
      id: `briefing-gap-${firstGap.id}`,
      label: `${firstGap.action.label}: ${firstGap.title}`,
      href: firstGap.action.href,
      minutes: firstGap.action.href.includes('upload') ? 10 : 6,
    })
  }

  return {
    focus,
    tasks: tasks.slice(0, 3),
    estimatedMinutes: Math.max(6, tasks.slice(0, 3).reduce((total, task) => total + task.minutes, 0)),
  }
}

function getActionVerb(item: FeedRecommendation) {
  if (item.status === 'Ready') return 'Review and post'
  if (item.status === 'Needs Review') return 'Review'
  return item.action.label
}

function getTaskMinutes(item: FeedRecommendation) {
  if (item.status === 'Ready') return 6
  if (item.status === 'Needs Review') return 8
  return 10
}

function getFriendlyStatus(status: FeedStatus) {
  if (status === 'Ready') return 'Ready to Post'
  if (status === 'Needs Review') return 'Ready for Your Review'
  return 'Needs Content'
}

function QuickAction({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="rounded-lg bg-stone-50 p-4 ring-1 ring-stone-100 transition-colors hover:bg-stone-100">
      <span className="block text-sm font-semibold text-stone-950">{title}</span>
      <span className="mt-1 block text-sm leading-6 text-stone-500">{detail}</span>
    </Link>
  )
}

function buildWeeklyPlan(data: DirectorData, profile: BusinessProfile): FeedRecommendation[] {
  const usedIds = new Set<string>()
  const usedOpportunityIds = new Set<string>()
  const approvedPosts = buildPostRecommendations(data, profile, 'Approved')
  const draftPosts = buildPostRecommendations(data, profile, 'Draft')
  const readyOpportunities = buildReadyOpportunityRecommendations(data, profile)
  const opportunities = buildOpportunityRecommendations(data, profile)
  const recommendations: FeedRecommendation[] = []

  for (const bucket of [approvedPosts, draftPosts, readyOpportunities, opportunities]) {
    for (const item of bucket.sort((a, b) => b.score - a.score)) {
      if (recommendations.length === 3) break
      if (usedIds.has(item.id)) continue
      if (item.opportunityId && usedOpportunityIds.has(item.opportunityId)) continue
      if (recommendations.length > 0 && recommendations.every((current) => current.goalLabels[0] === item.goalLabels[0]) && item.goalLabels[0]) {
        item.score -= 8
      }
      usedIds.add(item.id)
      if (item.opportunityId) usedOpportunityIds.add(item.opportunityId)
      recommendations.push(item)
    }
  }

  while (recommendations.length < 3) {
    recommendations.push(buildPlaceholderRecommendation(profile, recommendations.length))
  }

  return recommendations
    .slice(0, 3)
    .map((item, index) => ({ ...item, day: POSTING_DAYS[index] }))
}

function buildPostRecommendations(data: DirectorData, profile: BusinessProfile, status: LocalPostDraftStatus): FeedRecommendation[] {
  const eventPosts = data.eventDrafts
    .filter((item) => item.status === status)
    .filter((item) => item.status !== 'Skipped')
    .filter((item) => !data.opportunities.some(({ opportunity }) => opportunity.generatedPostId === item.draft.id && opportunity.status === 'Dismissed'))
    .map((item) => {
      const text = getEventText(item.event, item.draft)
      const scoreResult = scoreProfileMatch(profile, text, item.event.createdAt, status)
      const format = inferFormat(item.draft, profile, scoreResult.preferredFormats)
      const linkedOpportunity = data.opportunities.find(({ opportunity }) => opportunity.generatedPostId === item.draft.id)?.opportunity

      return {
        id: `post-${item.draft.id}`,
        day: '',
        title: getDraftTitle(item.draft, item.event.name),
        eventName: item.event.name,
        purpose: inferPurpose(profile, text, scoreResult.preferredPurposes),
        format,
        status: status === 'Approved' ? 'Ready' as const : 'Needs Review' as const,
        reason: linkedOpportunity
          ? `This post is tied to "${linkedOpportunity.title}" and supports ${getGoalLabelText(linkedOpportunity, profile)}.`
          : getRecommendationReason(status, scoreResult.goalLabels, item.event.type),
        action: {
          label: status === 'Approved' ? 'Open Post' : 'Review Draft',
          href: status === 'Approved'
            ? `/events/${item.event.id}/review?postId=${encodeURIComponent(item.draft.id)}`
            : `/events/${item.event.id}/review?status=Needs%20Review&postId=${encodeURIComponent(item.draft.id)}`,
        },
        media: item.draft.media ?? getEventCoverMedia(item.event, [item.draft]),
        score: scoreResult.score + (status === 'Approved' ? 45 : 25) + (linkedOpportunity ? Math.round(linkedOpportunity.score * 0.35) : 0),
        goalLabels: linkedOpportunity ? getGoalLabels(linkedOpportunity, profile) : scoreResult.goalLabels,
        featuredService: findFeaturedService(profile, text),
        summary: linkedOpportunity?.summary ?? `This ${format.toLowerCase()} is already prepared from ${item.event.name}. It is the quickest way to put useful event content in front of people this week.`,
        opportunityId: linkedOpportunity?.id,
      }
    })

  const mediaPosts = data.mediaDrafts
    .filter((item) => item.status === status)
    .filter((item) => item.status !== 'Skipped')
    .map((item) => {
      const text = getMediaDraftText(item.draft)
      const scoreResult = scoreProfileMatch(profile, text, undefined, status)
      const format = inferFormat(item.draft, profile, scoreResult.preferredFormats)

      return {
        id: `post-${item.draft.id}`,
        day: '',
        title: getUsefulTitle(item.draft.sourceLabel) || getUsefulTitle(item.draft.context.contentTheme) || 'Content Bank post',
        purpose: inferPurpose(profile, text, scoreResult.preferredPurposes),
        format,
        status: status === 'Approved' ? 'Ready' as const : 'Needs Review' as const,
        reason: getRecommendationReason(status, scoreResult.goalLabels, item.draft.context.category),
        action: {
          label: status === 'Approved' ? 'Open Post' : 'Review Draft',
          href: `/draft-posts?status=${status === 'Approved' ? 'Approved' : 'Needs%20Review'}`,
        },
        media: item.draft.media,
        score: scoreResult.score + (status === 'Approved' ? 40 : 20),
        goalLabels: scoreResult.goalLabels,
        featuredService: findFeaturedService(profile, text),
        summary: `This ${format.toLowerCase()} is ready from the Content Bank and can keep your feed moving without needing a new event upload.`,
      }
    })

  return [...eventPosts, ...mediaPosts]
}

function buildReadyOpportunityRecommendations(data: DirectorData, profile: BusinessProfile): FeedRecommendation[] {
  return data.opportunities
    .filter(({ opportunity }) => opportunity.status === 'Ready' || opportunity.status === 'Suggested')
    .filter(({ opportunity }) => !opportunity.generatedPostId)
    .map(({ event, opportunity }) => {
      const media = getOpportunityMedia(event, opportunity)
      return {
        id: `ready-opportunity-${opportunity.id}`,
        day: '',
        title: opportunity.title,
        eventName: event.name,
        purpose: opportunity.contentPurposes[0] ?? 'Show the experience',
        format: normalizeOpportunityFormat(opportunity.recommendedFormat),
        status: 'Missing Content' as const,
        reason: `${opportunity.summary} This opportunity is ready to become a post and supports ${getGoalLabelText(opportunity, profile)}.`,
        action: {
          label: 'Build Content',
          href: `/content-studio?source=event&eventId=${event.id}&opportunityId=${encodeURIComponent(opportunity.id)}${opportunity.mediaIds.length > 0 ? `&mediaIds=${encodeURIComponent(opportunity.mediaIds.join(','))}` : ''}`,
        },
        media: media[0] ?? event.cover,
        score: opportunity.score + getOpportunityGoalBoost(opportunity, profile),
        goalLabels: getGoalLabels(opportunity, profile),
        featuredService: findFeaturedService(profile, `${opportunity.title} ${opportunity.summary} ${event.type} ${event.notes ?? ''}`),
        summary: opportunity.summary,
        opportunityId: opportunity.id,
      }
    })
}

function buildOpportunityRecommendations(data: DirectorData, profile: BusinessProfile): FeedRecommendation[] {
  const mediaOpportunities = data.mediaItems
    .filter((item) => !item.archived)
    .filter((item) => item.usedStatus === 'Unused')
    .slice(0, 10)
    .map((item) => {
      const text = getMediaItemText(item)
      const scoreResult = scoreProfileMatch(profile, text, item.createdAt, 'Draft')
      const format = item.mediaType === 'video' ? 'Reel' as const : inferContentBankFormat(item, scoreResult.preferredFormats)

      return {
        id: `media-opportunity-${item.id}`,
        day: '',
        title: getUsefulTitle(item.title) || getUsefulTitle(item.contentTheme) || `${item.category} idea`,
        purpose: inferPurpose(profile, text, scoreResult.preferredPurposes),
        format,
        status: 'Missing Content' as const,
        reason: getOpportunityReason(scoreResult.goalLabels),
        action: {
          label: 'Generate Post',
          href: `/content-studio?source=media&ids=${encodeURIComponent(item.id)}`,
        },
        media: createMockMediaForContentBankItem(item),
        score: scoreResult.score,
        goalLabels: scoreResult.goalLabels,
        featuredService: findFeaturedService(profile, text),
        summary: `This Content Bank item is a simple way to stay visible while you build up more event-specific posts.`,
      }
    })

  return mediaOpportunities
}

function normalizeOpportunityFormat(format: MarketingOpportunity['recommendedFormat']): ProfileFormat {
  if (format === 'Reel' || format === 'Carousel' || format === 'Photo') return format
  if (format === 'Story Set') return 'Carousel'
  if (format === 'Collaborative Post') return 'Carousel'
  return 'Photo'
}

function getGoalLabels(opportunity: MarketingOpportunity, profile: BusinessProfile) {
  return profile.goals.filter((goal) => opportunity.supportedGoalIds.includes(goal.id)).map((goal) => goal.label)
}

function getGoalLabelText(opportunity: MarketingOpportunity, profile: BusinessProfile) {
  const labels = getGoalLabels(opportunity, profile)
  return labels.length > 0 ? labels.slice(0, 2).join(' and ') : 'the active profile'
}

function getOpportunityGoalBoost(opportunity: MarketingOpportunity, profile: BusinessProfile) {
  const activeGoals = getActiveGoals(profile)
  const firstGoalId = activeGoals[0]?.id
  let boost = opportunity.supportedGoalIds.length > 1 ? 12 : 0
  if (firstGoalId && opportunity.supportedGoalIds.includes(firstGoalId)) boost += 18
  return boost
}

function buildPlaceholderRecommendation(profile: BusinessProfile, index: number): FeedRecommendation {
  const activeGoals = getActiveGoals(profile)
  const goal = activeGoals[index % Math.max(activeGoals.length, 1)]
  const rule = goal ? getGoalRule(goal) : undefined
  const format = rule?.preferredFormats[index % rule.preferredFormats.length] ?? 'Photo'
  const purpose = rule?.preferredPurposes[index % rule.preferredPurposes.length] ?? 'Drive inquiries'

  return {
    id: `placeholder-${goal?.id ?? 'business-profile'}-${index}`,
    day: '',
    title: goal ? `Add content for ${goal.label}` : 'Choose active goals',
    purpose,
    format,
    status: 'Missing Content',
    reason: goal
      ? `You are light on content for ${goal.label.toLowerCase()}. Add one recent moment so this goal has something strong behind it.`
      : 'Choose a few active goals so Marketing can give you sharper recommendations.',
    action: {
      label: goal ? 'Upload Event' : 'Edit Goals',
      href: goal ? '/events' : '/settings',
    },
    score: 0,
    goalLabels: goal ? [goal.label] : [],
    summary: goal ? `This is the best next step because ${goal.label.toLowerCase()} needs more usable content before it can become a strong post.` : 'A clear goal will make the weekly plan more useful.',
  }
}

function buildStorySuggestions(data: DirectorData): StorySuggestion[] {
  const suggestions: StorySuggestion[] = []
  const recentEvent = [...data.events].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0]
  const btsItem = data.mediaItems.find((item) => matchesAny(item.category, ['Behind the Scenes', 'Fireova Setup', 'Team']) || matchesText(item.contentTheme, ['setup', 'behind', 'team']))
  const ovenItem = data.mediaItems.find((item) => matchesAny(item.category, ['Oven & Fire', 'Cooking Process']) || matchesText(`${item.title} ${item.contentTheme}`, ['oven', 'fire']))
  const menuItem = data.mediaItems.find((item) => matchesAny(item.category, ['Small Bites', 'Charcuterie', 'Pizza']) || item.foodItems.length > 0)

  if (recentEvent) {
    suggestions.push({
      id: `story-event-${recentEvent.id}`,
      title: `Behind the scenes from ${recentEvent.name}`,
      detail: 'Use one quick setup, service, or guest-experience clip from a recent event.',
      href: `/events/${recentEvent.id}`,
    })
  }

  if (ovenItem) {
    suggestions.push({
      id: `story-oven-${ovenItem.id}`,
      title: 'Fire or oven clip',
      detail: 'A short visual moment can keep the brand present without needing a full feed post.',
      href: `/content-bank/${ovenItem.id}`,
    })
  }

  if (btsItem && suggestions.length < 3) {
    suggestions.push({
      id: `story-bts-${btsItem.id}`,
      title: 'Setup before service',
      detail: 'Show prep, team movement, or the catering setup before guests arrive.',
      href: `/content-bank/${btsItem.id}`,
    })
  }

  if (menuItem && suggestions.length < 3) {
    suggestions.push({
      id: `story-menu-${menuItem.id}`,
      title: 'Menu or service detail',
      detail: 'Use a close detail to make the week feel current and appetizing.',
      href: `/content-bank/${menuItem.id}`,
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'story-empty',
      title: 'Behind the scenes from the next event',
      detail: 'Upload an event or Content Bank item, then use a simple setup or service moment for Stories.',
      href: '/events',
    })
  }

  return suggestions.slice(0, 3)
}

function buildContentGaps(data: DirectorData, profile: BusinessProfile): ContentGap[] {
  const gaps: ContentGap[] = []
  const activeGoals = getActiveGoals(profile)
  const approvedCount = [...data.eventDrafts, ...data.mediaDrafts].filter((item) => item.status === 'Approved').length
  const draftCount = [...data.eventDrafts, ...data.mediaDrafts].filter((item) => item.status === 'Draft').length
  const activeServices = profile.services.filter((item) => item.isActive)
  const activeClients = profile.idealClients.filter((item) => item.isActive)
  const contentText = [
    ...data.events.flatMap((event) => [event.name, event.type, event.notes ?? '']),
    ...data.mediaItems.flatMap((item) => [item.title, item.category, item.contentTheme, item.tags.join(' ')]),
  ].join(' ')

  if (activeGoals.length === 0) {
    gaps.push({
      id: 'no-active-goals',
      title: 'Choose what matters most this week',
      detail: 'Pick a few active goals and the recommendations will get much sharper.',
      action: { label: 'Edit Goals', href: '/settings' },
    })
  }

  if (approvedCount === 0) {
    gaps.push({
      id: 'no-approved-posts',
      title: 'You do not have a post ready to schedule yet',
      detail: 'A quick draft review will give you something ready for the calendar.',
      action: { label: 'Review Drafts', href: '/draft-posts' },
    })
  }

  const missingClient = activeClients.find((client) => !matchesText(contentText, labelToSearchTerms(client.label)))
  if (missingClient) {
    gaps.push({
      id: `missing-client-${missingClient.id}`,
      title: `You are running low on ${missingClient.label.toLowerCase()} content`,
      detail: 'A recent example for this audience would make future recommendations stronger.',
      action: { label: 'Upload Event', href: '/events' },
    })
  }

  const missingService = activeServices.find((service) => !matchesText(contentText, labelToSearchTerms(service.label)))
  if (missingService) {
    gaps.push({
      id: `missing-service-${missingService.id}`,
      title: `You have not featured ${missingService.label} recently`,
      detail: 'Pull one strong photo or clip forward so this service stays visible.',
      action: { label: 'Open Content Bank', href: '/content-bank' },
    })
  }

  if (draftCount > 0) {
    gaps.push({
      id: 'drafts-need-review',
      title: 'A few drafts are waiting on you',
      detail: 'Give them a quick look so the best ones can move toward posting.',
      action: { label: 'Review Drafts', href: '/draft-posts' },
    })
  }

  if (gaps.length === 0) {
    gaps.push({
      id: 'no-gaps',
      title: 'You have good material to work with',
      detail: 'Your current library has enough usable content for the active profile.',
      action: { label: 'Open Content Bank', href: '/content-bank' },
    })
  }

  return dedupeGaps(gaps).slice(0, 4)
}

function scoreProfileMatch(profile: BusinessProfile, text: string, dateValue: string | undefined, status: LocalPostDraftStatus) {
  const normalizedText = text.toLowerCase()
  const activeGoals = getActiveGoals(profile)
  let score = 0
  const goalLabels: string[] = []
  const preferredFormats: ProfileFormat[] = []
  const preferredPurposes: string[] = []

  activeGoals.forEach((goal, index) => {
    const rule = getGoalRule(goal)
    const weight = Math.max(12, 42 - index * 8)
    let goalScore = 0

    rule.keywords.forEach((keyword) => {
      if (normalizedText.includes(keyword.toLowerCase())) goalScore += weight
    })

    if (goalScore > 0) {
      score += goalScore
      goalLabels.push(goal.label)
      preferredFormats.push(...rule.preferredFormats)
      preferredPurposes.push(...rule.preferredPurposes)
    }
  })

  const serviceScore = scoreListMatches(profile.services.filter((item) => item.isActive).map((item) => item.label), normalizedText, 8)
  const clientScore = scoreListMatches(profile.idealClients.filter((item) => item.isActive).map((item) => item.label), normalizedText, 10)
  score += serviceScore + clientScore

  if (goalLabels.length > 1) score += 18
  if (status === 'Approved') score += 18
  if (status === 'Draft') score += 8
  score += scoreRecency(dateValue)

  return {
    score,
    goalLabels,
    preferredFormats: uniqueValues(preferredFormats),
    preferredPurposes: uniqueValues(preferredPurposes),
  }
}

function scoreListMatches(labels: string[], text: string, value: number) {
  return labels.reduce((total, label) => {
    const matched = labelToSearchTerms(label).some((term) => text.includes(term.toLowerCase()))
    return matched ? total + value : total
  }, 0)
}

function scoreRecency(dateValue?: string) {
  if (!dateValue) return 0
  const timestamp = Date.parse(dateValue)
  if (Number.isNaN(timestamp)) return 0
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000)
  if (ageDays <= 30) return 10
  if (ageDays <= 90) return 5
  return 0
}

function inferFormat(draft: LocalGeneratedPostDraft | ContentBankDraft, profile: BusinessProfile, preferredFormats: ProfileFormat[]): ProfileFormat {
  const mediaItems = draft.mediaItems && draft.mediaItems.length > 0 ? draft.mediaItems : [draft.media]
  if (mediaItems.some((media) => media.type === 'video')) return 'Reel'
  if (mediaItems.length > 1) return 'Carousel'
  return preferredFormats[0] ?? getDefaultFormat(profile)
}

function inferOpportunityFormat(event: LocalFireovaEvent, preferredFormats: ProfileFormat[]): ProfileFormat {
  if (event.media.some((media) => media.type === 'video')) return 'Reel'
  if (event.media.length > 1 && preferredFormats.includes('Carousel')) return 'Carousel'
  return preferredFormats[0] ?? 'Photo'
}

function inferContentBankFormat(item: LocalContentBankItem, preferredFormats: ProfileFormat[]): ProfileFormat {
  if (item.mediaType === 'video') return 'Reel'
  if (preferredFormats.includes('Carousel')) return 'Carousel'
  return preferredFormats[0] ?? 'Photo'
}

function inferPurpose(profile: BusinessProfile, text: string, preferredPurposes: string[]) {
  const haystack = text.toLowerCase()
  if (haystack.includes('charcuterie') || haystack.includes('pizza') || haystack.includes('appetizer') || haystack.includes('salad')) return 'Make people hungry'
  if (haystack.includes('guest') || haystack.includes('interactive') || haystack.includes('wedding') || haystack.includes('party')) return 'Show the experience'
  if (haystack.includes('team') || haystack.includes('behind') || haystack.includes('service')) return 'Build trust'
  if (haystack.includes('vendor') || haystack.includes('venue') || haystack.includes('planner')) return 'Social proof'
  return preferredPurposes[0] ?? profile.brandPriorities.find((item) => item.isActive)?.label ?? 'Drive inquiries'
}

function getRecommendationReason(status: LocalPostDraftStatus, goalLabels: string[], sourceLabel: string) {
  const source = sourceLabel.toLowerCase()
  if (goalLabels.length > 0) {
    return status === 'Approved'
      ? `This ${source} post is the clearest ready-to-go match for ${goalLabels.slice(0, 2).join(' and ')}.`
      : `This ${source} draft is close and supports ${goalLabels.slice(0, 2).join(' and ')}. A quick review can turn it into this week's post.`
  }

  return status === 'Approved'
    ? 'This post is ready now and keeps the week moving while you gather more goal-specific content.'
    : 'This draft is close enough to be worth reviewing today.'
}

function getOpportunityReason(goalLabels: string[]) {
  if (goalLabels.length > 0) {
    return `You already have a useful moment for ${goalLabels.slice(0, 2).join(' and ')}. Turning it into a post is the next best move.`
  }

  return 'This is a simple post opportunity that can keep your feed active while stronger campaign content comes together.'
}

function findFeaturedService(profile: BusinessProfile, text: string) {
  const normalized = text.toLowerCase()
  return profile.services.find((service) =>
    service.isActive && labelToSearchTerms(service.label).some((term) => normalized.includes(term.toLowerCase()))
  )?.label
}

function getDefaultFormat(profile: BusinessProfile): ProfileFormat {
  const topGoal = getActiveGoals(profile)[0]
  return topGoal ? getGoalRule(topGoal).preferredFormats[0] ?? 'Photo' : 'Photo'
}

function getEventText(event: LocalFireovaEvent, draft?: LocalGeneratedPostDraft) {
  return [
    event.name,
    event.type,
    event.venueName,
    event.venueLocation,
    event.notes,
    draft?.tone,
    draft?.caption,
    draft?.hashtags.join(' '),
  ].filter(Boolean).join(' ')
}

function getMediaDraftText(draft: ContentBankDraft) {
  return [
    draft.sourceLabel,
    draft.angle,
    draft.caption,
    draft.context.category,
    draft.context.contentTheme,
    draft.context.foodItems.join(' '),
    draft.context.tags.join(' '),
    draft.context.notes,
  ].join(' ')
}

function getMediaItemText(item: LocalContentBankItem) {
  return [
    item.title,
    item.description,
    item.category,
    item.contentTheme,
    item.foodItems.join(' '),
    item.tags.join(' '),
    item.notes,
    item.sourceEventName,
  ].join(' ')
}

function getDraftTitle(draft: LocalGeneratedPostDraft, fallback: string) {
  return getUsefulTitle(draft.sourceLabel) || getUsefulTitle(draft.tone) || fallback || 'Generated post'
}

function getUsefulTitle(value?: string) {
  const title = value?.trim() ?? ''
  if (!title || title.toLowerCase() === 'untitled') return ''
  if (/^[a-f0-9]{6,}$/i.test(title)) return ''
  if (/^(img|image|video|dsc)[-_ ]?\d+/i.test(title)) return ''
  return title
}

function matchesAny(value: string, candidates: string[]) {
  return candidates.some((candidate) => value.toLowerCase() === candidate.toLowerCase())
}

function matchesText(value: string, candidates: string[]) {
  const text = value.toLowerCase()
  return candidates.some((candidate) => text.includes(candidate.toLowerCase()))
}

function labelToSearchTerms(label: string) {
  const normalized = label.toLowerCase()
  const singular = normalized.replace(/s\b/g, '')
  return uniqueValues([
    normalized,
    singular,
    ...normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 3),
  ])
}

function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values))
}

function dedupeGaps(gaps: ContentGap[]) {
  const seen = new Set<string>()
  return gaps.filter((gap) => {
    if (seen.has(gap.title)) return false
    seen.add(gap.title)
    return true
  })
}
