'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type VideoContainerProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Premium video stage: depth, rounded shell, subtle border (web video calls).
 */
export function VideoContainer({ className, children, ...props }: VideoContainerProps) {
  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/12 bg-black/45 shadow-2xl shadow-black/50 md:rounded-3xl',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
