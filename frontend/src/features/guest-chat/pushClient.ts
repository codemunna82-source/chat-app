/**
 * Web Push for the chat window, via Firebase Cloud Messaging.
 *
 * Only the token comes from Firebase. Once the browser has one, the server
 * sends through FCM's HTTP API and the message arrives at our own service
 * worker as an ordinary Web Push event — so the Firebase SDK is loaded on
 * the page and nowhere else, and never inside the worker.
 *
 * Every function here is safe to call anywhere. On a browser with no push
 * support, in a build with no Firebase config, or behind a refused
 * permission, they resolve to a state rather than throwing: notifications
 * are the one feature whose absence must never take the chat down with it.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/** Whether this build was given enough to talk to FCM at all. */
export function pushConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.messagingSenderId && config.appId && vapidKey);
}

export type PushSupport =
  /** Push works here and can be asked for. */
  | 'available'
  /** Already granted; nothing to ask. */
  | 'granted'
  /** The customer said no. Only their browser settings can undo that. */
  | 'denied'
  /** This browser cannot do web push on a page — see the note below. */
  | 'unsupported';

/**
 * What this browser can actually do.
 *
 * The `unsupported` case is mostly iOS, and it is not a bug to work
 * around: Safari exposes neither Notification nor PushManager to a page in
 * a tab. It exposes them only once the site has been added to the Home
 * Screen and is running standalone — Apple's rule, with no API to get
 * round it. So on an iPhone, in a browser tab, there is nothing to ask
 * for and no bar is shown; asking would be asking for something that
 * cannot be granted.
 */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!pushConfigured()) return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'available';
}

/**
 * The FCM token for this browser, or null.
 *
 * Imported dynamically so the Firebase SDK — a few hundred kilobytes —
 * is not in the bundle that has to arrive before the first message is
 * readable. It is fetched at the moment someone turns notifications on,
 * or on a later load once they already have.
 */
async function fetchToken(registration: ServiceWorkerRegistration): Promise<string | null> {
  try {
    const [{ initializeApp, getApps, getApp }, { getMessaging, getToken, isSupported }] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]);
    // isSupported covers the browsers that have the APIs but not the
    // combination FCM needs — private windows, some embedded webviews.
    if (!(await isSupported())) return null;

    const app = getApps().length > 0 ? getApp() : initializeApp(config as Record<string, string>);
    // Our own worker, not the /firebase-messaging-sw.js the SDK would
    // register for itself. One worker means one cache, one fetch handler
    // and one place the push logic lives.
    return await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  } catch {
    // A blocked third-party context, a token request the browser refused,
    // a network that was not there. None of it is worth a message to a
    // customer who came here to ask about an order.
    return null;
  }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // The registration this window is actually under, rather than
    // navigator.serviceWorker.ready, which resolves for whichever worker
    // controls the page and can be a different scope.
    return (await navigator.serviceWorker.getRegistration('/c/')) ?? (await navigator.serviceWorker.ready);
  } catch {
    return null;
  }
}

/**
 * Hands the worker the URL of this chat.
 *
 * Needed because the server cannot supply it: only a hash of the link
 * token is stored, so there is nothing on that side to rebuild the address
 * from. Without this, a notification tapped with every tab closed has
 * nowhere to go.
 */
function tellWorkerTheUrl(registration: ServiceWorkerRegistration): void {
  const target = registration.active ?? navigator.serviceWorker.controller;
  target?.postMessage({ type: 'chat-url', url: window.location.href });
}

/**
 * Turns notifications on, asking the browser for permission.
 *
 * Must be called from a real tap. Browsers refuse — and remember the
 * refusal — for a permission prompt raised without one, and a page that
 * asks the moment it loads is the reason that rule exists.
 */
export async function enablePush(
  registerToken: (token: string) => Promise<void>,
): Promise<PushSupport> {
  if (pushSupport() === 'unsupported') return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'available';

  const registration = await readyRegistration();
  if (!registration) return 'unsupported';
  tellWorkerTheUrl(registration);

  const token = await fetchToken(registration);
  if (token) await registerToken(token).catch(() => {});
  return 'granted';
}

/**
 * Refreshes an already-granted registration on load.
 *
 * FCM tokens rotate, and a browser holding one the server has never seen
 * stops receiving anything — silently, which is the worst way for a
 * notification feature to fail. Prompts nobody: it returns immediately
 * unless permission was already given.
 */
export async function refreshPush(registerToken: (token: string) => Promise<void>): Promise<void> {
  if (pushSupport() !== 'granted') return;
  const registration = await readyRegistration();
  if (!registration) return;
  tellWorkerTheUrl(registration);
  const token = await fetchToken(registration);
  if (token) await registerToken(token).catch(() => {});
}
