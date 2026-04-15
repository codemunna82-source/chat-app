'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { TiltCard } from '@/components/three/TiltCard';
import { useDeviceUIProfile } from '@/hooks/useDeviceUIProfile';

export type FloatingPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  tilt?: boolean;
};

/**
 * Glass shell + optional tilt depth — use for side panels / modals (not every list row).
 */
export function FloatingPanel({ className, tilt = true, children, ...props }: FloatingPanelProps) {
  const { allowTilt } = useDeviceUIProfile();
  const inner = (
    <div
      className={cn(
        'glass-liquid h-full w-full overflow-hidden rounded-2xl border border-white/15 shadow-xl shadow-black/20 transition-shadow duration-300 dark:border-white/10 dark:shadow-black/50 md:hover:shadow-2xl',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );

  if (!tilt) return inner;

  return (
    <TiltCard disabled={!allowTilt} maxTilt={5} className="h-full w-full">
      {inner}
    </TiltCard>
  );
}

