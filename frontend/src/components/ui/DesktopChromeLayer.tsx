'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  enabled: boolean;
  className?: string;
};

/**
 * Desktop-only ambient layer: cursor-follow glow + tiny parallax (transform/opacity only).
 */
export function DesktopChromeLayer({ enabled, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [glow, setGlow] = useState({ x: 50, y: 45 });
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const pending = useRef({ x: 50, y: 45, sx: 0, sy: 0 });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onMove = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
      const ny = ((e.clientY - r.top) / Math.max(1, r.height)) * 100;
      pending.current.x = nx;
      pending.current.y = ny;
      pending.current.sx = (e.clientX / window.innerWidth - 0.5) * 6;
      pending.current.sy = (e.clientY / window.innerHeight - 0.5) * 4;

      if (raf.current != null) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        const p = pending.current;
        setGlow({ x: p.x, y: p.y });
        setShift({ x: p.sx, y: p.sy });
      });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={rootRef}
      className={cn('pointer-events-none absolute inset-0 z-0 overflow-hidden max-md:hidden', className)}
      aria-hidden
    >
      <div
        className="absolute -inset-[18%] opacity-[0.1] motion-reduce:opacity-0 dark:opacity-[0.12]"
        style={{
          transform: `translate3d(${shift.x}px, ${shift.y}px, 0)`,
          background: `radial-gradient(38% 36% at ${glow.x}% ${glow.y}%, color-mix(in srgb, var(--primary) 28%, transparent), transparent 58%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.035] motion-reduce:opacity-0 dark:opacity-[0.05]"
        style={{
          transform: `translate3d(${shift.x * 0.6}px, ${shift.y * 0.6}px, 0)`,
          background: `radial-gradient(520px circle at ${glow.x}% ${glow.y}%, color-mix(in srgb, white 22%, transparent), transparent 52%)`,
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}
