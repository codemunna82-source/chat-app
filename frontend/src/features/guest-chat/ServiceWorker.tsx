'use client';

import { useEffect } from 'react';

/**
 * Registers the shell worker, and only where it earns its keep.
 *
 * Scoped to /c/ so it can never intercept anything outside the customer
 * chat, and skipped in development, where a stale worker serving an old
 * build is a debugging session nobody asked for.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    // Registration failing is not worth telling anyone about: the chat
    // works exactly as it did before, just without an offline shell.
    void navigator.serviceWorker.register('/sw.js', { scope: '/c/' }).catch(() => {});
  }, []);

  return null;
}
