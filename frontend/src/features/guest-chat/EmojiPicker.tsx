'use client';

import { useState } from 'react';

/**
 * The emoji tray.
 *
 * Built in-house rather than pulled from a picker library: every one of
 * those ships its own sprite sheet or CDN image set, which is 400KB+ and a
 * second network dependency on a page a customer opens from a link on a
 * phone. Native glyphs cost nothing, already match the device the customer
 * is holding, and are what the rest of the thread renders anyway.
 */

const CATEGORIES: { key: string; label: string; emojis: string[] }[] = [
  {
    key: 'recent',
    label: '🕘',
    emojis: [],
  },
  {
    key: 'smileys',
    label: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
      '🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷',
      '🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕',
      '😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖',
      '😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','💀','💩','🤡','👻','👽',
    ],
  },
  {
    key: 'people',
    label: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
      '👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅',
      '💪','🦵','🦶','👂','👃','🧠','🫀','👀','👁️','👅','👄','💋','🧑','👶','👦','👧',
      '👨','👩','🧓','👮','🕵️','💂','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🍼',
    ],
  },
  {
    key: 'nature',
    label: '🐻',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈',
      '🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛',
      '🦋','🐌','🐞','🐜','🕷️','🐢','🐍','🦎','🐙','🦀','🐬','🐳','🐟','🐊','🐘','🦒',
      '🌵','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🍁','🍂','🌸','🌼','🌻','🌹','🌺','🌷',
    ],
  },
  {
    key: 'food',
    label: '🍔',
    emojis: [
      '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥',
      '🥝','🍅','🥑','🍆','🥔','🥕','🌽','🌶️','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰',
      '🍞','🥐','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🍔','🍟','🍕','🌭','🥪',
      '🌮','🌯','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍚','🍘','🍥','🥠','🍢',
      '🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','☕','🍵','🥤','🍺',
    ],
  },
  {
    key: 'activity',
    label: '⚽',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🏑','🥍','🏏',
      '🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️',
      '🏂','🏋️','🤸','🤼','🤽','🤾','🧘','🏄','🏊','🚴','🚵','🏆','🥇','🥈','🥉','🎖️',
      '🎪','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','🎯','🎮',
    ],
  },
  {
    key: 'travel',
    label: '🚗',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🛵','🏍️','🛺',
      '🚲','🛴','🚂','🚆','🚇','🚊','🚝','✈️','🛫','🛬','🚀','🛸','🚁','⛵','🚤','🛳️',
      '⚓','🗺️','🗿','🗽','🗼','🏰','🏯','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋',
      '⛰️','🏔️','🗻','🏕️','🏠','🏡','🏢','🏬','🏭','🏥','🏦','🏨','⛪','🕌','🛕','🕋',
    ],
  },
  {
    key: 'objects',
    label: '💡',
    emojis: [
      '⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','💽','💾','💿','📷','📸','📹','🎥','📞','☎️',
      '📟','📠','📺','📻','⏰','⏱️','⌛','🔋','🔌','💡','🔦','🕯️','🧯','🛢️','💸','💵',
      '💳','🧾','💎','⚖️','🔧','🔨','🛠️','⛏️','🔩','⚙️','🧲','🔫','💣','🔪','🚬','⚰️',
      '🔮','📿','💈','⚗️','🔭','🔬','🩹','💊','💉','🌡️','🚽','🚿','🛁','🧼','🧽','🧹',
    ],
  },
  {
    key: 'symbols',
    label: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈',
      '🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐',
      '✅','❌','❎','➕','➖','➗','✖️','♾️','‼️','⁉️','❓','❔','❕','❗','〰️','💯',
      '🔥','✨','🌟','⭐','💫','⚡','☄️','💥','🎉','🎊','🎈','🎁','🏅','🔔','🔕','💤',
    ],
  },
];

const RECENT_KEY = 'wa-recent-emoji';
const RECENT_LIMIT = 32;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    // Private windows and "block site data" both throw on read. An empty
    // tray is a fine outcome; a chat window that fails to open is not.
    return [];
  }
}

export function rememberEmoji(emoji: string): void {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* see readRecent */
  }
}

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [active, setActive] = useState('smileys');
  // Read once, when the tray is first opened. The tray only ever mounts in
  // response to a tap, so this never runs during server rendering — the
  // window guard is belt-and-braces for that invariant, not a fallback
  // whose value would differ from the markup being hydrated.
  const [recent, setRecent] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : readRecent(),
  );

  const tabs = CATEGORIES.filter((c) => c.key !== 'recent' || recent.length > 0);
  const shown = active === 'recent' ? recent : (CATEGORIES.find((c) => c.key === active)?.emojis ?? []);

  return (
    <div className="flex h-[280px] flex-col border-t border-[var(--wa-divider)] bg-[var(--wa-composer)]">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-2 py-1.5">
        {tabs.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActive(c.key)}
            aria-label={c.key}
            aria-pressed={active === c.key}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[17px] leading-none transition ${
              active === c.key ? 'bg-[var(--wa-accent)]/15' : 'opacity-55'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="wa-scroll grid min-h-0 flex-1 grid-cols-8 gap-0.5 overflow-y-auto px-2 pb-2">
        {shown.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            onClick={() => {
              onPick(e);
              rememberEmoji(e);
              setRecent(readRecent());
            }}
            className="flex h-9 items-center justify-center rounded-lg text-[22px] leading-none transition active:scale-90 hover:bg-[var(--wa-hover)]"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
