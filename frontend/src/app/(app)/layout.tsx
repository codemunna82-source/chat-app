import { SocketProvider } from '@/contexts/SocketContext';
import { MainClientProviders } from '@/components/MainClientProviders';
import { WebVitals } from '@/components/WebVitals';

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
    <>
      <WebVitals />
      <SocketProvider>
        <MainClientProviders>{children}</MainClientProviders>
      </SocketProvider>
    </>
  );
}
