'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type SidebarPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  /** When true (e.g. mobile full-bleed list), skip floating chrome */
  bleed?: boolean;
};

/**
 * Floating glass column for the chat / contacts list (web — not iOS).
 */
export function SidebarPanel({ className, bleed, children, ...props }: SidebarPanelProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden transition-all duration-300',
        bleed
          ? 'rounded-none border-0 bg-transparent shadow-none'
          : 'md:glass-liquid md:rounded-2xl lg:rounded-3xl md:border md:border-white/15 md:shadow-xl md:shadow-black/20 dark:md:border-white/10',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
