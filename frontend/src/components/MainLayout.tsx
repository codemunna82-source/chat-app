'use client';

import AppSidebar from '@/components/AppSidebar';
import dynamic from 'next/dynamic';
import { MobileChatListDrawerProvider, useMobileChatListDrawer } from '@/contexts/MobileChatListDrawerContext';
import { ResponsiveLayout } from '@/components/ResponsiveLayout';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SidebarPanel } from '@/components/ui/SidebarPanel';
import { GlassCard } from '@/components/ui/GlassCard';
import { ChatInfoPanel } from '@/components/chat/ChatInfoPanel';
const Sidebar = dynamic(() => import('@/components/Sidebar'), { ssr: false });
const CallModal = dynamic(() => import('@/components/CallModal'), { ssr: false });
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { MessageSquare, Phone, CircleDot, Settings, LogOut } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
const SettingsModal = dynamic(() => import('@/components/SettingsModal'), { ssr: false });
import { useState } from 'react';
import { useDeviceUIProfile } from '@/hooks/useDeviceUIProfile';
import { ThreeBackgroundShell } from '@/components/three/ThreeBackgroundShell';
import { TiltCard } from '@/components/three/TiltCard';
import { DesktopChromeLayer } from '@/components/ui/DesktopChromeLayer';
import { FloatingButton } from '@/components/ui/FloatingButton';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileChatListDrawerProvider>
      <MainLayoutInner>{children}</MainLayoutInner>
    </MobileChatListDrawerProvider>
  );
}

function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, mounted } = useProtectedRoute();
  const pathname = usePathname();
  const router = useRouter();
  const { selectedChat } = useChatStore();
  const { logout } = useAuthStore();
  const isMdUp = useBreakpoint('md');
  const isMobile = !isMdUp;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const drawer = useMobileChatListDrawer();
  const ui = useDeviceUIProfile();

  const isReady = Boolean(mounted && user);
  const showSidebar = pathname === '/' || pathname === '';

  const showSidebarColumn = showSidebar && (!isMobile || !selectedChat);
  const hideChatPane = isMobile && showSidebar && !selectedChat;

  useEffect(() => {
    if (!isMobile) drawer.close();
  }, [isMobile, drawer.close]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isReady) {
      document.documentElement.classList.remove('app-shell-lock');
      return;
    }
    document.documentElement.classList.add('app-shell-lock');
    return () => document.documentElement.classList.remove('app-shell-lock');
  }, [isReady]);

  return (
    <>
      <ResponsiveLayout className="flex min-h-0 flex-1 flex-col">
        <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-visible overscroll-y-contain bg-background liquid-mesh-bg water-page-bg md:flex-row md:gap-3 md:p-3">
          {ui.allowThreeBackground ? (
            <div
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-[0.2] dark:opacity-[0.16] md:rounded-2xl md:opacity-[0.24]"
              aria-hidden
            >
              <ThreeBackgroundShell enabled />
            </div>
          ) : null}

          <div className="relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-visible md:flex-row md:gap-3">
          <DesktopChromeLayer enabled={ui.allowCursorGlow} />

          {/* Column 1: Slim App Navigation Sidebar (hidden on mobile for space) */}
          {!isMobile &&
            (isReady ? (
              <div className="relative z-[3] hidden h-full shrink-0 md:flex md:flex-col">
                <AppSidebar />
              </div>
            ) : (
              <div className="relative z-[3] hidden h-full w-[80px] shrink-0 glass-liquid rounded-2xl border border-white/10 shadow-xl md:block dark:border-white/5" />
            ))}

          {/* Column 2: Chat / Status / Calls list — floating glass on desktop */}
          {showSidebarColumn && (
            <div
              className={`relative z-[4] min-h-0 shrink-0 ${
                isMobile
                  ? 'flex h-full min-h-0 w-full max-w-full flex-1 flex-col bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75'
                  : 'h-full w-[min(100%,22rem)] lg:w-[min(100%,24rem)]'
              }`}
            >
              <SidebarPanel bleed={isMobile} className="h-full min-h-0">
                {isReady ? (
                  <Sidebar />
                ) : (
                  <div className="h-full w-full bg-surface/30 backdrop-blur-sm" />
                )}
              </SidebarPanel>
            </div>
          )}

          {/* Columns 3–4: Main surface + optional desktop info rail */}
          <div
            className={`relative z-[3] flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-visible xl:flex-row ${
              hideChatPane ? 'hidden md:flex' : ''
            } ${isMobile ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]' : ''}`}
          >
            <TiltCard disabled={!ui.allowTilt} className="relative z-[3] flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col">
              <GlassCard
                variant="liquid"
                lift
                className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-visible transition-all duration-300"
              >
                {isReady ? (
                  <div className="relative flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden overscroll-y-contain">
                    {children}
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
              </GlassCard>
            </TiltCard>
            {isReady && pathname === '/' ? <ChatInfoPanel /> : null}
          </div>
          </div>
        </div>
      </ResponsiveLayout>

      <AnimatePresence>
        {isMobile && isReady && drawer.isOpen && selectedChat && showSidebar && (
          <>
            <motion.button
              type="button"
              key="drawer-backdrop"
              aria-label="Close chat list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[55] bg-background/55 backdrop-blur-md"
              onClick={() => drawer.close()}
            />
            <motion.aside
              key="drawer-panel"
              initial={{ x: '-104%' }}
              animate={{ x: 0 }}
              exit={{ x: '-104%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              className="fixed left-0 top-0 bottom-0 z-[56] w-[min(100vw-2.5rem,22rem)] sm:w-[min(100vw-3rem,24rem)] glass-liquid border-r border-white/15 shadow-2xl dark:border-white/10 pt-[env(safe-area-inset-top,0px)]"
            >
              {isReady ? <Sidebar onPickChat={() => drawer.close()} /> : null}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMobile && isReady && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe pt-2 md:hidden pointer-events-none"
          >
            <div className="glass-card-float mx-auto w-full max-w-xl pointer-events-auto rounded-[1.75rem] px-2 py-2 sm:px-3 sm:py-2.5 flex items-stretch justify-between gap-1 shadow-2xl shadow-black/15">
              {[
                { href: '/', label: 'Chats', icon: MessageSquare },
                { href: '/status', label: 'Status', icon: CircleDot },
                { href: '/calls', label: 'Calls', icon: Phone },
              ].map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <FloatingButton
                    key={item.href}
                    type="button"
                    active={active}
                    onClick={() => router.push(item.href)}
                    className="flex-1 rounded-2xl py-2"
                    aria-label={item.label}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="text-[10px] font-semibold leading-none tracking-tight sm:text-[11px]">{item.label}</span>
                  </FloatingButton>
                );
              })}

              <div className="w-px self-stretch bg-border/50 my-1.5 mx-0.5 shrink-0" aria-hidden />

              <FloatingButton
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="rounded-2xl p-2 text-muted hover:text-foreground"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </FloatingButton>
              <FloatingButton
                type="button"
                onClick={logout}
                className="rounded-2xl p-2 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                aria-label="Logout"
              >
                <LogOut className="h-5 w-5" />
              </FloatingButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isMobile && isReady && isSettingsOpen && (
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      )}

      {isReady && <CallModal />}
    </>
  );
}
