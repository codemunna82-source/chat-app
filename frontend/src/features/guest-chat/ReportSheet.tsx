'use client';

import { useState } from 'react';
import { GuestLinkInvalidError, submitReport } from './guestApi';
import { BlockIcon, CheckIcon, CloseIcon, FlagIcon, LockIcon, ShieldIcon } from './waIcons';
import { REPORT_REASONS, type ReportReason, type ThreadMessage } from './types';
import { tapFeedback } from './useDismissOnBack';

export type ReportIntent = 'report' | 'block';

/**
 * Reporting the business, blocking it, or both.
 *
 * One sheet for the two because they are one decision: the person opening
 * it wants this to stop, and which of the two buttons achieves that is not
 * a distinction they should have to make before they can begin. The intent
 * they arrived with only decides which is pre-selected.
 *
 * The message being reported is shown, not merely referenced. A report
 * form that says "you are reporting a message" without showing which one
 * is asking someone to sign something they cannot read — and the same copy
 * shown here is the copy the server stores, so what they saw is what gets
 * reviewed.
 */
export function ReportSheet({
  token,
  demo,
  businessName,
  message,
  intent,
  onClose,
  onBlockedChange,
}: {
  token: string;
  demo: boolean;
  businessName: string;
  /** The message the complaint is about, or null for the whole conversation. */
  message: ThreadMessage | null;
  intent: ReportIntent;
  onClose: () => void;
  onBlockedChange: (blocked: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(intent === 'block');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the server has accepted it — the sheet becomes the receipt. */
  const [done, setDone] = useState<{ reported: boolean; blocked: boolean } | null>(null);

  const reporting = intent === 'report';
  const canSubmit = reporting ? reason !== null : true;

  async function handleSubmit() {
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const block = reporting ? alsoBlock : true;
    try {
      if (demo) {
        // Nothing is filed against a canned transcript. Saying so is the
        // point — a demo that showed "Report received" would be claiming a
        // report reached someone, which is the one thing this screen must
        // never get wrong.
        await new Promise((r) => setTimeout(r, 450));
      } else {
        await submitReport(token, {
          reason: reporting ? (reason ?? undefined) : undefined,
          details: details.trim() || undefined,
          messageId: reporting && message && !message.pending ? message.id : undefined,
          block,
          report: reporting,
        });
      }
      tapFeedback([14, 60, 14]);
      if (block) onBlockedChange(true);
      setDone({ reported: reporting, blocked: block });
    } catch (err) {
      if (err instanceof GuestLinkInvalidError) {
        setError('This chat link is no longer valid.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not send that. Try again in a moment.');
      }
    } finally {
      setSubmitting(false);
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

      <div className="wa-sheet-enter relative flex max-h-[88dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[18px] bg-[var(--wa-card)] pb-[env(safe-area-inset-bottom,0px)] text-[var(--wa-text)] shadow-[var(--wa-panel-shadow)]">
        <span className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-[var(--wa-divider)]" aria-hidden />

        {done ? (
          <Receipt done={done} businessName={businessName} demo={demo} onClose={onClose} />
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--wa-hover)] text-[var(--wa-icon)]">
                {reporting ? <FlagIcon className="h-[19px] w-[19px]" /> : <BlockIcon className="h-[19px] w-[19px]" />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-medium leading-tight">
                  {reporting ? 'Report' : 'Block'} {businessName}
                </h2>
                <p className="truncate text-[12.5px] text-[var(--wa-card-sub)]">
                  {reporting
                    ? 'Only you and this business are in this chat'
                    : 'They will not be able to message or call you here'}
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

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-2">
              {reporting && message && <HighlightedMessage message={message} businessName={businessName} />}

              {reporting && (
                <>
                  <p className="mb-1.5 mt-3 text-[13px] font-medium text-[var(--wa-card-sub)]">
                    Why are you reporting this?
                  </p>
                  <div className="overflow-hidden rounded-[10px] border border-[var(--wa-divider)]">
                    {REPORT_REASONS.map((option, i) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setReason(option.value)}
                        aria-pressed={reason === option.value}
                        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left text-[14.5px] transition ${
                          i > 0 ? 'border-t border-[var(--wa-divider)]' : ''
                        } ${reason === option.value ? 'bg-[var(--wa-accent)]/10' : 'hover:bg-[var(--wa-hover)]'}`}
                      >
                        <span
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                            reason === option.value
                              ? 'border-[var(--wa-accent)]'
                              : 'border-[var(--wa-card-sub)]/50'
                          }`}
                        >
                          {reason === option.value && (
                            <span className="h-2 w-2 rounded-full bg-[var(--wa-accent)]" />
                          )}
                        </span>
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-[13px] font-medium text-[var(--wa-card-sub)]">
                      Anything else? <span className="font-normal">(optional)</span>
                    </span>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
                      rows={3}
                      placeholder="What happened?"
                      className="w-full resize-none rounded-[10px] border border-[var(--wa-divider)] bg-[var(--wa-input)] px-3 py-2.5 text-[14.5px] leading-[20px] outline-none placeholder:text-[var(--wa-meta)] focus:border-[var(--wa-accent)]"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setAlsoBlock((v) => !v)}
                    aria-pressed={alsoBlock}
                    className="mt-3 flex w-full items-center gap-3 rounded-[10px] border border-[var(--wa-divider)] px-3.5 py-3 text-left transition hover:bg-[var(--wa-hover)]"
                  >
                    <span
                      className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border-2 ${
                        alsoBlock
                          ? 'border-[var(--wa-accent)] bg-[var(--wa-accent)] text-white'
                          : 'border-[var(--wa-card-sub)]/50'
                      }`}
                    >
                      {alsoBlock && <CheckIcon className="h-3 w-3" />}
                    </span>
                    <span className="text-[14.5px] leading-[19px]">
                      Block {businessName} as well
                      <span className="block text-[12.5px] text-[var(--wa-card-sub)]">
                        You can unblock at any time
                      </span>
                    </span>
                  </button>
                </>
              )}

              {!reporting && (
                <div className="mt-1 rounded-[10px] bg-[var(--wa-hover)] px-3.5 py-3 text-[13.5px] leading-[19px] text-[var(--wa-card-sub)]">
                  <p className="mb-1.5 font-medium text-[var(--wa-text)]">While {businessName} is blocked</p>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>They cannot send you messages or call you in this chat.</li>
                    <li>You cannot send messages here either.</li>
                    <li>Everything already in this chat stays where it is.</li>
                    <li>You can unblock at any time — nothing is deleted.</li>
                  </ul>
                </div>
              )}

              {error && (
                <p className="mt-3 rounded-[10px] bg-red-500/10 px-3.5 py-2.5 text-[13.5px] leading-[19px] text-red-600">
                  {error}
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--wa-divider)] px-4 pb-3 pt-3">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit || submitting}
                className="flex h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#e0483d] text-[15px] font-medium text-white transition active:scale-[0.98] disabled:opacity-45"
              >
                {submitting ? 'Sending…' : reporting ? (alsoBlock ? 'Report and block' : 'Report') : 'Block'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-1.5 h-[42px] w-full rounded-full text-[15px] font-medium text-[var(--wa-card-sub)] transition active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The message the report is about, shown the way a quote is shown in the
 * thread — same accent bar, same one-line preview — so it is recognisably
 * the thing that was on screen a moment ago rather than a new fragment.
 */
function HighlightedMessage({
  message,
  businessName,
}: {
  message: ThreadMessage;
  businessName: string;
}) {
  const preview =
    message.text?.trim() ||
    (message.type === 'image'
      ? 'Photo'
      : message.type === 'audio'
        ? 'Voice message'
        : message.type === 'location'
          ? 'Location'
          : message.type);

  return (
    <div className="rounded-[10px] bg-[var(--wa-accent)]/10 p-[3px] ring-1 ring-[var(--wa-accent)]/35">
      <div className="rounded-[8px] border-l-[3px] border-[var(--wa-accent)] bg-[var(--wa-card)] px-3 py-2.5">
        <p className="text-[12px] font-medium text-[var(--wa-accent)]">
          {message.from === 'me' ? 'You' : businessName}
        </p>
        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-[14px] leading-[19px] text-[var(--wa-text)]">
          {preview}
        </p>
      </div>
      <p className="px-3 pb-1 pt-1.5 text-[11.5px] leading-[15px] text-[var(--wa-card-sub)]">
        This message is attached to your report.
      </p>
    </div>
  );
}

/**
 * What the customer sees after submitting.
 *
 * It replaces the form rather than closing over it, because the useful
 * moment is right here: someone who has just reported a business wants to
 * know it went somewhere, what happens next, and that they can leave. A
 * toast that fades in two seconds answers none of those.
 *
 * Every line is something that is actually true of this system. It does
 * not promise a reply, a timeline, or an outcome — a receipt that invents
 * a process is worse than no receipt.
 */
function Receipt({
  done,
  businessName,
  demo,
  onClose,
}: {
  done: { reported: boolean; blocked: boolean };
  businessName: string;
  demo: boolean;
  onClose: () => void;
}) {
  const headline = done.reported
    ? done.blocked
      ? 'Report sent, and blocked'
      : 'Thanks — your report is in'
    : `${businessName} is blocked`;

  return (
    <div className="flex flex-col items-center px-6 pb-5 pt-5 text-center">
      <span className="wa-receipt-pop flex h-[62px] w-[62px] items-center justify-center rounded-full bg-[var(--wa-accent)]/14 text-[var(--wa-accent)]">
        <CheckIcon className="h-8 w-8" />
      </span>

      <h2 className="mt-3.5 text-[19px] font-medium leading-tight">{headline}</h2>

      <p className="mt-1.5 max-w-[330px] text-[14px] leading-[20px] text-[var(--wa-card-sub)]">
        {demo
          ? 'This is the demo chat, so nothing was actually sent or blocked — the real window files the report and applies the block straight away.'
          : done.reported
            ? 'A person will read it. We have kept a copy of the message you flagged, so it stays readable even if it is deleted.'
            : 'They can no longer message or call you here. Nothing in this chat has been deleted.'}
      </p>

      {!demo && (
        <div className="mt-4 w-full space-y-2 text-left">
          {done.reported && (
            <ReceiptRow icon={<FlagIcon className="h-[17px] w-[17px]" />}>
              Your report and the message you attached were saved.
            </ReceiptRow>
          )}
          {done.blocked && (
            <ReceiptRow icon={<BlockIcon className="h-[17px] w-[17px]" />}>
              {businessName} is blocked. You can unblock from the bar at the bottom of the chat.
            </ReceiptRow>
          )}
          <ReceiptRow icon={<LockIcon className="h-[17px] w-[17px]" />}>
            Nothing here is shared with anyone outside this chat.
          </ReceiptRow>
          <ReceiptRow icon={<ShieldIcon className="h-[17px] w-[17px]" />}>
            If you are in danger, contact your local emergency number — this chat cannot do that for you.
          </ReceiptRow>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-5 h-[46px] w-full rounded-full bg-[var(--wa-accent)] text-[15px] font-medium text-white transition active:scale-[0.98]"
      >
        Done
      </button>
    </div>
  );
}

function ReceiptRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] bg-[var(--wa-hover)] px-3 py-2.5">
      <span className="mt-[1px] shrink-0 text-[var(--wa-accent)]">{icon}</span>
      <p className="text-[13px] leading-[18px] text-[var(--wa-card-sub)]">{children}</p>
    </div>
  );
}
