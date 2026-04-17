'use client';

import { useCallback, useRef } from 'react';

type Options = {
  enabled: boolean;
  /** Open chat list (e.g. drawer) when user swipes right from the left bezel */
  onRevealList?: () => void;
  /** Max distance from left edge to start tracking (px) */
  edgePx?: number;
  /** Minimum horizontal travel to fire `onRevealList` */
  thresholdPx?: number;
};

/**
 * Touch-first navigation: edge swipe → reveal list, without hijacking vertical scroll.
 */
export function useChatEdgeSwipe({ enabled, onRevealList, edgePx = 22, thresholdPx = 56 }: Options) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !onRevealList) return;
      const t = e.touches[0];
      if (!t || t.clientX > edgePx) return;
      startRef.current = { x: t.clientX, y: t.clientY };
    },
    [enabled, onRevealList, edgePx]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !onRevealList || !startRef.current) return;
      const t = e.changedTouches[0];
      if (!t) {
        startRef.current = null;
        return;
      }
      const dx = t.clientX - startRef.current.x;
      const dy = Math.abs(t.clientY - startRef.current.y);
      startRef.current = null;
      if (dx > thresholdPx && dy < 120) {
        onRevealList();
      }
    },
    [enabled, onRevealList, thresholdPx]
  );

  const onTouchCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
