'use client';

import { useEffect, useRef } from 'react';

/**
 * A centred dialog for a form that should not be hunted for.
 *
 * Written because "Add user" sat in the page header and opened its form
 * inline at the very bottom of a long settings page — below four other
 * sections, off screen. Pressing it looked like pressing a dead button,
 * and the form it had opened was found by scrolling, if at all.
 *
 * Deliberately small, and not a dependency: this needs a backdrop, Escape,
 * a focus trap and a scroll lock, which is a few dozen lines, against a
 * dialog library's bundle on a page the workspace admin opens rarely.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // The page behind must not scroll under the dialog — on a phone that
    // is the difference between a dialog and a confusing overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus moves into the dialog so the keyboard goes where the eye
    // already is, and so a screen reader announces the form rather than
    // leaving the user in the page behind it.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstField = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button',
    );
    firstField?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // A focus trap, because Tab out of a modal lands on controls the
      // backdrop is covering — reachable by keyboard, invisible to the eye.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 py-8 backdrop-blur-sm sm:items-center"
      // A click on the backdrop closes; a click that merely STARTED inside
      // the panel and drifted out (selecting text, dragging a slider) must
      // not, which is what checking the target rather than using onClick
      // on a wrapper gets wrong.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-2xl rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
            {description ? <p className="mt-1 text-[13px] leading-snug text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-full px-2.5 py-1 text-xl leading-none text-muted transition hover:bg-black/5 hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
