import { Sora, Fraunces } from 'next/font/google';
import { SocketProvider } from '@/contexts/SocketContext';
import { MainClientProviders } from '@/components/MainClientProviders';
import { WebVitals } from '@/components/WebVitals';

/**
 * The app's display faces, loaded here rather than on the root layout.
 *
 * On the root they were fetched by every route, including the customer
 * chat window — which sets its own system stack and uses neither, so a
 * phone opening a chat link spent seventy kilobytes and two preload slots
 * on fonts it then ignored. Scoped here, that page ships no webfont at
 * all and the app routes are unchanged.
 */
const sora = Sora({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-display' });

/**
 * Everything the signed-in app needs, kept off the root layout.
 *
 * SocketProvider opens an authenticated connection keyed to the logged-in
 * user, and MainClientProviders mounts the decorative background. Neither
 * means anything to a customer who arrived on /c/<token> with a link and
 * no account — and on the root layout both would load on that page anyway,
 * costing a customer on mobile data a socket and a WebGL background for a
 * screen that uses neither.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${sora.variable} ${fraunces.variable} flex min-h-0 flex-1 flex-col`}>
      <WebVitals />
      <SocketProvider>
        <MainClientProviders>{children}</MainClientProviders>
      </SocketProvider>
    </div>
  );
}
