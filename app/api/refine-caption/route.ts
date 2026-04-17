import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const REFINE_SYSTEM_PROMPT = `You are refining a social media caption for Fireova, a mobile wood-fired pizza catering team in DFW.

BRAND VOICE IN ONE SENTENCE:
Warm, romantic-but-relaxed host voice. Talk like a friend planning someone's party. Center the couple and the guests. Weave in the wood-fired food as the cozy, grounding part of the night.

RULES — never break these:
- Always write from the team's perspective: "we," "our," "us"
- "Fireova" only appears in hashtags, never in the caption body
- Center the couple, the guests, or the moment — never center ourselves
- No em dashes ( — ), ever. Use commas or periods instead.
- Emojis are natural and welcome. Use 1-3 where they fit.
- No buzzwords: elevate, curated, seamless, perfect for, unforgettable, game-changer, incredible, amazing, best ever
- Never sound like an ad or a billboard
- Short plain language, warm and grounded, not flashy
- Keep it SHORT — 1 to 3 sentences, 4 max

Apply the instruction faithfully while keeping the voice intact. Return ONLY the revised caption text — no explanation, no quotes around it, no extra commentary.`

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not set.' },
      { status: 500 }
    )
  }

  const client = new Anthropic({ apiKey })

  const { caption, platform, instruction, approvedExamples } = await request.json() as {
    caption: string
    platform: string
    instruction: string
    approvedExamples?: string[]
  }

  if (!caption?.trim() || !instruction?.trim()) {
    return Response.json({ error: 'Caption and instruction are required.' }, { status: 400 })
  }

  // Build examples block if approved examples exist
  const examplesBlock = approvedExamples && approvedExamples.length > 0
    ? `\nAPPROVED CAPTION EXAMPLES — These are real captions that have already been approved. Match this exact voice and tone:\n${approvedExamples.slice(0, 5).map((e, i) => `${i + 1}. "${e}"`).join('\n')}\n`
    : ''

  const userMessage = `${examplesBlock}
Platform: ${platform}

Current caption:
"${caption}"

Instruction: ${instruction}

Rewrite the caption applying the instruction. Keep it in the Fireova voice. Return only the revised caption text.`

  let message
  try {
    message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system: REFINE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Anthropic API error'
    return Response.json({ error: msg }, { status: 502 })
  }

  const textBlock = message.content.find((b) => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
