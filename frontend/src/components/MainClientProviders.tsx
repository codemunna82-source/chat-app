'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MotionConfig } from 'framer-motion';

const CallModal = dynamic(() => import('@/components/CallModal'), { ssr: false });
const AnimatedBackground = dynamic(() => import('@/components/AnimatedBackground').then(mod => mod.AnimatedBackground), { ssr: false });

export function MainClientProviders({ children }: { children: React.ReactNode }) {
  const [showBackground, setShowBackground] = useState(false);
  const [allowBackground, setAllowBackground] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [lowEnd, setLowEnd] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const saveData = Boolean(connection?.saveData);
    const effectiveType = connection?.effectiveType || '';
    const hardwareConcurrency = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 4;
    const deviceMemory = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : 4;
    const lowEnd = isMobile || prefersReducedMotion || saveData || hardwareConcurrency <= 4 || /2g|3g/.test(effectiveType);
    setAllowBackground(!lowEnd);
    setReduceMotion(prefersReducedMotion || lowEnd);
    setLowEnd(lowEnd || deviceMemory <= 4);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.reducedMotion = reduceMotion ? '1' : '0';
    document.documentElement.dataset.lowEnd = lowEnd ? '1' : '0';
  }, [reduceMotion, lowEnd]);

  useEffect(() => {
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setShowBackground(true);
    };

    const win = typeof window !== 'undefined' ? window : undefined;

    if (win && 'requestIdleCallback' in win) {
      const id = (win as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(enable, { timeout: 1500 });
      return () => {
        cancelled = true;
        (win as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
      };
    }

    // Avoid referencing window.* to keep TS/SSR happy; globals exist in the client runtime
    const timeoutId = setTimeout(enable, 800);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
      {allowBackground && showBackground && <AnimatedBackground />}
      {children}
      <CallModal />
    </MotionConfig>
  );
}
