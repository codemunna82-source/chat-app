'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Info } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (typeof document === 'undefined') return null;

  const isDanger = variant === 'danger';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            className="relative w-full max-w-md bg-surface border border-border/50 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="px-8 pt-8 pb-6">
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${isDanger ? 'bg-red-500/15 text-red-500' : 'bg-primary/15 text-primary'}`}
                >
                  {isDanger ? <AlertTriangle className="w-6 h-6" /> : <Info className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                  {description && (
                    <p className="text-sm text-muted mt-1 leading-relaxed">{description}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                className="h-11 px-5 rounded-2xl border border-border/60 text-foreground hover:bg-surface-hover transition-colors font-medium"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className={`h-11 px-6 rounded-2xl text-white font-semibold shadow-md transition-all ${isDanger ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-primary hover:bg-primary-hover shadow-primary/30'}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
