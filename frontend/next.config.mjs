/** @type {import('next').NextConfig} */
const deriveHost = (raw) => {
  if (!raw) return null;
  try {
    const url = new URL(raw.replace(/\/api$/, ''));
    return url.hostname;
  } catch (_) {
    // If raw is just a hostname without protocol
    return raw.replace(/\/api$/, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
};

// Allow production file/API host for <Image>
const envHost =
  deriveHost(process.env.NEXT_PUBLIC_IMAGE_HOST) ||
  deriveHost(process.env.NEXT_PUBLIC_FILE_HOST) ||
  deriveHost(process.env.NEXT_PUBLIC_API_URL);

const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/favicon.svg', permanent: false }];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5000',
        pathname: '/uploads/**',
      },
      envHost && {
        protocol: 'http',
        hostname: envHost,
        pathname: '/**',
      },
      envHost && {
        protocol: 'https',
        hostname: envHost,
        pathname: '/**', // allow avatars/status/media from backend host
      },
      {
        protocol: 'https',
        hostname: 'icon-library.com',
        port: '',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Common for Google OAuth OAuth
      },
      {
        protocol: 'https',
        hostname: 'randomuser.me',
        pathname: '/api/portraits/**',
      },
    ].filter(Boolean),
  },
};

export default nextConfig;
