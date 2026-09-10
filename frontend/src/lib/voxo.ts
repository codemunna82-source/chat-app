/**
 * The client for the VOXO backend — the one the agent app talks to.
 *
 * Deliberately not `lib/api.ts`. That instance belongs to this repo's
 * original chat scaffolding: it reads a token shaped `{ state: { user:
 * { token } } }` out of a localStorage key called `userInfo`, and posts to
 * routes like `/users/login` that the VOXO backend has never had. Pointing
 * it at VOXO would mean two different token shapes and two different 401
 * behaviours sharing one axios instance, which is the kind of thing that
 * works until the day it silently signs someone out.
 *
 * This one speaks VOXO's actual protocol: a short-lived access token, a
 * long-lived refresh token, and a single retry when the first expires.
 */
import { readSession, clearSession, writeSession, type Session } from '@/store/useSession';

export interface VoxoUser {
  id: string;
  tenantId: string;
  email: string;
  /** What this person signs in with. Absent on accounts made before phone sign-in. */
  phone?: string;
  role: 'MASTER_ADMIN' | 'SUB_USER';
  permissions: string[];
  displayName?: string;
  whatsappPhoneNumberId?: string;
}

export interface TeamMember extends VoxoUser {
  status: 'ACTIVE' | 'DISABLED';
  validFrom: string;
  validUntil: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NumberHealth {
  level: string;
  headline: string;
  detail: string;
  stale: boolean;
}

export interface WhatsAppNumber {
  id: string;
  /**
   * Meta's own phone_number_id.
   *
   * Safe to show: it is an account identifier, not a credential. The
   * access token it gets used with never leaves the server.
   */
  phoneNumberId: string;
  displayPhoneNumber: string;
  status: string;
  qualityRating?: string;
  messagingLimitTier?: string;
  healthCheckedAt?: string;
  health?: NumberHealth;
}

/**
 * What the server has been given, without any of the values.
 *
 * Read before the registration form is used rather than after it fails:
 * "Meta refused the registration" is a dead end when the real answer is
 * that nobody set the PIN. Lengths and booleans only — the endpoint is
 * deliberately built never to echo a secret.
 */
export interface MetaConfigHealth {
  callbackUrl: string | null;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  accessTokenConfigured: boolean;
  registerPinConfigured: boolean;
  mockMode: boolean;
  queueMode: string;
}

export async function fetchMetaConfigHealth(): Promise<MetaConfigHealth | null> {
  try {
    // Unauthenticated on the server by design — it exists to be curled at
    // a fresh deployment before anyone can sign in — so it goes out
    // without the Bearer header rather than through request().
    const res = await fetch(`${baseUrl()}/webhooks/meta/health`);
    if (!res.ok) return null;
    const body = (await res.json()) as { data: MetaConfigHealth };
    return body.data;
  } catch {
    // Never fatal. The form still works; it just cannot warn in advance.
    return null;
  }
}

function baseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_VOXO_API_URL;
  if (!raw) throw new VoxoError('This build has no VOXO backend configured.');
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed.toLowerCase().endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export class VoxoError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'VoxoError';
    this.status = status;
    this.code = code;
  }
}

/**
 * The refresh in flight, if any.
 *
 * Four widgets rendering at once will all 401 within the same tick when a
 * token expires. Without this they would each spend the refresh token —
 * and the backend rotates it, so the second one to arrive is presented
 * with a token the first already used and the whole family is revoked as a
 * replay. One promise, shared.
 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = readSession();
  if (!session?.refreshToken) return null;

  refreshing ??= (async () => {
    try {
      const res = await fetch(`${baseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data: Session };
      writeSession(body.data);
      return body.data.accessToken;
    } catch {
      return null;
    } finally {
      // Cleared in a microtask rather than here, so the callers already
      // awaiting this promise all read the same result before the next
      // 401 can start a second round.
      queueMicrotask(() => {
        refreshing = null;
      });
    }
  })();

  return refreshing;
}

async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession();
  let res: Response;
  try {
    res = await send(path, init, session?.accessToken ?? null);
  } catch {
    throw new VoxoError('Could not reach the server. Check your connection and try again.');
  }

  // One retry, and only for an expired access token. A 401 after a
  // successful refresh means the account itself is gone or disabled, and
  // retrying that forever is how a login page ends up in a loop.
  if (res.status === 401 && session?.refreshToken) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      res = await send(path, init, fresh);
    } else {
      clearSession();
      throw new VoxoError('Your session has expired. Sign in again.', 401);
    }
  }

  if (res.status === 401) {
    clearSession();
    throw new VoxoError('Your session has expired. Sign in again.', 401);
  }

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as
    | { data?: T; error?: { message?: string; code?: string } }
    | null;

  if (!res.ok) {
    throw new VoxoError(
      body?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      body?.error?.code,
    );
  }
  return body?.data as T;
}

/* ── Auth ─────────────────────────────────────────────────────────── */

export async function login(identifier: string, password: string): Promise<Session> {
  const res = await fetch(`${baseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  }).catch(() => {
    throw new VoxoError('Could not reach the server. Check your connection and try again.');
  });

  const body = (await res.json().catch(() => null)) as
    | { data?: Session; error?: { message?: string } }
    | null;
  if (!res.ok || !body?.data) {
    throw new VoxoError(body?.error?.message ?? 'Invalid phone number or password', res.status);
  }
  return body.data;
}

export function fetchMe(): Promise<VoxoUser> {
  return request<VoxoUser>('/auth/me');
}

/* ── Users ────────────────────────────────────────────────────────── */

export interface CreateMemberInput {
  phone: string;
  email: string;
  password: string;
  role: 'MASTER_ADMIN' | 'SUB_USER';
  permissions: string[];
  validUntil: string;
  displayName?: string;
  whatsappPhoneNumberId?: string;
}

export function listMembers(): Promise<TeamMember[]> {
  return request<TeamMember[]>('/users');
}

export function createMember(input: CreateMemberInput): Promise<TeamMember> {
  return request<TeamMember>('/users', { method: 'POST', body: JSON.stringify(input) });
}

export interface UpdateMemberInput {
  phone?: string;
  role?: 'MASTER_ADMIN' | 'SUB_USER';
  permissions?: string[];
  validUntil?: string;
  status?: 'ACTIVE' | 'DISABLED';
  displayName?: string;
  whatsappPhoneNumberId?: string | null;
}

export function updateMember(id: string, patch: UpdateMemberInput): Promise<TeamMember> {
  return request<TeamMember>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function disableMember(id: string): Promise<unknown> {
  return request(`/users/${id}`, { method: 'DELETE' });
}

/* ── WhatsApp numbers, for the assignment dropdown ────────────────── */

export function listWhatsAppNumbers(): Promise<WhatsAppNumber[]> {
  return request<WhatsAppNumber[]>('/whatsapp/numbers');
}

/**
 * Step one: tell VOXO the number exists.
 *
 * The id is checked against Meta before anything is stored, so a typo
 * fails here — naming the problem — rather than at 3am inside a send.
 */
export function addWhatsAppNumber(phoneNumberId: string, wabaId?: string): Promise<WhatsAppNumber> {
  return request<WhatsAppNumber>('/whatsapp/numbers', {
    method: 'POST',
    body: JSON.stringify({ phoneNumberId, wabaId: wabaId || undefined }),
  });
}

/**
 * Step two: register it for the Cloud API — Meta's POST /{id}/register,
 * the call that takes the six-digit PIN.
 *
 * The PIN and the access token are the server's, not the browser's. Meta
 * treats that PIN as the number's two-step verification code and it must
 * stay the same forever, so it lives in one place as configuration rather
 * than being retyped into a form where a different value each time would
 * quietly break re-registration.
 *
 * Safe to repeat: Meta's "already registered" comes back as success.
 */
export function registerNumberForCloudApi(
  id: string,
): Promise<{ registered: boolean; message: string }> {
  return request<{ registered: boolean; message: string }>(
    `/whatsapp/numbers/${id}/register`,
    { method: 'POST' },
  );
}
