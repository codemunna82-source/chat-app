'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type ChatBubbleProps = {
  isSent: boolean;
  /** Tailwind rounding overrides for grouped bubbles */
  radiusClassName?: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Liquid-glass message shell (uses global `.glass-bubble-sent` / `.glass-bubble-received`).
 */
export function ChatBubble({ isSent, radiusClassName, className, children }: ChatBubbleProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl px-4 py-[10px] shadow-md ring-1 transition-[transform,box-shadow] duration-300 md:rounded-2xl md:shadow-[0_10px_40px_-12px_rgba(0,0,0,0.28)] motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.35)] dark:md:shadow-[0_12px_40px_-14px_rgba(0,0,0,0.55)] dark:motion-safe:hover:shadow-[0_16px_48px_-10px_rgba(0,0,0,0.6)] max-md:motion-safe:active:scale-[0.99]',
        isSent ? 'glass-bubble-sent ring-white/15' : 'glass-bubble-received ring-black/10 dark:ring-white/10',
        radiusClassName,
        className
      )}
    >
      {children}
    </div>
  );
}
