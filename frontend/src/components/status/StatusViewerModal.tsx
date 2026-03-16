import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import Image from 'next/image';
import { createPortal } from 'react-dom';

interface StatusViewerModalProps {
  isOpen: boolean;
  status: any | null;
  onClose: () => void;
}

export default function StatusViewerModal({
  isOpen,
  status,
  onClose
}: StatusViewerModalProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && status && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 20 }}
            className="relative w-full max-w-3xl bg-surface border border-border/50 rounded-3xl shadow-2xl overflow-hidden"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 h-9 w-9 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors flex items-center justify-center"
              aria-label="Close status viewer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="bg-background">
              {status.mediaType === 'image' ? (
                <img
                  src={`http://localhost:5000${status.mediaUrl}`}
                  className="w-full max-h-[70vh] object-contain bg-black"
                  alt={status.caption || 'Status'}
                />
              ) : (
                <video
                  src={`http://localhost:5000${status.mediaUrl}`}
                  className="w-full max-h-[70vh] object-contain bg-black"
                  controls
                  autoPlay
                />
              )}
            </div>

            <div className="p-5 flex items-center gap-3">
              <div className="w-9 h-9 relative shrink-0">
                <Image
                  src={status.user?.avatar || 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg'}
                  alt={status.user?.name || 'User'}
                  fill
                  sizes="36px"
                  className="rounded-full border border-border/50 object-cover"
                  unoptimized={status.user?.avatar?.includes('localhost')}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-semibold truncate">
                  {status.user?.name || 'Unknown'}
                </p>
                <p className="text-[11px] text-muted">{new Date(status.createdAt).toLocaleString()}</p>
              </div>
              {status.caption ? (
                <p className="text-sm text-foreground/90 text-right max-w-[50%] truncate">
                  {status.caption}
                </p>
              ) : null}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
