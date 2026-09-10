'use client';

import { LocationIcon } from './waIcons';
import type { GuestLocation } from './types';

/**
 * A shared place, inside a message bubble.
 *
 * The card behind the pin is a drawn abstraction, NOT a map of the
 * coordinates it sits above — no tiles are fetched and none could be
 * without handing a third-party map host every customer's location along
 * with the page they were on. A picture that looked like the real streets
 * around that pin while being generated from nothing would be the one
 * thing worse than no picture at all, so this one is unmistakably a
 * graphic: flat bands, no labels, no scale.
 *
 * What it is honest about is where the place actually is. The coordinates
 * are printed underneath, and the whole card opens the customer's real map
 * app, which does have the tiles.
 */
export function LocationBubble({ place, mine }: { place: GuestLocation; mine: boolean }) {
  const { latitude, longitude } = place;
  const label = place.name?.trim() || 'Shared location';
  const coords = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  // The universal form: every major map app on every platform opens this,
  // and it needs no key and no SDK. `geo:` would be tidier on Android and
  // does nothing at all on a desktop browser, which is where half of these
  // links get tapped.
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-[232px] overflow-hidden rounded-[6px] transition active:scale-[0.985]"
      aria-label={`${label}, open in maps`}
    >
      <div
        className="relative h-[118px] w-full"
        style={{
          background:
            'linear-gradient(160deg, #dfeadf 0%, #cfe0d2 42%, #c3d8c8 100%)',
        }}
        aria-hidden
      >
        {/* Bands rather than a street grid: a grid invites the eye to read
            it as a real place. These read as "map-ish surface" and nothing
            more. */}
        <svg viewBox="0 0 232 118" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <path d="M-10 84 L92 34 L150 60 L242 18" fill="none" stroke="#ffffff" strokeWidth="9" strokeOpacity="0.75" />
          <path d="M-10 26 L58 52 L96 108 L152 128" fill="none" stroke="#ffffff" strokeWidth="6" strokeOpacity="0.55" />
          <path d="M160 -10 L188 46 L242 66" fill="none" stroke="#ffffff" strokeWidth="5" strokeOpacity="0.5" />
          <circle cx="34" cy="96" r="26" fill="#b7d3bd" fillOpacity="0.75" />
          <circle cx="206" cy="100" r="18" fill="#b7d3bd" fillOpacity="0.6" />
          <rect x="118" y="70" width="30" height="22" rx="3" fill="#ffffff" fillOpacity="0.4" />
          <rect x="70" y="12" width="26" height="18" rx="3" fill="#ffffff" fillOpacity="0.35" />
        </svg>

        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[62%] drop-shadow-[0_2px_3px_rgba(11,20,26,0.35)]">
          <PinGlyph />
        </span>
      </div>

      <div
        className={`px-[9px] pb-[6px] pt-[6px] ${mine ? 'bg-[var(--wa-out)]' : 'bg-[var(--wa-in)]'}`}
      >
        <p className="flex items-center gap-1 text-[14px] font-medium leading-[18px] text-[var(--wa-text)]">
          <LocationIcon className="h-[15px] w-[15px] shrink-0 text-[var(--wa-accent)]" />
          <span className="truncate">{label}</span>
        </p>
        {/* Room on the right for the timestamp the bubble draws over this
            strip. Without it the address runs underneath "10:45 AM ✓✓". */}
        <p className="mt-[1px] truncate pr-[52px] text-[12.5px] leading-[16px] text-[var(--wa-meta)]">
          {place.address?.trim() || coords}
        </p>
      </div>
    </a>
  );
}

/** The teardrop, drawn rather than iconised so it can carry its own fill. */
function PinGlyph() {
  return (
    <svg viewBox="0 0 24 34" className="h-[34px] w-[24px]" aria-hidden>
      <path
        d="M12 0.8a10.4 10.4 0 0 0-10.4 10.4c0 7.6 10.4 22 10.4 22s10.4-14.4 10.4-22A10.4 10.4 0 0 0 12 .8z"
        fill="#e0483d"
      />
      <circle cx="12" cy="11.2" r="4" fill="#ffffff" />
    </svg>
  );
}
