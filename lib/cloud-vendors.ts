'use client'

import { normalizeInstagramHandle, type FireovaVendor } from '@/lib/local-fireova-vendors'
import type { LocalEventVendorCategory } from '@/lib/local-fireova-events'

export type CreateCloudVendorInput = {
  category: LocalEventVendorCategory
  businessName: string
  instagramHandle: string
  notes: string
}

function isVendor(value: unknown): value is FireovaVendor {
  if (!value || typeof value !== 'object') return false
  const vendor = value as Partial<FireovaVendor>
  return typeof vendor.id === 'string'
    && typeof vendor.category === 'string'
    && typeof vendor.businessName === 'string'
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Vendors could not be loaded.')
  return body
}

function readVendors(result: unknown) {
  if (!result || typeof result !== 'object') return []
  const vendors = (result as { vendors?: unknown }).vendors
  return Array.isArray(vendors) ? vendors.filter(isVendor) : []
}

export async function loadCloudVendors() {
  return readVendors(await readResponse(await fetch('/api/vendors', { cache: 'no-store' })))
}

export async function createCloudVendor(input: CreateCloudVendorInput) {
  const result = await readResponse(await fetch('/api/vendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vendor: {
        ...input,
        preferredVendor: false,
      },
    }),
  }))
  const vendors = readVendors(result)
  const normalizedHandle = normalizeInstagramHandle(input.instagramHandle)
  const created = vendors.find((vendor) =>
    normalizeInstagramHandle(vendor.instagramHandle) === normalizedHandle
  )
  if (!created) throw new Error('The cloud returned an invalid vendor.')
  return { vendor: created, vendors }
}
