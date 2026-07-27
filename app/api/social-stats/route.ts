import { NextResponse } from 'next/server'

// ─── Instagram ────────────────────────────────────────────────────────────────
// Requires: Instagram Business/Creator account connected to a Facebook Page
// Token:    Long-lived Page access token (never expires if refreshed)
// Get it:   developers.facebook.com → Graph API Explorer → generate Page token
// Set env:  INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID

async function fetchInstagramFollowers(): Promise<number | null> {
  const token     = process.env.INSTAGRAM_ACCESS_TOKEN
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  if (!token || !accountId) return null

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${accountId}?fields=followers_count&access_token=${token}`,
      { next: { revalidate: 3600 } } // cache for 1 hour
    )
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.followers_count === 'number' ? data.followers_count : null
  } catch {
    return null
  }
}

// ─── Facebook ─────────────────────────────────────────────────────────────────
// Requires: Facebook Page (not personal profile)
// Token:    Same long-lived Page access token as above
// Set env:  FACEBOOK_PAGE_ACCESS_TOKEN + FACEBOOK_PAGE_ID

async function fetchFacebookFollowers(): Promise<number | null> {
  const token  = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  const pageId = process.env.FACEBOOK_PAGE_ID
  if (!token || !pageId) return null

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}?fields=followers_count&access_token=${token}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.followers_count === 'number' ? data.followers_count : null
  } catch {
    return null
  }
}

export async function GET() {
  const [instagram, facebook] = await Promise.all([
    fetchInstagramFollowers(),
    fetchFacebookFollowers(),
  ])

  return NextResponse.json({
    instagram,  // null = not configured yet
    facebook,
    tiktok: null, // TikTok requires a separate OAuth app — use manual entry for now
  })
}
