import { FIREOVA_BRAND_BRAIN } from './fireova-brand-brain'

export type ContentCategory =
  | 'wedding'
  | 'corporate'
  | 'private-party'
  | 'food'
  | 'experience'
  | 'team'
  | 'planning-inspiration'
  | 'venue-vendor'
  | 'seasonal-campaign'

export type ContentCandidate = {
  id: string
  category: ContentCategory
  eventType?: string
  storyScore: number
  qualityScore: number
  brandScore: number
  growthScore?: number
  needsEdit?: boolean
  createdAt?: string
}

export type StrategyFocus = {
  label: string
  startDate: string
  endDate: string
  priorityCategories?: ContentCategory[]
  notes?: string
}

export type WeeklyRecommendation = ContentCandidate & {
  recommendationScore: number
  reason: string
}

const clamp = (value: number) => Math.max(0, Math.min(100, value))

function baseScore(item: ContentCandidate) {
  const story = clamp(item.storyScore)
  const quality = clamp(item.qualityScore)
  const brand = clamp(item.brandScore)
  const growth = clamp(item.growthScore ?? 50)
  return story * 0.32 + quality * 0.24 + brand * 0.32 + growth * 0.12
}

function focusBonus(item: ContentCandidate, focuses: StrategyFocus[]) {
  return focuses.some((focus) => focus.priorityCategories?.includes(item.category)) ? 12 : 0
}

function varietyPenalty(item: ContentCandidate, selected: WeeklyRecommendation[]) {
  const sameCategory = selected.filter((post) => post.category === item.category).length
  const sameEventType = item.eventType
    ? selected.filter((post) => post.eventType === item.eventType).length
    : 0

  // Repetition is intentionally expensive. The goal is a cohesive brand week, not three versions of the same event.
  return sameCategory * 22 + sameEventType * 14
}

export function recommendWeeklyPosts(
  candidates: ContentCandidate[],
  focuses: StrategyFocus[] = [],
  count = FIREOVA_BRAND_BRAIN.strategy.cadence.postsPerWeek,
): WeeklyRecommendation[] {
  const eligible = candidates.filter((item) => {
    // A great story may be worth editing, but genuinely weak content should not be used just to fill a slot.
    const salvageable = item.needsEdit && item.storyScore >= 75 && item.brandScore >= 70
    return (item.qualityScore >= 65 || salvageable) && item.storyScore >= 60 && item.brandScore >= 65
  })

  const selected: WeeklyRecommendation[] = []

  while (selected.length < count) {
    const remaining = eligible.filter((item) => !selected.some((chosen) => chosen.id === item.id))
    if (!remaining.length) break

    const ranked = remaining
      .map((item) => {
        const score = baseScore(item) + focusBonus(item, focuses) - varietyPenalty(item, selected)
        return {
          ...item,
          recommendationScore: Math.round(score * 10) / 10,
          reason: buildReason(item, focuses, selected),
        }
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore)

    const winner = ranked[0]
    if (!winner || winner.recommendationScore < 55) break
    selected.push(winner)
  }

  return selected
}

function buildReason(item: ContentCandidate, focuses: StrategyFocus[], selected: WeeklyRecommendation[]) {
  const reasons: string[] = []
  if (item.brandScore >= 85) reasons.push('strong Fireova brand fit')
  if (item.storyScore >= 85) reasons.push('strong story')
  if (item.qualityScore >= 85) reasons.push('post-ready media')
  if (item.needsEdit && item.storyScore >= 75) reasons.push('worth a quick edit because the moment is strong')
  if (focuses.some((focus) => focus.priorityCategories?.includes(item.category))) reasons.push('supports the current focus')
  if (!selected.some((post) => post.category === item.category)) reasons.push('adds variety to the week')
  return reasons.length ? reasons.join(', ') : 'best available balance of story, quality, brand fit, and variety'
}

export function weeklyStrategySummary(posts: WeeklyRecommendation[]) {
  if (posts.length < FIREOVA_BRAND_BRAIN.strategy.cadence.postsPerWeek) {
    return `Only ${posts.length} post${posts.length === 1 ? '' : 's'} met the Fireova quality bar. Pull from older library content or create a targeted post rather than lowering quality.`
  }
  return 'Three strong posts selected with brand fit, quality, story value, growth potential, and weekly variety in mind.'
}
