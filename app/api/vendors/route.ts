import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const clean = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null
const normalize = (value: unknown) => clean(value)?.toLowerCase().replace(/\s+/g, ' ') ?? ''

async function session() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { db: supabase as any, user: error ? null : user }
}

async function list(db: any, userId: string) {
  const [{ data: vendors, error }, { data: categories, error: categoryError }] = await Promise.all([
    db.from('vendors').select('*').eq('user_id', userId).order('business_name'),
    db.from('vendor_categories').select('*').eq('user_id', userId).order('name'),
  ])
  if (error) throw error
  if (categoryError) throw categoryError
  const names = new Map((categories ?? []).map((category: any) => [category.id, category.name]))
  return {
    vendors: (vendors ?? []).map((vendor: any) => ({
      id: vendor.id,
      legacyId: vendor.legacy_id ?? undefined,
      category: names.get(vendor.category_id) ?? 'Other',
      businessName: vendor.business_name,
      instagramHandle: vendor.instagram_handle ?? undefined,
      website: vendor.website ?? undefined,
      email: vendor.email ?? undefined,
      phone: vendor.phone ?? undefined,
      contactName: vendor.contact_name ?? undefined,
      notes: vendor.notes ?? undefined,
      preferredVendor: vendor.preferred_vendor,
      createdAt: vendor.created_at,
      updatedAt: vendor.updated_at,
    })),
    categories: (categories ?? []).map((category: any) => category.name),
  }
}

async function categoryId(db: any, userId: string, nameValue: unknown) {
  const name = clean(nameValue) ?? 'Other'
  const { data, error } = await db.from('vendor_categories').upsert({
    user_id: userId,
    name,
    normalized_name: normalize(name),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,normalized_name' }).select('id').single()
  if (error) throw error
  return data.id
}

export async function GET() {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  try { return NextResponse.json(await list(db, user.id)) } catch (error) {
    console.error('[Fireova Phase 1] VENDOR_READ_FAILED', error)
    return NextResponse.json({ error: 'Vendors could not be loaded.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object') return NextResponse.json({ error: 'Invalid vendor data.' }, { status: 400 })
  try {
    if (payload.action === 'category') {
      await categoryId(db, user.id, payload.name)
      return NextResponse.json(await list(db, user.id))
    }
    if (payload.action === 'delete-category' || payload.action === 'reassign-category') {
      const sourceName = clean(payload.name)
      if (!sourceName || sourceName === 'Venue' || sourceName === 'Other') {
        return NextResponse.json({ error: 'That category is required by Fireova.' }, { status: 400 })
      }
      const { data: source } = await db.from('vendor_categories').select('id')
        .eq('user_id', user.id).eq('normalized_name', normalize(sourceName)).maybeSingle()
      if (!source) return NextResponse.json(await list(db, user.id))
      const { count } = await db.from('vendors').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('category_id', source.id)
      if (count && payload.action === 'delete-category') {
        return NextResponse.json({ error: `Move vendors out of ${sourceName} before removing it.` }, { status: 409 })
      }
      if (payload.action === 'reassign-category') {
        const replacementId = await categoryId(db, user.id, payload.replacement)
        const { error: vendorMoveError } = await db.from('vendors').update({
          category_id: replacementId,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id).eq('category_id', source.id)
        if (vendorMoveError) throw vendorMoveError
        const { error: linkMoveError } = await db.from('event_vendors').update({
          category_id: replacementId,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id).eq('category_id', source.id)
        if (linkMoveError) throw linkMoveError
      }
      const { error: deleteError } = await db.from('vendor_categories').delete()
        .eq('user_id', user.id).eq('id', source.id)
      if (deleteError) throw deleteError
      return NextResponse.json(await list(db, user.id))
    }
    const input = payload.vendor ?? payload
    const id = clean(input.id)
    const category = await categoryId(db, user.id, input.category)
    const row = {
      user_id: user.id,
      legacy_id: id && !UUID_PATTERN.test(id) ? id : clean(input.legacyId),
      category_id: category,
      business_name: clean(input.businessName) ?? 'Vendor',
      normalized_name: normalize(input.businessName),
      instagram_handle: clean(input.instagramHandle)?.replace(/^@/, '') ?? null,
      website: clean(input.website),
      email: clean(input.email),
      phone: clean(input.phone),
      contact_name: clean(input.contactName),
      notes: clean(input.notes),
      preferred_vendor: Boolean(input.preferredVendor),
      updated_at: new Date().toISOString(),
    }
    const query = id && UUID_PATTERN.test(id)
      ? db.from('vendors').update(row).eq('user_id', user.id).eq('id', id)
      : db.from('vendors').insert(row)
    const { error } = await query
    if (error) throw error
    return NextResponse.json(await list(db, user.id))
  } catch (error) {
    console.error('[Fireova Phase 1] VENDOR_WRITE_FAILED', error)
    return NextResponse.json({ error: 'The vendor could not be saved.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const { db, user } = await session()
  if (!user) return NextResponse.json({ error: 'Your session expired. Sign in again.' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid vendor.' }, { status: 400 })
  const { count } = await db.from('event_vendors').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('vendor_id', id)
  if (count) return NextResponse.json({ error: 'Remove this vendor from linked events before deleting it.' }, { status: 409 })
  const { error } = await db.from('vendors').delete().eq('user_id', user.id).eq('id', id)
  if (error) return NextResponse.json({ error: 'The vendor could not be deleted.' }, { status: 500 })
  return NextResponse.json(await list(db, user.id))
}
