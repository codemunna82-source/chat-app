'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Phone, PhoneOff, Send, ShieldCheck, AlertCircle, Mic, MicOff, MessageCircle, ImagePlus, X } from 'lucide-react';
import {
  GuestLinkInvalidError,
  fetchIceServers,
  fetchMessages,
  fetchSession,
  fetchMediaObjectUrl,
  markRead,
  sendMessage,
  socketUrl,
  uploadImages,
} from './guestApi';
import { useGuestCall } from './useGuestCall';
import { realtimeToGuestMessage, type GuestMessage, type GuestSession, type RealtimeMessage } from './types';

type Phase = 'loading' | 'ready' | 'invalid' | 'error';

/** Newest last, and never the same message twice — the customer's own
 *  message arrives both as the POST response and over the socket, because
 *  they are in the conversation room like any other participant. */
function mergeMessage(list: GuestMessage[], incoming: GuestMessage): GuestMessage[] {
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Ticks once a second only while a call is up, rather than re-rendering the whole window. */
function CallDuration({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return <span>{`${mm}:${ss}`}</span>;
}

/** "Today" / "Yesterday" / a short date — the chip above the first message of each day. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Messages from the same side within a few minutes read as one block. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function startsNewGroup(current: GuestMessage, previous?: GuestMessage): boolean {
  if (!previous) return true;
  if (previous.from !== current.from) return true;
  return new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
}

/** The three-dot bubble, using staggered bounces rather than a keyframe of its own. */
function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border/50 bg-surface px-4 py-3 shadow-sm">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
            style={{ animationDelay: delay + 'ms' }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The frame every full-screen state shares, so they cannot drift apart.
 *
 * Module level rather than inside the component: a component declared in a
 * render body is a new type on every render, which makes React throw away
 * and rebuild its subtree instead of updating it.
 */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-8 text-center">
      <Backdrop />
      <div className="relative z-10 flex flex-col items-center gap-3">{children}</div>
    </main>
  );
}

export default function GuestChatWindow({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  /** Clears the indicator if the other side stops typing without saying so — a
   *  dropped socket or a closed app leaves no stop event behind. */
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Our own "still typing" throttle, so a keystroke does not become a packet. */
  const typingSentRef = useRef(false);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadIce = useCallback(() => fetchIceServers(token), [token]);
  const call = useGuestCall(socket, loadIce);

  // ---- initial load -------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [loadedSession, loadedMessages] = await Promise.all([
          fetchSession(token),
          fetchMessages(token),
        ]);
        if (cancelled) return;
        setSession(loadedSession);
        setMessages(loadedMessages);
        setPhase('ready');
        markRead(token);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GuestLinkInvalidError) {
          setPhase('invalid');
          return;
        }
        setErrorText(err instanceof Error ? err.message : 'Something went wrong');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // ---- realtime -----------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return;

    const s = io(socketUrl(), {
      auth: { guestToken: token },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    // The link was revoked or expired while the page sat open. The server
    // has already closed the socket; showing it as disconnected is more
    // honest than a silent, permanently idle window.
    s.on('connect_error', () => setConnected(false));

    s.on('message:new', (payload: RealtimeMessage) => {
      const incoming = realtimeToGuestMessage(payload);
      setMessages((prev) => mergeMessage(prev, incoming));
      if (incoming.from === 'business') markRead(token);
      // A message means they finished typing, whether or not a stop event
      // arrives — and it always looks wrong to still say "typing" under a
      // message that has already landed.
      setAgentTyping(false);
    });

    s.on('agent:presence', (payload: { online: boolean }) => setAgentOnline(Boolean(payload?.online)));

    s.on('typing:start', () => {
      setAgentTyping(true);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => setAgentTyping(false), 6000);
    });
    s.on('typing:stop', () => setAgentTyping(false));

    setSocket(s);

    return () => {
      s.off('message:new');
      s.off('agent:presence');
      s.off('typing:start');
      s.off('typing:stop');
      s.disconnect();
      setSocket(null);
      setAgentOnline(false);
      setAgentTyping(false);
    };
  }, [phase, token]);

  // ---- keep the newest message in view ------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const stopTyping = useCallback(() => {
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    if (!typingSentRef.current) return;
    typingSentRef.current = false;
    socket?.emit('typing:stop');
  }, [socket]);

  /**
   * One start event per burst of typing, then a stop once they pause.
   * Emitting per keystroke would send a packet per character for an
   * indicator that cannot show more than "typing".
   */
  const noteTyping = useCallback(() => {
    if (!socket) return;
    if (!typingSentRef.current) {
      typingSentRef.current = true;
      socket.emit('typing:start');
    }
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    typingIdleRef.current = setTimeout(stopTyping, 2500);
  }, [socket, stopTyping]);

  // Nothing should be left mid-"typing" when the page goes away.
  useEffect(() => () => {
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    if (typingClearRef.current) clearTimeout(typingClearRef.current);
  }, []);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setDraft('');
    stopTyping();
    try {
      const saved = await sendMessage(token, text);
      setMessages((prev) => mergeMessage(prev, saved));
    } catch (err) {
      // Put the text back rather than losing what they typed.
      setDraft(text);
      if (err instanceof GuestLinkInvalidError) {
        setPhase('invalid');
      } else {
        setErrorText(err instanceof Error ? err.message : 'Message could not be sent');
      }
    } finally {
      setSending(false);
    }
  }, [draft, sending, token, stopTyping]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;

      setErrorText(null);
      setUploading((n) => n + files.length);
      try {
        const { sent, failed } = await uploadImages(token, files);
        setMessages((prev) => sent.reduce(mergeMessage, prev));
        // Partial success is still success for what got through; only the
        // ones that did not are worth saying anything about.
        if (failed.length > 0) {
          setErrorText(
            failed.length === 1 ? failed[0]!.message : `${failed.length} images could not be sent.`,
          );
        }
      } catch (err) {
        if (err instanceof GuestLinkInvalidError) setPhase('invalid');
        else setErrorText(err instanceof Error ? err.message : 'Could not send those images.');
      } finally {
        setUploading((n) => Math.max(0, n - files.length));
      }
    },
    [token],
  );

  const title = useMemo(() => session?.businessName ?? 'Chat', [session]);

  const initials = title.slice(0, 2).toUpperCase();

  if (phase === 'loading') {
    return (
      <Screen>
        <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary" />
        <p className="text-sm text-muted">Opening your chat…</p>
      </Screen>
    );
  }

  if (phase === 'invalid') {
    return (
      <Screen>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/12">
          <AlertCircle className="h-8 w-8 text-amber-500" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">This chat link has expired</h1>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          Go back to WhatsApp and tap the most recent “Open private chat” link, or message the business
          to get a new one.
        </p>
      </Screen>
    );
  }

  if (phase === 'error') {
    return (
      <Screen>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/12">
          <AlertCircle className="h-8 w-8 text-red-500" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">Could not open the chat</h1>
        <p className="max-w-xs text-sm leading-relaxed text-muted">{errorText}</p>
      </Screen>
    );
  }

  const callActive = call.phase !== 'idle';
  const ringing = call.phase === 'calling' || call.phase === 'incoming';

  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-background">
      <Backdrop />

      {/* Always mounted: ontrack fires before the call sheet would appear,
          and the first seconds of audio would land nowhere. */}
      <audio ref={call.remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Header */}
      <header className="relative z-20 flex shrink-0 items-center gap-3 border-b border-border/50 bg-surface/70 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top,0px))] backdrop-blur-xl">
        <div className="relative shrink-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-[13px] font-bold text-white shadow-lg shadow-primary/25">
            {initials}
          </div>
          {connected && agentOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-green-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] leading-tight text-muted" aria-live="polite">
            {!connected ? (
              <>
                <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
                Reconnecting…
              </>
            ) : agentTyping ? (
              <span className="font-medium text-primary">typing…</span>
            ) : agentOnline ? (
              <span className="font-medium text-green-600 dark:text-green-500">Online</span>
            ) : (
              <>
                <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
                Secure chat
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void call.startCall()}
          disabled={callActive || !connected}
          aria-label="Call"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition active:scale-90 disabled:opacity-35"
        >
          <Phone className="h-[18px] w-[18px]" />
        </button>
      </header>

      {/* Transcript */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {messages.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <MessageCircle className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <p className="text-[15px] font-medium">Start the conversation</p>
            <p className="max-w-[15rem] text-[13px] leading-relaxed text-muted">
              Send a message and someone will get back to you here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const mine = m.from === 'me';
              const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const first = newDay || startsNewGroup(m, prev);
              const last = !next || dayLabel(next.createdAt) !== dayLabel(m.createdAt) || startsNewGroup(next, m);

              return (
                <li key={m.id} className="contents">
                  {newDay && (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-full bg-surface/80 px-3 py-1 text-[11px] font-medium text-muted shadow-sm backdrop-blur">
                        {dayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}

                  <div
                    className={`flex ${mine ? 'justify-end' : 'justify-start'} ${last ? 'mb-2.5' : 'mb-0.5'}`}
                  >
                    <div
                      className={[
                        'max-w-[80%] text-[15px] leading-relaxed shadow-sm md:max-w-[62%]',
                        // An image bubble hugs the picture; a text one pads it.
                        m.mediaId && m.type === 'image' ? 'p-1.5' : 'px-4 py-2.5',
                        // Square off the inner corner of a run so a group
                        // reads as one block instead of separate cards.
                        mine
                          ? 'bg-gradient-to-br from-primary to-primary-hover text-white shadow-primary/20'
                          : 'border border-border/50 bg-surface text-foreground',
                        'rounded-2xl',
                        mine ? (first ? '' : 'rounded-tr-md') : first ? '' : 'rounded-tl-md',
                        mine ? (last ? '' : 'rounded-br-md') : last ? '' : 'rounded-bl-md',
                      ].join(' ')}
                    >
                      {m.mediaId && m.type === 'image' ? (
                        <ChatImage token={token} mediaId={m.mediaId} onOpen={setLightbox} />
                      ) : (
                        m.hasMedia && !m.text && <p className="italic opacity-75">[{m.type}]</p>
                      )}
                      {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                      {last && (
                        <div
                          className={`mt-1 select-none text-right text-[10.5px] ${mine ? 'text-white/70' : 'text-muted'}`}
                        >
                          {formatTime(m.createdAt)}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {agentTyping && messages.length > 0 && <TypingBubble />}
        <div ref={bottomRef} />
      </div>

      {uploading > 0 && (
        <p className="relative z-10 shrink-0 bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary">
          Sending {uploading} {uploading === 1 ? 'image' : 'images'}…
        </p>
      )}

      {errorText && (
        <p className="relative z-10 shrink-0 bg-red-500/10 px-4 py-2 text-center text-xs font-medium text-red-600 dark:text-red-400">
          {errorText}
        </p>
      )}

      {/* Composer */}
      <form
        className="relative z-20 flex shrink-0 items-end gap-2 border-t border-border/50 bg-surface/70 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            // Cleared so picking the same file twice in a row still fires
            // a change event.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading > 0}
          aria-label="Send images"
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-muted transition active:scale-90 hover:bg-foreground/5 hover:text-foreground disabled:opacity-35"
        >
          <ImagePlus className="h-[20px] w-[20px]" />
        </button>

        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) noteTyping();
            else stopTyping();
          }}
          onBlur={stopTyping}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={1}
          placeholder="Type a message…"
          aria-label="Message"
          className="max-h-32 min-h-[46px] flex-1 resize-none rounded-[22px] border border-border/60 bg-background px-4 py-3 text-[15px] outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg shadow-primary/25 transition active:scale-90 disabled:scale-95 disabled:opacity-35 disabled:shadow-none"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </form>

      {/* Call sheet */}
      {callActive && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-background/95 px-8 text-center backdrop-blur-2xl">
          <div className="relative">
            {ringing && (
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" aria-hidden />
            )}
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-3xl font-bold text-white shadow-2xl shadow-primary/30">
              {initials}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-1.5 text-sm text-muted">
              {call.phase === 'calling' && 'Ringing…'}
              {call.phase === 'incoming' && 'Incoming call'}
              {call.phase === 'connecting' && 'Connecting…'}
              {call.phase === 'active' && call.connectedAt && <CallDuration since={call.connectedAt} />}
              {(call.phase === 'ended' || call.phase === 'failed') && call.message}
            </p>
          </div>

          {call.phase === 'incoming' ? (
            <div className="flex items-center gap-10">
              <button
                type="button"
                onClick={call.endCall}
                aria-label="Decline"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition active:scale-90"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => void call.acceptCall()}
                aria-label="Accept"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 transition active:scale-90"
              >
                <Phone className="h-6 w-6" />
              </button>
            </div>
          ) : call.phase === 'ended' || call.phase === 'failed' ? (
            <button
              type="button"
              onClick={call.dismiss}
              className="rounded-full bg-foreground/10 px-7 py-3 text-sm font-semibold transition active:scale-95"
            >
              Close
            </button>
          ) : (
            <div className="flex items-center gap-10">
              <button
                type="button"
                onClick={call.toggleMute}
                aria-label={call.muted ? 'Unmute' : 'Mute'}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition active:scale-90 ${
                  call.muted ? 'bg-foreground text-background' : 'bg-foreground/10'
                }`}
              >
                {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={call.endCall}
                aria-label="End call"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition active:scale-90"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Full-size view. The object URL is the one the bubble already
          holds, so opening a picture costs no second download. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close image"
            className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top,0px))] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Shared image" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </main>
  );
}

/**
 * One attached image.
 *
 * Fetched as a blob rather than pointed at with a src, because the bytes
 * need the link token and an <img> tag cannot send an Authorization
 * header. The object URL is revoked when this unmounts — without that,
 * every image stays in memory for the life of the tab.
 */
function ChatImage({ token, mediaId, onOpen }: { token: string; mediaId: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    fetchMediaObjectUrl(token, mediaId)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [token, mediaId]);

  if (failed) {
    return (
      <div className="flex h-40 w-56 items-center justify-center rounded-xl bg-foreground/5 text-xs text-muted">
        Image unavailable
      </div>
    );
  }

  if (!url) {
    return <div className="h-40 w-56 animate-pulse rounded-xl bg-foreground/10" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Shared image"
      onClick={() => onOpen(url)}
      className="max-h-72 w-auto max-w-full cursor-zoom-in rounded-xl object-cover"
    />
  );
}

/**
 * Two soft colour washes behind everything.
 *
 * Fixed and pointer-events-none so it never intercepts a tap or scrolls
 * with the transcript, and built from the theme's own primary so it
 * follows light and dark without a second palette to keep in step.
 */
function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
      <div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-primary/8 blur-3xl" />
    </div>
  );
}
