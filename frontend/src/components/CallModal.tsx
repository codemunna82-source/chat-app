'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebRTCStore } from '@/store/useWebRTCStore';
import { useSocket } from '@/contexts/SocketContext';
import { useAuthStore } from '@/store/useAuthStore';
import { useVideoCallSession } from '@/features/video-call';
import api from '@/lib/api';
import { playRingtone, playDialTone, stopTones } from '@/utils/audioTones';

const VideoCallActiveView = dynamic(
  () => import('@/features/video-call/components/VideoCallActiveView'),
  { ssr: false, loading: () => null }
);
const VideoCallRingingView = dynamic(
  () => import('@/features/video-call/components/VideoCallRingingView'),
  { ssr: false, loading: () => null }
);

export default function CallModal() {
  const {
    isCalling,
    isReceivingCall,
    callerData,
    callType,
    userToCall,
    callAccepted,
    setCallAccepted,
    resetCallState,
    receiveCall,
  } = useWebRTCStore();

  const { socket } = useSocket();
  const { user } = useAuthStore();

  const [callEnded, setCallEnded] = useState(false);
  const callEndedRef = useRef(false);
  const callMetaRef = useRef({
    callType: callType as 'audio' | 'video' | null,
    userToCall,
    callerData,
    callAccepted,
  });
  const hasLoggedRef = useRef(false);
  const initiatedByRef = useRef<'me' | 'them' | null>(null);

  useEffect(() => {
    callEndedRef.current = callEnded;
  }, [callEnded]);

  useEffect(() => {
    callMetaRef.current = { callType, userToCall, callerData, callAccepted };
  }, [callType, userToCall, callerData, callAccepted]);

  useEffect(() => {
    if (isCalling) initiatedByRef.current = 'me';
    else if (isReceivingCall && !initiatedByRef.current) initiatedByRef.current = 'them';
    if (isCalling || isReceivingCall) {
      hasLoggedRef.current = false;
      setCallEnded(false);
    }
  }, [isCalling, isReceivingCall]);

  const vc = useVideoCallSession({
    socket,
    user,
    isCalling,
    isReceivingCall,
    callAccepted,
    callType: callType ?? 'audio',
    userToCall,
    callerData,
    setCallAccepted,
  });

  const endCallSessionRef = useRef(vc.endCallSession);
  endCallSessionRef.current = vc.endCallSession;

  const callTimingRef = useRef({ start: null as number | null, dur: 0 });
  useEffect(() => {
    callTimingRef.current = { start: vc.callStartedAtMs, dur: vc.durationSec };
  }, [vc.callStartedAtMs, vc.durationSec]);

  const formatCallDuration = useCallback((seconds: number) => {
    if (!seconds || seconds < 1) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  const logCallMessageToChat = useCallback(
    async (
      otherUserId: string,
      status: 'missed' | 'accepted' | 'rejected',
      callTypeValue: 'audio' | 'video',
      durationSeconds: number
    ) => {
      try {
        const chatRes = await api.post('/chat', { userId: otherUserId });
        const chatId = chatRes.data?._id;
        if (!chatId) return;

        const statusLabel =
          status === 'accepted'
            ? `Duration ${formatCallDuration(durationSeconds)}`
            : status === 'missed'
              ? 'Missed call'
              : 'Declined';

        const content = `${callTypeValue === 'video' ? 'Video' : 'Audio'} call • ${statusLabel}`;

        const messageRes = await api.post('/message', { content, chatId });
        socket?.emit('new message', messageRes.data);
      } catch (err) {
        console.error('[CallModal] Failed to create call log message', err);
      }
    },
    [formatCallDuration, socket]
  );

  const logCallOnce = useCallback(
    async (statusOverride?: 'missed' | 'accepted' | 'rejected', durationOverride?: number) => {
      if (hasLoggedRef.current) return;
      if (initiatedByRef.current !== 'me') return;
      const { callType: ct, userToCall: utc, callerData: cd, callAccepted: accepted } = callMetaRef.current;
      if (!ct) return;

      const otherUserId = utc?._id || cd?.from;
      if (!otherUserId || !user?._id) return;

      const { start, dur } = callTimingRef.current;
      const duration =
        durationOverride ??
        (start != null ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : dur);

      const payload = {
        receiverId: otherUserId,
        status: statusOverride || (accepted ? 'accepted' : 'missed'),
        callType: ct,
        duration,
      };

      try {
        hasLoggedRef.current = true;
        await api.post('/call', payload);
        await logCallMessageToChat(otherUserId, payload.status, ct, duration);
      } catch (err) {
        hasLoggedRef.current = false;
        console.error('[CallModal] Failed to log call:', err);
      }
    },
    [user?._id, logCallMessageToChat]
  );

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: {
      from: string;
      name: string;
      signal: { sdp: RTCSessionDescriptionInit; candidates?: RTCIceCandidateInit[] };
      type?: 'audio' | 'video';
      avatar?: string;
    }) => {
      const { isCalling: c, isReceivingCall: r, callAccepted: a } = useWebRTCStore.getState();
      if (!c && !r && !a) {
        receiveCall({
          from: data.from,
          name: data.name,
          signal: data.signal,
          type: data.type || 'video',
          avatar: data.avatar,
        });
      }
    };

    const handleCallEnded = async () => {
      await logCallOnce();
      endCallSessionRef.current(false);
      resetCallState();
    };

    socket.on('call user', handleIncomingCall);
    socket.on('call ended', handleCallEnded);

    return () => {
      socket.off('call user', handleIncomingCall);
      socket.off('call ended', handleCallEnded);
    };
  }, [socket, receiveCall, logCallOnce, resetCallState]);

  useEffect(() => {
    if (callAccepted || callEnded) stopTones();
    else if (isCalling) playDialTone();
    else if (isReceivingCall) playRingtone();
    return () => stopTones();
  }, [isCalling, isReceivingCall, callAccepted, callEnded]);

  const handleEndCall = useCallback(
    async (emitEvent: boolean = true) => {
      setCallEnded(true);
      const { start, dur } = callTimingRef.current;
      const snapshotDuration =
        start != null ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : dur;
      await logCallOnce(undefined, snapshotDuration);
      endCallSessionRef.current(emitEvent);
      resetCallState();
      setTimeout(() => setCallEnded(false), 800);
    },
    [logCallOnce, resetCallState]
  );

  const activeViewProps = useMemo(
    () =>
      callType
        ? {
            callType,
            remoteName: isCalling ? userToCall?.name : callerData?.name,
            remoteAvatar: isCalling ? userToCall?.avatar : callerData?.avatar,
            durationSec: vc.durationSec,
            connectionQuality: vc.connectionQuality,
            iceState: vc.iceState,
            micOn: vc.micOn,
            cameraOn: vc.cameraOn,
            isScreenSharing: vc.isScreenSharing,
            mediaError: vc.mediaError,
            signalingError: vc.signalingError,
            onDismissErrors: vc.clearErrors,
            onToggleMic: vc.toggleMic,
            onToggleCamera: vc.toggleCamera,
            onSwitchCamera: vc.switchCameraFacing,
            onEndCall: () => void handleEndCall(true),
            onScreenShare: vc.startScreenShare,
            onStopScreenShare: vc.stopScreenShare,
            onRetryIce: vc.retryIce,
            remoteVideoRef: vc.remoteVideoRef,
            remoteAudioRef: vc.remoteAudioRef,
            localVideoRef: vc.localVideoRef,
            backgroundVideoRef: vc.backgroundVideoRef,
          }
        : null,
    [
      callType,
      isCalling,
      userToCall?.name,
      userToCall?.avatar,
      callerData?.name,
      callerData?.avatar,
      vc.durationSec,
      vc.connectionQuality,
      vc.iceState,
      vc.micOn,
      vc.cameraOn,
      vc.isScreenSharing,
      vc.mediaError,
      vc.signalingError,
      vc.clearErrors,
      vc.toggleMic,
      vc.toggleCamera,
      vc.switchCameraFacing,
      vc.startScreenShare,
      vc.stopScreenShare,
      vc.retryIce,
      vc.remoteVideoRef,
      vc.remoteAudioRef,
      vc.localVideoRef,
      vc.backgroundVideoRef,
      handleEndCall,
    ]
  );

  const ringingViewProps = useMemo(
    () =>
      callType
        ? {
            callType,
            isReceiving: isReceivingCall,
            remoteName: isCalling ? userToCall?.name : callerData?.name,
            remoteAvatar: isCalling ? userToCall?.avatar : callerData?.avatar,
            callEnded,
            mediaError: vc.mediaError,
            onAnswer: () => {
              void vc.answerCall().catch(() => {});
            },
            onDecline: () => void handleEndCall(true),
            backgroundVideoRef: vc.backgroundVideoRef,
          }
        : null,
    [
      callType,
      isReceivingCall,
      isCalling,
      userToCall?.name,
      userToCall?.avatar,
      callerData?.name,
      callerData?.avatar,
      callEnded,
      vc.mediaError,
      vc.answerCall,
      vc.backgroundVideoRef,
      handleEndCall,
    ]
  );

  if (!isCalling && !isReceivingCall && !callEnded) return null;
  if (!isCalling && !isReceivingCall && callEnded && !callType) return null;

  const mobileVideoStage = Boolean(callAccepted && !callEnded && callType === 'video');

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col pt-[env(safe-area-inset-top,0px)] transition-colors duration-300 ${
        mobileVideoStage
          ? 'bg-background/88 backdrop-blur-3xl max-md:bg-black max-md:backdrop-blur-none'
          : 'bg-background/88 backdrop-blur-3xl'
      }`}
    >
      <div
        className={`flex min-h-0 w-full flex-1 flex-col items-center justify-center p-0 sm:p-4 md:p-6 ${
          mobileVideoStage ? 'max-md:p-0' : ''
        }`}
      >
        {callAccepted && !callEnded && activeViewProps ? (
          <div className="flex h-full min-h-0 w-full max-w-6xl flex-1">
            <VideoCallActiveView {...activeViewProps} />
          </div>
        ) : ringingViewProps ? (
          <VideoCallRingingView {...ringingViewProps} />
        ) : null}
      </div>
    </div>
  );
}
