import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fireova Content',
    short_name: 'Fireova Content',
    description: 'Fireova Pizza marketing, events, and media workspace.',
    start_url: '/events',
    scope: '/',
    display: 'standalone',
    background_color: '#0c0a09',
    theme_color: '#ea580c',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/fireova-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/fireova-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/fireova-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
