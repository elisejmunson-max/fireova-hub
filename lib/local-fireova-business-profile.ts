import { LOCAL_ACTIVE_CAMPAIGN_KEY } from '@/lib/local-fireova-campaigns'

export type BusinessGoalCategory = 'Revenue and Booking' | 'Marketing' | 'Business'
export type ProfileFormat = 'Reel' | 'Carousel' | 'Photo'

export type BusinessDetails = {
  businessName: string
  businessDescription: string
  primaryServiceArea: string
  website: string
  instagram: string
  facebook: string
}

export type ProfileListItem = {
  id: string
  label: string
  isActive: boolean
  sortOrder: number
}

export type BusinessGoal = {
  id: string
  label: string
  category: BusinessGoalCategory
  isActive: boolean
  priority: number
  isCustom: boolean
}

export type BusinessProfile = {
  version: 1
  businessDetails: BusinessDetails
  services: ProfileListItem[]
  idealClients: ProfileListItem[]
  goals: BusinessGoal[]
  brandVoice: string[]
  brandPriorities: ProfileListItem[]
  createdAt: string
  updatedAt: string
}

export type GoalRecommendationRule = {
  keywords: string[]
  preferredFormats: ProfileFormat[]
  preferredPurposes: string[]
}

export const LOCAL_BUSINESS_PROFILE_KEY = 'fireova-marketing-hub-business-profile-v1'

export const BRAND_VOICE_OPTIONS = [
  'Warm',
  'Fun',
  'Elegant',
  'Luxury',
  'Family Friendly',
  'Modern',
  'Professional',
  'Casual',
  'Playful',
  'Confident',
]

export const GOAL_GROUPS: Array<{ category: BusinessGoalCategory; labels: string[] }> = [
  {
    category: 'Revenue and Booking',
    labels: [
      'Book More Weddings',
      'Book Corporate Catering',
      'Book Holiday Parties',
      'Book Private Events',
      'Increase Drop-Off Catering',
      'Increase Full-Service Catering',
      'Promote Interactive Catering',
    ],
  },
  {
    category: 'Marketing',
    labels: [
      'Grow Social Media Following',
      'Increase Social Media Engagement',
      'Build Brand Awareness',
      'Build Vendor Relationships',
      'Increase Website Traffic',
      'Launch New Menu',
    ],
  },
  {
    category: 'Business',
    labels: ['Hiring', 'Recruit Team Members'],
  },
]

export const GOAL_RECOMMENDATION_RULES: Record<string, GoalRecommendationRule> = {
  'book-more-weddings': {
    keywords: ['wedding', 'bridal', 'rehearsal', 'couple', 'pizza cutting', 'guest experience', 'interactive', 'testimonial', 'vendor'],
    preferredFormats: ['Reel', 'Carousel'],
    preferredPurposes: ['Drive inquiries', 'Show the experience', 'Social proof', 'Build trust'],
  },
  'book-corporate-catering': {
    keywords: ['corporate', 'office lunch', 'promotion', 'team service', 'buffet', 'reliability', 'efficient setup', 'guest volume'],
    preferredFormats: ['Reel', 'Photo', 'Carousel'],
    preferredPurposes: ['Drive inquiries', 'Build trust', 'Show craftsmanship'],
  },
  'book-holiday-parties': {
    keywords: ['holiday', 'celebration', 'seasonal', 'grazing', 'full-service', 'drop-off', 'guest experience', 'private gathering'],
    preferredFormats: ['Reel', 'Carousel', 'Photo'],
    preferredPurposes: ['Drive inquiries', 'Make people hungry', 'Show the experience'],
  },
  'book-private-events': {
    keywords: ['private', 'birthday', 'graduation', 'baby shower', 'bridal shower', 'party', 'guest experience'],
    preferredFormats: ['Reel', 'Carousel', 'Photo'],
    preferredPurposes: ['Drive inquiries', 'Show the experience', 'Build trust'],
  },
  'increase-drop-off-catering': {
    keywords: ['drop-off', 'grazing', 'charcuterie', 'appetizer', 'salad', 'convenient', 'office delivery', 'private-party setup'],
    preferredFormats: ['Carousel', 'Photo', 'Reel'],
    preferredPurposes: ['Make people hungry', 'Drive inquiries', 'Show craftsmanship'],
  },
  'increase-full-service-catering': {
    keywords: ['full-service', 'service', 'setup', 'event staff', 'buffet', 'guest experience', 'catering'],
    preferredFormats: ['Reel', 'Carousel', 'Photo'],
    preferredPurposes: ['Drive inquiries', 'Build trust', 'Show the experience'],
  },
  'promote-interactive-catering': {
    keywords: ['interactive', 'guest participating', 'couples making pizza', 'pizza cutting', 'live oven', 'oven', 'guest reactions'],
    preferredFormats: ['Reel', 'Carousel'],
    preferredPurposes: ['Show the experience', 'Drive inquiries', 'Build trust'],
  },
  'grow-social-media-following': {
    keywords: ['reel', 'interactive', 'guest reaction', 'behind the scenes', 'fire', 'oven', 'process', 'food close-up', 'team personality', 'entertaining'],
    preferredFormats: ['Reel', 'Carousel'],
    preferredPurposes: ['Build the brand', 'Show the experience', 'Make people hungry'],
  },
  'increase-social-media-engagement': {
    keywords: ['question', 'poll', 'before and after', 'menu comparison', 'behind the scenes', 'team', 'guest reaction', 'carousel'],
    preferredFormats: ['Carousel', 'Reel', 'Photo'],
    preferredPurposes: ['Build the brand', 'Show the experience', 'Make people hungry'],
  },
  'build-brand-awareness': {
    keywords: ['fireova', 'branding', 'brand', 'team', 'oven', 'trailer', 'service process', 'signature experience'],
    preferredFormats: ['Reel', 'Photo', 'Carousel'],
    preferredPurposes: ['Build the brand', 'Show craftsmanship', 'Build trust'],
  },
  'build-vendor-relationships': {
    keywords: ['venue', 'planner', 'photographer', 'vendor', 'collaboration', 'credit', 'tag'],
    preferredFormats: ['Carousel', 'Photo', 'Reel'],
    preferredPurposes: ['Build trust', 'Social proof', 'Build the brand'],
  },
  hiring: {
    keywords: ['hiring', 'team', 'culture', 'setup', 'behind the scenes', 'employee', 'recruiting'],
    preferredFormats: ['Reel', 'Photo'],
    preferredPurposes: ['Build trust', 'Build the brand'],
  },
  'recruit-team-members': {
    keywords: ['team', 'culture', 'behind the scenes', 'employee', 'recruiting', 'service'],
    preferredFormats: ['Reel', 'Photo'],
    preferredPurposes: ['Build trust', 'Build the brand'],
  },
}

const DEFAULT_SERVICES = [
  'Interactive Wood-Fired Pizza Experience',
  'Full-Service Catering',
  'Drop-Off Catering',
  'Grazing Tables',
  'Charcuterie',
  'Appetizers',
  'Salads',
  'Wood-Fired Pizza',
]

const DEFAULT_IDEAL_CLIENTS = [
  'Weddings',
  'Corporate',
  'Private Parties',
  'Holiday Parties',
  'Graduations',
  'Birthday Parties',
  'Baby Showers',
  'Bridal Showers',
  'Rehearsal Dinners',
  'Community Events',
]

const DEFAULT_BRAND_PRIORITIES = [
  'Book More Events',
  'Increase Average Order Value',
  'Grow Social Media Following',
  'Increase Brand Awareness',
  'Build Vendor Relationships',
  'Grow Corporate Catering',
  'Increase Wedding Bookings',
]

const OLD_CAMPAIGN_TO_GOAL: Record<string, string> = {
  'book-more-weddings': 'Book More Weddings',
  'book-corporate-catering': 'Book Corporate Catering',
  'promote-private-events': 'Book Private Events',
  'promote-interactive-catering': 'Promote Interactive Catering',
  'promote-small-bites': 'Launch New Menu',
  'build-brand-awareness': 'Build Brand Awareness',
  hiring: 'Hiring',
}

export function readBusinessProfile() {
  if (typeof window === 'undefined') return createDefaultBusinessProfile()

  try {
    const rawProfile = window.localStorage.getItem(LOCAL_BUSINESS_PROFILE_KEY)
    if (rawProfile) {
      const parsed = JSON.parse(rawProfile)
      if (isBusinessProfile(parsed)) return normalizeBusinessProfile(parsed)
    }
  } catch {
    return createDefaultBusinessProfile()
  }

  const migratedProfile = migrateFromActiveCampaign(createDefaultBusinessProfile())
  writeBusinessProfile(migratedProfile)
  return migratedProfile
}

export function writeBusinessProfile(profile: BusinessProfile) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_BUSINESS_PROFILE_KEY, JSON.stringify(normalizeBusinessProfile({
    ...profile,
    updatedAt: new Date().toISOString(),
  })))
}

export function createDefaultBusinessProfile(): BusinessProfile {
  const now = new Date().toISOString()
  const goals = GOAL_GROUPS.flatMap((group) =>
    group.labels.map((label) => ({
      id: createStableId('goal', label),
      label,
      category: group.category,
      isActive: label === 'Book More Weddings',
      priority: label === 'Book More Weddings' ? 0 : 999,
      isCustom: false,
    }))
  )

  return {
    version: 1,
    businessDetails: {
      businessName: 'Fireova Pizza',
      businessDescription: '',
      primaryServiceArea: '',
      website: '',
      instagram: '',
      facebook: '',
    },
    services: createDefaultListItems(DEFAULT_SERVICES),
    idealClients: createDefaultListItems(DEFAULT_IDEAL_CLIENTS),
    goals,
    brandVoice: ['Warm', 'Fun', 'Professional'],
    brandPriorities: createDefaultListItems(DEFAULT_BRAND_PRIORITIES),
    createdAt: now,
    updatedAt: now,
  }
}

export function getActiveGoals(profile: Pick<BusinessProfile, 'goals'>) {
  return profile.goals
    .filter((goal) => goal.isActive)
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label))
}

export function getGoalRule(goal: Pick<BusinessGoal, 'id' | 'label'>): GoalRecommendationRule {
  return GOAL_RECOMMENDATION_RULES[goal.id] ?? {
    keywords: labelToKeywords(goal.label),
    preferredFormats: ['Reel', 'Carousel', 'Photo'],
    preferredPurposes: ['Drive inquiries', 'Build trust', 'Build the brand'],
  }
}

export function createProfileItem(label: string, sortOrder: number): ProfileListItem {
  return {
    id: `${createStableId('item', label)}-${Date.now()}`,
    label: label.trim(),
    isActive: true,
    sortOrder,
  }
}

export function createCustomGoal(label: string, priority: number): BusinessGoal {
  return {
    id: `${createStableId('custom-goal', label)}-${Date.now()}`,
    label: label.trim(),
    category: 'Business',
    isActive: true,
    priority,
    isCustom: true,
  }
}

export function createStableId(prefix: string, label: string) {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${prefix}-${slug || 'item'}`
}

function createDefaultListItems(labels: string[]): ProfileListItem[] {
  return labels.map((label, index) => ({
    id: createStableId('item', label),
    label,
    isActive: true,
    sortOrder: index,
  }))
}

function migrateFromActiveCampaign(profile: BusinessProfile): BusinessProfile {
  const oldCampaignId = window.localStorage.getItem(LOCAL_ACTIVE_CAMPAIGN_KEY)
  if (!oldCampaignId) return profile

  const mappedGoal = OLD_CAMPAIGN_TO_GOAL[oldCampaignId]
  const nextGoals = profile.goals.map((goal) => ({ ...goal, isActive: false, priority: 999 }))

  if (mappedGoal) {
    return {
      ...profile,
      goals: nextGoals.map((goal) => goal.label === mappedGoal ? { ...goal, isActive: true, priority: 0 } : goal),
    }
  }

  return {
    ...profile,
    goals: [
      ...nextGoals,
      {
        id: `${createStableId('custom-goal', oldCampaignId)}-${Date.now()}`,
        label: oldCampaignId,
        category: 'Business',
        isActive: true,
        priority: 0,
        isCustom: true,
      },
    ],
  }
}

function normalizeBusinessProfile(profile: BusinessProfile): BusinessProfile {
  const activeGoals = profile.goals.filter((goal) => goal.isActive).sort((a, b) => a.priority - b.priority)
  const activePriority = new Map(activeGoals.map((goal, index) => [goal.id, index]))

  return {
    ...profile,
    businessDetails: {
      businessName: profile.businessDetails.businessName ?? '',
      businessDescription: profile.businessDetails.businessDescription ?? '',
      primaryServiceArea: profile.businessDetails.primaryServiceArea ?? '',
      website: profile.businessDetails.website ?? '',
      instagram: profile.businessDetails.instagram ?? '',
      facebook: profile.businessDetails.facebook ?? '',
    },
    services: normalizeListItems(profile.services),
    idealClients: normalizeListItems(profile.idealClients),
    goals: profile.goals.map((goal) => ({
      ...goal,
      priority: goal.isActive ? activePriority.get(goal.id) ?? 999 : 999,
    })),
    brandVoice: profile.brandVoice.filter((voice) => BRAND_VOICE_OPTIONS.includes(voice)),
    brandPriorities: normalizeListItems(profile.brandPriorities),
  }
}

function normalizeListItems(items: ProfileListItem[]) {
  return [...items]
    .map((item, index) => ({
      ...item,
      label: item.label.trim(),
      sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : index,
    }))
    .filter((item) => item.label.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((item, index) => ({ ...item, sortOrder: index }))
}

function isBusinessProfile(value: unknown): value is BusinessProfile {
  if (!value || typeof value !== 'object') return false

  const profile = value as Partial<BusinessProfile>
  return (
    profile.version === 1 &&
    Boolean(profile.businessDetails) &&
    Array.isArray(profile.services) &&
    Array.isArray(profile.idealClients) &&
    Array.isArray(profile.goals) &&
    Array.isArray(profile.brandVoice) &&
    Array.isArray(profile.brandPriorities)
  )
}

function labelToKeywords(label: string) {
  return label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
}
