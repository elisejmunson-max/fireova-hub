import type { Metadata } from 'next'
import './globals.css'
import PwaRegistration from './pwa-registration'

export const metadata: Metadata = {
  title: {
    default: 'Fireova Content',
    template: '%s | Fireova Content',
  },
  description: 'Content operating system for Fireova Pizza.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Fireova Content',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Fireova Content',
  },
  icons: {
    icon: [
      { url: '/icons/fireova-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/fireova-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/fireova-192.png', sizes: '192x192', type: 'image/png' }],
  },
}

export const viewport = {
  themeColor: '#ea580c',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  )
}
