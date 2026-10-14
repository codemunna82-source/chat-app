'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { VoxoError } from '@/lib/voxo';

/**
 * A styled confirm step for a permanent delete, replacing `window.confirm`.
 *
 * Two rounds, not one: the first calls `onConfirm(false)`. If the server
 * refuses with a 409 (something is still attached — numbers on a Business
 * Manager, chats on a number), that refusal's own message is shown here
 * rather than swallowed, with a second, explicitly-worded button that
 * retries as `onConfirm(true)` — the admin's deliberate "take it with it"
 * rather than this dialog silently escalating on their behalf.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  forceLabel = 'Delete anyway',
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  /** Shown once the server has refused and named what is still attached. */
  forceLabel?: string;
  onClose: () => void;
  onConfirm: (force: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  /** The server's 409 — still has something attached. Offers the force retry. */
  const [blocked, setBlocked] = useState<string | null>(null);
  /** Anything else that went wrong. No force offered — retrying the same way is the right next step. */
  const [failure, setFailure] = useState<string | null>(null);

  async function run(force: boolean) {
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm(force);
      setBlocked(null);
      onClose();
    } catch (err) {
      if (err instanceof VoxoError && err.status === 409) {
        setBlocked(err.message);
      } else {
        setBlocked(null);
        setFailure(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    setBlocked(null);
    setFailure(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} description={description}>
      {blocked ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-[13px] font-medium leading-snug text-amber-700 dark:text-amber-400">{blocked}</p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-amber-700/80 dark:text-amber-400/80">
            Deleting anyway takes everything attached with it — there is no undo.
          </p>
        </div>
      ) : null}

      {failure ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-[13px] font-medium leading-snug text-rose-600 dark:text-rose-400">{failure}</p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="text-[13px] font-semibold text-muted hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <Button
          type="button"
          variant="outline"
          className="border-rose-500/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-400"
          disabled={busy}
          onClick={() => void run(blocked !== null)}
        >
          {busy ? 'Deleting…' : blocked ? forceLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
