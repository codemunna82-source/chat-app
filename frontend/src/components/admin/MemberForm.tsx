'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createMember,
  updateMember,
  resetMemberPassword,
  type TeamMember,
  type WhatsAppNumber,
  type MetaAppSummary,
} from '@/lib/voxo';
import { useSession } from '@/store/useSession';
import { DEFAULT_PERMISSIONS, PERMISSION_GROUPS } from './permissions';

/** Every number the flat list used to show at once, before it was grouped by Business Manager. */
const ALL_NUMBERS = '__all_numbers__';

/** A day count that reads as a real expiry, not a countdown to worry about. */
const NEAR_EXPIRY_DAYS = 3;

/** yyyy-mm-dd for `days` from today — what an `<input type="date">` and the server both take. */
function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A year out — long enough not to be busywork, short enough to be a real expiry. */
function defaultExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Whole days from now until `dateStr` (23:59:59 local), negative once it has passed. */
function daysUntil(dateStr: string): number {
  const end = new Date(`${dateStr}T23:59:59`).getTime();
  return Math.ceil((end - Date.now()) / 86_400_000);
}

const EXPIRY_PRESETS: { label: string; days: number }[] = [
  { label: 'Demo · 2 days', days: 2 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

export function MemberForm({
  member,
  numbers,
  metaApps,
  onClose,
  onSaved,
}: {
  member: TeamMember | null;
  numbers: WhatsAppNumber[];
  /** Groups the number picker by which Business Manager each number lives under. */
  metaApps: MetaAppSummary[];
  onClose: () => void;
  /** `created` distinguishes a new account from an edit — the caller opens the
   *  number panel for the first and not the second. */
  onSaved: (created: boolean) => void | Promise<void>;
}) {
  const isEdit = member !== null;
  // Resetting your own password revokes your own sessions too, so the hint
  // has to say so — an admin who does it and is then signed out without
  // warning reads it as the app breaking.
  const isSelf = useSession((s) => s.session?.user.id) === member?.id;

  // Country code fixed at +91 rather than typed: a free-text phone field
  // let it be dropped by accident — a pasted number, a backspace one
  // character too many — and the account then signs in with a login
  // nobody would recognise as broken until they tried it. Only the ten
  // digits after it are ever edited.
  const initialDigits = (member?.phone ?? '').startsWith('+91')
    ? (member?.phone ?? '').slice(3)
    : (member?.phone ?? '').replace(/^\+/, '');
  const [phoneDigits, setPhoneDigits] = useState(initialDigits);
  const phone = `+91${phoneDigits}`;

  const [email, setEmail] = useState(member?.email ?? '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(member?.displayName ?? '');
  const [role, setRole] = useState<'MASTER_ADMIN' | 'SUB_USER'>(member?.role ?? 'SUB_USER');
  const [validUntil, setValidUntil] = useState(
    member ? member.validUntil.slice(0, 10) : defaultExpiry(),
  );
  const [numberId, setNumberId] = useState(member?.whatsappPhoneNumberId ?? '');

  // Which Business Manager the number picker below is showing. Purely a
  // filter — nothing here is submitted — so numbers can be found by which
  // business they belong to instead of hunted for in one flat list, which
  // is unreadable past a couple of Business Managers.
  const currentNumber = member?.whatsappPhoneNumberId
    ? numbers.find((n) => n.id === member.whatsappPhoneNumberId)
    : undefined;
  const [selectedBm, setSelectedBm] = useState<string>(
    currentNumber ? currentNumber.metaAppId ?? '' : ALL_NUMBERS,
  );

  const [permissions, setPermissions] = useState<string[]>(
    member?.permissions ?? DEFAULT_PERMISSIONS,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An admin has every permission by definition, so showing a checklist
  // they cannot change would be a control that does nothing.
  const showPermissions = role === 'SUB_USER';

  const toggle = (value: string) =>
    setPermissions((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );

  // One row per Business Manager that actually has a number on it, named
  // the way NumberSetup already names them — a BM with zero numbers has
  // nothing to offer here regardless of what metaApps lists.
  const bmGroups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; numbers: WhatsAppNumber[] }>();
    for (const n of numbers) {
      const key = n.metaAppId ?? '';
      // The number's own name first; metaApps as a fallback for a number
      // that predates the field being stored, so a group is never just
      // labelled "Business Manager" while the real name sits one lookup
      // away.
      const label =
        n.metaAppName ||
        metaApps.find((a) => (a.id ?? '') === key)?.name ||
        (key ? 'Business Manager' : 'Server default');
      const existing = byKey.get(key);
      if (existing) existing.numbers.push(n);
      else byKey.set(key, { key, label, numbers: [n] });
    }
    return Array.from(byKey.values());
  }, [numbers, metaApps]);

  const numbersInSelectedBm =
    selectedBm === ALL_NUMBERS ? numbers : bmGroups.find((g) => g.key === selectedBm)?.numbers ?? [];

  function handleBmChange(next: string) {
    setSelectedBm(next);
    // A number that belonged to the old filter rarely belongs to the new
    // one, and carrying it over silently would leave "WhatsApp number"
    // showing one business while the picker above says another — so it is
    // cleared unless it is still valid under the new filter.
    const stillValid =
      next === ALL_NUMBERS
        ? numbers.some((n) => n.id === numberId)
        : numbers.some((n) => n.id === numberId && (n.metaAppId ?? '') === next);
    if (!stillValid) setNumberId('');
  }

  const daysLeft = daysUntil(validUntil);
  const isDemoPreset = EXPIRY_PRESETS[0] ? validUntil === daysFromToday(EXPIRY_PRESETS[0].days) : false;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    // Sent as end-of-day, not midnight: an expiry set to "31 March" that
    // cuts someone off at 00:00 on the 31st takes a day nobody offered.
    const expiry = new Date(`${validUntil}T23:59:59`).toISOString();

    try {
      if (isEdit) {
        // The password goes on its own request, and last: if the reset
        // fails, the rest of the edit has still been saved, and the error
        // below names the one part that did not land rather than implying
        // the whole form was lost.
        await updateMember(member.id, {
          // Only when it changed. Sending the same number back would make
          // the server check it against the uniqueness index for no reason.
          ...(phoneDigits.trim() && phone !== member.phone ? { phone } : {}),
          ...(email.trim() && email.trim().toLowerCase() !== member.email.toLowerCase()
            ? { email: email.trim() }
            : {}),
          role,
          permissions: role === 'MASTER_ADMIN' ? [] : permissions,
          validUntil: expiry,
          displayName: displayName.trim() || undefined,
          whatsappPhoneNumberId: numberId || null,
        });
        if (password.length >= 8) {
          try {
            await resetMemberPassword(member.id, password);
          } catch (err) {
            setError(
              `Everything else was saved, but the password was not: ${
                err instanceof Error ? err.message : 'the server refused it'
              }`,
            );
            return;
          }
        }
      } else {
        await createMember({
          phone,
          email: email.trim(),
          password,
          role,
          permissions: role === 'MASTER_ADMIN' ? [] : permissions,
          validUntil: expiry,
          displayName: displayName.trim() || undefined,
          whatsappPhoneNumberId: numberId || undefined,
        });
      }
      await onSaved(!isEdit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  }

  // A blank password on an edit means "don't touch it"; a short one is a
  // typo worth catching before the server rejects it.
  const passwordTooShort = isEdit && password.length > 0 && password.length < 8;
  const phoneOk = isEdit || phoneDigits.trim().length === 10;
  const canSubmit = isEdit
    ? Boolean(email.trim()) && !passwordTooShort && phoneOk
    : Boolean(phoneOk && email.trim() && password.length >= 8);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">
          {isEdit ? `Edit ${member.displayName || member.phone || member.email}` : 'Add a user'}
        </h2>
        <p className="text-[12.5px] text-muted">
          {isEdit
            ? 'They sign in with the phone number, or the email if the number is not set.'
            : 'They sign in with the phone number.'}
        </p>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Phone number" hint="This is their login">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-12 min-h-[44px] shrink-0 items-center rounded-2xl border border-border bg-foreground/[0.04] px-3 text-base font-semibold text-foreground sm:text-sm"
            >
              +91
            </span>
            <Input
              id="member-phone"
              type="tel"
              inputMode="numeric"
              value={phoneDigits}
              onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="98765 43210"
              autoComplete="off"
              maxLength={10}
              required={!isEdit}
            />
          </div>
          {phoneDigits && phoneDigits.length !== 10 ? (
            <span className="text-[12px] leading-snug text-rose-500">
              10 digits after +91 — this has {phoneDigits.length}.
            </span>
          ) : null}
        </Field>

        <Field label="Display name" hint="Optional — what colleagues see">
          <Input
            id="member-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Priya Sharma"
            autoComplete="off"
          />
        </Field>

        <Field label="Email" hint="The other thing they can sign in with">
          <Input
            id="member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@company.com"
            autoComplete="off"
            required
          />
        </Field>

        {!isEdit ? (
          <Field
            label="Temporary password"
            hint="At least 8 characters — hand it over, then have them change it"
          >
            <Input
              id="member-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
              minLength={8}
            />
          </Field>
        ) : (
          <Field
            label="New password"
            hint={
              isSelf
                ? 'Leave blank to keep the current one. Changing it signs you out everywhere, including here.'
                : 'Leave blank to keep the current one. Setting it signs them out of every device.'
            }
          >
            <Input
              id="member-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep the current one"
              autoComplete="off"
              minLength={8}
            />
          </Field>
        )}

        <Field label="Role">
          <select
            id="member-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'MASTER_ADMIN' | 'SUB_USER')}
            className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:text-sm"
          >
            <option value="SUB_USER">Member</option>
            <option value="MASTER_ADMIN">Admin — full access, manages users</option>
          </select>
        </Field>

        <div className="sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Access expires
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {EXPIRY_PRESETS.map((preset) => {
              const value = daysFromToday(preset.days);
              const active = validUntil === value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setValidUntil(value)}
                  aria-pressed={active}
                  className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${
                    active
                      ? 'border-primary/45 bg-primary/[0.08] text-foreground'
                      : 'border-border bg-surface/60 text-muted hover:text-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <label className="mt-3 flex flex-col gap-1.5 sm:max-w-[220px]">
            <span className="text-[12px] leading-snug text-muted">Or set an exact date</span>
            <Input
              id="member-expiry"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              required
            />
          </label>

          {daysLeft < 0 ? (
            <p className="mt-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-500">
              This has already expired — they cannot sign in until you set a later date.
            </p>
          ) : daysLeft <= NEAR_EXPIRY_DAYS && !isDemoPreset ? (
            <p className="mt-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-[13px] font-medium text-amber-700 dark:text-amber-400">
              Expires in {daysLeft === 0 ? 'less than a day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`}{' '}
              &mdash; renew it if that is not what you meant.
            </p>
          ) : (
            <p className="mt-2 text-[12px] leading-snug text-muted">
              {isDemoPreset
                ? 'The demo period — access ends in 2 days.'
                : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}, on ${validUntil}.`}
            </p>
          )}
        </div>

        <Field label="Business Manager" hint="Narrows the list below to one business">
          <select
            id="member-bm"
            value={selectedBm}
            onChange={(e) => handleBmChange(e.target.value)}
            disabled={numbers.length === 0}
            className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-base text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:text-sm"
          >
            <option value={ALL_NUMBERS}>Every Business Manager</option>
            {bmGroups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="WhatsApp number"
          hint={
            numbers.length === 0
              ? 'None connected yet — connect one from the agent app first'
              : selectedBm === ALL_NUMBERS
                ? 'Limits them to this number’s chats'
                : `Limits them to this number’s chats, within ${
                    bmGroups.find((g) => g.key === selectedBm)?.label ?? 'this Business Manager'
                  }`
          }
        >
          <select
            id="member-number"
            value={numberId}
            onChange={(e) => setNumberId(e.target.value)}
            disabled={numbers.length === 0}
            className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-base text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:text-sm"
          >
            {selectedBm === ALL_NUMBERS ? (
              <option value="">Every number in the workspace</option>
            ) : numbersInSelectedBm.length === 0 ? (
              <option value="">No numbers under this Business Manager</option>
            ) : (
              <option value="">Choose a number</option>
            )}
            {numbersInSelectedBm.map((n) => (
              <option key={n.id} value={n.id}>
                {n.displayPhoneNumber}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {showPermissions ? (
        <fieldset className="mt-6 border-0 p-0">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
            What they can do
          </legend>
          <div className="mt-3 grid gap-5 sm:grid-cols-3">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <p className="text-[12.5px] font-semibold text-foreground/80">{group.title}</p>
                {group.items.map((item) => (
                  <label
                    key={item.value}
                    htmlFor={`perm-${item.value}`}
                    className="flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-tight"
                  >
                    <input
                      id={`perm-${item.value}`}
                      type="checkbox"
                      checked={permissions.includes(item.value)}
                      onChange={() => toggle(item.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span>
                      {item.label}
                      {item.hint ? (
                        <span className="block text-[12px] text-muted">{item.hint}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mt-6 rounded-2xl bg-foreground/[0.04] px-4 py-3 text-[13px] text-muted">
          An admin has every permission and can manage users. There is nothing to choose.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSubmit || saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[12px] leading-snug text-muted">{hint}</span> : null}
    </label>
  );
}
