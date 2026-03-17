'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneMissed, Phone, Video, Mic, MicOff, VideoOff } from 'lucide-react';
import { useWebRTCStore } from '@/store/useWebRTCStore';
import { useSocket } from '@/contexts/SocketContext';
import { useAuthStore } from '@/store/useAuthStore';

import api from '@/lib/api';
import { playRingtone, playDialTone, stopTones } from '@/utils/audioTones';
import Image from 'next/image';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function CallModal() {
  const {
    isCalling, isReceivingCall, callerData, callType, userToCall, callAccepted,
    setCallAccepted, resetCallState, receiveCall
  } = useWebRTCStore();

  const { socket } = useSocket();
  const { user } = useAuthStore();

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [callEnded, setCallEnded] = useState(false);
  const callEndedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const callActiveRef = useRef(false);
  const callMetaRef = useRef({
    callType: callType as 'audio' | 'video' | null,
    userToCall,
    callerData,
    callAccepted
  });
  const callStartTimeRef = useRef<number | null>(null);
  const hasLoggedRef = useRef(false);
  const initiatedByRef = useRef<'me' | 'them' | null>(null);

  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);

  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const backgroundVideo = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callAcceptedHandlerRef = useRef<((signal: any) => void) | null>(null);

  useEffect(() => {
    callEndedRef.current = callEnded;
  }, [callEnded]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    callMetaRef.current = { callType, userToCall, callerData, callAccepted };
  }, [callType, userToCall, callerData, callAccepted]);

  useEffect(() => {
    callStartTimeRef.current = callStartTime;
  }, [callStartTime]);

  useEffect(() => {
    callActiveRef.current = isCalling || isReceivingCall;
  }, [isCalling, isReceivingCall]);

  useEffect(() => {
    if (isCalling) {
      initiatedByRef.current = 'me';
    } else if (isReceivingCall && !initiatedByRef.current) {
      initiatedByRef.current = 'them';
    }
    if (isCalling || isReceivingCall) {
      hasLoggedRef.current = false;
      setCallStartTime(null);
    }
  }, [isCalling, isReceivingCall]);

  useEffect(() => {
    if (isCalling || isReceivingCall) {
      setMicOn(true);
      setCameraOn(callType === 'video');
    }
  }, [isCalling, isReceivingCall, callType]);

  // 1. Listen for incoming calls on socket
  useEffect(() => {
    if (!socket) return;
    console.log('[CallModal] Socket listener registered for socket:', socket.id);

    const handleIncomingCall = (data: any) => {
      console.log('[CallModal] Received call user event:', data);
      const { isCalling: c, isReceivingCall: r, callAccepted: a } = useWebRTCStore.getState();
      console.log('[CallModal] Current state:', { c, r, a });
      if (!c && !r && !a) {
        receiveCall({
          from: data.from,
          name: data.name,
          signal: data.signal,
          type: data.type || 'video',
          avatar: data.avatar,
        });
        console.log('[CallModal] receiveCall dispatched');
      }
    };

    const handleCallEnded = async () => {
      console.log('[CallModal] Remote call ended event received');
      await logCallOnce();
      cleanupMediaAndState();
    };

    socket.on('call user', handleIncomingCall);
    socket.on('call ended', handleCallEnded);

    return () => {
      socket.off('call user', handleIncomingCall);
      socket.off('call ended', handleCallEnded);
    }
  }, [socket]);

  // 2. Play tones
  useEffect(() => {
    if (callAccepted || callEnded) {
      stopTones();
    } else if (isCalling) {
      playDialTone();
    } else if (isReceivingCall) {
      playRingtone();
    }
    return () => stopTones();
  }, [isCalling, isReceivingCall, callAccepted, callEnded]);

  // 3. Setup media stream when a call starts
  useEffect(() => {
    let cancelled = false;
    if ((isCalling || isReceivingCall) && !stream) {
      navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true })
        .then((currentStream) => {
          const isStillActive = useWebRTCStore.getState().isCalling || useWebRTCStore.getState().isReceivingCall;
          if (cancelled || callEndedRef.current || !isStillActive) {
            currentStream.getTracks().forEach(track => track.stop());
            return;
          }
          setStream(currentStream);
          currentStream.getAudioTracks().forEach(track => {
            track.enabled = true;
          });
          currentStream.getVideoTracks().forEach(track => {
            track.enabled = callType === 'video';
          });
          if (myVideo.current) {
            myVideo.current.srcObject = currentStream;
          }
          if (backgroundVideo.current && callType === 'video') {
            backgroundVideo.current.srcObject = currentStream;
          }

          // If I am the one calling, initiate the Peer connection
          if (isCalling && userToCall) {
            initiatePeerConnection(currentStream);
          }
        })
        .catch(err => {
          console.error("Failed to get local media", err);
          handleEndCall(true);
        });
    }
    return () => { cancelled = true; };
  }, [isCalling, isReceivingCall]);

  // --- Native RTCPeerConnection helpers ---

  const createPeerConnection = (currentStream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to the connection
    currentStream.getTracks().forEach(track => {
      pc.addTrack(track, currentStream);
    });

    // When remote tracks arrive, show them
    pc.ontrack = (event) => {
      console.log('[CallModal] Remote track received');
      if (userVideo.current && event.streams[0]) {
        userVideo.current.srcObject = event.streams[0];
      }
      if (backgroundVideo.current && event.streams[0]) {
        backgroundVideo.current.srcObject = event.streams[0];
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallModal] ICE state:', pc.iceConnectionState);
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const initiatePeerConnection = async (currentStream: MediaStream) => {
    try {
      const pc = createPeerConnection(currentStream);

      // Collect ICE candidates
      const iceCandidates: RTCIceCandidate[] = [];

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          iceCandidates.push(event.candidate);
        }
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete (or timeout after 2s)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
          // Timeout safety
          setTimeout(resolve, 2000);
        }
      });

      console.log('[CallModal] Sending call signal to:', userToCall?._id);
      socket?.emit('call user', {
        userToCall: userToCall._id,
        signalData: { sdp: pc.localDescription, candidates: iceCandidates },
        from: user?._id,
        name: user?.name,
        avatar: user?.avatar,
        type: callType,
      });

      // Listen for the answer
      const handleCallAccepted = async (signal: any) => {
        if (callEndedRef.current) return;
        if (peerConnectionRef.current !== pc) return;
        if (pc.signalingState === 'closed') return;
        console.log('[CallModal] Call accepted, setting remote description');
        setCallAccepted(true);
        setCallStartTime(Date.now());

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          for (const candidate of signal.candidates || []) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          console.error('[CallModal] Failed to apply remote description:', err);
        }
      };

      callAcceptedHandlerRef.current = handleCallAccepted;
      socket?.once('call accepted', handleCallAccepted);
    } catch (err) {
      console.error('[CallModal] Failed to initiate peer connection:', err);
      handleEndCall(true);
    }
  };

  const answerCall = async () => {
    if (!stream || !callerData?.signal) return;
    setCallAccepted(true);
    setCallStartTime(Date.now());

    try {
      const pc = createPeerConnection(stream);

      // Collect ICE candidates
      const iceCandidates: RTCIceCandidate[] = [];

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          iceCandidates.push(event.candidate);
        }
      };

      // Set remote description (the offer from caller)
      await pc.setRemoteDescription(new RTCSessionDescription(callerData.signal.sdp));

      // Add caller's ICE candidates
      for (const candidate of callerData.signal.candidates || []) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }

      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for ICE gathering
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
          setTimeout(resolve, 2000);
        }
      });

      socket?.emit('answer call', {
        signal: { sdp: pc.localDescription, candidates: iceCandidates },
        to: callerData.from
      });
      console.log('[CallModal] Answer sent');
    } catch (err) {
      console.error('[CallModal] Failed to answer call:', err);
    }
  };

  const logCallOnce = async (statusOverride?: 'missed' | 'accepted' | 'rejected') => {
    if (hasLoggedRef.current) return;
    if (initiatedByRef.current !== 'me') return; // only the caller logs to avoid duplicates
    const { callType, userToCall, callerData, callAccepted } = callMetaRef.current;
    if (!callType) return;

    const otherUserId = userToCall?._id || callerData?.from;
    if (!otherUserId || !user?._id) return;

    const duration = callStartTimeRef.current ? Math.max(0, Math.floor((Date.now() - callStartTimeRef.current) / 1000)) : 0;
    const payload = {
      receiverId: otherUserId,
      status: statusOverride || (callAccepted ? 'accepted' : 'missed'),
      callType,
      duration
    };

    try {
      hasLoggedRef.current = true;
      await api.post('/call', payload);
    } catch (err) {
      // allow a retry on subsequent cleanup if the first attempt failed
      hasLoggedRef.current = false;
      console.error('[CallModal] Failed to log call:', err);
    }
  };

  const cleanupMediaAndState = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    const activeStream = streamRef.current || stream;
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
    }

    if (myVideo.current) myVideo.current.srcObject = null;
    if (userVideo.current) userVideo.current.srcObject = null;
    if (backgroundVideo.current) backgroundVideo.current.srcObject = null;

    setStream(null);
    streamRef.current = null;
    resetCallState();
    initiatedByRef.current = null;
    setCallStartTime(null);
    callStartTimeRef.current = null;

    if (callAcceptedHandlerRef.current && socket) {
      socket.off('call accepted', callAcceptedHandlerRef.current);
      callAcceptedHandlerRef.current = null;
    }
  };

  const handleEndCall = async (emitEvent: boolean = true) => {
    setCallEnded(true);

    if (emitEvent && socket) {
      const targetUser = isCalling ? userToCall?._id : callerData?.from;
      if (targetUser) {
        socket.emit('end call', { to: targetUser });
      }
    }

    await logCallOnce();
    cleanupMediaAndState();

    setTimeout(() => setCallEnded(false), 800);
  };

  const toggleMic = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = !micOn;
      setMicOn(!micOn);
    }
  }

  const toggleCamera = () => {
    if (stream && callType === 'video') {
      stream.getVideoTracks()[0].enabled = !cameraOn;
      setCameraOn(!cameraOn);
    }
  }

  if (!isCalling && !isReceivingCall && !callEnded) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-3xl transition-colors duration-300">
      {callAccepted && !callEnded ? (
        // Active Call UI
        <div className="w-full h-full flex flex-col pt-10 px-4 pb-8 max-w-5xl mx-auto items-center">
          {/* Remote Video / Audio Avatar */}
          <div className="w-full flex-1 bg-black/40 rounded-[3rem] overflow-hidden relative shadow-2xl flex items-center justify-center border border-white/10 dark:border-white/5 backdrop-blur-md">
            {callType === 'video' ? (
              <>
                <video
                  playsInline
                  muted
                  ref={backgroundVideo}
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover blur-3xl scale-110 opacity-60 pointer-events-none"
                />
                <video playsInline ref={userVideo} autoPlay className="relative w-full h-full object-cover" />
              </>
            ) : (
              <div className="flex flex-col items-center">
                <div className="relative w-48 h-48">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" style={{ animationDuration: '3s' }}></div>
                  <Image
                    src={isCalling ? userToCall?.avatar : callerData?.avatar || "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"}
                    alt="Avatar"
                    fill
                    sizes="192px"
                    className="relative z-10 rounded-full border-4 border-surface shadow-2xl object-cover"
                    unoptimized={isCalling ? userToCall?.avatar?.includes('localhost') : callerData?.avatar?.includes('localhost')}
                  />
                </div>
                <h2 className="text-3xl mt-8 font-semibold text-white drop-shadow-md">{isCalling ? userToCall?.name : callerData?.name}</h2>
                <p className="text-primary font-medium mt-2 tracking-wide">Active Audio Call</p>
                <audio ref={userVideo} autoPlay className="hidden" />
              </div>
            )}

            {/* PiP Local Video */}
            {callType === 'video' && (
              <div className="absolute top-6 right-6 w-32 h-48 sm:w-40 sm:h-60 bg-surface rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl transition-transform hover:scale-105 cursor-move">
                <video playsInline muted ref={myVideo} autoPlay className="w-full h-full object-cover rounded-xl" />
              </div>
            )}
          </div>

          {/* Controls Panel */}
          <div className="mt-8 flex items-center justify-center gap-6 glass-panel rounded-full px-8 py-5 mx-auto">
            {callType === 'video' && (
              <button onClick={toggleCamera} className={`p-4 rounded-full transition-all shadow-sm ${cameraOn ? 'bg-surface-hover hover:bg-white/20 text-foreground' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}`}>
                {cameraOn ? <Video className="w-7 h-7" /> : <VideoOff className="w-7 h-7" />}
              </button>
            )}
            <button onClick={toggleMic} className={`p-4 rounded-full transition-all shadow-sm ${micOn ? 'bg-surface-hover hover:bg-white/20 text-foreground' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}`}>
              {micOn ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
            </button>
            <button onClick={() => handleEndCall(true)} className="p-4 rounded-full bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 transition-transform hover:scale-110 text-white">
              <PhoneMissed className="w-8 h-8" />
            </button>
          </div>
        </div>
      ) : (
        // Ringing / Calling UI
        <div className="glass-panel bg-surface/80 rounded-[2.5rem] p-10 max-w-sm w-full shadow-2xl flex flex-col items-center relative overflow-hidden">
          {callType === 'video' && !callEnded && (
            <>
              <video
                playsInline
                muted
                ref={backgroundVideo}
                autoPlay
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-80 pointer-events-none"
              />
              <div className="absolute inset-0 bg-black/35 pointer-events-none"></div>
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none"></div>
            </>
          )}
          {/* Background ringing ripple */}
          {!callEnded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 bg-primary/10 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
            </div>
          )}

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-32 h-32 relative mb-6">
              <Image
                src={(isCalling ? userToCall?.avatar : callerData?.avatar) || "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"}
                alt="Caller avatar"
                fill
                sizes="128px"
                className="rounded-full object-cover border-[6px] border-surface shadow-2xl bg-background"
                unoptimized={isCalling ? userToCall?.avatar?.includes('localhost') : callerData?.avatar?.includes('localhost')}
              />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-2 text-center">
              {isCalling ? userToCall?.name : callerData?.name || 'Unknown User'}
            </h2>

            <p className="text-muted tracking-wide mb-10 h-6 font-medium">
              {callEnded ? 'Call ended' : isReceivingCall ? `Incoming ${callType} call...` : `Calling...`}
            </p>

            <div className="flex gap-8">
              {isReceivingCall && !callEnded && (
                <button
                  className="bg-primary hover:bg-primary-hover rounded-full p-4 text-white shadow-lg transition-transform hover:scale-110 shadow-primary/30"
                  onClick={answerCall}
                >
                  {callType === 'video' ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7 fill-current" />}
                </button>
              )}

              {!callEnded && (
                <button
                  className="bg-red-500 hover:bg-red-600 rounded-full p-4 text-white shadow-lg transition-transform hover:scale-110 shadow-red-500/30"
                  onClick={() => handleEndCall(true)}
                >
                  <PhoneMissed className="w-7 h-7" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
