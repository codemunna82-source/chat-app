'use client';

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

export type Glass3DButtonProps = HTMLMotionProps<'button'> & {
  variant?: 'glass' | 'primary';
};

const variants = {
  glass:
    'border border-white/20 bg-white/10 text-foreground shadow-lg shadow-black/15 backdrop-blur-md hover:border-primary/40 hover:bg-white/15 hover:shadow-primary/20 dark:border-white/10 dark:bg-white/5 dark:shadow-black/40',
  primary:
    'border border-transparent bg-primary text-white shadow-lg shadow-primary/30 hover:bg-primary-hover hover:shadow-primary/40',
};

/**
 * Circular / pill glass control with press + hover lift (video toolbar, headers).
 */
export const Glass3DButton = React.forwardRef<HTMLButtonElement, Glass3DButtonProps>(
  ({ className, variant = 'glass', type = 'button', children, ...props }, ref) => (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.95 }}
      whileHover={{ y: -2, scale: 1.04 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium transition-shadow duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  )
);
Glass3DButton.displayName = 'Glass3DButton';
