// Production build injects the version and complete public app shell.
const CACHE_NAME = 'eventgrid-__BUILD_VERSION__';
const BUILD_ASSETS = /* __BUILD_ASSETS__ */ [];
const PUBLIC_FILES = [
  '/index.html', '/manifest.webmanifest', '/barcamp-logo-white.svg',
  '/barcamp-logo-black.svg', '/barcamp-logo-nav.svg', '/barcamp-logo-nav-on-light.svg',
  '/pwa-192x192.png', '/pwa-512x512.png', '/maskable-icon-512x512.png',
  '/apple-touch-icon.png', '/favicon.svg',
];
const SHELL = [...PUBLIC_FILES, ...BUILD_ASSETS];
const APP_ROUTES = ['/', '/login', '/attendance', '/participants', '/import', '/sales',
  '/sponsors', '/inventory', '/editions', '/schedule', '/communications', '/settings',
  '/users', '/audit', '/activity'];
self.addEventListener('install', (event) => {
  // Fail atomically if any module is unavailable; keep the working version.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    SHELL.map((url) => new Request(url, { cache: 'reload', credentials: 'omit' }))
  )));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('eventgrid-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api') || request.headers.has('Authorization')) return;
  if (request.mode === 'navigate' && APP_ROUTES.includes(url.pathname)) {
    // Cache only the public shell, never authenticated page responses.
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) =>
      await cache.match('/index.html') || fetch(request)
    ));
    return;
  }
  // Explicit allowlist excludes personal uploads and all API responses.
  if (!url.search && SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) =>
      await cache.match(url.pathname) || fetch(request)
    ));
  }
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
