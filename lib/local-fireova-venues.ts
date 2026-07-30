import type { LocalFireovaEvent } from '@/lib/local-fireova-events'
import { formatInstagramHandle, normalizeInstagramHandle, type FireovaVendor } from '@/lib/local-fireova-vendors'

export type SavedVenueOption = {
  id?: string
  name: string
  location?: string
  notes?: string
  instagram?: string
  vendorId?: string
}

export function getSavedVenueOptions(events: LocalFireovaEvent[], vendors: FireovaVendor[] = []) {
  const venues = new Map<string, SavedVenueOption>()

  events.forEach((event) => {
    const name = event.venueName?.trim()
    if (!name) return

    const key = normalizeVenueName(name)
    const current = venues.get(key)
    const instagram = formatInstagramHandle(event.venueInstagram)
    const location = current?.location ?? event.venueLocation?.trim()
    venues.set(key, {
      name: current?.name ?? name,
      ...(location ? { location } : {}),
      instagram: current?.instagram ?? instagram,
      ...((current?.vendorId ?? event.venueVendorId) ? { vendorId: current?.vendorId ?? event.venueVendorId } : {}),
    })
  })

  vendors
    .filter((vendor) => vendor.category === 'Venue')
    .forEach((vendor) => {
      const name = vendor.businessName.trim()
      if (!name) return

      const key = normalizeVenueName(name)
      const current = venues.get(key)
      venues.set(key, {
        name: current?.name ?? name,
        instagram: current?.instagram ?? formatInstagramHandle(vendor.instagramHandle),
        vendorId: current?.vendorId ?? vendor.id,
      })
    })

  return [...venues.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function searchSavedVenues(venues: SavedVenueOption[], query: string) {
  const normalizedQuery = query.trim().toLowerCase().replace(/^@/, '')
  if (!normalizedQuery) return venues

  return venues.filter((venue) =>
    normalizeVenueName(venue.name).includes(normalizedQuery) ||
    venue.location?.toLowerCase().includes(normalizedQuery) ||
    normalizeInstagramHandle(venue.instagram)?.includes(normalizedQuery)
  )
}

export function normalizeVenueName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}
