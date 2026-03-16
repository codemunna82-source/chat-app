'use client';

import React from 'react';
import { Phone, Video, ArrowUpRight, ArrowDownLeft, Clock, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface CallHistoryItemProps {
  call: any;
  userId: string;
  index: number;
  onCall: (user: any, type: 'audio' | 'video') => void;
  onDelete: (id: string) => void;
}

const CallHistoryItem = React.memo(function CallHistoryItem({ call, userId, index, onCall, onDelete }: CallHistoryItemProps) {
  const isMeCaller = call.caller._id === userId;
  const otherUser = isMeCaller ? call.receiver : call.caller;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03, ease: 'easeOut' }}
      className="flex items-center justify-between bg-surface/90 p-4 rounded-2xl border border-border/50 hover:bg-surface-hover/80 transition-all duration-300 group shadow-sm"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 relative shrink-0">
          <Image
            src={otherUser?.avatar || 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg'}
            alt={otherUser?.name || 'Caller'}
            fill
            sizes="48px"
            className="rounded-full object-cover shadow-sm group-hover:scale-105 transition-transform duration-300"
            unoptimized={otherUser?.avatar?.includes('localhost')}
          />
        </div>
        <div>
          <h3 className={`font-semibold text-base transition-colors ${call.status === 'missed' && !isMeCaller ? 'text-red-400' : 'text-foreground group-hover:text-primary'}`}>
            {otherUser?.name}
          </h3>
          <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
            {isMeCaller ? (
              <ArrowUpRight className={`w-3.5 h-3.5 ${call.status === 'accepted' ? 'text-primary' : 'text-muted'}`} />
            ) : (
              <ArrowDownLeft className={`w-3.5 h-3.5 ${call.status === 'missed' ? 'text-red-500' : 'text-primary'}`} />
            )}
            <span className={`font-medium ${call.status === 'missed' && !isMeCaller ? 'text-red-400' : ''}`}>
              {call.status === 'missed' ? 'Missed' : call.status === 'rejected' ? 'Rejected' : 'Accepted'}
            </span>
            <span className="text-border">•</span>
            {call.callType === 'video' ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
            <span className="text-border">•</span>
            <span>{new Date(call.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {call.duration > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted bg-surface-hover/60 px-2.5 py-1 rounded-full">
            <Clock className="w-3 h-3" />
            {Math.floor(call.duration / 60)}:{(call.duration % 60).toString().padStart(2, '0')}
          </div>
        )}
        <button
          onClick={() => onDelete(call._id)}
          className="p-2.5 rounded-xl text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
          aria-label="Delete call history item"
          title="Delete call history item"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onCall(otherUser, call.callType)}
          className="p-3 rounded-xl bg-surface-hover/80 hover:bg-primary/10 hover:text-primary text-muted transition-all duration-300 shadow-sm border border-transparent hover:border-primary/20"
          aria-label={`Call ${otherUser?.name}`}
        >
          {call.callType === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
        </button>
      </div>
    </motion.div>
  );
});

export default CallHistoryItem;
