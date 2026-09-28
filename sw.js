// 서비스 워커: 앱 셸 사전 캐시 + cache-first
// 파일을 수정해 배포할 때마다 CACHE_VERSION을 올려야 사용자 기기에 새 버전이 전달됩니다.
const CACHE_VERSION = 'v1.1.0';
const CACHE = `holdem-log-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/calendar.js',
  './js/cards.js',
  './js/charts.js',
  './js/db.js',
  './js/export.js',
  './js/markdown.js',
  './js/money.js',
  './js/store.js',
  './js/ui.js',
  './js/utils.js',
  './js/version.js',
  './js/views/common.js',
  './js/views/hand-form.js',
  './js/views/hands.js',
  './js/views/home.js',
  './js/views/session-detail.js',
  './js/views/session-form.js',
  './js/views/sessions.js',
  './js/views/settings.js',
  './js/views/sheets.js',
  './js/views/stats.js',
  './js/views/wallet.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('holdem-log-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req)));
});
