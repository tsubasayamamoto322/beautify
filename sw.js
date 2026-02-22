// ============================================================
//  Beautify - Service Worker
//  Web Push 通知の受信・表示を担当する
// ============================================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// プッシュ通知を受信したら表示する
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: '⚠️ Beautify',
      body: event.data.text(),
    };
  }

  const options = {
    body: payload.body || 'コスメの残量が少なくなっています',
    icon: '/icons/icon-192.png',   // アプリアイコンがあれば
    badge: '/icons/badge-72.png',  // バッジアイコンがあれば
    tag: payload.tag || 'beautify-low-stock',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: payload.url || '/',
      itemId: payload.itemId || null,
    },
    actions: [
      { action: 'open', title: 'アプリを開く' },
      { action: 'dismiss', title: 'あとで' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || '⚠️ Beautify', options)
  );
});

// 通知タップ時の処理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // すでに開いているタブがあればそこにフォーカス
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しいタブで開く
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});