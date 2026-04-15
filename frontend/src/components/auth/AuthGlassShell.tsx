'use client';

import * as React from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/utils';

type AuthGlassShellProps = {
  children: React.ReactNode;
  /** Extra classes on the outer water shell */
  className?: string;
  /** Extra classes on the inner glass card */
  cardClassName?: string;
};

/**
 * Shared layout for login / register: water wash, theme toggle, floating glass card, safe areas.
 */
export function AuthGlassShell({ children, className, cardClassName }: AuthGlassShellProps) {
  return (
    <div
      className={cn(
        'relative flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-auto',
        'bg-background px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] sm:py-14',
        'water-page-bg',
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-background/35 via-transparent to-background/75 dark:from-background/55 dark:to-background/90"
        aria-hidden
      />
      <div className="pointer-events-auto absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 sm:right-5">
        <ThemeToggle />
      </div>

      <GlassCard
        variant="float"
        className={cn(
          'relative z-[1] w-full max-w-md border-border/50 p-6 shadow-2xl sm:p-9',
          cardClassName
        )}
      >
        {children}
      </GlassCard>
    </div>
  );
}
