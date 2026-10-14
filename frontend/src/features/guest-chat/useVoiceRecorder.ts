'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Recording a voice note in a browser.
 *
 * MediaRecorder rather than a library: it is what every browser that can
 * record already ships, and the alternative is a WASM encoder measured in
 * hundreds of kilobytes on a page a customer opens from a link on a phone.
 *
 * The container is not ours to choose. Chrome and Firefox produce Opus in
 * WebM; Safari — every iPhone — produces AAC in MP4. Asking for a type the
 * browser cannot make throws, so the first supported candidate wins and
 * whatever comes out is what gets uploaded.
 */
const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Whether this browser can record at all — the button is hidden if not. */
export function canRecordAudio(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

/** How many amplitude samples the live waveform keeps on screen. */
const WAVEFORM_BARS = 40;
/** Roughly twenty samples a second — fast enough to read as live speech. */
const SAMPLE_INTERVAL_MS = 50;
/**
 * The quietest peak the auto-gain will normalise against.
 *
 * Without a floor, a silent room would be scaled up until its own noise
 * filled the bar and the waveform danced at nothing. With it, silence
 * stays flat and only actual sound lifts the bars.
 */
const MIN_PEAK = 0.045;
/** How fast the running peak forgets a loud moment, per sample. */
const PEAK_DECAY = 0.94;

export interface VoiceRecording {
  blob: Blob;
  mimeType: string;
  /** Seconds, as counted while recording — a WebM blob has no reliable duration header. */
  seconds: number;
}

export type RecorderError = 'denied' | 'unavailable' | 'failed';

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<RecorderError | null>(null);
  /**
   * The live waveform, newest sample last.
   *
   * Real amplitudes read off the microphone rather than a decorative
   * animation: a bar that moves whatever the room is doing tells the
   * customer nothing about whether they are being heard, which is the one
   * question a recording indicator exists to answer.
   */
  const [levels, setLevels] = useState<number[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sampleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  /** Running loudest-recent sample, for the auto-gain — see MIN_PEAK. */
  const peakRef = useRef(MIN_PEAK);
  /** Set when the customer cancels, so the stop handler knows to discard. */
  const discardRef = useRef(false);

  const teardown = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (sampleRef.current) clearInterval(sampleRef.current);
    tickRef.current = null;
    sampleRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    // Releasing the track is what turns off the browser's recording
    // indicator. Leaving it open leaves a phone showing a live microphone
    // for a page that has finished with it.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setPaused(false);
    setLevels([]);
  }, []);

  // A page closed mid-recording must not leave the microphone running.
  useEffect(() => teardown, [teardown]);

  /**
   * Feeds the waveform from the microphone itself.
   *
   * Best effort on purpose: an AudioContext can be refused (an autoplay
   * policy, an unusual device) and a recording that works without a moving
   * picture is far better than one that refuses to start because the
   * picture could not be drawn.
   */
  const startMetering = useCallback((stream: MediaStream) => {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      const context = new Ctor();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);

      const samples = new Uint8Array(analyser.frequencyBinCount);
      peakRef.current = MIN_PEAK;

      sampleRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(samples);

        // RMS around the 128 midpoint of unsigned 8-bit PCM.
        let sum = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        const rms = Math.sqrt(sum / samples.length);

        // Auto-gain against the loudest recent sample, because raw RMS is
        // hopeless as a picture: ordinary speech into a laptop microphone
        // sits around 0.02–0.06, so any fixed multiplier either flattens a
        // quiet voice into a dotted line or clips a loud one into a solid
        // block. Normalising against a decaying peak makes the waveform
        // read the same whoever is talking and however far from the phone,
        // and the floor keeps a silent room silent.
        peakRef.current = Math.max(rms, peakRef.current * PEAK_DECAY, MIN_PEAK);
        // Loudness is perceived closer to a power curve than a linear one;
        // without this, everything below a shout hugs the bottom.
        const level = Math.min(1, Math.pow(rms / peakRef.current, 0.62));

        setLevels((prev) => [...prev, level].slice(-WAVEFORM_BARS));
      }, SAMPLE_INTERVAL_MS);
    } catch {
      /* see above — the recording still works */
    }
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!canRecordAudio()) {
      setError('unavailable');
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Refused, dismissed, or blocked by policy — indistinguishable from
      // here, and the answer is the same in each case.
      setError('denied');
      return false;
    }

    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start();

      setSeconds(0);
      setLevels([]);
      setPaused(false);
      setRecording(true);
      tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      startMetering(stream);
      return true;
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError('failed');
      return false;
    }
  }, [startMetering]);


  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    // The clock and the waveform both stop: a timer that keeps climbing
    // while paused reports a length the recording will not have.
    if (tickRef.current) clearInterval(tickRef.current);
    if (sampleRef.current) clearInterval(sampleRef.current);
    tickRef.current = null;
    sampleRef.current = null;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    if (!recorder || recorder.state !== 'paused' || !stream) return;
    recorder.resume();
    tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    startMetering(stream);
    setPaused(false);
  }, [startMetering]);

  /**
   * Stops and hands back the recording, or null if there is nothing worth
   * sending.
   *
   * Promise-based because `stop()` is asynchronous: the final chunk arrives
   * in an event afterwards, and reading the blob before it lands drops the
   * end of what was said.
   */
  const stop = useCallback((): Promise<VoiceRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      teardown();
      return Promise.resolve(null);
    }

    const elapsed = seconds;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        teardown();

        if (discardRef.current || chunks.length === 0) {
          resolve(null);
          return;
        }
        const blob = new Blob(chunks, { type });
        // A blob this small is a tap, not a message — usually a finger that
        // touched the button and let go. Sending it would put an unplayable
        // half-second of silence in the thread.
        if (blob.size < 1024) {
          resolve(null);
          return;
        }
        resolve({ blob, mimeType: type, seconds: Math.max(1, elapsed) });
      };
      recorder.stop();
    });
  }, [seconds, teardown]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    void stop();
  }, [stop]);

  return {
    recording,
    paused,
    seconds,
    levels,
    error,
    start,
    stop,
    cancel,
    pause,
    resume,
    clearError: () => setError(null),
  };
}
