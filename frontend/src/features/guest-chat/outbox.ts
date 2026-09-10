'use client';

import type { ThreadMessage } from './types';

/**
 * Messages typed while there was no way to send them.
 *
 * A customer on a phone walks into a lift. Before this, their message
 * failed, the text was put back in the box, and if they closed the tab it
 * was gone — which is not what anyone expects from something that looks
 * like a messenger. Queued messages survive a reload, keep their place in
 * the thread, and go out in order the moment there is a connection again.
 *
 * Stored per token so two chats open on one device cannot drain each
 * other's queue.
 */
export interface OutboxItem {
  /** Also the temporary message id, so the bubble and the queue entry are the same row. */
  id: string;
  text: string;
  createdAt: string;
}

const KEY_PREFIX = 'wa-outbox:';
/** Enough for anyone typing through a tunnel; a bound stops a broken send loop filling storage. */
const MAX_ITEMS = 50;

function key(token: string): string {
  return `${KEY_PREFIX}${token}`;
}

export function readOutbox(token: string): OutboxItem[] {
  try {
    const raw = window.localStorage.getItem(key(token));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is OutboxItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as OutboxItem).id === 'string' &&
        typeof (item as OutboxItem).text === 'string' &&
        typeof (item as OutboxItem).createdAt === 'string',
    );
  } catch {
    // Private windows and blocked site data both throw. An empty queue is
    // a fine outcome; a chat that will not open is not.
    return [];
  }
}

export function writeOutbox(token: string, items: OutboxItem[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(key(token));
    else window.localStorage.setItem(key(token), JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    /* see readOutbox — the queue still works for this page's lifetime */
  }
}

/** The bubble a queued item renders as, so a restored queue looks like the thread it was typed into. */
export function outboxToMessage(item: OutboxItem): ThreadMessage {
  return {
    id: item.id,
    from: 'me',
    type: 'text',
    text: item.text,
    hasMedia: false,
    createdAt: item.createdAt,
    pending: true,
  };
}
