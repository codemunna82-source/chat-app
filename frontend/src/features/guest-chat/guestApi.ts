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

/**
 * Thrown when the request never reached the server at all.
 *
 * A browser reports a blocked CORS response, a server that is still
 * waking, and no connection identically — as a rejected fetch with a
 * message like "Load failed". Showing that string to a customer explains
 * nothing, so all three collapse into one sentence that suggests the only
 * useful action.
 */
export class GuestNetworkError extends Error {
  constructor(cause: unknown) {
    super('Could not reach the chat server. It may still be starting up — try again in a moment.');
    this.name = 'GuestNetworkError';
    this.cause = cause;
  }
}

/** Thrown for a link that is unknown, revoked or expired — the one error the UI treats specially. */
export class GuestLinkInvalidError extends Error {
  constructor() {
    super('This chat link is no longer valid');
    this.name = 'GuestLinkInvalidError';
  }
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/guest${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    // fetch only rejects when no response came back — a CORS block, a
    // sleeping server, or no network. An HTTP error status resolves
    // normally and is handled below.
    throw new GuestNetworkError(err);
  }

  if (res.status === 401) throw new GuestLinkInvalidError();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

/** Same as request(), but keeps the envelope's `meta` — where the cursor lives. */
async function requestWithMeta<T>(
  token: string,
  path: string,
): Promise<{ data: T; meta?: { nextCursor?: string | null } }> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/guest${path}`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new GuestNetworkError(err);
  }
  if (res.status === 401) throw new GuestLinkInvalidError();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as { data: T; meta?: { nextCursor?: string | null } };
}

export function fetchSession(token: string): Promise<GuestSession> {
  return request<GuestSession>(token, '/session');
}

export interface MessagePage {
  /** Oldest-first, ready to render. */
  items: GuestMessage[];
  /** Pass back as `cursor` to fetch the page before this one; null at the start of the thread. */
  nextCursor: string | null;
}

/**
 * One page of the transcript.
 *
 * The API returns newest-first because that is the order it pages in; the
 * transcript reads oldest-first, so each page is reversed on arrival
 * rather than at every render.
 */
export async function fetchMessages(token: string, cursor?: string): Promise<MessagePage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await requestWithMeta<GuestMessage[]>(token, `/messages${query}`);
  return { items: [...res.data].reverse(), nextCursor: res.meta?.nextCursor ?? null };
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

/**
 * ICE servers for a call, from the server rather than this build.
 *
 * Both ends of the call have to be given the same relay — a browser and a
 * phone configured with different TURN servers gather candidates that can
 * never pair up, and that failure looks like a connected call with no
 * audio and no error. Behind the link token like every other guest route,
 * because TURN credentials are not something to serve to anyone who asks.
 */
export function fetchIceServers(
  token: string,
): Promise<{ urls: string[]; username?: string; credential?: string }[]> {
  return request<{ iceServers: { urls: string[]; username?: string; credential?: string }[] }>(
    token,
    '/ice',
  ).then((d) => d.iceServers);
}

export interface UploadResult {
  sent: GuestMessage[];
  failed: { filename: string; message: string }[];
}

/**
 * Uploads images as multipart.
 *
 * Not through request(): that sets Content-Type: application/json, and a
 * multipart body needs the browser to write the header itself so it can
 * include the boundary it generated. Setting it by hand produces a body
 * the server cannot parse.
 */
export async function uploadImages(token: string, files: File[]): Promise<UploadResult> {
  const form = new FormData();
  for (const file of files) form.append('files', file);

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/guest/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (err) {
    throw new GuestNetworkError(err);
  }

  if (res.status === 401) throw new GuestLinkInvalidError();
  const body = (await res.json().catch(() => null)) as
    | { data?: GuestMessage[]; meta?: { failed?: { filename: string; message: string }[] }; error?: { message?: string } }
    | null;
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Upload failed (${res.status})`);
  }
  return { sent: body?.data ?? [], failed: body?.meta?.failed ?? [] };
}

/**
 * An image as a blob URL.
 *
 * The bytes need the link token, and an <img src> cannot carry an
 * Authorization header — so rather than putting the token in a query
 * string, where it would end up in every access log along the way, the
 * bytes are fetched and handed to the tag as an object URL. Callers must
 * revoke it when the element goes away.
 */
export async function fetchMediaObjectUrl(token: string, mediaId: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/guest/media/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new GuestNetworkError(err);
  }
  if (res.status === 401) throw new GuestLinkInvalidError();
  if (!res.ok) throw new Error(`Could not load image (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
