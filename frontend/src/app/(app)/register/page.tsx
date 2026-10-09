'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { AuthGlassShell } from '@/components/auth/AuthGlassShell';
import { formatAuthNetworkError } from '@/lib/formatAuthNetworkError';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data } = await api.post('/users', { name, email, password });
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
          <UserPlus className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Create an account</h2>
        <p className="text-sm text-muted leading-relaxed">Sign up to start chatting with your friends.</p>
      </div>

      <form onSubmit={handleRegister} className="mt-8 space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3.5 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap leading-relaxed"
          >
            {error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="register-name" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Display name
          </label>
          <Input
            id="register-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            required
            autoComplete="name"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-email" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Email
          </label>
          <Input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-password" className="text-xs font-semibold uppercase tracking-wide text-muted">
            Password
          </label>
          <Input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
          />
        </div>

        <Button type="submit" variant="glass" className="mt-2 w-full min-h-12 text-base btn-liquid" disabled={isLoading}>
          {isLoading ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-hover underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthGlassShell>
  );
}
