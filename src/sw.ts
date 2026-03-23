/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json() as {
    title: string
    body: string
    url?: string
    icon?: string
  }

  const title = data.title ?? 'Soccer Scheduler'
  const options: NotificationOptions = {
    body: data.body,
    icon: data.icon ?? '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: data.url ?? '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url: string = (event.notification.data?.url as string) ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const targetPath = url.startsWith('http') ? new URL(url).pathname : url
        for (const client of clientList) {
          try {
            const clientPath = new URL(client.url).pathname
            if (clientPath === targetPath && 'focus' in client) {
              return client.focus()
            }
          } catch {
            // ignore parse errors
          }
        }
        return self.clients.openWindow(url)
      })
  )
})
