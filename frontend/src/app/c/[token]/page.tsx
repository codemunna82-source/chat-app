import type { Metadata } from 'next';
import GuestChatWindow from '@/features/guest-chat/GuestChatWindow';

/**
 * A private conversation between one customer and one business, reachable
 * only by the link token in the URL. `noindex` is not decoration: the link
 * is pasted into WhatsApp threads and gets forwarded, and a crawler that
 * followed one would put a real customer's chat into a search index.
 */
export const metadata: Metadata = {
  title: 'Private chat',
  robots: { index: false, follow: false },
};

export default async function GuestChatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestChatWindow token={token} />;
}
