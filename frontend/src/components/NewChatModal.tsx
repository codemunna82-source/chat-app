'use client';

import { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: any[];
  currentUserId: string;
  onlineUsers: string[];
  onSelect: (contactId: string) => void;
}

export default function NewChatModal({
  isOpen,
  onClose,
  contacts,
  currentUserId,
  onlineUsers,
  onSelect,
}: NewChatModalProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return contacts
      .filter((c) => c && c._id && c._id !== currentUserId)
      .filter((c) => {
        const hasName = typeof c.name === 'string' && c.name.trim().length > 0;
        const hasEmail = typeof c.email === 'string' && c.email.trim().length > 0;
        return hasName || hasEmail;
      })
      .filter((c) => {
        if (!normalized) return true;
        const name = (c.name || '').toString().toLowerCase();
        const email = (c.email || '').toString().toLowerCase();
        return name.includes(normalized) || email.includes(normalized);
      });
  }, [contacts, currentUserId, search]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-surface border border-border/50 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="text-lg font-semibold text-foreground">Start New Chat</h3>
              <button
                onClick={onClose}
                className="p-2 bg-surface-hover text-muted rounded-full hover:text-foreground hover:bg-surface-hover/80 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="flex items-center gap-2 bg-surface-hover/80 border border-border/50 rounded-2xl px-3 py-2">
                <Search className="w-4 h-4 text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="w-full bg-transparent outline-none text-sm text-foreground placeholder:text-muted"
                />
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto px-2 pb-4">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted">No profiles found.</div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((c) => {
                    const isOnline = onlineUsers.includes(c._id);
                    return (
                      <button
                        key={c._id}
                        onClick={() => onSelect(c._id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-surface-hover/80 transition-colors"
                      >
                        <div className="relative h-10 w-10 shrink-0">
                          <UserAvatar src={c.avatar} name={c.name || c.email} variant="md" className="h-10 w-10" sizes="40px" />
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-surface rounded-full"></span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-medium text-foreground truncate">{c.name || 'No name'}</div>
                          <div className="text-xs text-muted truncate">{c.email || 'No email'}</div>
                        </div>
                        {isOnline && (
                          <span className="text-[10px] font-semibold text-primary">Online</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
