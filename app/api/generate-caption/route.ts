import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fireovaBrandBrainPrompt } from '@/lib/fireova-brand-brain'

const CAPTION_INSTRUCTIONS = `You are writing Instagram captions for Fireova, a mobile wood-fired pizza catering team based in DFW. Write as a real member of the team, warm, grounded, and present at the event, never like a marketing department.

${fireovaBrandBrainPrompt()}

CAPTION-SPECIFIC RULES:
- Center the people, event, food, or real moment rather than making Fireova the hero.
- Keep it short. 1 to 3 sentences is the target. 4 is the absolute maximum.
- Use 1 to 3 natural emojis when they fit. Never force them.
- Avoid generic marketing language including: elevate, curated, seamless, perfect for, game-changer, custom solutions, your dream event, and similar AI-sounding phrases.
- Do not invent details that are not visible in the supplied media or provided context.
- On-site cooking, guest interaction, warmth, teamwork, and atmosphere are valuable when genuinely supported by the media/context.

VOICE BENCHMARKS FROM APPROVED FIREOVA CONTENT:
- "Wedding decor, but make it pizza themed. 🍕🤍"
- "Meet the salami rose. 🌹 One of our favorite details on every grazing table. Each one has its own personality, and we love the way they bring the whole table together."
- "The best part of what we do isn’t the pizza… it’s watching people gather around it."
- "We loved stepping into Zhuri's hot pink world. 💕🍕"

THREE CAPTION OPTIONS EVERY TIME:
Option 1: Short and punchy. Lead with a specific food, craft, fire, or process moment when supported.
Option 2: Warm and people-focused. Center guests, hosts, couple, team, or celebration.
Option 3: Vibe. Read the mood of the media and describe the real atmosphere without turning it into a product pitch.

HASHTAGS AND TAGGING:
- Return 4 relevant hashtags. Treat hashtags as optional publishing metadata, not caption filler.
- Prefer useful DFW/event/category hashtags over generic spammy tags.
- Vendor/venue handles should come from known event data. Never invent a handle.

SHOT IDEAS:
- Return 3 specific visual ideas only when useful for future capture.

SELF-CHECK:
- Does this sound like a real Fireova team member?
- Is it warm, humble, specific, and easy to read?
- Did you say pizza, never pie?
- Did you avoid em dashes?
- Does it feel human rather than AI-generated?
- Is every factual detail grounded in the media/context?

OUTPUT FORMAT: respond ONLY with valid JSON in this exact shape:
{
  "option1": "...",
  "option2": "...",
  "option3": "...",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4"],
  "shot_ideas": ["idea 1", "idea 2", "idea 3"]
}`

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey })
  const { imageUrls, videoFrames, pillar, format, topic, notes } = await request.json() as {
    imageUrls: string[]
    videoFrames?: string[]
    pillar: string
    format: string
    topic?: string
    notes?: string
  }

  let approvedExamples: string[] = []
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('approved_captions').select('caption').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8)
      if (data) approvedExamples = data.map((r: { caption: string }) => r.caption)
    }
  } catch {}

  const contentParts: Anthropic.MessageParam['content'] = []
  for (const url of (imageUrls ?? []).slice(0, 2)) {
    contentParts.push({ type: 'image', source: { type: 'url', url } })
  }
  for (const frame of (videoFrames ?? []).slice(0, 6)) {
    contentParts.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame } })
  }

  const hasVideo = (videoFrames ?? []).length > 0
  const examplesBlock = approvedExamples.length > 0
    ? `\nYOUR APPROVED CAPTIONS: These are captions the user already approved. Treat them as high-value evidence of the real voice.\n${approvedExamples.map((e, i) => `${i + 1}. "${e}"`).join('\n')}\n`
    : ''
  const videoOnly = hasVideo && !pillar && !topic && !notes

  const mediaDescription = (() => {
    if ((imageUrls?.length ?? 0) > 0 && hasVideo) return `${imageUrls.length} photo(s) and video frames are attached. Ground the captions in real, visible moments.`
    if (hasVideo && videoOnly) return 'Sampled frames from the reel are attached. Base the captions entirely on what is actually visible. Do not invent details.'
    if (hasVideo) return 'Sampled frames from the reel are attached. Use visible moments to make the writing specific.'
    if (imageUrls?.length > 0) return `${imageUrls.length} image(s) are attached. Ground the captions in something real and visible.`
    return 'No media is attached. Use only the supplied pillar/topic/context.'
  })()

  const context = [
    examplesBlock,
    videoOnly ? 'Determine the content, mood, and subject from the video frames only.' : pillar && `Content pillar: ${pillar}`,
    format && `Format: ${format}`,
    !videoOnly && topic && `Topic/context: ${topic}`,
    !videoOnly && notes && `User notes: "${notes}"`,
    mediaDescription,
  ].filter(Boolean).join('\n')

  contentParts.push({ type: 'text', text: `Write a Fireova post based on these details:\n\n${context}\n\nReturn only the JSON object.` })

  let message
  try {
    message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: CAPTION_INSTRUCTIONS,
      messages: [{ role: 'user', content: contentParts }],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Anthropic API error'
    return Response.json({ error: msg }, { status: 502 })
  }

  const textBlock = message.content.find((b) => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
