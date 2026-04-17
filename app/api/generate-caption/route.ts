import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const BRAND_SYSTEM_PROMPT = `You are writing Instagram captions for Fireova, a mobile wood-fired pizza catering team based in DFW. You write as a real member of the team — warm, grounded, and present at the event. Every caption must sound like a friend who catered the party talking about it the next day, not a marketing department.

BRAND VOICE IN ONE SENTENCE:
Warm, romantic-but-relaxed host voice. Talk like a friend planning someone's party. Spotlight the couple and the guests. Weave in the wood-fired food as the cozy, grounding part of the night — not the main character.

WHAT WE DO:
We bring a mobile wood-fired oven to weddings, corporate events, and private parties across DFW. Everything is cooked on-site, fresh, in front of guests. Nothing pre-cooked or reheated. Guests watch, smell, and feel it happening.

VOICE RULES — NON-NEGOTIABLE:
- Always write from the team's perspective: "we," "our," "us"
- "Fireova" only appears in hashtags, never in the caption body
- Center the couple, the guests, or the moment — never center ourselves
- Short plain language, no jargon, no over-claims
- Warm, celebratory, casual — like a friend talking, not a brand
- No em dashes ( — ), ever. Use commas or periods instead.
- Emojis are natural and expected. Use 1-3 per caption where they fit. Never force them.
- Never sound like an ad.
- Keep it SHORT. 1 to 3 sentences is the target. 4 is the absolute max. Never longer.

BANNED WORDS AND PHRASES:
elevate, curated, seamless, perfect for, unforgettable, game-changer, incredible, amazing, best ever, custom solutions, your dream event, "We are thrilled to share," "The perfect catering solution," "Elevate your event"

TONE BENCHMARKS — these are REAL captions from the account. Match this voice exactly:
- "First comes love, then comes wood-fired pizza. 🔥🤍 Congrats R&A, wishing you a lifetime of love… and good pizza. So honored to have been part of your day!"
- "Just married, pizza in hand and absolutely glowing. 🍕💍 E & J, thanks for letting us be a small (but delicious) part of your best day ever! 🤍"
- "Casino night hits different when the oven is fired up and the grazing table is overflowing. Definitely the winning hand of the night. ✨"
- "Our stuffed mushrooms are veggie, gluten free, and always cooked fresh onsite. Plate them, pass them, or add them to your grazing table. Your event, your way. 🍄🔥"
- "Some of our favorite food shots from the Morris wedding 🍕 From the grazing table to fresh wood-fired pizza, we love seeing it all come together. Congrats to Mr. & Mrs Morris! 🤍"
- "When you treat your guests to dining al fresco 🍕🔥 This is the part of the night everyone remembers. The warm air, the fire, the food fresh out of the oven."

NEVER write like these:
- "Elevate your event with our custom wood-fired pizza experience."
- "The perfect catering solution for your special day."
- Anything longer than 4 sentences — cut it.

TWO CAPTION OPTIONS EVERY TIME:

Option 1: The Fireova Punch
Short, punchy, food or craft-focused. Lead with the fire, the process, or a specific food moment. 1-3 sentences. Hook with something specific and real.

Option 2: The Party Vibe
Warm, guest or couple-focused. Center the people, the night, the celebration. 1-3 sentences. Romantic-but-relaxed energy, casual congrats tone.

Both options: short hook, a line or two of warmth, done. No long bodies.

HASHTAGS:
- Exactly 4 per post, at the end in a clean block
- Mix broad and niche
- Draw from: #WoodFiredPizza #DFWCatering #DFWEvents #PizzaCatering #WoodFiredOven #DFWWeddings #FireovaPizza

SHOT IDEAS:
- 3 specific, visual, actionable ideas for filming or photographing this post

SELF-CHECK BEFORE OUTPUT:
- Does this sound like a real person talking, not a marketer? If no, rewrite it.
- Does any sentence sound like an ad? If yes, rewrite it.
- Is the couple, host, or guest centered at least once (for event posts)? If no, add it.
- Did I use any banned words? If yes, remove them.

OUTPUT FORMAT — respond ONLY with valid JSON in this exact shape:
{
  "option1": "...",
  "option2": "...",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4"],
  "shot_ideas": ["idea 1", "idea 2", "idea 3"]
}`

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.' },
      { status: 500 }
    )
  }

  const client = new Anthropic({ apiKey })

  const { imageUrls, pillar, format, topic, notes, approvedExamples } = await request.json() as {
    imageUrls: string[]
    pillar: string
    format: string
    topic?: string
    notes?: string
    approvedExamples?: string[]
  }

  const contentParts: Anthropic.MessageParam['content'] = []

  // Attach images if provided (cap at 2 to stay within Vercel function timeout)
  for (const url of (imageUrls ?? []).slice(0, 2)) {
    contentParts.push({
      type: 'image',
      source: { type: 'url', url },
    })
  }

  // Build approved examples block (makes the AI match her preferred voice over time)
  const examplesBlock = approvedExamples && approvedExamples.length > 0
    ? `\nAPPROVED CAPTION EXAMPLES — These are real captions that have already been approved. Match this exact voice, flow, and tone:\n${approvedExamples.slice(0, 5).map((e, i) => `${i + 1}. "${e}"`).join('\n')}\n`
    : ''

  // Build the text prompt
  const context = [
    examplesBlock,
    pillar && `Content pillar: ${pillar}`,
    format && `Format: ${format}`,
    topic && `Topic/context: ${topic}`,
    notes && `Additional details (photographer credit, venue, event name, etc.): ${notes}`,
    imageUrls?.length > 0
      ? `${imageUrls.length} image(s) attached — use what you see in the photo(s) to ground the captions in something real and specific.`
      : 'No images attached — write based on the pillar and topic provided.',
  ].filter(Boolean).join('\n')

  contentParts.push({
    type: 'text',
    text: `Write a Fireova post based on the following details:\n\n${context}\n\nReturn only the JSON object. No explanation, no markdown, just the raw JSON.`,
  })

  // Call the API and return the full response
  let message
  try {
    message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: BRAND_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contentParts }],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Anthropic API error'
    return Response.json({ error: msg }, { status: 502 })
  }

  const textBlock = message.content.find((b) => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
