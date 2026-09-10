import { NextResponse, type NextRequest } from 'next/server';

/**
 * Locks a deployment down to the customer chat window.
 *
 * This build is published for one audience: someone who tapped "Open
 * private chat" in WhatsApp. Registration, calls and the status page are
 * not part of that and are not functional here either, so they answer 404
 * rather than showing a customer a screen that cannot work — that is the
 * surface an outsider poking at the root URL would otherwise find.
 *
 * Sign-in and user management are the exception. They ARE functional now
 * (they talk to NEXT_PUBLIC_VOXO_API_URL, the same backend the chat window
 * uses) and the workspace has to reach them from somewhere; both are a
 * login wall, so serving them here leaks nothing.
 *
 * Gated on an environment variable rather than deleting the routes, so the
 * full app still builds and runs everywhere else — turn the flag off and
 * nothing here applies.
 *
 * NEXT_PUBLIC_ despite holding no secret: middleware runs in the Edge
 * runtime, where only build-time-inlined values are reliably present. A
 * plain env name would read as undefined there and silently disable the
 * lock — the failure mode being exactly the thing this prevents.
 */
const GUEST_ONLY = process.env.NEXT_PUBLIC_GUEST_ONLY === 'true';

const NOT_FOUND_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Not found</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
       padding:2rem;text-align:center;background:#efe7de;color:#111b21;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
  @media (prefers-color-scheme:dark){body{background:#0b141a;color:#e9edef}}
  p{max-width:22rem;font-size:15px;line-height:1.6;color:#667781}
  @media (prefers-color-scheme:dark){p{color:#8696a0}}
  h1{font-size:19px;font-weight:600;margin:0 0 .5rem}
</style></head>
<body><div><h1>Nothing here</h1>
<p>This chat opens from the link the business sent you. Go back to WhatsApp and tap
&ldquo;Open private chat&rdquo; again.</p></div></body></html>`;

export function middleware(request: NextRequest) {
  if (!GUEST_ONLY) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === '/c' || pathname.startsWith('/c/')) return NextResponse.next();

  // User management and the sign-in it needs. Allowed through even on a
  // customer-facing deployment, because there is nothing behind them to
  // leak: /admin renders a session check and redirects, and /login is a
  // form that answers a wrong password the same way a right one on a
  // non-existent account is answered. Blocking them would mean running a
  // second deployment purely to reach a page that is already a login wall.
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/login') {
    return NextResponse.next();
  }

  return new NextResponse(NOT_FOUND_PAGE, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
  });
}

export const config = {
  // Framework assets and files with an extension are left alone: the chat
  // window is served by the same build and needs its own JS, CSS and the
  // wallpaper out of /public.
  matcher: ['/((?!_next/|.*\\.[^/]+$).*)'],
};
