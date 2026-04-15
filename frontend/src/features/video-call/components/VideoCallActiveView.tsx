'use client';

import { memo, useMemo, useCallback, useRef, useState } from 'react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Mic, MicOff, Monitor, MonitorOff, PhoneMissed, Repeat, RefreshCw, Video, VideoOff } from 'lucide-react';
import type { RefObject } from 'react';
import type { VideoCallConnectionQuality } from '../types';
import ConnectionBadge from './ConnectionBadge';
import { Video3DContainer } from '@/components/three/Video3DContainer';
import { useDeviceUIProfile } from '@/hooks/useDeviceUIProfile';
import { Glass3DButton } from '@/components/three/Glass3DButton';

export type VideoCallActiveViewProps = {
  callType: 'audio' | 'video';
  remoteName?: string;
  remoteAvatar?: string;
  durationSec: number;
  connectionQuality: VideoCallConnectionQuality;
  iceState: RTCIceConnectionState | null;
  micOn: boolean;
  cameraOn: boolean;
  isScreenSharing: boolean;
  mediaError: string | null;
  signalingError: string | null;
  onDismissErrors: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onEndCall: () => void;
  onScreenShare: () => void;
  onStopScreenShare: () => void;
  onRetryIce: () => void;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  remoteAudioRef: RefObject<HTMLVideoElement | null>;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  backgroundVideoRef: RefObject<HTMLVideoElement | null>;
};

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function VideoCallActiveViewInner(props: VideoCallActiveViewProps) {
  const {
    callType,
    remoteName,
    remoteAvatar,
    durationSec,
    connectionQuality,
    iceState,
    micOn,
    cameraOn,
    isScreenSharing,
    mediaError,
    signalingError,
    onDismissErrors,
    onToggleMic,
    onToggleCamera,
    onSwitchCamera,
    onEndCall,
    onScreenShare,
    onStopScreenShare,
    onRetryIce,
    remoteVideoRef,
    remoteAudioRef,
    localVideoRef,
    backgroundVideoRef,
  } = props;

  const showRetry = useMemo(() => connectionQuality === 'failed' || connectionQuality === 'poor', [connectionQuality]);
  const { isMobile } = useDeviceUIProfile();

  const [pipOffset, setPipOffset] = useState({ x: 0, y: 0 });
  const pipOffsetRef = useRef(pipOffset);
  pipOffsetRef.current = pipOffset;
  const pipDrag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const onPipPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pipDrag.current = {
      px: e.clientX,
      py: e.clientY,
      ox: pipOffsetRef.current.x,
      oy: pipOffsetRef.current.y,
    };
  }, []);

  const onPipPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!pipDrag.current) return;
    const { px, py, ox, oy } = pipDrag.current;
    setPipOffset({
      x: ox + (e.clientX - px),
      y: oy + (e.clientY - py),
    });
  }, []);

  const onPipPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    pipDrag.current = null;
  }, []);

  return (
    <div
      className={`flex h-full min-h-0 w-full flex-col gap-2 sm:gap-4 sm:pb-6 sm:pt-10 md:pt-12 md:px-6 ${
        isMobile ? 'min-h-[100dvh] px-0 pb-0 pt-1' : 'px-2 pb-2 pt-2 sm:px-3'
      }`}
    >
      {(mediaError || signalingError) && (
        <div className="mx-auto flex w-full max-w-xl items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          <p className="min-w-0 flex-1">{mediaError || signalingError}</p>
          <button type="button" onClick={onDismissErrors} className="shrink-0 text-red-200 underline-offset-2 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ConnectionBadge quality={connectionQuality} iceState={iceState} />
          <span className="rounded-full bg-black/30 px-3 py-1 font-mono text-sm text-white tabular-nums backdrop-blur-sm">
            {formatDuration(durationSec)}
          </span>
        </div>
        {showRetry ? (
          <button
            type="button"
            onClick={onRetryIce}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <RefreshCw className="h-4 w-4" />
            Retry ICE
          </button>
        ) : null}
      </div>

      {/* 1:1 layout — grid is ready for extra participants (span full row each). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        <Video3DContainer
          className={
            isMobile
              ? 'min-h-[min(58dvh,calc(100dvh-14rem))] rounded-none border-x-0 sm:min-h-[300px]'
              : 'min-h-[min(52dvh,420px)] sm:min-h-[300px] md:min-h-[360px]'
          }
        >
          {callType === 'video' ? (
            <>
              <video
                playsInline
                muted
                ref={backgroundVideoRef}
                autoPlay
                className={`pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover ${
                  isMobile ? 'opacity-40 blur-xl' : 'opacity-50 blur-3xl'
                }`}
              />
              <video
                playsInline
                ref={remoteVideoRef}
                autoPlay
                className={`relative z-[1] h-full w-full ${isMobile ? 'object-cover' : 'object-contain'}`}
              />
            </>
          ) : (
            <div className="relative z-[1] flex h-full w-full flex-col items-center justify-center gap-4 p-8">
              <div className="relative h-44 w-44">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" style={{ animationDuration: '2.5s' }} />
                <div className="relative z-10 mx-auto h-44 w-44">
                  <UserAvatar
                    src={remoteAvatar}
                    name={remoteName}
                    variant="lg"
                    className="h-44 w-44 border-4 border-white/20 shadow-2xl"
                    sizes="176px"
                  />
                </div>
              </div>
              <h2 className="text-center text-2xl font-semibold text-white drop-shadow">{remoteName}</h2>
              <p className="text-sm font-medium tracking-wide text-primary/90">Voice call</p>
              <video ref={remoteAudioRef} autoPlay playsInline className="hidden" />
            </div>
          )}

          {callType === 'video' ? (
            <div
              className="absolute right-3 z-20 w-[30%] min-w-[112px] max-w-[200px] touch-none cursor-grab overflow-hidden rounded-2xl border-2 border-white/30 bg-black/50 shadow-[0_20px_50px_rgba(0,0,0,0.55)] ring-2 ring-white/15 backdrop-blur-[2px] active:cursor-grabbing max-md:bottom-[max(5.5rem,calc(1rem+env(safe-area-inset-bottom,0px)))] md:bottom-4 md:right-4 md:hover:-translate-y-0.5 md:transition-transform motion-reduce:md:hover:translate-y-0"
              style={{ transform: `translate3d(${pipOffset.x}px, ${pipOffset.y}px, 0)` }}
              onPointerDown={onPipPointerDown}
              onPointerMove={onPipPointerMove}
              onPointerUp={onPipPointerUp}
              onPointerCancel={onPipPointerUp}
            >
              <video playsInline muted ref={localVideoRef} autoPlay className="aspect-video h-full w-full object-cover" />
            </div>
          ) : null}
        </Video3DContainer>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-2 rounded-3xl border border-white/15 bg-black/35 px-3 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:gap-3 sm:px-6 sm:py-3.5 md:static md:max-w-none md:rounded-full md:px-8 md:py-4 max-md:fixed max-md:left-3 max-md:right-3 max-md:bottom-[max(0.65rem,env(safe-area-inset-bottom,0px))] max-md:z-30">
        {callType === 'video' ? (
          <>
            <Glass3DButton
              type="button"
              onClick={onToggleCamera}
              className={`min-h-[48px] min-w-[48px] border-white/10 p-3.5 shadow-lg sm:p-4 ${
                cameraOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500/20 text-red-100 hover:bg-red-500/30'
              }`}
              aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {cameraOn ? <Video className="h-6 w-6 sm:h-7 sm:w-7" /> : <VideoOff className="h-6 w-6 sm:h-7 sm:w-7" />}
            </Glass3DButton>
            <Glass3DButton
              type="button"
              onClick={onSwitchCamera}
              className="min-h-[48px] min-w-[48px] border-white/10 bg-white/15 p-3.5 text-white shadow-lg hover:bg-white/25 sm:p-4"
              aria-label="Switch camera"
            >
              <Repeat className="h-6 w-6 sm:h-7 sm:w-7" />
            </Glass3DButton>
            <Glass3DButton
              type="button"
              onClick={isScreenSharing ? onStopScreenShare : onScreenShare}
              className={`min-h-[48px] min-w-[48px] border-white/10 p-3.5 shadow-lg sm:p-4 ${
                isScreenSharing ? 'bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35' : 'bg-white/15 text-white hover:bg-white/25'
              }`}
              aria-label={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing ? <MonitorOff className="h-6 w-6 sm:h-7 sm:w-7" /> : <Monitor className="h-6 w-6 sm:h-7 sm:w-7" />}
            </Glass3DButton>
          </>
        ) : null}
        <Glass3DButton
          type="button"
          onClick={onToggleMic}
          className={`min-h-[48px] min-w-[48px] border-white/10 p-3.5 shadow-lg sm:p-4 ${
            micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-red-500/20 text-red-100 hover:bg-red-500/30'
          }`}
          aria-label={micOn ? 'Mute' : 'Unmute'}
        >
          {micOn ? <Mic className="h-6 w-6 sm:h-7 sm:w-7" /> : <MicOff className="h-6 w-6 sm:h-7 sm:w-7" />}
        </Glass3DButton>
        <Glass3DButton
          type="button"
          onClick={onEndCall}
          className="min-h-[52px] min-w-[52px] border-white/15 bg-red-600 p-3.5 text-white shadow-xl shadow-red-600/35 hover:bg-red-500 sm:p-4"
          aria-label="End call"
        >
          <PhoneMissed className="h-7 w-7 sm:h-8 sm:w-8" />
        </Glass3DButton>
      </div>
    </div>
  );
}

export default memo(VideoCallActiveViewInner);
