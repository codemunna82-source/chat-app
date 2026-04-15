/**
 * Base URL for static files served by the backend (e.g. /uploads/...).
 * Must match the API host, not the Next.js origin, when frontend and API are split.
 */
export function getPublicFileBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FILE_HOST) {
    return process.env.NEXT_PUBLIC_FILE_HOST.replace(/\/$/, '');
  }
  const api = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined;
  if (api) {
    return api.replace(/\/api\/?$/, '').replace(/\/$/, '');
  }
  const socketUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SOCKET_URL : undefined;
  if (socketUrl) {
    return socketUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'http://localhost:5000';
}

/** Resolve a backend-relative media path (/uploads/x) or absolute URL for <img> / <video> / <audio>. */
export function resolvePublicFileUrl(url?: string | null): string {
  if (!url) return '';
  if (/^data:/i.test(url)) return url;
  if (/^blob:/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = getPublicFileBaseUrl();
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}
