import type { GuestSession, ThreadMessage } from './types';

/**
 * A working chat window with no backend behind it.
 *
 * Exists because seeing the window normally costs a round trip through
 * three systems: the agent app has to issue a link, which needs a live
 * backend, which needs a WhatsApp number attached to the workspace. None
 * of that is needed to look at the interface, and blocking a design review
 * on a Meta phone-number registration is absurd.
 *
 * The token is a fixed word rather than something random, so the demo URL
 * can be typed from memory. Real link tokens are long and opaque, so no
 * genuine session can collide with it — see the guest session model, where
 * tokens are generated, hashed and never chosen.
 */
export const DEMO_TOKEN = 'demo';

export function isDemoToken(token: string): boolean {
  return token.toLowerCase() === DEMO_TOKEN;
}

export const DEMO_SESSION: GuestSession = {
  conversationId: 'demo-conversation',
  businessName: 'RK Enterprises',
  contactName: 'Nitesh Kumar',
  // The demo shows the badge so it can be looked at. On a real link this
  // comes from Meta and is false until Meta says otherwise — see
  // getGuestSessionView on the server, where it is read rather than set.
  verifiedByWhatsApp: true,
  businessPhone: '+91 91539 50934',
  blocked: false,
};

/**
 * An image without a media route behind it.
 *
 * ChatImage normally fetches bytes with the link token, because an <img>
 * tag cannot send an Authorization header. A `demo:` prefix tells it the
 * rest of the value is already a usable src — the one branch the demo
 * needs inside otherwise untouched rendering code.
 */
const DEMO_IMAGE = `demo:data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="380" viewBox="0 0 520 380">
    <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#134e4a"/>
    </linearGradient></defs>
    <rect width="520" height="380" fill="url(#s)"/>
    <g fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="7" stroke-linejoin="round">
      <rect x="150" y="128" width="220" height="150" rx="10"/>
      <path d="M150 178h220M260 128v150"/>
    </g>
    <text x="260" y="330" text-anchor="middle" fill="#ffffff" fill-opacity=".92"
      font-family="system-ui, sans-serif" font-size="26" font-weight="600">Autumn catalogue</text>
  </svg>`,
)}`;

/** Minutes ago → an ISO timestamp, so the demo thread is always "just now". */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * Oldest first, already in render order — the transcript's own ordering,
 * not the API's newest-first paging order.
 *
 * Spans two days on purpose: the date separator, the grouping of a run of
 * messages, and the single tail on the first bubble of that run are all
 * things a one-day thread would not show.
 */
export function demoMessages(): ThreadMessage[] {
  return [
    {
      id: 'demo-1',
      from: 'me',
      type: 'text',
      text: 'Hi — I placed order #4192 last week and haven’t had an update yet.',
      hasMedia: false,
      createdAt: ago(1500),
    },
    {
      id: 'demo-2',
      from: 'me',
      type: 'text',
      text: 'Could you check it for me?',
      hasMedia: false,
      createdAt: ago(1498),
    },
    {
      id: 'demo-3',
      from: 'business',
      type: 'text',
      text: 'Hi Nitesh! Thanks for opening the private chat 👋 Let me pull that order up.',
      hasMedia: false,
      createdAt: ago(60),
    },
    {
      id: 'demo-4',
      from: 'business',
      type: 'text',
      text: 'Found it — it’s packed and leaving our warehouse today.',
      hasMedia: false,
      createdAt: ago(58),
    },
    {
      id: 'demo-5',
      from: 'business',
      type: 'image',
      text: 'Here’s the catalogue you asked about too.',
      hasMedia: true,
      mediaId: DEMO_IMAGE,
      createdAt: ago(56),
    },
    {
      id: 'demo-6',
      from: 'me',
      type: 'text',
      text: 'Perfect 😊 is the blue one still in stock?',
      hasMedia: false,
      createdAt: ago(12),
    },
    {
      id: 'demo-7',
      from: 'business',
      type: 'text',
      text: 'Yes, blue is in stock. Should reach you by Thursday.',
      hasMedia: false,
      createdAt: ago(10),
    },
    {
      id: 'demo-8',
      from: 'me',
      type: 'text',
      text: 'Great, thank you! 🙏 Where should I collect it from?',
      hasMedia: false,
      createdAt: ago(9),
    },
    {
      // A named place rather than bare coordinates, because that is the
      // half of the location card the demo can otherwise never show — a
      // browser's own fix has no name and no address attached to it.
      id: 'demo-9',
      from: 'business',
      type: 'location',
      text: 'Our shop (12.934500, 77.610100)',
      hasMedia: false,
      createdAt: ago(8),
      location: {
        latitude: 12.9345,
        longitude: 77.6101,
        name: 'Our shop',
        address: '4th Block, Koramangala, Bengaluru 560034',
      },
    },
  ];
}

/**
 * What the imaginary agent says next, cycled in order.
 *
 * Written to be obviously a demo when read. A reply that could pass for a
 * real agent's would be worse than useless here — someone showing this
 * window to a colleague should never have to explain that nobody is
 * actually on the other end.
 */
const DEMO_REPLIES = [
  'This is the demo chat — nobody is really on the other end 🙂 In the live window your reply would reach the business’s inbox instantly.',
  'Still the demo. Try the + button for the gallery, camera and location tray.',
  'Everything here is local to your browser: nothing is stored and nothing is sent.',
];

export function demoReply(index: number): string {
  return DEMO_REPLIES[index % DEMO_REPLIES.length]!;
}
