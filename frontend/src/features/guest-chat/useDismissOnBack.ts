'use client';

import { useEffect } from 'react';

/**
 * Makes the phone's back gesture close an open layer instead of leaving
 * the chat.
 *
 * This is the difference people actually feel between an app and a web
 * page. In an app, back closes the emoji tray, the photo you opened, the
 * call screen — one layer at a time. In a browser it walks history, so a
 * customer with the emoji tray open swipes back and finds themselves
 * wherever they were before the chat, with the tray still notionally open
 * behind them.
 *
 * The trick is to push a history entry when the layer opens, so there is
 * something for back to consume, and to consume it ourselves when the
 * layer is closed any other way — otherwise every open/close cycle leaves
 * a dead entry behind and back stops working after a few of them.
 */
export function useDismissOnBack(open: boolean, dismiss: () => void): void {
  useEffect(() => {
    if (!open) return;

    // Marked so popstate can tell our own entry from a real navigation the
    // customer made before opening the chat.
    const marker = { waLayer: Date.now() };
    window.history.pushState(marker, '');

    let dismissedByBack = false;
    const onPop = () => {
      dismissedByBack = true;
      dismiss();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed by tapping the X rather than by going back: the entry we
      // pushed is still on the stack and has to come off, or back would
      // do nothing at all the next time it is pressed.
      if (!dismissedByBack && window.history.state?.waLayer === marker.waLayer) {
        window.history.back();
      }
    };
  }, [open, dismiss]);
}

/**
 * A short tap on the phone's vibrator.
 *
 * Guarded rather than called directly: iOS Safari has no Vibration API at
 * all, and a desktop browser that has one does nothing with it. Wrapped in
 * try/catch because a page that has not been interacted with yet throws
 * rather than returning false.
 */
export function tapFeedback(pattern: number | number[] = 8): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported, or blocked until the first interaction */
  }
}
