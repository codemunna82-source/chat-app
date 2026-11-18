'use client';

import { useState } from 'react';
import { deleteGuestMessage } from './guestApi';
import { CloseIcon, TrashIcon } from './waIcons';
import type { ThreadMessage } from './types';
import { tapFeedback } from './useDismissOnBack';

/**
 * How long after sending a message can still be taken back from the
 * business's inbox.
 *
 * The server holds the real rule and is the only thing that enforces it —
 * this copy exists so the window does not offer a button that is going to
 * come back refused. Deliberately a minute short of the server's hour, so
 * a request sent at the very edge does not fail because of clock skew
 * between a phone and the server.
 */
const REVOKE_WINDOW_MS = 59 * 60 * 1000;

export function canDeleteForEveryone(message: ThreadMessage, now = Date.now()): boolean {
  // Someone else's message is not yours to unsend. The business's own
  // copy of this rule is the mirror of it.
  if (message.from !== 'me') return false;
  if (message.pending || message.revokedAt) return false;
  // A message the customer sent from WhatsApp shows in this window, and
  // Meta has no way to recall one. Treat a missing channel as WhatsApp:
  // an older server does not send the field, and the cost of being wrong
  // that way is a button that is not offered, rather than one that is
  // offered and always fails.
  if (message.channel !== 'web') return false;
  const sent = Date.parse(message.createdAt);
  return Number.isFinite(sent) && now - sent <= REVOKE_WINDOW_MS;
}

/**
 * The two deletes, as a choice rather than a confirmation.
 *
 * "Delete for me" and "Delete for everyone" do genuinely different things
 * — one tidies this window, the other reaches into the business's inbox
 * and removes what they were sent — and a single "Are you sure?" would
 * hide that difference behind the word "delete". So each button says what
 * it does, and the one that cannot be undone says so underneath.
 *
 * Delete for everyone is simply absent when it is not available, rather
 * than shown greyed out: a disabled button invites a second tap and
 * explains nothing. The line under the sheet's title says why.
 */
export function DeleteSheet({
  token,
  demo,
  message,
  onClose,
  onDeleted,
}: {
  token: string;
  demo: boolean;
  message: ThreadMessage;
  onClose: () => void;
  /** Applied by the window: 'me' drops the row, 'everyone' leaves a tombstone. */
  onDeleted: (scope: 'me' | 'everyone') => void;
}) {
  const [busy, setBusy] = useState<'me' | 'everyone' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const forEveryone = canDeleteForEveryone(message);
  const mine = message.from === 'me';

  async function run(scope: 'me' | 'everyone') {
    if (busy) return;
    setBusy(scope);
    setError(null);
    tapFeedback(12);
    try {
      if (!demo) await deleteGuestMessage(token, message.id, scope);
      onDeleted(scope);
      onClose();
    } catch (err) {
      // The server's own wording, which says which rule was hit — "it has
      // been too long", "you can only delete your own". A generic failure
      // line here would send someone to try again at something that is
      // never going to work.
      setError(err instanceof Error ? err.message : 'That did not work. Please try again.');
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45"
      />

      <div className="wa-sheet-enter relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-t-[18px] bg-[var(--wa-card)] pb-[env(safe-area-inset-bottom,0px)] text-[var(--wa-text)] shadow-[var(--wa-panel-shadow)]">
        <span className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-[var(--wa-divider)]" aria-hidden />

        <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--wa-hover)] text-[var(--wa-icon)]">
            <TrashIcon className="h-[19px] w-[19px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-medium leading-tight">Delete message</h2>
            <p className="text-[12.5px] leading-snug text-[var(--wa-card-sub)]">
              {forEveryone
                ? 'You can still take this one back'
                : !mine
                  ? 'This one is the business’s message, so only your copy can go'
                  : message.channel !== 'web'
                    ? 'You sent this on WhatsApp, which cannot be taken back'
                    : 'Too long ago to take back — you can still remove it from your side'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 hover:bg-[var(--wa-hover)]"
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="px-4 pb-4 pt-3">
          {error && (
            <p className="mb-2.5 rounded-[10px] bg-[var(--wa-danger,#d93025)]/10 px-3 py-2 text-[13px] text-[var(--wa-danger,#d93025)]">
              {error}
            </p>
          )}

          <div className="overflow-hidden rounded-[12px] border border-[var(--wa-divider)]">
            {forEveryone && (
              <button
                type="button"
                onClick={() => void run('everyone')}
                disabled={busy !== null}
                className="flex w-full flex-col items-start gap-0.5 px-3.5 py-3 text-left transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
              >
                <span className="text-[15px] font-medium">
                  {busy === 'everyone' ? 'Deleting…' : 'Delete for everyone'}
                </span>
                <span className="text-[12.5px] text-[var(--wa-card-sub)]">
                  Removes it from the business’s inbox too. This cannot be undone.
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void run('me')}
              disabled={busy !== null}
              className={`flex w-full flex-col items-start gap-0.5 px-3.5 py-3 text-left transition hover:bg-[var(--wa-hover)] disabled:opacity-60 ${
                forEveryone ? 'border-t border-[var(--wa-divider)]' : ''
              }`}
            >
              <span className="text-[15px] font-medium">{busy === 'me' ? 'Deleting…' : 'Delete for me'}</span>
              <span className="text-[12.5px] text-[var(--wa-card-sub)]">
                Hides it here. The business still has their copy.
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="mt-2.5 w-full rounded-[12px] border border-[var(--wa-divider)] px-3.5 py-2.5 text-[15px] font-medium transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
