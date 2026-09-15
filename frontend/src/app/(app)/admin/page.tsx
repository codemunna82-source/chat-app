'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { clearSession, useSession } from '@/store/useSession';
import {
  VoxoError,
  disableMember,
  fetchMe,
  listMembers,
  listWhatsAppNumbers,
  listMetaApps,
  type MetaAppSummary,
  type TeamMember,
  type WhatsAppNumber,
} from '@/lib/voxo';
import { MemberForm } from '@/components/admin/MemberForm';
import { MemberRow } from '@/components/admin/MemberRow';
import { NumberSetup } from '@/components/admin/NumberSetup';
import { AutoReplySetup } from '@/components/admin/AutoReplySetup';
import { BusinessManagers } from '@/components/admin/BusinessManagers';
import { Section } from '@/components/admin/Section';
import { BusinessProfile } from '@/components/admin/BusinessProfile';
import { SectionBoundary } from '@/components/admin/SectionBoundary';

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
  /**
   * Whether the number panel is open.
   *
   * Opens by itself the moment a user is created, because that is the
   * next thing that has to happen and the only moment anyone is thinking
   * about it: an account with nobody's number attached cannot send or
   * receive anything, and an admin who closes the page here comes back a
   * week later wondering why the inbox is empty. Also opens on its own
   * when the workspace has no number at all, which is the same problem
   * one step earlier.
   */
  const [metaApps, setMetaApps] = useState<MetaAppSummary[]>([]);
  // Bumped when a Business Manager is added, so the number form's picker
  // offers it immediately rather than after a page reload — adding a BM and
  // then adding a number to it is one continuous task.
  const [metaAppsVersion, setMetaAppsVersion] = useState(0);

  useEffect(() => {
    if (!session) return;
    void listMetaApps()
      .then(setMetaApps)
      // Silent: the picker simply does not appear, which is the correct
      // state for a workspace that has no Business Managers configured.
      .catch(() => setMetaApps([]));
  }, [session, metaAppsVersion]);

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

  /**
   * Guards the opening load against running twice — and, before it was
   * here, against running forever.
   *
   * The effect below depended on `session`, and fetchMe() wrote a NEW
   * session object back into the store on every success. A new object is
   * a new reference, which changed the dependency, which re-ran the
   * effect, which called fetchMe() again: /auth/me, /users and
   * /whatsapp/numbers on a loop for as long as the page stayed open.
   *
   * A ref rather than tidier dependencies because it cannot be defeated
   * by a future one: whatever else changes, the bootstrap runs once.
   */
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!session || bootstrapped.current) return;
    bootstrapped.current = true;
    void load();
    // Re-reads the role from the server rather than trusting what login
    // cached: an admin demoted since they signed in would otherwise keep
    // the admin screen until they happened to sign out.
    void fetchMe()
      .then((me) =>
        useSession.setState((s) => {
          if (!s.session) return s;
          // Nothing to write when nothing changed. Replacing the object
          // with an identical copy re-renders every subscriber for no
          // reason, and it is what turned one stale-role check into a
          // request loop.
          if (JSON.stringify(s.session.user) === JSON.stringify(me)) return s;
          return { session: { ...s.session, user: me } };
        }),
      )
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
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Workspace settings</h1>
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

      {isAdmin ? (
        <>
          {/* Ordered the way a workspace is actually set up, and the order
              matters: a number cannot be added before the Business Manager
              whose token verifies it, and a user cannot be assigned a
              number that does not exist yet. */}
          <Section
            step={1}
            title="WhatsApp credentials"
            description="Your Meta apps. Each Business Manager has its own app secret, access token and webhook URL — none of them are interchangeable."
          >
            <SectionBoundary><BusinessManagers onChanged={() => setMetaAppsVersion((v) => v + 1)} /></SectionBoundary>
          </Section>

          <Section
            step={2}
            title="WhatsApp numbers"
            description="The numbers customers message. Each belongs to one Business Manager — the one whose credentials can send and receive on it."
          >
            <SectionBoundary><NumberSetup numbers={numbers} metaApps={metaApps} onChanged={load} /></SectionBoundary>
          </Section>

          <Section
            step={3}
            title="Business profile"
            description="The name your customers see when they open the private chat window you send them."
          >
            <SectionBoundary><BusinessProfile /></SectionBoundary>
          </Section>

          <Section
            step={4}
            title="Automatic replies"
            description="What VOXO sends on its own when a customer messages, without waiting for an agent."
          >
            <SectionBoundary><AutoReplySetup /></SectionBoundary>
          </Section>
        </>
      ) : null}

      <Section
        step={isAdmin ? 5 : 1}
        title="Team"
        description="Who can sign in, what they can do, and which number's chats they see."
      >
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

        <div className="mt-6">
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
        </div>
      </Section>
    </main>
  );
}
