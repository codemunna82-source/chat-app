'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createMetaApp,
  listMetaApps,
  rotateMetaAppVerifyToken,
  type MetaAppCreated,
  type MetaAppSummary,
} from '@/lib/voxo';

/**
 * The workspace's Business Managers.
 *
 * Meta caps how many numbers one Business Manager can hold, so growing
 * past that means a second BM — and a second BM is a second Meta app with
 * its own app secret, verify token and access token. None of them are
 * interchangeable: Meta signs every webhook with the secret of the app
 * subscribed to that WABA, so a number added under BM 2 and verified
 * against BM 1's secret sends perfectly and then never receives anything.
 *
 * Which is why each app gets its OWN webhook URL here, shown with a copy
 * button. The URL is what tells the server which secret to check a
 * delivery against, before any of the body is trusted.
 *
 * Secrets are write-only by design. They go in encrypted and never come
 * back out — the list can honestly say whether one is set, and nothing
 * more. A masked value would only invite someone to try reading it.
 */
/**
 * Whether a credential is set, never what it is.
 *
 * "Saved" rather than a masked value on purpose: a row of dots tells an
 * admin nothing they cannot get from this word, and invites them to think
 * the real value is one click away.
 */
function CredentialState({ set }: { set: boolean }) {
  return set ? (
    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Saved</span>
  ) : (
    <span className="font-semibold text-amber-700 dark:text-amber-400">Not set</span>
  );
}

export function BusinessManagers({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const [apps, setApps] = useState<MetaAppSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MetaAppCreated | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);

  const load = () =>
    listMetaApps()
      .then(setApps)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load Business Managers.'));

  useEffect(() => {
    void load();
  }, []);

  function copy(value: string, key: string) {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(key);
        window.setTimeout(() => setCopied(null), 2000);
      },
      () => setError('Could not copy — select the text and copy it by hand.'),
    );
  }

  /**
   * Mint a new verify token for an app whose first one was lost.
   *
   * Confirmed first, because it INVALIDATES the current one: on a webhook
   * that is already working in Meta, doing this by accident breaks it
   * until the callback URL is saved again.
   */
  async function handleRotate(id: string) {
    const app = apps?.find((a) => a.id === id);
    if (
      !window.confirm(
        `Generate a new verify token for ${app?.name ?? 'this Business Manager'}?\n\n` +
          'The current one stops working straight away, so you will have to save the callback URL ' +
          'again in Meta. Only do this if you no longer have the token.',
      )
    ) {
      return;
    }
    setRotating(id);
    setError(null);
    try {
      setCreated(await rotateMetaAppVerifyToken(id));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a new verify token.');
    } finally {
      setRotating(null);
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const app = await createMetaApp({
        name: name.trim(),
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        accessToken: accessToken.trim() || undefined,
      });
      // Held on screen rather than merely added to the list: the verify
      // token is shown once and never again, and it is needed in Meta's
      // dashboard in the next minute.
      setCreated(app);
      setName('');
      setAppId('');
      setAppSecret('');
      setAccessToken('');
      setOpen(false);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that Business Manager.');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = name.trim() && /^\d{5,}$/.test(appId.trim()) && /^[0-9a-f]{32}$/.test(appSecret.trim());

  return (
    <section className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">Business Managers</h2>
        <p className="text-[12.5px] text-muted">
          One per Meta app. Each has its own credentials and its own webhook URL.
        </p>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}

      {created ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            &ldquo;{created.name}&rdquo; added. Set these two in Meta now.
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-emerald-700/80 dark:text-emerald-400/80">
            developers.facebook.com &rarr; your app &rarr; WhatsApp &rarr; Configuration &rarr; Edit
          </p>

          <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Callback URL
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-foreground/[0.06] px-3 py-2 font-mono text-[12.5px]">
              {created.webhookUrl}
            </code>
            <Button
              type="button"
              variant="ghost"
              className="h-9 min-h-9 shrink-0 px-3 text-[13px]"
              onClick={() => copy(created.webhookUrl, 'url')}
            >
              {copied === 'url' ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Verify token
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-foreground/[0.06] px-3 py-2 font-mono text-[12.5px]">
              {created.verifyToken}
            </code>
            <Button
              type="button"
              variant="ghost"
              className="h-9 min-h-9 shrink-0 px-3 text-[13px]"
              onClick={() => copy(created.verifyToken, 'token')}
            >
              {copied === 'token' ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="mt-2 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-400">
            Copy the verify token now — it is stored encrypted and cannot be shown again.
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">
            Then subscribe the <span className="font-mono">messages</span> field, and add the
            number below choosing this Business Manager.
          </p>
          <Button type="button" variant="ghost" className="mt-3" onClick={() => setCreated(null)}>
            Done
          </Button>
        </div>
      ) : null}

      {apps === null ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {apps.map((a) => (
            <li
              key={a.id ?? 'default'}
              className="rounded-2xl border border-border bg-surface/60 px-4 py-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    <span className="truncate">{a.name}</span>
                    {a.isDefault ? (
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        from server config
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                          a.status === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-foreground/10 text-muted'
                        }`}
                      >
                        {a.status}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    <span className="font-semibold text-foreground">
                      {a.numberCount} {a.numberCount === 1 ? 'number' : 'numbers'}
                    </span>{' '}
                    on this Business Manager
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 min-h-9 shrink-0 px-3 text-[13px]"
                  onClick={() => copy(a.webhookUrl, a.id ?? 'default')}
                >
                  {copied === (a.id ?? 'default') ? 'Copied' : 'Copy webhook URL'}
                </Button>
              </div>

              {/* The three things an admin comes here to check, each either a
                  value that is safe to show or an honest yes/no. */}
              <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-border pt-3 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">App ID</dt>
                  <dd className="mt-0.5 truncate font-mono text-[12.5px]">{a.appId ?? 'not set'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">App secret</dt>
                  <dd className="mt-0.5">
                    <CredentialState set={a.hasAppSecret} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">Access token</dt>
                  <dd className="mt-0.5">
                    <CredentialState set={a.hasAccessToken} />
                  </dd>
                </div>
              </dl>

              <p className="mt-2.5 truncate font-mono text-[12px] text-muted">{a.webhookUrl}</p>

              {/* The way back from a verify token that was never copied.
                  It is shown once at creation and stored encrypted, so
                  without this an admin who closed that panel had no route
                  forward at all. */}
              <button
                type="button"
                onClick={() => void handleRotate(a.id)}
                disabled={rotating === a.id}
                className="mt-2 text-[12.5px] font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-50"
              >
                {rotating === a.id ? 'Generating…' : 'Generate a new verify token'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form onSubmit={handleAdd} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main BM" autoComplete="off" />
            <span className="text-[12px] leading-snug text-muted">Yours, to tell them apart. Meta never sees it.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">App ID</span>
            <Input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="1234567890123456"
              inputMode="numeric"
              autoComplete="off"
            />
            <span className="text-[12px] leading-snug text-muted">App settings &rarr; Basic &rarr; App ID</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">App secret</span>
            <Input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder="32 characters, 0-9 and a-f"
              autoComplete="off"
            />
            <span className="text-[12px] leading-snug text-muted">
              App settings &rarr; Basic &rarr; App Secret &rarr; Show. Stored encrypted and never shown again.
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Access token <span className="font-normal normal-case">(optional)</span>
            </span>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="EAA…"
              autoComplete="off"
            />
            <span className="text-[12px] leading-snug text-muted">
              Needed to add numbers under this BM — a token from another BM cannot see them.
            </span>
          </label>

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={!canSubmit || busy}>
              {busy ? 'Saving…' : 'Add Business Manager'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="ghost" className="mt-4" onClick={() => setOpen(true)}>
          Add a Business Manager
        </Button>
      )}
    </section>
  );
}
