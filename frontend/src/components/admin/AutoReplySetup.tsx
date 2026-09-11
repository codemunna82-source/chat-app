'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  fetchTenantSettings,
  updateAutoGuestLink,
  type TenantSettings,
} from '@/lib/voxo';

/**
 * The automatic private-chat invitation.
 *
 * Off by default and turned on here rather than in configuration, because
 * this is the one setting in the workspace that changes what strangers
 * receive on their own phones. That belongs behind a deliberate act by the
 * person who owns the number, with the wording in front of them while they
 * decide — not a server flag nobody sees.
 *
 * The "sent once" rule is stated on the panel rather than left to be
 * discovered: an admin's first fear on reading "automatic reply" is that
 * every message gets one, and the answer to that fear is the reason they
 * will leave it on.
 */
export function AutoReplySetup() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void fetchTenantSettings()
      .then((s) => {
        setSettings(s);
        setMessage(s.autoGuestLink.message);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load settings.'));
  }, []);

  async function save(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await updateAutoGuestLink({ enabled, message: message.trim() || undefined });
      setSettings((prev) => (prev ? { ...prev, autoGuestLink: saved } : prev));
      setMessage(saved.message);
      setNotice(
        saved.enabled
          ? 'On. The next customer who messages will get the link automatically.'
          : 'Off. Agents can still send the link by hand from the app.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <section className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-tight">Automatic chat invitation</h2>
        <p className="mt-2 text-sm text-muted">{error ?? 'Loading…'}</p>
      </section>
    );
  }

  const enabled = settings.autoGuestLink.enabled;
  // A message with no placeholder still works — the server appends the URL
  // — but saying so up front beats letting an admin wonder where it went.
  const hasPlaceholder = message.includes('{{link}}');

  return (
    <section className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">Automatic chat invitation</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            enabled
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-foreground/10 text-muted'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted">
        When a customer messages your WhatsApp number, VOXO replies straight away with a link to
        the private chat window — no agent needed.{' '}
        <strong className="font-semibold text-foreground">Sent once per customer</strong>, not on
        every message: once someone has a live link, they will not be sent another until it expires
        or an agent replaces it.
      </p>

      {!settings.guestLinkConfigured ? (
        <p className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-snug text-amber-700 dark:text-amber-400">
          The server has no <span className="font-mono">GUEST_LINK_BASE_URL</span> set, so there is
          no address to send. This cannot be turned on until that is configured.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {notice}
        </p>
      ) : null}

      <label className="mt-5 flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          What the customer receives
        </span>
        <textarea
          id="auto-reply-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={900}
          className="w-full rounded-2xl glass-input px-3 py-2.5 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
        />
        <span className="text-[12px] leading-snug text-muted">
          {hasPlaceholder ? (
            <>
              <span className="font-mono">{'{{link}}'}</span> is replaced with the customer&rsquo;s
              own private link.
            </>
          ) : (
            <>
              No <span className="font-mono">{'{{link}}'}</span> in the text — the link will be
              added on its own line at the end.
            </>
          )}
        </span>
      </label>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void save(!enabled)}
          disabled={busy || (!enabled && !settings.guestLinkConfigured)}
          variant={enabled ? 'ghost' : 'default'}
        >
          {busy ? 'Saving…' : enabled ? 'Turn off' : 'Turn on'}
        </Button>
        {enabled ? (
          <Button type="button" variant="ghost" onClick={() => void save(true)} disabled={busy}>
            Save wording
          </Button>
        ) : null}
      </div>
    </section>
  );
}
