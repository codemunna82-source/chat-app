'use client';

import { useEffect, useState } from 'react';
import { GuestLinkInvalidError } from './guestApi';
import { startPersonalChat } from './personalLinkApi';

type Status = 'loading' | 'not-found' | 'error';

const storageKey = (token: string) => `voxo:personal-chat:${token}`;

/** The chat this device already started on this link, if it is still live. */
function savedChatUrl(token: string): string | null {
  try {
    const raw = localStorage.getItem(storageKey(token));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { url?: string; expiresAt?: string };
    if (!saved.url || !saved.expiresAt || new Date(saved.expiresAt).getTime() <= Date.now()) return null;
    return saved.url;
  } catch {
    return null;
  }
}

function saveChat(token: string, url: string, expiresAt: string) {
  try {
    localStorage.setItem(storageKey(token), JSON.stringify({ url, expiresAt }));
  } catch {
    // Private mode or storage blocked: the visitor just gets a new chat next time.
  }
}

/**
 * Someone's personal chat link. Opens the chat window straight away, with
 * nothing asked of the visitor. The chat is remembered on this device, so
 * coming back through the same link resumes it rather than starting over.
 */
export default function PersonalLinkLanding({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    const existing = savedChatUrl(token);
    if (existing) {
      window.location.replace(existing);
      return;
    }

    let cancelled = false;
    startPersonalChat(token)
      .then((result) => {
        if (cancelled) return;
        saveChat(token, result.url, result.expiresAt);
        window.location.replace(result.url);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err instanceof GuestLinkInvalidError ? 'not-found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#efe7de]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#25d366] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-[#efe7de] px-6 text-center">
      <p className="text-[15px] font-medium text-[#0b141a]">This chat link is not working right now.</p>
      <p className="text-[13px] text-[#667781]">
        {status === 'not-found' ? 'Ask for a fresh link and try again.' : 'Check your connection and try again.'}
      </p>
    </div>
  );
}
