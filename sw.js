const CACHE_NAME = 'otipb-v1';
// Файлы, которые будут жестко сохранены в память телефона
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  'https://cloudflare.com'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Запросы к Google API не кэшируем, их обрабатывает app.js отдельно
  if (e.request.url.includes('://google.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
