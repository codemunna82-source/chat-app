'use client';

import AppSidebar from '@/components/AppSidebar';
import dynamic from 'next/dynamic';
const Sidebar = dynamic(() => import('@/components/Sidebar'), { ssr: false });
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { usePathname } from 'next/navigation';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, mounted } = useProtectedRoute();
  const pathname = usePathname();

  const isReady = Boolean(mounted && user);
  const showSidebar = pathname === '/' || pathname === '';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
        {/* Column 1: Slim App Navigation Sidebar */}
        {isReady ? (
          <AppSidebar />
        ) : (
          <div className="w-[80px] h-full flex-shrink-0 bg-surface/70 border-r border-border/50" />
        )}
        
        {/* Column 2: Chat / Status / Calls List Panel (Currently named Sidebar) */}
        {showSidebar && (
          <div className="h-full flex-shrink-0 relative z-10 shadow-xl shadow-black/5 w-[320px] lg:w-[380px]">
            {isReady ? (
              <Sidebar />
            ) : (
              <div className="w-full h-full bg-surface/50 border-r border-border/50" />
            )}
          </div>
        )}

        {/* Column 3: Main Content Area (Chat Window) */}
        <div className="flex-1 flex flex-col h-full bg-background relative z-0">
          {isReady ? children : <div className="flex-1" />}
        </div>
      </div>
  );
}
