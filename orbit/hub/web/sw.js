// Lets the browser install Orbit as a desktop app. Everything still comes from the hub, live:
// there is nothing to cache, because Orbit is only useful while the hub is running.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
