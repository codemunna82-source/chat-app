import type { Metadata, Viewport } from "next";
import { Sora, Fraunces } from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/contexts/SocketContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { MainClientProviders } from "@/components/MainClientProviders";
import { WebVitals } from "@/components/WebVitals";

const sora = Sora({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", variable: "--font-display" });
const apiHost = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
const socketHost = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

export const metadata: Metadata = {
  title: "Chat App | Real-Time Messaging",
  description: "A high-performance real-time chat application built with Next.js and Socket.io.",
  keywords: ["chat", "real-time", "messaging", "mern", "nextjs"],
  authors: [{ name: "Chat App Team" }],
  openGraph: {
    title: "Chat App | Real-Time Messaging",
    description: "Connect with friends and family instantly with our secure chat platform.",
    type: "website",
    url: "https://chatapp-mern.vercel.app", // Adjust if needed
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
  themeColor: "#ff6b4a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://icon-library.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="http://localhost:5000" crossOrigin="anonymous" />
        <link rel="preconnect" href={apiHost} crossOrigin="anonymous" />
        <link rel="preconnect" href={socketHost} crossOrigin="anonymous" />
      </head>
      <body className={`${sora.variable} ${fraunces.variable} min-h-screen text-foreground bg-background transition-colors duration-300 relative font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <WebVitals />
          <SocketProvider>
            <MainClientProviders>
              {children}
            </MainClientProviders>
          </SocketProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
