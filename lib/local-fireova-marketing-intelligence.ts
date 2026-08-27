import {
  getActiveGoals,
  getGoalRule,
  readBusinessProfile,
  type BusinessGoal,
  type BusinessProfile,
  type ProfileListItem,
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
import {
  buildMarketingOpportunitiesForEvent,
  type MarketingOpportunity,
  type RecommendedFormat,
} from '@/lib/local-fireova-opportunities'
import {
  getApprovedMediaAnalysisEvidence,
  readMediaAnalysesForEvent,
  type MediaAnalysis,
} from '@/lib/local-fireova-media-analysis'
import type { MockMedia } from '@/lib/mock-fireova-content'

export type MarketingIntelligenceVersion = 1
export type MarketingQualityRating = 'Exceptional' | 'Strong' | 'Moderate' | 'Limited' | 'Weak'
export type MarketingPotentialRating = Exclude<MarketingQualityRating, 'Weak'>

export type MarketingIntelligenceMatch = {
  id: string
  label: string
  rating: MarketingQualityRating
  reasons: string[]
}

export type MarketingContentStrength =
  | 'Interactive Catering'
  | 'Wedding Experience'
  | 'Beautiful Food'
  | 'Strong Branding'
  | 'Guest Experience'
  | 'Behind The Scenes'
  | 'Vendor Opportunity'
  | 'Product Detail'
  | 'Team Presence'
  | 'Corporate Service'

export type MarketingContentGap =
  | 'Missing Guest Reactions'
  | 'Missing Team Photos'
  | 'Missing Venue Wide Shot'
  | 'Missing Corporate Content'
  | 'Missing Testimonials'
  | 'Missing Product Detail'
  | 'Missing Service Moment'

export type MarketingPostingRecommendation = {
  order: number
  title: string
  opportunityId?: string
  recommendedFormat: RecommendedFormat
  reason: string
  mediaIds: string[]
}

export type MarketingIntelligenceNote = {
  source: 'Rule Based' | 'Manual' | 'Future AI'
  message: string
}

export type MarketingIntelligenceSourceSnapshot = {
  mediaCount: number
  videoCount: number
  tagCount: number
  contentThemeCount: number
  generatedPostCount: number
  opportunityCount: number
}

export type MarketingIntelligenceExtensionPoint =
  | 'Vision AI'
  | 'Video Analysis'
  | 'Caption Analysis'
  | 'Engagement Analysis'
  | 'Posting History'
  | 'Calendar'
  | 'Seasonality'

export type MarketingIntelligence = {
  id: string
  eventId: string
  generatedAt: string
  version: MarketingIntelligenceVersion
  generatorVersion: string
  sourceFingerprint: string
  overallMarketingScore: MarketingQualityRating
  businessGoalMatches: MarketingIntelligenceMatch[]
  serviceMatches: MarketingIntelligenceMatch[]
  idealClientMatches: MarketingIntelligenceMatch[]
  contentStrengths: MarketingContentStrength[]
  contentWeaknesses: MarketingContentGap[]
  opportunities: MarketingOpportunity[]
  missingContent: MarketingContentGap[]
  recommendedFormats: RecommendedFormat[]
  recommendedPostingOrder: MarketingPostingRecommendation[]
  storyPotential: MarketingPotentialRating
  evergreenPotential: MarketingPotentialRating
  vendorPotential: MarketingPotentialRating
  socialGrowthPotential: MarketingPotentialRating
  bookingPotential: MarketingPotentialRating
  notes: MarketingIntelligenceNote[]
  sourceSnapshot: MarketingIntelligenceSourceSnapshot
  extensionPoints: MarketingIntelligenceExtensionPoint[]
}

export type GenerateMarketingIntelligenceInput = {
  profile?: BusinessProfile
  contentItems?: LocalContentBankItem[]
  generatedPosts?: LocalGeneratedPostDraft[]
  postStatuses?: Record<string, LocalPostDraftStatus>
  opportunities?: MarketingOpportunity[]
  mediaAnalyses?: MediaAnalysis[]
  generatedAt?: string
  sourceFingerprint?: string
}

export const LOCAL_MARKETING_INTELLIGENCE_KEY = 'fireova-marketing-hub-marketing-intelligence-v1'
export const MARKETING_INTELLIGENCE_GENERATOR_VERSION = '1.1.0'

const MARKETING_INTELLIGENCE_EXTENSION_POINTS: MarketingIntelligenceExtensionPoint[] = [
  'Vision AI',
  'Video Analysis',
  'Caption Analysis',
  'Engagement Analysis',
  'Posting History',
  'Calendar',
  'Seasonality',
]

export function generateMarketingIntelligence(
  event: LocalFireovaEvent,
  input: GenerateMarketingIntelligenceInput = {}
): MarketingIntelligence {
  const profile = input.profile ?? readBusinessProfile()
  const contentItems = input.contentItems ?? readAllContentBankItems().filter((item) => isEventContentItem(event, item))
  const generatedPosts = input.generatedPosts ?? readAllLocalGeneratedPosts()[event.id] ?? []
  const postStatuses = input.postStatuses ?? readLocalPostStatuses(event.id)
  const opportunities = input.opportunities ?? buildMarketingOpportunitiesForEvent(event, profile)
  const mediaAnalyses = input.mediaAnalyses ?? readMediaAnalysesForEvent(event)
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const sourceFingerprint = input.sourceFingerprint ?? createMarketingIntelligenceSourceFingerprint(event, {
    profile,
    contentItems,
    generatedPosts,
    postStatuses,
    opportunities,
    mediaAnalyses,
  })
  const mediaAnalysisEvidence = getApprovedMediaAnalysisEvidence(mediaAnalyses)
  const eventText = buildEventEvidenceText(event, contentItems, generatedPosts, mediaAnalysisEvidence)
  const signalContext = buildSignalContext(event, contentItems, generatedPosts, opportunities, eventText, mediaAnalysisEvidence)
  const businessGoalMatches = buildGoalMatches(profile, signalContext.evidenceText)
  const serviceMatches = buildProfileItemMatches(profile.services, signalContext.evidenceText, signalContext)
  const idealClientMatches = buildProfileItemMatches(profile.idealClients, signalContext.evidenceText, signalContext)
  const contentStrengths = inferContentStrengths(event, contentItems, generatedPosts, opportunities, signalContext)
  const missingContent = inferMissingContent(event, opportunities, signalContext)
  const recommendedPostingOrder = buildRecommendedPostingOrder(opportunities)
  const recommendedFormats = buildRecommendedFormats(opportunities, event.media)
  const overallMarketingScore = rateOverallMarketingValue({
    strengths: contentStrengths,
    goalMatches: businessGoalMatches,
    serviceMatches,
    idealClientMatches,
    opportunities,
    generatedPosts,
    postStatuses,
  })

  return normalizeMarketingIntelligence({
    id: createMarketingIntelligenceId(event.id),
    eventId: event.id,
    generatedAt,
    version: 1,
    generatorVersion: MARKETING_INTELLIGENCE_GENERATOR_VERSION,
    sourceFingerprint,
    overallMarketingScore,
    businessGoalMatches,
    serviceMatches,
    idealClientMatches,
    contentStrengths,
    contentWeaknesses: missingContent,
    opportunities,
    missingContent,
    recommendedFormats,
    recommendedPostingOrder,
    storyPotential: rateStoryPotential(event, contentStrengths, opportunities),
    evergreenPotential: rateEvergreenPotential(contentStrengths, serviceMatches, event),
    vendorPotential: rateVendorPotential(event, opportunities),
    socialGrowthPotential: rateSocialGrowthPotential(event, contentStrengths, opportunities),
    bookingPotential: rateBookingPotential(businessGoalMatches, idealClientMatches, opportunities),
    notes: buildNotes(event, opportunities, missingContent),
    sourceSnapshot: {
      mediaCount: event.media.length,
      videoCount: event.media.filter((media) => media.type === 'video').length,
      tagCount: signalContext.tags.length,
      contentThemeCount: signalContext.contentThemes.length,
      generatedPostCount: generatedPosts.length,
      opportunityCount: opportunities.length,
    },
    extensionPoints: MARKETING_INTELLIGENCE_EXTENSION_POINTS,
  })
}

export type GetOrGenerateMarketingIntelligenceInput = GenerateMarketingIntelligenceInput & {
  persist?: boolean
  forceRegenerate?: boolean
}

export function getOrGenerateMarketingIntelligence(
  event: LocalFireovaEvent,
  input: GetOrGenerateMarketingIntelligenceInput = {}
): MarketingIntelligence {
  const profile = input.profile ?? readBusinessProfile()
  const contentItems = input.contentItems ?? readAllContentBankItems().filter((item) => isEventContentItem(event, item))
  const generatedPosts = input.generatedPosts ?? readAllLocalGeneratedPosts()[event.id] ?? []
  const postStatuses = input.postStatuses ?? readLocalPostStatuses(event.id)
  const opportunities = input.opportunities ?? buildMarketingOpportunitiesForEvent(event, profile)
  const mediaAnalyses = input.mediaAnalyses ?? readMediaAnalysesForEvent(event)
  const sourceFingerprint = createMarketingIntelligenceSourceFingerprint(event, {
    profile,
    contentItems,
    generatedPosts,
    postStatuses,
    opportunities,
    mediaAnalyses,
  })
  const persisted = readMarketingIntelligence(event.id)

  if (
    !input.forceRegenerate &&
    persisted &&
    persisted.generatorVersion === MARKETING_INTELLIGENCE_GENERATOR_VERSION &&
    persisted.sourceFingerprint === sourceFingerprint
  ) {
    return persisted
  }

  const report = generateMarketingIntelligence(event, {
    ...input,
    profile,
    contentItems,
    generatedPosts,
    postStatuses,
    opportunities,
    mediaAnalyses,
    sourceFingerprint,
  })

  if (input.persist !== false) {
    writeMarketingIntelligence(event.id, report)
  }

  return report
}

export type MarketingIntelligenceResult =
  | { ok: true; report: MarketingIntelligence; error?: never }
  | { ok: false; report: MarketingIntelligence | null; error: Error }

export function safelyGetOrGenerateMarketingIntelligence(
  event: LocalFireovaEvent,
  input: GetOrGenerateMarketingIntelligenceInput = {}
): MarketingIntelligenceResult {
  try {
    return { ok: true, report: getOrGenerateMarketingIntelligence(event, input) }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Marketing Intelligence generation failed', { eventId: event.id, error })
    }

    return {
      ok: false,
      report: readMarketingIntelligence(event.id),
      error: error instanceof Error ? error : new Error('Marketing Intelligence generation failed'),
    }
  }
}

export function generateAndPersistMarketingIntelligence(
  event: LocalFireovaEvent,
  input: GenerateMarketingIntelligenceInput = {}
) {
  const report = generateMarketingIntelligence(event, input)
  writeMarketingIntelligence(event.id, report)
  return report
}

export function createMarketingIntelligenceSourceFingerprint(
  event: LocalFireovaEvent,
  input: Required<Pick<GenerateMarketingIntelligenceInput, 'profile' | 'contentItems' | 'generatedPosts' | 'postStatuses' | 'opportunities' | 'mediaAnalyses'>>
) {
  return hashStableValue({
    generatorVersion: MARKETING_INTELLIGENCE_GENERATOR_VERSION,
    event: {
      id: event.id,
      name: event.name,
      type: event.type,
      date: event.date,
      venueName: event.venueName,
      venueLocation: event.venueLocation,
      notes: event.notes,
      vendors: (event.vendors ?? []).map((vendor) => ({
        id: vendor.id,
        vendorId: vendor.vendorId,
        category: vendor.category,
        businessName: vendor.businessName,
        instagramHandle: vendor.instagramHandle,
        website: vendor.website,
        instagramOverride: vendor.instagramOverride,
        notes: vendor.notes,
      })),
      media: event.media.map((media) => ({
        id: media.id,
        type: media.type,
        alt: media.alt,
        src: media.src,
        posterSrc: media.posterSrc,
      })),
    },
    profile: {
      goals: input.profile.goals.map((goal) => ({
        id: goal.id,
        label: goal.label,
        category: goal.category,
        isActive: goal.isActive,
        priority: goal.priority,
      })),
      services: input.profile.services.map((item) => pickProfileItemFingerprint(item)),
      idealClients: input.profile.idealClients.map((item) => pickProfileItemFingerprint(item)),
      brandVoice: input.profile.brandVoice,
      brandPriorities: input.profile.brandPriorities.map((item) => pickProfileItemFingerprint(item)),
    },
    contentItems: input.contentItems.map((item) => ({
      id: item.id,
      mediaId: item.mediaId,
      mediaType: item.mediaType,
      title: item.title,
      description: item.description,
      category: item.category,
      contentTheme: item.contentTheme,
      foodItems: item.foodItems,
      tags: item.tags,
      seasonTags: item.seasonTags,
      platformTags: item.platformTags,
      favorite: item.favorite,
      archived: item.archived,
      notes: item.notes,
      sourceEventId: item.sourceEventId,
    })),
    generatedPosts: input.generatedPosts.map((post) => ({
      id: post.id,
      tone: post.tone,
      caption: post.caption,
      hashtags: post.hashtags,
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      sourceLabel: post.sourceLabel,
      mediaIds: (post.mediaItems && post.mediaItems.length > 0 ? post.mediaItems : [post.media]).map((media) => media.id),
      status: input.postStatuses[post.id] ?? 'Draft',
      generatedPostId: post.id,
    })),
    opportunities: input.opportunities.map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      summary: opportunity.summary,
      opportunityType: opportunity.opportunityType,
      recommendedFormat: opportunity.recommendedFormat,
      supportedGoalIds: opportunity.supportedGoalIds,
      supportedServiceIds: opportunity.supportedServiceIds,
      supportedClientIds: opportunity.supportedClientIds,
      contentPurposes: opportunity.contentPurposes,
      mediaIds: opportunity.mediaIds,
      status: opportunity.status,
      source: opportunity.source,
      generatedPostId: opportunity.generatedPostId,
      reasons: opportunity.reasons,
      missingShots: opportunity.missingShots,
    })),
    mediaAnalyses: input.mediaAnalyses.map((analysis) => ({
      mediaId: analysis.mediaId,
      analysisVersion: analysis.analysisVersion,
      sourceFingerprint: analysis.sourceFingerprint,
      status: analysis.status,
      reviewStatus: analysis.userReview.reviewStatus,
      approvedSuggestionIds: analysis.userReview.approvedSuggestionIds,
      rejectedSuggestionIds: analysis.userReview.rejectedSuggestionIds,
      userAddedTags: analysis.userReview.userAddedTags,
      userEditedFields: analysis.userReview.userEditedFields,
      evidence: getApprovedMediaAnalysisEvidence([analysis]),
    })),
  })
}

export function readAllMarketingIntelligence(): Record<string, MarketingIntelligence> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(LOCAL_MARKETING_INTELLIGENCE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, MarketingIntelligence>>((acc, [eventId, value]) => {
      if (isMarketingIntelligence(value)) {
        acc[eventId] = normalizeMarketingIntelligence(value)
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

export function readMarketingIntelligence(eventId: string) {
  return readAllMarketingIntelligence()[eventId] ?? null
}

export function writeMarketingIntelligence(eventId: string, report: MarketingIntelligence) {
  if (typeof window === 'undefined') return

  try {
    const all = readAllMarketingIntelligence()
    all[eventId] = normalizeMarketingIntelligence(report)
    window.localStorage.setItem(LOCAL_MARKETING_INTELLIGENCE_KEY, JSON.stringify(all))
  } catch {
    return
  }
}

export function deleteMarketingIntelligence(eventId: string) {
  if (typeof window === 'undefined') return

  try {
    const all = readAllMarketingIntelligence()
    delete all[eventId]
    window.localStorage.setItem(LOCAL_MARKETING_INTELLIGENCE_KEY, JSON.stringify(all))
  } catch {
    return
  }
}

export function getVisibleSortedIntelligenceOpportunities(report: MarketingIntelligence, showDismissed = false) {
  return [...report.opportunities]
    .filter((opportunity) => showDismissed || opportunity.status !== 'Dismissed')
    .sort((a, b) => {
      if (a.status === 'Dismissed' && b.status !== 'Dismissed') return 1
      if (a.status !== 'Dismissed' && b.status === 'Dismissed') return -1
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
}

function buildGoalMatches(profile: BusinessProfile, evidenceText: string): MarketingIntelligenceMatch[] {
  return getActiveGoals(profile).flatMap((goal) => {
    const rule = getGoalRule(goal)
    const reasons = rule.keywords
      .filter((keyword) => evidenceText.includes(keyword.toLowerCase()))
      .slice(0, 4)
      .map((keyword) => `Local evidence includes "${keyword}".`)

    if (reasons.length === 0) return []

    return [{
      id: goal.id,
      label: goal.label,
      rating: rateByCount(reasons.length, { exceptional: 4, strong: 2, moderate: 1 }),
      reasons,
    }]
  })
}

function buildProfileItemMatches(
  items: ProfileListItem[],
  evidenceText: string,
  signalContext: MarketingSignalContext
): MarketingIntelligenceMatch[] {
  return items
    .filter((item) => item.isActive)
    .flatMap((item) => {
      const terms = labelToSearchTerms(item.label)
      const matchedTerms = terms.filter((term) => evidenceText.includes(term))
      const indirectMatch = inferIndirectProfileMatch(item.label, signalContext)
      const reasons = [
        matchedTerms[0] ? `Local evidence references "${matchedTerms[0]}".` : '',
        indirectMatch,
      ].filter(Boolean)

      if (reasons.length === 0) return []

      return [{
        id: item.id,
        label: item.label,
        rating: rateByCount(reasons.length, { exceptional: 3, strong: 2, moderate: 1 }),
        reasons,
      }]
    })
}

function inferContentStrengths(
  event: LocalFireovaEvent,
  contentItems: LocalContentBankItem[],
  generatedPosts: LocalGeneratedPostDraft[],
  opportunities: MarketingOpportunity[],
  signalContext: MarketingSignalContext
): MarketingContentStrength[] {
  const strengths: MarketingContentStrength[] = []
  const add = (strength: MarketingContentStrength, supported: boolean) => {
    if (supported && !strengths.includes(strength)) strengths.push(strength)
  }

  add('Interactive Catering', matchesEvidence(signalContext.evidenceText, ['interactive', 'pizza cutting', 'making pizza', 'guest participating']))
  add('Wedding Experience', matchesEvidence(signalContext.evidenceText, ['wedding', 'bride', 'groom', 'couple', 'rehearsal']))
  add('Beautiful Food', matchesEvidence(signalContext.evidenceText, ['pizza', 'charcuterie', 'grazing', 'salad', 'appetizer', 'food close-up', 'menu']))
  add('Strong Branding', matchesEvidence(signalContext.evidenceText, ['fireova', 'brand', 'oven', 'trailer', 'wood-fired']))
  add('Guest Experience', matchesEvidence(signalContext.evidenceText, ['guest', 'guests', 'served', 'serving', 'reactions', 'crowd']))
  add('Behind The Scenes', matchesEvidence(signalContext.evidenceText, ['behind the scenes', 'setup', 'prep', 'process', 'team working', 'fire']))
  add('Vendor Opportunity', hasVendorEvidence(event) || opportunities.some((item) => item.opportunityType === 'Vendor Collaboration'))
  add('Product Detail', contentItems.some((item) => item.foodItems.length > 0) || opportunities.some((item) => item.opportunityType === 'Product'))
  add('Team Presence', matchesEvidence(signalContext.evidenceText, ['team', 'staff', 'employee']))
  add('Corporate Service', matchesEvidence(signalContext.evidenceText, ['corporate', 'office', 'lunch', 'employees']))

  if (generatedPosts.length > 0 && !strengths.includes('Strong Branding')) strengths.push('Strong Branding')

  return strengths
}

function inferMissingContent(
  event: LocalFireovaEvent,
  opportunities: MarketingOpportunity[],
  signalContext: MarketingSignalContext
): MarketingContentGap[] {
  const gaps: MarketingContentGap[] = []
  const missingShotText = opportunities.flatMap((opportunity) => opportunity.missingShots).join(' ').toLowerCase()
  const add = (gap: MarketingContentGap, supported: boolean) => {
    if (supported && !gaps.includes(gap)) gaps.push(gap)
  }

  add('Missing Guest Reactions', missingShotText.includes('guest') && !matchesEvidence(signalContext.evidenceText, ['reaction', 'reactions', 'first bite']))
  add('Missing Team Photos', missingShotText.includes('team') && !matchesEvidence(signalContext.evidenceText, ['team photo', 'staff photo']))
  add('Missing Venue Wide Shot', missingShotText.includes('wide') && Boolean(event.venueName || event.venueLocation || hasVendorEvidence(event)))
  add('Missing Corporate Content', event.type === 'Corporate' && !matchesEvidence(signalContext.evidenceText, ['office', 'employees', 'corporate']))
  add('Missing Testimonials', missingShotText.includes('testimonial') && !matchesEvidence(signalContext.evidenceText, ['testimonial', 'review', 'client quote', 'thank you']))
  add('Missing Product Detail', missingShotText.includes('detail') && !matchesEvidence(signalContext.evidenceText, ['close-up', 'ingredient', 'menu detail']))
  add('Missing Service Moment', missingShotText.includes('service') && !matchesEvidence(signalContext.evidenceText, ['serving', 'served', 'service']))

  return gaps
}

function buildRecommendedFormats(opportunities: MarketingOpportunity[], media: MockMedia[]): RecommendedFormat[] {
  const formats = opportunities
    .filter((opportunity) => opportunity.status !== 'Dismissed')
    .map((opportunity) => opportunity.recommendedFormat)
    .filter((format) => format !== 'Flexible')

  if (formats.length === 0) {
    if (media.some((item) => item.type === 'video')) formats.push('Reel')
    else if (media.length > 1) formats.push('Carousel')
    else formats.push('Photo')
  }

  return uniqueValues(formats).slice(0, 4)
}

function buildRecommendedPostingOrder(opportunities: MarketingOpportunity[]): MarketingPostingRecommendation[] {
  return [...opportunities]
    .filter((opportunity) => opportunity.status !== 'Dismissed')
    .sort((a, b) => {
      if (getOpportunityStatusRank(a.status) !== getOpportunityStatusRank(b.status)) {
        return getOpportunityStatusRank(a.status) - getOpportunityStatusRank(b.status)
      }
      if (a.score !== b.score) return b.score - a.score
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
    .slice(0, 5)
    .map((opportunity, index) => ({
      order: index + 1,
      title: opportunity.title,
      opportunityId: opportunity.id,
      recommendedFormat: opportunity.recommendedFormat,
      reason: opportunity.summary,
      mediaIds: opportunity.mediaIds,
    }))
}

function rateOverallMarketingValue({
  strengths,
  goalMatches,
  serviceMatches,
  idealClientMatches,
  opportunities,
  generatedPosts,
  postStatuses,
}: {
  strengths: MarketingContentStrength[]
  goalMatches: MarketingIntelligenceMatch[]
  serviceMatches: MarketingIntelligenceMatch[]
  idealClientMatches: MarketingIntelligenceMatch[]
  opportunities: MarketingOpportunity[]
  generatedPosts: LocalGeneratedPostDraft[]
  postStatuses: Record<string, LocalPostDraftStatus>
}): MarketingQualityRating {
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.status !== 'Dismissed')
  const approvedPostCount = generatedPosts.filter((post) => postStatuses[post.id] === 'Approved' || postStatuses[post.id] === 'Scheduled' || postStatuses[post.id] === 'Published').length
  const evidenceCount = strengths.length + goalMatches.length + serviceMatches.length + idealClientMatches.length

  if (evidenceCount >= 8 && activeOpportunities.length >= 3 && approvedPostCount > 0) return 'Exceptional'
  if (evidenceCount >= 5 && activeOpportunities.length >= 2) return 'Strong'
  if (evidenceCount >= 3 || activeOpportunities.length > 0) return 'Moderate'
  if (evidenceCount >= 1) return 'Limited'
  return 'Weak'
}

function rateStoryPotential(
  event: LocalFireovaEvent,
  strengths: MarketingContentStrength[],
  opportunities: MarketingOpportunity[]
): MarketingPotentialRating {
  if (event.media.some((media) => media.type === 'video') && strengths.some((item) => item === 'Guest Experience' || item === 'Behind The Scenes')) return 'Exceptional'
  if (opportunities.some((item) => item.recommendedFormat === 'Story Set') || strengths.length >= 3) return 'Strong'
  if (event.media.length > 1) return 'Moderate'
  return 'Limited'
}

function rateEvergreenPotential(
  strengths: MarketingContentStrength[],
  serviceMatches: MarketingIntelligenceMatch[],
  event: LocalFireovaEvent
): MarketingPotentialRating {
  if (strengths.includes('Beautiful Food') && serviceMatches.length > 1) return 'Exceptional'
  if (strengths.includes('Product Detail') || strengths.includes('Beautiful Food')) return 'Strong'
  if (event.media.length > 0) return 'Moderate'
  return 'Limited'
}

function rateVendorPotential(event: LocalFireovaEvent, opportunities: MarketingOpportunity[]): MarketingPotentialRating {
  const vendorCount = (event.vendors ?? []).length + (event.venueName ? 1 : 0)
  if (vendorCount >= 3 && opportunities.some((item) => item.opportunityType === 'Vendor Collaboration')) return 'Exceptional'
  if (vendorCount > 0) return 'Strong'
  if (opportunities.some((item) => item.opportunityType === 'Vendor Collaboration')) return 'Moderate'
  return 'Limited'
}

function rateSocialGrowthPotential(
  event: LocalFireovaEvent,
  strengths: MarketingContentStrength[],
  opportunities: MarketingOpportunity[]
): MarketingPotentialRating {
  if (event.media.some((media) => media.type === 'video') && strengths.includes('Interactive Catering')) return 'Exceptional'
  if (opportunities.some((item) => item.contentPurposes.includes('Grow audience')) || strengths.includes('Behind The Scenes')) return 'Strong'
  if (event.media.some((media) => media.type === 'video') || strengths.length >= 2) return 'Moderate'
  return 'Limited'
}

function rateBookingPotential(
  goalMatches: MarketingIntelligenceMatch[],
  idealClientMatches: MarketingIntelligenceMatch[],
  opportunities: MarketingOpportunity[]
): MarketingPotentialRating {
  const bookingGoal = goalMatches.some((match) => match.label.toLowerCase().includes('book'))
  const inquiryOpportunity = opportunities.some((item) => item.contentPurposes.includes('Drive inquiries'))
  if (bookingGoal && inquiryOpportunity && idealClientMatches.length > 0) return 'Exceptional'
  if ((bookingGoal && inquiryOpportunity) || idealClientMatches.length > 1) return 'Strong'
  if (bookingGoal || inquiryOpportunity || idealClientMatches.length > 0) return 'Moderate'
  return 'Limited'
}

function buildNotes(
  event: LocalFireovaEvent,
  opportunities: MarketingOpportunity[],
  missingContent: MarketingContentGap[]
): MarketingIntelligenceNote[] {
  const notes: MarketingIntelligenceNote[] = [
    {
      source: 'Rule Based',
      message: 'Generated from local event metadata, media labels, Content Bank metadata, generated posts, Business Profile, and saved opportunities.',
    },
    {
      source: 'Future AI',
      message: 'Vision, video, caption, engagement, posting history, calendar, and seasonality inputs can replace or enrich this report later.',
    },
  ]

  if (event.media.length === 0) {
    notes.push({ source: 'Rule Based', message: 'No local event media is available, so the report is intentionally limited.' })
  }

  if (opportunities.some((opportunity) => opportunity.source === 'User Created')) {
    notes.push({ source: 'Manual', message: 'Manual opportunity edits are preserved inside the intelligence report.' })
  }

  if (missingContent.length > 0) {
    notes.push({ source: 'Rule Based', message: 'Missing content is listed only where the local rule evidence points to a specific gap.' })
  }

  return notes
}

function buildSignalContext(
  event: LocalFireovaEvent,
  contentItems: LocalContentBankItem[],
  generatedPosts: LocalGeneratedPostDraft[],
  opportunities: MarketingOpportunity[],
  eventText: string,
  mediaAnalysisEvidence: string[]
): MarketingSignalContext {
  const tags = uniqueValues(contentItems.flatMap((item) => [...item.tags, ...item.seasonTags, ...item.platformTags]))
  const contentThemes = uniqueValues(contentItems.map((item) => item.contentTheme).filter(Boolean))
  const opportunityText = opportunities.flatMap((item) => [item.title, item.summary, item.opportunityType]).join(' ')

  return {
    tags,
    contentThemes,
    evidenceText: [eventText, tags.join(' '), contentThemes.join(' '), opportunityText, mediaAnalysisEvidence.join(' ')].join(' ').toLowerCase(),
  }
}

type MarketingSignalContext = {
  tags: string[]
  contentThemes: string[]
  evidenceText: string
}

function buildEventEvidenceText(
  event: LocalFireovaEvent,
  contentItems: LocalContentBankItem[],
  generatedPosts: LocalGeneratedPostDraft[],
  mediaAnalysisEvidence: string[] = []
) {
  return [
    event.name,
    event.type,
    event.venueName,
    event.venueLocation,
    event.notes,
    ...event.media.flatMap((media) => [media.alt, media.type]),
    ...contentItems.flatMap((item) => [
      item.title,
      item.description,
      item.category,
      item.contentTheme,
      item.foodItems.join(' '),
      item.tags.join(' '),
      item.notes,
    ]),
    ...generatedPosts.flatMap((post) => [post.tone, post.caption, post.hashtags.join(' '), post.sourceLabel]),
    ...mediaAnalysisEvidence,
  ].filter(Boolean).join(' ').toLowerCase()
}

function isEventContentItem(event: LocalFireovaEvent, item: LocalContentBankItem) {
  return item.sourceEventId === event.id || event.media.some((media) => media.id === item.mediaId)
}

function inferIndirectProfileMatch(label: string, signalContext: MarketingSignalContext) {
  const normalized = label.toLowerCase()
  if (normalized.includes('wedding') && matchesEvidence(signalContext.evidenceText, ['bride', 'groom', 'couple', 'rehearsal'])) {
    return 'Event evidence indicates wedding-related content.'
  }
  if (normalized.includes('corporate') && matchesEvidence(signalContext.evidenceText, ['office', 'employees', 'lunch'])) {
    return 'Event evidence indicates corporate catering content.'
  }
  if (normalized.includes('interactive') && matchesEvidence(signalContext.evidenceText, ['pizza cutting', 'guest participating', 'making pizza'])) {
    return 'Event evidence indicates an interactive catering moment.'
  }
  return ''
}

function hasVendorEvidence(event: LocalFireovaEvent) {
  return Boolean(event.venueName?.trim() || event.vendors?.some((vendor) => vendor.businessName || vendor.instagramHandle || vendor.website))
}

function matchesEvidence(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term.toLowerCase()))
}

function rateByCount(
  count: number,
  thresholds: { exceptional: number; strong: number; moderate: number }
): MarketingQualityRating {
  if (count >= thresholds.exceptional) return 'Exceptional'
  if (count >= thresholds.strong) return 'Strong'
  if (count >= thresholds.moderate) return 'Moderate'
  return 'Limited'
}

function labelToSearchTerms(label: string) {
  const normalized = label.toLowerCase()
  return uniqueValues([
    normalized,
    normalized.replace(/s\b/g, ''),
    ...normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 3),
  ])
}

function uniqueValues<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function pickProfileItemFingerprint(item: ProfileListItem) {
  return {
    id: item.id,
    label: item.label,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
  }
}

function getOpportunityStatusRank(status: MarketingOpportunity['status']) {
  switch (status) {
    case 'Converted to Post':
      return 0
    case 'Ready':
      return 1
    case 'Needs Review':
      return 2
    case 'Suggested':
      return 3
    case 'Dismissed':
      return 4
  }
}

function hashStableValue(value: unknown) {
  const text = stableStringify(value)
  let hash = 5381

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index)
  }

  return `mi-${(hash >>> 0).toString(36)}`
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`
}

function createMarketingIntelligenceId(eventId: string) {
  return `marketing-intelligence-${eventId}`
}

function normalizeMarketingIntelligence(report: MarketingIntelligence): MarketingIntelligence {
  return {
    ...report,
    id: report.id || createMarketingIntelligenceId(report.eventId),
    version: 1,
    generatorVersion: report.generatorVersion || 'legacy',
    sourceFingerprint: report.sourceFingerprint || '',
    businessGoalMatches: normalizeMatches(report.businessGoalMatches),
    serviceMatches: normalizeMatches(report.serviceMatches),
    idealClientMatches: normalizeMatches(report.idealClientMatches),
    contentStrengths: uniqueValues(report.contentStrengths),
    contentWeaknesses: uniqueValues(report.contentWeaknesses),
    opportunities: report.opportunities,
    missingContent: uniqueValues(report.missingContent),
    recommendedFormats: uniqueValues(report.recommendedFormats),
    recommendedPostingOrder: report.recommendedPostingOrder.map((item, index) => ({ ...item, order: index + 1 })),
    notes: report.notes.filter((note) => note.message.trim().length > 0),
    extensionPoints: uniqueValues(report.extensionPoints),
  }
}

function normalizeMatches(matches: MarketingIntelligenceMatch[]) {
  return matches.map((match) => ({
    ...match,
    reasons: uniqueValues(match.reasons.map((reason) => reason.trim()).filter(Boolean)).slice(0, 4),
  }))
}

function isMarketingIntelligence(value: unknown): value is MarketingIntelligence {
  if (!value || typeof value !== 'object') return false
  const report = value as Partial<MarketingIntelligence>
  return (
    typeof report.id === 'string' &&
    typeof report.eventId === 'string' &&
    typeof report.generatedAt === 'string' &&
    report.version === 1 &&
    (report.generatorVersion === undefined || typeof report.generatorVersion === 'string') &&
    (report.sourceFingerprint === undefined || typeof report.sourceFingerprint === 'string') &&
    isMarketingQualityRating(report.overallMarketingScore) &&
    Array.isArray(report.businessGoalMatches) &&
    Array.isArray(report.serviceMatches) &&
    Array.isArray(report.idealClientMatches) &&
    Array.isArray(report.contentStrengths) &&
    Array.isArray(report.contentWeaknesses) &&
    Array.isArray(report.opportunities) &&
    Array.isArray(report.missingContent) &&
    Array.isArray(report.recommendedFormats) &&
    Array.isArray(report.recommendedPostingOrder) &&
    Array.isArray(report.notes)
  )
}

function isMarketingQualityRating(value: unknown): value is MarketingQualityRating {
  return value === 'Exceptional' || value === 'Strong' || value === 'Moderate' || value === 'Limited' || value === 'Weak'
}
