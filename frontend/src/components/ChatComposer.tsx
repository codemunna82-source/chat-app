import { useState, useRef } from 'react';
import { Send, Image as ImageIcon, Paperclip, Mic, Square, Smile, FileText, Camera, MapPin, UserSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
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
    <div className={`p-3 md:p-4 bg-surface/90 ${effectsReady ? 'sm:backdrop-blur-md' : ''} border-t border-border/60 z-20 w-full relative transition-colors duration-300 shadow-[0_-18px_50px_-35px_rgba(0,0,0,0.25)]`}>
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
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="h-[52px] bg-primary/10 text-primary flex items-center justify-between px-5 rounded-2xl border border-primary/20 shadow-inner"
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                <span className="font-semibold tracking-wide tabular-nums text-foreground">
                  {(Math.floor(recordingTime / 60)).toString().padStart(2, '0')}:{(recordingTime % 60).toString().padStart(2, '0')}
                </span>
              </div>

              {/* Audio Visualizer */}
              <div className="flex items-center gap-[3px] h-8 overflow-hidden flex-1 justify-end px-4">
                {audioData.map((val, i) => {
                  const heightPct = Math.max(15, (val / 255) * 100);
                  return (
                    <motion.div
                      key={i}
                      animate={{ height: `${heightPct}%` }}
                      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                      className="w-1.5 bg-primary rounded-full"
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
                      className="absolute bottom-14 left-0 z-50 w-[320px] rounded-2xl border border-border/50 bg-surface/90 backdrop-blur-xl shadow-2xl overflow-hidden"
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

        <div className="flex items-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {message.trim() || media ? (
              <motion.button
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 45 }}
                type="submit"
                disabled={isSending}
                className="bg-primary hover:bg-primary-hover text-white rounded-2xl p-3.5 transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed h-[52px] w-[52px] flex items-center justify-center"
                aria-label="Send message"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </motion.button>
            ) : isRecording ? (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                type="button"
                onClick={stopRecording}
                className="bg-red-500 hover:bg-red-600 text-white rounded-2xl p-3.5 transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 h-[52px] w-[52px] flex items-center justify-center"
                aria-label="Stop recording"
              >
                <Square className="w-5 h-5 fill-current" />
              </motion.button>
            ) : (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                type="button"
                onClick={startRecording}
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
