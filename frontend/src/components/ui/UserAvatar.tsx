'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { User } from 'lucide-react';
import { resolvePublicFileUrl } from '@/lib/publicFileUrl';
import { cn } from '@/lib/utils';

function initialsFromName(name?: string | null): string {
  const n = name?.trim();
  if (!n) return '';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export type UserAvatarProps = {
  src?: string | null;
  name?: string | null;
  /** Tailwind size classes on the outer box, e.g. `h-14 w-14` */
  className?: string;
  /** Extra classes on the image / fallback circle */
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  /** Controls fallback initials scale */
  variant?: 'sm' | 'md' | 'lg';
};

/**
 * Profile / status avatar: resolves `/uploads/...` against the API host, then shows initials or a user icon if the image fails.
 */
export function UserAvatar({
  src,
  name,
  className = 'h-10 w-10',
  imageClassName,
  sizes = '40px',
  priority = false,
  variant = 'sm',
}: UserAvatarProps) {
  const [failed, setFailed] = useState(false);

  const displayUrl = useMemo(() => {
    const raw = (src || '').trim();
    if (!raw) return '';
    return resolvePublicFileUrl(raw) || '';
  }, [src]);

  useEffect(() => {
    setFailed(false);
  }, [displayUrl]);

  const initials = initialsFromName(name);
  const showPhoto = Boolean(displayUrl) && !failed;

  const initialsCls =
    variant === 'lg'
      ? 'text-2xl font-bold tracking-tight'
      : variant === 'md'
        ? 'text-sm font-bold tracking-tight'
        : 'text-[10px] font-bold tracking-tight sm:text-xs';

  const iconCls = variant === 'lg' ? 'h-12 w-12' : variant === 'md' ? 'h-7 w-7' : 'h-4 w-4';

  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-full bg-muted', className)}>
      {showPhoto ? (
        <Image
          src={displayUrl}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className={cn('object-cover', imageClassName)}
          unoptimized={
            displayUrl.includes('localhost') ||
            displayUrl.startsWith('data:') ||
            displayUrl.startsWith('blob:') ||
            /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(displayUrl)
          }
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/25 to-primary/5 text-primary"
          aria-hidden
        >
          {initials ? (
            <span className={cn('select-none leading-none', initialsCls)}>{initials}</span>
          ) : (
            <User className={cn(iconCls, 'opacity-80')} strokeWidth={1.75} />
          )}
        </div>
      )}
    </div>
  );
}
