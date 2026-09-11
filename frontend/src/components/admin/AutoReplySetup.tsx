'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchTenantSettings, updateAutoGuestLink, type TenantSettings } from '@/lib/voxo';

/**
 * The automatic private-chat invitation.
 *
 * Off by default and turned on here rather than in configuration, because
 * this is the one setting in the workspace that changes what strangers
 * receive on their own phones. That belongs behind a deliberate act by the
 * person who owns the number.
 *
 * What is NOT here is the wording. The invitation is an approved WhatsApp
 * template, so the text lives in WhatsApp Manager where Meta has reviewed
 * it; this screen only names which template to use. A message box here
 * would imply the words could be changed from this side, and the send
 * would then be rejected by Meta with the reason buried in a log.
 *
 * The setup instructions are on the panel rather than in a document,
 * because the one detail that goes wrong — the {{1}} suffix on the button
 * URL — cannot be corrected after the template is submitted for review.
 */
export function AutoReplySetup() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('');
  const [bodyVariable, setBodyVariable] = useState<'none' | 'customer_name'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetchTenantSettings()
      .then((s) => {
        setSettings(s);
        setTemplateName(s.autoGuestLink.templateName);
        setTemplateLanguage(s.autoGuestLink.templateLanguage || 'en');
        setBodyVariable(s.autoGuestLink.bodyVariable);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load settings.'));
  }, []);

  async function save(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await updateAutoGuestLink({
        enabled,
        templateName: templateName.trim() || undefined,
        templateLanguage: templateLanguage.trim() || undefined,
        bodyVariable,
      });
      setSettings((prev) => (prev ? { ...prev, autoGuestLink: saved } : prev));
      setNotice(
        saved.enabled
          ? 'On. The next customer who messages will be sent the template automatically.'
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
  const pattern = settings.guestLinkUrlPattern;
  const canEnable = Boolean(settings.guestLinkConfigured && templateName.trim() && templateLanguage.trim());

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
        When a customer messages your WhatsApp number, VOXO replies straight away with your approved
        template — the one whose button opens the private chat window.{' '}
        <strong className="font-semibold text-foreground">Sent once per customer</strong>, not on
        every message: once someone has a live link, they will not be sent another until it expires
        or an agent replaces it.
      </p>

      {!settings.guestLinkConfigured ? (
        <p className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-snug text-amber-700 dark:text-amber-400">
          The server has no <span className="font-mono">GUEST_LINK_BASE_URL</span> set, so there is
          no address for the template button. This cannot be turned on until that is configured.
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

      <div className="mt-5 rounded-2xl border border-border bg-surface/60 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          First, create the template in WhatsApp Manager
        </p>
        <ol className="mt-2.5 flex list-decimal flex-col gap-1.5 pl-4 text-[13px] leading-snug text-muted">
          <li>
            WhatsApp Manager → <strong className="text-foreground">Message templates</strong> →
            Create template. Category <strong className="text-foreground">Utility</strong>.
          </li>
          <li>Write the body text — this is what the customer reads.</li>
          <li>
            Add <strong className="text-foreground">one button</strong>, type{' '}
            <strong className="text-foreground">Visit website</strong>, and set it to{' '}
            <strong className="text-foreground">Dynamic</strong>.
          </li>
          <li>
            Paste this as the button URL — the{' '}
            <span className="font-mono">{'{{1}}'}</span> at the end is what VOXO fills with each
            customer&rsquo;s own token:
          </li>
        </ol>

        {pattern ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-foreground/[0.06] px-3 py-2 font-mono text-[12.5px] text-foreground">
              {pattern}
            </code>
            <Button
              type="button"
              variant="ghost"
              className="h-9 min-h-9 shrink-0 px-3 text-[13px]"
              onClick={() => {
                void navigator.clipboard?.writeText(pattern).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  },
                  () => setError('Could not copy — select the text and copy it by hand.'),
                );
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : null}

        <p className="mt-2.5 text-[12.5px] leading-snug text-muted">
          Submit it and wait for Meta to approve — usually minutes. Then name it below.{' '}
          <strong className="font-semibold text-foreground">
            The URL cannot be corrected after approval
          </strong>{' '}
          — a wrong one means creating a new template, so check it now.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Template name
          </span>
          <Input
            id="auto-reply-template"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="private_chat_invite"
            autoComplete="off"
          />
          <span className="text-[12px] leading-snug text-muted">
            Exactly as WhatsApp Manager shows it — lowercase, underscores, no spaces.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Language</span>
          <Input
            id="auto-reply-language"
            value={templateLanguage}
            onChange={(e) => setTemplateLanguage(e.target.value)}
            placeholder="en"
            autoComplete="off"
          />
          <span className="text-[12px] leading-snug text-muted">
            The code on the approved copy — <span className="font-mono">en</span>,{' '}
            <span className="font-mono">en_US</span> and <span className="font-mono">hi</span> are
            different templates to Meta.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Does the body have a variable?
          </span>
          <select
            id="auto-reply-body-var"
            value={bodyVariable}
            onChange={(e) => setBodyVariable(e.target.value as 'none' | 'customer_name')}
            className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          >
            <option value="none">No — the body is plain text</option>
            <option value="customer_name">Yes — {'{{1}}'} is the customer&rsquo;s name</option>
          </select>
          <span className="text-[12px] leading-snug text-muted">
            Must match the template exactly. Meta rejects the send either way if this is wrong.
          </span>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void save(!enabled)}
          disabled={busy || (!enabled && !canEnable)}
          variant={enabled ? 'ghost' : 'default'}
        >
          {busy ? 'Saving…' : enabled ? 'Turn off' : 'Turn on'}
        </Button>
        {enabled ? (
          <Button type="button" variant="ghost" onClick={() => void save(true)} disabled={busy}>
            Save template details
          </Button>
        ) : null}
      </div>
    </section>
  );
}
