'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Phone, Send, ShieldCheck, AlertCircle } from 'lucide-react';
import { ChatBubble } from '@/components/ui/ChatBubble';
import {
  GuestLinkInvalidError,
  fetchMessages,
  fetchSession,
  markRead,
  sendMessage,
  socketUrl,
} from './guestApi';
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

export default function GuestChatWindow({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [callNotice, setCallNotice] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

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

    const socket = io(socketUrl(), {
      auth: { guestToken: token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    // The link was revoked or expired while the page sat open. The server
    // has already closed the socket; showing the same screen a bad link
    // gets is more honest than a silent, permanently idle window.
    socket.on('connect_error', () => setConnected(false));

    socket.on('message:new', (payload: RealtimeMessage) => {
      const incoming = realtimeToGuestMessage(payload);
      setMessages((prev) => mergeMessage(prev, incoming));
      if (incoming.from === 'business') markRead(token);
    });

    return () => {
      socket.off('message:new');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [phase, token]);

  // ---- keep the newest message in view ------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setDraft('');
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
  }, [draft, sending, token]);

  const title = useMemo(() => session?.businessName ?? 'Chat', [session]);

  if (phase === 'loading') {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">Opening your chat…</p>
      </main>
    );
  }

  if (phase === 'invalid') {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <AlertCircle className="h-10 w-10 text-amber-500" aria-hidden />
        <h1 className="text-lg font-semibold">This chat link has expired</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Go back to WhatsApp and tap the most recent “Open private chat” link, or send the business a
          message to get a new one.
        </p>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <AlertCircle className="h-10 w-10 text-red-500" aria-hidden />
        <h1 className="text-lg font-semibold">Could not open the chat</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{errorText}</p>
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] flex-col bg-background">
      {/* Header — the business, and nothing that navigates anywhere else. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-surface/80 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] backdrop-blur-xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold uppercase text-primary">
          {title.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-tight">{title}</h1>
          <p className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            {connected ? 'Secure chat · connected' : 'Reconnecting…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCallNotice((v) => !v)}
          aria-label="Call"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <Phone className="h-5 w-5" />
        </button>
      </header>

      {callNotice && (
        <p className="shrink-0 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-400">
          Calling from this window isn’t available yet.
        </p>
      )}

      {/* Transcript */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.from === 'me';
              return (
                <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%] md:max-w-[65%]">
                    <ChatBubble isSent={mine}>
                      {m.hasMedia && !m.text && (
                        <p className="text-[15px] italic opacity-80">[{m.type}]</p>
                      )}
                      {m.text && (
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.text}</p>
                      )}
                      <div
                        className={`mt-1 select-none text-[11px] ${mine ? 'text-white/75' : 'text-muted-foreground'} text-right`}
                      >
                        {formatTime(m.createdAt)}
                      </div>
                    </ChatBubble>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {errorText && phase === 'ready' && (
        <p className="shrink-0 bg-red-500/10 px-4 py-2 text-center text-xs text-red-600 dark:text-red-400">
          {errorText}
        </p>
      )}

      {/* Composer */}
      <form
        className="flex shrink-0 items-end gap-2 border-t border-border/60 bg-surface/80 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={1}
          placeholder="Type a message…"
          aria-label="Message"
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-border/60 bg-background px-4 py-3 text-[15px] outline-none focus:border-primary/60"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </main>
  );
}
