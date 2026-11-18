'use client';

import { CameraIcon, CrosshairIcon } from './waIcons';

/**
 * The tray behind the `+` button.
 *
 * It exists because there is now more than one kind of attachment. While
 * photos were the only one, `+` opening the file picker directly was the
 * shorter path and the right one; adding a second entry to a button that
 * silently does a third thing is how attachment menus become guesswork.
 *
 * Only the things this window can genuinely send are listed. A greyed-out
 * "Document" row would tell the customer this chat handles documents, and
 * it does not.
 */
export function AttachSheet({
  onPhotos,
  onCamera,
  onLocation,
  onClose,
  locating,
}: {
  onPhotos: () => void;
  onCamera: () => void;
  onLocation: () => void;
  onClose: () => void;
  /** True while the browser is still resolving the fix, so the row can say so. */
  locating: boolean;
}) {
  return (
    <>
      {/* Catches the tap that closes the tray. Transparent rather than
          dimmed: the thread stays readable, which is what the messenger
          this copies does. */}
      <button
        type="button"
        aria-label="Close attachment menu"
        onClick={onClose}
        className="fixed inset-0 z-30 cursor-default"
      />
      <div
        className="z-40 shrink-0 border-t border-[var(--wa-divider)] bg-[var(--wa-composer)] px-4 pb-3 pt-4"
        role="menu"
        aria-label="Attach"
      >
        <div className="mx-auto flex w-full max-w-[560px] items-start justify-center gap-7">
          <Tile label="Gallery" tint="#a760f5" onClick={onPhotos}>
            <GalleryGlyph />
          </Tile>
          <Tile label="Camera" tint="#e9427f" onClick={onCamera}>
            <CameraIcon className="h-[22px] w-[22px]" />
          </Tile>
          <Tile
            label={locating ? 'Finding…' : 'Location'}
            tint="#0aa87f"
            onClick={onLocation}
            busy={locating}
          >
            <CrosshairIcon className="h-[22px] w-[22px]" />
          </Tile>
        </div>
      </div>
    </>
  );
}

function Tile({
  children,
  label,
  tint,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  label: string;
  tint: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={busy}
      className="flex w-[72px] flex-col items-center gap-1.5 transition active:scale-95 disabled:opacity-70"
    >
      <span
        className={`flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-[var(--wa-bubble-shadow)] ${
          busy ? 'animate-pulse' : ''
        }`}
        style={{ backgroundColor: tint }}
      >
        {children}
      </span>
      <span className="text-[12px] leading-[15px] text-[var(--wa-card-sub)]">{label}</span>
    </button>
  );
}

/** Stacked frames — the gallery glyph, which no other icon here doubles as. */
function GalleryGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
      <rect x="3.2" y="6.4" width="14.4" height="11.2" rx="2" />
      <path d="M4.6 15.2l3.4-3.2 2.6 2.4 2.8-3.4 3.2 4" />
      <path d="M7.4 6.4V5.2a1.8 1.8 0 0 1 1.8-1.8h9.6a1.8 1.8 0 0 1 1.8 1.8v9.6a1.8 1.8 0 0 1-1.8 1.8h-1.2" />
    </svg>
  );
}
