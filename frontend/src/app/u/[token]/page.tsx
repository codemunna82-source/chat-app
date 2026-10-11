import type { Metadata, Viewport } from 'next';
import PersonalLinkLanding from '@/features/guest-chat/PersonalLinkLanding';

/**
 * Someone's permanent "chat with me" link — /u/, not /c/: there is no
 * guest session yet, only a landing page asking a brand-new visitor for
 * their phone number before one is minted (see PersonalLinkLanding).
 *
 * `noindex` for the same reason as /c/[token]: this gets shared on a
 * card or a bio and forwarded from person to person, and a crawler
 * following it would put it in a search index nobody asked for.
 */
export const metadata: Metadata = {
  title: 'Chat',
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#efe7de',
};

export default async function PersonalLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PersonalLinkLanding token={token} />;
}
