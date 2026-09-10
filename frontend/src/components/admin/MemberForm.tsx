'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createMember, updateMember, type TeamMember, type WhatsAppNumber } from '@/lib/voxo';
import { DEFAULT_PERMISSIONS, PERMISSION_GROUPS } from './permissions';

/** A year out — long enough not to be busywork, short enough to be a real expiry. */
function defaultExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function MemberForm({
  member,
  numbers,
  onClose,
  onSaved,
}: {
  member: TeamMember | null;
  numbers: WhatsAppNumber[];
  onClose: () => void;
  /** `created` distinguishes a new account from an edit — the caller opens the
   *  number panel for the first and not the second. */
  onSaved: (created: boolean) => void | Promise<void>;
}) {
  const isEdit = member !== null;

  const [phone, setPhone] = useState(member?.phone ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(member?.displayName ?? '');
  const [role, setRole] = useState<'MASTER_ADMIN' | 'SUB_USER'>(member?.role ?? 'SUB_USER');
  const [validUntil, setValidUntil] = useState(
    member ? member.validUntil.slice(0, 10) : defaultExpiry(),
  );
  const [numberId, setNumberId] = useState(member?.whatsappPhoneNumberId ?? '');
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
        await updateMember(member.id, {
          // Only when it changed. Sending the same number back would make
          // the server check it against the uniqueness index for no reason.
          ...(phone.trim() && phone.trim() !== member.phone ? { phone: phone.trim() } : {}),
          role,
          permissions: role === 'MASTER_ADMIN' ? [] : permissions,
          validUntil: expiry,
          displayName: displayName.trim() || undefined,
          whatsappPhoneNumberId: numberId || null,
        });
      } else {
        await createMember({
          phone: phone.trim(),
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

  const canSubmit = isEdit || (phone.trim() && email.trim() && password.length >= 8);

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">
          {isEdit ? `Edit ${member.displayName || member.phone || member.email}` : 'Add a user'}
        </h2>
        <p className="text-[12.5px] text-muted">
          {isEdit ? 'The email cannot be changed.' : 'They sign in with the phone number.'}
        </p>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Phone number" hint="With country code — this is their login">
          <Input
            id="member-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            autoComplete="off"
            required={!isEdit}
          />
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

        {!isEdit ? (
          <>
            <Field label="Email" hint="For the account record">
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

            <Field label="Temporary password" hint="At least 8 characters — hand it over, then have them change it">
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
          </>
        ) : null}

        <Field label="Role">
          <select
            id="member-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'MASTER_ADMIN' | 'SUB_USER')}
            className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          >
            <option value="SUB_USER">Member</option>
            <option value="MASTER_ADMIN">Admin — full access, manages users</option>
          </select>
        </Field>

        <Field label="Access expires" hint="They cannot sign in after this date">
          <Input
            id="member-expiry"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            required
          />
        </Field>

        <Field
          label="WhatsApp number"
          hint={
            numbers.length === 0
              ? 'None connected yet — connect one from the agent app first'
              : 'Limits them to this number’s chats'
          }
        >
          <select
            id="member-number"
            value={numberId}
            onChange={(e) => setNumberId(e.target.value)}
            disabled={numbers.length === 0}
            className="h-12 min-h-[44px] w-full rounded-2xl glass-input px-3 text-sm text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          >
            <option value="">Every number in the workspace</option>
            {numbers.map((n) => (
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
