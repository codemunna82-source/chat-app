'use client';

import AppSidebar from '@/components/AppSidebar';
import dynamic from 'next/dynamic';
const Sidebar = dynamic(() => import('@/components/Sidebar'), { ssr: false });
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, mounted } = useProtectedRoute();
  const pathname = usePathname();
  const { selectedChat } = useChatStore();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  const isReady = Boolean(mounted && user);
  const showSidebar = pathname === '/' || pathname === '';

  // On mobile we only show the chat list when no chat is selected
  const showSidebarColumn = showSidebar && (!isMobile || !selectedChat);
  const hideChatPane = isMobile && showSidebar && !selectedChat;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background relative">
        {/* Column 1: Slim App Navigation Sidebar (hidden on mobile for space) */}
        {!isMobile && (
          isReady ? (
            <AppSidebar />
          ) : (
            <div className="w-[80px] h-full flex-shrink-0 bg-surface/70 border-r border-border/50" />
          )
        )}

        {/* Column 2: Chat / Status / Calls List Panel */}
        {showSidebarColumn && (
          <div className={`h-full flex-shrink-0 relative z-20 shadow-xl shadow-black/5 ${isMobile ? 'w-full max-w-full absolute inset-0 bg-background' : 'w-[320px] lg:w-[380px]'}`}>
            {isReady ? (
              <Sidebar />
            ) : (
              <div className="w-full h-full bg-surface/50 border-r border-border/50" />
            )}
          </div>
        )}

        {/* Column 3: Main Content Area (Chat Window) */}
        <div className={`flex-1 flex flex-col h-full bg-background relative z-0 ${hideChatPane ? 'hidden md:flex' : ''}`}>
          {isReady ? children : <div className="flex-1" />}
        </div>
      </div>
  );
}
