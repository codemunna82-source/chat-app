'use client';

import { memo, type RefObject } from 'react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Phone, PhoneMissed, Video } from 'lucide-react';

export type VideoCallRingingViewProps = {
  callType: 'audio' | 'video';
  isReceiving: boolean;
  remoteName?: string;
  remoteAvatar?: string;
  callEnded: boolean;
  mediaError: string | null;
  onAnswer: () => void;
  onDecline: () => void;
  backgroundVideoRef: RefObject<HTMLVideoElement | null>;
};

function VideoCallRingingViewInner({
  callType,
  isReceiving,
  remoteName,
  remoteAvatar,
  callEnded,
  mediaError,
  onAnswer,
  onDecline,
  backgroundVideoRef,
}: VideoCallRingingViewProps) {
  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-border/60 bg-surface/95 shadow-2xl">
      {callType === 'video' && !callEnded ? (
        <>
          <video
            playsInline
            muted
            ref={backgroundVideoRef}
            autoPlay
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-85 blur-2xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-black/40 to-black/55" />
        </>
      ) : null}

      {!callEnded ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-40 animate-ping rounded-full bg-primary/15" style={{ animationDuration: '2s' }} />
        </div>
      ) : null}

      <div className="relative z-10 flex flex-col items-center px-8 py-10">
        {mediaError ? (
          <p className="mb-4 max-w-xs text-center text-sm text-red-600 dark:text-red-400">{mediaError}</p>
        ) : null}

        <div className="relative mb-6 h-32 w-32">
          <UserAvatar
            src={remoteAvatar}
            name={remoteName}
            variant="lg"
            className="h-32 w-32 border-[6px] border-surface shadow-2xl"
            sizes="128px"
          />
        </div>

        <h2 className="mb-2 text-center text-2xl font-bold text-foreground">{remoteName || 'Unknown'}</h2>
        <p className="mb-10 h-6 text-center text-sm font-medium tracking-wide text-muted">
          {callEnded ? 'Call ended' : isReceiving ? `Incoming ${callType} call…` : 'Calling…'}
        </p>

        <div className="flex gap-8">
          {isReceiving && !callEnded ? (
            <button
              type="button"
              className="rounded-full bg-primary p-4 text-white shadow-lg shadow-primary/30 transition-transform hover:scale-110 hover:bg-primary-hover"
              onClick={onAnswer}
              aria-label="Answer call"
            >
              {callType === 'video' ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7 fill-current" />}
            </button>
          ) : null}

          {!callEnded ? (
            <button
              type="button"
              className="rounded-full bg-red-500 p-4 text-white shadow-lg shadow-red-500/30 transition-transform hover:scale-110 hover:bg-red-600"
              onClick={onDecline}
              aria-label="Decline call"
            >
              <PhoneMissed className="h-7 w-7" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(VideoCallRingingViewInner);
