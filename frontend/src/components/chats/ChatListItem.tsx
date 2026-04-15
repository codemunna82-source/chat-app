'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface ChatListItemProps {
  item: any;
  user: any;
  isSelected: boolean;
  isChat: boolean;
  index: number;
  onClick: () => void;
  onlineUsers: string[];
  isMobile: boolean;
}

const ChatListItem = React.memo(function ChatListItem({ item, user, isSelected, isChat, index, onClick, onlineUsers, isMobile }: ChatListItemProps) {
  const otherUser = isChat
    ? item.users?.find((u: any) => u._id !== user?._id)
    : item;

  const isOnline = Boolean(otherUser?._id && onlineUsers.includes(otherUser._id));

  const unreadCount = isChat && item.unreadCounts && user?._id
    ? (item.unreadCounts[user._id] || 0)
    : 0;

  const hasName = typeof otherUser?.name === 'string' && otherUser.name.trim().length > 0;
  const hasEmail = typeof otherUser?.email === 'string' && otherUser.email.trim().length > 0;
  if (!otherUser?._id || (!hasName && !hasEmail)) return null;

  const Wrapper: React.ElementType = isMobile ? 'div' : motion.div;
  const motionProps = isMobile
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95 },
        transition: { duration: 0.2, delay: index * 0.01, ease: 'easeOut' },
      };

  return (
    <Wrapper
      {...motionProps}
      onClick={onClick}
      className={`relative flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-300 group cv-auto border border-transparent
        ${isSelected ? 'bg-primary/10 shadow-md border-primary/20' : 'hover:bg-surface-hover/80 hover:border-border/60'}
      `}
    >
      {/* Active Indicator Line */}
      {isSelected && (
        <motion.div
          layoutId="activeChatIndicator"
          className="absolute left-0 top-[10%] bottom-[10%] w-1 bg-primary rounded-r-full"
        />
      )}

      <div className="relative h-12 w-12 flex-shrink-0">
        <UserAvatar
          src={otherUser?.avatar}
          name={otherUser?.name || otherUser?.email}
          variant="md"
          className={`h-12 w-12 shadow-sm transition-transform duration-300 ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'group-hover:scale-105'}`}
          sizes="48px"
        />
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full shadow-sm"></span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex justify-between items-center mb-0.5">
          <h3 className={`font-semibold truncate transition-colors ${isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'} ${unreadCount > 0 ? 'font-bold' : ''}`}>
            {otherUser?.name}
          </h3>
          {isChat && item.latestMessage?.createdAt && (
            <span className={`text-[11px] font-medium whitespace-nowrap ml-2 ${unreadCount > 0 ? 'text-primary' : 'text-muted'}`}>
              {new Date(item.latestMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex justify-between gap-2 items-center">
          <p className={`text-sm truncate pr-2 ${unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted/80'}`}>
            {isChat && item.latestMessage
              ? (item.latestMessage.sender === user?._id ? `You: ${item.latestMessage.content}` : item.latestMessage.content)
              : item.email}
          </p>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-sm flex-shrink-0"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </div>
      </div>
    </Wrapper>
  );
});

export default ChatListItem;
