'use client';

import { X, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';

interface StatusUploadModalProps {
  isOpen: boolean;
  media: File | null;
  mediaPreview: string | null;
  caption: string;
  isUploading: boolean;
  onCaptionChange: (value: string) => void;
  onUpload: () => void;
  onClose: () => void;
}

export default function StatusUploadModal({
  isOpen,
  media,
  mediaPreview,
  caption,
  isUploading,
  onCaptionChange,
  onUpload,
  onClose,
}: StatusUploadModalProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-xl flex items-center justify-center p-4">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="bg-surface rounded-[2rem] w-full max-w-md border border-border/50 shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-border/50">
            <h3 className="text-lg font-bold text-foreground">New Status</h3>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground transition-colors p-2 rounded-xl hover:bg-surface-hover"
              aria-label="Close upload modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 flex flex-col items-center">
            <div className="w-full max-h-64 flex justify-center bg-background rounded-2xl overflow-hidden border border-border/50 mb-4 shadow-inner">
              {media?.type.startsWith('video/') ? (
                <video src={mediaPreview!} controls className="max-h-64 object-contain" />
              ) : (
                <img src={mediaPreview!} className="max-h-64 object-contain" alt="Status preview" />
              )}
            </div>
            <Input
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Add a caption..."
              className="glass-input rounded-2xl h-12 text-foreground placeholder-muted border-none"
            />
          </div>
          <div className="p-5 border-t border-border/50 flex justify-end gap-3 bg-surface/50">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isUploading}
              className="rounded-xl text-muted hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary-hover text-white rounded-xl shadow-md hover:shadow-lg transition-all"
              onClick={onUpload}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Share Status'}{' '}
              <Upload className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
