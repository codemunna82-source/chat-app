'use client';

import { useState, useEffect, useMemo } from 'react';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { useChatStore } from '@/store/useChatStore';
import { useHiddenContactsStore } from '@/store/useHiddenContactsStore';
import { useSocket } from '@/contexts/SocketContext';
import api from '@/lib/api';
import { Plus } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { AnimatePresence } from 'framer-motion';
import ChatSearchBar from '@/components/chats/ChatSearchBar';
import ChatListItem from '@/components/chats/ChatListItem';
import ChatListSkeleton from '@/components/chats/ChatListSkeleton';
import NewChatModal from '@/components/NewChatModal';

// Assuming IChat and other types are defined elsewhere or will be added.
// For now, using 'any' for types not explicitly defined in the provided context.
interface IChat {
  _id: string;
  isGroupChat: boolean;
  chatName?: string;
  users: any[];
  latestMessage?: {
    _id: string;
    sender: any;
    content?: string;
    mediaUrl?: string;
    createdAt: string;
  };
  unreadCounts?: { [key: string]: number };
}

type SidebarProps = {
  /** When list is shown in a mobile overlay, run after a chat row is chosen (including new DM). */
  onPickChat?: () => void;
};

export default function Sidebar({ onPickChat }: SidebarProps) {
  const pathname = usePathname();
  const { user, mounted } = useProtectedRoute();
  const { chats, setChats, setSelectedChat, selectedChat } = useChatStore();
  const { hiddenContactIds, init: initHiddenContacts, unhideContact } = useHiddenContactsStore();
  const { socket, onlineUsers } = useSocket();
  const [search, setSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const isMdUp = useBreakpoint('md');
  const isMobile = !isMdUp;

  useEffect(() => {
    if (user?._id) initHiddenContacts(user._id);
  }, [user?._id, initHiddenContacts]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoadingChats(true);
        // Fetch chats
        const chatRes = await api.get('/chat');
        setChats(Array.isArray(chatRes.data) ? chatRes.data : []);
        
        // Fetch all users (contacts)
        const userRes = await api.get('/users');
        const rawContacts = Array.isArray(userRes.data) ? userRes.data : [];
        const cleanedContacts = rawContacts.filter((c) => {
          if (!c || !c._id) return false;
          const hasName = typeof c.name === 'string' && c.name.trim().length > 0;
          const hasEmail = typeof c.email === 'string' && c.email.trim().length > 0;
          return hasName || hasEmail;
        });
        setContacts(cleanedContacts);
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      } finally {
        setLoadingChats(false);
      }
    };
    if (user) fetchInitialData();
  }, [user, setChats]);

  // Listen for socket events related to new users
  useEffect(() => {
    if (!socket) return;

    socket.on('new user registered', (newUser: any) => {
      const hasName = typeof newUser?.name === 'string' && newUser.name.trim().length > 0;
      const hasEmail = typeof newUser?.email === 'string' && newUser.email.trim().length > 0;
      if (!newUser?._id || (!hasName && !hasEmail)) return;
      setContacts((prev) => [newUser, ...prev.filter(c => c._id !== newUser._id)]);
    });

    return () => {
      socket.off('new user registered');
    };
  }, [socket]);

  // Search logic simplified -> we just filter `allItems` in the render map no need to hold searchResults

  const accessChat = async (userId: string) => {
    try {
      const { data } = await api.post('/chat', { userId });
      setChats((prev) => (prev.find((c) => c._id === data._id) ? prev : [data, ...prev]));
      setSelectedChat(data);
      setSearch(''); // Clear search on access
      onPickChat?.();
    } catch (error) {
        console.error('Error fetching chat');
    }
  };

  const openChat = async (chat: any) => {
    setSelectedChat(chat);
    onPickChat?.();
    if (user && chat.unreadCounts && chat.unreadCounts[user._id as string] > 0) {
       // Optimistically clear the unread count
       const updatedChats = chats.map((c) => {
         if (c._id === chat._id) {
            const safeUnreadCounts = c.unreadCounts || {};
            return {
               ...c,
               unreadCounts: { ...safeUnreadCounts, [user._id as string]: 0 }
            };
         }
         return c;
       });
       setChats(updatedChats);
       
       // Inform server
       try {
         await api.put(`/chat/${chat._id}/read`);
       } catch (error) {
         console.error('Failed to mark chat as read');
       }
    }
  };

  const getSenderInfo = (loggedUser: any, users: any[]) => {
    return users[0]?._id === loggedUser?._id ? users[1] : users[0];
  };

  // Chats list only (contacts are shown in the "+" modal)
  const filteredItems = useMemo(() => {
    if (!user) return [];
    const hiddenSet = new Set(hiddenContactIds);
    return chats.filter((item) => {
      if (!item) return false;
      if (item.isGroupChat) {
        const groupName = (item.chatName || '').toString().toLowerCase();
        return groupName.includes(search.toLowerCase());
      }
      const other = item.users ? getSenderInfo(user, item.users) : null;
      if (!other?._id) return false;
      if (hiddenSet.has(other._id)) return false;
      const hasName = typeof other?.name === 'string' && other.name.trim().length > 0;
      const hasEmail = typeof other?.email === 'string' && other.email.trim().length > 0;
      if (!hasName && !hasEmail) return false;
      const name = (other?.name || '').toString().toLowerCase();
      const email = (other?.email || '').toString().toLowerCase();
      const q = search.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [chats, hiddenContactIds, search, user]);

  const availableContacts = useMemo(() => {
    if (!user) return [];
    const chatUserIds = new Set(
      chats
        .filter((c) => !c.isGroupChat)
        .map((c) => getSenderInfo(user, c.users)?._id)
        .filter(Boolean)
    );
    const cleaned = contacts.filter((c) => {
      if (!c || !c._id || c._id === user._id) return false;
      const hasName = typeof c.name === 'string' && c.name.trim().length > 0;
      const hasEmail = typeof c.email === 'string' && c.email.trim().length > 0;
      return hasName || hasEmail;
    });
    return cleaned.filter((c) => hiddenContactIds.includes(c._id) || !chatUserIds.has(c._id));
  }, [contacts, chats, hiddenContactIds, user]);

  if (!mounted || !user) return null;
  const loading = loadingChats; // Use loadingChats for the skeleton state

  return (
    <>
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col transition-colors duration-300">
        <div className="h-16 flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/50">
          <h2 className="font-bold text-xl text-foreground tracking-tight">Chats</h2>
          <button
            onClick={() => setIsNewChatOpen(true)}
            className="p-2.5 bg-primary text-white hover:bg-primary-hover rounded-2xl transition-all shadow-lg shadow-primary/25"
            aria-label="Start new chat"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

      {/* Search Input */}
      {(pathname === '/' || pathname === '') && (
        <ChatSearchBar search={search} onSearchChange={setSearch} />
      )}

      {/* Chat List */}
      <div className="scrollbar-none flex-1 overflow-y-auto overscroll-y-contain bg-background/60 transition-colors duration-300">
        {(pathname === '/' || pathname === '') && (
        <AnimatePresence>
          {!loading ? (
            <div className="px-3 pb-4 space-y-1">
              {filteredItems.map((item, i) => {
                const isSelected = selectedChat?._id === item._id;

                return (
                  <ChatListItem
                    key={item._id}
                    item={item}
                    user={user}
                    isSelected={isSelected}
                    isChat={true}
                    index={i}
                    onlineUsers={onlineUsers}
                    isMobile={isMobile}
                    onClick={() => openChat(item)}
                  />
                );
              })}
            </div>
          ) : (
            <ChatListSkeleton />
          )}
        </AnimatePresence>
        )}
      </div>


      </div>

      {isNewChatOpen && (
        <NewChatModal
          isOpen={isNewChatOpen}
          onClose={() => setIsNewChatOpen(false)}
          contacts={availableContacts}
          currentUserId={user._id}
          onlineUsers={onlineUsers}
          onSelect={async (contactId) => {
            unhideContact(contactId);
            await accessChat(contactId);
            setIsNewChatOpen(false);
          }}
        />
      )}
    </>
  );
}
