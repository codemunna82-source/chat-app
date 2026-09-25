'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchTenantSettings,
  updateBusinessProfile,
  type BusinessNameSource,
  type BusinessProfile as Profile,
} from '@/lib/voxo';

/**
 * The name a customer reads at the top of the private chat window.
 *
 * This panel exists because the window used to show the workspace's
 * INTERNAL label, which on a fresh install is literally "Demo Tenant" —
 * so a real business's customers opened an invitation headed by a
 * placeholder naming someone else. For a page whose only job is
 * persuading a stranger it is safe to keep talking, nothing else on it
 * matters as much as this line.
 *
 * The resolved name is shown above the field rather than below it, and
 * with its source spelled out, because the question an admin opens this
 * with is "what does my customer see?" — not "what do I type?". Without
 * the source, a blank field and a filled-in header are indistinguishable
 * from a setting someone chose.
 */
const SOURCE_COPY: Record<BusinessNameSource, { text: string; tone: 'ok' | 'warn' }> = {
  settings: { text: 'This is the name you set here.', tone: 'ok' },
  whatsapp: { text: 'Taken from your WhatsApp number’s approved display name.', tone: 'ok' },
  workspace: { text: 'Falling back to your workspace name, because nothing else is set.', tone: 'warn' },
  fallback: {
    text: 'Nothing is set, so customers only see “Support”. Enter your business name below.',
    tone: 'warn',
  },
};

/**
 * Fills in the fields an older server does not send yet.
 *
 * This panel and the endpoint behind it deploy separately — the site goes
 * out on a push, the API on its own redeploy — so there is always a
 * window where this code is newer than the server answering it. Reading
 * `customerFacingName.slice(...)` straight off that older response threw,
 * and a thrown render in a client component takes the WHOLE admin page
 * down: not a degraded panel, a blank screen with "Application error".
 *
 * So every field this component dereferences gets a defined value here,
 * once, rather than a `?.` at each of a dozen use sites — one of which
 * will eventually be forgotten.
 */
function normalize(s: Partial<Profile> & { name?: string }): Profile {
  const displayName = s.displayName ?? '';
  return {
    displayName,
    // Falling back to the workspace name, then to the same last resort the
    // server itself uses, so the preview shows something true rather than
    // an empty header.
    customerFacingName: s.customerFacingName || displayName || s.name || 'Support',
    customerFacingNameSource: s.customerFacingNameSource ?? 'fallback',
    whatsappVerifiedName: s.whatsappVerifiedName ?? '',
  };
}

export function BusinessProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void fetchTenantSettings()
      .then((s) => {
        const profile = normalize(s);
        setProfile(profile);
        setDisplayName(profile.displayName);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load settings.'));
  }, []);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = normalize(await updateBusinessProfile({ displayName: displayName.trim() }));
      setProfile(saved);
      // Read back what was stored rather than keeping what was typed: the
      // server trims, and the resolved name may differ from the field
      // entirely when the field is cleared.
      setDisplayName(saved.displayName);
      setNotice(`Saved. Customers now see “${saved.customerFacingName}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <div className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6">
        <p className="text-sm text-muted">{error ?? 'Loading…'}</p>
      </div>
    );
  }

  // Indexed defensively: a source this build has no copy for — a value
  // added to the server later — must not take the page down.
  const source = SOURCE_COPY[profile.customerFacingNameSource] ?? SOURCE_COPY.fallback;
  const dirty = displayName.trim() !== profile.displayName;

  return (
    <div className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <label htmlFor="business-display-name" className="block text-sm font-semibold">
            Business name
          </label>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            Shown at the top of the private chat window and on notifications the customer receives from you.
          </p>
          <Input
            id="business-display-name"
            className="mt-3"
            value={displayName}
            maxLength={120}
            placeholder={profile.whatsappVerifiedName || 'e.g. RK Enterprises'}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <p className="mt-2 text-[13px] leading-snug text-muted">
            {profile.whatsappVerifiedName
              ? `Leave empty to use the name WhatsApp has approved for your number — “${profile.whatsappVerifiedName}”.`
              : 'Leave empty once WhatsApp approves a display name for your number, and that name will be used instead.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={busy || !dirty}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            {notice ? <span className="text-[13px] text-emerald-500">{notice}</span> : null}
            {error ? <span className="text-[13px] text-rose-500">{error}</span> : null}
          </div>
        </div>

        {/* A drawn copy of the customer's own header, not a description of
            it. The point is recognising the result at a glance — an admin
            should not have to send themselves a test link to find out what
            the window says. */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Customers see</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-bg">
            <div className="flex items-center gap-3 bg-primary px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
                {profile.customerFacingName.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">
                  {profile.customerFacingName}
                </span>
                <span className="block text-[11px] text-white/70">online</span>
              </span>
            </div>
            <div className="space-y-2 px-4 py-4">
              <p className="w-4/5 rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-[13px]">
                Hello, welcome! How can we help you today?
              </p>
            </div>
          </div>
          <p
            className={`mt-2 text-[12px] leading-snug ${
              source.tone === 'ok' ? 'text-muted' : 'text-amber-500'
            }`}
          >
            {source.text}
          </p>
        </div>
      </div>
    </div>
  );
}
