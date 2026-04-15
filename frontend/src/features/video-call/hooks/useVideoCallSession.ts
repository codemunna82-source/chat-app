'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { CallData } from '@/store/useWebRTCStore';
import type { CallSignalPayload, VideoCallConnectionQuality } from '../types';
import { WebRTCPeerSession } from '../services/webrtcPeer';
import { acquireDisplayMedia, acquireLocalMedia, MediaDeviceError, stopAllTracks } from '../services/mediaDevices';

type UseVideoCallSessionArgs = {
  socket: Socket | null;
  user: { _id: string; name?: string; avatar?: string } | null;
  isCalling: boolean;
  isReceivingCall: boolean;
  callAccepted: boolean;
  callType: 'audio' | 'video' | null;
  userToCall: { _id: string } | null;
  callerData: CallData | null;
  setCallAccepted: (v: boolean) => void;
};

const ICE_EVENT = 'call ice-candidate';

function mapIceToQuality(ice: RTCIceConnectionState | null): VideoCallConnectionQuality {
  if (!ice || ice === 'new') return 'connecting';
  if (ice === 'checking') return 'connecting';
  if (ice === 'connected' || ice === 'completed') return 'good';
  if (ice === 'disconnected') return 'poor';
  if (ice === 'failed' || ice === 'closed') return 'failed';
  return 'connecting';
}

export function useVideoCallSession({
  socket,
  user,
  isCalling,
  isReceivingCall,
  callAccepted,
  callType,
  userToCall,
  callerData,
  setCallAccepted,
}: UseVideoCallSessionArgs) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [signalingError, setSignalingError] = useState<string | null>(null);
  const [iceState, setIceState] = useState<RTCIceConnectionState | null>(null);
  const [signalingState, setSignalingState] = useState<RTCSignalingState | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');

  const peerSessionRef = useRef<WebRTCPeerSession | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const callAcceptedHandlerRef = useRef<((signal: CallSignalPayload) => void) | null>(null);
  const preAnswerIceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const outgoingStartedRef = useRef(false);
  const callActiveRef = useRef(false);
  const [callStartedAtMs, setCallStartedAtMs] = useState<number | null>(null);

  const myId = user?._id != null ? String(user._id) : '';
  const peerUserId = useMemo(() => {
    if (isCalling && userToCall?._id) return String(userToCall._id);
    if (callerData?.from) return String(callerData.from);
    return '';
  }, [isCalling, userToCall, callerData]);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);

  const clearErrors = useCallback(() => {
    setMediaError(null);
    setSignalingError(null);
  }, []);

  const closePeer = useCallback(() => {
    if (callAcceptedHandlerRef.current && socket) {
      socket.off('call accepted', callAcceptedHandlerRef.current);
      callAcceptedHandlerRef.current = null;
    }
    peerSessionRef.current?.close();
    peerSessionRef.current = null;
    outgoingStartedRef.current = false;
    preAnswerIceQueueRef.current = [];
  }, [socket]);

  const teardownAllMedia = useCallback(() => {
    closePeer();
    stopAllTracks(screenStreamRef.current);
    screenStreamRef.current = null;
    stopAllTracks(localStreamRef.current);
    localStreamRef.current = null;
    cameraVideoTrackRef.current = null;
    setLocalStream(null);
    setIsScreenSharing(false);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (backgroundVideoRef.current) backgroundVideoRef.current.srcObject = null;
  }, [closePeer]);

  useEffect(() => {
    callActiveRef.current = Boolean(isCalling || isReceivingCall || callAccepted);
  }, [isCalling, isReceivingCall, callAccepted]);

  /** Trickle ICE from remote peer */
  useEffect(() => {
    if (!socket || !peerUserId || !myId) return;
    const inCall = isCalling || isReceivingCall || callAccepted;
    if (!inCall) return;

    const onRemoteIce = (data: { from?: string; candidate?: RTCIceCandidateInit }) => {
      if (!data?.from || !data.candidate) return;
      if (String(data.from) !== peerUserId) return;
      const session = peerSessionRef.current;
      if (session) void session.addRemoteIceCandidate(data.candidate);
      else preAnswerIceQueueRef.current.push(data.candidate);
    };

    socket.on(ICE_EVENT, onRemoteIce);
    return () => {
      socket.off(ICE_EVENT, onRemoteIce);
    };
  }, [socket, peerUserId, myId, isCalling, isReceivingCall, callAccepted]);

  const attachLocalPreview = useCallback((stream: MediaStream) => {
    const v = stream.getVideoTracks()[0];
    cameraVideoTrackRef.current = v || null;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    if (backgroundVideoRef.current && callType === 'video') {
      backgroundVideoRef.current.srcObject = stream;
    }
  }, [callType]);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    if (callType === 'video' && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    }
    if (callType === 'audio' && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
    }
    if (backgroundVideoRef.current && callType === 'video') {
      backgroundVideoRef.current.srcObject = stream;
    }
  }, [callType]);

  const micOnRef = useRef(micOn);
  const cameraOnRef = useRef(cameraOn);
  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);
  useEffect(() => {
    cameraOnRef.current = cameraOn;
  }, [cameraOn]);

  const startLocalMedia = useCallback(
    async (facing: 'user' | 'environment', replaceExisting = false) => {
      if (!callType) return;
      setMediaError(null);
      try {
        const next = await acquireLocalMedia({ callType, facingMode: facing });
        if (!callActiveRef.current) {
          stopAllTracks(next);
          return;
        }

        if (replaceExisting && peerSessionRef.current) {
          const vt = next.getVideoTracks()[0];
          if (vt) peerSessionRef.current.replaceVideoTrack(vt);
          const at = next.getAudioTracks()[0];
          if (at) peerSessionRef.current.replaceAudioTrack(at);
        }

        stopAllTracks(localStreamRef.current);
        localStreamRef.current = next;
        setLocalStream(next);

        next.getAudioTracks().forEach((t) => {
          t.enabled = micOnRef.current;
        });
        next.getVideoTracks().forEach((t) => {
          t.enabled = callType === 'video' ? cameraOnRef.current : false;
        });

        attachLocalPreview(next);
      } catch (e) {
        const msg = e instanceof MediaDeviceError ? e.message : 'Could not open camera or microphone.';
        setMediaError(msg);
        throw e;
      }
    },
    [callType, attachLocalPreview]
  );

  useEffect(() => {
    if (isCalling || isReceivingCall) {
      setMicOn(true);
      setCameraOn(callType === 'video');
    }
  }, [isCalling, isReceivingCall, callType]);

  useEffect(() => {
    const s = localStreamRef.current;
    if (!s) return;
    s.getAudioTracks().forEach((t) => {
      t.enabled = micOn;
    });
    s.getVideoTracks().forEach((t) => {
      t.enabled = callType === 'video' ? cameraOn : false;
    });
  }, [micOn, cameraOn, callType, localStream]);

  useEffect(() => {
    if (!callType || (!isCalling && !isReceivingCall)) return;
    let cancelled = false;
    if (!localStreamRef.current) {
      startLocalMedia(cameraFacing).catch(() => {
        if (!cancelled) {
          /* error state set in startLocalMedia */
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [callType, isCalling, isReceivingCall, cameraFacing, startLocalMedia]);

  const emitIce = useCallback(
    (candidate: RTCIceCandidateInit | null) => {
      if (!socket || !candidate || !peerUserId || !myId) return;
      socket.emit(ICE_EVENT, { to: peerUserId, from: myId, candidate });
    },
    [socket, peerUserId, myId]
  );

  const startOutgoingNegotiation = useCallback(
    async (stream: MediaStream) => {
      if (!socket || !userToCall || !callType || !myId) return;
      setSignalingError(null);
      closePeer();

      const session = new WebRTCPeerSession({
        onIceCandidate: emitIce,
        onIceConnectionState: setIceState,
        onSignalingState: setSignalingState,
        onTrack: (ev) => {
          const rs = ev.streams[0];
          if (rs) attachRemoteStream(rs);
        },
      });
      peerSessionRef.current = session;
      session.addTransceiverOrTrack(stream);

      try {
        const offerSdp = await session.createOffer();
        const signalPayload: CallSignalPayload = { sdp: offerSdp, candidates: [] };

        const onAccepted = async (signal: CallSignalPayload) => {
          if (peerSessionRef.current !== session) return;
          try {
            await session.applyRemoteAnswer(signal.sdp);
            await session.addRemoteIceCandidatesBatch(signal.candidates);
            setCallAccepted(true);
            setCallStartedAtMs(Date.now());
          } catch (err) {
            console.error('[useVideoCallSession] apply answer failed', err);
            setSignalingError('Failed to complete connection.');
          }
        };

        callAcceptedHandlerRef.current = onAccepted;
        socket.once('call accepted', onAccepted);

        socket.emit('call user', {
          userToCall: String(userToCall._id),
          signalData: signalPayload,
          from: myId,
          name: user?.name,
          avatar: user?.avatar,
          type: callType,
        });
      } catch (err) {
        console.error('[useVideoCallSession] offer failed', err);
        setSignalingError('Could not start the call.');
        closePeer();
      }
    },
    [
      socket,
      userToCall,
      callType,
      myId,
      user?.name,
      user?.avatar,
      emitIce,
      attachRemoteStream,
      setCallAccepted,
      closePeer,
    ]
  );

  const startOutgoingNegotiationRef = useRef(startOutgoingNegotiation);
  startOutgoingNegotiationRef.current = startOutgoingNegotiation;

  useEffect(() => {
    if (!socket || !localStream || !isCalling || !userToCall || callAccepted) return;
    if (outgoingStartedRef.current) return;
    outgoingStartedRef.current = true;
    void startOutgoingNegotiationRef.current(localStream);
  }, [socket, localStream, isCalling, userToCall, callAccepted]);

  const answerCall = useCallback(async () => {
    if (!socket || !localStream || !callerData?.signal?.sdp || !callType || !myId) return;
    setSignalingError(null);
    closePeer();
    outgoingStartedRef.current = false;

    const session = new WebRTCPeerSession({
      onIceCandidate: emitIce,
      onIceConnectionState: setIceState,
      onSignalingState: setSignalingState,
      onTrack: (ev) => {
        const rs = ev.streams[0];
        if (rs) attachRemoteStream(rs);
      },
    });
    peerSessionRef.current = session;
    session.addTransceiverOrTrack(localStream);

    try {
      await session.applyRemoteOffer(callerData.signal.sdp);
      await session.addRemoteIceCandidatesBatch(callerData.signal.candidates);
      const buffered = preAnswerIceQueueRef.current.splice(0);
      for (const c of buffered) await session.addRemoteIceCandidate(c);

      const answerSdp = await session.createAndSetAnswer();
      const answerPayload: CallSignalPayload = { sdp: answerSdp, candidates: [] };
      socket.emit('answer call', {
        to: String(callerData.from),
        signal: answerPayload,
      });
      setCallAccepted(true);
      setCallStartedAtMs(Date.now());
    } catch (err) {
      console.error('[useVideoCallSession] answer failed', err);
      setSignalingError('Could not answer the call.');
      closePeer();
    }
  }, [
    socket,
    localStream,
    callerData,
    callType,
    myId,
    emitIce,
    attachRemoteStream,
    setCallAccepted,
    closePeer,
  ]);

  const endCallSession = useCallback(
    (emitSocket: boolean) => {
      if (emitSocket && socket && peerUserId) {
        socket.emit('end call', { to: peerUserId });
      }
      setCallStartedAtMs(null);
      setDurationSec(0);
      setIceState(null);
      setSignalingState(null);
      teardownAllMedia();
    },
    [socket, peerUserId, teardownAllMedia]
  );

  useEffect(() => {
    if (!isCalling && !isReceivingCall && !callAccepted) {
      outgoingStartedRef.current = false;
      preAnswerIceQueueRef.current = [];
    }
  }, [isCalling, isReceivingCall, callAccepted]);

  useEffect(() => {
    if (!callAccepted || !callStartedAtMs) return;
    const start = callStartedAtMs;
    const id = window.setInterval(() => {
      setDurationSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [callAccepted, callStartedAtMs]);

  useEffect(() => {
    return () => {
      peerSessionRef.current?.close();
      peerSessionRef.current = null;
      stopAllTracks(screenStreamRef.current);
      stopAllTracks(localStreamRef.current);
    };
  }, []);

  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s?.getAudioTracks()[0]) return;
    const next = !s.getAudioTracks()[0].enabled;
    s.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMicOn(next);
  }, []);

  const toggleCamera = useCallback(() => {
    if (callType !== 'video') return;
    const s = localStreamRef.current;
    if (!s?.getVideoTracks()[0]) return;
    const next = !s.getVideoTracks()[0].enabled;
    s.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    setCameraOn(next);
  }, [callType]);

  const switchCameraFacing = useCallback(async () => {
    if (callType !== 'video') return;
    const next = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(next);
    try {
      await startLocalMedia(next, true);
    } catch {
      setCameraFacing(cameraFacing);
    }
  }, [callType, cameraFacing, startLocalMedia]);

  const stopScreenShare = useCallback(() => {
    stopAllTracks(screenStreamRef.current);
    screenStreamRef.current = null;
    const cam = cameraVideoTrackRef.current;
    peerSessionRef.current?.replaceVideoTrack(cam && cam.readyState === 'live' ? cam : null);
    setIsScreenSharing(false);
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!peerSessionRef.current || callType !== 'video') return;
    try {
      const display = await acquireDisplayMedia(false);
      const vt = display.getVideoTracks()[0];
      if (!vt) {
        stopAllTracks(display);
        return;
      }
      vt.onended = () => {
        stopScreenShare();
      };
      screenStreamRef.current = display;
      peerSessionRef.current.replaceVideoTrack(vt);
      setIsScreenSharing(true);
    } catch (e) {
      const msg = e instanceof MediaDeviceError ? e.message : 'Screen share failed.';
      setMediaError(msg);
    }
  }, [callType, stopScreenShare]);

  const retryIce = useCallback(() => {
    setSignalingError(null);
    peerSessionRef.current?.restartIce();
  }, []);

  const connectionQuality: VideoCallConnectionQuality = useMemo(
    () => mapIceToQuality(iceState),
    [iceState]
  );

  return {
    localStream,
    mediaError,
    signalingError,
    clearErrors,
    iceState,
    signalingState,
    connectionQuality,
    durationSec,
    callStartedAtMs,
    isScreenSharing,
    micOn,
    cameraOn,
    cameraFacing,
    startLocalMedia,
    answerCall,
    endCallSession,
    toggleMic,
    toggleCamera,
    switchCameraFacing,
    startScreenShare,
    stopScreenShare,
    retryIce,
    remoteVideoRef,
    remoteAudioRef,
    localVideoRef,
    backgroundVideoRef,
  };
}
