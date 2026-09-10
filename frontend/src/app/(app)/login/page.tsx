'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MessageSquareText } from 'lucide-react';
import { AuthGlassShell } from '@/components/auth/AuthGlassShell';
import { formatAuthNetworkError } from '@/lib/formatAuthNetworkError';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // /auth/login, not /users/login — the latter is not a route the
      // backend has ever had, so this form could never have signed anyone
      // in. Corrected here rather than left as a second thing to discover.
      const { data } = await api.post('/auth/login', { identifier, password });
      setUser(data);
      router.push('/');
    } catch (err: unknown) {
      setError(formatAuthNetworkError(err, api.defaults.baseURL || ''));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthGlassShell>
      <div className="flex flex-col items-center space-y-2 text-center">
        <div className="rounded-full bg-primary/15 p-3.5 ring-1 ring-primary/20 shadow-lg shadow-primary/10">
          <MessageSquareText className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Sign in to ChatApp</h2>
        <p className="text-sm text-muted leading-relaxed">Welcome back! Please enter your details.</p>
      </div>

      <form onSubmit={handleLogin} className="mt-8 space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3.5 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap leading-relaxed"
          >
            {error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="login-identifier" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Phone number
          </label>
          <Input
            id="login-identifier"
            // tel, not email: the field takes a phone number. type="email"
            // would have the browser refuse the form on a valid number.
            type="tel"
            inputMode="tel"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            // The country code is what makes the number unambiguous, and
            // the placeholder is the only place that gets said before
            // someone types the wrong thing and is told no.
            placeholder="+91 98765 43210"
            required
            autoComplete="tel"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="login-password" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Password
          </label>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" variant="glass" className="mt-2 w-full min-h-12 text-base btn-liquid" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-semibold text-primary hover:text-primary-hover underline-offset-2 hover:underline">
          Sign up
        </Link>
      </p>
    </AuthGlassShell>
  );
}
