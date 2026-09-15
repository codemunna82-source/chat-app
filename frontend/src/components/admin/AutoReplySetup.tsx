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
  const [mode, setMode] = useState<'text' | 'template'>('text');
  const [message, setMessage] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('');
  const [bodyVariable, setBodyVariable] = useState<'none' | 'customer_name'>('none');
  const [maxSends, setMaxSends] = useState(1);
  const [holdWhatsApp, setHoldWhatsApp] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetchTenantSettings()
      .then((s) => {
        setSettings(s);
        setMode(s.autoGuestLink.mode);
        setMessage(s.autoGuestLink.message);
        setTemplateName(s.autoGuestLink.templateName);
        setTemplateLanguage(s.autoGuestLink.templateLanguage || 'en');
        setBodyVariable(s.autoGuestLink.bodyVariable);
        setMaxSends(s.autoGuestLink.maxSends);
        setHoldWhatsApp(s.autoGuestLink.holdWhatsAppUntilOpened);
        setWelcomeMessage(s.autoGuestLink.welcomeMessage);
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
        mode,
        message: message.trim() || undefined,
        templateName: templateName.trim() || undefined,
        templateLanguage: templateLanguage.trim() || undefined,
        bodyVariable,
        maxSends,
        holdWhatsAppUntilOpened: holdWhatsApp,
        welcomeMessage,
      });
      // Re-read rather than merging the save response: `active` is only
      // computed on the settings read, so merging would leave the badge
      // showing a staleness the save just resolved.
      setSettings(await fetchTenantSettings());
      // Read the saved values back rather than leaving what was typed: the
      // server clamps maxSends and trims the greeting, so the form should
      // show what was actually stored, not what was submitted.
      setMode(saved.mode);
      setMessage(saved.message);
      setMaxSends(saved.maxSends);
      setHoldWhatsApp(saved.holdWhatsAppUntilOpened);
      setWelcomeMessage(saved.welcomeMessage);
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
  // Switched on, but naming no template — so nothing is being sent. The
  // state is reachable for any workspace that turned this on before it
  // took a template, and reading "On" while every message is skipped is
  // the kind of thing that surfaces as a customer complaint rather than
  // as a setting anyone thinks to check.
  const onButtInert = enabled && settings.autoGuestLink.active === false;
  const pattern = settings.guestLinkUrlPattern;
  // Text mode needs nothing but the server's base URL — which is the
  // whole reason it is the default: a workspace should not wait on a Meta
  // review to get its first customer into the chat window.
  const canEnable =
    Boolean(settings.guestLinkConfigured) &&
    (mode === 'text' || Boolean(templateName.trim() && templateLanguage.trim()));

  return (
    <section className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">Automatic chat invitation</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            onButtInert
              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
              : enabled
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-foreground/10 text-muted'
          }`}
        >
          {onButtInert ? 'On · not sending' : enabled ? 'On' : 'Off'}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted">
        When a customer messages your WhatsApp number, VOXO replies straight away with a link to
        their own private chat window.{' '}
        <strong className="font-semibold text-foreground">Sent once per customer</strong>, not on
        every message: once someone has a live link, they will not be sent another until it expires
        or an agent replaces it.
      </p>

      {onButtInert ? (
        <p className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-snug text-amber-700 dark:text-amber-400">
          This is switched on but names no approved template, so{' '}
          <strong className="font-semibold">nothing is being sent</strong>. Either fill in the
          template name and language, or switch to a plain message &mdash; then save.
        </p>
      ) : null}

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

      {/* The choice that decides everything below it, so it comes first. */}
      <fieldset className="mt-5 border-0 p-0">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          How the invitation is sent
        </legend>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <label
            htmlFor="mode-text"
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 ${
              mode === 'text' ? 'border-primary/45 bg-primary/[0.06]' : 'border-border bg-surface/60'
            }`}
          >
            <input
              id="mode-text"
              type="radio"
              name="auto-reply-mode"
              checked={mode === 'text'}
              onChange={() => setMode('text')}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">
                A plain message{' '}
                <span className="font-normal text-muted">&mdash; works right now</span>
              </span>
              <span className="mt-1 block text-[12.5px] leading-snug text-muted">
                No template, no Meta review. Allowed because the reply goes out the moment a
                customer writes, while WhatsApp&rsquo;s 24-hour window is open.
              </span>
            </span>
          </label>

          <label
            htmlFor="mode-template"
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 ${
              mode === 'template'
                ? 'border-primary/45 bg-primary/[0.06]'
                : 'border-border bg-surface/60'
            }`}
          >
            <input
              id="mode-template"
              type="radio"
              name="auto-reply-mode"
              checked={mode === 'template'}
              onChange={() => setMode('template')}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">
                An approved template{' '}
                <span className="font-normal text-muted">&mdash; with a button</span>
              </span>
              <span className="mt-1 block text-[12.5px] leading-snug text-muted">
                Meta renders a real tappable button instead of a bare link, which strangers are far
                likelier to use. Needs a template approved first.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {mode === 'text' ? (
        <>
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              What the customer receives
            </span>
            <textarea
              id="auto-reply-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={900}
              className="w-full rounded-2xl glass-input px-3 py-2.5 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            />
            <span className="text-[12px] leading-snug text-muted">
              <span className="font-mono">{'{{link}}'}</span> becomes that customer&rsquo;s own
              private link. Keep it on its own line &mdash; WhatsApp only makes a URL tappable when
              it stands alone.
            </span>
          </label>

          <div className="mt-4 rounded-2xl border border-border bg-surface/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              What it looks like
            </p>
            <div className="mt-2 max-w-xs rounded-2xl rounded-tr-md bg-[#25d366]/15 px-3 py-2.5">
              <p className="whitespace-pre-wrap text-[13.5px] leading-snug text-foreground">
                {(message.trim() || 'Your message here').replace(
                  '{{link}}',
                  `${settings.guestLinkUrlPattern?.replace('{{1}}', 'a1b2c3') ?? 'https://…/c/a1b2c3'}`,
                )}
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-5 rounded-2xl border border-border bg-surface/60 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              First, create the template in WhatsApp Manager
            </p>
            <ol className="mt-2.5 flex list-decimal flex-col gap-1.5 pl-4 text-[13px] leading-snug text-muted">
              <li>
                WhatsApp Manager &rarr; <strong className="text-foreground">Message templates</strong>{' '}
                &rarr; Create template. Category{' '}
                <strong className="text-foreground">Utility</strong>.
              </li>
              <li>Write the body text &mdash; this is what the customer reads.</li>
              <li>
                Add <strong className="text-foreground">one button</strong>, type{' '}
                <strong className="text-foreground">Visit website</strong>, set to{' '}
                <strong className="text-foreground">Dynamic</strong>.
              </li>
              <li>Paste this as the button URL:</li>
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
              Submit and wait for approval, then name it below.{' '}
              <strong className="font-semibold text-foreground">
                The URL cannot be corrected after approval
              </strong>{' '}
              &mdash; check it now.
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
                Exactly as WhatsApp Manager shows it.
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Language
              </span>
              <Input
                id="auto-reply-language"
                value={templateLanguage}
                onChange={(e) => setTemplateLanguage(e.target.value)}
                placeholder="en"
                autoComplete="off"
              />
              <span className="text-[12px] leading-snug text-muted">
                <span className="font-mono">en</span>, <span className="font-mono">en_US</span> and{' '}
                <span className="font-mono">hi</span> are different templates to Meta.
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
                <option value="none">No &mdash; the body is plain text</option>
                <option value="customer_name">Yes &mdash; {'{{1}}'} is the customer&rsquo;s name</option>
              </select>
              <span className="text-[12px] leading-snug text-muted">
                Must match the template exactly, either way.
              </span>
            </label>
          </div>
        </>
      )}

      {/* Everything below only matters once the invitation is going out, so
          it sits after the template and before the switch. */}
      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          How hard to push
        </h3>

        <label className="mt-3 flex flex-col gap-1.5 sm:max-w-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Send the invitation
          </span>
          <select
            id="auto-reply-max-sends"
            value={maxSends}
            onChange={(e) => setMaxSends(Number(e.target.value))}
            className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          >
            <option value={1}>Once per customer</option>
            <option value={2}>Twice — again if they write without opening it</option>
            <option value={3}>Three times</option>
          </select>
          <span className="text-[12px] leading-snug text-muted">
            A customer who writes again without tapping the link probably never saw it. Past three,
            they are not missing it &mdash; they are declining it.
          </span>
        </label>

        <label
          htmlFor="auto-reply-hold"
          className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3.5"
        >
          <input
            id="auto-reply-hold"
            type="checkbox"
            checked={holdWhatsApp}
            onChange={(e) => setHoldWhatsApp(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">
              Hide their WhatsApp messages until they open the chat
            </span>
            <span className="mt-1 block text-[12.5px] leading-snug text-muted">
              Nothing is lost &mdash; every message is saved and appears in full the moment they
              arrive. But{' '}
              <strong className="font-semibold text-foreground">
                a customer who never taps the link is never seen
              </strong>
              , and nobody will know they wrote. Leave this off unless the web chat is the only way
              you want to talk.
            </span>
          </span>
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Greeting when they arrive
          </span>
          <textarea
            id="auto-reply-welcome"
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            rows={2}
            maxLength={900}
            placeholder="Hello, welcome! How can we help?"
            className="w-full rounded-2xl glass-input px-3 py-2.5 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          />
          <span className="text-[12px] leading-snug text-muted">
            Posted into the chat the first time they write from the window. Your agents see it too,
            so nobody repeats it. Leave blank for no greeting.
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
            Save settings
          </Button>
        ) : null}
      </div>
    </section>
  );
}
