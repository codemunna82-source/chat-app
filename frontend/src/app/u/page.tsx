import type { Metadata, Viewport } from 'next';
import PersonalLinkLanding from '@/features/guest-chat/PersonalLinkLanding';

/**
 * Same landing page as /u/[token], reached by a query string instead of a
 * path segment — ?token=<token> rather than /u/<token>.
 *
 * Exists for WhatsApp's own "Dynamic URL" call-to-action button: a BSP's
 * template CTA only supports a fixed, whitelisted URL prefix ending in
 * "?" with the per-send value appended after it as a query string (see
 * the panel's own example: "https://www.company.com/products?src=web",
 * where "https://www.company.com/products?" is what gets whitelisted) —
 * there is no way to register a path segment as the dynamic part. The
 * personal link's own share/copy/SMS paths keep using /u/<token>, which
 * reads just as well and is what every other channel already points at;
 * this route exists only so the WhatsApp button has something that works.
 */
export const metadata: Metadata = {
  title: 'Chat',
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Chat' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#efe7de',
};

export default async function PersonalLinkQueryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <p>This chat opens from the link the business sent you.</p>
      </div>
    );
  }
  return <PersonalLinkLanding token={token} />;
}
