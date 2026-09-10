import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const apiHost = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
const socketHost = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
/**
 * The VOXO backend behind /c/<token>.
 *
 * A different host from the two above — the customer chat window talks to
 * the inbox backend, not this app's own API — and the first thing that
 * page does on open is fetch its session and messages from it. Warming the
 * connection in <head> takes the TLS handshake off that critical path,
 * which is the difference between the thread appearing and a beat of
 * blank wallpaper on a phone connection.
 */
const voxoHost = (process.env.NEXT_PUBLIC_VOXO_API_URL || '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
/**
 * Where this build is actually served from.
 *
 * Next needs an absolute base to resolve the relative URLs in metadata —
 * without one it warns at build time and emits social-card URLs relative
 * to localhost. Read from the environment rather than written in, because
 * the same source is deployed to a preview URL and a custom domain and
 * neither should be hardcoded here.
 */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Chat App | Real-Time Messaging",
  description: "A high-performance real-time chat application built with Next.js and Socket.io.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  keywords: ["chat", "real-time", "messaging", "mern", "nextjs"],
  authors: [{ name: "Chat App Team" }],
  openGraph: {
    title: "Chat App | Real-Time Messaging",
    description: "Connect with friends and family instantly with our secure chat platform.",
    type: "website",
    // Was a hardcoded domain this app has never been served from, so every
    // shared link advertised a site that does not exist.
    url: siteUrl,
    siteName: "Chat App",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chat App | Real-Time Messaging",
    description: "A high-performance real-time chat application.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#6366f1",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        <link rel="preconnect" href="https://icon-library.com" crossOrigin="anonymous" />
        {/* apiHost and socketHost already fall back to localhost:5000 in
            development, so a third hardcoded copy of it only added a dead
            preconnect to every production page. */}
        <link rel="preconnect" href={apiHost} crossOrigin="anonymous" />
        <link rel="preconnect" href={socketHost} crossOrigin="anonymous" />
        {voxoHost && <link rel="preconnect" href={voxoHost} crossOrigin="anonymous" />}
      </head>
      <body
        // The two webfont families used to be loaded here, for every route.
        // The customer chat window sets its own system stack and uses
        // neither, so a phone opening a link downloaded seventy kilobytes
        // of Sora and Fraunces — preloaded, so competing with the JS it
        // actually needed — and threw them away. They now load in the
        // (app) layout, which is the only place they are used.
        className="relative flex h-full min-h-0 flex-col bg-background font-sans text-foreground transition-colors duration-300"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="chat-ui-theme"
          disableTransitionOnChange={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
