'use client';

import { useEffect, useState } from 'react';
import { GuestLinkInvalidError } from './guestApi';
import { getPersonalLinkOwner, startPersonalChat } from './personalLinkApi';

type Status = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * The first screen a brand-new visitor sees on someone's personal chat
 * link — never a customer who already has a conversation, since they
 * would be holding their own /c/ link instead. Only a phone number is
 * asked for (not a name): that is the one piece this app's data model
 * actually needs, the same thing WhatsApp's own wa.me links ask a
 * stranger to disclose before a business can reply to them.
 *
 * On success this hands off to the normal, full guest chat window by
 * sending the browser to the returned /c/<token> URL — nothing about the
 * chat itself is reimplemented here.
 */
export default function PersonalLinkLanding({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPersonalLinkOwner(token)
      .then((owner) => {
        if (cancelled) return;
        setDisplayName(owner.displayName);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err instanceof GuestLinkInvalidError ? 'not-found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !phone.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await startPersonalChat(token, phone.trim());
      // A full navigation, not a client-side route change: the returned
      // URL carries a brand-new guest session token this page has never
      // held, and the chat window reads it the same way it does from
      // any other link — there is nothing to hand off in memory.
      window.location.href = result.url;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#efe7de]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#25d366] border-t-transparent" />
      </div>
    );
  }

  if (status === 'not-found' || status === 'error') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-[#efe7de] px-6 text-center">
        <p className="text-[15px] font-medium text-[#0b141a]">This chat link is not working right now.</p>
        <p className="text-[13px] text-[#667781]">Ask for a fresh link and try again.</p>
      </div>
    );
  }

  const name = displayName || 'us';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#efe7de] px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#9333ea] text-xl font-semibold text-white">
            {name.charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-3 text-[17px] font-semibold text-[#0b141a]">Chat with {name}</h1>
          <p className="mt-1 text-[13px] text-[#667781]">
            Enter your WhatsApp number to start — {name} will see your messages right away.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-[#e9edef] bg-white px-3 py-3 text-[14.5px] text-[#0b141a] outline-none focus:border-[#25d366]"
          />
          {submitError ? <p className="text-[12.5px] text-[#f15c6d]">{submitError}</p> : null}
          <button
            type="submit"
            disabled={submitting || !phone.trim()}
            className="rounded-full bg-[#25d366] py-3 text-[14.5px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Starting…' : 'Start chatting'}
          </button>
        </form>
      </div>
    </div>
  );
}
