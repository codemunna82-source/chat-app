/**
 * ICE server configuration: STUN defaults + optional TURN from env / JSON override.
 * NEXT_PUBLIC_ICE_SERVERS — full RTCConfiguration JSON (highest priority).
 * NEXT_PUBLIC_TURN_URLS — comma-separated turn: or turns: URLs
 * NEXT_PUBLIC_TURN_USERNAME / NEXT_PUBLIC_TURN_CREDENTIAL — TURN credentials
 */

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

function parseTurnFromEnv(): RTCIceServer[] {
  const urlsRaw = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_URLS : undefined;
  const username = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_USERNAME : undefined;
  const credential = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_CREDENTIAL : undefined;
  if (!urlsRaw?.trim()) return [];
  const urls = urlsRaw
    .split(/[,;\s]+/)
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return [];
  const server: RTCIceServer = { urls };
  if (username != null && username !== '') server.username = username;
  if (credential != null && credential !== '') server.credential = credential;
  return [server];
}

function parseJsonIceConfig(): RTCConfiguration | null {
  if (typeof process === 'undefined') return null;
  try {
    const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as RTCConfiguration;
    if (parsed?.iceServers && Array.isArray(parsed.iceServers) && parsed.iceServers.length > 0) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getRtcConfiguration(): RTCConfiguration {
  const fromJson = parseJsonIceConfig();
  if (fromJson) return fromJson;

  const iceServers: RTCIceServer[] = [...DEFAULT_STUN, ...parseTurnFromEnv()];
  return { iceServers, iceTransportPolicy: 'all' as RTCIceTransportPolicy };
}
