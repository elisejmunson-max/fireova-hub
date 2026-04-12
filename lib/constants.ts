export const PILLARS = [
  'Events',
  'Interactive',
  'Menu Feature',
  'On-Site Cooking',
  'Review',
  'Team',
  'Community',
  'Promotions',
] as const

export type Pillar = (typeof PILLARS)[number]

export const FORMATS = ['Reel', 'Carousel', 'Photo'] as const
export type Format = (typeof FORMATS)[number]

export const STATUSES = ['draft', 'scheduled', 'published'] as const
export type Status = (typeof STATUSES)[number]

export const HASHTAG_POOL = [
  '#WoodFiredPizza',
  '#DFWCatering',
  '#DFWEvents',
  '#PizzaCatering',
  '#WoodFiredOven',
  '#DFWWeddings',
  '#FireovaPizza',
]

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600',
  scheduled: 'bg-amber-100 text-amber-700',
  published: 'bg-emerald-100 text-emerald-700',
}

export const SUB_PILLARS: Record<string, string[]> = {
  'Events':          ['Weddings', 'Corporate', 'Private Parties', 'Showers'],
  'Interactive':     ['Build-Your-Own Pizza Bar', 'Team Engagement', 'Guest Participation'],
  'Menu Feature':    ['Pizza', 'Charcuterie', 'Small Bites', 'Hot Sides', 'Salads', 'Dessert'],
  // NOTE: Drop Off removed from top-level pillars — covered under Menu Feature > Charcuterie
  'On-Site Cooking': ['Live Cooking', 'Fresh Ingredients', 'Setup & Arrival', 'Guest Reactions', 'Oven'],
  'Review':          ['Wedding Reviews', 'Corporate Reviews', 'Guest Testimonials'],
  'Team':            ['Meet the Team', 'Behind the Scenes', 'Day in the Life'],
  'Community':       ['Venue Shoutout', 'Planner Collab', 'Photographer Collab', 'DFW Local Love'],
  'Promotions':      ['Booking Availability', 'Seasonal Push', 'Limited Dates'],
}

// Third level: items under specific sub-pillars (e.g. individual pizza varieties)
export const SUB_PILLAR_ITEMS: Record<string, string[]> = {
  'Pizza': [
    'Margherita',
    'Pepperoni',
    'Chicken & Roasted Garlic',
    'Meat Lovers',
    'Street Taco',
    'Pig Pen',
    'Tropical Debate',
    'Arugula Prosciutto',
    'Veggie',
    'Vegetarian',
    'Chicken Florentine',
    'Pesto Pizza',
    'Buffalo Chicken Pizza',
  ],
  'Charcuterie': [
    'Grazing Tables',
    'Charcuterie Cups',
    'Drop Offs',
  ],
  'Dessert': [
    'Chocolate Chip Cannolis',
    'Dessert Shooters',
  ],
  'Salads': [
    'Caesar Salad',
    'Farmers Market',
  ],
  'Hot Sides': [
    'Meatballs',
    'BBQ Chicken Wings',
  ],
  'Small Bites': [
    'Roasted Tomato Crostini',
    'Stuffed Mushrooms',
    'Prosciutto Wrapped Shrimp',
    'Arugula Prosciutto Crostini',
    'Caprese Skewers',
    'Smoked Salmon Bites',
    'Lamb Lollipops',
  ],
  'Oven': [
    'The Wood-Fired Oven',
    'The Fire',
    'Oven at Events',
  ],
}

export const PILLAR_COLORS: Record<string, string> = {
  Events: 'bg-violet-100 text-violet-700',
  Interactive: 'bg-blue-100 text-blue-700',
  'Menu Feature': 'bg-orange-100 text-orange-700',
  'On-Site Cooking': 'bg-red-100 text-red-700',
  Review: 'bg-emerald-100 text-emerald-700',
  Team: 'bg-pink-100 text-pink-700',
  Community: 'bg-cyan-100 text-cyan-700',

  Promotions: 'bg-rose-100 text-rose-700',
}

// ---------------------------------------------------------------------------
// Folder tree — derived from the 3-level pillar hierarchy
// ---------------------------------------------------------------------------

function toFolderSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export interface FolderDef {
  id: string
  name: string
  parent_id?: string | null
}

function buildFolderTree(): FolderDef[] {
  const folders: FolderDef[] = []
  for (const pillar of PILLARS as readonly string[]) {
    const pId = toFolderSlug(pillar)
    folders.push({ id: pId, name: pillar })
    for (const sub of (SUB_PILLARS[pillar] ?? []) as string[]) {
      const sId = `${pId}--${toFolderSlug(sub)}`
      folders.push({ id: sId, name: sub, parent_id: pId })
      for (const item of (SUB_PILLAR_ITEMS[sub] ?? []) as string[]) {
        folders.push({ id: `${sId}--${toFolderSlug(item)}`, name: item, parent_id: sId })
      }
    }
  }
  return folders
}

/** Full folder tree for the Media Bank — mirrors Pillars → Sub-pillars → Items */
export const PRESET_FOLDERS: FolderDef[] = buildFolderTree()

/** Pillar name → root folder ID  e.g. "Menu Feature" → "menu-feature" */
export const PILLAR_FOLDER_IDS: Record<string, string> = Object.fromEntries(
  (PILLARS as readonly string[]).map((p) => [p, toFolderSlug(p)])
)

/** Root folder ID → all descendant folder IDs (for inclusive pillar filtering) */
export const PILLAR_SUBFOLDER_IDS: Record<string, string[]> = Object.fromEntries(
  (PILLARS as readonly string[]).map((p) => {
    const pId = toFolderSlug(p)
    return [pId, PRESET_FOLDERS.filter((f) => f.id !== pId && f.id.startsWith(pId + '--')).map((f) => f.id)]
  })
)

export const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
  },
  {
    href: '/create',
    label: 'Create Post',
    icon: 'create',
  },
  {
    href: '/quick-post',
    label: 'Quick Post',
    icon: 'create',
  },
  {
    href: '/content-bank',
    label: 'Content Bank',
    icon: 'content',
  },
  {
    href: '/media-bank',
    label: 'Media Bank',
    icon: 'media',
  },
  {
    href: '/captions',
    label: 'Captions',
    icon: 'captions',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'settings',
  },
]
