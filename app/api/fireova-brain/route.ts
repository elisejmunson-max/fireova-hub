import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STUFFED_MUSHROOM_FACTS = [
  'Easy grab-and-go small bite',
  'Gluten-free',
  'Vegetarian',
  'Can be passed',
  'Cooked onsite',
]

async function currentUser() {
  const supabase = createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

function normalizeFacts(topic: string, facts: string[]) {
  const legacy = STUFFED_MUSHROOM_FACTS.join(' ').toLowerCase()
  if (topic.trim().toLowerCase() === 'stuffed mushrooms' && facts.some((fact) => fact.trim().toLowerCase() === legacy)) {
    return [...new Set(facts.flatMap((fact) => fact.trim().toLowerCase() === legacy ? STUFFED_MUSHROOM_FACTS : [fact]))]
  }
  return facts
}

function factsFromInput(value: string) {
  return value.split(/\n|;|•/).map((fact) => fact.trim()).filter(Boolean)
}

export async function GET() {
  try {
    const { supabase, user } = await currentUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { data, error } = await supabase.from('fireova_brain').select('id,topic,facts,updated_at').eq('user_id', user.id).order('topic')
    if (error) throw error

    const topics = await Promise.all((data || []).map(async (row: any) => {
      const facts = normalizeFacts(String(row.topic || ''), Array.isArray(row.facts) ? row.facts : [])
      if (JSON.stringify(facts) !== JSON.stringify(row.facts || [])) {
        await supabase.from('fireova_brain').update({ facts, updated_at: new Date().toISOString() }).eq('id', row.id).eq('user_id', user.id)
      }
      return { ...row, facts }
    }))
    return Response.json({ ok: true, topics })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not load Brain' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await currentUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const topic = String(body.topic || '').trim()
    const newFacts = factsFromInput(String(body.fact || ''))
    if (!topic || !newFacts.length) return Response.json({ error: 'Item and detail are required' }, { status: 400 })
    const { data: row, error: findError } = await supabase.from('fireova_brain').select('id,facts').eq('user_id', user.id).ilike('topic', topic).maybeSingle()
    if (findError) throw findError
    const facts = [...new Set([...(row?.facts || []), ...newFacts])]
    const query = row?.id
      ? supabase.from('fireova_brain').update({ facts, updated_at: new Date().toISOString() }).eq('id', row.id).eq('user_id', user.id)
      : supabase.from('fireova_brain').insert({ user_id: user.id, topic, facts })
    const { error } = await query
    if (error) throw error
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save Brain detail' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await currentUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const id = String(body.id || '')
    const fact = String(body.fact || '')
    const { data, error: findError } = await supabase.from('fireova_brain').select('facts').eq('user_id', user.id).eq('id', id).single()
    if (findError) throw findError
    const facts = (data?.facts || []).filter((item: string) => item !== fact)
    const { error } = facts.length
      ? await supabase.from('fireova_brain').update({ facts, updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('id', id)
      : await supabase.from('fireova_brain').delete().eq('user_id', user.id).eq('id', id)
    if (error) throw error
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not remove Brain detail' }, { status: 500 })
  }
}
