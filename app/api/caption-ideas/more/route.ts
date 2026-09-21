import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FIREOVA_VOICE_EXAMPLES, FIREOVA_VOICE_RULES } from '@/lib/fireova-voice'

const outputText = (data: any) => data?.output_text || data?.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === 'output_text')?.text || ''

function parseJson(value: string) {
  const clean = value.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean)
}

export async function POST(request: NextRequest) {
  try {
    const key = process.env.OPENAI_API_KEY
    if (!key) return Response.json({ error: 'AI is not configured.' }, { status: 500 })

    const supabase = createClient() as any
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const topic = String(body.topic || '').trim()
    const rejectedCaption = String(body.caption || '').trim()
    const rejectedMediaId = String(body.mediaId || '').trim()
    const { data, error } = await supabase.from('media_assets').select('id,storage_path,file_type,tags,ai_reason,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(150)
    if (error) throw error

    const words = topic.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2)
    const candidates = (data || [])
      .filter((asset: any) => asset.id !== rejectedMediaId && (asset.file_type?.startsWith('image/') || asset.file_type?.startsWith('video/')))
      .map((asset: any) => {
        const description = `${(asset.tags || []).join(' ')} ${asset.ai_reason || ''}`.toLowerCase()
        return { asset, score: words.reduce((total, word) => total + (description.includes(word) ? 1 : 0), 0) }
      })
      .sort((left: any, right: any) => right.score - left.score)
      .slice(0, 24)
    if (!candidates.length) return Response.json({ error: 'No different media is available yet.' }, { status: 400 })

    const catalog = candidates.map(({ asset }: any) => ({ id: asset.id, type: asset.file_type?.startsWith('video/') ? 'video' : 'photo', tags: asset.tags || [], reason: asset.ai_reason || '' }))
    const content: any[] = [{
      type: 'input_text',
      text: `The owner asked for a completely NEW post idea for the same requested topic. Replace BOTH the rejected concept/caption and its media. Do not lightly rewrite the old caption. Choose one different media item from the catalog that genuinely supports a distinct angle, then write the finished caption for that media.\n\nRequested topic: ${topic}\nRejected caption: ${rejectedCaption}\nRejected media ID (never select it): ${rejectedMediaId}\nMedia catalog: ${JSON.stringify(catalog)}\n\n${FIREOVA_VOICE_RULES}\nGood voice examples:\n${FIREOVA_VOICE_EXAMPLES.join('\n')}\n\nReturn JSON only: {"mediaId":"an exact ID from the catalog","caption":"one genuinely different finished caption"}`,
    }]
    for (const { asset } of candidates.filter(({ asset }: any) => asset.file_type?.startsWith('image/')).slice(0, 10)) {
      content.push({ type: 'input_text', text: `Media ID ${asset.id}:` })
      content.push({ type: 'input_image', image_url: supabase.storage.from('media').getPublicUrl(asset.storage_path).data.publicUrl, detail: 'low' })
    }

    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.6-sol', reasoning: { effort: 'medium' }, max_output_tokens: 900, input: [{ role: 'user', content }] }) })
    const responseData = await response.json()
    if (!response.ok) throw new Error(responseData?.error?.message || 'Could not make a new idea')
    const result = parseJson(outputText(responseData))
    const selected = candidates.find(({ asset }: any) => asset.id === String(result.mediaId || ''))?.asset
    if (!selected) throw new Error('Could not match the new idea to different media.')

    return Response.json({ ok: true, options: [{ caption: String(result.caption || '').trim(), mediaId: selected.id, mediaUrl: supabase.storage.from('media').getPublicUrl(selected.storage_path).data.publicUrl }] })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not make a new idea' }, { status: 500 })
  }
}
