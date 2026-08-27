import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SYSTEM = `You are the media quality reviewer for Fireova, a DFW mobile wood-fired pizza catering company. Decide whether a photo is strong enough for social media, worth keeping after a simple edit, or should be skipped.

Be selective. The goal is not to post bad content just to stay consistent.

Fireova visual priorities:
- Food must look fresh, appetizing, natural, and correctly colored. Yellow/green casts, stale-looking cheese, dried food, burnt-looking food, or unflattering food presentation are problems.
- People should look flattering and natural. Avoid awkward expressions, obvious blur, bad lighting, distracting body crops, or images where someone is caught in an unflattering moment.
- Strong content shows the experience: guests gathering, oven/fire, pizza process, team interaction, beautiful event details, grazing/charcuterie, or strong close-up food.
- Prefer a stronger version of the same moment over near-duplicates.
- An image that only needs normal color/exposure/crop correction is edit, not skip.
- Never recommend changing people's identity, body, decor, food items, or factual details. Edits should preserve the real event.

Return ONLY valid JSON:
{"status":"strong|edit|skip","score":0,"reason":"short specific reason","categories":["..."],"uses":["..."],"edit_suggestion":"specific edit or null"}
Score is 0-100. Categories should be useful labels such as Food, Pizza, People, Experience, Team, Wedding, Corporate, Charcuterie, Details, Process, Venue. Uses should be concrete, such as Feed photo, Carousel opener, Carousel detail, Reel cover, Story, B-roll.`

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'AI is not configured' }, { status: 500 })

  const { assetId } = await request.json() as { assetId?: string }
  if (!assetId) return Response.json({ error: 'assetId is required' }, { status: 400 })

  const { data: asset, error } = await supabase.from('media_assets').select('*').eq('id', assetId).eq('user_id', user.id).single()
  if (error || !asset) return Response.json({ error: 'Media not found' }, { status: 404 })
  if (!asset.file_type?.startsWith('image/')) return Response.json({ error: 'Image analysis only for now' }, { status: 400 })

  const imageUrl = supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 600, system: SYSTEM,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'url', url: imageUrl } },
      { type: 'text', text: `Review this real Fireova media asset. Filename: ${asset.filename}. Existing tags: ${(asset.tags || []).join(', ') || 'none'}.` },
    ] }],
  })
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') return Response.json({ error: 'No AI response' }, { status: 502 })
  let parsed: { status:string;score:number;reason:string;categories:string[];uses:string[];edit_suggestion:string|null }
  try { parsed = JSON.parse(text.text.replace(/^```json\s*|\s*```$/g, '')) } catch { return Response.json({ error: 'Invalid AI response' }, { status: 502 }) }
  const status = ['strong','edit','skip'].includes(parsed.status) ? parsed.status : 'skip'
  const patch = { ai_status: status, ai_quality_score: Math.max(0,Math.min(100,Number(parsed.score)||0)), ai_reason: String(parsed.reason||''), ai_categories: Array.isArray(parsed.categories)?parsed.categories.slice(0,8):[], ai_post_uses: Array.isArray(parsed.uses)?parsed.uses.slice(0,6):[], ai_edit_suggestion: parsed.edit_suggestion ? String(parsed.edit_suggestion) : null, ai_reviewed_at: new Date().toISOString() }
  const { error: saveError } = await supabase.from('media_assets').update(patch).eq('id', asset.id).eq('user_id', user.id)
  if (saveError) return Response.json({ error: saveError.message }, { status: 500 })
  return Response.json({ id: asset.id, ...patch })
}
