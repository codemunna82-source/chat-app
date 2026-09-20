'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  getWhatsAppNudges,
  updateWhatsAppNudges,
  type WhatsAppNudgePolicy,
} from '@/lib/voxo';

/**
 * The only words that reach a customer who has not opened their private
 * chat.
 *
 * Its own section because it is the highest-consequence setting on this
 * page and reads nothing like the others: free-form WhatsApp messages to
 * someone who never engaged are what Meta's policy reviewers act on, and
 * the cost of getting it wrong is not this workspace's numbers, it is
 * every number on the business account.
 *
 * The list length is the allowance, which is why there is no separate
 * count to set: two messages means two WhatsApp messages, then the
 * private link is the only way through.
 */
export function WhatsAppNudges() {
  const [policy, setPolicy] = useState<WhatsAppNudgePolicy | null>(null);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getWhatsAppNudges()
      .then((p) => {
        setPolicy(p);
        setDrafts(p.nudges);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load these messages.'));
  }, []);

  async function save(patch: { enforced?: boolean; messages?: string[] }) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await updateWhatsAppNudges(patch);
      setPolicy(next);
      setDrafts(next.nudges);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these messages.');
    } finally {
      setSaving(false);
    }
  }

  if (!policy) {
    return <p className="text-sm text-muted">{error ?? 'Loading…'}</p>;
  }

  const changed = JSON.stringify(drafts) !== JSON.stringify(policy.nudges);
  const usable = drafts.filter((d) => d.trim()).length > 0;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}

      <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface/60 p-4">
        <input
          type="checkbox"
          checked={policy.enforced}
          disabled={saving}
          onChange={(e) => void save({ enforced: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Send only these messages</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
            On, an agent can send nothing else over WhatsApp until the customer opens their private
            chat — not their own wording, not a photo. Off, they get{' '}
            {policy.limit} free-form replies instead, which is what Meta&rsquo;s reviewers look at.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-4">
        {drafts.map((text, i) => (
          <label key={i} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Message {i + 1} of {drafts.length}
              {i === 0 ? ' · sent first' : i === 1 ? ' · sent second' : null}
            </span>
            <textarea
              value={text}
              rows={7}
              maxLength={1024}
              disabled={saving}
              onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? e.target.value : d)))}
              className="w-full rounded-2xl glass-input px-3 py-2.5 text-base leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:text-sm"
            />
            <span className="text-[12px] text-muted">{text.length} / 1024</span>
          </label>
        ))}
      </div>

      <p className="text-[12.5px] leading-snug text-muted">
        These are ordinary WhatsApp messages, not Meta-approved templates — they work because the
        customer messaged first, which opens a 24-hour window. The approved template is the separate
        one that carries the private chat link and goes out before these. That is why these refer to
        the link rather than containing it: its address is only ever issued once, and re-issuing it
        would kill the copy already in the customer&rsquo;s thread.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={saving || !changed || !usable}
          onClick={() => void save({ messages: drafts.map((d) => d.trim()).filter(Boolean) })}
        >
          {saving ? 'Saving…' : 'Save messages'}
        </Button>

        {changed ? (
          <button
            type="button"
            onClick={() => setDrafts(policy.nudges)}
            className="text-[13px] font-semibold text-muted hover:text-foreground"
          >
            Undo changes
          </button>
        ) : null}

        {policy.defaults && policy.defaults.length > 0 ? (
          <button
            type="button"
            onClick={() => setDrafts(policy.defaults as string[])}
            className="text-[13px] font-semibold text-muted hover:text-foreground"
          >
            Use the original wording
          </button>
        ) : null}

        {saved ? <span className="text-[13px] font-semibold text-emerald-600">Saved</span> : null}
      </div>
    </div>
  );
}
