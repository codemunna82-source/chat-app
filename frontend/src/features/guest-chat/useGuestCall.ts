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

/**
 * How long to ring before giving up.
 *
 * Shorter than the server's RINGING_TTL_MS, so the client is always the
 * one that ends an unanswered call and the server's sweep stays a
 * backstop rather than the normal path.
 */
const RING_TIMEOUT_MS = 45_000;

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

export function useGuestCall(
  socket: Socket | null,
  fetchIceServers: () => Promise<{ iceServers: IceServer[]; hasTurn: boolean }>,
) {
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
  /**
   * Our own candidates, gathered before the server has told us the call id.
   *
   * This queue is why calls connect at all. ICE gathering starts the
   * instant setLocalDescription resolves and the first candidates arrive
   * within a millisecond or two — long before the round trip that returns
   * the id they have to be addressed with. Dropping them, which is what
   * happened before, threw away the host and reflexive candidates and left
   * the two ends with nothing to pair on.
   */
  const pendingLocalIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  /** Gives up on a ring nobody answers, rather than spinning forever. */
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the server has a relay configured — see fetchIceServers. */
  const hasTurnRef = useRef(true);

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
  }, []);

  /** Sends everything gathered while the call id was still unknown. */
  const flushLocalIce = useCallback(() => {
    const callId = callIdRef.current;
    if (!callId || !socket) return;
    const queued = pendingLocalIceRef.current.splice(0);
    for (const candidate of queued) socket.emit('web:call:ice', { callId, candidate });
  }, [socket]);

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
    pendingLocalIceRef.current = [];
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const createPeer = useCallback(
    async (stream: MediaStream) => {
      const { iceServers, hasTurn } = await fetchIceServers();
      hasTurnRef.current = hasTurn;
      const pc = new RTCPeerConnection({ iceServers });

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const candidate = event.candidate.toJSON();
        // Queued rather than dropped when the id has not come back yet —
        // see pendingLocalIceRef.
        if (!callIdRef.current) {
          pendingLocalIceRef.current.push(candidate);
          return;
        }
        socket?.emit('web:call:ice', { callId: callIdRef.current, candidate });
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
            clearRingTimer();
            setPhase('active');
            setConnectedAt((prev) => prev ?? Date.now());
            break;
          case 'failed':
            setPhase('failed');
            // Naming the missing relay when there is one missing: without
            // it this failure is the normal outcome on a mobile network,
            // not an accident, and "the connection dropped" sends whoever
            // is testing looking in the wrong place.
            setMessage(
              hasTurnRef.current
                ? 'The connection dropped.'
                : 'Could not connect. The call relay (TURN) is not configured on the server.',
            );
            teardown();
            break;
          default:
            break;
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [fetchIceServers, socket, teardown, clearRingTimer],
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
          flushLocalIce();

          // Nobody picked up. Ending it here also closes the row on the
          // server, which is what keeps the next call from colliding with
          // this one.
          ringTimerRef.current = setTimeout(() => {
            if (callIdRef.current) socket.emit('web:call:end', { callId: callIdRef.current });
            teardown();
            setPhase('ended');
            setMessage('No answer');
          }, RING_TIMEOUT_MS);
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
  }, [socket, phase, createPeer, teardown, flushLocalIce]);

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
      // The id was known from the ring, so this is only for candidates
      // gathered between createPeer and here.
      flushLocalIce();
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
  }, [socket, phase, createPeer, drainPendingIce, teardown, flushLocalIce]);

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
