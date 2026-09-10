/*
 * The service worker behind the installed chat.
 *
 * Its whole job is that opening the icon on the home screen shows the app
 * immediately, and shows something honest when there is no network — not
 * the browser's dinosaur, which inside a standalone window is the most
 * broken-looking thing a customer can be handed.
 *
 * What it deliberately does NOT do is cache conversations. A chat is one
 * customer's private thread on a device that may be shared, and a stale
 * copy of it sitting in a cache long after a link was revoked is a leak
 * with no upside — a thread from cache would be wrong the moment anyone
 * replied anyway. Only the shell is stored.
 */

const VERSION = 'wa-shell-v1';
const SHELL = ['/wa-pattern.svg', '/icon-192.png', '/icon-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Individually, so one missing file cannot fail the whole install
      // and leave the app with no worker at all.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Puts one response in the cache, and never throws.
 *
 * `Cache.put` rejects outright on a redirected response — which a
 * navigation very often is, since the host redirects to add or strip a
 * trailing slash — and an unhandled rejection inside a fetch handler is an
 * error in the worker's own console for something that was only ever an
 * optimisation.
 */
function store(request, response) {
  if (!response.ok || response.redirected || response.type === 'opaque') return null;

  // Cloned here, synchronously, before this function returns and the
  // response is handed to the page. Cloning after an await is too late:
  // respondWith has begun reading the body by then, and clone() throws on
  // a disturbed stream — which the catch below swallowed, so nothing was
  // ever cached at all.
  const copy = response.clone();
  return caches
    .open(VERSION)
    .then((cache) => cache.put(request, copy))
    .catch(() => {
      /* quota, a partial response, a redirect we did not catch — never fatal */
    });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch the API. Responses there are one customer's messages and
  // their media, and serving any of it from a cache would show a thread
  // that is out of date at best and no longer theirs to see at worst.
  if (url.pathname.startsWith('/api/')) return;

  // Build output is content-hashed, so a hit is always correct and a miss
  // is always a file this build has not asked for before.
  if (url.pathname.startsWith('/_next/static/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const write = store(request, res);
            if (write) event.waitUntil(write);
            return res;
          }),
      ),
    );
    return;
  }

  // The page itself: network first, because the thread behind it is live
  // and a cached page would open onto stale everything. The cached copy is
  // only ever a fallback for having no network at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // waitUntil, so the worker is not killed between returning the
          // response and finishing the write — which is exactly when a
          // navigation completes, and is why the offline page could still
          // be missing after visiting the chat a dozen times.
          const write = store(request, res);
          if (write) event.waitUntil(write);
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(request);
          return (
            hit ??
            new Response(
              '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
                '<title>Offline</title><style>body{margin:0;min-height:100dvh;display:flex;align-items:center;' +
                'justify-content:center;padding:2rem;text-align:center;background:#efe7de;color:#111b21;' +
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}' +
                'p{max-width:20rem;line-height:1.6;color:#667781}h1{font-size:19px;margin:0 0 .5rem}</style>' +
                '<div><h1>No connection</h1><p>Your chat will load as soon as you are back online. ' +
                'Anything you typed is still waiting to be sent.</p></div>',
              { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
            )
          );
        }),
    );
  }
});
