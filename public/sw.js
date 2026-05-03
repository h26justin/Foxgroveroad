// Foxgrove Road — service worker
// Handles incoming push notifications and click-to-open behaviour.
// This file lives at /public/sw.js so it has root scope.

self.addEventListener('install', (event) => {
  // Take over immediately on first install instead of waiting for
  // existing tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Claim all open clients (tabs) so they start using this SW right away.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  // Server sends a JSON payload like:
  //   { title: "New task", body: "Clean the garden table", url: "/housekeeping" }
  let payload = { title: 'Foxgrove', body: '', url: '/' }
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch {
      payload = { ...payload, body: event.data.text() }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Foxgrove', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url || '/' },
      // Allow the OS to silence repeats / dedupe by tag if we set one
      tag: payload.tag || undefined,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // Try to focus an existing window and navigate it
      for (const client of allClients) {
        try {
          if (client.url.includes(self.location.origin)) {
            await client.focus()
            if ('navigate' in client) {
              return client.navigate(targetUrl)
            }
            return
          }
        } catch {
          // ignore unfocusable clients
        }
      }
      // Otherwise open a fresh window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })(),
  )
})
