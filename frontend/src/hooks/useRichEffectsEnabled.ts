'use client';

import { useEffect, useState } from 'react';

export type RichEffectsProfile = {
  /** Original `setAllowBackground(!lowEnd)` before deviceMemory bump */
  allowSnowBackground: boolean;
  /** `lowEnd || deviceMemory <= 4` — matches `data-low-end` on &lt;html&gt; */
  lowEnd: boolean;
  reduceMotion: boolean;
  /** WebGL ambient layer (stricter than snow) */
  allowThreeBackground: boolean;
  /** Pointer tilt on panels */
  allowTilt: boolean;
};

/**
 * Keep in sync with MainClientProviders dataset + background gating.
 */
export function useRichEffectsEnabled(): RichEffectsProfile {
  const [p, setP] = useState<RichEffectsProfile>({
    allowSnowBackground: false,
    lowEnd: true,
    reduceMotion: true,
    allowThreeBackground: false,
    allowTilt: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    /** Align with Tailwind `md` (768px) — same breakpoint as main shell layout */
    const isMobile = window.matchMedia?.('(max-width: 767px)')?.matches ?? false;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const saveData = Boolean(connection?.saveData);
    const effectiveType = connection?.effectiveType || '';
    const hardwareConcurrency = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 4;
    const deviceMemory = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : 4;

    const lowEndCore =
      isMobile || prefersReducedMotion || saveData || hardwareConcurrency <= 4 || /2g|3g/.test(effectiveType);
    const lowEnd = lowEndCore || deviceMemory <= 4;
    const reduceMotion = prefersReducedMotion || lowEndCore;
    const allowSnowBackground = !lowEndCore;
    const allowThreeBackground =
      !lowEnd && !prefersReducedMotion && hardwareConcurrency >= 6 && !saveData && !isMobile;
    const allowTilt = !isMobile && !prefersReducedMotion && !lowEnd;

    setP({
      allowSnowBackground,
      lowEnd,
      reduceMotion,
      allowThreeBackground,
      allowTilt,
    });
  }, []);

  return p;
}
