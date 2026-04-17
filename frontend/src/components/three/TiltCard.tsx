'use client';

import { useRef, useState } from 'react';
import { motion, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

export type TiltCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Max tilt in degrees */
  maxTilt?: number;
  disabled?: boolean;
};

/**
 * Web-safe fake depth: perspective + spring tilt from pointer.
 * Intended for desktop / fine pointer — pass `disabled` on mobile or use `useDeviceUIProfile().allowTilt`.
 */
export function TiltCard({ children, className, maxTilt = 7, disabled }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 280, damping: 26, mass: 0.6 });
  const ry = useSpring(0, { stiffness: 280, damping: 26, mass: 0.6 });

  const [pressed, setPressed] = useState(false);

  if (disabled) {
    return <div className={cn('h-full w-full', className)}>{children}</div>;
  }

  function onMove(e: React.MouseEvent) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * maxTilt * 2);
    rx.set(-py * maxTilt * 2);
  }

  function reset() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      className={cn(className)}
      style={{ perspective: 1100 }}
    >
      <motion.div
        style={{
          rotateX: rx,
          rotateY: ry,
          transformStyle: 'preserve-3d',
          scale: pressed ? 0.985 : 1,
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className="h-full w-full will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}
