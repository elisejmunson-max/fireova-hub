import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import CaptionsClient from './client'
import type { CaptionTemplate } from '@/lib/types'

export const metadata: Metadata = { title: 'Captions' }

export default async function CaptionsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('caption_templates')
    .select('*')
    .order('created_at', { ascending: false })

  const templates: CaptionTemplate[] = data ?? []

  return <CaptionsClient initialTemplates={templates} userId={user?.id ?? 'dev'} />
}
