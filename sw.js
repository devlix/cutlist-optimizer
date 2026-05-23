'use strict';

// Bump this version string whenever you deploy new code.
// The old cache is deleted automatically on activate.
const CACHE = 'cutlist-v3';

const PRECACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/csv-parser.js',
    './js/optimizer.js',
    './js/renderer.js',
    './js/pdf-export.js',
    './js/app.js',
    './favicon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png',
    './screenshots/desktop.png',
    './screenshots/mobile.png',
    './manifest.json',
    // jsPDF from CDN — cached so PDF export works offline
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

// ── Install: fill the cache ───────────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: delete stale caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch: cache-first, fall back to network ──────────────────────────────────
self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) return cached;

                return fetch(event.request)
                    .then(response => {
                        // Cache successful responses for future offline use
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE).then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    });
            })
    );
});
