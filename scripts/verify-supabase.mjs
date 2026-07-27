import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadLocalEnv() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator < 1) continue

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error(
    'Supabase is not configured. Copy .env.example to .env.local and add the project URL and publishable/anon key.'
  )
  process.exit(1)
}

let parsedUrl
try {
  parsedUrl = new URL(url)
} catch {
  console.error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL.')
  process.exit(1)
}

if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
  console.error('NEXT_PUBLIC_SUPABASE_URL must use HTTPS (except for localhost).')
  process.exit(1)
}

try {
  // Use a normal Data API route rather than the OpenAPI root. Supabase's new
  // sb_publishable_* keys are API keys, not JWTs, and must not be sent as a
  // bearer token before a user has authenticated.
  const response = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: anonKey },
  })

  if (response.status === 401) {
    console.error(`Supabase connection failed (HTTP ${response.status}). Check the URL and key.`)
    process.exit(1)
  }

  if (response.status === 404) {
    console.error(
      'Supabase connection verified, but the profiles table is missing. Apply supabase/schema.sql in the Supabase SQL Editor.'
    )
    process.exit(1)
  }

  if (!response.ok) {
    console.error(`Supabase connection reached the project but the schema check failed (HTTP ${response.status}).`)
    process.exit(1)
  }

  console.log('Supabase connection and Fireova schema verified.')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Supabase connection failed: ${message}`)
  process.exit(1)
}
