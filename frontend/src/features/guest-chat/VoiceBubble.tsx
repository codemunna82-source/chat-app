'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchMediaObjectUrl } from './guestApi';

/**
 * A voice note in the thread: play button, a scrubbable bar, and a clock
 * that counts through the recording.
 *
 * The bytes are fetched as a blob for the same reason images are — they
 * need the link token, and an <audio src> cannot send an Authorization
 * header. Loading starts on the first play rather than on mount: a thread
 * with a dozen recordings in it would otherwise pull every one of them
 * down before the customer has asked to hear any.
 */

/** Fixed pseudo-random bar heights: a waveform shape without decoding the audio. */
const BARS = [
  0.35, 0.6, 0.45, 0.8, 0.55, 1, 0.7, 0.4, 0.85, 0.5, 0.65, 0.3, 0.75, 0.95, 0.45, 0.6,
  0.35, 0.8, 0.5, 0.7, 0.4, 0.9, 0.55, 0.65, 0.3, 0.75, 0.45, 0.85, 0.6, 0.35,
];

function clock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function VoiceBubble({
  token,
  mediaId,
  mine,
  /** Counted while recording — a WebM blob often reports Infinity for its own length. */
  fallbackSeconds,
}: {
  token: string;
  mediaId: string;
  mine: boolean;
  fallbackSeconds?: number;
}) {
  // The demo passes a src the tag can already use; everything else has to
  // come through the token-authenticated media route.
  const direct = mediaId.startsWith('demo:') ? mediaId.slice('demo:'.length) : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(direct);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(fallbackSeconds ?? 0);
  const createdUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (createdUrlRef.current) URL.revokeObjectURL(createdUrlRef.current);
    },
    [],
  );

  async function ensureLoaded(): Promise<string | null> {
    if (url) return url;
    setLoading(true);
    try {
      const objectUrl = await fetchMediaObjectUrl(token, mediaId);
      createdUrlRef.current = objectUrl;
      setUrl(objectUrl);
      return objectUrl;
    } catch {
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const audio = audioRef.current;
    if (playing && audio) {
      audio.pause();
      return;
    }
    const src = await ensureLoaded();
    if (!src) return;
    // The element is rendered only once there is a src, so it may not have
    // existed when this handler started.
    requestAnimationFrame(() => void audioRef.current?.play().catch(() => setFailed(true)));
  }

  const shown = playing || position > 0 ? position : duration;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  // The unplayed bars sit on two different bubble colours, so they are
  // tinted per side; the played ones are the accent on both, as in the app.
  const track = mine ? 'bg-[var(--wa-tick)]/45' : 'bg-[var(--wa-meta)]/35';
  const played = 'bg-[var(--wa-accent)]';

  return (
    <div className="flex min-w-[210px] max-w-[260px] items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={failed}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 disabled:opacity-40"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : playing ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
            <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
            <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M7 4.8v14.4a1 1 0 0 0 1.53.85l11.2-7.2a1 1 0 0 0 0-1.7L8.53 3.95A1 1 0 0 0 7 4.8z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* Bars rather than a plain rail: the shape is decorative, but it is
            what makes the row read as a recording at a glance instead of as
            a download. Real amplitudes would mean decoding the file. */}
        <div className="flex h-6 items-center gap-[2px]" aria-hidden>
          {BARS.map((height, i) => (
            <span
              key={i}
              className={`w-[2px] shrink-0 rounded-full ${i / BARS.length <= progress ? played : track}`}
              style={{ height: `${Math.round(height * 20)}px` }}
            />
          ))}
        </div>
        <div className="mt-0.5 text-[11px] leading-none text-[var(--wa-meta)]">
          {failed ? 'Unavailable' : clock(shown)}
        </div>
      </div>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPosition(0);
          }}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const reported = e.currentTarget.duration;
            if (Number.isFinite(reported) && reported > 0) {
              setDuration(reported);
              return;
            }
            // A blob recorded by MediaRecorder reports Infinity here: the
            // container is written as a stream, so its header never learns
            // how long the recording turned out to be. Seeking past any
            // possible end makes the browser scan to the real one and fire
            // durationchange with a usable number — without this the bubble
            // reads 0:00 for every voice note it ever shows.
            e.currentTarget.currentTime = 1e101;
          }}
          onDurationChange={(e) => {
            const reported = e.currentTarget.duration;
            if (!Number.isFinite(reported) || reported <= 0) return;
            setDuration(reported);
            // Undo the seek that produced the answer, so pressing play
            // starts at the beginning rather than at the end.
            if (e.currentTarget.currentTime > reported) e.currentTarget.currentTime = 0;
          }}
          onError={() => setFailed(true)}
          className="hidden"
        />
      )}
    </div>
  );
}
