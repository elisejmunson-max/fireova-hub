export type MockEventStatus = 'Needs Analysis' | 'Drafts Ready' | 'Approved'

export type MockMedia = {
  id: string
  type: 'photo' | 'video'
  src: string
  posterSrc?: string
  alt: string
}

export type MockEvent = {
  id: string
  name: string
  type: string
  date: string
  status: MockEventStatus
  draftCount: number
  cover: MockMedia
  media: MockMedia[]
}

export type MockPostDraft = {
  id: string
  tone: string
  caption: string
  hashtags: string[]
  media: MockMedia
}

const image = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=82`

export const mockEvents: MockEvent[] = [
  {
    id: 'morris-wedding',
    name: 'Morris Wedding',
    type: 'Wedding',
    date: 'June 22, 2026',
    status: 'Drafts Ready',
    draftCount: 5,
    cover: {
      id: 'morris-cover',
      type: 'photo',
      src: image('photo-1519741497674-611481863552'),
      alt: 'Wedding reception table with warm event lighting',
    },
    media: [
      {
        id: 'morris-oven',
        type: 'photo',
        src: image('photo-1513104890138-7c749659a591'),
        alt: 'Fresh wood-fired pizza close-up',
      },
      {
        id: 'morris-table',
        type: 'photo',
        src: image('photo-1528605248644-14dd04022da1'),
        alt: 'Guests gathered around a dinner table',
      },
      {
        id: 'morris-video',
        type: 'video',
        src: image('photo-1574071318508-1cdbab80d002'),
        alt: 'Pizza being served from the oven',
      },
      {
        id: 'morris-charcuterie',
        type: 'photo',
        src: image('photo-1543352634-a1c51d9f1fa7'),
        alt: 'Catering spread with appetizers',
      },
      {
        id: 'morris-fire',
        type: 'photo',
        src: image('photo-1542838132-92c53300491e'),
        alt: 'Fresh ingredients and colorful food styling',
      },
      {
        id: 'morris-slice',
        type: 'photo',
        src: image('photo-1565299624946-b28f40a0ae38'),
        alt: 'Pizza with melted cheese and toppings',
      },
    ],
  },
  {
    id: 'denton-rooftop-party',
    name: 'Denton Rooftop Party',
    type: 'Birthday',
    date: 'June 18, 2026',
    status: 'Needs Analysis',
    draftCount: 0,
    cover: {
      id: 'denton-cover',
      type: 'photo',
      src: image('photo-1511795409834-ef04bbd61622'),
      alt: 'Outdoor celebration with guests at sunset',
    },
    media: [
      {
        id: 'denton-pizza',
        type: 'photo',
        src: image('photo-1571407970349-bc81e7e96d47'),
        alt: 'Pizza on a table at a casual event',
      },
      {
        id: 'denton-party',
        type: 'video',
        src: image('photo-1530103862676-de8c9debad1d'),
        alt: 'Birthday party table with warm lights',
      },
      {
        id: 'denton-food',
        type: 'photo',
        src: image('photo-1540189549336-e6e99c3679fe'),
        alt: 'Colorful catered food spread',
      },
    ],
  },
  {
    id: 'oak-street-corporate',
    name: 'Oak Street Corporate Lunch',
    type: 'Corporate',
    date: 'June 12, 2026',
    status: 'Approved',
    draftCount: 5,
    cover: {
      id: 'oak-cover',
      type: 'photo',
      src: image('photo-1555244162-803834f70033'),
      alt: 'Catered lunch spread for a corporate event',
    },
    media: [
      {
        id: 'oak-lunch',
        type: 'photo',
        src: image('photo-1555939594-58d7cb561ad1'),
        alt: 'Catering food served family style',
      },
      {
        id: 'oak-pizza',
        type: 'photo',
        src: image('photo-1593560708920-61dd98c46a4e'),
        alt: 'Wood-fired pizza with fresh toppings',
      },
      {
        id: 'oak-video',
        type: 'video',
        src: image('photo-1565299507177-b0ac66763828'),
        alt: 'Pizza being prepared for service',
      },
    ],
  },
]

export const mockPostDrafts: MockPostDraft[] = [
  {
    id: 'draft-1',
    tone: 'Warm wedding moment',
    caption: 'A night full of happy people, fresh pizza, and that just-married glow. So glad we got to be part of this one.',
    hashtags: ['#FireovaPizza', '#DFWWeddings', '#WoodFiredPizza', '#DFWCatering'],
    media: mockEvents[0].media[0],
  },
  {
    id: 'draft-2',
    tone: 'Food close-up',
    caption: 'Fresh out of the oven and straight into the good part of the night. This is why we love cooking on-site.',
    hashtags: ['#WoodFiredPizza', '#PizzaCatering', '#DFWEvents', '#FireovaPizza'],
    media: mockEvents[0].media[2],
  },
  {
    id: 'draft-3',
    tone: 'Guest energy',
    caption: 'The line at the oven said everything. Warm plates, full tables, and everyone coming back for one more slice.',
    hashtags: ['#DFWCatering', '#DFWEvents', '#WoodFiredOven', '#FireovaPizza'],
    media: mockEvents[0].media[1],
  },
  {
    id: 'draft-4',
    tone: 'Behind the scenes',
    caption: 'A little fire, a little flour, and a whole lot of timing. The best events always have a rhythm to them.',
    hashtags: ['#WoodFiredOven', '#PizzaCatering', '#DFWCatering', '#FireovaPizza'],
    media: mockEvents[0].media[4],
  },
  {
    id: 'draft-5',
    tone: 'Simple recap',
    caption: 'Some favorite moments from the event. The food, the fire, the people, all in one really good night.',
    hashtags: ['#FireovaPizza', '#DFWEvents', '#WoodFiredPizza', '#DFWCatering'],
    media: mockEvents[0].media[5],
  },
]

export function getMockEvent(id: string) {
  return mockEvents.find((event) => event.id === id)
}
