'use client';

import { useEffect } from 'react';

/**
 * The window's PWA plumbing: register the shell worker, and stop the
 * browser nagging about installing.
 *
 * These live together because they are two halves of one decision. The
 * manifest and the worker are what make an installed copy behave like an
 * app — standalone, no browser chrome, a shell that survives a dead
 * connection. What is NOT wanted is the browser turning that capability
 * into a prompt: a customer who tapped a link in WhatsApp to ask about
 * their order is not looking to install software, and an install banner
 * across the bottom of the chat is a demand for a decision they did not
 * come here to make.
 */
export function ServiceWorker() {
  useEffect(() => {
    // Suppressing the prompt is not production-only, unlike registration:
    // there is no version of this window where the banner is wanted.
    //
    // preventDefault on beforeinstallprompt is the supported way to do
    // this, and the ONLY thing it stops is the automatic banner. The
    // browser's own menu keeps its "Install app" entry — no page can
    // remove that, and none should be able to. So someone who genuinely
    // wants the icon can still put it there, and gets the standalone
    // window the manifest describes; they are simply never asked.
    //
    // The event is not stashed for later either. Holding it so a button
    // can fire it is the usual pattern, and it is the pattern this window
    // is deliberately not using.
    const onBeforeInstall = (event: Event) => event.preventDefault();
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      // Scoped to /c/ so it can never intercept anything outside the
      // customer chat. Skipped in development, where a stale worker
      // serving an old build is a debugging session nobody asked for.
      //
      // Registration failing is not worth telling anyone about: the chat
      // works exactly as it did before, just without an offline shell.
      void navigator.serviceWorker.register('/sw.js', { scope: '/c/' }).catch(() => {});
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  return null;
}
