'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export type FloatingButtonProps = HTMLMotionProps<'button'> & {
  /** Active route / tab styling */
  active?: boolean;
};

/**
 * Touch-first floating control: 48px min target, spring feedback.
 */
export const FloatingButton = React.forwardRef<HTMLButtonElement, FloatingButtonProps>(
  ({ className, active, type = 'button', whileTap, whileHover, children, ...props }, ref) => {
    const reduce = useReducedMotion();
    return (
      <motion.button
        ref={ref}
        type={type}
        whileTap={reduce ? undefined : (whileTap ?? { scale: 0.93 })}
        whileHover={reduce ? undefined : (whileHover ?? { scale: 1.03 })}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        className={cn(
          'touch-manipulation inline-flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:pointer-events-none disabled:opacity-45',
          active
            ? 'border border-primary/25 bg-primary/12 text-primary shadow-sm'
            : 'border border-transparent text-muted hover:bg-surface-hover/85 hover:text-foreground',
          className
        )}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);
FloatingButton.displayName = 'FloatingButton';
