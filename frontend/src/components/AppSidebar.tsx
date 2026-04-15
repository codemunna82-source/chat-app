'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { useAuthStore } from '@/store/useAuthStore';
import { MessageSquare, Phone, CircleDot, Settings, LogOut, Hexagon } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { motion } from 'framer-motion';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { UserAvatar } from '@/components/ui/UserAvatar';
const ProfileModal = dynamic(() => import('./ProfileModal'), { ssr: false });
const SettingsModal = dynamic(() => import('./SettingsModal'), { ssr: false });

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, mounted } = useProtectedRoute();
  const { logout } = useAuthStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  if (!mounted || !user) return null;

  const navItems = [
    { href: '/', icon: MessageSquare, label: 'Chats', hasNotification: true },
    { href: '/status', icon: CircleDot, label: 'Status' },
    { href: '/calls', icon: Phone, label: 'Calls' },
  ];

  return (
    <div className="z-20 flex h-full w-[84px] shrink-0 flex-col items-center rounded-2xl border border-white/15 bg-gradient-to-b from-white/12 to-white/5 py-6 shadow-xl shadow-black/15 backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:from-white/8 dark:to-black/20 dark:shadow-black/40 md:panel-lift pt-[max(1.25rem,env(safe-area-inset-top,0px))]">
      {/* App Logo */}
      <div className="mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary to-primary-hover flex items-center justify-center shadow-lg shadow-primary/25">
          <Hexagon className="w-7 h-7 text-white" />
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex flex-col items-center gap-4 flex-1 w-full px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === '/' && pathname === '');
          const Icon = item.icon;

          return (
            <Link 
              key={item.label} 
              href={item.href} 
              title={item.label}
              className="relative group w-full flex justify-center py-2.5 rounded-2xl transition-all duration-300"
            >
              <div className={`relative z-10 p-2.5 rounded-2xl transition-all duration-300 ${isActive ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-muted hover:text-foreground hover:bg-surface-hover/80'}`}>
                <Icon className="w-6 h-6" />
                {item.hasNotification && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-surface animate-pulse shadow-sm"></span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col items-center gap-5 w-full px-1">
        <ThemeToggle />

        {/* Settings button opens modal instead of individual components */}
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="text-muted hover:text-foreground transition-colors p-2.5 rounded-2xl hover:bg-surface-hover/80 min-h-11 min-w-11 flex items-center justify-center"
          title="Settings"
        >
          <Settings className="w-6 h-6" />
        </button>

        <div className="w-8 h-[1px] bg-border/50"></div>

        <button 
          onClick={() => setIsProfileOpen(true)}
          title="Profile"
          type="button"
          className="relative group rounded-2xl overflow-hidden ring-2 ring-transparent hover:ring-primary/50 transition-all duration-300 shadow-sm w-11 h-11 block bg-surface-hover"
        >
          <UserAvatar
            src={user.avatar}
            name={user.name}
            variant="md"
            className="h-11 w-11"
            sizes="44px"
            priority
          />
        </button>

        <button
          onClick={logout}
          className="mt-2 text-muted hover:text-red-500 transition-colors p-2.5 rounded-2xl hover:bg-red-500/10"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {isProfileOpen && <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />}
      {isSettingsOpen && <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}
