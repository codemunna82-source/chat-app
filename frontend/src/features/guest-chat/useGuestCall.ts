'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

/**
 * One call between this window and the agent's app, with or without video.
 *
 * Whoever PLACES the call decides which, and the other side follows —
 * see the server's CallLog.media. A side that answered a video call
 * audio-only would leave the caller looking at a black rectangle with no
 * way to tell whether it is broken or deliberate.
 *
 * The kind is fixed for the life of the call. Turning a camera off
 * mid-call disables the track and leaves the negotiated media alone; an
 * audio call cannot grow a camera without being placed again, which is
 * why no button offers to.
 *
 * The server only relays SDP and ICE — the media goes straight between
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

/**
 * Opens the microphone, and the camera when the call has one.
 *
 * The camera constraints are preferences rather than requirements:
 * `facingMode` as a plain string is a hint a laptop with one webcam can
 * ignore, where `exact` would make getUserMedia throw and fail the whole
 * call over the choice of lens.
 */
async function openMedia(video: boolean): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneUnavailableError(new Error('getUserMedia is unavailable in this browser'));
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video
        ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
    });
  } catch (err) {
    throw new MicrophoneUnavailableError(err);
  }
}

export function useGuestCall(
  socket: Socket | null,
  fetchIceServers: () => Promise<{ iceServers: IceServer[]; hasTurn: boolean }>,
  /**
   * Runs a scripted call with no socket, no microphone and no peer
   * connection, so the call screen can be looked at without a backend or a
   * second device. Deliberately skips getUserMedia: a permission prompt to
   * demonstrate an interface is a prompt for nothing.
   */
  options?: { demo?: boolean },
) {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  /**
   * Whether this call has a camera in it at all — fixed once it starts.
   * Set from the caller's choice when placing, and from the ring when
   * receiving.
   */
  const [media, setMedia] = useState<'audio' | 'video'>('audio');
  /** This side's camera, off and on again without renegotiating. */
  const [cameraOn, setCameraOn] = useState(true);
  /**
   * The two pictures, as state rather than refs.
   *
   * The call screen has to RE-RENDER when the far end's stream arrives —
   * a stream attached to a ref would leave the video element black until
   * something else happened to repaint.
   */
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

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
  const demo = options?.demo ?? false;
  /** Timers driving the scripted demo call, so teardown can cancel them. */
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Alternates the demo between placing a call and receiving one. */
  const demoIncomingNextRef = useRef(false);
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

  const clearDemoTimers = useCallback(() => {
    demoTimersRef.current.forEach(clearTimeout);
    demoTimersRef.current = [];
  }, []);

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
    setLocalStream(null);
    setRemoteStream(null);
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
        if (!remote) return;
        // Held for the <video> element to render. Fires once per track —
        // audio and then video on a video call — with the same stream
        // object both times, so this is written to be idempotent.
        setRemoteStream(remote);
        if (remoteAudioRef.current) {
          /**
           * The audio element stays, even on a video call.
           *
           * The <video> element could carry both, but only while it is
           * mounted: the call screen swaps between layouts, and a remount
           * would silence a live call for as long as it took to repaint.
           * The audio element is mounted for the whole call and never
           * moves, so the sound never stops. The video element is muted
           * to keep the same audio from playing twice.
           */
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

  /** The customer pressing Call, or Video call. */
  const startCall = useCallback(async (kind: 'audio' | 'video' = 'audio') => {
    if (phase !== 'idle') return;
    setMedia(kind);
    setCameraOn(true);

    if (demo) {
      setMessage(null);
      setMuted(false);
      setConnectedAt(null);

      // Alternates so both screens can be seen: one tap places a call, the
      // next receives one. The incoming screen is the distinctive half —
      // decline and accept rather than mute and hang up — and there is no
      // other way to reach it without a second device.
      if (demoIncomingNextRef.current) {
        demoIncomingNextRef.current = false;
        setPhase('incoming');
        return;
      }
      demoIncomingNextRef.current = true;

      setPhase('calling');
      demoTimersRef.current.push(setTimeout(() => setPhase('connecting'), 3200));
      demoTimersRef.current.push(
        setTimeout(() => {
          setPhase('active');
          setConnectedAt(Date.now());
        }, 4600),
      );
      return;
    }

    if (!socket) return;
    setMessage(null);
    setPhase('calling');

    try {
      const stream = await openMedia(kind === 'video');
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = await createPeer(stream);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit(
        'web:call:start',
        // The kind travels with the offer: the server stores it on the
        // call and every path that rings the agent — socket and push
        // alike — reads it back from there.
        { sdp: pc.localDescription?.sdp, media: kind },
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
          ? kind === 'video'
            ? 'This browser will not give the page camera and microphone access. Open this link in Chrome and try again.'
            : 'This browser will not give the page microphone access. Open this link in Chrome and try again.'
          : 'Could not start the call.',
      );
    }
  }, [socket, phase, createPeer, teardown, flushLocalIce, demo, clearDemoTimers]);

  /** The customer accepting a call the agent placed. */
  const acceptCall = useCallback(async () => {
    if (demo) {
      setPhase('connecting');
      demoTimersRef.current.push(
        setTimeout(() => {
          setPhase('active');
          setConnectedAt(Date.now());
        }, 1200),
      );
      return;
    }

    const offer = pendingOfferRef.current;
    if (!socket || phase !== 'incoming' || !offer || !callIdRef.current) return;
    setPhase('connecting');

    try {
      // The CALLER decided this; this side follows it. Answering audio-only
      // would leave them looking at a black rectangle.
      const stream = await openMedia(media === 'video');
      localStreamRef.current = stream;
      setLocalStream(stream);
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
          ? media === 'video'
            ? 'This browser will not give the page camera and microphone access. Open this link in Chrome and try again.'
            : 'This browser will not give the page microphone access. Open this link in Chrome and try again.'
          : 'Could not connect the call.',
      );
      if (callId) socket.emit('web:call:end', { callId });
    }
  }, [socket, phase, createPeer, drainPendingIce, teardown, flushLocalIce, demo, media]);

  const endCall = useCallback(() => {
    if (demo) {
      clearDemoTimers();
      setPhase('ended');
      setMessage('Call ended');
      return;
    }
    const callId = callIdRef.current;
    teardown();
    setPhase('idle');
    setConnectedAt(null);
    setMessage(null);
    if (callId && socket) socket.emit('web:call:end', { callId });
  }, [socket, teardown, demo, clearDemoTimers]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      // In the demo there are no tracks to disable — the state is the
      // whole behaviour, which is what the screen is showing.

      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  /**
   * The camera off without leaving the call.
   *
   * Disables the track rather than stopping it: a stopped track has to be
   * replaced and renegotiated to come back, where a disabled one simply
   * freezes the last frame at the far end. Turning a camera off and on
   * again must not renegotiate a live call.
   */
  const toggleCamera = useCallback(() => {
    setCameraOn((prev) => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = next;
      });
      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    clearDemoTimers();
    setPhase('idle');
    setMessage(null);
    setConnectedAt(null);
    setMedia('audio');
    setCameraOn(true);
  }, [clearDemoTimers]);

  useEffect(() => clearDemoTimers, [clearDemoTimers]);

  // ---- signalling -----------------------------------------------------
  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: { callId: string; sdp?: string; media?: 'audio' | 'video' }) => {
      // One call at a time: a second ring while one is live is far more
      // likely to be a reconnect replaying than a real second caller, and
      // replacing the live call would drop a conversation in progress.
      if (phase !== 'idle') return;
      callIdRef.current = payload.callId;
      pendingOfferRef.current = payload.sdp ?? null;
      // Read before Accept is pressed, so the screen can say which kind
      // of call is ringing — "Incoming video call" is the difference
      // between answering and not, for someone who is not presentable.
      setMedia(payload.media === 'video' ? 'video' : 'audio');
      setCameraOn(true);
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
    media,
    cameraOn,
    localStream,
    remoteStream,
    startCall,
    acceptCall,
    endCall,
    toggleMute,
    toggleCamera,
    dismiss,
  };
}
