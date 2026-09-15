'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addWhatsAppNumber,
  fetchMetaConfigHealth,
  registerNumberForCloudApi,
  setNumberEnabled,
  setNumberCalling,
  type MetaConfigHealth,
  type MetaAppSummary,
  type WhatsAppNumber,
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
  const [busy, setBusy] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [calling, setCalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [config, setConfig] = useState<MetaConfigHealth | null>(null);

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
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface/60 px-4 py-3"
              >
                <div className="min-w-0">
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
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                  {/* WhatsApp voice calling, at Meta. Off by default on
                      every number, and the most common reason a call
                      never arrives. */}
                  <label className="flex cursor-pointer items-center gap-2">
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
                  <label className="flex cursor-pointer items-center gap-2">
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
                    className="h-9 min-h-9 shrink-0 px-3 text-[13px]"
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
            WhatsApp Business Account ID <span className="font-normal normal-case">(optional)</span>
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
            Only needed if this workspace has more than one WABA
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
              className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
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
