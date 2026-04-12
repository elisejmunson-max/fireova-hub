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
