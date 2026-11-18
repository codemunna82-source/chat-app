'use client';

import { BellIcon, CloseIcon } from './waIcons';

/**
 * The offer to turn on notifications.
 *
 * Its own bar inside the chat rather than a call to
 * Notification.requestPermission() on load, and the difference is not
 * cosmetic. A permission prompt raised without a tap is refused by every
 * modern browser, and the refusal is remembered — so a page that asks
 * immediately does not merely annoy, it permanently loses the ability to
 * ask. This bar is the tap.
 *
 * It also says what the notifications are FOR before asking. "example.com
 * wants to send you notifications" is a question nobody can answer well;
 * "know when they reply, even with this tab closed" is the same question
 * with the information needed to answer it.
 *
 * Dismissing is remembered, so it is asked once and not on every load.
 */
export function NotifyBar({
  businessName,
  busy,
  onEnable,
  onDismiss,
}: {
  businessName: string;
  busy: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="z-10 flex shrink-0 items-center gap-3 border-t border-[var(--wa-divider)] bg-[var(--wa-composer)] px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--wa-accent)]/14 text-[var(--wa-accent)]">
        <BellIcon className="h-[19px] w-[19px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-[18px] text-[var(--wa-text)]">
          Get notified when {businessName} replies
        </p>
        <p className="text-[12px] leading-[16px] text-[var(--wa-card-sub)]">
          Messages and calls reach you even with this tab closed.
        </p>
      </div>

      <button
        type="button"
        onClick={onEnable}
        disabled={busy}
        className="h-8 shrink-0 rounded-full bg-[var(--wa-accent)] px-4 text-[13px] font-medium text-white transition active:scale-95 disabled:opacity-50"
      >
        {busy ? 'Wait…' : 'Turn on'}
      </button>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 hover:bg-[var(--wa-hover)]"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
