import { create } from 'zustand';

interface Chat {
  _id: string;
  chatName: string;
  isGroupChat: boolean;
  users: any[];
  latestMessage: any;
  unreadCounts?: Record<string, number>;
}

interface ChatState {
  chats: Chat[];
  selectedChat: Chat | null;
  setChats: (chats: Chat[] | ((prev: Chat[]) => Chat[])) => void;
  setSelectedChat: (chat: Chat | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  selectedChat: null,
  setChats: (chats) => set((state) => ({ chats: typeof chats === 'function' ? chats(state.chats) : chats })),
  setSelectedChat: (chat) => set({ selectedChat: chat }),
}));
