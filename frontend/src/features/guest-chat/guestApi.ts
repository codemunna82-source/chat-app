import type { GuestMessage, GuestSession } from './types';

/**
 * Deliberately not the app's shared axios instance: that one reads a
 * logged-in user's token out of localStorage and redirects to /login on a
 * 401. A customer holding a chat link has no account and no /login to go
 * to — a redirect there would replace the only page they were given with
 * one they can do nothing with.
 */
function apiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_VOXO_API_URL;
  if (!raw) {
    throw new Error('NEXT_PUBLIC_VOXO_API_URL is not set');
  }
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.toLowerCase().endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export function socketUrl(): string {
  const raw = process.env.NEXT_PUBLIC_VOXO_SOCKET_URL || process.env.NEXT_PUBLIC_VOXO_API_URL || '';
  return raw.replace(/\/api\/?$/, '').replace(/\/+$/, '');
}

/** Thrown for a link that is unknown, revoked or expired — the one error the UI treats specially. */
export class GuestLinkInvalidError extends Error {
  constructor() {
    super('This chat link is no longer valid');
    this.name = 'GuestLinkInvalidError';
  }
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}/guest${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) throw new GuestLinkInvalidError();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

export function fetchSession(token: string): Promise<GuestSession> {
  return request<GuestSession>(token, '/session');
}

/** The API returns newest-first; the transcript reads oldest-first. */
export async function fetchMessages(token: string): Promise<GuestMessage[]> {
  const items = await request<GuestMessage[]>(token, '/messages');
  return [...items].reverse();
}

export function sendMessage(token: string, text: string): Promise<GuestMessage> {
  return request<GuestMessage>(token, '/messages', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

/** Best-effort: a failed read receipt is never worth surfacing to the customer. */
export function markRead(token: string): void {
  void request(token, '/read', { method: 'POST' }).catch(() => {});
}
