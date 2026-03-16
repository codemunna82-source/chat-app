'use client';

import { PhoneCall } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import CallHistoryItem from './CallHistoryItem';

interface CallHistoryListProps {
  calls: any[];
  userId: string;
  onCall: (user: any, type: 'audio' | 'video') => void;
  onDelete: (id: string) => void;
}

export default function CallHistoryList({ calls, userId, onCall, onDelete }: CallHistoryListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full z-10">
      <div className="mb-6 px-2 text-muted flex items-center gap-3">
        <PhoneCall className="w-5 h-5 text-primary" />
        <p className="text-sm font-medium">Your voice and video calls will appear here.</p>
      </div>

      <div className="mb-6">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-widest mb-4 px-2">Recent</h4>

        <AnimatePresence>
          <div className="space-y-2">
            {calls.length > 0 ? (
              calls.map((c: any, index: number) => (
                <CallHistoryItem
                  key={c._id}
                  call={c}
                  userId={userId}
                  index={index}
                  onCall={onCall}
                  onDelete={onDelete}
                />
              ))
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner border border-border/50">
                  <PhoneCall className="w-8 h-8 text-muted/50" />
                </div>
                <p className="text-muted text-sm font-medium">No recent calls</p>
                <p className="text-muted/60 text-xs mt-1">Your call history will show up here</p>
              </div>
            )}
          </div>
        </AnimatePresence>
      </div>
    </div>
  );
}
