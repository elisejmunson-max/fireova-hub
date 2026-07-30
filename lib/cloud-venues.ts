'use client'

import type { SavedVenueOption } from '@/lib/local-fireova-venues'

export type CreateCloudVenueInput = {
  name: string
  location: string
  notes: string
}

function isVenue(value: unknown): value is SavedVenueOption {
  if (!value || typeof value !== 'object') return false
  const venue = value as Partial<SavedVenueOption>
  return typeof venue.name === 'string' && Boolean(venue.name.trim())
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Venues could not be loaded.')
  return body
}

export async function loadCloudVenues() {
  const result = await readResponse(await fetch('/api/venues', { cache: 'no-store' }))
  return Array.isArray(result.venues) ? result.venues.filter(isVenue) : []
}

export async function createCloudVenue(input: CreateCloudVenueInput) {
  const result = await readResponse(await fetch('/api/venues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
  if (!isVenue(result.venue)) throw new Error('The cloud returned an invalid venue.')
  return result.venue
}
