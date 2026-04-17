'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stronger blur + border for floating panels */
  variant?: 'default' | 'float' | 'subtle' | 'liquid';
  /** Web-safe depth hover (desktop) */
  lift?: boolean;
}

const variants: Record<NonNullable<GlassCardProps['variant']>, string> = {
  default: 'glass-panel rounded-2xl sm:rounded-3xl',
  float: 'glass-card-float rounded-2xl sm:rounded-3xl',
  subtle:
    'rounded-2xl border border-border/40 bg-surface/50 backdrop-blur-md sm:backdrop-blur-lg',
  liquid:
    'glass-liquid rounded-2xl sm:rounded-3xl border border-white/15 shadow-xl shadow-black/25 dark:border-white/10 dark:shadow-black/50',
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', lift, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(variants[variant], lift && 'panel-lift', className)}
      {...props}
    />
  )
);
GlassCard.displayName = 'GlassCard';
