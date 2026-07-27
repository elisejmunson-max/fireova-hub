'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  generateVendorCreditString,
  getVendorUsageSummary,
  migrateEmbeddedEventVendorsToDirectory,
  readLocalVendorById,
  updateLocalVendor,
  type FireovaVendor,
} from '@/lib/local-fireova-vendors'

export default function VendorDetailPage({ params }: { params: { id: string } }) {
  const [vendor, setVendor] = useState<FireovaVendor | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void fetch('/api/vendors', { cache: 'no-store' }).then(async (response) => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Vendor could not be loaded.')
      setVendor(result.vendors.find((item: FireovaVendor) => item.id === params.id) ?? null)
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Vendor could not be loaded.')
    }).finally(() => setLoaded(true))
  }, [params.id])

  const usage = useMemo(() => vendor ? getVendorUsageSummary(vendor.id) : null, [vendor])
  const creditPreview = useMemo(() => {
    if (!usage?.linkedEvents[0]) return ''
    return generateVendorCreditString(usage.linkedEvents[0])
  }, [usage])

  async function togglePreferred() {
    if (!vendor) return
    setError('')
    const response = await fetch('/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor: { ...vendor, preferredVendor: !vendor.preferredVendor } }),
    })
    const result = await response.json()
    if (!response.ok) {
      setError(result.error || 'The vendor could not be saved.')
      return
    }
    setVendor(result.vendors.find((item: FireovaVendor) => item.id === vendor.id) ?? vendor)
  }

  if (!vendor && loaded) {
    return (
      <div className="min-h-full bg-white px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-4xl rounded-[28px] bg-stone-50 px-6 py-12 text-center ring-1 ring-stone-200">
          <h1 className="text-2xl font-semibold text-stone-950">Vendor not found</h1>
          <Link href="/vendors" className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white">
            Back to Vendors
          </Link>
        </div>
      </div>
    )
  }

  if (!vendor || !usage) return <div className="min-h-full bg-white" />

  return (
    <div className="min-h-full bg-white pb-10">
      <div className="px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/vendors" className="text-sm font-semibold text-stone-500 hover:text-stone-950">
            Back to Vendors
          </Link>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-600">
                {vendor.category}
              </p>
              <h1 className="text-[34px] font-semibold leading-none text-stone-950 sm:text-5xl">{vendor.businessName}</h1>
              {vendor.contactName && <p className="mt-3 text-[15px] text-stone-500">{vendor.contactName}</p>}
            </div>
            <button
              type="button"
              onClick={togglePreferred}
              className="w-fit rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
            >
              {vendor.preferredVendor ? 'Unmark Preferred' : 'Mark Preferred'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <section className="grid gap-3 sm:grid-cols-3">
            <InfoTile label="Linked Events" value={usage.linkedEventCount.toString()} />
            <InfoTile label="Most Recent" value={usage.mostRecentEvent?.date ?? 'None'} />
            <InfoTile label="Preferred" value={vendor.preferredVendor ? 'Yes' : 'No'} />
          </section>

          <section className="rounded-[28px] bg-stone-50 p-4 ring-1 ring-stone-100 sm:p-5">
            <h2 className="text-[19px] font-semibold text-stone-950">Vendor Information</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {vendor.instagramHandle && <InfoTile label="Instagram" value={`@${vendor.instagramHandle}`} href={`https://instagram.com/${vendor.instagramHandle}`} />}
              {vendor.website && <InfoTile label="Website" value={vendor.website} href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} />}
              {vendor.email && <InfoTile label="Email" value={vendor.email} href={`mailto:${vendor.email}`} />}
              {vendor.phone && <InfoTile label="Phone" value={vendor.phone} href={`tel:${vendor.phone}`} />}
            </div>
            {vendor.notes && (
              <p className="mt-4 rounded-[20px] bg-white px-4 py-3 text-sm leading-6 text-stone-600 ring-1 ring-stone-100">
                {vendor.notes}
              </p>
            )}
          </section>

          {creditPreview && (
            <section className="rounded-[28px] bg-stone-50 p-4 ring-1 ring-stone-100 sm:p-5">
              <h2 className="text-[19px] font-semibold text-stone-950">Credit String Preview</h2>
              <pre className="mt-3 whitespace-pre-wrap rounded-[20px] bg-white px-4 py-3 text-sm leading-6 text-stone-700 ring-1 ring-stone-100">{creditPreview}</pre>
            </section>
          )}

          <section className="rounded-[28px] bg-stone-50 p-4 ring-1 ring-stone-100 sm:p-5">
            <h2 className="text-[19px] font-semibold text-stone-950">Linked Events</h2>
            {usage.linkedEvents.length === 0 ? (
              <p className="mt-3 rounded-[20px] bg-white px-4 py-6 text-center text-sm text-stone-500 ring-1 ring-stone-100">
                This vendor is not linked to an event yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {usage.linkedEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="flex items-center justify-between gap-4 rounded-[20px] bg-white px-4 py-3 ring-1 ring-stone-100 transition-colors hover:ring-stone-300"
                  >
                    <div>
                      <p className="font-semibold text-stone-950">{event.name}</p>
                      <p className="mt-1 text-xs font-medium text-stone-500">{event.type} / {event.date}</p>
                    </div>
                    <span className="rounded-full bg-stone-950 px-3 py-1.5 text-xs font-semibold text-white">Open</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function InfoTile({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="rounded-[20px] bg-white px-4 py-3 ring-1 ring-stone-100">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-stone-950">{value}</p>
    </div>
  )

  return href ? <a href={href} target="_blank" rel="noreferrer" className="block">{content}</a> : content
}
