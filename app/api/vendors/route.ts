import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function normalizeName(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : ''
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function session() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { db: supabase as any, user: error ? null : user }
}

async function ensureCategory(db: any, userId: string, categoryName: unknown) {
  const name = clean(categoryName) ?? 'Other'
  const normalized = normalizeName(name)
  const { data, error } = await db.from('vendor_categories')
    .upsert({
      user_id: userId,
      name,
      normalized_name: normalized,
      is_system: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,normalized_name' })
    .select('id,name')
    .single()
  if (error) throw error
  return data
}

async function loadVendors(db: any, userId: string) {
  const { data: rows, error } = await db.from('vendors')
    .select('id,category_id,business_name,instagram_handle,website,email,phone,contact_name,notes,preferred_vendor,created_at,updated_at')
    .eq('user_id', userId)
    .order('business_name', { ascending: true })
  if (error) throw error

  const categoryIds = Array.from(new Set((rows ?? []).map((row: any) => row.category_id).filter(Boolean)))
  let categories: any[] = []
  if (categoryIds.length) {
    const result = await db.from('vendor_categories').select('id,name').eq('user_id', userId).in('id', categoryIds)
    if (result.error) throw result.error
    categories = result.data ?? []
  }
  const categoryMap = new Map(categories.map((category: any) => [category.id, category.name]))

  return (rows ?? []).map((row: any) => ({
    id: row.id,
    category: categoryMap.get(row.category_id) ?? 'Other',
    businessName: row.business_name ?? '',
    instagramHandle: row.instagram_handle ?? '',
    website: row.website ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    contactName: row.contact_name ?? '',
    notes: row.notes ?? '',
    preferredVendor: Boolean(row.preferred_vendor),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }))
}

export async function GET() {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  try {
    return NextResponse.json({ vendors: await loadVendors(db, user.id) })
  } catch (error) {
    console.error('[Fireova Vendors] LOAD_FAILED', error)
    return NextResponse.json({ error: 'Vendors could not be loaded.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const incoming = payload?.vendor
  if (!incoming || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'Vendor information is required.' }, { status: 400 })
  }

  const businessName = clean(incoming.businessName) ?? clean(incoming.instagramHandle)
  const instagram = clean(incoming.instagramHandle)?.replace(/^@/, '') ?? null
  if (!businessName) return NextResponse.json({ error: 'Vendor name or Instagram is required.' }, { status: 400 })

  try {
    const category = await ensureCategory(db, user.id, incoming.category)
    const normalizedBusinessName = normalizeName(businessName)

    let existing: any = null
    if (instagram) {
      const result = await db.from('vendors').select('id').eq('user_id', user.id).eq('instagram_handle', instagram).maybeSingle()
      if (result.error) throw result.error
      existing = result.data
    }
    if (!existing) {
      const result = await db.from('vendors').select('id').eq('user_id', user.id).eq('normalized_name', normalizedBusinessName).maybeSingle()
      if (result.error) throw result.error
      existing = result.data
    }

    const row = {
      user_id: user.id,
      category_id: category.id,
      business_name: businessName,
      normalized_name: normalizedBusinessName,
      instagram_handle: instagram,
      notes: clean(incoming.notes),
      preferred_vendor: Boolean(incoming.preferredVendor),
      updated_at: new Date().toISOString(),
    }

    if (existing?.id) {
      const { error } = await db.from('vendors').update(row).eq('user_id', user.id).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await db.from('vendors').insert(row)
      if (error) throw error
    }

    const vendors = await loadVendors(db, user.id)
    return NextResponse.json({ vendors })
  } catch (error) {
    console.error('[Fireova Vendors] SAVE_FAILED', error)
    return NextResponse.json({ error: 'The vendor could not be saved.' }, { status: 500 })
  }
}
