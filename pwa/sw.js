/* Service worker da PWA: guarda só o "casco" (index, ícones, manifest). O app do Apps Script é sempre buscado online.
 * Ao publicar mudanças na PWA, aumente VERSION (e a "version" do package.json: um teste exige que sejam iguais). */
const VERSION = '1.3.0';
const CACHE = 'dosim-shell-' + VERSION;
const ASSETS = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'offline.html',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-16.png', 'icons/favicon.ico'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('dosim-shell-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;              // script.google.com / fontes: nunca interceptar

  if (req.mode === 'navigate') {                                // páginas: rede primeiro, casco em cache se offline
    e.respondWith(fetch(req).catch(() => caches.match('index.html').then(r => r || caches.match('offline.html'))));
    return;
  }
  if (url.pathname.endsWith('/config.js')) {                    // config: rede primeiro (mudança de link vale na hora)
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {   // demais arquivos: cache + atualização em segundo plano
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
