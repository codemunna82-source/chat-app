'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  setNumberBusinessManager,
  addWhatsAppNumber,
  fetchMetaConfigHealth,
  registerNumberForCloudApi,
  setNumberEnabled,
  setNumberCalling,
  generateLinkApiKey,
  revokeLinkApiKey,
  type MetaConfigHealth,
  type MetaAppSummary,
  type WhatsAppNumber,
  type LinkApiKeyIssued,
} from '@/lib/voxo';

/**
 * Connecting a WhatsApp number to the workspace, in the two steps Meta
 * actually requires.
 *
 * They are separate because they fail separately, and conflating them is
 * how a number ends up looking configured and still unable to send.
 * Adding it tells VOXO the number exists and checks the id against Meta.
 * Registering it is Meta's own POST /{phone_number_id}/register — the call
 * that takes the six-digit PIN — and until it runs the number stays
 * "Pending" and every send fails with a "not registered" error.
 *
 * Only the id is typed here. The PIN and the access token are the
 * server's: Meta treats the PIN as the number's two-step verification
 * code and it has to stay the same forever, so it belongs in configuration
 * rather than in a form where a different value each time would silently
 * break re-registration — and an access token typed into a browser is an
 * access token in a network log.
 */
export function NumberSetup({
  numbers,
  metaApps,
  onChanged,
}: {
  numbers: WhatsAppNumber[];
  metaApps: MetaAppSummary[];
  onChanged: () => void | Promise<void>;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [metaAppId, setMetaAppId] = useState('');
  /** Which number's Business Manager is being changed, if any. */
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveBusy, setMoveBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [calling, setCalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [config, setConfig] = useState<MetaConfigHealth | null>(null);
  const [keyBusy, setKeyBusy] = useState<string | null>(null);
  /** The plaintext key just issued — shown once, then gone even from state. */
  const [issuedKey, setIssuedKey] = useState<(LinkApiKeyIssued & { numberId: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  // Read once, before the form is used rather than after it fails: "Meta
  // refused the registration" is a dead end when the real answer is that
  // nobody set the PIN.
  useEffect(() => {
    void fetchMetaConfigHealth().then(setConfig);
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const id = phoneNumberId.trim();
    if (!id || busy) return;

    setBusy('add');
    setError(null);
    setNotice(null);
    try {
      const added = await addWhatsAppNumber({
        phoneNumberId: id,
        wabaId: wabaId.trim(),
        metaAppId: metaAppId || undefined,
      });
      setPhoneNumberId('');
      setWabaId('');
      await onChanged();
      // Straight into step two. Adding a number and leaving it Pending is
      // the half-finished state this whole panel exists to prevent, and
      // nobody adds a number intending to stop there.
      await handleRegister(added.id, added.displayPhoneNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Meta would not accept that id.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Turning one number's access on or off.
   *
   * Its own busy flag rather than sharing `busy` with registration: they
   * disable different controls, and one spinner covering both would grey
   * out a Register button because someone flipped a switch three rows
   * down.
   */
  async function handleToggle(id: string, enabled: boolean) {
    setToggling(id);
    setError(null);
    setNotice(null);
    try {
      const number = await setNumberEnabled(id, enabled);
      setNotice(
        enabled
          ? `${number.displayPhoneNumber}: access restored. Members assigned to it can sign in again.`
          : `${number.displayPhoneNumber}: access turned off. Members assigned to it are signed out and will see "Your access has been turned off."`,
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change access for that number.');
    } finally {
      setToggling(null);
    }
  }

  /**
   * Switching WhatsApp voice calling on for a number, at Meta.
   *
   * The whole calling path is already built — an inbound call creates a
   * log, rings the agent and pushes to their phone — but calling is OFF
   * by default on every number Meta issues, so none of it ever fires
   * until this is flipped, and nothing about the number's status says so.
   */
  async function handleCalling(id: string, enabled: boolean) {
    setCalling(id);
    setError(null);
    setNotice(null);
    try {
      const number = await setNumberCalling(id, enabled);
      setNotice(
        enabled
          ? `${number.displayPhoneNumber}: calling is on at Meta. Customers see a call button in their WhatsApp chat.`
          : `${number.displayPhoneNumber}: calling is off. Customers can no longer call this number.`,
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change calling for that number.');
    } finally {
      setCalling(null);
    }
  }

  async function handleRegister(id: string, label: string) {
    setBusy(id);
    setError(null);
    try {
      const result = await registerNumberForCloudApi(id);
      setNotice(`${label}: ${result.message}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(null);
    }
  }

  const blockers: string[] = [];
  if (config) {
    if (config.mockMode) {
      blockers.push(
        'The server is in mock mode, so nothing here reaches Meta — any id will appear to work. Set META_MOCK_MODE=false on the backend.',
      );
    }
    if (!config.accessTokenConfigured) blockers.push('META_ACCESS_TOKEN is not set on the backend.');
    if (!config.registerPinConfigured) {
      blockers.push(
        'META_REGISTER_PIN is not set on the backend. Choose any six digits and keep them the same from then on — it is the number’s two-step verification PIN.',
      );
    }
  }

  /**
   * Move a number onto a different Business Manager.
   *
   * The server checks with Meta first and refuses if the target BM cannot
   * see the number, so the error it returns is the actual diagnosis —
   * usually that the System User has the app assigned but not the
   * WhatsApp account. It is shown as-is rather than replaced.
   */
  async function handleMove(id: string) {
    setMoveBusy(true);
    setError(null);
    try {
      await setNumberBusinessManager(id, moveTarget || null);
      setMovingId(null);
      setMoveTarget('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move that number.');
    } finally {
      setMoveBusy(false);
    }
  }

  /**
   * Generates (or replaces) this number's integration key, for an
   * external automation — WhatsApp Flows, a BSP chatbot — that needs a
   * fresh private-chat link per customer rather than a static one that
   * only ever works for whichever customer it was originally minted for.
   */
  async function handleGenerateKey(id: string) {
    setKeyBusy(id);
    setError(null);
    setNotice(null);
    setCopied(false);
    try {
      const issued = await generateLinkApiKey(id);
      setIssuedKey({ ...issued, numberId: id });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a key for that number.');
    } finally {
      setKeyBusy(null);
    }
  }

  async function handleRevokeKey(id: string, label: string) {
    setKeyBusy(id);
    setError(null);
    setNotice(null);
    try {
      await revokeLinkApiKey(id);
      if (issuedKey?.numberId === id) setIssuedKey(null);
      setNotice(`${label}: integration key revoked. Any automation still using it will stop working.`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke that key.');
    } finally {
      setKeyBusy(null);
    }
  }

  async function handleCopyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS in some
      // browsers); the key is still selectable text in the box either way.
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">WhatsApp numbers</h2>
        <p className="text-[12.5px] text-muted">Two steps: add it, then register it with Meta.</p>
      </div>

      {blockers.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {blockers.map((line) => (
            <li
              key={line}
              className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-snug text-amber-700 dark:text-amber-400"
            >
              {line}
            </li>
          ))}
        </ul>
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

      {numbers.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2">
          {numbers.map((n) => {
            const pending = n.status !== 'CONNECTED';
            // Absent means on: numbers stored before this switch existed
            // have no value, and reading that as "off" would lock out a
            // whole workspace on the deploy that shipped it.
            const enabled = n.enabled !== false;
            // Absent means never read from Meta, which is not the same as
            // off — so the switch shows unchecked but the row says the
            // status is unknown rather than asserting one.
            const callingOn = n.callingStatus === 'ENABLED';
            return (
              <li
                key={n.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    <span className="truncate">{n.displayPhoneNumber}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        pending
                          ? 'bg-amber-500/14 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-500/14 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {pending ? n.status.toLowerCase() : 'connected'}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[12.5px] text-muted">{n.phoneNumberId}</p>
                  {/* The number itself can read CONNECTED while the
                      Business Manager's own access token behind it is
                      dead — Meta rejects every send with no other signal
                      anywhere in this app. This is the one place that
                      failure becomes visible before an agent finds out
                      from a customer who never got a reply. */}
                  {n.accountStatus && n.accountStatus !== 'CONNECTED' ? (
                    <p className="mt-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12.5px] font-medium leading-snug text-rose-600 dark:text-rose-400">
                      This number&rsquo;s Business Manager connection is {n.accountStatus.toLowerCase()} —
                      nothing can be sent from it until it is reconnected. Generate a fresh access
                      token for its Business Manager in Meta Business Suite, then update it under
                      Business Managers below.
                    </p>
                  ) : null}
                  {/* Said in words as well as by the switch: "never read
                      from Meta" is not the same as "off", and an admin
                      asking why a call has not arrived deserves to be
                      told which of the two it is. */}
                  {!n.callingStatus ? (
                    <p className="mt-1 text-[12.5px] text-muted">
                      Calling status not read from Meta yet — open this page again in a minute, or
                      switch calling on to set it.
                    </p>
                  ) : null}
                  {!enabled ? (
                    <p className="mt-1 text-[12.5px] font-medium text-amber-600 dark:text-amber-400">
                      Members assigned to this number cannot sign in or send. Customer messages still
                      arrive and wait.
                    </p>
                  ) : null}
                  {n.health ? (
                    <p className="mt-1 text-[12.5px] text-muted">
                      {n.health.headline}
                      {n.health.stale ? ' · reading is old' : ''}
                    </p>
                  ) : null}

                  {/* Which Business Manager answers for this number.
                      It decides which token sends and which webhook URL
                      receives, and it was the one thing about a number
                      this page never showed. */}
                  <p className="mt-1 text-[12.5px] text-muted">
                    Business Manager: <span className="text-foreground">{n.metaAppName ?? 'Server default'}</span>
                    {metaApps.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMovingId(movingId === n.id ? null : n.id);
                          setMoveTarget(n.metaAppId ?? '');
                        }}
                        className="ml-2 font-semibold text-accent underline-offset-2 hover:underline"
                      >
                        Change
                      </button>
                    ) : null}
                  </p>

                  {movingId === n.id ? (
                    <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-border bg-surface/70 p-3">
                      <select
                        value={moveTarget}
                        onChange={(e) => setMoveTarget(e.target.value)}
                        className="h-11 w-full rounded-xl glass-input px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:text-sm"
                      >
                        <option value="">The server&rsquo;s default configuration</option>
                        {metaApps
                          .filter((a) => a.status === 'ACTIVE')
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                      <p className="text-[12px] leading-snug text-muted">
                        Checked with Meta before anything changes — if the new Business Manager cannot see this
                        number, nothing is moved. Afterwards its webhook URL must be configured in Meta, or
                        messages will send but never arrive.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          className="h-9 min-h-9 px-3 text-[13px]"
                          disabled={moveBusy || (moveTarget || null) === (n.metaAppId ?? null)}
                          onClick={() => void handleMove(n.id)}
                        >
                          {moveBusy ? 'Checking with Meta…' : 'Move'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setMovingId(null)}
                          className="text-[13px] font-semibold text-muted hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* For an automation outside VOXO — WhatsApp Flows, a
                      BSP chatbot — that sends the private-chat invitation
                      instead of VOXO's own code. It cannot get a working
                      link any other way: the token is unique per customer
                      and only this server can mint one, so a static link
                      pasted into it works once and then shows "expired"
                      for everyone after. */}
                  <div className="mt-2 rounded-2xl border border-border bg-surface/70 p-3">
                    <p className="text-[12.5px] font-semibold text-foreground">
                      Automation integration
                    </p>
                    {issuedKey?.numberId === n.id ? (
                      <div className="mt-1.5 flex flex-col gap-2">
                        <p className="text-[12px] leading-snug text-amber-600 dark:text-amber-400">
                          Shown once — copy it now. It will not be shown again.
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border bg-surface px-3 py-2 text-[12px] whitespace-nowrap">
                            {issuedKey.key}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 min-h-9 shrink-0 px-3 text-[13px]"
                            onClick={() => void handleCopyKey(issuedKey.key)}
                          >
                            {copied ? 'Copied' : 'Copy'}
                          </Button>
                        </div>
                        <p className="text-[12px] leading-snug text-muted">
                          POST to <code className="break-all">{issuedKey.endpoint}</code> with header{' '}
                          <code>X-VOXO-Link-Key</code> set to this key, and JSON body{' '}
                          <code>{'{ "phone": "+91XXXXXXXXXX" }'}</code> — the response&rsquo;s{' '}
                          <code>data.url</code> is that customer&rsquo;s private-chat link.
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-[12.5px] text-muted">
                        {n.linkApiKeyCreatedAt
                          ? `Key generated ${new Date(n.linkApiKeyCreatedAt).toLocaleDateString()}.`
                          : 'No key yet — needed only if an outside automation sends the invitation.'}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 min-h-9 px-3 text-[13px]"
                        disabled={keyBusy !== null}
                        onClick={() => void handleGenerateKey(n.id)}
                      >
                        {keyBusy === n.id
                          ? 'Generating…'
                          : n.linkApiKeyCreatedAt
                            ? 'Generate a new key'
                            : 'Generate key'}
                      </Button>
                      {n.linkApiKeyCreatedAt ? (
                        <button
                          type="button"
                          disabled={keyBusy !== null}
                          onClick={() => void handleRevokeKey(n.id, n.displayPhoneNumber)}
                          className="text-[13px] font-semibold text-rose-500 hover:text-rose-600 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                  {/* WhatsApp voice calling, at Meta. Off by default on
                      every number, and the most common reason a call
                      never arrives. */}
                  <label className="flex w-full cursor-pointer items-center justify-between gap-2 sm:w-auto sm:justify-start">
                    <span className="text-[13px] font-medium text-muted">
                      {callingOn ? 'Calling on' : 'Calling off'}
                    </span>
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={callingOn}
                      disabled={calling !== null}
                      onChange={(e) => void handleCalling(n.id, e.target.checked)}
                      aria-label={`WhatsApp voice calling for ${n.displayPhoneNumber}`}
                    />
                    <span
                      aria-hidden
                      className={`relative h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface ${
                        callingOn ? 'bg-primary' : 'bg-border'
                      } ${calling !== null ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                          callingOn ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </label>

                  {/* The access switch. A real checkbox underneath, so it
                      is reachable by keyboard and announced as what it is;
                      the track and knob are only its appearance. */}
                  <label className="flex w-full cursor-pointer items-center justify-between gap-2 sm:w-auto sm:justify-start">
                    <span className="text-[13px] font-medium text-muted">
                      {enabled ? 'Access on' : 'Access off'}
                    </span>
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={enabled}
                      disabled={toggling !== null}
                      onChange={(e) => void handleToggle(n.id, e.target.checked)}
                      aria-label={`Access to ${n.displayPhoneNumber} for the members assigned to it`}
                    />
                    <span
                      aria-hidden
                      className={`relative h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface ${
                        enabled ? 'bg-emerald-500' : 'bg-border'
                      } ${toggling !== null ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                          enabled ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </span>
                  </label>

                  <Button
                    variant="outline"
                    className="h-9 min-h-9 w-full px-3 text-[13px] sm:w-auto sm:shrink-0"
                    disabled={busy !== null}
                    onClick={() => void handleRegister(n.id, n.displayPhoneNumber)}
                  >
                    {busy === n.id ? 'Registering…' : pending ? 'Register with Meta' : 'Re-register'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 rounded-2xl border border-border bg-surface/60 px-4 py-4 text-sm text-muted">
          No numbers connected yet. Paste the phone number ID from WhatsApp Manager below — the long
          numeric one, not <span className="font-mono">+91…</span>.
        </p>
      )}

      <form onSubmit={handleAdd} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Phone number ID</span>
          <Input
            id="wa-phone-number-id"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="109876543210987"
            inputMode="numeric"
            autoComplete="off"
          />
          <span className="text-[12px] leading-snug text-muted">
            WhatsApp Manager → your number → the numeric ID under it
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            WhatsApp Business Account ID
          </span>
          <Input
            id="wa-waba-id"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="102233445566778"
            inputMode="numeric"
            autoComplete="off"
          />
          <span className="text-[12px] leading-snug text-muted">
            WhatsApp Manager &rarr; Account tools &rarr; the ID under your business account. Labelled optional
            and effectively required: without it this number is never subscribed to your Meta app, and{' '}
            <span className="text-foreground">inbound messages never arrive</span> — it will send perfectly
            and receive nothing.
          </span>
        </label>

        {metaApps.length > 0 ? (
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Business Manager
            </span>
            <select
              id="wa-meta-app"
              value={metaAppId}
              onChange={(e) => setMetaAppId(e.target.value)}
              className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:text-sm"
            >
              <option value="">The server&rsquo;s default configuration</option>
              {metaApps
                .filter((a) => a.status === 'ACTIVE')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
            <span className="text-[12px] leading-snug text-muted">
              Which Meta app this number lives under. Get this wrong and the number will send but
              never receive &mdash; Meta signs each webhook with its own app&rsquo;s secret.
            </span>
          </label>
        ) : null}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={!phoneNumberId.trim() || busy !== null}>
            {busy === 'add' ? 'Checking with Meta…' : 'Add and register'}
          </Button>
          <p className="mt-2.5 text-[12.5px] leading-snug text-muted">
            The PIN and access token come from the server’s configuration, not from this form — Meta
            treats that PIN as the number’s two-step verification code, so it has to be the same one
            every time.
          </p>
        </div>
      </form>
    </section>
  );
}
