import { getRtcConfiguration } from './iceServers';

export type PeerSessionHandlers = {
  onTrack?: (event: RTCTrackEvent) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit | null) => void;
  onIceConnectionState?: (state: RTCIceConnectionState) => void;
  onSignalingState?: (state: RTCSignalingState) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
};

/**
 * Manages a single RTCPeerConnection: signaling, ICE queuing before remoteDescription, and cleanup.
 */
export class WebRTCPeerSession {
  readonly pc: RTCPeerConnection;
  private readonly handlers: PeerSessionHandlers;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private closed = false;

  constructor(handlers: PeerSessionHandlers = {}) {
    this.handlers = handlers;
    this.pc = new RTCPeerConnection(getRtcConfiguration());

    this.pc.onicecandidate = (event) => {
      this.handlers.onIceCandidate?.(event.candidate ? event.candidate.toJSON() : null);
    };

    this.pc.ontrack = (event) => this.handlers.onTrack?.(event);

    this.pc.oniceconnectionstatechange = () => {
      this.handlers.onIceConnectionState?.(this.pc.iceConnectionState);
    };

    this.pc.onsignalingstatechange = () => {
      this.handlers.onSignalingState?.(this.pc.signalingState);
    };

    this.pc.onconnectionstatechange = () => {
      this.handlers.onConnectionState?.(this.pc.connectionState);
    };
  }

  addTransceiverOrTrack(stream: MediaStream) {
    stream.getTracks().forEach((track) => {
      this.pc.addTrack(track, stream);
    });
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.pc.setLocalDescription(offer);
    return this.pc.localDescription!.toJSON();
  }

  async applyRemoteOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    await this.setRemoteDescription(offer);
  }

  async createAndSetAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return this.pc.localDescription!.toJSON();
  }

  async applyRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.setRemoteDescription(answer);
  }

  private async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
    await this.drainPendingCandidates();
  }

  /** Queue or apply remote ICE (trickle). */
  async addRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.closed) return;
    if (!this.pc.remoteDescription) {
      this.pendingRemoteCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      /* duplicate or late candidate */
    }
  }

  async addRemoteIceCandidatesBatch(candidates: RTCIceCandidateInit[] | undefined): Promise<void> {
    if (!candidates?.length) return;
    for (const c of candidates) {
      await this.addRemoteIceCandidate(c);
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    const batch = this.pendingRemoteCandidates.splice(0);
    for (const c of batch) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* ignore */
      }
    }
  }

  replaceVideoTrack(track: MediaStreamTrack | null) {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) void sender.replaceTrack(track);
  }

  replaceAudioTrack(track: MediaStreamTrack | null) {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender) void sender.replaceTrack(track);
  }

  restartIce() {
    try {
      this.pc.restartIce();
    } catch {
      /* ignore */
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pendingRemoteCandidates.length = 0;
    try {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onsignalingstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    } catch {
      /* ignore */
    }
  }

  get iceConnectionState(): RTCIceConnectionState {
    return this.pc.iceConnectionState;
  }

  get signalingState(): RTCSignalingState {
    return this.pc.signalingState;
  }
}
