/** SDP + optional legacy bundled candidates (trickle is preferred). */
export type CallSignalPayload = {
  sdp: RTCSessionDescriptionInit;
  candidates?: RTCIceCandidateInit[];
};

export type VideoCallConnectionQuality = 'idle' | 'connecting' | 'good' | 'poor' | 'failed';

export type MediaPermissionErrorCode =
  | 'NotAllowedError'
  | 'NotFoundError'
  | 'NotReadableError'
  | 'OverconstrainedError'
  | 'AbortError'
  | 'SecurityError'
  | 'Unknown';
