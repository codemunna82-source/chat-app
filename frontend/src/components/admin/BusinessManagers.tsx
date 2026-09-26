'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createMetaApp,
  listMetaApps,
  retryMetaAppConnection,
  rotateMetaAppVerifyToken,
  updateMetaApp,
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
/**
 * What Meta's real verdict on this Business Manager means, in words —
 * worst-case across every WhatsApp account it holds. Null for CONNECTED,
 * PENDING (still connecting, not yet broken) or when it holds no accounts
 * at all: there is nothing wrong to say in either case.
 */
function accountStatusWarning(accountStatus: string | null | undefined): string | null {
  switch (accountStatus) {
    case 'EXPIRED':
      return 'Meta connection expired — nothing under this Business Manager can send until a fresh access token is saved below.';
    case 'ERROR':
      return 'Meta rejected this Business Manager’s last connection attempt — check the access token below, and that its System User still has the WhatsApp account assigned in Meta Business Suite.';
    case 'DISCONNECTED':
      return 'Meta reports this Business Manager as disconnected — nothing under it can send right now.';
    default:
      return null;
  }
}

function CredentialState({ set }: { set: boolean }) {
  return set ? (
    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Saved</span>
  ) : (
    <span className="font-semibold text-amber-700 dark:text-amber-400">Not set</span>
  );
}

/**
 * What is wrong with a pasted app secret, in words, or null if nothing is.
 *
 * Said while it is being typed rather than on submit, because the two
 * credentials look nothing alike and are pasted into each other's boxes
 * constantly — an access token starts `EAA` and runs to 200-odd
 * characters, an app secret is exactly 32 hex digits. Submitting the
 * wrong one used to answer "Request validation failed", which named
 * neither the field nor the problem.
 */
function appSecretProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^EAA/i.test(v)) return 'That looks like an access token — it belongs in the access token box.';
  if (/^\d+$/.test(v)) return 'That looks like an App ID, not the app secret.';
  if (!/^[0-9a-fA-F]+$/.test(v)) return 'An app secret is only the characters 0-9 and a-f.';
  if (/[A-F]/.test(v)) return 'Copy it again from Meta — an app secret is lowercase, and changing the case changes the key.';
  if (v.length !== 32) return `An app secret is 32 characters. This one is ${v.length}.`;
  return null;
}

/** The same, for an access token. */
function accessTokenProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^[0-9a-f]{32}$/.test(v)) return 'That looks like an app secret — it belongs in the app secret box.';
  if (!/^EAA/i.test(v)) return 'A System User token starts with “EAA”.';
  return null;
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
  const [retrying, setRetrying] = useState<string | null>(null);
  /** Which app's credentials are being edited, if any. */
  const [editing, setEditing] = useState<string | null>(null);
  const [editToken, setEditToken] = useState('');
  const [editSecret, setEditSecret] = useState('');
  const [saving, setSaving] = useState(false);

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

  /**
   * Retries with the access token already saved — for when the fix
   * happened entirely on Meta's side (a System User asset assignment, a
   * connected app revoked) and the stored token itself never needed to
   * change. Without this the only way to clear EXPIRED was to paste the
   * same token back into "Replace credentials", which reads as pointless
   * when nothing about the token actually changed.
   */
  async function handleRetryConnection(id: string) {
    setRetrying(id);
    setError(null);
    try {
      const result = await retryMetaAppConnection(id);
      await load();
      await onChanged?.();
      if (result.reconnectedAccounts === 0) {
        setError('Nothing here was marked expired — there was nothing to retry.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retry the connection.');
    } finally {
      setRetrying(null);
    }
  }

  /**
   * Set or replace an existing Business Manager's credentials.
   *
   * The access token is the one that matters in practice: without it the
   * server falls back to the environment's token, which belongs to a
   * DIFFERENT Business Manager and therefore cannot see this one's
   * numbers at all — the BM sits at "0 numbers" with nothing saying why.
   * There was no way to set it after creation, so the only route was to
   * have pasted it into the add form on the first attempt.
   *
   * Both fields are optional here: whichever is filled in is replaced,
   * and an empty one is left exactly as it was. Neither can be read back,
   * so the inputs always start blank rather than pretending to show what
   * is stored.
   */
  async function handleSaveCredentials(id: string) {
    const token = editToken.trim();
    const secret = editSecret.trim();
    if (!token && !secret) return;

    setSaving(true);
    setError(null);
    try {
      await updateMetaApp(id, {
        ...(token ? { accessToken: token } : {}),
        ...(secret ? { appSecret: secret } : {}),
      });
      setEditing(null);
      setEditToken('');
      setEditSecret('');
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save those credentials.');
    } finally {
      setSaving(false);
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
                  {/* Meta's real, current verdict — not the ACTIVE/DISABLED
                      pill above, which is only this admin's own local
                      switch and says nothing about whether Meta will
                      actually accept a send right now. */}
                  {accountStatusWarning(a.accountStatus) ? (
                    <div className="mt-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                      <p className="text-[12.5px] font-medium leading-snug text-rose-600 dark:text-rose-400">
                        {accountStatusWarning(a.accountStatus)}
                      </p>
                      {a.id && a.accountStatus === 'EXPIRED' ? (
                        <button
                          type="button"
                          disabled={retrying === a.id}
                          onClick={() => void handleRetryConnection(a.id!)}
                          className="mt-1.5 text-[12.5px] font-semibold text-rose-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-rose-300"
                        >
                          {retrying === a.id
                            ? 'Retrying…'
                            : 'Try again with the credentials already saved — no new token needed'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
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
              {editing === a.id ? (
                <div className="mt-3 grid gap-3 rounded-2xl border border-border bg-surface/60 p-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">Access token</span>
                    <Input
                      value={editToken}
                      onChange={(e) => setEditToken(e.target.value)}
                      placeholder="EAA…"
                      autoComplete="off"
                    />
                    {accessTokenProblem(editToken) ? (
                      <span className="text-[12px] font-medium leading-snug text-rose-500">
                        {accessTokenProblem(editToken)}
                      </span>
                    ) : (
                      <span className="text-[12px] leading-snug text-muted">
                        A System User token from THIS Business Manager. Business settings &rarr; Users &rarr;
                        System users &rarr; Generate new token, with whatsapp_business_management and
                        whatsapp_business_messaging. Assign the WhatsApp account as an asset too, or the token
                        will not see any numbers.
                      </span>
                    )}
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      App secret <span className="font-normal normal-case text-muted">(only to replace it)</span>
                    </span>
                    <Input
                      value={editSecret}
                      onChange={(e) => setEditSecret(e.target.value)}
                      placeholder="Leave blank to keep the current one"
                      autoComplete="off"
                    />
                    {appSecretProblem(editSecret) ? (
                      <span className="text-[12px] font-medium leading-snug text-rose-500">
                        {appSecretProblem(editSecret)}
                      </span>
                    ) : null}
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      onClick={() => void handleSaveCredentials(a.id)}
                      disabled={
                        saving ||
                        (!editToken.trim() && !editSecret.trim()) ||
                        accessTokenProblem(editToken) !== null ||
                        appSecretProblem(editSecret) !== null
                      }
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setEditToken('');
                        setEditSecret('');
                      }}
                      className="text-[13px] font-semibold text-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setEditing(editing === a.id ? null : a.id);
                  setEditToken('');
                  setEditSecret('');
                }}
                className="text-[12.5px] font-semibold text-accent underline-offset-2 hover:underline"
              >
                {a.hasAccessToken ? 'Replace credentials' : 'Add an access token'}
              </button>
              <button
                type="button"
                onClick={() => void handleRotate(a.id)}
                disabled={rotating === a.id}
                className="mt-2 text-[12.5px] font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-50"
              >
                {rotating === a.id ? 'Generating…' : 'Generate a new verify token'}
              </button>
              </div>
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
            {appSecretProblem(appSecret) ? (
              <span className="text-[12px] font-medium leading-snug text-rose-500">
                {appSecretProblem(appSecret)}
              </span>
            ) : (
              <span className="text-[12px] leading-snug text-muted">
                App settings &rarr; Basic &rarr; App Secret &rarr; Show. 32 characters, 0-9 and a-f. Stored
                encrypted and never shown again.
              </span>
            )}
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
            {accessTokenProblem(accessToken) ? (
              <span className="text-[12px] font-medium leading-snug text-rose-500">
                {accessTokenProblem(accessToken)}
              </span>
            ) : (
              <span className="text-[12px] leading-snug text-muted">
                Needed to add numbers under this BM — a token from another BM cannot see them.
              </span>
            )}
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
