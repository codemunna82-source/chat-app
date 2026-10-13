import { GuestLinkInvalidError, GuestNetworkError } from './guestApi';

/**
 * Deliberately its own tiny client rather than reusing guestApi.ts's
 * `request()`: every call there sends `Authorization: Bearer <session
 * token>`, and a visitor on a personal link has no session yet — that is
 * the whole point of this page. This call is genuinely
 * unauthenticated, hitting /api/public/personal-link rather than
 * /api/guest.
 */
function apiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_VOXO_API_URL;
  if (!raw) {
    throw new Error('NEXT_PUBLIC_VOXO_API_URL is not set');
  }
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.toLowerCase().endsWith('/api') ? trimmed : `${trimmed}/api`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/public/personal-link${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (err) {
    throw new GuestNetworkError(err);
  }
  if (res.status === 404) throw new GuestLinkInvalidError();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'Something went wrong. Please try again.');
  }
  const body = (await res.json()) as { success: true; data: T };
  return body.data;
}

export interface StartedPersonalChat {
  url: string;
  expiresAt: string;
  displayName: string | null;
}

export function startPersonalChat(token: string): Promise<StartedPersonalChat> {
  return call<StartedPersonalChat>(`/${encodeURIComponent(token)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
