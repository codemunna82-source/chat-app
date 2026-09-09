/**
 * The chat window's own icon set.
 *
 * Hand-drawn rather than pulled from the icon library the rest of the app
 * uses: the messenger look lives almost entirely in these shapes — the
 * squared-off double tick, the thin header glyphs — and a general-purpose
 * set renders them at the wrong weight and proportion. They are filled or
 * stroked to match the original, and all take colour from `currentColor`
 * so a single class controls a whole row.
 */

type IconProps = { className?: string };

export function BackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.6 3.5a1.6 1.6 0 0 1 2.3.5l1.4 2.4a1.6 1.6 0 0 1-.3 2l-1 .9a11.3 11.3 0 0 0 4.7 4.7l.9-1a1.6 1.6 0 0 1 2-.3l2.4 1.4a1.6 1.6 0 0 1 .5 2.3l-1 1.5a2.6 2.6 0 0 1-2.9 1A17.6 17.6 0 0 1 4.1 7.4a2.6 2.6 0 0 1 1-2.9z" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.5a4.4 4.4 0 0 0-4.4 4.4v2.2H7a1.7 1.7 0 0 0-1.7 1.7v8.2A1.7 1.7 0 0 0 7 20.7h10a1.7 1.7 0 0 0 1.7-1.7v-8.2A1.7 1.7 0 0 0 17 9.1h-.6V6.9A4.4 4.4 0 0 0 12 2.5zm0 1.8a2.6 2.6 0 0 1 2.6 2.6v2.2H9.4V6.9A2.6 2.6 0 0 1 12 4.3z" />
    </svg>
  );
}

export function SmileyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.15" fill="currentColor" stroke="none" />
      <path d="M8 14.4c1 1.4 2.4 2.1 4 2.1s3-.7 4-2.1" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5A1.9 1.9 0 0 1 4.9 6.6h2.2l1.1-1.9h7.6l1.1 1.9h2.2A1.9 1.9 0 0 1 21 8.5v8.6a1.9 1.9 0 0 1-1.9 1.9H4.9A1.9 1.9 0 0 1 3 17.1z" />
      <circle cx="12" cy="12.6" r="3.6" />
    </svg>
  );
}

export function MicIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 15.4a3.2 3.2 0 0 0 3.2-3.2V6a3.2 3.2 0 1 0-6.4 0v6.2a3.2 3.2 0 0 0 3.2 3.2z" />
      <path d="M17.8 12.2a.9.9 0 0 0-1.8 0 4 4 0 0 1-8 0 .9.9 0 0 0-1.8 0 5.8 5.8 0 0 0 4.9 5.7v2.2h-2a.9.9 0 0 0 0 1.8h5.8a.9.9 0 0 0 0-1.8h-2v-2.2a5.8 5.8 0 0 0 4.9-5.7z" />
    </svg>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M2.4 20.9 22 12 2.4 3.1l.01 6.93L16.4 12 2.41 13.97z" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function PersonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 12.6a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6zM12 14.3c-3.6 0-7.2 1.9-7.2 4.2v1.5h14.4v-1.5c0-2.3-3.6-4.2-7.2-4.2z" />
    </svg>
  );
}

/** Waiting for the server to acknowledge the message. */
export function ClockTick({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.6V8l2.4 1.6" />
    </svg>
  );
}

/**
 * Sent, and delivered once the business's inbox has it.
 *
 * There is no third, blue state here on purpose: the backend does not tell
 * a web guest when an agent has opened the thread, and colouring the ticks
 * on a guess would be a read receipt the customer cannot rely on.
 */
export function TickIcon({ className, double }: IconProps & { double?: boolean }) {
  return (
    <svg viewBox="0 0 18 12" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {double && <path d="M1 6.6 4.1 9.7 10.5 2.4" />}
      <path d={double ? 'M7.4 6.6 10.5 9.7 17 2.4' : 'M3 6.6 6.6 10.2 14 2'} />
    </svg>
  );
}
