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

export interface AddNumberInput {
  phoneNumberId: string;
  wabaId?: string;
  /** Which Business Manager this number lives under. Omitted = the server's global config. */
  metaAppId?: string;
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
  /**
   * The admin's own switch, not Meta's.
   *
   * `status` is what Meta says about the number; this is whether the
   * workspace has left it switched on. Off locks out every member
   * assigned to it. Older servers do not send it — treated as on there,
   * which is what the server itself does for numbers stored before the
   * field existed.
   */
  enabled?: boolean;
  /**
   * Meta's calling status — 'ENABLED' | 'DISABLED', absent if never read.
   *
   * Off by default on every number Meta issues, which is the single most
   * common reason a WhatsApp call never arrives.
   */
  callingStatus?: string;
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
  email?: string;
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

/**
 * An admin setting a new password for someone.
 *
 * Its own call rather than a field on updateMember, mirroring the server:
 * the PATCH route records its whole body in the audit log, so a password
 * does not go through it.
 */
export function resetMemberPassword(id: string, password: string): Promise<TeamMember> {
  return request<TeamMember>(`/users/${id}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function disableMember(id: string): Promise<unknown> {
  return request(`/users/${id}`, { method: 'DELETE' });
}

/* ── Workspace settings ───────────────────────────────────────────── */

export interface AutoGuestLink {
  enabled: boolean;
  /**
   * Whether anything will actually be sent.
   *
   * Not the same as `enabled`: a workspace switched on before it named a
   * template has enabled true and nothing to send. Only present on the
   * settings read — a save returns what was stored.
   */
  active?: boolean;
  /** How the invitation is sent. 'text' needs nothing from Meta. */
  mode: 'text' | 'template';
  /** The wording sent in text mode. {{link}} becomes the customer's own URL. */
  message: string;
  /** The approved WhatsApp template's name, as it appears in WhatsApp Manager. */
  templateName: string;
  /** Meta's language code for the approved copy, e.g. "en" or "en_US". */
  templateLanguage: string;
  /** What fills the template body's {{1}}, when it has one. */
  bodyVariable: 'none' | 'customer_name';
  /** How many times one customer may be sent the invitation. 1–3. */
  maxSends: number;
  /** Keep a customer's WhatsApp messages out of the inbox until they open the window. */
  holdWhatsAppUntilOpened: boolean;
  /** Posted into the chat the first time the customer writes from the window. */
  welcomeMessage: string;
}

/** Where the name a customer sees in the web chat window came from. */
export type BusinessNameSource = 'settings' | 'whatsapp' | 'workspace' | 'fallback';

export interface BusinessProfile {
  /** The override set on this screen; empty when unset. */
  displayName: string;
  /** What a customer actually reads at the top of the web chat window. */
  customerFacingName: string;
  customerFacingNameSource: BusinessNameSource;
  /** Meta's approved display name for the workspace's first number, if any. */
  whatsappVerifiedName: string;
}

export interface TenantSettings extends BusinessProfile {
  /** The workspace's internal label. Staff-facing only. */
  name: string;
  autoGuestLink: AutoGuestLink;
  /** False means the server has no GUEST_LINK_BASE_URL, so there is no link to send. */
  guestLinkConfigured: boolean;
  /** The exact URL to paste into the template's button in WhatsApp Manager. */
  guestLinkUrlPattern: string | null;
}

export function fetchTenantSettings(): Promise<TenantSettings> {
  return request<TenantSettings>('/tenant/settings');
}

/**
 * Sets the name customers see. An empty string is meaningful — it clears
 * the override and goes back to the name WhatsApp holds for the number —
 * so it is sent rather than treated as "no change".
 */
export function updateBusinessProfile(input: { displayName: string }): Promise<BusinessProfile> {
  return request<BusinessProfile>('/tenant/settings/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function updateAutoGuestLink(input: {
  enabled: boolean;
  mode?: 'text' | 'template';
  message?: string;
  templateName?: string;
  templateLanguage?: string;
  bodyVariable?: 'none' | 'customer_name';
  maxSends?: number;
  holdWhatsAppUntilOpened?: boolean;
  welcomeMessage?: string;
}): Promise<AutoGuestLink> {
  return request<AutoGuestLink>('/tenant/settings/auto-guest-link', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/* ── Meta apps (Business Managers) ─────────────────────────────────── */

export interface MetaAppSummary {
  /** null for the server's own environment configuration, which cannot be edited here. */
  id: string | null;
  name: string;
  /** An identifier, not a credential — Meta puts it in URLs. Null if unset. */
  appId: string | null;
  status: 'ACTIVE' | 'DISABLED';
  /** Paste this into the Meta app's webhook Callback URL. */
  webhookUrl: string;
  /**
   * Whether each credential is set. Never the value: these can send as the
   * business to any of its customers, and an admin page is one screenshot
   * away from public.
   */
  hasAppSecret: boolean;
  hasAccessToken: boolean;
  /** How many WhatsApp numbers sit under this Business Manager. */
  numberCount: number;
  /** True for the environment row, which is shown but not editable. */
  isDefault: boolean;
  createdAt: string | null;
}

/** Only on creation: the verify token, which is never readable again. */
export interface MetaAppCreated extends MetaAppSummary {
  verifyToken: string;
}

export function listMetaApps(): Promise<MetaAppSummary[]> {
  return request<MetaAppSummary[]>('/meta-apps');
}

export function createMetaApp(input: {
  name: string;
  appId: string;
  appSecret: string;
  accessToken?: string;
}): Promise<MetaAppCreated> {
  return request<MetaAppCreated>('/meta-apps', { method: 'POST', body: JSON.stringify(input) });
}

export function updateMetaApp(
  id: string,
  patch: { name?: string; appSecret?: string; accessToken?: string; status?: 'ACTIVE' | 'DISABLED' },
): Promise<MetaAppSummary> {
  return request<MetaAppSummary>(`/meta-apps/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
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
export function addWhatsAppNumber(input: AddNumberInput): Promise<WhatsAppNumber> {
  return request<WhatsAppNumber>('/whatsapp/numbers', {
    method: 'POST',
    body: JSON.stringify({
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId || undefined,
      metaAppId: input.metaAppId || undefined,
    }),
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
/**
 * Switches one number's access on or off.
 *
 * Off means every member assigned to that number is refused at sign-in
 * and on every request, with "Your access has been turned off. Please
 * contact your administrator." Inbound customer messages still land —
 * what is gated is who may work them.
 */
export function setNumberEnabled(id: string, enabled: boolean): Promise<WhatsAppNumber> {
  return request<WhatsAppNumber>(`/whatsapp/numbers/${encodeURIComponent(id)}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

/**
 * Switches WhatsApp voice calling on or off for a number, at Meta.
 *
 * On also asks Meta to show the call button in the customer's own
 * WhatsApp chat — without that the number can take calls nobody has any
 * way to place.
 */
export function setNumberCalling(id: string, enabled: boolean): Promise<WhatsAppNumber> {
  return request<WhatsAppNumber>(`/whatsapp/numbers/${encodeURIComponent(id)}/calling`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function registerNumberForCloudApi(
  id: string,
): Promise<{ registered: boolean; message: string }> {
  return request<{ registered: boolean; message: string }>(
    `/whatsapp/numbers/${id}/register`,
    { method: 'POST' },
  );
}
