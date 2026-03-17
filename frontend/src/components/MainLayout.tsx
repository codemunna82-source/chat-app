'use client';

import AppSidebar from '@/components/AppSidebar';
import dynamic from 'next/dynamic';
const Sidebar = dynamic(() => import('@/components/Sidebar'), { ssr: false });
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { MessageSquare, Phone, CircleDot, Settings, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false });

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, mounted } = useProtectedRoute();
  const pathname = usePathname();
  const router = useRouter();
  const { selectedChat } = useChatStore();
  const { logout } = useAuthStore();
  const [isMobile, setIsMobile] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
        <div className={`flex-1 flex flex-col h-full bg-background relative z-0 ${hideChatPane ? 'hidden md:flex' : ''} ${isMobile ? 'pb-24' : ''}`}>
          {isReady ? children : <div className="flex-1" />}
        </div>
      </div>

      <AnimatePresence>
        {isMobile && isReady && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-xl md:hidden"
          >
            <div className="bg-surface/95 backdrop-blur-xl border border-border/60 shadow-2xl shadow-black/10 rounded-3xl px-3 py-2 flex items-center justify-between gap-1">
              {[
                { href: '/', label: 'Chats', icon: MessageSquare },
                { href: '/status', label: 'Status', icon: CircleDot },
                { href: '/calls', label: 'Calls', icon: Phone },
              ].map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <button
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl transition-all ${active ? 'bg-primary/10 text-primary shadow-sm border border-primary/20' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}
                    aria-label={item.label}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-semibold tracking-tight">{item.label}</span>
                  </button>
                );
              })}

              <div className="w-[1px] h-8 bg-border/60 mx-1" aria-hidden />

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-2xl text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={logout}
                className="p-2 rounded-2xl text-red-500 hover:bg-red-500/10 transition-colors"
                aria-label="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isMobile && isReady && isSettingsOpen && (
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}
