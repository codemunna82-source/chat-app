'use client';

import { useMemo } from 'react';
import { useBreakpoint, useMediaQuery } from '@/hooks/useBreakpoint';
import { useRichEffectsEnabled, type RichEffectsProfile } from '@/hooks/useRichEffectsEnabled';

export type DeviceUIProfile = RichEffectsProfile & {
  /** Matches Tailwind `md` (768px) — same as main layout columns */
  isMobile: boolean;
  isMdOnly: boolean;
  isLgUp: boolean;
  isXlUp: boolean;
  /** Desktop “immersive” path: tilt, chrome glow, parallax */
  immersiveDesktop: boolean;
  /** Large targets + spring motion (phones / coarse pointers) */
  touchFirst: boolean;
  /** Subtle cursor-follow light (desktop only, GPU-friendly) */
  allowCursorGlow: boolean;
};

/**
 * Single entry for layout + performance: composes breakpoint + `useRichEffectsEnabled`.
 */
export function useDeviceUIProfile(): DeviceUIProfile {
  const rich = useRichEffectsEnabled();
  const isMdUp = useBreakpoint('md');
  const isLgUp = useBreakpoint('lg');
  const isXlUp = useBreakpoint('xl');
  const coarsePointer = useMediaQuery('(pointer: coarse)');

  return useMemo(() => {
    const isMobile = !isMdUp;
    const isMdOnly = isMdUp && !isLgUp;
    const immersiveDesktop = isMdUp && rich.allowTilt && !rich.reduceMotion;
    const touchFirst = isMobile || coarsePointer;
    const allowCursorGlow = immersiveDesktop && !rich.lowEnd;

    return {
      ...rich,
      isMobile,
      isMdOnly,
      isLgUp,
      isXlUp,
      immersiveDesktop,
      touchFirst,
      allowCursorGlow,
    };
  }, [rich, isMdUp, isLgUp, isXlUp, coarsePointer]);
}
