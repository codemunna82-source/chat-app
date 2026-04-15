'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export type MobileCardProps = HTMLMotionProps<'div'>;

/**
 * Lightweight “3D” on phones: spring press + elevation via shadow (no WebGL).
 */
export function MobileCard({ className, children, whileTap, transition, ...rest }: MobileCardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      whileTap={reduce ? undefined : (whileTap ?? { scale: 0.987 })}
      transition={transition ?? { type: 'spring', stiffness: 460, damping: 28 }}
      className={cn(
        'rounded-2xl shadow-lg shadow-black/10 ring-1 ring-black/[0.06] dark:shadow-black/40 dark:ring-white/[0.08]',
        className
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
