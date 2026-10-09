'use client';

import { BlockIcon, FlagIcon } from './waIcons';

/**
 * Report and Block, at the end of the thread.
 *
 * They already live in the header's overflow menu, which is where the
 * messenger this copies keeps them — but a menu behind three dots is a
 * place you have to already know about. Someone who has just been asked
 * for an OTP by a stranger is not going to go looking, so the pair sits
 * where the conversation ends and where the window opens: below the last
 * message, in reach of the thumb that is already there.
 *
 * It scrolls with the thread rather than being pinned above the composer.
 * Pinned, it would take a permanent strip off every screen of a chat that
 * is almost always ordinary — and it would sit under the keyboard the
 * moment anyone typed.
 *
 * Neither button does anything on its own: both open the sheet, which
 * asks. That is what makes it safe to put a Block button within reach of
 * a mis-tap.
 */
export function SafetyRow({
  blocked,
  onReport,
  onBlock,
}: {
  blocked: boolean;
  onReport: () => void;
  onBlock: () => void;
}) {
  // Nothing while blocked. The bar that replaces the composer is on screen
  // permanently in that state and already carries Unblock — a second one
  // just above it makes the customer choose between two identical buttons.
  if (blocked) return null;

  return (
    <Shell>
      <Pill onClick={onReport} tone="plain">
        <FlagIcon className="h-[15px] w-[15px]" />
        Report
      </Pill>
      <Pill onClick={onBlock} tone="danger">
        <BlockIcon className="h-[15px] w-[15px]" />
        Block
      </Pill>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-3 flex flex-col items-center gap-1.5">
      <div className="flex items-center justify-center gap-2">{children}</div>
      <p className="px-6 text-center text-[11.5px] leading-[15px] text-[var(--wa-meta)]">
        Tell us if something here is not right. Nothing is sent until you confirm.
      </p>
    </div>
  );
}

function Pill({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: 'plain' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-[var(--wa-danger)]/40 text-[var(--wa-danger)] hover:bg-[var(--wa-danger)]/10'
      : 'border-[var(--wa-divider)] text-[var(--wa-chip-text)] hover:bg-[var(--wa-hover)]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border bg-[var(--wa-chip)] px-3.5 py-[7px] text-[13px] font-medium shadow-[var(--wa-bubble-shadow)] transition active:scale-95 ${toneClass}`}
    >
      {children}
    </button>
  );
}
