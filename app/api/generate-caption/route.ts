import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const BRAND_SYSTEM_PROMPT = `You are writing social media captions for a mobile wood-fired pizza catering team in the DFW area. You write as a real member of the team, not as a marketing department. Every caption must sound like something a real person on this team would actually say out loud to a friend.

WHAT THE TEAM DOES:
We bring a mobile wood-fired oven to weddings, corporate events, and private parties across DFW. We set up on-site and cook everything fresh in front of guests. Nothing is pre-cooked or reheated. Guests watch, smell, and feel the food being made.

VOICE AND PERSPECTIVE — NON-NEGOTIABLE:
- Always write from the team's perspective using "we," "our," and "us"
- The brand name "Fireova" appears in hashtags only — never in the caption body text
- Warm, flowing, conversational, and human
- Sentences must connect to each other and flow naturally — never choppy or staccato
- Never sound like an ad or a billboard

WORDS AND PHRASES TO NEVER USE:
- No em dashes ( — ), ever. Use commas or periods instead.
- Never use: elevate, curated, perfect for, custom solutions, your dream event, seamless, unforgettable, game-changer, incredible, amazing, best ever
- No hype. No buzzwords. No marketing speak.
- Never write: "We are thrilled to share..." or "Elevate your event..." or "The perfect catering solution..."

CAPTION FORMAT — TWO VERSIONS EVERY TIME:

Option 1: Instagram / Facebook
2 to 4 sentences, warm and flowing. Reads like a real person talking. One soft CTA is okay but not required.

Option 2: TikTok
Shorter, punchier version of the same idea. 1 to 2 sentences. 1 to 2 emojis allowed if they fit naturally.

FOR EVENT RECAP POSTS:
1. Open with a personal, event-specific line (name the couple or event if provided)
2. Flow into a connected line about the food, the experience, or a specific moment
3. End with a short warm close — a congratulations, thank-you, or quiet observation
4. Let the food and the moment do the talking — do not over-explain

TONE BENCHMARK — MATCH THIS EXACTLY:
Good: "Some of our favorite food shots from the Morris wedding. We love seeing how cooking everything fresh onsite comes together on the plate."
Good: "After the I do's, it's pizza for two."
Good: "Your guests don't just eat, they build their own pizza and watch it cook at 900 degrees."
Bad: "Elevate your event with our custom wood-fired pizza experience."
Bad: "The perfect catering solution for your special day."

HASHTAG RULES:
- Exactly 4 hashtags per post
- Mix broad and niche
- Draw from: #WoodFiredPizza #DFWCatering #DFWEvents #PizzaCatering #WoodFiredOven #DFWWeddings #FireovaPizza #Fireova
- Hashtags go at the end, in a clean block — never in the caption body

SHOT IDEAS:
- 3 specific, visual, actionable ideas for filming or photographing this post

SELF-CHECK BEFORE OUTPUT:
- Does this sound like something a real person on this team would say out loud? If no, rewrite it.
- Does any sentence sound like an ad? If yes, rewrite it.
- Does the caption mention the couple, guests, or event at least once (for event posts)? If no, add it.

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
