/* Service worker de Tribu : rend l'app disponible hors ligne et gère la mise à jour.
   - Chaque version (version.js) a son propre cache, préfixé par l'adresse du site
     (test et prod partagent le même domaine github.io : leurs caches ne se mélangent pas).
   - Une nouvelle version se télécharge en arrière-plan, puis prend la main toute seule.
   - Les appels à n8n (autre domaine) ne passent jamais par le cache. */
importScripts('version.js');

const PREFIX = 'tribu|' + self.registration.scope + '|';
const CACHE = PREFIX + self.TRIBU_VERSION;
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname) || !/github\.io$/.test(self.location.hostname);

const ASSETS = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/sync.js', 'js/qr.js', 'js/chat.js', 'js/notif.js', 'js/agenda.js', 'js/frigo.js', 'js/carte.js', 'js/jeux-data.js', 'js/jeux.js', 'js/profil.js', 'js/dragon.js', 'js/echecs.js', 'js/defis.js', 'dragon/vignette.jpg', 'dragon/vignette-oeuf.jpg', 'dragon/lettre.jpg', 'icons/badge-96.png', 'version.js',
  'manifest.webmanifest', 'manifest-test.webmanifest',
  'fonts/fredoka-latin-500-normal.woff2', 'fonts/fredoka-latin-600-normal.woff2',
  'fonts/nunito-latin-400-normal.woff2', 'fonts/nunito-latin-600-normal.woff2',
  'fonts/nunito-latin-700-normal.woff2', 'fonts/nunito-latin-800-normal.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'icons/test-icon.svg', 'icons/test-icon-192.png', 'icons/test-icon-512.png', 'icons/test-maskable-512.png', 'icons/test-apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => (k.startsWith(PREFIX) && k !== CACHE) || k.startsWith('tribu-tuiles|')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'version' && e.source) e.source.postMessage({ type: 'version', version: self.TRIBU_VERSION });
});

// Tuiles de la carte (OpenStreetMap) déjà vues : cache séparé, gardé d'une version à l'autre, limité à environ 1 500 tuiles.
// Pas de téléchargement à l'avance (interdit par le règlement d'OpenStreetMap) : seules les zones affichées sont gardées.
const TUILES = 'tribu-osm|' + self.registration.scope;
async function tuile(req) {
  const c = await caches.open(TUILES);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok) {
      c.put(req, r.clone());
      c.keys().then(k => { if (k.length > 1500) k.slice(0, k.length - 1500).forEach(x => c.delete(x)); });
    }
    return r;
  } catch (err) { return new Response('', { status: 504 }); }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'GET' && new URL(req.url).hostname === 'tile.openstreetmap.org') { e.respondWith(tuile(req)); return; }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Clips du dragon : chargés et gardés par la page elle-même (cache « tribu-dragon »), pas par le service worker.
  if (/\/dragon\/[^/]+\.mp4$/.test(new URL(req.url).pathname)) return;

  // Sur le PC (développement) : toujours le réseau d'abord, le cache seulement en secours.
  if (LOCAL) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // Sur le téléphone : le cache d'abord (instantané, hors ligne), le réseau en secours.
  e.respondWith(
    caches.open(CACHE).then(c =>
      c.match(req, { ignoreSearch: true }).then(hit => {
        if (hit) return hit;
        if (req.mode === 'navigate') return c.match('index.html').then(r => r || fetch(req));
        return fetch(req);
      })
    )
  );
});

/* Notifications (Web Push envoyées par n8n) — branchées dans une prochaine version. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // Tribu déjà ouverte et au premier plan : pas de notification, l'écran se met à jour tout seul.
    if (list.some(c => c.visibilityState === 'visible' && c.focused)) return;
    return self.registration.showNotification(d.title || 'Tribu', {
      body: d.body || '', icon: /\/tribu\/$/.test(self.registration.scope) ? 'icons/icon-192.png' : 'icons/test-icon-192.png', badge: 'icons/badge-96.png',
      tag: d.tag || 'tribu', renotify: true, vibrate: [80, 40, 80], data: { tab: d.tab || 'today' }
    });
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const tab = (e.notification.data && e.notification.data.tab) || 'today';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { c.postMessage({ type: 'open-tab', tab }); return c.focus(); }
    return self.clients.openWindow('./#' + tab);
  }));
});
