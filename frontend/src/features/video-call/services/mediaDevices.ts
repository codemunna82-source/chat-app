import type { MediaPermissionErrorCode } from '../types';

export class MediaDeviceError extends Error {
  readonly code: MediaPermissionErrorCode;

  constructor(code: MediaPermissionErrorCode, message: string) {
    super(message);
    this.name = 'MediaDeviceError';
    this.code = code;
  }
}

function mapDomError(err: unknown): MediaDeviceError {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as DOMException).name);
    const map: Record<string, MediaPermissionErrorCode> = {
      NotAllowedError: 'NotAllowedError',
      PermissionDeniedError: 'NotAllowedError',
      NotFoundError: 'NotFoundError',
      DevicesNotFoundError: 'NotFoundError',
      NotReadableError: 'NotReadableError',
      TrackStartError: 'NotReadableError',
      OverconstrainedError: 'OverconstrainedError',
      ConstraintNotSatisfiedError: 'OverconstrainedError',
      AbortError: 'AbortError',
      SecurityError: 'SecurityError',
    };
    const code = map[name] || 'Unknown';
    const messages: Record<MediaPermissionErrorCode, string> = {
      NotAllowedError: 'Camera or microphone permission was denied.',
      NotFoundError: 'No camera or microphone was found.',
      NotReadableError: 'The camera or microphone is already in use or cannot be opened.',
      OverconstrainedError: 'This device does not support the requested video mode.',
      AbortError: 'Media request was aborted.',
      SecurityError: 'Media access is blocked (HTTPS required or insecure context).',
      Unknown: 'Could not access camera or microphone.',
    };
    return new MediaDeviceError(code, messages[code]);
  }
  return new MediaDeviceError('Unknown', 'Could not access camera or microphone.');
}

export type LocalMediaOptions = {
  callType: 'audio' | 'video';
  facingMode?: 'user' | 'environment';
};

export async function acquireLocalMedia(options: LocalMediaOptions): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new MediaDeviceError('Unknown', 'This browser does not support media devices.');
  }

  const { callType, facingMode = 'user' } = options;
  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
    video:
      callType === 'video'
        ? {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    throw mapDomError(e);
  }
}

export async function acquireDisplayMedia(withAudio = false): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    throw new MediaDeviceError('Unknown', 'Screen sharing is not supported in this browser.');
  }
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: withAudio,
    });
  } catch (e) {
    throw mapDomError(e);
  }
}

export function stopAllTracks(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  });
}
