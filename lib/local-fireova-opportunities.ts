import {
  getActiveGoals,
  getGoalRule,
  readBusinessProfile,
  type BusinessProfile,
  type ProfileFormat,
} from '@/lib/local-fireova-business-profile'
import {
  readAllLocalGeneratedPosts,
  readLocalPostStatuses,
  type LocalFireovaEvent,
  type LocalGeneratedPostDraft,
  type LocalPostDraftStatus,
} from '@/lib/local-fireova-events'
import {
  readAllContentBankItems,
  type LocalContentBankItem,
} from '@/lib/local-fireova-content-bank'
import type { MockMedia } from '@/lib/mock-fireova-content'
import { getMediaScoreReasons, scoreEventMedia, type ScoredEventMedia } from '@/lib/local-fireova-media-scoring'

export type OpportunityType =
  | 'Story'
  | 'Experience'
  | 'Product'
  | 'Behind the Scenes'
  | 'Education'
  | 'Social Proof'
  | 'Team'
  | 'Vendor Collaboration'
  | 'Brand'
  | 'Hiring'
  | 'General'

export type RecommendedFormat =
  | 'Reel'
  | 'Carousel'
  | 'Photo'
  | 'Story Set'
  | 'Collaborative Post'
  | 'Flexible'

export type ContentPurpose =
  | 'Drive inquiries'
  | 'Build trust'
  | 'Show the experience'
  | 'Make people hungry'
  | 'Show craftsmanship'
  | 'Build the brand'
  | 'Social proof'
  | 'Grow audience'
  | 'Hiring'

export type ConfidenceLabel = 'High' | 'Medium' | 'Low'
export type OpportunityStatus = 'Suggested' | 'Ready' | 'Needs Review' | 'Converted to Post' | 'Dismissed'
export type OpportunitySource = 'Rule Based' | 'User Created' | 'Future AI'

export type MarketingOpportunity = {
  id: string
  eventId: string
  title: string
  summary: string
  opportunityType: OpportunityType
  recommendedFormat: RecommendedFormat
  supportedGoalIds: string[]
  supportedServiceIds: string[]
  supportedClientIds: string[]
  contentPurposes: ContentPurpose[]
  mediaIds: string[]
  bestMediaIds?: string[]
  suggestedCoverMediaId?: string
  suggestedCaptionDirection?: string
  mediaScores?: ScoredEventMedia[]
  targetPlatforms?: Array<'Instagram' | 'Facebook' | 'LinkedIn' | 'TikTok'>
  score: number
  confidenceLabel: ConfidenceLabel
  status: OpportunityStatus
  reasons: string[]
  missingShots: string[]
  source: OpportunitySource
  generatedPostId?: string
  createdAt: string
  updatedAt: string
}

type OpportunityRule = {
  id: string
  title: string
  type: OpportunityType
  format: RecommendedFormat
  purposes: ContentPurpose[]
  signals: string[]
  eventSignals?: string[]
  requiresVendor?: boolean
  requiresCorporate?: boolean
  requiresWedding?: boolean
  missingShots: string[]
  summary: string
}

export const LOCAL_MARKETING_OPPORTUNITIES_KEY = 'fireova-marketing-hub-marketing-opportunities-v1'

export const OPPORTUNITY_TYPES: OpportunityType[] = [
  'Story',
  'Experience',
  'Product',
  'Behind the Scenes',
  'Education',
  'Social Proof',
  'Team',
  'Vendor Collaboration',
  'Brand',
  'Hiring',
  'General',
]

export const RECOMMENDED_FORMATS: RecommendedFormat[] = ['Reel', 'Carousel', 'Photo', 'Story Set', 'Collaborative Post', 'Flexible']
export const OPPORTUNITY_STATUSES: OpportunityStatus[] = ['Suggested', 'Ready', 'Needs Review', 'Converted to Post', 'Dismissed']

const OPPORTUNITY_RULES: OpportunityRule[] = [
  {
    id: 'interactive-couple-experience',
    title: 'Couple Creates Their First Pizza Together',
    type: 'Experience',
    format: 'Reel',
    purposes: ['Drive inquiries', 'Show the experience', 'Grow audience'],
    signals: ['couple', 'bride', 'groom', 'newlywed', 'pizza cutting', 'making pizza', 'interactive catering', 'interactive'],
    requiresWedding: true,
    missingShots: ['Guest reactions', 'Couple looking at each other', 'Pizza entering the oven', 'First bite', 'Wide venue shot'],
    summary: 'An interactive couple moment that can show what the Fireova experience feels like at a wedding.',
  },
  {
    id: 'couple-story',
    title: 'Couple Story',
    type: 'Story',
    format: 'Carousel',
    purposes: ['Build trust', 'Show the experience', 'Social proof'],
    signals: ['couple', 'bride', 'groom', 'newlywed', 'couple moment'],
    requiresWedding: true,
    missingShots: ['Couple portrait', 'Candid interaction', 'Wide celebration context'],
    summary: 'A couple-centered story using the strongest photographed emotional moments from the event.',
  },
  {
    id: 'pizza-cutting',
    title: 'Wedding Pizza Cutting',
    type: 'Experience',
    format: 'Reel',
    purposes: ['Drive inquiries', 'Show the experience', 'Social proof'],
    signals: ['pizza cutting', 'cutting pizza', 'first pizza', 'couple cutting'],
    missingShots: ['Guest reactions', 'Close-up of the cut', 'Couple with the pizza', 'Wide reception context'],
    summary: 'A recognizable wedding moment that connects the food to the celebration.',
  },
  {
    id: 'guest-experience',
    title: 'Guest Experience',
    type: 'Experience',
    format: 'Story Set',
    purposes: ['Show the experience', 'Social proof', 'Build trust'],
    signals: ['guests', 'guest', 'buffet line', 'crowd', 'serving', 'eating', 'gathering', 'reactions', 'guest experience'],
    missingShots: ['Guests being served', 'People gathered around the oven', 'First bite', 'Wide service moment'],
    summary: 'A guest-centered opportunity that shows the event energy and service experience.',
  },
  {
    id: 'behind-the-fire',
    title: 'Behind the Fire',
    type: 'Behind the Scenes',
    format: 'Reel',
    purposes: ['Build the brand', 'Show craftsmanship', 'Grow audience'],
    signals: ['oven', 'fire', 'dough stretching', 'pizza launch', 'prep', 'cooking', 'team working', 'behind the scenes', 'process'],
    missingShots: ['Pizza entering the oven', 'Fire detail', 'Hands preparing dough', 'Team working together'],
    summary: 'A process-driven opportunity that shows the craft behind the food.',
  },
  {
    id: 'product-feature',
    title: 'Wood-Fired Pizza Close-Up',
    type: 'Product',
    format: 'Carousel',
    purposes: ['Make people hungry', 'Show craftsmanship', 'Drive inquiries'],
    signals: ['food', 'pizza', 'charcuterie', 'grazing', 'salad', 'appetizer', 'crostini', 'close-up', 'margherita', 'menu'],
    missingShots: ['Finished dish close-up', 'Ingredient detail', 'Hands serving', 'Wider table setup'],
    summary: 'A product-focused opportunity that makes the menu easy to understand and want.',
  },
  {
    id: 'corporate-service',
    title: 'Corporate Lunch Service',
    type: 'Social Proof',
    format: 'Photo',
    purposes: ['Drive inquiries', 'Build trust', 'Show the experience'],
    signals: ['corporate', 'office lunch', 'buffet', 'employees', 'delivery', 'efficient setup', 'large guest count', 'office'],
    requiresCorporate: true,
    missingShots: ['Employees being served', 'Wide office setup', 'Branded delivery', 'Team serving guests'],
    summary: 'A corporate service opportunity that can demonstrate reliability and efficient catering.',
  },
  {
    id: 'vendor-collaboration',
    title: 'Vendor Collaboration Opportunity',
    type: 'Vendor Collaboration',
    format: 'Collaborative Post',
    purposes: ['Build trust', 'Social proof', 'Build the brand'],
    signals: ['venue', 'planner', 'photographer', 'florist', 'vendor', 'collaboration'],
    requiresVendor: true,
    missingShots: ['Venue wide shot', 'Vendor detail', 'Team setup with venue context', 'Tagged vendor moment'],
    summary: 'A collaboration opportunity grounded in linked vendor data from the event.',
  },
  {
    id: 'team-content',
    title: 'Fireova Team at Work',
    type: 'Team',
    format: 'Reel',
    purposes: ['Build trust', 'Build the brand', 'Hiring'],
    signals: ['team', 'staff', 'setup', 'prep', 'service', 'loading', 'cleanup', 'team action'],
    missingShots: ['Team setting up', 'Hands preparing food', 'Service in motion', 'Team wrap-up'],
    summary: 'A team-focused opportunity that shows the work and people behind the event.',
  },
  {
    id: 'venue-details',
    title: 'Venue Details',
    type: 'Brand',
    format: 'Carousel',
    purposes: ['Build the brand', 'Build trust'],
    signals: ['venue detail', 'venue', 'architecture', 'room', 'reception space', 'ceremony space'],
    missingShots: ['Venue exterior', 'Wide room view', 'Distinctive architectural detail'],
    summary: 'A venue-led story grounded in the event setting and its strongest photographed details.',
  },
  {
    id: 'table-styling',
    title: 'Table Styling and Event Details',
    type: 'Brand',
    format: 'Carousel',
    purposes: ['Build the brand', 'Show the experience'],
    signals: ['table styling', 'table detail', 'tablescape', 'place setting', 'floral', 'decor', 'centerpiece'],
    missingShots: ['Wide tablescape', 'Place setting close-up', 'Floral detail'],
    summary: 'A detail-driven carousel using photographed tablescape, decor, and place-setting evidence.',
  },
  {
    id: 'charcuterie-feature',
    title: 'Charcuterie Feature',
    type: 'Product',
    format: 'Carousel',
    purposes: ['Make people hungry', 'Show craftsmanship', 'Drive inquiries'],
    signals: ['charcuterie', 'grazing table', 'grazing board', 'cheese board'],
    missingShots: ['Full board', 'Ingredient close-up', 'Guests serving themselves'],
    summary: 'A product story supported by detected charcuterie or grazing-table media.',
  },
  {
    id: 'dessert-feature',
    title: 'Dessert Moment',
    type: 'Product',
    format: 'Photo',
    purposes: ['Make people hungry', 'Build the brand'],
    signals: ['dessert', 'cake', 'cookies', 'sweet', 'gelato'],
    missingShots: ['Dessert close-up', 'Serving moment', 'Full dessert display'],
    summary: 'A focused dessert story supported by detected sweets or dessert-table media.',
  },
  {
    id: 'signature-cocktails',
    title: 'Signature Cocktails',
    type: 'Product',
    format: 'Photo',
    purposes: ['Show the experience', 'Build the brand'],
    signals: ['signature cocktail', 'cocktail', 'drinks', 'bar detail', 'beverage'],
    missingShots: ['Finished cocktail close-up', 'Bartender action', 'Drink menu detail'],
    summary: 'A beverage-led opportunity grounded in photographed cocktails or bar details.',
  },
  {
    id: 'family-moments',
    title: 'Family Moments',
    type: 'Story',
    format: 'Carousel',
    purposes: ['Build trust', 'Social proof', 'Show the experience'],
    signals: ['family', 'parents', 'children', 'kids', 'grandparents', 'family moment'],
    missingShots: ['Family reaction', 'Wide family group', 'Candid interaction'],
    summary: 'An emotional story supported by detected family interactions from the event.',
  },
  {
    id: 'social-proof',
    title: 'Client Reaction or Testimonial',
    type: 'Social Proof',
    format: 'Photo',
    purposes: ['Build trust', 'Social proof', 'Drive inquiries'],
    signals: ['review', 'testimonial', 'client quote', 'quote', 'loved', 'thank you'],
    missingShots: ['Screenshot or written testimonial', 'Client-approved quote', 'Guest reaction detail'],
    summary: 'A trust-building opportunity using actual testimonial or positive-note evidence.',
  },
]

export function readAllMarketingOpportunities(): Record<string, MarketingOpportunity[]> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(LOCAL_MARKETING_OPPORTUNITIES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, MarketingOpportunity[]>>((acc, [eventId, value]) => {
      if (Array.isArray(value)) {
        const opportunities = value.filter(isMarketingOpportunity).map(normalizeOpportunity)
        if (opportunities.length > 0) acc[eventId] = opportunities
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

export function readMarketingOpportunities(eventId: string) {
  return readAllMarketingOpportunities()[eventId] ?? []
}

export function writeMarketingOpportunities(eventId: string, opportunities: MarketingOpportunity[]) {
  if (typeof window === 'undefined') return

  const all = readAllMarketingOpportunities()
  all[eventId] = opportunities.map(normalizeOpportunity)
  window.localStorage.setItem(LOCAL_MARKETING_OPPORTUNITIES_KEY, JSON.stringify(all))
}

export function updateMarketingOpportunity(eventId: string, opportunityId: string, updates: Partial<MarketingOpportunity>) {
  const next = readMarketingOpportunities(eventId).map((opportunity) =>
    opportunity.id === opportunityId
      ? normalizeOpportunity({ ...opportunity, ...updates, updatedAt: new Date().toISOString() })
      : opportunity
  )
  writeMarketingOpportunities(eventId, next)
  return next.find((opportunity) => opportunity.id === opportunityId) ?? null
}

export function createManualMarketingOpportunity(event: LocalFireovaEvent, input: Partial<MarketingOpportunity>) {
  const now = new Date().toISOString()
  const opportunity = normalizeOpportunity({
    id: `manual-opportunity-${event.id}-${Date.now()}`,
    eventId: event.id,
    title: input.title?.trim() || 'Manual Opportunity',
    summary: input.summary?.trim() || 'A user-created marketing opportunity for this event.',
    opportunityType: input.opportunityType ?? 'General',
    recommendedFormat: input.recommendedFormat ?? 'Flexible',
    supportedGoalIds: input.supportedGoalIds ?? [],
    supportedServiceIds: input.supportedServiceIds ?? [],
    supportedClientIds: input.supportedClientIds ?? [],
    contentPurposes: input.contentPurposes ?? ['Build the brand'],
    mediaIds: input.mediaIds ?? [],
    score: input.score ?? 60,
    confidenceLabel: input.confidenceLabel ?? 'Medium',
    status: input.status ?? 'Ready',
    reasons: input.reasons?.filter(Boolean) ?? ['Created manually for this event.'],
    missingShots: input.missingShots?.filter(Boolean) ?? [],
    source: 'User Created',
    generatedPostId: input.generatedPostId,
    createdAt: now,
    updatedAt: now,
  })
  const next = [opportunity, ...readMarketingOpportunities(event.id)]
  writeMarketingOpportunities(event.id, next)
  return opportunity
}

export function buildMarketingOpportunitiesForEvent(event: LocalFireovaEvent, profile = readBusinessProfile()) {
  const existing = readMarketingOpportunities(event.id)
  const generatedPosts = readAllLocalGeneratedPosts()[event.id] ?? []
  const statuses = readLocalPostStatuses(event.id)
  const contentItems = readAllContentBankItems().filter((item) => item.sourceEventId === event.id || event.media.some((media) => media.id === item.mediaId))
  const generated = buildRuleBasedOpportunities({ event, profile, contentItems, generatedPosts, statuses })
  return mergeOpportunities(existing, generated)
}

export function generateMarketingOpportunitiesForEvent(event: LocalFireovaEvent, profile = readBusinessProfile()) {
  const merged = buildMarketingOpportunitiesForEvent(event, profile)
  writeMarketingOpportunities(event.id, merged)
  return merged
}

export function getVisibleSortedOpportunities(opportunities: MarketingOpportunity[], showDismissed = false) {
  return [...opportunities]
    .filter((opportunity) => showDismissed || opportunity.status !== 'Dismissed')
    .sort((a, b) => {
      if (a.status === 'Dismissed' && b.status !== 'Dismissed') return 1
      if (a.status !== 'Dismissed' && b.status === 'Dismissed') return -1
      if (a.score !== b.score) return b.score - a.score
      if (getStatusRank(a.status) !== getStatusRank(b.status)) return getStatusRank(a.status) - getStatusRank(b.status)
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
}

export function isGenericFallbackOpportunity(opportunity: Pick<MarketingOpportunity, 'id' | 'title' | 'summary' | 'opportunityType'>) {
  const normalizedTitle = normalizeOpportunityText(opportunity.title)
  const normalizedSummary = normalizeOpportunityText(opportunity.summary)

  if (opportunity.id.includes('general-event-recap')) return true
  if (normalizedTitle === 'event recap') return true
  if (normalizedTitle.endsWith(' event recap') && normalizedSummary.includes('broad event recap')) return true
  if (normalizedSummary.includes('broad event recap')) return true
  if (normalizedSummary.includes('general event content')) return true
  if (normalizedSummary.includes('strongest available local media')) return true
  if (normalizedSummary.includes('overall event summary')) return true

  return opportunity.opportunityType === 'General' &&
    normalizedTitle.includes('recap') &&
    normalizedSummary.includes('strongest available')
}

export function getOpportunityMedia(event: LocalFireovaEvent, opportunity: Pick<MarketingOpportunity, 'mediaIds'>): MockMedia[] {
  const mediaIds = new Set(opportunity.mediaIds)
  return event.media.filter((media) => mediaIds.has(media.id))
}

export function findOpportunityForGeneratedPost(eventId: string, draftId: string) {
  return readMarketingOpportunities(eventId).find((opportunity) => opportunity.generatedPostId === draftId) ?? null
}

function buildRuleBasedOpportunities({
  event,
  profile,
  contentItems,
  generatedPosts,
  statuses,
}: {
  event: LocalFireovaEvent
  profile: BusinessProfile
  contentItems: LocalContentBankItem[]
  generatedPosts: LocalGeneratedPostDraft[]
  statuses: Record<string, LocalPostDraftStatus>
}) {
  const eventText = buildEventText(event, contentItems)
  const mediaScores = scoreEventMedia(event.media, contentItems)
  const opportunities = OPPORTUNITY_RULES.flatMap((rule) => {
    if (rule.requiresWedding && !matchesAny(eventText, ['wedding', 'bridal', 'rehearsal'])) return []
    if (rule.requiresCorporate && !matchesAny(eventText, ['corporate', 'office', 'lunch', 'promotion'])) return []
    if (rule.requiresVendor && !hasUsableVendor(event)) return []
    if (rule.id === 'interactive-couple-experience' && !matchesAny(eventText, ['pizza cutting', 'making pizza', 'interactive catering', 'interactive'])) return []

    const matchedSignals = rule.signals.filter((signal) => eventText.includes(signal.toLowerCase()))
    const eventSignalMatches = rule.eventSignals?.filter((signal) => eventText.includes(signal.toLowerCase())) ?? []
    const matchCount = matchedSignals.length + eventSignalMatches.length
    if (matchCount === 0) return []
    if (rule.id !== 'vendor-collaboration' && matchCount < 1) return []

    const media = findSupportingMedia(event, contentItems, rule.signals, mediaScores)
    if (media.length === 0 && rule.id !== 'vendor-collaboration') return []

    const linkedPost = findLikelyGeneratedPost(generatedPosts, statuses, rule)
    const score = scoreOpportunity({ event, profile, rule, media, contentItems, linkedPost, matchCount })
    const goalIds = getSupportedGoalIds(profile, [...rule.signals, rule.title, rule.summary].join(' '))
    const serviceIds = getSupportedItemIds(profile.services, eventText)
    const clientIds = getSupportedItemIds(profile.idealClients, eventText)
    const now = new Date().toISOString()
    const status: OpportunityStatus = linkedPost
      ? linkedPost.status === 'Approved' || linkedPost.status === 'Scheduled' || linkedPost.status === 'Published' ? 'Converted to Post' : 'Needs Review'
      : media.length > 0 ? 'Ready' : 'Suggested'

    return [normalizeOpportunity({
      id: `rule-${rule.id}-${event.id}`,
      eventId: event.id,
      title: getRuleTitle(rule, contentItems, event),
      summary: rule.summary,
      opportunityType: rule.type,
      recommendedFormat: rule.format,
      supportedGoalIds: goalIds,
      supportedServiceIds: serviceIds,
      supportedClientIds: clientIds,
      contentPurposes: rule.purposes,
      mediaIds: media.map((item) => item.id).slice(0, 8),
      bestMediaIds: media.map((item) => item.id).slice(0, rule.format === 'Carousel' ? 8 : 3),
      suggestedCoverMediaId: chooseSuggestedCover(media, mediaScores)?.id,
      suggestedCaptionDirection: getSuggestedCaptionDirection(rule),
      mediaScores: mediaScores.filter((item) => media.some((mediaItem) => mediaItem.id === item.mediaId)),
      targetPlatforms: getTargetPlatforms(rule.format),
      score,
      confidenceLabel: getConfidence(score),
      status,
      reasons: buildReasons({ rule, profile, goalIds, serviceIds, clientIds, media, linkedPost, event, mediaScores }),
      missingShots: rule.missingShots,
      source: 'Rule Based',
      generatedPostId: linkedPost?.draft.id,
      createdAt: now,
      updatedAt: now,
    })]
  })

  if (opportunities.length === 0 && event.media.length > 0) {
    return [buildGeneralRecapOpportunity(event, profile)]
  }

  return opportunities
}

function buildGeneralRecapOpportunity(event: LocalFireovaEvent, profile: BusinessProfile): MarketingOpportunity {
  const now = new Date().toISOString()
  const mediaScores = scoreEventMedia(event.media, [])
  const rankedMedia = event.media.filter((media) => !mediaScores.find((score) => score.mediaId === media.id)?.duplicateOf)
    .sort((a, b) => (mediaScores.find((score) => score.mediaId === b.id)?.score ?? 0) - (mediaScores.find((score) => score.mediaId === a.id)?.score ?? 0))
  const strongestMedia = rankedMedia[0] ?? event.media[0]
  const isVideo = strongestMedia?.type === 'video'
  const score = clampScore(45 + Math.min(20, event.media.length * 3) + (isVideo ? 8 : 0))
  const eventName = getUsefulEventName(event.name)
  return normalizeOpportunity({
    id: `rule-general-media-highlight-${event.id}`,
    eventId: event.id,
    title: eventName ? `${eventName} Media Highlight` : isVideo ? 'Video Highlight' : 'Photo Highlight',
    summary: isVideo
      ? 'A focused Reel built from the strongest available video.'
      : 'A focused feed post built from the strongest available photo.',
    opportunityType: 'General',
    recommendedFormat: isVideo ? 'Reel' : 'Photo',
    supportedGoalIds: getActiveGoals(profile).slice(0, 1).map((goal) => goal.id),
    supportedServiceIds: [],
    supportedClientIds: [],
    contentPurposes: ['Build the brand', 'Show the experience'],
    mediaIds: strongestMedia ? [strongestMedia.id] : [],
    bestMediaIds: strongestMedia ? [strongestMedia.id] : [],
    suggestedCoverMediaId: chooseSuggestedCover(rankedMedia, mediaScores)?.id,
    suggestedCaptionDirection: 'Event Highlight',
    mediaScores,
    targetPlatforms: getTargetPlatforms(isVideo ? 'Reel' : 'Photo'),
    score,
    confidenceLabel: getConfidence(score),
    status: 'Ready',
    reasons: ['This event has usable local media.', isVideo ? 'The strongest selected media is a video.' : 'The strongest selected media is a photo.'],
    missingShots: ['Wide event setup', 'Service moment', 'Food close-up'],
    source: 'Rule Based',
    createdAt: now,
    updatedAt: now,
  })
}

function getUsefulEventName(value: string) {
  const name = value.trim()
  if (!name) return ''
  if (/^(untitled|new|imported)(\s+event)?\b/i.test(name)) return ''
  return name
}

function normalizeOpportunityText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function mergeOpportunities(existing: MarketingOpportunity[], generated: MarketingOpportunity[]) {
  const byId = new Map(existing.map((opportunity) => [opportunity.id, opportunity]))
  const merged = generated.map((opportunity) => {
    const current = byId.get(opportunity.id)
    if (!current) return opportunity
    byId.delete(opportunity.id)
    return normalizeOpportunity({
      ...opportunity,
      status: current.status === 'Dismissed' || current.status === 'Converted to Post' ? current.status : opportunity.status,
      title: current.title || opportunity.title,
      summary: current.summary || opportunity.summary,
      reasons: current.source === 'User Created' ? current.reasons : opportunity.reasons,
      missingShots: current.source === 'User Created' ? current.missingShots : opportunity.missingShots,
      generatedPostId: current.generatedPostId ?? opportunity.generatedPostId,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      source: current.source === 'User Created' ? current.source : opportunity.source,
    })
  })

  return [...merged, ...Array.from(byId.values())]
}

function scoreOpportunity({
  event,
  profile,
  rule,
  media,
  contentItems,
  linkedPost,
  matchCount,
}: {
  event: LocalFireovaEvent
  profile: BusinessProfile
  rule: OpportunityRule
  media: MockMedia[]
  contentItems: LocalContentBankItem[]
  linkedPost?: { draft: LocalGeneratedPostDraft; status: LocalPostDraftStatus }
  matchCount: number
}) {
  const text = [buildEventText(event, contentItems), rule.title, rule.summary, rule.signals.join(' ')].join(' ')
  const activeGoals = getActiveGoals(profile)
  let score = 24 + Math.min(18, matchCount * 4)
  let goalMatches = 0

  activeGoals.forEach((goal, index) => {
    const ruleForGoal = getGoalRule(goal)
    const matches = ruleForGoal.keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()))
    if (matches) {
      goalMatches += 1
      score += index === 0 ? 24 : 12
    }
  })

  score += Math.min(18, media.length * 4)
  if (rule.format === 'Reel' && media.some((item) => item.type === 'video')) score += 10
  if (rule.format === 'Carousel' && media.length > 1) score += 8
  if (contentItems.some((item) => item.favorite)) score += 6
  if (linkedPost) score += linkedPost.status === 'Approved' ? 14 : 8
  if (goalMatches > 1) score += 8
  score += scoreRecency(event.date || event.createdAt)

  return clampScore(score)
}

function buildReasons({
  rule,
  profile,
  goalIds,
  serviceIds,
  clientIds,
  media,
  linkedPost,
  event,
  mediaScores,
}: {
  rule: OpportunityRule
  profile: BusinessProfile
  goalIds: string[]
  serviceIds: string[]
  clientIds: string[]
  media: MockMedia[]
  linkedPost?: { draft: LocalGeneratedPostDraft; status: LocalPostDraftStatus }
  event: LocalFireovaEvent
  mediaScores: ScoredEventMedia[]
}) {
  const goals = profile.goals.filter((goal) => goalIds.includes(goal.id)).map((goal) => goal.label)
  const services = profile.services.filter((service) => serviceIds.includes(service.id)).map((service) => service.label)
  const clients = profile.idealClients.filter((client) => clientIds.includes(client.id)).map((client) => client.label)
  const reasons = [
    goals[0] ? `Supports the active goal "${goals[0]}."` : '',
    services[0] ? `Demonstrates the service "${services[0]}."` : '',
    clients[0] ? `Matches the ideal client type "${clients[0]}."` : '',
    media.some((item) => item.type === 'video') ? 'Includes video media for a Reel option.' : media.length > 1 ? 'Includes multiple supporting media items.' : '',
    linkedPost ? `Has a generated post with ${linkedPost.status.toLowerCase()} status.` : '',
    rule.requiresVendor && hasUsableVendor(event) ? 'Includes linked vendor data for collaboration.' : '',
    ...getMediaScoreReasons(mediaScores, media.map((item) => item.id), 2),
  ].filter(Boolean)

  return reasons.slice(0, 4)
}

function findSupportingMedia(event: LocalFireovaEvent, contentItems: LocalContentBankItem[], signals: string[], scores: ScoredEventMedia[]) {
  const scoreById = new Map(scores.map((score) => [score.mediaId, score]))
  const matches = event.media.filter((media) => {
    const item = contentItems.find((contentItem) => contentItem.mediaId === media.id)
    const text = [
      media.alt,
      media.type,
      item?.title,
      item?.description,
      item?.category,
      item?.contentTheme,
      item?.foodItems.join(' '),
      item?.tags.join(' '),
      item?.notes,
    ].filter(Boolean).join(' ').toLowerCase()
    return signals.some((signal) => text.includes(signal.toLowerCase()))
  })

  const ranked = (matches.length > 0 ? matches : event.media)
    .filter((media) => !scoreById.get(media.id)?.duplicateOf)
    .sort((a, b) => (scoreById.get(b.id)?.score ?? 0) - (scoreById.get(a.id)?.score ?? 0))
  return ranked.slice(0, matches.length > 0 || signals.some((signal) => ['pizza', 'food', 'oven', 'fire'].includes(signal)) ? 8 : 3)
}

function chooseSuggestedCover(media: MockMedia[], scores: ScoredEventMedia[]) {
  const scoreById = new Map(scores.map((score) => [score.mediaId, score.score]))
  return [...media]
    .sort((a, b) => {
      const photoBias = Number(b.type === 'photo') * 5 - Number(a.type === 'photo') * 5
      return photoBias + (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0)
    })[0]
}

function getSuggestedCaptionDirection(rule: OpportunityRule) {
  const directions: Record<string, string> = {
    'interactive-couple-experience': 'Celebrate the Couple',
    'couple-story': 'Celebrate the Couple',
    'pizza-cutting': 'Celebrate the Couple',
    'guest-experience': 'Guest Experience',
    'behind-the-fire': 'Fire Oven Experience',
    'product-feature': 'Highlight the Food',
    'corporate-service': 'Event Recap',
    'vendor-collaboration': 'Vendor Feature',
    'team-content': 'Team Behind the Scenes',
    'social-proof': 'Guest Experience',
  }
  return directions[rule.id] ?? rule.title
}

function getTargetPlatforms(format: RecommendedFormat): MarketingOpportunity['targetPlatforms'] {
  if (format === 'Reel') return ['Instagram', 'Facebook', 'TikTok']
  if (format === 'Collaborative Post') return ['Instagram', 'Facebook', 'LinkedIn']
  if (format === 'Story Set') return ['Instagram', 'Facebook']
  return ['Instagram', 'Facebook', 'LinkedIn']
}

function findLikelyGeneratedPost(drafts: LocalGeneratedPostDraft[], statuses: Record<string, LocalPostDraftStatus>, rule: OpportunityRule) {
  const draft = drafts.find((item) => {
    if (statuses[item.id] === 'Skipped') return false
    const text = [item.tone, item.caption, item.hashtags.join(' '), item.sourceLabel].join(' ').toLowerCase()
    return rule.signals.some((signal) => text.includes(signal.toLowerCase())) || text.includes(rule.type.toLowerCase())
  })
  return draft ? { draft, status: statuses[draft.id] ?? 'Draft' } : undefined
}

function getSupportedGoalIds(profile: BusinessProfile, text: string) {
  const normalizedText = text.toLowerCase()
  return getActiveGoals(profile)
    .filter((goal) => getGoalRule(goal).keywords.some((keyword) => normalizedText.includes(keyword.toLowerCase())))
    .map((goal) => goal.id)
}

function getSupportedItemIds(items: Array<{ id: string; label: string; isActive: boolean }>, text: string) {
  const normalizedText = text.toLowerCase()
  return items
    .filter((item) => item.isActive)
    .filter((item) => labelToSearchTerms(item.label).some((term) => normalizedText.includes(term)))
    .map((item) => item.id)
}

function buildEventText(event: LocalFireovaEvent, contentItems: LocalContentBankItem[]) {
  return [
    event.name,
    event.type,
    event.venueName,
    event.venueLocation,
    event.notes,
    ...event.media.map((media) => media.alt),
    ...contentItems.flatMap((item) => [item.title, item.description, item.category, item.contentTheme, item.foodItems.join(' '), item.tags.join(' '), item.notes]),
  ].filter(Boolean).join(' ').toLowerCase()
}

function getRuleTitle(rule: OpportunityRule, contentItems: LocalContentBankItem[], event: LocalFireovaEvent) {
  if (rule.id !== 'product-feature') return rule.title
  const productItem = contentItems.find((item) => ['Pizza', 'Charcuterie', 'Small Bites', 'Salads'].includes(item.category) || item.foodItems.length > 0)
  return productItem?.foodItems[0] || productItem?.contentTheme || productItem?.category || (event.type.includes('Corporate') ? 'Catering Detail' : rule.title)
}

function hasUsableVendor(event: LocalFireovaEvent) {
  return Boolean(event.venueName?.trim() || event.vendors?.some((vendor) => vendor.businessName || vendor.instagramHandle))
}

function matchesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term.toLowerCase()))
}

function labelToSearchTerms(label: string) {
  const normalized = label.toLowerCase()
  return Array.from(new Set([
    normalized,
    normalized.replace(/s\b/g, ''),
    ...normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 3),
  ]))
}

function scoreRecency(value?: string) {
  if (!value) return 0
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return 0
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000)
  if (ageDays <= 30) return 8
  if (ageDays <= 90) return 4
  return 0
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function getConfidence(score: number): ConfidenceLabel {
  if (score >= 80) return 'High'
  if (score >= 60) return 'Medium'
  return 'Low'
}

function getStatusRank(status: OpportunityStatus) {
  switch (status) {
    case 'Ready':
    case 'Converted to Post':
      return 0
    case 'Needs Review':
      return 1
    case 'Suggested':
      return 2
    case 'Dismissed':
      return 3
  }
}

function normalizeOpportunity(opportunity: MarketingOpportunity): MarketingOpportunity {
  return {
    ...opportunity,
    title: opportunity.title.trim(),
    summary: opportunity.summary.trim(),
    supportedGoalIds: Array.from(new Set(opportunity.supportedGoalIds)),
    supportedServiceIds: Array.from(new Set(opportunity.supportedServiceIds)),
    supportedClientIds: Array.from(new Set(opportunity.supportedClientIds)),
    mediaIds: Array.from(new Set(opportunity.mediaIds)),
    bestMediaIds: Array.from(new Set(opportunity.bestMediaIds ?? opportunity.mediaIds)),
    targetPlatforms: Array.from(new Set(opportunity.targetPlatforms ?? ['Instagram'])),
    score: clampScore(opportunity.score),
    confidenceLabel: getConfidence(opportunity.score),
    reasons: opportunity.reasons.map((reason) => reason.trim()).filter(Boolean).slice(0, 4),
    missingShots: opportunity.missingShots.map((shot) => shot.trim()).filter(Boolean),
  }
}

function isMarketingOpportunity(value: unknown): value is MarketingOpportunity {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<MarketingOpportunity>
  return (
    typeof item.id === 'string' &&
    typeof item.eventId === 'string' &&
    typeof item.title === 'string' &&
    typeof item.summary === 'string' &&
    typeof item.score === 'number' &&
    Array.isArray(item.mediaIds) &&
    Array.isArray(item.reasons)
  )
}
