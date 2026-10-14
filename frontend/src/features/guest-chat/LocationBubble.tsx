'use client';

import { LocationIcon } from './waIcons';
import type { GuestLocation } from './types';

/**
 * A shared place, inside a message bubble.
 *
 * Real map tiles, from OpenStreetMap's own embed, in an iframe. No API
 * key and no SDK — the URL is the whole integration.
 *
 * This DOES tell openstreetmap.org the coordinates and the viewer's IP,
 * which an earlier drawn-graphic version of this card deliberately
 * avoided. That was the owner's call to make and they made it: a picture
 * of the actual streets is what makes a shared location useful, and a
 * graphic that only suggested a map was not worth the space it took.
 *
 * The iframe is sandboxed and pointer-events are off, so the card is a
 * picture rather than a map you can pan inside a chat bubble — dragging
 * it would fight the thread's own scroll, and the tap target underneath
 * is what opens the customer's real map app.
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

  // OpenStreetMap's embed takes a bounding box, not a zoom level. This
  // span is roughly a couple of streets across — close enough to place
  // the pin on a recognisable corner, wide enough that a GPS reading a
  // few metres out does not look like the wrong building.
  const d = 0.0025;
  const bbox = `${longitude - d},${latitude - d},${longitude + d},${latitude + d}`;
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-[232px] overflow-hidden rounded-[6px] transition active:scale-[0.985]"
      aria-label={`${label}, open in maps`}
    >
      <div className="relative h-[118px] w-full bg-[#e8e4df]" aria-hidden>
        <iframe
          src={embedUrl}
          title=""
          loading="lazy"
          // No scripts, no forms, no navigation: this is a picture of a
          // place, and an embed from another origin gets nothing it does
          // not need to draw one.
          sandbox=""
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full border-0"
        />
        {/* OSM draws its own marker, but only once the tiles have loaded.
            This sits on top so the card reads as a location from the
            first frame rather than as a grey rectangle that gains a
            meaning a second later. */}
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
