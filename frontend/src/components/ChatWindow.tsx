'use client';

import React, { useState, useEffect, useRef, useTransition, useCallback, useMemo } from 'react';
import { MoreVertical, Phone, Video, ArrowLeft, MessageSquare, Check, CheckCheck, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useHiddenContactsStore } from '@/store/useHiddenContactsStore';
import { useSocket } from '@/contexts/SocketContext';
import { useWebRTCStore } from '@/store/useWebRTCStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { compressImage } from '@/utils/imageCompression';
import { playMessageSound } from '@/utils/audioTones';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import NextImage from 'next/image';

const ChatComposer = dynamic(() => import('./ChatComposer'), {
  ssr: false,
  loading: () => <div className="h-[84px] md:h-[92px]" />
});
const ContactInfoModal = dynamic(() => import('./ContactInfoModal'), { ssr: false });
const ConfirmModal = dynamic(() => import('./ConfirmModal'), { ssr: false });
const Image = NextImage;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type Reaction = { emoji: string; user: string | { _id?: string } };
type ChatUser = { _id: string; name?: string; avatar?: string; email?: string; about?: string };
type ChatMessage = {
  _id: string;
  sender: ChatUser;
  content?: string;
  chat: { _id: string };
  mediaUrl?: string | null;
  mediaType?: string | null;
  createdAt: string;
  status?: 'sent' | 'delivered' | 'read';
  reactions?: Reaction[];
  optimistic?: boolean;
};
type Chat = {
  _id: string;
  isGroupChat: boolean;
  chatName?: string;
  users: ChatUser[];
  latestMessage?: ChatMessage;
  unreadCounts?: Record<string, number>;
};
type IncomingMessage = ChatMessage & { chat: Chat; sender: ChatUser };

interface MessageBubbleProps {
  m: ChatMessage;
  isMe: boolean;
  isLastInGroup: boolean;
  isFirstInGroup: boolean;
  effectsReady: boolean;
  isMobile: boolean;
  selectedChat: Chat | null;
  pickerMsgId: string | null;
  setPickerMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  handleReact: (msgId: string, emoji: string) => void;
  handleDeleteMessage: (msgId: string) => void;
}


const MessageBubble = React.memo(function MessageBubble({
  m,
  isMe,
  isLastInGroup,
  isFirstInGroup,
  effectsReady,
  isMobile,
  selectedChat,
  pickerMsgId,
  setPickerMsgId,
  handleReact,
  handleDeleteMessage
}: MessageBubbleProps) {
  const borderRadiusClasses = isMe
    ? `rounded-[20px] ${!isFirstInGroup ? 'rounded-tr-[5px]' : ''} ${!isLastInGroup ? 'rounded-br-[5px]' : ''} ${isFirstInGroup && isLastInGroup ? 'rounded-tr-[5px]' : ''}`
    : `rounded-[20px] ${!isFirstInGroup ? 'rounded-tl-[5px]' : ''} ${!isLastInGroup ? 'rounded-bl-[5px]' : ''} ${isFirstInGroup && isLastInGroup ? 'rounded-tl-[5px]' : ''}`;

  const Wrapper: React.ElementType = !isMobile && effectsReady ? motion.div : 'div';
  const motionProps = !isMobile && effectsReady
    ? { initial: { opacity: 0, scale: 0.95, y: 10 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { type: 'spring', stiffness: 400, damping: 25 } }
    : {};

  return (
    <Wrapper
      {...motionProps}
      className={`flex flex-wrap ${isMe ? 'justify-end' : 'justify-start'} group w-full ${isLastInGroup ? 'mb-4' : 'mb-[2px]'}`}
    >
      {!isMe && selectedChat?.isGroupChat && isLastInGroup && (
        <div className="w-8 h-8 mr-2 self-end shadow-sm relative shrink-0">
          <Image
            src={m.sender.avatar || "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg"}
            alt="Sender"
            fill
            sizes="32px"
            className="rounded-full object-cover"
            unoptimized={m.sender.avatar ? m.sender.avatar.includes('localhost') : false}
            priority={isLastInGroup} // Preload the most visible sender images for LCP
          />
        </div>
      )}
      {!isMe && selectedChat?.isGroupChat && !isLastInGroup && (
        <div className="w-8 mr-2 h-8 pointer-events-none shrink-0"></div>
      )}

      <div className={`flex items-center gap-2 max-w-[85%] md:max-w-[70%] lg:max-w-[65%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>

        {/* Message Bubble */}
        <div className={`relative px-4 py-[10px] shadow-sm transition-all duration-200 ${borderRadiusClasses} ${isMe
          ? 'bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg shadow-primary/15'
          : 'bg-surface/90 text-foreground border border-border/50 shadow-sm'
          }`}>
          {m.mediaUrl && (
            <div className={`mb-2 rounded-xl overflow-hidden ${isMe ? 'bg-black/10' : 'bg-black/5'}`}>
              {m.mediaType === 'image' ? (
                <div className="relative w-full min-h-[200px] max-h-80 bg-muted/20 flex items-center justify-center overflow-hidden rounded-lg" style={{ aspectRatio: '4/3' }}>
                  <Image
                    src={resolveMediaUrl(m.mediaUrl)}
                    alt="Media"
                    fill
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="object-contain"
                    unoptimized
                    priority={isLastInGroup} // Attempt to improve LCP for recent media
                  />
                </div>
              ) : m.mediaType === 'video' ? (
                <video src={resolveMediaUrl(m.mediaUrl)} controls className="max-h-64 sm:max-h-80 w-full max-w-[420px] object-contain rounded-lg" preload="metadata" />
              ) : m.mediaType === 'audio' ? (
                <audio src={resolveMediaUrl(m.mediaUrl)} controls className="max-w-48 sm:max-w-xs mt-1" />
              ) : (
                <a href={resolveMediaUrl(m.mediaUrl)} target="_blank" className="underline overflow-hidden truncate block text-sm">Download Attachment</a>
              )}
            </div>
          )}

          {m.content && (
            <p className={`leading-relaxed break-words text-[15.5px] whitespace-pre-wrap ${m.content === '🚫 This message was deleted' ? 'italic opacity-80' : ''}`}>
              {m.content}
            </p>
          )}

          {/* Timestamp & Status */}
          <div className={`text-[11px] flex items-center gap-1.5 mt-1 select-none ${isMe ? 'text-white/80 justify-end' : 'text-muted justify-end'}`}>
            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {isMe && (
              <span className={m.status === 'read' ? 'text-white' : 'text-white/60'}>
                {m.status === 'read' ? <CheckCheck className="w-[14px] h-[14px]" /> : <Check className="w-[14px] h-[14px]" />}
              </span>
            )}
          </div>
        </div>

        {/* Hover Actions Menu and Reactions Render */}
        {m.content !== '🚫 This message was deleted' && (
          <div className={`relative opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ${pickerMsgId === m._id ? '!opacity-100' : ''}`}>
            <div className="relative">
              <button
                onClick={() => setPickerMsgId(pickerMsgId === m._id ? null : m._id)}
                className="p-1.5 text-muted hover:text-foreground hover:bg-surface-hover rounded-full transition-colors"
                title="Reaction"
                aria-label="Add reaction"
              >
                <div className="w-4 h-4 rounded-full bg-border/80 flex items-center justify-center text-[10px]">😀</div>
              </button>
              <AnimatePresence initial={false}>
                {pickerMsgId === m._id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPickerMsgId(null)}></div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className="absolute top-8 left-1/2 -translate-x-1/2 z-50 glass-panel rounded-full px-3 py-2 flex items-center gap-2"
                    >
                      {REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(m._id, emoji)}
                          className="text-xl hover:scale-125 transition-transform"
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {isMe && (
              <button
                onClick={() => handleDeleteMessage(m._id)}
                className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                title="Delete message"
                aria-label="Delete message"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Render Reactions Bottom of Bubble */}
      {(() => {
        if (!Array.isArray(m.reactions) || m.reactions.length === 0) return null;
        const counts: Record<string, number> = {};
        for (const r of m.reactions) {
          if (r && r.emoji) {
            counts[r.emoji] = (counts[r.emoji] || 0) + 1;
          }
        }
        const reactionEntries = Object.keys(counts).map(emoji => ({ emoji, count: counts[emoji] }));

        return (
          <div className={`w-full flex flex-wrap gap-1 -mt-2.5 mb-1 relative z-10 ${isMe ? 'justify-end mr-4' : 'justify-start ml-4'}`}>
            {reactionEntries.map(({ emoji, count }) => (
              <motion.div
                key={emoji}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-surface/95 backdrop-blur-sm border border-border/50 rounded-full px-2 py-0.5 shadow-md flex items-center gap-0.5 cursor-pointer hover:scale-110 transition-transform"
              >
                <span className="text-sm leading-none">{emoji}</span>
                {count > 1 && <span className="font-bold text-primary text-[10px] leading-none">{count}</span>}
              </motion.div>
            ))}
          </div>
        );
      })()}
    </Wrapper>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default function ChatWindow() {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger';
    onConfirm?: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
  });
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [media, setMedia] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSending, setIsSending] = useState(false);
  // Audio visualization
  const [audioData, setAudioData] = useState<number[]>(new Array(20).fill(0));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [effectsReady, setEffectsReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingTimeRef = useRef<number>(0);
  const isTypingRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const frameCountRef = useRef(0);
  // Always prefer the user's current browser origin for media (works on prod domains and mobile IPs).
  const mediaBase = useMemo(() => {
    const envHost = (process.env.NEXT_PUBLIC_FILE_HOST || process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api$/, '').replace(/\/$/, '');
    if (envHost) return envHost;
    if (typeof window !== 'undefined') {
      return window.location.origin.replace(/\/$/, '');
    }
    return 'http://localhost:5000';
  }, []);

  const resolveMediaUrl = useCallback((url?: string | null) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return `${mediaBase}${url.startsWith('/') ? url : `/${url}`}`;
  }, [mediaBase]);

  const { selectedChat, setSelectedChat, setChats } = useChatStore() as {
    selectedChat: Chat | null;
    setSelectedChat: (chat: Chat | null) => void;
    setChats: (updater: Chat[] | ((prev: Chat[]) => Chat[])) => void;
  };
  const { user } = useAuthStore() as { user: ChatUser | null };
  const { hideContact, init: initHiddenContacts } = useHiddenContactsStore();
  const { socket, onlineUsers } = useSocket();
  const { initiateCall } = useWebRTCStore() as {
    initiateCall: (user: ChatUser, type: 'audio' | 'video') => void;
  };

  const getSenderInfo = (loggedUser: ChatUser | null, users: ChatUser[]) => {
    return users[0]?._id === loggedUser?._id ? users[1] : users[0];
  };

  const sender = selectedChat && !selectedChat.isGroupChat
    ? getSenderInfo(user, selectedChat.users)
    : null;

  const senderIsOnline = Boolean(sender?._id && onlineUsers.includes(sender._id));

  useEffect(() => {
    if (user?._id) initHiddenContacts(user._id);
  }, [user?._id, initHiddenContacts]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener?.('change', update);
    }
    // Safari < 14
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setEffectsReady(true);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(enable, { timeout: 1500 });
      return () => {
        cancelled = true;
        (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
      };
    }

    const timeoutId = setTimeout(enable, 800);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  // Fetch Messages
  const fetchMessages = useCallback(async () => {
    if (!selectedChat) return;
    try {
      const response = await api.get(`/message/${selectedChat._id}`);
      const data = response.data as { items?: ChatMessage[]; cursor?: string | null; hasMore?: boolean } | ChatMessage[];
      const items = Array.isArray(data) ? data : data.items;
      setMessages(items || []);
      setCursor((!Array.isArray(data) && data.cursor) ? data.cursor : null);
      setHasMore(Boolean(!Array.isArray(data) && data.hasMore));
      socket?.emit('join chat', selectedChat._id);
    } catch (error) {
      console.error('Failed to load messages', error);
    }
  }, [selectedChat, socket]);

  useEffect(() => {
    setCursor(null);
    setHasMore(false);
    setMessages([]);
    startTransition(() => {
      fetchMessages();
    });
  }, [selectedChat, fetchMessages, startTransition]);

  // Socket setup
  useEffect(() => {
    if (!socket) return;
    socket.on('message received', (newMessageReceived: IncomingMessage) => {
      const isUnread = !selectedChat || selectedChat._id !== newMessageReceived.chat._id;

      // Update global chats list to move chat to top and adjust unread count/latest message
      setChats((prevChats) => {
        const updatedChats = prevChats.map((c) => {
          if (c._id === newMessageReceived.chat._id) {
            const safeUnreadCounts = c.unreadCounts || {};
            const currentCount = safeUnreadCounts[user?._id as string] || 0;
            return {
              ...c,
              latestMessage: newMessageReceived,
              unreadCounts: {
                ...safeUnreadCounts,
                [user?._id as string]: isUnread ? currentCount + 1 : currentCount
              }
            };
          }
          return c;
        });

        const targetChat = updatedChats.find(c => c._id === newMessageReceived.chat._id);
        if (targetChat) {
          return [targetChat, ...updatedChats.filter(c => c._id !== targetChat._id)];
        }
        return updatedChats;
      });

      if (useSettingsStore.getState().soundEnabled) {
        playMessageSound();
      }

      if (isUnread) {
        // push notification or visual alert logic here if needed
      } else {
        setMessages((prev) => [...prev, newMessageReceived]);
        // Instantly mark as read if we are viewing the chat
        api.put(`/chat/${selectedChat._id}/read`).catch(console.error);
      }
    });

    socket.on('typing', () => setIsTyping(true));
    socket.on('stop typing', () => setIsTyping(false));

    socket.on('messages read', () => {
      setMessages((prev) => prev.map(m =>
        m.status !== 'read' ? { ...m, status: 'read' } : m
      ));
    });

    socket.on('message deleted', (deletedId: string) => {
      setMessages((prev) => prev.map(m =>
        m._id === deletedId ? { ...m, content: '🚫 This message was deleted', mediaUrl: null, mediaType: null, reactions: [] } : m
      ));
    });

    socket.on('message reacted', ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) => {
      setMessages((prev) => prev.map(m =>
        m._id === messageId ? { ...m, reactions } : m
      ));
    });

    socket.on('chat deleted', (chatId: string) => {
      if (selectedChat?._id === chatId) {
        setSelectedChat(null);
      }
      setChats((prev) => prev.filter((c) => c._id !== chatId));
    });

    socket.on('chat cleared', (chatId: string) => {
      if (selectedChat?._id === chatId) {
        setMessages([]);
      }
      setChats((prev) => prev.map((c) => (
        c._id === chatId ? { ...c, latestMessage: undefined, unreadCounts: { ...(c.unreadCounts || {}), [user?._id as string]: 0 } } : c
      )));
    });

    return () => {
      socket.off('message received');
      socket.off('typing');
      socket.off('stop typing');
      socket.off('messages read');
      socket.off('message deleted');
      socket.off('message reacted');
      socket.off('chat cleared');
    }
  }, [socket, selectedChat, setChats, user, setSelectedChat]);

  const toggleReactionLocal = useCallback((prev: ChatMessage[], msgId: string, emoji: string) => {
    return prev.map((m) => {
      if (m._id !== msgId) return m;
      const reactions = Array.isArray(m.reactions) ? [...m.reactions] : [];
      const existingIndex = reactions.findIndex((r) => {
        const userId = typeof r.user === 'string' ? r.user : r.user?._id;
        return userId === user?._id && r.emoji === emoji;
      });
      if (existingIndex > -1) {
        reactions.splice(existingIndex, 1);
      } else {
        reactions.push({ emoji, user: user?._id || '' });
      }
      return { ...m, reactions };
    });
  }, [user?._id]);

  const handleReact = useCallback(async (msgId: string, emoji: string) => {
    if (!msgId || !emoji || !user?._id) return;

    // Optimistic update so the UI responds instantly
    setMessages((prev) => toggleReactionLocal(prev, msgId, emoji));
    setPickerMsgId(null);

    try {
      await api.put(`/message/${msgId}/react`, { emoji });
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      console.error('Failed to react to message', apiError?.response?.data || err);
      // Revert optimistic change on failure
      setMessages((prev) => toggleReactionLocal(prev, msgId, emoji));
      alert(apiError?.response?.data?.message || 'Could not add reaction');
    }
  }, [user?._id, toggleReactionLocal]);

  const handleDeleteMessage = useCallback(async (msgId: string) => {
    try {
      await api.delete(`/message/${msgId}`);
      // Optimistically update
      setMessages((prev) => prev.map(m =>
        m._id === msgId ? { ...m, content: '🚫 This message was deleted', mediaUrl: null, mediaType: null } : m
      ));
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  }, []);

  const openConfirm = useCallback((options: {
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void | Promise<void>;
  }) => {
    setConfirmState({
      isOpen: true,
      title: options.title,
      description: options.description,
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      variant: options.variant,
      onConfirm: options.onConfirm
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleConfirm = useCallback(async () => {
    const action = confirmState.onConfirm;
    closeConfirm();
    if (action) {
      await action();
    }
  }, [confirmState.onConfirm, closeConfirm]);

  const handleRemoveFromSidebar = () => {
    if (!selectedChat || selectedChat.isGroupChat) return;
    if (!sender?._id) return;

    const chatId = selectedChat._id;
    const senderId = sender._id;
    openConfirm({
      title: 'Remove from sidebar?',
      description: 'You can add this chat back later from the + button.',
      confirmText: 'Remove',
      variant: 'danger',
      onConfirm: () => {
        hideContact(senderId);
        setSelectedChat(null);
        setChats((prev) => prev.filter((c) => c._id !== chatId));
        setIsMenuOpen(false);
      }
    });
  };

  const handleDeleteChat = async () => {
    if (!selectedChat) return;
    const chatId = selectedChat._id;
    openConfirm({
      title: 'Delete this chat?',
      description: 'This will remove all messages for you.',
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/chat/${chatId}`);

          // Update local state
          setSelectedChat(null);
          setChats((prev) => prev.filter((c) => c._id !== chatId));

          setIsMenuOpen(false);
        } catch (err) {
          console.error('Failed to delete chat', err);
          alert('Failed to delete chat');
        }
      }
    });
  };

  const handleClearChat = () => {
    if (!selectedChat) return;
    const chatId = selectedChat._id;
    openConfirm({
      title: 'Clear chat history?',
      description: 'This will permanently delete all messages in this chat for everyone.',
      confirmText: 'Clear',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/message/chat/${chatId}`);
          setMessages([]);
          setChats((prev) => prev.map((c) => (
            c._id === chatId ? { ...c, latestMessage: undefined, unreadCounts: { ...(c.unreadCounts || {}), [user?._id as string]: 0 } } : c
          )));
          setIsMenuOpen(false);
        } catch (err) {
          console.error('Failed to clear chat', err);
          alert('Failed to clear chat');
        }
      }
    });
  };

  const loadOlderMessages = useCallback(async () => {
    if (!selectedChat || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const { data } = await api.get(`/message/${selectedChat._id}`, {
        params: { before: cursor, limit: 50 },
      });
      const items = Array.isArray(data) ? data : data.items;
      if (items?.length) {
        setMessages((prev) => [...items, ...prev]);
        setCursor(data?.cursor || null);
        setHasMore(Boolean(data?.hasMore));
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load older messages', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [selectedChat, isLoadingMore, hasMore, cursor]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && messages.length) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages.length]);

  // Infinite scroll: load older messages when user scrolls to top
  useEffect(() => {
    if (!topSentinelRef.current || !messagesContainerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadOlderMessages();
        }
      },
      { root: messagesContainerRef.current, threshold: 0.1 }
    );
    observer.observe(topSentinelRef.current);
    return () => observer.disconnect();
  }, [loadOlderMessages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    const trimmed = message.trim();
    if ((!trimmed && !media) || !selectedChat) return;

    if (!user) return;

    setIsSending(true);

    // Optimistic render for text-only messages to improve perceived speed on mobile
    const tempId = `temp-${Date.now()}`;
    let optimisticMessage: ChatMessage | null = null;
    if (!media && trimmed) {
      optimisticMessage = {
        _id: tempId,
        sender: user as ChatUser,
        content: trimmed,
        chat: { _id: selectedChat._id },
        createdAt: new Date().toISOString(),
        status: 'sent',
        reactions: [],
        optimistic: true,
      };
      setMessages((prev) => [...prev, optimisticMessage as ChatMessage]);
    }

    try {
      let data: ChatMessage;

      if (media) {
        const formData = new FormData();
        formData.append('media', media);
        formData.append('chatId', selectedChat._id);
        formData.append('content', trimmed);
        if (media.type.startsWith('image/')) formData.append('mediaType', 'image');
        if (media.type.startsWith('video/')) formData.append('mediaType', 'video');
        if (media.type.startsWith('audio/')) formData.append('mediaType', 'audio');

        const response = await api.post('/message', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        data = response.data;
      } else {
        const response = await api.post('/message', {
          content: trimmed,
          chatId: selectedChat._id,
        });
        data = response.data;
      }

      setMessage('');
      setMedia(null);
      setMediaPreview(null);

      socket?.emit('stop typing', selectedChat._id);
      socket?.emit('new message', data);
      setMessages((prev) => {
        if (optimisticMessage) {
          return prev.map((m) => (m._id === tempId ? data as ChatMessage : m));
        }
        return [...prev, data as ChatMessage];
      });
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      console.error('Failed to send message:', apiError.response?.data || apiError.message || apiError);
      if (optimisticMessage) {
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
      }
      alert(`Failed to send message: ${apiError.response?.data?.message || 'File might be too large or invalid'}`);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessages = () => {
    const visibleMessages = (!effectsReady && isMobile) ? messages.slice(-30) : messages;
    return visibleMessages.map((m, index) => {
      if (!m) return null;
      const isMe = m.sender._id === user?._id;
      const nextMessage = visibleMessages[index + 1];
      const prevMessage = visibleMessages[index - 1];
      const isLastInGroup = !nextMessage || nextMessage.sender._id !== m.sender._id;
      const isFirstInGroup = !prevMessage || prevMessage.sender._id !== m.sender._id;

      return (
        <div key={m._id} className="px-3 sm:px-4 md:px-6 cv-auto">
          <MessageBubble
            m={m}
            isMe={isMe}
            isLastInGroup={isLastInGroup}
            isFirstInGroup={isFirstInGroup}
            effectsReady={effectsReady}
            isMobile={isMobile}
            selectedChat={selectedChat}
            pickerMsgId={pickerMsgId}
            setPickerMsgId={setPickerMsgId}
            handleReact={handleReact}
            handleDeleteMessage={handleDeleteMessage}
          />
        </div>
      );
    });
  };

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        try {
          file = await compressImage(file);
        } catch (err) {
          console.error('Image compression failed', err);
        }
      }

      setMedia(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Set up Audio Analyser
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('AudioContext is not supported');
      }
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64; // Small size for just a few bars
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateData = () => {
        if (!isRecording) return;
        frameCountRef.current++;

        // Throttle React state updates to every 3 frames (~20fps) to improve INP/Main-thread performance
        if (frameCountRef.current % 3 === 0) {
          analyser.getByteFrequencyData(dataArray);
          const step = Math.floor(dataArray.length / 20);
          const sampled = Array.from({ length: 20 }, (_, i) => dataArray[i * step] || 0);
          setAudioData(sampled);
        }
        rafIdRef.current = requestAnimationFrame(updateData);
      };
      updateData();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `VoiceNote_${Date.now()}.webm`, { type: 'audio/webm' });
        setMedia(audioFile);
        setMediaPreview(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      setAudioData(new Array(20).fill(0));
    }
  };

  const typingHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMessage(value);

    if (!socket || !selectedChat) return;
    if (!value.trim()) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (isTypingRef.current) {
        socket.emit('stop typing', selectedChat._id);
        isTypingRef.current = false;
      }
      return;
    }

    if (!isTypingRef.current) {
      socket.emit('typing', selectedChat._id);
      isTypingRef.current = true;
    }

    lastTypingTimeRef.current = Date.now();
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      const timeDiff = Date.now() - lastTypingTimeRef.current;
      if (timeDiff >= 1500 && isTypingRef.current) {
        socket.emit('stop typing', selectedChat._id);
        isTypingRef.current = false;
      }
    }, 1600);
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (socket && selectedChat && isTypingRef.current) {
        socket.emit('stop typing', selectedChat._id);
        isTypingRef.current = false;
      }
    };
  }, [socket, selectedChat]);

  const startCall = (type: 'audio' | 'video') => {
    if (!sender || !socket) return;
    initiateCall(sender, type);
  };

  if (!selectedChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background border-l border-border/60 text-muted transition-colors duration-300">
        <div className="w-20 h-20 glass-panel rounded-full flex items-center justify-center mb-6">
          <MessageSquare className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-2xl font-semibold text-foreground mb-2">Select a Chat</h3>
        <p className="text-sm max-w-sm text-center">Choose a conversation from the sidebar to start messaging or search for new contacts.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-background relative overflow-hidden transition-colors duration-300">

      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

      {/* Chat Header */}
      <div className={`h-16 border-b border-border/60 flex flex-shrink-0 items-center justify-between px-4 sm:px-6 bg-surface/90 ${effectsReady && !isMobile ? 'backdrop-blur-xl' : ''} z-20 w-full transition-colors duration-300 shadow-sm`}>
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            className="md:hidden text-muted hover:text-foreground p-2 -ml-2 rounded-full hover:bg-surface-hover transition-colors"
            onClick={() => setSelectedChat(null)}
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="relative group cursor-pointer w-11 h-11 shrink-0 rounded-full overflow-hidden shadow-sm ring-2 ring-transparent group-hover:ring-primary/50 transition-all duration-300">
            <motion.div layoutId={`avatar-${sender?._id}`} className="w-full h-full relative">
              <Image
                src={sender?.avatar || 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg'}
                alt="User"
                width={44}
                height={44}
                className="object-cover"
                unoptimized={sender?.avatar ? sender.avatar.includes('localhost') : false}
                priority // Explicitly preload the header avatar for instant LCP scoring
              />
            </motion.div>

          </div>
          <div
            className="flex flex-col cursor-pointer hover:bg-surface-hover/50 rounded-xl px-2 py-1 transition-colors min-w-0"
            onClick={() => setIsContactInfoOpen(true)}
          >
            <h3 className="font-bold text-[17px] text-foreground tracking-tight flex items-center gap-2 truncate">
              {selectedChat.isGroupChat ? selectedChat.chatName : sender?.name}
            </h3>
            <p className="text-[13px] font-medium text-muted truncate">
              {senderIsOnline ? (
                <span className="text-primary flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  Online
                </span>
              ) : 'Tap for info'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-muted shrink-0">
          <button onClick={() => startCall('video')} aria-label="Start video call" className="p-2.5 rounded-2xl hover:bg-surface-hover hover:text-primary transition-all shadow-sm"><Video className="w-5 h-5" /></button>
          <button onClick={() => startCall('audio')} aria-label="Start audio call" className="p-2.5 rounded-2xl hover:bg-surface-hover hover:text-primary transition-all shadow-sm"><Phone className="w-5 h-5" /></button>
          <div className="w-[1px] h-6 bg-border/50 mx-1"></div>

          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`p-2.5 rounded-2xl transition-all shadow-sm ${isMenuOpen ? 'bg-surface-hover text-foreground' : 'hover:bg-surface-hover hover:text-foreground'}`}
              aria-label="Open chat menu"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            <AnimatePresence initial={false}>
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 top-12 mt-2 w-48 bg-surface border border-border/50 rounded-2xl shadow-xl z-50 overflow-hidden py-2"
                  >
                    <button
                      onClick={() => { setIsContactInfoOpen(true); setIsMenuOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors font-medium"
                    >
                      Contact Info
                    </button>
                    <button onClick={handleClearChat} className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors font-medium">
                      Clear Chat
                    </button>
                    {selectedChat?.isGroupChat ? (
                      <button onClick={handleDeleteChat} className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-colors font-medium mt-1 border-t border-border/50">
                        Delete Chat
                      </button>
                    ) : (
                      <button onClick={handleRemoveFromSidebar} className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-colors font-medium mt-1 border-t border-border/50">
                        Remove From Sidebar
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto w-full relative z-10 flex flex-col pt-4 contain-paint min-h-0">
        {isPending ? (
          <div className="space-y-4 px-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <Skeleton className={`h-12 w-${i % 2 === 0 ? '2/3' : '1/2'} rounded-2xl opacity-40`} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Sentinel for infinite scroll */}
            <div ref={topSentinelRef} className="h-1 shrink-0" />
            {renderMessages()}
            <div ref={messagesEndRef} className="h-1 shrink-0" />
          </>
        )}

        {isTyping && (
          <div className="flex justify-start px-4 py-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface border border-border/50 text-muted rounded-[20px] rounded-tl-[4px] px-4 py-3 shadow-sm flex gap-1.5 items-center h-[42px]"
            >
              <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-2 h-2 rounded-full bg-muted/60"></motion.span>
              <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-2 h-2 rounded-full bg-muted/60"></motion.span>
              <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-2 h-2 rounded-full bg-muted/60"></motion.span>
            </motion.div>
          </div>
        )}

        {hasMore && isLoadingMore && (
          <div className="text-center text-xs text-muted pb-2">Loading older messages…</div>
        )}
      </div>

      {/* Media Preview Area */}
      {mediaPreview && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-surface/50 backdrop-blur-md border-t border-border relative z-20 flex items-center gap-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]"
        >
          <div className="relative group">
            {media?.type.startsWith('audio/') ? (
              <audio src={mediaPreview} controls className="h-14 rounded-xl border border-border w-64 shadow-sm" />
            ) : media?.type.startsWith('video/') ? (
              <video src={mediaPreview} className="h-24 rounded-xl border border-border object-cover bg-black shadow-sm" />
            ) : (
              <Image
                src={mediaPreview}
                alt="Preview"
                width={96}
                height={96}
                className="h-24 w-24 rounded-xl border border-border object-cover shadow-sm"
                unoptimized
              />
            )}
            <button
              className="absolute -top-3 -right-3 bg-red-500/90 backdrop-blur-sm rounded-full p-1.5 text-white hover:bg-red-500 hover:scale-110 transition-all shadow-lg border border-white/20 z-10"
              onClick={() => {
                setMedia(null);
                setMediaPreview(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              <ArrowLeft className="w-4 h-4 rotate-45" /> {/* X */}
            </button>
          </div>
          <div className="flex-1 text-sm text-foreground">
            <p className="font-medium truncate max-w-xs">{media?.name}</p>
            <p className="text-xs text-muted mt-0.5">
              {media?.size ? `${(media.size / 1024 / 1024).toFixed(2)} MB` : '0.00 MB'}
            </p>
          </div>
        </motion.div>
      )}

      {/* Input Area */}
      <div className="min-h-[84px] md:min-h-[92px]">
        <ChatComposer
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
          handleMediaChange={handleMediaChange}
          media={media}
          isRecording={isRecording}
          startRecording={startRecording}
          stopRecording={stopRecording}
        recordingTime={recordingTime}
        audioData={audioData}
        fileInputRef={fileInputRef}
        typingHandler={typingHandler}
        effectsReady={effectsReady}
        isSending={isSending}
      />
      </div>

      {isContactInfoOpen && (
        <ContactInfoModal
          isOpen={isContactInfoOpen}
          onClose={() => setIsContactInfoOpen(false)}
          contact={
            selectedChat?.isGroupChat || !sender
              ? null
              : { ...sender, isOnline: senderIsOnline, status: senderIsOnline ? 'online' : 'offline' }
          }
        />
      )}

      {confirmState.isOpen && (
        <ConfirmModal
          isOpen={confirmState.isOpen}
          title={confirmState.title}
          description={confirmState.description}
          confirmText={confirmState.confirmText}
          cancelText={confirmState.cancelText}
          variant={confirmState.variant}
          onConfirm={handleConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}




