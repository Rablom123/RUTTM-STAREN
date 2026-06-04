const CACHE_NAME = "ruttplaneraren-v11";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.json",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap"
];

// Install Event
self.addEventListener("install", (e) => {
  self.skipWaiting(); // Force waiting service worker to active state immediately
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching App Shell");
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event
self.addEventListener("activate", (e) => {
  self.clients.claim(); // Immediately claim all open pages so they use the new SW without reloads
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Removing old cache", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Fetch Event
self.addEventListener("fetch", (e) => {
  // Only handle standard HTTP/S requests
  if (!e.request.url.startsWith("http")) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Fallback to network
      return fetch(e.request).then((networkResponse) => {
        // Cache external assets if they are fonts or Leaflet packages
        if (
          e.request.url.includes("unpkg.com") ||
          e.request.url.includes("googleapis") ||
          e.request.url.includes("gstatic")
        ) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      }).catch(() => {
        // Gracefully fail if offline and not cached
        console.log("[Service Worker] Fetch failed, resource not cached:", e.request.url);
      });
    })
  );
});
