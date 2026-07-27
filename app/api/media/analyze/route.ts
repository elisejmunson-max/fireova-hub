import OpenAI from 'openai'

export const runtime = 'nodejs'

const MEDIA_ANALYSIS_PROVIDER = 'openai'

const FIREOVA_CATEGORIES = [
  'Pizza',
  'Salads',
  'Charcuterie',
  'Small Bites',
  'Sides',
  'Desserts',
  'Cooking Process',
  'Oven & Fire',
  'Team',
  'Behind the Scenes',
  'Fireova Setup',
  'Brand',
  'Other',
] as const

const MEDIA_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'category', 'contentTheme', 'menuItems', 'tags', 'description', 'reasoning'],
  properties: {
    title: { type: 'string' },
    category: { type: 'string', enum: FIREOVA_CATEGORIES },
    contentTheme: { type: 'string' },
    menuItems: {
      type: 'array',
      items: { type: 'string' },
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
    description: { type: 'string' },
    reasoning: { type: 'string' },
  },
}

type MediaAnalysisMetadata = {
  title: string
  category: typeof FIREOVA_CATEGORIES[number]
  contentTheme: string
  menuItems: string[]
  tags: string[]
  description: string
  reasoning: string
}

export async function POST(request: Request) {
  const provider = process.env.MEDIA_ANALYSIS_PROVIDER?.trim().toLowerCase()

  if (provider !== MEDIA_ANALYSIS_PROVIDER) {
    return Response.json(
      { error: 'Media analysis is disabled. Set MEDIA_ANALYSIS_PROVIDER=openai to enable OpenAI image analysis.' },
      { status: 409 }
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.' },
      { status: 500 }
    )
  }

  const model = process.env.OPENAI_MEDIA_ANALYSIS_MODEL?.trim()
  if (!model) {
    return Response.json(
      { error: 'OPENAI_MEDIA_ANALYSIS_MODEL is not set. Set it to the current officially supported image-capable OpenAI model you want to use.' },
      { status: 500 }
    )
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return Response.json({ error: 'Upload an image file in the file form field.' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Media analysis currently supports photos only.' }, { status: 400 })
  }

  const imageDataUrl = await createImageDataUrl(file)
  const client = new OpenAI({ apiKey })

  try {
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: MEDIA_ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Analyze this uploaded Fireova Content Library photo. Original filename: ${file.name}`,
            },
            {
              type: 'input_image',
              image_url: imageDataUrl,
              detail: 'auto',
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'fireova_media_metadata',
          strict: true,
          schema: MEDIA_ANALYSIS_SCHEMA,
        },
      },
    })

    const metadata = parseMediaAnalysisMetadata(response.output_text)
    return Response.json(metadata)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI media analysis failed.'
    return Response.json({ error: message }, { status: 502 })
  }
}

async function createImageDataUrl(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer())
  return `data:${file.type};base64,${bytes.toString('base64')}`
}

function parseMediaAnalysisMetadata(value: string): MediaAnalysisMetadata {
  const parsed = JSON.parse(value) as Partial<MediaAnalysisMetadata>

  return {
    title: normalizeString(parsed.title),
    category: normalizeCategory(parsed.category),
    contentTheme: normalizeString(parsed.contentTheme),
    menuItems: normalizeStringArray(parsed.menuItems),
    tags: normalizeStringArray(parsed.tags),
    description: normalizeString(parsed.description),
    reasoning: normalizeString(parsed.reasoning),
  }
}

function normalizeCategory(value: unknown): MediaAnalysisMetadata['category'] {
  return FIREOVA_CATEGORIES.includes(value as MediaAnalysisMetadata['category'])
    ? value as MediaAnalysisMetadata['category']
    : 'Other'
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))
  )
}

const MEDIA_ANALYSIS_SYSTEM_PROMPT = `You analyze Fireova Content Library photos for a local-first marketing workflow.

Return only structured JSON that matches the schema. No markdown.

Fields:
- title: a human title for the photo.
- category: exactly one fixed Fireova category.
- contentTheme: what is happening in the image.
- menuItems: visually obvious menu items only.
- tags: useful searchable tags, including event context when visible or likely from clear visual context.
- description: one concise asset-library description.
- reasoning: one concise explanation of the visible evidence behind the metadata.

Fixed categories:
Pizza
Salads
Charcuterie
Small Bites
Sides
Desserts
Cooking Process
Oven & Fire
Team
Behind the Scenes
Fireova Setup
Brand
Other

Never use Wedding, Corporate, or Birthday as category. Those may be tags or event context only.

Content Theme describes what is happening. Examples include Pizza Cutting, Fresh from the Oven, Serving Guests, Team Portrait, Team in Action, Grazing Table Detail, Salami Rose, Buffet Line, Event Setup, and Behind the Scenes. Do not simply repeat the Category.

Generate human titles. Good titles: Wedding Pizza Cutting, Fireova Team Serving Guests, Wood Fired Margherita, Grazing Table Detail. Bad titles: IMG_2785, Photo, Pizza Media, Team Media.

Only suggest menu items when visually obvious.`
