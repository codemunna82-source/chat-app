import axios from 'axios';

const getBaseURL = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  // When running in the browser, default to the current origin (helps on custom domains)
  if (typeof window !== 'undefined') {
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
