'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

/**
 * One audio call between this window and the agent's app.
 *
 * Audio only, deliberately: it is what the product needs, and it keeps the
 * media to a single track that a phone on mobile data can actually carry.
 *
 * The server only relays SDP and ICE — the audio goes straight between
 * this browser and the phone, which is why the ICE configuration is
 * fetched from the server rather than hardcoded: both ends have to be
 * given the same relay or their candidates never pair up.
 */

export type CallPhase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'active' | 'ended' | 'failed';

interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * Thrown when the microphone cannot be opened.
 *
 * Overwhelmingly this is not a denied permission dialog but WhatsApp's
 * in-app browser, which is an Android WebView that does not hand
 * getUserMedia to the page at all. The user has to open the link in a
 * real browser, so the UI says that rather than "permission denied",
 * which would send them to a settings screen that changes nothing.
 */
export class MicrophoneUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Microphone unavailable');
    this.name = 'MicrophoneUnavailableError';
    this.cause = cause;
  }
}

async function openMicrophone(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneUnavailableError(new Error('getUserMedia is unavailable in this browser'));
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    throw new MicrophoneUnavailableError(err);
  }
}

export function useGuestCall(socket: Socket | null, fetchIceServers: () => Promise<IceServer[]>) {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingOfferRef = useRef<string | null>(null);
  /** Candidates that arrived before setRemoteDescription — adding one then throws. */
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const teardown = useCallback(() => {
    // Tracks first: that releases the microphone even if closing the
    // connection throws, so the recording indicator never stays lit after
    // a call the user has already left.
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    try {
      pcRef.current?.close();
    } catch {
      /* already closed by the far end */
    }
    pcRef.current = null;
    callIdRef.current = null;
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const createPeer = useCallback(
    async (stream: MediaStream) => {
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (!event.candidate || !callIdRef.current) return;
        socket?.emit('web:call:ice', {
          callId: callIdRef.current,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        const [remote] = event.streams;
        if (remoteAudioRef.current && remote) {
          remoteAudioRef.current.srcObject = remote;
          // The play() promise rejects when autoplay is blocked. Both call
          // paths begin with a tap (Call, or Accept), so the gesture that
          // permits playback has already happened — this only guards
          // against an unhandled rejection in the odd case it has not.
          void remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        switch (pc.connectionState) {
          case 'connected':
            setPhase('active');
            setConnectedAt((prev) => prev ?? Date.now());
            break;
          case 'failed':
            setPhase('failed');
            setMessage('The connection dropped.');
            teardown();
            break;
          default:
            break;
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [fetchIceServers, socket, teardown],
  );

  const drainPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.splice(0);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* duplicate or late candidate */
      }
    }
  }, []);

  /** The customer pressing Call. */
  const startCall = useCallback(async () => {
    if (!socket || phase !== 'idle') return;
    setMessage(null);
    setPhase('calling');

    try {
      const stream = await openMicrophone();
      localStreamRef.current = stream;
      const pc = await createPeer(stream);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit(
        'web:call:start',
        { sdp: pc.localDescription?.sdp },
        (res: { success: boolean; callId?: string; error?: string }) => {
          if (!res?.success || !res.callId) {
            setPhase('failed');
            setMessage(res?.error ?? 'Could not start the call.');
            teardown();
            return;
          }
          callIdRef.current = res.callId;
        },
      );
    } catch (err) {
      teardown();
      setPhase('failed');
      setMessage(
        err instanceof MicrophoneUnavailableError
          ? 'This browser will not give the page microphone access. Open this link in Chrome and try again.'
          : 'Could not start the call.',
      );
    }
  }, [socket, phase, createPeer, teardown]);

  /** The customer accepting a call the agent placed. */
  const acceptCall = useCallback(async () => {
    const offer = pendingOfferRef.current;
    if (!socket || phase !== 'incoming' || !offer || !callIdRef.current) return;
    setPhase('connecting');

    try {
      const stream = await openMicrophone();
      localStreamRef.current = stream;
      const pc = await createPeer(stream);

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer }));
      await drainPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('web:call:answer', { callId: callIdRef.current, sdp: pc.localDescription?.sdp });
    } catch (err) {
      const callId = callIdRef.current;
      teardown();
      setPhase('failed');
      setMessage(
        err instanceof MicrophoneUnavailableError
          ? 'This browser will not give the page microphone access. Open this link in Chrome and try again.'
          : 'Could not connect the call.',
      );
      if (callId) socket.emit('web:call:end', { callId });
    }
  }, [socket, phase, createPeer, drainPendingIce, teardown]);

  const endCall = useCallback(() => {
    const callId = callIdRef.current;
    teardown();
    setPhase('idle');
    setConnectedAt(null);
    setMessage(null);
    if (callId && socket) socket.emit('web:call:end', { callId });
  }, [socket, teardown]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    setPhase('idle');
    setMessage(null);
    setConnectedAt(null);
  }, []);

  // ---- signalling -----------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: { callId: string; sdp?: string }) => {
      // One call at a time: a second ring while one is live is far more
      // likely to be a reconnect replaying than a real second caller, and
      // replacing the live call would drop a conversation in progress.
      if (phase !== 'idle') return;
      callIdRef.current = payload.callId;
      pendingOfferRef.current = payload.sdp ?? null;
      setPhase('incoming');
    };

    const onAnswered = async (payload: { callId: string; sdp: string }) => {
      const pc = pcRef.current;
      if (!pc || callIdRef.current !== payload.callId) return;
      setPhase('connecting');
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }));
        await drainPendingIce(pc);
      } catch {
        setPhase('failed');
        setMessage('Could not connect the call.');
        teardown();
      }
    };

    const onIce = async (payload: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (callIdRef.current !== payload.callId) return;
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingIceRef.current.push(payload.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        /* duplicate or late candidate */
      }
    };

    const onEnded = (payload: { callId: string; status?: string }) => {
      if (callIdRef.current !== payload.callId) return;
      teardown();
      setPhase('ended');
      setMessage(payload.status === 'REJECTED' ? 'Call declined' : 'Call ended');
      setConnectedAt(null);
    };

    socket.on('web:call:incoming', onIncoming);
    socket.on('web:call:answered', onAnswered);
    socket.on('web:call:ice', onIce);
    socket.on('web:call:ended', onEnded);

    return () => {
      socket.off('web:call:incoming', onIncoming);
      socket.off('web:call:answered', onAnswered);
      socket.off('web:call:ice', onIce);
      socket.off('web:call:ended', onEnded);
    };
  }, [socket, phase, drainPendingIce, teardown]);

  // Releases the microphone if the page is closed mid-call.
  useEffect(() => teardown, [teardown]);

  return {
    phase,
    message,
    muted,
    connectedAt,
    remoteAudioRef,
    startCall,
    acceptCall,
    endCall,
    toggleMute,
    dismiss,
  };
}
