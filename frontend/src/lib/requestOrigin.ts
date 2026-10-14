import { headers } from 'next/headers';

/**
 * The origin this request actually arrived on.
 *
 * One deployment now answers on several domains — the shared one, a pool
 * of spare ones, and any domain a workspace has pointed at us — so a build
 * -time NEXT_PUBLIC_SITE_URL can only ever name one of them. Baking it
 * into page metadata meant a customer on their own business's domain got
 * pages that advertised somebody else's, which defeats the point of giving
 * them a separate domain at all (see the backend's guestDomain.ts).
 *
 * Reads the forwarded headers Vercel sets, falling back to `host`. Both
 * are client-controllable in principle, which is why this value is used
 * ONLY for metadata — a canonical URL, a social card. Nothing here decides
 * access, and nothing here is trusted by the API: the backend keeps its
 * own allow-list of origins and does not take this app's word for it.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return fallbackOrigin();

  // A proxy may pass several, comma separated; the first is the client's.
  const first = host.split(',')[0]?.trim();
  if (!first || !/^[a-z0-9.:-]+$/i.test(first)) return fallbackOrigin();

  const proto = (h.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? '').toLowerCase();
  // localhost is the one host that is genuinely http in normal use.
  const scheme = proto === 'http' || first.startsWith('localhost') ? 'http' : 'https';
  return `${scheme}://${first}`;
}

function fallbackOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}
