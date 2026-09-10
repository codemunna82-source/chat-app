import type { Metadata, Viewport } from 'next';
import GuestChatWindow from '@/features/guest-chat/GuestChatWindow';
import { ServiceWorker } from '@/features/guest-chat/ServiceWorker';

/**
 * A private conversation between one customer and one business, reachable
 * only by the link token in the URL. `noindex` is not decoration: the link
 * is pasted into WhatsApp threads and gets forwarded, and a crawler that
 * followed one would put a real customer's chat into a search index.
 */
const metadata: Metadata = {
  title: 'Chat',
  robots: { index: false, follow: false },
  // Added to the home screen, this opens chrome-less — the browser bar is
  // the last thing between this and feeling like the messenger the
  // customer was just in.
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Chat' },
};

/**
 * Overrides the app-wide viewport for this route only.
 *
 * The status bar is tinted to the chat header rather than the app's indigo,
 * so there is no band of a different colour above the window; and
 * `resizes-content` makes the on-screen keyboard shrink the viewport
 * instead of covering the composer with it.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f5f3' },
    { media: '(prefers-color-scheme: dark)', color: '#202c33' },
  ],
};

/**
 * The manifest is per-token, so installing from this page puts *this*
 * conversation on the home screen — see the route it points at.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return { ...metadata, manifest: `/c/${encodeURIComponent(token)}/manifest` };
}

export default async function GuestChatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <ServiceWorker />
      <GuestChatWindow token={token} />
    </>
  );
}
