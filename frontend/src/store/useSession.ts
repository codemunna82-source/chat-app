'use client';

import { create } from 'zustand';
import type { VoxoUser } from '@/lib/voxo';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: VoxoUser;
}

/**
 * The signed-in VOXO session.
 *
 * Its own store and its own storage key, separate from `userInfo` — that
 * one belongs to this repo's original chat scaffolding and holds a
 * completely different user shape. Two stores writing one key is how a
 * session becomes unreadable to whichever half did not write it last.
 *
 * Read and written through plain functions as well as the hook, because
 * the API client needs the token outside React: an axios-style interceptor
 * has no component to read a hook from.
 */
const KEY = 'voxo-session';

export function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    // A private window, or a value another build left in a shape this one
    // cannot read. Treated as signed out rather than crashing the page.
    return null;
  }
}

export function writeSession(session: Session): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage refused; the session lives for this tab only */
  }
  useSession.setState({ session, ready: true });
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  useSession.setState({ session: null, ready: true });
}

interface SessionState {
  session: Session | null;
  /**
   * Whether localStorage has been read yet.
   *
   * The server renders with no session, so a guard that redirects on
   * `!session` during the first client render would bounce every
   * signed-in person to /login before their token was ever looked at.
   */
  ready: boolean;
  hydrate: () => void;
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  ready: false,
  hydrate: () => set({ session: readSession(), ready: true }),
}));
