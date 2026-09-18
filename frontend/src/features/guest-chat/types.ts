/**
 * The message a reply is answering, as both clients draw it.
 *
 * `type` and `mediaId` are what let a reply to a picture SHOW the picture
 * instead of the word "[photo]" — which, in a thread where the business
 * has just sent nine of them, answers nothing. Both are absent from an
 * older server, and from a quote built optimistically before the send has
 * come back; the renderer treats absence as "no icon, no thumbnail".
 */
export interface QuotedMessage {
  id: string;
  from: 'me' | 'business';
  /** One line: the caption, or a word for a photo or a recording. */
  preview: string;
  type?: string;
  /** The quoted PHOTO. Present only for an image that still exists. */
  mediaId?: string;
}

/**
 * One line standing in for a quoted message.
 *
 * "Photo" rather than "[photo]": a bracketed type name is a placeholder
 * that leaked into the product. A caption wins over it outright — someone
 * who wrote "the blue one" on a picture has already said what it is
 * better than any word this could choose.
 *
 * Kept identical to the server's previewOf (backend guest.service.ts),
 * because both write the same field: the server when the message comes
 * back, this when a reply is drawn optimistically before it has.
 */
export function previewOfQuoted(m: {
  text?: string;
  type: string;
  revokedAt?: string;
}): string {
  if (m.revokedAt) return 'This message was deleted';
  if (m.text) return m.text;
  switch (m.type) {
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Voice message';
    case 'document':
      return 'Document';
    case 'location':
      return 'Location';
    case 'sticker':
      return 'Sticker';
    default:
      return `[${m.type}]`;
  }
}

/**
 * A quote built from a message this window already holds.
 *
 * Used for the composer's preview and for the optimistic copy attached to
 * a reply before the server answers, so what is being answered looks the
 * same before and after Send — which is also the moment the thumbnail
 * used to disappear and come back.
 */
export function quoteOf(m: GuestMessage): QuotedMessage {
  const quote: QuotedMessage = {
    id: m.id,
    from: m.from,
    preview: previewOfQuoted(m),
    type: m.type,
  };
  // Only a picture that still exists. A withdrawn one has no bytes left
  // to fetch, and a document or voice note has no frame to show.
  if (m.type === 'image' && m.mediaId && !m.revokedAt) quote.mediaId = m.mediaId;
  return quote;
}

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
  replyTo?: QuotedMessage;
  /** Emoji reactions on this message. */
  reactions?: { emoji: string; mine: boolean }[];
  /** Present on `type: 'location'` — where to draw the pin. */
  location?: GuestLocation;
  /**
   * How far this message has got. Only on the customer's own messages —
   * a tick on a bubble they did not send would mean nothing to them.
   *
   * 'delivered' is two grey ticks (it reached the workspace), 'read' is
   * two green ones (an agent opened the chat). 'sent' is the single tick
   * everything else collapses to.
   */
  status?: 'sent' | 'delivered' | 'read';
  /**
   * Which wire it travelled on. A message the customer sent from
   * WhatsApp appears in this window too and can never be withdrawn from
   * it — this is what tells the two apart. Absent from an older server,
   * which the window reads as WhatsApp: the safe answer, since it only
   * ever withholds a button.
   */
  channel?: 'whatsapp' | 'web';
  /**
   * Set when whoever sent this message took it back. `text`, `mediaId`
   * and `location` are empty on such a message because the server really
   * deleted the content — a tombstone is all there is left to draw.
   */
  revokedAt?: string;
  /** Which side withdrew it, so the line can read "You deleted this
   *  message" instead of the neutral wording. */
  revokedBy?: 'agent' | 'customer';
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
export type ThreadMessage = GuestMessage & {
  pending?: boolean;
  /**
   * An object URL for a file still going up, so the photo is on screen
   * the instant it is picked rather than after the round trip.
   *
   * Revoked when the real message replaces this row — an object URL that
   * is never released pins the whole file in memory for the life of the
   * tab, which on a thread of a dozen photos is the difference between a
   * working page and one the browser kills.
   */
  localUrl?: string;
  /** 0-1 while the bytes are going up; absent once the server has it. */
  uploadProgress?: number;
};

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
   * When the business's photo last changed, or absent when it has none.
   *
   * A version rather than a URL: the picture is served from a route
   * behind this window's own link, so nothing here outlives the link.
   * Its absence is what stops the window asking for a photo that does
   * not exist.
   */
  businessAvatarUpdatedAt?: string | null;
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
  replyTo?: QuotedMessage;
  reactions?: { emoji: string; mine: boolean }[];
  location?: GuestLocation;
  /** The workspace's own status enum — QUEUED | SENT | DELIVERED | READ | FAILED. */
  status?: string;
  /** See GuestMessage.channel. */
  channel?: 'whatsapp' | 'web';
  /** Present once the message has been withdrawn — see GuestMessage. */
  revokedAt?: string;
  revokedBy?: 'agent' | 'customer';
}

export function realtimeToGuestMessage(m: RealtimeMessage): GuestMessage {
  const view: GuestMessage = {
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
    channel: m.channel,
    revokedAt: m.revokedAt,
    revokedBy: m.revokedBy,
  };
  if (view.from === 'me') view.status = guestStatusFrom(m.status) ?? 'sent';
  return view;
}

/**
 * The workspace's storage status, translated for the customer.
 *
 * Returns undefined for anything unrecognised rather than guessing, so a
 * status this window has never heard of leaves the existing tick alone
 * instead of silently downgrading it.
 */
export function guestStatusFrom(status: string | undefined): GuestMessage['status'] | undefined {
  switch (status) {
    case 'READ':
    case 'read':
      return 'read';
    case 'DELIVERED':
    case 'delivered':
      return 'delivered';
    case 'QUEUED':
    case 'SENT':
    case 'sent':
      return 'sent';
    default:
      return undefined;
  }
}

/**
 * Ordering, so a tick only ever moves forwards.
 *
 * Status events can arrive out of order — a DELIVERED landing after the
 * READ that superseded it — and applying them blindly would take a green
 * tick back to grey while the customer was looking at it.
 */
export function rankStatus(status: GuestMessage['status']): number {
  switch (status) {
    case 'read':
      return 3;
    case 'delivered':
      return 2;
    case 'sent':
      return 1;
    default:
      return 0;
  }
}
