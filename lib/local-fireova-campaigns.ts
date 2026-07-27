export type FireovaCampaignId =
  | 'book-more-weddings'
  | 'book-corporate-catering'
  | 'promote-private-events'
  | 'promote-interactive-catering'
  | 'promote-small-bites'
  | 'build-brand-awareness'
  | 'hiring'

export type FireovaCampaign = {
  id: FireovaCampaignId
  label: string
  description: string
  supportedEventTypes: string[]
  preferredContentPurposes: string[]
  preferredFormats: ('Reel' | 'Carousel' | 'Photo')[]
  keywords: string[]
}

export const LOCAL_ACTIVE_CAMPAIGN_KEY = 'fireova-marketing-hub-active-campaign-v1'

export const FIREOVA_CAMPAIGNS: FireovaCampaign[] = [
  {
    id: 'book-more-weddings',
    label: 'Book More Weddings',
    description: 'Prioritize wedding, couple, guest-experience, and interactive service moments.',
    supportedEventTypes: ['Wedding', 'Bridal Shower', 'Rehearsal Dinner', 'Interactive Catering'],
    preferredContentPurposes: ['Drive inquiries', 'Show the experience', 'Build trust', 'Social proof'],
    preferredFormats: ['Reel', 'Carousel'],
    keywords: ['wedding', 'bridal', 'rehearsal', 'couple', 'guest', 'interactive', 'first pizza'],
  },
  {
    id: 'book-corporate-catering',
    label: 'Book Corporate Catering',
    description: 'Show efficient catering, service quality, team service, and buffet-friendly moments.',
    supportedEventTypes: ['Corporate', 'Corporate Lunch', 'Promotions'],
    preferredContentPurposes: ['Drive inquiries', 'Build trust', 'Show craftsmanship'],
    preferredFormats: ['Reel', 'Photo'],
    keywords: ['corporate', 'lunch', 'team', 'buffet', 'service', 'office', 'staff'],
  },
  {
    id: 'promote-private-events',
    label: 'Promote Private Events',
    description: 'Feature birthdays, showers, graduations, and event experiences for private hosts.',
    supportedEventTypes: ['Birthday', 'Baby Shower', 'Bridal Shower', 'Graduation', 'Other'],
    preferredContentPurposes: ['Drive inquiries', 'Show the experience', 'Build trust'],
    preferredFormats: ['Reel', 'Carousel', 'Photo'],
    keywords: ['birthday', 'shower', 'graduation', 'private', 'party', 'guest'],
  },
  {
    id: 'promote-interactive-catering',
    label: 'Promote Interactive Catering',
    description: 'Highlight participation, fire, oven action, and guests engaging with the experience.',
    supportedEventTypes: ['Interactive Catering', 'Wedding', 'Corporate'],
    preferredContentPurposes: ['Show the experience', 'Build trust', 'Drive inquiries'],
    preferredFormats: ['Reel', 'Carousel'],
    keywords: ['interactive', 'guest', 'oven', 'fire', 'pizza', 'experience', 'participation'],
  },
  {
    id: 'promote-small-bites',
    label: 'Promote Small Bites',
    description: 'Use product detail, charcuterie, appetizer, and menu-detail content.',
    supportedEventTypes: ['Small Bites', 'Charcuterie', 'Appetizers', 'Other'],
    preferredContentPurposes: ['Make people hungry', 'Show craftsmanship', 'Drive inquiries'],
    preferredFormats: ['Carousel', 'Photo'],
    keywords: ['small bites', 'charcuterie', 'appetizer', 'appetizers', 'menu', 'detail', 'bite'],
  },
  {
    id: 'build-brand-awareness',
    label: 'Build Brand Awareness',
    description: 'Balance brand personality, food craft, behind-the-scenes, and memorable experience content.',
    supportedEventTypes: ['Wedding', 'Corporate', 'Promotions', 'Interactive Catering', 'Other'],
    preferredContentPurposes: ['Build the brand', 'Show craftsmanship', 'Show the experience'],
    preferredFormats: ['Reel', 'Photo', 'Carousel'],
    keywords: ['brand', 'fireova', 'team', 'behind the scenes', 'oven', 'fire', 'craft'],
  },
  {
    id: 'hiring',
    label: 'Hiring',
    description: 'Show the team, culture, pace, and the kind of service work Fireova does.',
    supportedEventTypes: ['Promotions', 'Corporate', 'Other'],
    preferredContentPurposes: ['Build trust', 'Build the brand'],
    preferredFormats: ['Reel', 'Photo'],
    keywords: ['hiring', 'team', 'staff', 'culture', 'behind the scenes', 'service'],
  },
]

export const DEFAULT_FIREOVA_CAMPAIGN_ID: FireovaCampaignId = 'book-more-weddings'

export function getDefaultFireovaCampaign() {
  return getFireovaCampaign(DEFAULT_FIREOVA_CAMPAIGN_ID)
}

export function getFireovaCampaign(id: string | null | undefined) {
  return FIREOVA_CAMPAIGNS.find((campaign) => campaign.id === id) ?? FIREOVA_CAMPAIGNS[0]
}

export function readActiveFireovaCampaign() {
  if (typeof window === 'undefined') return getDefaultFireovaCampaign()

  try {
    return getFireovaCampaign(window.localStorage.getItem(LOCAL_ACTIVE_CAMPAIGN_KEY))
  } catch {
    return getDefaultFireovaCampaign()
  }
}

export function writeActiveFireovaCampaign(id: FireovaCampaignId) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(LOCAL_ACTIVE_CAMPAIGN_KEY, id)
}
