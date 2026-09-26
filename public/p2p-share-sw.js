const CACHE='p2p-share-notifications-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'show-notification') return;
  const title = data.title || 'P2P Share';
  const options = {
    body: data.body || '',
    tag: data.tag || 'p2p-share',
    renotify: true,
    data: data.data || {}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = self.registration.scope;
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      try {
        await client.focus();
        return;
      } catch {}
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(target);
    }
  })());
});
