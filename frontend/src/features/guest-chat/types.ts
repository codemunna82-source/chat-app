/** What the customer sees. Mirrors the backend's GuestMessageView exactly. */
export interface GuestMessage {
  id: string;
  /** The customer's own perspective, not the workspace's IN/OUT. */
  from: 'me' | 'business';
  type: string;
  text?: string;
  hasMedia: boolean;
  /** Present when there is an attachment — what the media route is asked for. */
  mediaId?: string;
  createdAt: string;
  /** The message this one answers, already flattened to one line by the server. */
  replyTo?: { id: string; from: 'me' | 'business'; preview: string };
  /** Emoji reactions on this message. */
  reactions?: { emoji: string; mine: boolean }[];
  /** Present on `type: 'location'` — where to draw the pin. */
  location?: GuestLocation;
}

/** A shared place. `name` and `address` are absent for a raw browser fix. */
export interface GuestLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * A thread row as the window holds it: a stored message, or one the
 * customer has sent that the server has not acknowledged yet.
 *
 * The pending flag lives here rather than in the component so the demo
 * transcript can be built with the same type the real one uses.
 */
export type ThreadMessage = GuestMessage & { pending?: boolean };

export interface GuestSession {
  conversationId: string;
  businessName: string;
  contactName?: string;
  /**
   * Whether Meta has reviewed and approved this business's display name.
   *
   * The badge is shown only when this is true, and it is true only because
   * Meta says so — the server reads it back from the Graph API and there is
   * no way for a business to set it for itself. A badge you can switch on
   * for yourself tells the customer looking at it nothing.
   */
  verifiedByWhatsApp?: boolean;
  /** The business's WhatsApp number, for the customer to check against the thread the link came from. */
  businessPhone?: string;
  /**
   * Whether the customer has blocked this chat.
   *
   * Comes back on every session load, not only from the tap that set it:
   * the state outlives the tab, and someone returning a week later has to
   * find the window as they left it, with Unblock where they can see it.
   */
  blocked?: boolean;
}

/** The reasons the report sheet offers, in the order it offers them. */
export const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'SCAM_OR_FRAUD', label: 'Scam or fraud' },
  { value: 'OFFENSIVE', label: 'Offensive content' },
  { value: 'NOT_THE_BUSINESS', label: 'Not the business it claims to be' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/**
 * The socket payload the backend already emits for every new message
 * (`message:new`). It is workspace-shaped — direction rather than `from` —
 * because the agent apps consume the same event.
 */
export interface RealtimeMessage {
  id: string;
  conversationId: string;
  direction: 'IN' | 'OUT';
  type: string;
  text?: string;
  mediaId?: string;
  createdAt: string;
  /** On a reaction row, the message it is attached to. */
  replyToMessageId?: string;
  /** Present when the server's realtime payload carries them; older builds send neither. */
  replyTo?: { id: string; from: 'me' | 'business'; preview: string };
  reactions?: { emoji: string; mine: boolean }[];
  location?: GuestLocation;
}

export function realtimeToGuestMessage(m: RealtimeMessage): GuestMessage {
  return {
    id: m.id,
    from: m.direction === 'IN' ? 'me' : 'business',
    type: m.type,
    text: m.text,
    hasMedia: Boolean(m.mediaId),
    mediaId: m.mediaId,
    createdAt: m.createdAt,
    replyTo: m.replyTo,
    reactions: m.reactions,
    location: m.location,
  };
}
