'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * App shell: dynamic viewport height + safe-area padding for notched phones.
 * Use inside authenticated routes; keeps children full-bleed within the padded box.
 */
export function ResponsiveLayout({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'app-shell-viewport box-border flex w-full max-w-[100vw] flex-1 flex-col overflow-x-hidden',
        'pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]',
        'pt-[env(safe-area-inset-top,0px)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
