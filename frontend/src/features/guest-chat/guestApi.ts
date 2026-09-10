import type { GuestLocation, GuestMessage, GuestSession, ReportReason } from './types';

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
  // 204 is a real answer for the routes that only acknowledge — asking a
  // body-less response for JSON throws, and the throw would surface as a
  // failure of something that in fact succeeded.
  if (res.status === 204) return undefined as T;
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

export function sendMessage(
  token: string,
  text: string,
  replyToMessageId?: string,
): Promise<GuestMessage> {
  return request<GuestMessage>(token, '/messages', {
    method: 'POST',
    body: JSON.stringify({ text, replyToMessageId }),
  });
}

/**
 * A place the customer shared.
 *
 * Sent as numbers, not a formatted string: the server writes the readable
 * line itself so that every reader of the message — the agent's app, the
 * chat list, a push notification — gets the same sentence, rather than
 * each client inventing its own.
 */
export function sendLocation(
  token: string,
  place: GuestLocation & { replyToMessageId?: string },
): Promise<GuestMessage> {
  return request<GuestMessage>(token, '/location', {
    method: 'POST',
    body: JSON.stringify(place),
  });
}

export interface ReportInput {
  /** Required when `report` is true; a block on its own needs no accusation. */
  reason?: ReportReason;
  details?: string;
  /** The message the complaint is about, if the customer picked one. */
  messageId?: string;
  block: boolean;
  report: boolean;
}

export interface ReportResult {
  reportId?: string;
  blocked: boolean;
  /** What the server recorded of the reported message — echoed back so the receipt is the stored copy. */
  reportedMessagePreview?: string;
}

/**
 * One call for reporting, blocking, or both — because on the customer's
 * screen it is one decision. Two calls would allow the half-done outcome
 * where the report lands and the block does not, leaving someone who asked
 * to stop hearing from a business still hearing from them.
 */
export function submitReport(token: string, input: ReportInput): Promise<ReportResult> {
  return request<ReportResult>(token, '/report', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Turning the block on or off on its own — the Unblock button's call. */
export function setBlocked(token: string, blocked: boolean): Promise<{ blocked: boolean }> {
  return request<{ blocked: boolean }>(token, '/block', {
    method: 'POST',
    body: JSON.stringify({ blocked }),
  });
}

/** An empty emoji removes whatever reaction the customer had. */
export function sendReaction(token: string, messageId: string, emoji: string): Promise<unknown> {
  return request(token, '/reactions', {
    method: 'POST',
    body: JSON.stringify({ messageId, emoji }),
  });
}

/**
 * Hands the server this browser's Web Push token.
 *
 * Sent on every load once permission has been given, not only the first
 * time: FCM rotates tokens, and a browser holding one the server has never
 * seen stops receiving notifications without either side noticing.
 */
export async function savePushToken(linkToken: string, pushToken: string): Promise<void> {
  await request(linkToken, '/push', { method: 'POST', body: JSON.stringify({ token: pushToken }) });
}

export async function forgetPushToken(linkToken: string, pushToken: string): Promise<void> {
  await request(linkToken, '/push', { method: 'DELETE', body: JSON.stringify({ token: pushToken }) });
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
export interface IceConfig {
  iceServers: { urls: string[]; username?: string; credential?: string }[];
  /**
   * Whether the server has a relay configured.
   *
   * Carried through because a call that never connects is otherwise
   * indistinguishable from one nobody answered — and with no TURN, on a
   * mobile network, failing to connect is the expected outcome rather than
   * an accident worth retrying.
   */
  hasTurn: boolean;
}

export function fetchIceServers(token: string): Promise<IceConfig> {
  return request<IceConfig>(token, '/ice').then((d) => ({
    iceServers: d.iceServers ?? [],
    // An older server does not send this. Assuming a relay exists is the
    // safer default: it keeps the failure message generic rather than
    // blaming configuration that may be perfectly fine.
    hasTurn: d.hasTurn !== false,
  }));
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
 * One voice note, through the same endpoint photos use.
 *
 * A Blob has no filename and multipart wants one, so the recording is
 * wrapped in a File before it goes. The extension is derived from the type
 * the browser chose rather than fixed: Chrome hands back WebM and Safari
 * hands back MP4, and labelling one as the other leaves a file whose name
 * disagrees with its bytes in the business's inbox.
 */
export async function uploadVoiceNote(
  token: string,
  blob: Blob,
  mimeType: string,
): Promise<UploadResult> {
  const base = mimeType.split(';')[0]!.trim();
  const extension = base.includes('mp4') ? 'm4a' : base.includes('ogg') ? 'ogg' : 'webm';
  const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
  return uploadImages(token, [file]);
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
export async function fetchMediaObjectUrl(
  token: string,
  mediaId: string,
  /**
   * Longest edge to ask the server for.
   *
   * A bubble is a few hundred pixels wide; without this it was handed the
   * full photo out of someone's camera roll. Only the widths the server
   * allows are worth sending — anything else is ignored there and comes
   * back full size, which is a wasted download, not an error.
   */
  maxWidth?: 480 | 960,
): Promise<string> {
  const query = maxWidth ? `?w=${maxWidth}` : '';
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/guest/media/${encodeURIComponent(mediaId)}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new GuestNetworkError(err);
  }
  if (res.status === 401) throw new GuestLinkInvalidError();
  if (!res.ok) throw new Error(`Could not load image (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
