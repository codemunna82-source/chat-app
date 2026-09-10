'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { clearSession, useSession } from '@/store/useSession';
import {
  VoxoError,
  disableMember,
  fetchMe,
  listMembers,
  listWhatsAppNumbers,
  type TeamMember,
  type WhatsAppNumber,
} from '@/lib/voxo';
import { MemberForm } from '@/components/admin/MemberForm';
import { MemberRow } from '@/components/admin/MemberRow';

/**
 * User management, on the web.
 *
 * It used to live in the agent app, which was the wrong place for it: the
 * person creating accounts is doing admin at a desk, not answering
 * customers on a phone, and a form with a phone number, an email, a
 * password, a permission list, an expiry date and a number assignment is
 * six fields too many for a bottom sheet.
 */
export default function AdminPage() {
  const router = useRouter();
  const { session, ready, hydrate } = useSession();

  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session, router]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, nums] = await Promise.all([
        listMembers(),
        // Never fatal: the assignment dropdown is a convenience, and a
        // workspace with no connected number yet must still be able to
        // create the people who will connect one.
        listWhatsAppNumbers().catch(() => [] as WhatsAppNumber[]),
      ]);
      setMembers(rows);
      setNumbers(nums);
    } catch (err) {
      if (err instanceof VoxoError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load the team.');
      setMembers([]);
    }
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void load();
    // Re-reads the role from the server rather than trusting what login
    // cached: an admin demoted since they signed in would otherwise keep
    // the admin screen until they happened to sign out.
    void fetchMe()
      .then((me) => useSession.setState((s) => (s.session ? { session: { ...s.session, user: me } } : s)))
      .catch(() => {});
  }, [session, load]);

  const isAdmin = session?.user.role === 'MASTER_ADMIN';

  const sorted = useMemo(
    () =>
      [...(members ?? [])].sort((a, b) => {
        // Disabled accounts to the bottom — they are the ones nobody is
        // looking for. Everything else newest first.
        if ((a.status === 'DISABLED') !== (b.status === 'DISABLED')) {
          return a.status === 'DISABLED' ? 1 : -1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [members],
  );

  const handleDisable = useCallback(
    async (member: TeamMember) => {
      const revoking = member.status === 'ACTIVE';
      if (revoking && !window.confirm(`Sign ${member.displayName || member.phone || member.email} out and block their access?`)) {
        return;
      }
      try {
        if (revoking) await disableMember(member.id);
        else await import('@/lib/voxo').then((m) => m.updateMember(member.id, { status: 'ACTIVE' }));
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not work.');
      }
    },
    [load],
  );

  if (!ready || !session) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-16">
        <p className="text-sm text-muted">Checking your session…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">User management</h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as{' '}
            <span className="text-foreground">
              {session.user.displayName || session.user.phone || session.user.email}
            </span>
            {session.user.role === 'MASTER_ADMIN' ? ' · workspace admin' : ' · member'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              clearSession();
              router.replace('/login');
            }}
          >
            Sign out
          </Button>
          {isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setInviting(true);
              }}
            >
              Add user
            </Button>
          ) : null}
        </div>
      </header>

      {!isAdmin ? (
        <p className="mt-8 rounded-2xl border border-border bg-surface/70 px-5 py-4 text-sm text-muted">
          Only a workspace admin can create or change accounts. Ask whoever set up this workspace.
        </p>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-500">
          {error}
        </p>
      ) : null}

      {inviting || editing ? (
        <MemberForm
          member={editing}
          numbers={numbers}
          onClose={() => {
            setInviting(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setInviting(false);
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      <section className="mt-8">
        {members === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface/70 px-5 py-6 text-sm text-muted">
            No users yet. Add the first one with the button above — the phone number you give them is
            what they will sign in with.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                numbers={numbers}
                canEdit={isAdmin}
                isSelf={member.id === session.user.id}
                onEdit={() => {
                  setInviting(false);
                  setEditing(member);
                }}
                onToggleDisabled={() => void handleDisable(member)}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
