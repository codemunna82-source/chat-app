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
 * The trick is to push a history entry when a layer opens, so there is
 * something for back to consume, and to take it back off when the layer is
 * closed any other way — otherwise every open/close cycle leaves a dead
 * entry behind and back stops working after a few of them.
 *
 * The bookkeeping lives in one module-level manager rather than in each
 * hook, and that is the whole design. Per-layer listeners cannot cope with
 * two layers changing in the same commit: closing the reaction row while
 * opening the report sheet made the row take its entry back, and the pop
 * that produced arrived at the sheet, which had no way to know it was not
 * a back press and closed itself in the frame it appeared. One owner sees
 * both halves of that transition and nets them out to no history change
 * at all.
 */

interface Layer {
  id: number;
  dismiss: () => void;
}

/** Open layers, innermost last. Back closes the last one. */
const layers: Layer[] = [];
/** How many history entries we have pushed and not yet given back. */
let entries = 0;
let listening = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

function onPop(): void {
  entries = Math.max(0, entries - 1);
  // One press closes one layer: the innermost. Anything below it keeps its
  // entry and its turn. When no layer is open the pop is the spare entry
  // being spent, and there is nothing to close.
  if (layers.length > entries) layers.pop()?.dismiss();
  detachIfIdle();
}

function detachIfIdle(): void {
  if (listening && entries === 0 && layers.length === 0) {
    window.removeEventListener('popstate', onPop);
    listening = false;
  }
}

/**
 * Gives back any entry no open layer still needs — but on the next task,
 * not now.
 *
 * The delay is the whole point. Closing one layer while opening another
 * happens in a single commit, and `history.back()` is asynchronous: an
 * immediate call produced a pop that landed after the new layer had
 * pushed, so the new layer read it as a back press and closed itself in
 * the frame it appeared. By the time this runs, that commit has finished
 * and the replacement layer is already counted — so the two net out and
 * nothing is spent at all.
 */
function scheduleSettle(): void {
  if (settleTimer) return;
  settleTimer = setTimeout(() => {
    settleTimer = null;
    if (entries > layers.length && entries > 0) {
      entries -= 1;
      window.history.back();
    }
  }, 0);
}

function openLayer(layer: Layer): void {
  layers.push(layer);
  // An entry a just-closed layer has not spent yet is reused rather than
  // stacked on: they are interchangeable markers, and one per open layer
  // is the count that makes back close exactly one thing.
  if (entries >= layers.length) return;
  window.history.pushState({ waLayer: ++seq }, '');
  entries += 1;
  if (!listening) {
    window.addEventListener('popstate', onPop);
    listening = true;
  }
}

function closeLayer(id: number): void {
  const index = layers.findIndex((l) => l.id === id);
  if (index !== -1) layers.splice(index, 1);
  scheduleSettle();
}

export function useDismissOnBack(open: boolean, dismiss: () => void): void {
  useEffect(() => {
    if (!open) return;
    const layer: Layer = { id: ++seq, dismiss };
    openLayer(layer);
    return () => closeLayer(layer.id);
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
