'use client';

import { useMemo } from 'react';
import { Users, Sparkles } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useSocket } from '@/contexts/SocketContext';
import { useAuthStore } from '@/store/useAuthStore';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { GlassCard } from '@/components/ui/GlassCard';
import { TiltCard } from '@/components/three/TiltCard';
import { useDeviceUIProfile } from '@/hooks/useDeviceUIProfile';

type ChatUser = { _id: string; name?: string; avatar?: string; email?: string; about?: string };
type Chat = {
  _id: string;
  isGroupChat: boolean;
  chatName?: string;
  users: ChatUser[];
};

function getOtherUser(logged: ChatUser | null, users: ChatUser[]) {
  if (!logged || !users?.length) return null;
  return users[0]?._id === logged._id ? users[1] : users[0];
}

/**
 * Desktop-only context column: read-only view from existing stores (no API changes).
 */
export function ChatInfoPanel() {
  const { selectedChat } = useChatStore() as { selectedChat: Chat | null };
  const { user } = useAuthStore() as { user: ChatUser | null };
  const { onlineUsers } = useSocket();
  const { allowTilt } = useDeviceUIProfile();

  const peer = useMemo(() => {
    if (!selectedChat || selectedChat.isGroupChat) return null;
    return getOtherUser(user, selectedChat.users);
  }, [selectedChat, user]);

  if (!selectedChat) return null;

  const title = selectedChat.isGroupChat ? selectedChat.chatName || 'Group' : peer?.name || 'Chat';
  const subtitle = selectedChat.isGroupChat
    ? `${selectedChat.users?.length ?? 0} members`
    : peer?.email || '';
  const about = !selectedChat.isGroupChat ? peer?.about : undefined;
  const avatarSrc = selectedChat.isGroupChat ? undefined : peer?.avatar;
  const online = Boolean(peer?._id && onlineUsers.includes(String(peer._id)));

  return (
    <TiltCard
      disabled={!allowTilt}
      maxTilt={5}
      className="hidden h-full min-h-0 shrink-0 xl:flex xl:w-[min(18rem,26vw)] xl:flex-col"
    >
    <GlassCard
      variant="liquid"
      lift
      className="scrollbar-none flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto overscroll-y-contain p-5"
      aria-label="Conversation details"
    >
      <div className="flex flex-col items-center text-center gap-2">
        {selectedChat.isGroupChat ? (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
            <Users className="h-9 w-9" />
          </div>
        ) : (
          <UserAvatar src={avatarSrc} name={peer?.name} variant="lg" className="h-20 w-20 ring-2 ring-white/20 shadow-lg" sizes="80px" />
        )}
        <h3 className="font-display text-lg font-bold tracking-tight text-foreground leading-tight">{title}</h3>
        {subtitle ? <p className="text-xs text-muted break-all px-1">{subtitle}</p> : null}
        {!selectedChat.isGroupChat && (
          <p className="text-[11px] font-medium text-primary">
            {online ? '● Online' : '○ Offline'}
          </p>
        )}
      </div>
      {about ? (
        <p className="text-sm text-muted leading-relaxed border-t border-white/10 pt-4 dark:border-white/5">{about}</p>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-muted dark:border-white/10 dark:bg-black/20">
          <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" />
          <span>Open the menu (⋮) for contact info, clear chat, and more.</span>
        </div>
      )}
    </GlassCard>
    </TiltCard>
  );
}
