import { NextRequest } from 'next/server'

async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  // Try Photon (komoot) first — better US street address support
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=5&lang=en`
    const res = await fetch(photonUrl, { headers: { 'User-Agent': 'FireovaHub/1.0' } })
    const data = await res.json()
    // Prefer results in the US
    const usResult = data.features?.find((f: { properties: { country?: string }; geometry: { coordinates: number[] } }) =>
      f.properties?.country === 'United States'
    ) ?? data.features?.[0]
    if (usResult) {
      const [lon, lat] = usResult.geometry.coordinates
      return { lat, lon }
    }
  } catch { /* fall through to Nominatim */ }

  // Fallback to Nominatim with address normalization
  const normalized = address
    .replace(/\bFM\s*(\d+)/gi, 'Farm to Market Road $1')
    .replace(/\bCR\s*(\d+)/gi, 'County Road $1')
    .replace(/\bDr\.\s/gi, 'Drive ')
    .replace(/\bSt\.\s/gi, 'Street ')
  const attempts = Array.from(new Set([normalized, address]))
  for (const q of attempts) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'FireovaHub/1.0 (catering@fireovapizza.com)', 'Accept-Language': 'en' },
      })
      const results = await res.json()
      if (results.length) return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) }
    } catch { /* try next */ }
  }
  return null
}

export async function POST(request: NextRequest) {
  const { from, to } = await request.json() as { from: string; to: string }

  if (!from?.trim() || !to?.trim()) {
    return Response.json({ error: 'Missing from or to address' }, { status: 400 })
  }

  const [fromCoords, toCoords] = await Promise.all([geocode(from), geocode(to)])

  if (!fromCoords) return Response.json({ error: `Could not find starting address: "${from}"` }, { status: 422 })
  if (!toCoords) return Response.json({ error: `Could not find event address: "${to}"` }, { status: 422 })

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromCoords.lon},${fromCoords.lat};${toCoords.lon},${toCoords.lat}?overview=false`
    const res = await fetch(osrmUrl)
    const data = await res.json()

    if (data.code !== 'Ok' || !data.routes?.length) {
      return Response.json({ error: 'Could not calculate route between these addresses' }, { status: 422 })
    }

    const seconds = data.routes[0].duration
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.round((seconds % 3600) / 60)
    const driveTime = hrs === 0 ? `${mins} min` : `${hrs} hr ${mins} min`

    return Response.json({ driveTime })
  } catch {
    return Response.json({ error: 'Routing service unavailable' }, { status: 502 })
  }
}
