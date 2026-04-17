'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'icon';
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = 'glass', size = 'md', type = 'button', ...props }, ref) => {
    const sizes = {
      sm: 'h-10 min-h-[44px] px-4 text-sm rounded-xl',
      md: 'h-11 min-h-[44px] px-5 text-sm rounded-2xl',
      icon: 'h-11 w-11 min-h-[44px] min-w-[44px] rounded-2xl p-0 justify-center',
    };

    const styles = {
      primary:
        'bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary-hover hover:shadow-primary/35 active:scale-[0.98]',
      ghost: 'bg-transparent text-foreground/90 hover:bg-surface-hover/90 border border-transparent',
      glass:
        'relative overflow-hidden border border-[color-mix(in_srgb,var(--border)_50%,transparent)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] backdrop-blur-lg text-foreground shadow-sm hover:border-primary/35 hover:shadow-[0_0_24px_-4px_color-mix(in_srgb,var(--primary)_45%,transparent)] active:scale-[0.98] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/10 before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity',
    };

    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-45 md:hover:-translate-y-0.5 md:hover:scale-[1.02] md:active:translate-y-0 md:active:scale-[0.99]',
          sizes[size],
          styles[variant],
          className
        )}
        {...props}
      />
    );
  }
);
GlassButton.displayName = 'GlassButton';
