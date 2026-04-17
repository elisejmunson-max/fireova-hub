import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Manually load .env.local so non-NEXT_PUBLIC vars are available server-side
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envLocal = readFileSync(resolve(__dirname, '.env.local'), 'utf8')
  for (const line of envLocal.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Keep Supabase server packages in Node.js runtime only.
    // @supabase/ssr pulls in ramda + @supabase/realtime-js/phoenix which cause
    // webpack to hang indefinitely when bundled for the browser or edge runtime.
    serverComponentsExternalPackages: ['@supabase/ssr', '@supabase/supabase-js'],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
