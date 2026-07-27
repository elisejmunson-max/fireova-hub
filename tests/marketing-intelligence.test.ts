import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import {
  createDefaultBusinessProfile,
  createStableId,
  type BusinessProfile,
} from '@/lib/local-fireova-business-profile'
import {
  deleteLocalEvent,
  writeLocalGeneratedPosts,
  writeLocalEvents,
  writeLocalPostStatuses,
  type LocalFireovaEvent,
  type LocalGeneratedPostDraft,
  type LocalPostDraftStatus,
} from '@/lib/local-fireova-events'
import {
  buildMarketingOpportunitiesForEvent,
  isGenericFallbackOpportunity,
  writeMarketingOpportunities,
  type MarketingOpportunity,
} from '@/lib/local-fireova-opportunities'
import {
  MARKETING_INTELLIGENCE_GENERATOR_VERSION,
  generateMarketingIntelligence,
  getOrGenerateMarketingIntelligence,
  readMarketingIntelligence,
  writeMarketingIntelligence,
  type MarketingIntelligence,
} from '@/lib/local-fireova-marketing-intelligence'
import type { LocalContentBankItem } from '@/lib/local-fireova-content-bank'
import type { MockMedia } from '@/lib/mock-fireova-content'

class MemoryStorage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

const storage = new MemoryStorage()

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: storage },
    configurable: true,
  })
})

test('wedding with interactive couple and pizza-cutting metadata produces wedding and interactive intelligence', () => {
  const event = eventFactory({
    id: 'interactive-wedding',
    type: 'Wedding',
    media: [
      mediaFactory('couple-pizza', 'Couple pizza cutting interactive catering moment', 'video'),
      mediaFactory('oven', 'Pizza entering the oven with fire detail'),
    ],
  })
  const report = generateMarketingIntelligence(event, inputFor(event, { profile: profileWithActiveGoals(['Book More Weddings', 'Promote Interactive Catering']) }))

  assert.equal(report.storyPotential, 'Exceptional')
  assert.ok(report.contentStrengths.includes('Interactive Catering'))
  assert.ok(report.contentStrengths.includes('Wedding Experience'))
  assert.ok(report.opportunities.some((opportunity) => opportunity.id.includes('pizza-cutting')))
  const pizzaCutting = report.opportunities.find((opportunity) => opportunity.id.includes('pizza-cutting'))
  assert.ok(pizzaCutting?.bestMediaIds?.includes('couple-pizza'))
  assert.ok(pizzaCutting?.suggestedCoverMediaId)
  assert.equal(pizzaCutting?.suggestedCaptionDirection, 'Celebrate the Couple')
  assert.ok((pizzaCutting?.mediaScores?.length ?? 0) > 0)
  assert.ok(pizzaCutting?.targetPlatforms?.includes('TikTok'))
})

test('distinct detected event details surface separate grounded content opportunities', () => {
  const event = eventFactory({
    id: 'styled-dinner',
    type: 'Wedding',
    media: [
      mediaFactory('tablescape', 'Floral tablescape and place setting detail'),
      mediaFactory('charcuterie', 'Charcuterie grazing board close-up'),
      mediaFactory('dessert', 'Wedding cake and dessert table'),
    ],
  })
  const opportunities = buildMarketingOpportunitiesForEvent(event, profileWithActiveGoals(['Build Brand Awareness']))

  assert.ok(opportunities.some((item) => item.id.includes('table-styling')))
  assert.ok(opportunities.some((item) => item.id.includes('charcuterie-feature')))
  assert.ok(opportunities.some((item) => item.id.includes('dessert-feature')))
  assert.ok(opportunities.every((item) => item.reasons.every((reason) => !reason.toLowerCase().includes('likely to perform'))))
})

test('a photographed couple creates a Couple Story without inventing pizza interaction', () => {
  const event = eventFactory({
    id: 'couple-portrait-wedding',
    type: 'Wedding',
    media: [mediaFactory('couple-portrait', 'Bride and groom couple portrait at the venue')],
  })
  const opportunities = buildMarketingOpportunitiesForEvent(event, profileWithActiveGoals(['Book More Weddings']))

  assert.ok(opportunities.some((item) => item.id.includes('couple-story')))
  assert.ok(!opportunities.some((item) => item.id.includes('interactive-couple-experience')))
  assert.ok(!opportunities.some((item) => item.title.toLowerCase().includes('pizza')))
})

test('wedding with generic food media does not invent guest reactions or emotional moments', () => {
  const event = eventFactory({
    id: 'generic-food-wedding',
    type: 'Wedding',
    media: [mediaFactory('food', 'Wood-fired pizza close-up on a table')],
  })
  const report = generateMarketingIntelligence(event, inputFor(event))

  assert.ok(report.contentStrengths.includes('Beautiful Food'))
  assert.ok(!report.contentStrengths.includes('Guest Experience'))
  assert.ok(!report.contentStrengths.includes('Vendor Opportunity'))
  assert.ok(!report.contentStrengths.includes('Interactive Catering'))
})

test('corporate lunch with buffet and service media produces corporate service intelligence', () => {
  const event = eventFactory({
    id: 'corporate-lunch',
    name: 'Corporate Lunch',
    type: 'Corporate',
    media: [
      mediaFactory('buffet', 'Corporate office lunch buffet service for employees'),
      mediaFactory('setup', 'Efficient setup with team serving guests'),
    ],
  })
  const report = generateMarketingIntelligence(event, inputFor(event, { profile: profileWithActiveGoals(['Book Corporate Catering']) }))

  assert.ok(report.contentStrengths.includes('Corporate Service'))
  assert.ok(report.businessGoalMatches.some((match) => match.label === 'Book Corporate Catering'))
  assert.ok(report.opportunities.some((opportunity) => opportunity.id.includes('corporate-service')))
})

test('drop-off grazing event matches drop-off and grazing services', () => {
  const event = eventFactory({
    id: 'drop-off-grazing',
    name: 'Private Drop-Off Grazing',
    type: 'Other',
    notes: 'Drop-off grazing table for a private party.',
    media: [mediaFactory('grazing', 'Grazing table with charcuterie and appetizers')],
  })
  const report = generateMarketingIntelligence(event, inputFor(event, { profile: profileWithActiveGoals(['Increase Drop-Off Catering']) }))
  const serviceLabels = report.serviceMatches.map((match) => match.label)

  assert.ok(serviceLabels.includes('Drop-Off Catering'))
  assert.ok(serviceLabels.includes('Grazing Tables'))
  assert.ok(report.contentStrengths.includes('Beautiful Food'))
})

test('product-only content remains product-focused without vendor or guest claims', () => {
  const event = eventFactory({
    id: 'product-only',
    name: 'Menu Detail',
    type: 'Other',
    media: [mediaFactory('pizza-detail', 'Pizza close-up menu detail with fresh toppings')],
  })
  const report = generateMarketingIntelligence(event, inputFor(event))

  assert.ok(report.contentStrengths.includes('Product Detail'))
  assert.ok(report.contentStrengths.includes('Beautiful Food'))
  assert.ok(!report.contentStrengths.includes('Vendor Opportunity'))
  assert.ok(!report.contentStrengths.includes('Guest Experience'))
})

test('vendor potential reflects whether event has vendor evidence', () => {
  const vendorEvent = eventFactory({
    id: 'vendor-event',
    venueName: 'The Hall',
    vendors: [{ id: 'planner', category: 'Planner', businessName: 'Kind Planner' }],
    media: [mediaFactory('venue', 'Venue collaboration with planner and photographer')],
  })
  const noVendorEvent = eventFactory({
    id: 'no-vendor-event',
    media: [mediaFactory('pizza', 'Pizza close-up')],
  })

  assert.equal(generateMarketingIntelligence(vendorEvent, inputFor(vendorEvent)).vendorPotential, 'Strong')
  assert.equal(generateMarketingIntelligence(noVendorEvent, inputFor(noVendorEvent)).vendorPotential, 'Limited')
})

test('event with no useful tags avoids unsupported specific strengths', () => {
  const event = eventFactory({
    id: 'no-useful-tags',
    name: 'Untagged Upload',
    type: 'Other',
    media: [mediaFactory('file-1', 'IMG 1001')],
  })
  const report = generateMarketingIntelligence(event, inputFor(event))

  assert.deepEqual(report.contentStrengths, [])
  assert.equal(report.overallMarketingScore, 'Moderate')
  assert.ok(report.opportunities.some((opportunity) => opportunity.opportunityType === 'General'))
})

test('one strong opportunity and several opportunities are represented without duplicate IDs', () => {
  const one = eventFactory({
    id: 'one-strong',
    type: 'Wedding',
    media: [mediaFactory('pizza-cutting', 'Pizza cutting couple moment')],
  })
  const several = eventFactory({
    id: 'several',
    type: 'Wedding',
    venueName: 'Venue',
    vendors: [{ id: 'photo', category: 'Photographer', businessName: 'Photo Co' }],
    media: [
      mediaFactory('pizza-cutting', 'Pizza cutting couple moment'),
      mediaFactory('guest', 'Guests gathered around the oven'),
      mediaFactory('fire', 'Behind the scenes fire and dough prep', 'video'),
    ],
  })
  const oneReport = generateMarketingIntelligence(one, inputFor(one))
  const severalReport = generateMarketingIntelligence(several, inputFor(several))

  assert.equal(new Set(oneReport.opportunities.map((item) => item.id)).size, oneReport.opportunities.length)
  assert.equal(new Set(severalReport.opportunities.map((item) => item.id)).size, severalReport.opportunities.length)
  assert.ok(oneReport.opportunities.length >= 1)
  assert.ok(severalReport.opportunities.length > oneReport.opportunities.length)
})

test('generic event recap is treated as fallback rather than a standout opportunity', () => {
  const event = eventFactory({ id: 'generic-recap-event', media: [mediaFactory('photo-1', 'Basic setup')] })
  const fallback = opportunityFactory(event, {
    id: `rule-general-event-recap-${event.id}`,
    title: 'Event Recap',
    summary: 'A broad event recap using the strongest available local media.',
    opportunityType: 'General',
  })

  assert.equal(isGenericFallbackOpportunity(fallback), true)
})

test('specific grounded opportunities are not treated as generic fallbacks', () => {
  const event = eventFactory({ id: 'specific-event', media: [mediaFactory('pizza-cutting', 'Pizza cutting')] })
  const specific = opportunityFactory(event, {
    id: `rule-pizza-cutting-${event.id}`,
    title: 'Pizza Cutting',
    summary: 'A process-driven opportunity that shows the craft behind the food.',
    opportunityType: 'Behind the Scenes',
  })

  assert.equal(isGenericFallbackOpportunity(specific), false)
})

test('dismissed and manual opportunities survive regeneration with user edits', () => {
  const event = eventFactory({
    id: 'preserve-work',
    type: 'Wedding',
    media: [mediaFactory('pizza-cutting', 'Pizza cutting couple moment')],
  })
  const now = '2026-07-15T00:00:00.000Z'
  writeMarketingOpportunities(event.id, [
    opportunityFactory(event, {
      id: `rule-pizza-cutting-${event.id}`,
      title: 'Edited Pizza Cutting Title',
      summary: 'Edited user summary.',
      status: 'Dismissed',
      source: 'Rule Based',
      createdAt: now,
      updatedAt: now,
    }),
    opportunityFactory(event, {
      id: `manual-opportunity-${event.id}-1`,
      title: 'Manual Venue Reel',
      summary: 'User-created venue angle.',
      source: 'User Created',
      status: 'Ready',
      createdAt: now,
      updatedAt: now,
    }),
  ])

  const opportunities = buildMarketingOpportunitiesForEvent(event, profileWithActiveGoals(['Book More Weddings']))
  const dismissed = opportunities.find((item) => item.id === `rule-pizza-cutting-${event.id}`)
  const manual = opportunities.find((item) => item.id === `manual-opportunity-${event.id}-1`)

  assert.equal(dismissed?.status, 'Dismissed')
  assert.equal(dismissed?.title, 'Edited Pizza Cutting Title')
  assert.equal(dismissed?.summary, 'Edited user summary.')
  assert.equal(manual?.source, 'User Created')
  assert.equal(manual?.title, 'Manual Venue Reel')
})

test('skipped generated posts are excluded while approved posts rank above drafts', () => {
  const event = eventFactory({
    id: 'post-statuses',
    type: 'Wedding',
    media: [
      mediaFactory('fire', 'Behind the scenes fire and dough prep', 'video'),
      mediaFactory('pizza-cutting', 'Pizza cutting couple moment', 'video'),
    ],
  })
  const generatedPosts = [
    draftFactory('skipped', 'Pizza Cutting', 'pizza cutting couple moment'),
    draftFactory('approved', 'Behind the Scenes', 'behind the scenes fire'),
  ]
  const statuses: Record<string, LocalPostDraftStatus> = { skipped: 'Skipped', approved: 'Approved' }
  const opportunities = buildMarketingOpportunitiesForEventWithPosts(event, generatedPosts, statuses)
  const skippedLinked = opportunities.find((item) => item.generatedPostId === 'skipped')
  const approvedLinked = opportunities.find((item) => item.generatedPostId === 'approved')
  const report = generateMarketingIntelligence(event, inputFor(event, { generatedPosts, postStatuses: statuses, opportunities }))

  assert.equal(skippedLinked, undefined)
  assert.equal(approvedLinked?.status, 'Converted to Post')
  assert.equal(report.recommendedPostingOrder[0]?.opportunityId, approvedLinked?.id)
})

test('higher-priority and multiple active goals affect goal matching and opportunity score', () => {
  const event = eventFactory({
    id: 'priority-goals',
    type: 'Wedding',
    media: [mediaFactory('interactive', 'Interactive couple pizza cutting wedding moment', 'video')],
  })
  const weddingOnly = profileWithActiveGoals(['Book More Weddings'])
  const multiGoal = profileWithActiveGoals(['Promote Interactive Catering', 'Book More Weddings'])
  const weddingReport = generateMarketingIntelligence(event, inputFor(event, { profile: weddingOnly }))
  const multiReport = generateMarketingIntelligence(event, inputFor(event, { profile: multiGoal }))

  assert.equal(multiReport.businessGoalMatches[0]?.label, 'Promote Interactive Catering')
  assert.ok(multiReport.businessGoalMatches.length > weddingReport.businessGoalMatches.length)
  assert.ok(Math.max(...multiReport.opportunities.map((item) => item.score)) > Math.max(...weddingReport.opportunities.map((item) => item.score)))
})

test('fingerprint reuses fresh reports and regenerates when source data or generator version changes', () => {
  const event = eventFactory({
    id: 'fingerprint',
    media: [mediaFactory('pizza', 'Pizza close-up')],
  })
  const profile = profileWithActiveGoals(['Book More Weddings'])
  const first = getOrGenerateMarketingIntelligence(event, { profile, generatedAt: '2026-07-15T01:00:00.000Z' })
  const second = getOrGenerateMarketingIntelligence(event, { profile, generatedAt: '2026-07-15T02:00:00.000Z' })
  const changed = getOrGenerateMarketingIntelligence({ ...event, notes: 'New source note' }, { profile, generatedAt: '2026-07-15T03:00:00.000Z' })
  writeMarketingIntelligence(event.id, { ...first, generatorVersion: '0.0.0' } as MarketingIntelligence)
  const versionChanged = getOrGenerateMarketingIntelligence(event, { profile, generatedAt: '2026-07-15T04:00:00.000Z' })

  assert.equal(second.generatedAt, first.generatedAt)
  assert.notEqual(changed.sourceFingerprint, first.sourceFingerprint)
  assert.equal(versionChanged.generatorVersion, MARKETING_INTELLIGENCE_GENERATOR_VERSION)
  assert.equal(versionChanged.generatedAt, '2026-07-15T04:00:00.000Z')
})

test('running generation twice does not create duplicates and deleting an event removes its report', () => {
  const event = eventFactory({
    id: 'delete-report',
    media: [mediaFactory('pizza', 'Pizza close-up')],
  })
  writeLocalEvents([event])
  const first = getOrGenerateMarketingIntelligence(event)
  const second = getOrGenerateMarketingIntelligence(event)

  assert.deepEqual(second.opportunities.map((item) => item.id), first.opportunities.map((item) => item.id))
  assert.ok(readMarketingIntelligence(event.id))
  deleteLocalEvent(event.id)
  assert.equal(readMarketingIntelligence(event.id), null)
})

test('existing events can backfill a report without re-uploading media', () => {
  const event = eventFactory({
    id: 'backfill',
    media: [mediaFactory('buffet', 'Buffet service media already in local event')],
  })
  writeLocalEvents([event])

  const report = getOrGenerateMarketingIntelligence(event)

  assert.equal(report.eventId, event.id)
  assert.ok(report.sourceFingerprint)
  assert.ok(readMarketingIntelligence(event.id))
})

function buildMarketingOpportunitiesForEventWithPosts(
  event: LocalFireovaEvent,
  generatedPosts: LocalGeneratedPostDraft[],
  statuses: Record<string, LocalPostDraftStatus>
) {
  writeLocalGeneratedPosts(event.id, generatedPosts)
  writeLocalPostStatuses(event.id, statuses)
  return buildMarketingOpportunitiesForEvent(event, profileWithActiveGoals(['Book More Weddings']))
}

function inputFor(
  event: LocalFireovaEvent,
  overrides: {
    profile?: BusinessProfile
    contentItems?: LocalContentBankItem[]
    generatedPosts?: LocalGeneratedPostDraft[]
    postStatuses?: Record<string, LocalPostDraftStatus>
    opportunities?: MarketingOpportunity[]
  } = {}
) {
  const profile = overrides.profile ?? profileWithActiveGoals(['Book More Weddings'])
  const contentItems = overrides.contentItems ?? []
  const generatedPosts = overrides.generatedPosts ?? []
  const postStatuses = overrides.postStatuses ?? {}
  const opportunities = overrides.opportunities ?? buildMarketingOpportunitiesForEvent(event, profile)

  return { profile, contentItems, generatedPosts, postStatuses, opportunities }
}

function profileWithActiveGoals(labels: string[]) {
  const profile = createDefaultBusinessProfile()
  return {
    ...profile,
    goals: profile.goals.map((goal) => {
      const index = labels.indexOf(goal.label)
      return {
        ...goal,
        isActive: index >= 0,
        priority: index >= 0 ? index : 999,
      }
    }),
    services: profile.services.map((service) => ({ ...service, isActive: true })),
    idealClients: profile.idealClients.map((client) => ({ ...client, isActive: true })),
  }
}

function eventFactory(overrides: Partial<LocalFireovaEvent> = {}): LocalFireovaEvent {
  const id = overrides.id ?? 'event'
  const media = overrides.media ?? [mediaFactory('media', 'Pizza close-up')]
  return {
    id,
    name: overrides.name ?? 'Wedding Event',
    type: overrides.type ?? 'Wedding',
    date: overrides.date ?? '2026-07-15',
    venueName: overrides.venueName,
    venueLocation: overrides.venueLocation,
    vendors: overrides.vendors,
    notes: overrides.notes,
    status: overrides.status ?? 'Needs Content',
    draftCount: overrides.draftCount ?? 0,
    cover: overrides.cover ?? media[0],
    media,
    createdAt: overrides.createdAt ?? '2026-07-15T00:00:00.000Z',
  }
}

function mediaFactory(id: string, alt: string, type: MockMedia['type'] = 'photo'): MockMedia {
  return {
    id,
    type,
    src: `/media/${id}.${type === 'video' ? 'mp4' : 'jpg'}`,
    posterSrc: type === 'video' ? `/media/${id}.jpg` : undefined,
    alt,
  }
}

function draftFactory(id: string, tone: string, caption: string): LocalGeneratedPostDraft {
  return {
    id,
    tone,
    caption,
    hashtags: ['#FireovaPizza'],
    media: mediaFactory(`${id}-media`, caption),
  }
}

function opportunityFactory(event: LocalFireovaEvent, overrides: Partial<MarketingOpportunity> = {}): MarketingOpportunity {
  const id = overrides.id ?? `manual-opportunity-${event.id}`
  return {
    id,
    eventId: event.id,
    title: overrides.title ?? 'Manual Opportunity',
    summary: overrides.summary ?? 'Manual opportunity summary.',
    opportunityType: overrides.opportunityType ?? 'General',
    recommendedFormat: overrides.recommendedFormat ?? 'Photo',
    supportedGoalIds: overrides.supportedGoalIds ?? [createStableId('goal', 'Book More Weddings')],
    supportedServiceIds: overrides.supportedServiceIds ?? [],
    supportedClientIds: overrides.supportedClientIds ?? [],
    contentPurposes: overrides.contentPurposes ?? ['Build the brand'],
    mediaIds: overrides.mediaIds ?? event.media.map((media) => media.id),
    score: overrides.score ?? 60,
    confidenceLabel: overrides.confidenceLabel ?? 'Medium',
    status: overrides.status ?? 'Ready',
    reasons: overrides.reasons ?? ['Created manually.'],
    missingShots: overrides.missingShots ?? [],
    source: overrides.source ?? 'User Created',
    generatedPostId: overrides.generatedPostId,
    createdAt: overrides.createdAt ?? '2026-07-15T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-07-15T00:00:00.000Z',
  }
}
