'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MotionConfig } from 'framer-motion';
import { useRichEffectsEnabled } from '@/hooks/useRichEffectsEnabled';

const AnimatedBackground = dynamic(() => import('@/components/AnimatedBackground').then((mod) => mod.AnimatedBackground), {
  ssr: false,
});

export function MainClientProviders({ children }: { children: React.ReactNode }) {
  const [showBackground, setShowBackground] = useState(false);
  const effects = useRichEffectsEnabled();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.reducedMotion = effects.reduceMotion ? '1' : '0';
    document.documentElement.dataset.lowEnd = effects.lowEnd ? '1' : '0';
  }, [effects.reduceMotion, effects.lowEnd]);

  useEffect(() => {
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setShowBackground(true);
    };

    const win = typeof window !== 'undefined' ? window : undefined;

    if (win && 'requestIdleCallback' in win) {
      const id = (win as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
        enable,
        { timeout: 1500 }
      );
      return () => {
        cancelled = true;
        (win as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
      };
    }

    const timeoutId = setTimeout(enable, 800);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <MotionConfig reducedMotion={effects.reduceMotion ? 'always' : 'never'}>
      {effects.allowSnowBackground && showBackground && <AnimatedBackground />}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </MotionConfig>
  );
}
