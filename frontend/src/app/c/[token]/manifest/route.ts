import type { NextRequest } from 'next/server';

/**
 * A web manifest per chat, so "Add to home screen" installs *this*
 * conversation.
 *
 * Generated rather than static because of start_url. A single manifest at
 * the app root could only point at /c, which is not a chat and does not
 * exist — installing from it would put an icon on the customer's home
 * screen that opens a 404. Scoped to the token, the installed icon reopens
 * the same conversation, in standalone mode with no browser chrome, which
 * is the whole point of installing it.
 *
 * The token is already in the URL this is served from, so it is no more
 * exposed here than it is in the address bar.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scope = `/c/${encodeURIComponent(token)}`;

  return Response.json(
    {
      // Deliberately generic: this ends up under an icon on a home screen
      // that other people may see, and the business's name there would say
      // more about the customer than they chose to share.
      name: 'Chat',
      short_name: 'Chat',
      id: scope,
      start_url: scope,
      scope,
      display: 'standalone',
      orientation: 'portrait',
      // The chat wallpaper and the header, so the splash and the status bar
      // match the window that opens rather than flashing white first.
      background_color: '#efe7de',
      theme_color: '#f7f5f3',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    {
      headers: {
        'content-type': 'application/manifest+json',
        // One per token and it never changes; a customer reopening the
        // chat should not refetch it.
        'cache-control': 'public, max-age=86400',
      },
    },
  );
}
