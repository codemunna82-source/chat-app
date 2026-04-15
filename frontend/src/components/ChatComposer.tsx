import { useState, useRef } from 'react';
import { Send, Image as ImageIcon, Paperclip, Mic, Square, Smile, FileText, Camera, MapPin, UserSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import dynamic from 'next/dynamic';

// The composer expects parent components to handle sending messages, rendering media previews, etc.
// This allows ChatWindow to manage state (like messages, socket events) while Composer handles the UI of input.

interface ChatComposerProps {
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  sendMessage: (e: React.FormEvent) => void;
  handleMediaChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  media: File | null;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  recordingTime: number;
  audioData: number[]; // For visualizer
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  typingHandler: (e: React.ChangeEvent<HTMLInputElement>) => void;
  effectsReady?: boolean;
  isSending?: boolean;
}

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

export default function ChatComposer({
  message,
  setMessage,
  sendMessage,
  handleMediaChange,
  media,
  isRecording,
  startRecording,
  stopRecording,
  recordingTime,
  audioData,
  fileInputRef,
  typingHandler,
  effectsReady = true,
  isSending = false
}: ChatComposerProps) {
  const reduceMotion = useReducedMotion();
  const [isFocused, setIsFocused] = useState(false);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendLocation = () => {
    setIsAttachmentOpen(false);
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setMessage(url);
      },
      (error) => {
        alert('Unable to retrieve your location');
        console.error(error);
      }
    );
  };

  const appendEmoji = (emoji: string) => {
    setMessage(message + emoji);
    setIsEmojiOpen(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const length = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(length, length);
    });
  };

  return (
    <div
      className={`p-3 sm:p-3 md:p-4 glass-panel rounded-none border-t border-border/50 z-20 w-full relative transition-colors duration-300 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-3 md:pb-4 ${effectsReady ? 'supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]' : ''}`}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleMediaChange}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
      />

      <form className="flex flex-wrap sm:flex-nowrap items-end gap-2 md:gap-3 max-w-5xl mx-auto w-full" onSubmit={sendMessage}>

        {/* Attachment Actions */}
        <AnimatePresence initial={false}>
          {!isRecording && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative flex items-center ml-1"
            >
              <button
                type="button"
                className={`text-muted hover:text-foreground p-2.5 rounded-2xl transition-all shadow-sm border border-transparent ${isAttachmentOpen ? 'bg-primary/10 text-primary border-primary/20' : 'bg-surface/80 hover:bg-surface-hover hover:border-border/50'}`}
                onClick={() => { setIsAttachmentOpen(!isAttachmentOpen); setIsEmojiOpen(false); }}
                title="Attach file"
                aria-label="Open attachments"
                aria-expanded={isAttachmentOpen}
                aria-controls="composer-attachments"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <AnimatePresence initial={false}>
                {isAttachmentOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsAttachmentOpen(false)}></div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      id="composer-attachments"
                      className="absolute bottom-14 left-0 w-[280px] glass-panel shadow-2xl rounded-[24px] p-4 z-50 overflow-hidden"
                    >
                      <div className="grid grid-cols-3 gap-y-6 gap-x-2 justify-items-center">
                        <button
                          type="button"
                          onClick={() => { fileInputRef.current?.click(); setIsAttachmentOpen(false); }}
                          className="flex flex-col items-center gap-2 group"
                          aria-label="Upload document"
                        >
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                            <FileText className="w-6 h-6" />
                          </div>
                          <span className="text-[11px] font-medium text-foreground">Document</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => { fileInputRef.current?.click(); setIsAttachmentOpen(false); }}
                          className="flex flex-col items-center gap-2 group"
                          aria-label="Upload from gallery"
                        >
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                          <span className="text-[11px] font-medium text-foreground">Gallery</span>
                        </button>

                        <button
                          type="button"
                          onClick={sendLocation}
                          className="flex flex-col items-center gap-2 group"
                          aria-label="Share location"
                        >
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                            <MapPin className="w-6 h-6" />
                          </div>
                          <span className="text-[11px] font-medium text-foreground">Location</span>
                        </button>

                        <button type="button" onClick={() => setIsAttachmentOpen(false)} className="flex flex-col items-center gap-2 group opacity-50 cursor-not-allowed" aria-disabled="true">
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white shadow-lg">
                            <UserSquare className="w-6 h-6" />
                          </div>
                          <span className="text-[11px] font-medium text-foreground">Contact</span>
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 relative">
          {isRecording ? (
            <motion.div
              initial={reduceMotion ? false : { scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative flex h-[52px] min-w-0 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.12] via-fuchsia-500/10 to-primary/[0.08] px-3 shadow-inner sm:gap-4 sm:px-4"
            >
              {/* Soft animated sheen */}
              {!reduceMotion ? (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/2 skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent dark:via-white/10"
                  animate={{ x: ['0%', '220%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
                />
              ) : null}

              <div className="relative z-[1] flex shrink-0 items-center gap-2.5 sm:gap-3">
                <span className="relative flex h-9 w-9 items-center justify-center">
                  {!reduceMotion ? (
                    <>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/35 opacity-75" />
                      <span className="absolute inline-flex h-[70%] w-[70%] animate-pulse rounded-full bg-red-500/50" />
                    </>
                  ) : null}
                  <span className="relative block h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.65)]" />
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums tracking-tight text-foreground sm:text-[15px]">
                  {Math.floor(recordingTime / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(recordingTime % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div
                className="relative z-[1] flex h-9 min-w-0 flex-1 items-end justify-end gap-[2px] overflow-hidden pl-1 sm:h-10 sm:gap-[3px]"
                aria-hidden
              >
                {audioData.map((val, i) => {
                  const h = Math.max(14, Math.round((val / 255) * 100));
                  return (
                    <div
                      key={i}
                      className="w-[2.5px] shrink-0 rounded-full bg-gradient-to-t from-primary/30 via-primary to-primary-hover/90 opacity-95 shadow-[0_0_6px_rgba(99,102,241,0.35)] transition-[height] duration-75 ease-out sm:w-[3px]"
                      style={{ height: `${h}%` }}
                    />
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <div className={`relative flex items-center transition-all duration-300 ${isFocused ? 'ring-2 ring-primary/30 rounded-2xl' : ''}`}>
              <button
                type="button"
                className="absolute left-3 text-muted hover:text-primary transition-colors"
                title="Emoji"
                aria-label="Open emoji picker"
                aria-expanded={isEmojiOpen}
                aria-controls="composer-emoji"
                onClick={() => { setIsEmojiOpen((v) => !v); setIsAttachmentOpen(false); }}
              >
                <Smile className="w-5 h-5" />
              </button>

              <AnimatePresence initial={false}>
                {isEmojiOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsEmojiOpen(false)}></div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      id="composer-emoji"
                      className="absolute bottom-14 left-0 z-50 w-[min(100vw-1.5rem,320px)] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border/50 glass-panel shadow-2xl overflow-hidden"
                    >
                      <EmojiPicker
                        onEmojiClick={(emojiData: { emoji?: string }) => {
                          if (emojiData?.emoji) appendEmoji(emojiData.emoji);
                        }}
                        height={360}
                        width={320}
                        previewConfig={{ showPreview: false }}
                        searchDisabled={false}
                        skinTonesDisabled={true}
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              <Input
                placeholder={media ? "Add a caption..." : "Type a message..."}
                autoFocus
                value={message}
                onChange={typingHandler}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                ref={inputRef}
                className="h-[52px] glass-input rounded-2xl pl-11 pr-5 text-[15px] text-foreground placeholder:text-muted w-full focus-visible:ring-0 border-none shadow-sm"
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center">
          <AnimatePresence initial={false} mode="sync">
            {message.trim() || media ? (
              <motion.button
                key="send"
                layout={false}
                initial={reduceMotion ? false : { opacity: 0.85, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                type="submit"
                disabled={isSending}
                className="bg-primary hover:bg-primary-hover text-white rounded-2xl p-3.5 transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed h-[52px] w-[52px] flex items-center justify-center"
                aria-label="Send message"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </motion.button>
            ) : isRecording ? (
              <motion.button
                key="stop-rec"
                layout={false}
                initial={reduceMotion ? false : { opacity: 0.85, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                type="button"
                onClick={stopRecording}
                className="bg-red-500 hover:bg-red-600 text-white rounded-2xl p-3.5 transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 h-[52px] w-[52px] flex items-center justify-center"
                aria-label="Stop recording"
              >
                <Square className="w-5 h-5 fill-current" />
              </motion.button>
            ) : (
              <motion.button
                key="mic"
                layout={false}
                initial={reduceMotion ? false : { opacity: 0.85, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                type="button"
                onClick={() => void startRecording()}
                className="bg-surface/80 hover:bg-primary/10 text-muted hover:text-primary rounded-2xl p-3.5 transition-colors border border-border/50 shadow-sm h-[52px] w-[52px] flex items-center justify-center"
                aria-label="Start voice recording"
              >
                <Mic className="w-5 h-5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

      </form>
    </div>
  );
}
