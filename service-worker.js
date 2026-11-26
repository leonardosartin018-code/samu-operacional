const CACHE_NAME = 'samu-shell-20261126-29';
const SHELL = [
  './operator-theme.css', './operator-panels.js', './index.html', './styles.css', './offline.css', './app.js',
  './occurrence-time-editor.js', './shift-manual-lifecycle.js', './regional-whatsapp-import.js', './names-review.js', './professional-functions.js', './monthly-roster-match.js', './offline-store.js', './offline-query.js', './offline-schema.js',
  './offline-client.js', './offline-rpc.js', './offline-shell.js', './offline-ui.js',
  './regulation-import.js', './victim-destination-rules.js',
  './samu-report-download.js', './samu-report-structure.js', './rotation-weight-rules.js',
  './vendor/supabase-2.119.2.js', './vendor/jspdf-2.5.2.js',
  './vendor/jspdf-autotable-3.8.4.js', './vendor/html2canvas-1.4.1.js',
  './assets/bombeiros-logo.webp', './assets/samu-logo.webp'
];
const allowedPaths = new Set(SHELL.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL.map(path => new Request(path, {cache: 'reload'})));
    // O shell completo já está em cache. Ativar não recarrega as telas abertas
    // nem altera o IndexedDB com os dados e ações pendentes do operador.
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const indexUrl = new URL('./operator-theme.css', './operator-panels.js', './index.html', self.registration.scope).href;
  if (event.request.mode === 'navigate' && (url.pathname === scopePath || url.pathname === new URL(indexUrl).pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(indexUrl);
      if (cached) return cached;
      try { return await fetch(event.request, {signal: AbortSignal.timeout(3500)}); }
      catch { return new Response('Preparação offline incompleta. Reconecte para abrir o sistema.', {status: 503}); }
    })());
    return;
  }
  if (!allowedPaths.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, {ignoreSearch: true});
    return cached || fetch(event.request);
  })());
});
