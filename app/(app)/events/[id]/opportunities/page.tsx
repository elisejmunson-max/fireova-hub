'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import LocalMedia from '@/components/local-media'
import { readBusinessProfile, type BusinessProfile } from '@/lib/local-fireova-business-profile'
import { readLocalEvents, type LocalFireovaEvent } from '@/lib/local-fireova-events'
import {
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPES,
  RECOMMENDED_FORMATS,
  createManualMarketingOpportunity,
  getOpportunityMedia,
  updateMarketingOpportunity,
  type MarketingOpportunity,
  type OpportunityStatus,
  type OpportunityType,
  type RecommendedFormat,
} from '@/lib/local-fireova-opportunities'
import {
  getVisibleSortedIntelligenceOpportunities,
  safelyGetOrGenerateMarketingIntelligence,
  type MarketingIntelligence,
} from '@/lib/local-fireova-marketing-intelligence'

const STATUS_STYLES: Record<OpportunityStatus, string> = {
  Suggested: 'bg-stone-100 text-stone-700 ring-stone-200',
  Ready: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  'Needs Review': 'bg-amber-50 text-amber-800 ring-amber-100',
  'Converted to Post': 'bg-sky-50 text-sky-800 ring-sky-100',
  Dismissed: 'bg-stone-100 text-stone-500 ring-stone-200',
}

export default function MarketingOpportunitiesPage({ params }: { params: { id: string } }) {
  const [event, setEvent] = useState<LocalFireovaEvent | null>(null)
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [marketingIntelligence, setMarketingIntelligence] = useState<MarketingIntelligence | null>(null)
  const [intelligenceError, setIntelligenceError] = useState('')
  const [opportunities, setOpportunities] = useState<MarketingOpportunity[]>([])
  const [showDismissed, setShowDismissed] = useState(false)
  const [editingOpportunity, setEditingOpportunity] = useState<MarketingOpportunity | 'new' | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const nextEvent = readLocalEvents().find((item) => item.id === params.id) ?? null
    const nextProfile = readBusinessProfile()
    const result = nextEvent ? safelyGetOrGenerateMarketingIntelligence(nextEvent, { profile: nextProfile }) : null
    setEvent(nextEvent)
    setProfile(nextProfile)
    setIntelligenceError(result && !result.ok ? result.error.message : '')
    setMarketingIntelligence(result?.report ?? null)
    setOpportunities(result?.report?.opportunities ?? [])
    setLoaded(true)
  }, [params.id])

  function refresh() {
    if (!event || !profile) return
    const result = safelyGetOrGenerateMarketingIntelligence(event, { profile, forceRegenerate: true })
    setIntelligenceError(result.ok ? '' : result.error.message)
    setMarketingIntelligence(result.report)
    setOpportunities(result.report?.opportunities ?? [])
  }

  function updateOpportunity(opportunityId: string, updates: Partial<MarketingOpportunity>) {
    if (!event) return
    updateMarketingOpportunity(event.id, opportunityId, updates)
    const result = safelyGetOrGenerateMarketingIntelligence(event, { profile: profile ?? readBusinessProfile(), forceRegenerate: true })
    setIntelligenceError(result.ok ? '' : result.error.message)
    setMarketingIntelligence(result.report)
    setOpportunities(result.report?.opportunities ?? [])
  }

  function saveManualOpportunity(input: ManualOpportunityInput, existingId?: string) {
    if (!event || !profile) return

    if (existingId) {
      updateMarketingOpportunity(event.id, existingId, {
        title: input.title,
        summary: input.summary,
        opportunityType: input.opportunityType,
        recommendedFormat: input.recommendedFormat,
        supportedGoalIds: input.supportedGoalIds,
        supportedServiceIds: input.supportedServiceIds,
        mediaIds: input.mediaIds,
        reasons: input.reasons,
        status: input.status,
      })
    } else {
      createManualMarketingOpportunity(event, {
        title: input.title,
        summary: input.summary,
        opportunityType: input.opportunityType,
        recommendedFormat: input.recommendedFormat,
        supportedGoalIds: input.supportedGoalIds,
        supportedServiceIds: input.supportedServiceIds,
        mediaIds: input.mediaIds,
        reasons: input.reasons,
        status: input.status,
      })
    }

    setEditingOpportunity(null)
    refresh()
  }

  const sortedOpportunities = useMemo(
    () => marketingIntelligence
      ? getVisibleSortedIntelligenceOpportunities(marketingIntelligence, showDismissed)
      : opportunities.filter((opportunity) => showDismissed || opportunity.status !== 'Dismissed'),
    [marketingIntelligence, opportunities, showDismissed]
  )
  const activeGoals = profile?.goals.filter((goal) => goal.isActive).sort((a, b) => a.priority - b.priority) ?? []
  const dismissedCount = opportunities.filter((opportunity) => opportunity.status === 'Dismissed').length

  if (loaded && !event) {
    return (
      <div className="min-h-full bg-white px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-[22px] bg-stone-50 p-8 text-center ring-1 ring-stone-100">
          <h1 className="text-2xl font-semibold text-stone-950">Event not found</h1>
          <Link href="/events" className="mt-5 inline-flex rounded-lg bg-stone-950 px-4 py-3 text-sm font-semibold text-white">Back to Events</Link>
        </div>
      </div>
    )
  }

  if (!event || !profile) return <div className="min-h-full bg-white" />

  return (
    <div className="min-h-full bg-white pb-12">
      <header className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-9">
        <div className="mx-auto max-w-6xl">
          <Link href={`/events/${event.id}`} className="text-sm font-semibold text-stone-500 hover:text-stone-950">Back to Event</Link>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">{event.name}</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[34px] font-semibold leading-tight text-stone-950 sm:text-5xl">Marketing Opportunities</h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-6 text-stone-500">
                The strongest ways this event could support your current marketing goals.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingOpportunity('new')}
              className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white"
            >
              Create Opportunity
            </button>
          </div>
        </div>
      </header>

      <main className="px-5 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-[18px] bg-stone-50 p-4 ring-1 ring-stone-100">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <SummaryItem label="Opportunities" value={String(opportunities.filter((item) => item.status !== 'Dismissed').length)} />
              <SummaryItem label="Report rating" value={marketingIntelligence?.overallMarketingScore ?? 'None yet'} />
              <SummaryItem label="Primary goal" value={activeGoals[0]?.label ?? 'No active goal'} />
              <SummaryItem label="Event type" value={event.type} />
            </div>
            {intelligenceError && (
              <div className="mt-4 flex flex-col gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100 sm:flex-row sm:items-center sm:justify-between">
                <span>Marketing Intelligence could not refresh. Existing event data is still available.</span>
                <button type="button" onClick={refresh} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-amber-950 ring-1 ring-amber-200">
                  Refresh Analysis
                </button>
              </div>
            )}
          </section>

          {process.env.NODE_ENV !== 'production' && marketingIntelligence && (
            <IntelligenceInspector report={marketingIntelligence} />
          )}

          {sortedOpportunities.length > 0 ? (
            <section className="grid gap-4">
              {sortedOpportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  event={event}
                  profile={profile}
                  opportunity={opportunity}
                  onDismiss={() => updateOpportunity(opportunity.id, { status: 'Dismissed' })}
                  onEdit={() => setEditingOpportunity(opportunity)}
                />
              ))}
            </section>
          ) : (
            <EmptyOpportunities event={event} onCreate={() => setEditingOpportunity('new')} />
          )}

          {dismissedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowDismissed((value) => !value)}
              className="text-sm font-semibold text-stone-500 underline underline-offset-4 hover:text-stone-950"
            >
              {showDismissed ? 'Hide dismissed' : `Show dismissed (${dismissedCount})`}
            </button>
          )}
        </div>
      </main>

      {editingOpportunity && (
        <OpportunityDialog
          event={event}
          profile={profile}
          opportunity={editingOpportunity === 'new' ? null : editingOpportunity}
          onCancel={() => setEditingOpportunity(null)}
          onSave={saveManualOpportunity}
        />
      )}
    </div>
  )
}

function OpportunityCard({
  event,
  profile,
  opportunity,
  onDismiss,
  onEdit,
}: {
  event: LocalFireovaEvent
  profile: BusinessProfile
  opportunity: MarketingOpportunity
  onDismiss: () => void
  onEdit: () => void
}) {
  const media = getOpportunityMedia(event, opportunity)
  const goals = profile.goals.filter((goal) => opportunity.supportedGoalIds.includes(goal.id))
  const buildHref = `/content-studio?source=event&eventId=${event.id}&opportunityId=${encodeURIComponent(opportunity.id)}${opportunity.mediaIds.length > 0 ? `&mediaIds=${encodeURIComponent(opportunity.mediaIds.join(','))}` : ''}`
  const primaryHref = opportunity.generatedPostId
    ? `/events/${event.id}/review?postId=${encodeURIComponent(opportunity.generatedPostId)}`
    : buildHref

  return (
    <article className="overflow-hidden rounded-[18px] bg-white ring-1 ring-stone-200">
      <div className="grid lg:grid-cols-[220px_1fr]">
        <div className="relative min-h-[180px] bg-stone-100">
          {media[0] ? (
            <LocalMedia media={media[0]} className="h-full min-h-[180px] w-full object-cover" controls={media[0].type === 'video'} muted />
          ) : (
            <div className="flex h-full min-h-[180px] items-center justify-center text-sm font-semibold text-stone-400">Review media</div>
          )}
          <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-sm font-semibold text-stone-950 shadow-sm">
            {opportunity.confidenceLabel} confidence
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-ember-50 px-2.5 py-1 text-[11px] font-semibold text-ember-800 ring-1 ring-ember-100">{opportunity.opportunityType}</span>
                <span className="rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200">{opportunity.recommendedFormat}</span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STATUS_STYLES[opportunity.status]}`}>{opportunity.status}</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold leading-tight text-stone-950">{opportunity.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">{opportunity.summary}</p>
            </div>
            <Link href={primaryHref} className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white">
              {opportunity.generatedPostId ? 'Open Post' : 'Build Content'}
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {goals.map((goal) => (
              <span key={goal.id} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">{goal.label}</span>
            ))}
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
              {opportunity.mediaIds.length} supporting media
            </span>
          </div>

          {opportunity.reasons.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {opportunity.reasons.slice(0, 4).map((reason) => (
                <li key={reason} className="rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-600 ring-1 ring-stone-100">{reason}</li>
              ))}
            </ul>
          )}

          {opportunity.missingShots.length > 0 && (
            <details className="mt-4 rounded-lg bg-white p-3 ring-1 ring-stone-200">
              <summary className="cursor-pointer text-sm font-semibold text-stone-950">Helpful shots for next time</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {opportunity.missingShots.map((shot) => (
                  <span key={shot} className="rounded-full bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-100">{shot}</span>
                ))}
              </div>
            </details>
          )}

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href={`/events/${event.id}`} className="font-semibold text-stone-500 underline underline-offset-4 hover:text-stone-950">Review Media</Link>
            <button type="button" onClick={onEdit} className="font-semibold text-stone-500 underline underline-offset-4 hover:text-stone-950">Edit Opportunity</button>
            {opportunity.status !== 'Dismissed' && (
              <button type="button" onClick={onDismiss} className="font-semibold text-stone-500 underline underline-offset-4 hover:text-red-600">Dismiss</button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

type ManualOpportunityInput = {
  title: string
  summary: string
  opportunityType: OpportunityType
  recommendedFormat: RecommendedFormat
  supportedGoalIds: string[]
  supportedServiceIds: string[]
  mediaIds: string[]
  reasons: string[]
  status: OpportunityStatus
}

function OpportunityDialog({
  event,
  profile,
  opportunity,
  onCancel,
  onSave,
}: {
  event: LocalFireovaEvent
  profile: BusinessProfile
  opportunity: MarketingOpportunity | null
  onCancel: () => void
  onSave: (input: ManualOpportunityInput, existingId?: string) => void
}) {
  const [title, setTitle] = useState(opportunity?.title ?? '')
  const [summary, setSummary] = useState(opportunity?.summary ?? '')
  const [opportunityType, setOpportunityType] = useState<OpportunityType>(opportunity?.opportunityType ?? 'General')
  const [recommendedFormat, setRecommendedFormat] = useState<RecommendedFormat>(opportunity?.recommendedFormat ?? 'Flexible')
  const [status, setStatus] = useState<OpportunityStatus>(opportunity?.status ?? 'Ready')
  const [supportedGoalIds, setSupportedGoalIds] = useState<string[]>(opportunity?.supportedGoalIds ?? [])
  const [supportedServiceIds, setSupportedServiceIds] = useState<string[]>(opportunity?.supportedServiceIds ?? [])
  const [mediaIds, setMediaIds] = useState<string[]>(opportunity?.mediaIds ?? [])
  const [reasonsText, setReasonsText] = useState((opportunity?.reasons ?? []).join('\n'))

  function submit() {
    if (!title.trim() || !summary.trim()) return
    onSave({
      title: title.trim(),
      summary: summary.trim(),
      opportunityType,
      recommendedFormat,
      supportedGoalIds,
      supportedServiceIds,
      mediaIds,
      reasons: reasonsText.split('\n').map((reason) => reason.trim()).filter(Boolean),
      status,
    }, opportunity?.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[22px] bg-white p-5 shadow-[0_24px_90px_rgba(28,25,23,0.28)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">{event.name}</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{opportunity ? 'Edit Opportunity' : 'Create Opportunity'}</h2>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-700">Close</button>
        </div>

        <div className="mt-6 grid gap-4">
          <TextField label="Title" value={title} onChange={setTitle} />
          <label>
            <span className="mb-2 block text-sm font-semibold text-stone-700">Summary</span>
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-ember-400" />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField label="Type" value={opportunityType} values={OPPORTUNITY_TYPES} onChange={(value) => setOpportunityType(value as OpportunityType)} />
            <SelectField label="Format" value={recommendedFormat} values={RECOMMENDED_FORMATS} onChange={(value) => setRecommendedFormat(value as RecommendedFormat)} />
            <SelectField label="Status" value={status} values={OPPORTUNITY_STATUSES} onChange={(value) => setStatus(value as OpportunityStatus)} />
          </div>

          <CheckboxGroup title="Supported goals" values={profile.goals.filter((goal) => goal.isActive).map((goal) => ({ id: goal.id, label: goal.label }))} selected={supportedGoalIds} onChange={setSupportedGoalIds} />
          <CheckboxGroup title="Supported services" values={profile.services.filter((service) => service.isActive).map((service) => ({ id: service.id, label: service.label }))} selected={supportedServiceIds} onChange={setSupportedServiceIds} />
          <CheckboxGroup title="Supporting media" values={event.media.map((media) => ({ id: media.id, label: media.alt || media.id }))} selected={mediaIds} onChange={setMediaIds} />

          <label>
            <span className="mb-2 block text-sm font-semibold text-stone-700">Reasons</span>
            <textarea value={reasonsText} onChange={(event) => setReasonsText(event.target.value)} rows={4} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-ember-400" placeholder="One reason per line" />
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">Cancel</button>
          <button type="button" onClick={submit} className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white">Save Opportunity</button>
        </div>
      </div>
    </div>
  )
}

function EmptyOpportunities({ event, onCreate }: { event: LocalFireovaEvent; onCreate: () => void }) {
  return (
    <section className="rounded-[22px] bg-stone-50 p-6 ring-1 ring-stone-100 sm:p-8">
      <h2 className="text-2xl font-semibold text-stone-950">No strong opportunities found yet</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
        This event may still contain useful content. Add tags, choose favorites, or review the media to help Marketing understand it.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link href={`/events/${event.id}`} className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white">Review Media</Link>
        <Link href={`/events/${event.id}`} className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-stone-800 ring-1 ring-stone-200">Edit Event Details</Link>
        <button type="button" onClick={onCreate} className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-stone-800 ring-1 ring-stone-200">Create Opportunity Manually</button>
      </div>
    </section>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <p><span className="font-semibold text-stone-950">{value}</span> <span className="text-stone-500">{label}</span></p>
  )
}

function IntelligenceInspector({ report }: { report: MarketingIntelligence }) {
  const inspectable = {
    version: report.version,
    generatorVersion: report.generatorVersion,
    sourceFingerprint: report.sourceFingerprint,
    generatedAt: report.generatedAt,
    overallMarketingScore: report.overallMarketingScore,
    goalMatches: report.businessGoalMatches,
    strengths: report.contentStrengths,
    gaps: report.missingContent,
    potentials: {
      story: report.storyPotential,
      evergreen: report.evergreenPotential,
      vendor: report.vendorPotential,
      socialGrowth: report.socialGrowthPotential,
      booking: report.bookingPotential,
    },
    opportunities: report.opportunities.map((opportunity) => ({
      id: opportunity.id,
      source: opportunity.source,
      status: opportunity.status,
      generatedPostId: opportunity.generatedPostId,
    })),
  }

  return (
    <details className="rounded-[18px] bg-stone-950 p-4 text-white ring-1 ring-stone-800">
      <summary className="cursor-pointer text-sm font-semibold">View intelligence report</summary>
      <pre className="mt-4 max-h-[440px] overflow-auto rounded-lg bg-black/40 p-4 text-xs leading-5 text-stone-200">
        {JSON.stringify(inspectable, null, 2)}
      </pre>
    </details>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold text-stone-700">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[42px] w-full rounded-lg border border-stone-200 px-3 text-sm outline-none focus:border-ember-400" />
    </label>
  )
}

function SelectField({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold text-stone-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[42px] w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-ember-400">
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}

function CheckboxGroup({
  title,
  values,
  selected,
  onChange,
}: {
  title: string
  values: Array<{ id: string; label: string }>
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-stone-700">{title}</legend>
      <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-lg bg-stone-50 p-3 ring-1 ring-stone-100">
        {values.map((item) => {
          const checked = selected.includes(item.id)
          return (
            <label key={item.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ring-1 ${checked ? 'bg-stone-950 text-white ring-stone-950' : 'bg-white text-stone-700 ring-stone-200'}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
                className="h-4 w-4 accent-ember-600"
              />
              {item.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
