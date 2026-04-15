import axios from 'axios';

/** Ensure base URL ends with exactly one `/api` (common mistake: env host without `/api` → 404 on `/users`). */
export function normalizeApiBaseUrl(url: string): string {
  let u = url.trim();
  while (u.endsWith('/')) u = u.slice(0, -1);
  if (u.toLowerCase().endsWith('/api')) return u;
  return `${u}/api`;
}

const getBaseURL = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Next.js and the Express API are usually on different ports in local dev.
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
    // Phone / LAN testing: UI on http://192.168.x.x:3000 → API on same host :5000 (no Next proxy by default).
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      return `http://${host}:5000/api`;
    }
    // Same-origin production (e.g. API behind reverse proxy on the same host)
    return `${window.location.origin.replace(/\/$/, '')}/api`;
  }

  // Common serverless hosts expose public URL envs during SSR
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api`;
  if (process.env.RENDER_EXTERNAL_URL) return `https://${process.env.RENDER_EXTERNAL_URL}/api`;

  return 'http://localhost:5000/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to inject the token
api.interceptors.request.use(
  (config) => {
    // FormData must set multipart boundary in the browser — strip JSON default / manual multipart.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
      const h = config.headers as { delete?: (k: string) => void } & Record<string, unknown>;
      if (typeof h.delete === 'function') {
        h.delete('Content-Type');
      } else {
        delete h['Content-Type'];
      }
    }

    // Safely retrieve token from Zustand persisted state
    if (typeof window !== 'undefined') {
      try {
        const userInfo = localStorage.getItem('userInfo');
        if (userInfo) {
          const parsed = JSON.parse(userInfo);
          // Zustand persist format contains the actual state inside `state`
          const token = parsed?.state?.user?.token;
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
      } catch (e) {
        console.error('Error parsing token from storage:', e);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('userInfo');
        window.location.href = '/login'; // Or whatever your login route is
      }
    }
    return Promise.reject(error);
  }
);

export default api;
