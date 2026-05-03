import type { Metadata, Viewport } from 'next'
import { DM_Mono } from 'next/font/google'
import './globals.css'

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Foxgrove Road · House operations',
  description: 'Bookings, cleaning rotas and household ops for Foxgrove Road.',
  manifest: '/manifest.json',
  applicationName: 'Foxgrove',
  appleWebApp: {
    capable: true,
    title: 'Foxgrove',
    statusBarStyle: 'default',
  },
  // Tells search engines + iOS that this site is intended as an installable app
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

// `viewport-fit=cover` lets the app extend under iPhone notches when
// installed standalone. `themeColor` colours the iOS status bar to
// match the app cream background on light mode and gold on dark mode.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F3EF' },
    { media: '(prefers-color-scheme: dark)', color: '#1F1B17' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={dmMono.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
