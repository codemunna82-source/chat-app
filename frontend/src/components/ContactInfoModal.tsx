import { X, User as UserIcon, Mail, Calendar, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface ContactInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: any | null;
}

export default function ContactInfoModal({ isOpen, onClose, contact }: ContactInfoModalProps) {
  if (typeof document === 'undefined') return null;
  const isOnline = Boolean(contact?.isOnline ?? contact?.status === 'online');
  return createPortal(
    <AnimatePresence>
      {isOpen && contact && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-surface border border-border/50 rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header Area (Gradient) */}
            <div className="h-32 bg-gradient-to-br from-primary to-primary-hover relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 transition-colors backdrop-blur-md z-10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-8 pb-8 relative z-10">
              {/* Avatar Section */}
              <div className="relative -mt-16 mb-6 flex justify-center">
                <div className="relative h-32 w-32">
                  <UserAvatar
                    src={contact.avatar}
                    name={contact.name || contact.email}
                    variant="lg"
                    className="h-32 w-32 border-4 border-surface shadow-xl ring-1 ring-border/30"
                    sizes="128px"
                  />
                  {isOnline && (
                    <span className="absolute bottom-2 right-2 h-5 w-5 rounded-full border-4 border-surface bg-green-500 shadow-sm" aria-hidden />
                  )}
                </div>
              </div>

              {/* Contact Info Details */}
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">{contact.name}</h2>
                <p className="text-sm font-medium text-primary mt-1">
                  {isOnline ? 'Online' : 'Offline'}
                </p>
              </div>

              <div className="space-y-4">
                {/* About Section */}
                <div className="bg-surface-hover rounded-2xl p-4 border border-border/50 shadow-sm flex items-start gap-3">
                  <Info className="w-5 h-5 text-muted shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">About</h4>
                    <p className="text-[15px] font-medium text-foreground leading-relaxed">
                      {contact.about || 'Hey there! I am using this chat app.'}
                    </p>
                  </div>
                </div>

                {/* Email Section */}
                <div className="bg-surface-hover rounded-2xl p-4 border border-border/50 shadow-sm flex items-center gap-3">
                  <Mail className="w-5 h-5 text-muted shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-0.5">Email</h4>
                    <p className="text-[15px] font-medium text-foreground">{contact.email}</p>
                  </div>
                </div>

                {/* Joined Section */}
                <div className="bg-surface-hover rounded-2xl p-4 border border-border/50 shadow-sm flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-0.5">Joined</h4>
                    <p className="text-[15px] font-medium text-foreground">
                      {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Recently'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
