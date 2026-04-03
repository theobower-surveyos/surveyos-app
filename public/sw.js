// SurveyOS Offline Service Worker (Pillar 3)
const CACHE_NAME = 'surveyos-cache-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activated');
});

self.addEventListener('fetch', (event) => {
  // Pass-through for now, actual caching logic is handled by IndexedDB in NetworkOps
  event.respondWith(fetch(event.request));
});