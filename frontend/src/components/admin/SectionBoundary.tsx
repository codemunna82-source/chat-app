'use client';

import React from 'react';

/**
 * Keeps one broken panel from taking the whole admin page down.
 *
 * This exists because it already happened: a panel read a field an older
 * API had not started sending yet, threw during render, and React
 * unmounted the entire tree — so instead of one card showing an error,
 * the admin page was a blank screen reading "Application error: a
 * client-side exception has occurred". Every other setting on the page
 * became unreachable because of one of them.
 *
 * The site and the API deploy separately, so a version skew between them
 * is normal rather than exceptional, and the page has to survive it.
 *
 * A class component because that is still the only way to catch a render
 * error in React — there is no hook equivalent.
 */
export class SectionBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Left in the console deliberately: this is the only trace of a panel
    // that failed, and an admin reporting "that box says it broke" is far
    // easier to act on with the stack sitting in their devtools.
    console.error('Admin panel failed to render', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mt-8 rounded-3xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm text-amber-600 sm:p-6">
        This section could not be loaded. If the server was updated recently, reload the page — the
        rest of this page still works.
      </div>
    );
  }
}
