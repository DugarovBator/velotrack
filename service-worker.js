/* ==============================================
   VeloTrack PWA — Service Worker
   Стратегия: Cache First, затем Network
   ============================================== */

const CACHE_NAME = 'velotrack-v1.1.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ── INSTALL: Предзагрузка всех статических ресурсов ── */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing VeloTrack Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] App shell cached successfully');
        return self.skipWaiting(); // Активировать сразу, не ждать закрытия вкладок
      })
      .catch((err) => {
        console.error('[SW] Cache failed:', err);
      })
  );
});

/* ── ACTIVATE: Удаление старых кешей ── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new Service Worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim(); // Взять контроль над всеми открытыми вкладками
      })
  );
});

/* ── FETCH: Cache First → Network Fallback ── */
self.addEventListener('fetch', (event) => {
  // Пропускаем не-GET запросы и chrome-extension
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Ресурс есть в кеше — отдаём сразу
          return cachedResponse;
        }

        // Ресурса нет в кеше — идём в сеть
        return fetch(event.request.clone())
          .then((networkResponse) => {
            // Кешируем успешный ответ
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Оффлайн и нет в кеше — показываем заглушку для HTML
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
          });
      })
  );
});

/* ── SYNC: Фоновая синхронизация данных тренировок ── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-workouts') {
    console.log('[SW] Background sync: syncing workouts...');
    event.waitUntil(syncWorkouts());
  }
});

async function syncWorkouts() {
  // TODO: Реализовать синхронизацию с сервером
  // const pendingWorkouts = await getFromIndexedDB('pending_workouts');
  // await sendToServer(pendingWorkouts);
  console.log('[SW] Workouts sync placeholder — implement server sync here');
}

/* ── PUSH: Уведомления о тренировках ── */
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Время тренироваться! 🚴',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: './' },
    actions: [
      { action: 'start', title: '🚴 Старт тренировки' },
      { action: 'dismiss', title: 'Закрыть' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('VeloTrack', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'start') {
    event.waitUntil(clients.openWindow('./'));
  }
});
