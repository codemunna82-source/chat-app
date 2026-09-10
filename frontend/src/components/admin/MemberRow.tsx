'use client';

import type { TeamMember, WhatsAppNumber } from '@/lib/voxo';
import { Button } from '@/components/ui/button';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Days left on the access window, or null once it has passed. */
function daysLeft(validUntil: string): number | null {
  const ms = new Date(validUntil).getTime() - Date.now();
  return ms <= 0 ? null : Math.ceil(ms / 86_400_000);
}

export function MemberRow({
  member,
  numbers,
  canEdit,
  isSelf,
  onEdit,
  onToggleDisabled,
}: {
  member: TeamMember;
  numbers: WhatsAppNumber[];
  canEdit: boolean;
  isSelf: boolean;
  onEdit: () => void;
  onToggleDisabled: () => void;
}) {
  const disabled = member.status === 'DISABLED';
  const left = daysLeft(member.validUntil);
  const assigned = numbers.find((n) => n.id === member.whatsappPhoneNumberId);

  return (
    <li
      className={`rounded-2xl border border-border bg-surface/70 px-4 py-3.5 sm:px-5 ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            <span className="truncate">{member.displayName || member.phone || member.email}</span>
            {member.role === 'MASTER_ADMIN' ? (
              <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                Admin
              </span>
            ) : null}
            {disabled ? (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Disabled
              </span>
            ) : left === null ? (
              <span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-500">
                Expired
              </span>
            ) : left <= 7 ? (
              <span className="rounded-full bg-amber-500/14 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                {left}d left
              </span>
            ) : null}
          </p>

          {/* The number first: it is what they sign in with, so it is the
              line an admin is actually looking for when someone says they
              cannot get in. */}
          <p className="mt-0.5 truncate font-mono text-[13px] text-muted">
            {member.phone ?? <span className="italic">no phone — signs in with {member.email}</span>}
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <span>Access until {formatDate(member.validUntil)}</span>
            <span aria-hidden>·</span>
            <span>
              {assigned
                ? `Sends from ${assigned.displayPhoneNumber}`
                : member.role === 'MASTER_ADMIN'
                  ? 'Sees every number'
                  : 'No number assigned — sees every number'}
            </span>
            {member.lastLoginAt ? (
              <>
                <span aria-hidden>·</span>
                <span>Last in {formatDate(member.lastLoginAt)}</span>
              </>
            ) : (
              <>
                <span aria-hidden>·</span>
                <span>Never signed in</span>
              </>
            )}
          </p>
        </div>

        {canEdit ? (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" className="h-9 min-h-9 px-3 text-[13px]" onClick={onEdit}>
              Edit
            </Button>
            {/* An admin disabling themselves would lock the workspace's only
                account holder out of the screen that could undo it. */}
            {!isSelf ? (
              <Button
                variant="ghost"
                className={`h-9 min-h-9 px-3 text-[13px] ${disabled ? 'text-primary' : 'text-rose-500'}`}
                onClick={onToggleDisabled}
              >
                {disabled ? 'Enable' : 'Disable'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
