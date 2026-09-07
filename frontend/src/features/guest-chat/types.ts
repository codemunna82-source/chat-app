/** What the customer sees. Mirrors the backend's GuestMessageView exactly. */
export interface GuestMessage {
  id: string;
  /** The customer's own perspective, not the workspace's IN/OUT. */
  from: 'me' | 'business';
  type: string;
  text?: string;
  hasMedia: boolean;
  createdAt: string;
}

export interface GuestSession {
  conversationId: string;
  businessName: string;
  contactName?: string;
}

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
}

export function realtimeToGuestMessage(m: RealtimeMessage): GuestMessage {
  return {
    id: m.id,
    from: m.direction === 'IN' ? 'me' : 'business',
    type: m.type,
    text: m.text,
    hasMedia: Boolean(m.mediaId),
    createdAt: m.createdAt,
  };
}
