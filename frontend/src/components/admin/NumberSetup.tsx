'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addWhatsAppNumber,
  fetchMetaConfigHealth,
  registerNumberForCloudApi,
  type MetaConfigHealth,
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
  onChanged,
}: {
  numbers: WhatsAppNumber[];
  onChanged: () => void | Promise<void>;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
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
      const added = await addWhatsAppNumber(id, wabaId.trim());
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
                  {n.health ? (
                    <p className="mt-1 text-[12.5px] text-muted">
                      {n.health.headline}
                      {n.health.stale ? ' · reading is old' : ''}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  className="h-9 min-h-9 shrink-0 px-3 text-[13px]"
                  disabled={busy !== null}
                  onClick={() => void handleRegister(n.id, n.displayPhoneNumber)}
                >
                  {busy === n.id ? 'Registering…' : pending ? 'Register with Meta' : 'Re-register'}
                </Button>
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
