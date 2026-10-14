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

const VERSION = 'wa-shell-v2';
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

/* ──────────────────────────────────────────────────────────────────────
 * Push
 *
 * These handlers are deliberately written against the raw Web Push and
 * Notification APIs rather than importing Firebase's own service-worker
 * SDK from a CDN. FCM's web delivery IS standard Web Push — the payload
 * arrives here as JSON either way — so the SDK would add a cross-origin
 * importScripts, a second copy of the library, and a hard dependency on
 * gstatic being reachable, to do what the twenty lines below already do.
 *
 * The page still uses the Firebase SDK to OBTAIN the token: that part is
 * genuinely Firebase-specific and not reimplementable.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Where to send a tap when no tab is open.
 *
 * The server cannot supply it. A chat link's token is stored only as a
 * hash — deliberately, so a database dump is not a set of working keys to
 * every customer conversation — so the backend genuinely cannot rebuild
 * the URL to put in the notification. The browser knows it, though, so the
 * page hands it over on load and it is kept here, in this origin's own
 * cache, which is where the token already lives anyway.
 */
const CHAT_URL_KEY = '/__chat-url';

function rememberChatUrl(url) {
  return caches
    .open(VERSION)
    .then((cache) => cache.put(CHAT_URL_KEY, new Response(url)))
    .catch(() => {});
}

function readChatUrl() {
  return caches
    .match(CHAT_URL_KEY)
    .then((hit) => (hit ? hit.text() : null))
    .catch(() => null);
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'chat-url' && typeof event.data.url === 'string') {
    event.waitUntil(rememberChatUrl(event.data.url));
  }
});

/** Any tab of this chat that the customer can actually see right now. */
async function visibleChatClient() {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return all.find((c) => c.visibilityState === 'visible' && c.url.includes('/c/')) ?? null;
}

self.addEventListener('push', (event) => {
  // Every push MUST end in a notification. A push event that shows nothing
  // makes Chrome display its own "This site has been updated in the
  // background" instead, and repeatedly doing so is grounds for the
  // browser revoking push permission altogether.
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        /* not JSON — fall through to the generic notification below */
      }

      const notification = payload.notification || {};
      const data = payload.data || {};
      const isCall = data.type === 'call';

      // The chat is open and on screen: the message is already there, and
      // a notification for something the customer is looking at is noise.
      // A ring is the exception — the call UI needs the tab's attention
      // even when the tab has it.
      if (!isCall && (await visibleChatClient())) return;

      const link = (payload.fcmOptions && payload.fcmOptions.link) || data.link || (await readChatUrl());

      await self.registration.showNotification(notification.title || 'New message', {
        body: notification.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // Replaces rather than stacks, so a burst of replies is one entry.
        // A ring gets its own tag even when the server did not send one:
        // sharing a tag with the message notification would let an
        // incoming call silently replace an unread reply, or be replaced
        // by one — either way the customer loses the thing that mattered.
        tag: notification.tag || (isCall ? `${data.conversationId}:call` : data.conversationId) || 'chat',
        renotify: true,
        requireInteraction: isCall,
        // A ring should be felt; a message should not buzz a pocket at 2am
        // any harder than the browser's default.
        vibrate: isCall ? [220, 120, 220, 120, 220] : [90],
        data: { ...data, link },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus a tab already on this chat rather than opening a second one.
      // Two tabs of the same conversation both hold a socket, both ring,
      // and both have to be silenced by hand.
      const existing = all.find((c) => c.url.includes('/c/'));
      if (existing) {
        await existing.focus();
        return;
      }
      if (link) await self.clients.openWindow(link);
    })(),
  );
});
