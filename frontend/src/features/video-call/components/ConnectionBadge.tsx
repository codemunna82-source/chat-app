'use client';

import { memo } from 'react';
import type { VideoCallConnectionQuality } from '../types';

type Props = {
  quality: VideoCallConnectionQuality;
  iceState: RTCIceConnectionState | null;
  className?: string;
};

const label: Record<VideoCallConnectionQuality, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  good: 'Connected',
  poor: 'Unstable network',
  failed: 'Connection failed',
};

function ConnectionBadgeInner({ quality, iceState, className = '' }: Props) {
  const tone =
    quality === 'good'
      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
      : quality === 'poor'
        ? 'bg-amber-500/15 text-amber-100 border-amber-500/35'
        : quality === 'failed'
          ? 'bg-red-500/15 text-red-100 border-red-500/35'
          : 'bg-white/10 text-white/90 border-white/20';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm ${tone} ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {quality === 'connecting' || quality === 'idle' ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60 opacity-75" />
        ) : null}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            quality === 'good' ? 'bg-emerald-400' : quality === 'poor' ? 'bg-amber-400' : quality === 'failed' ? 'bg-red-400' : 'bg-white/70'
          }`}
        />
      </span>
      <span>{label[quality]}</span>
      {iceState && process.env.NODE_ENV === 'development' ? (
        <span className="text-[10px] opacity-60">({iceState})</span>
      ) : null}
    </div>
  );
}

export default memo(ConnectionBadgeInner);
