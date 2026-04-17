'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type GlassPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Stronger depth shadow */
  elevated?: boolean;
};

/**
 * Reusable glass surface (layout chrome — not a drop-in for every list row).
 */
export function GlassPanel({ elevated, className, children, ...props }: GlassPanelProps) {
  return (
    <div
      className={cn(
        'glass-liquid rounded-2xl border border-white/15 shadow-lg shadow-black/15 dark:border-white/10 dark:shadow-black/45',
        elevated && 'shadow-2xl shadow-black/25 dark:shadow-black/60 md:ring-1 md:ring-white/10',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
