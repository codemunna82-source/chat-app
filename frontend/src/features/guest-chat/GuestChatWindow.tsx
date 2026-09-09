'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
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
import { EmojiPicker } from './EmojiPicker';
import {
  BackIcon,
  CameraIcon,
  ChevronDownIcon,
  ClockTick,
  CloseIcon,
  KeyboardIcon,
  LockIcon,
  MicIcon,
  PauseIcon,
  PersonIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  SmileyIcon,
  TickIcon,
  TrashIcon,
} from './waIcons';
import { VoiceBubble } from './VoiceBubble';
import { canRecordAudio, useVoiceRecorder } from './useVoiceRecorder';
import { DEMO_SESSION, demoMessages, demoReply, isDemoToken } from './demoChat';
import { uploadVoiceNote } from './guestApi';
import {
  realtimeToGuestMessage,
  type GuestSession,
  type RealtimeMessage,
  type ThreadMessage,
} from './types';

type Phase = 'loading' | 'ready' | 'invalid' | 'error';

/**
 * Newest last, and never the same message twice.
 *
 * A message the customer sends comes back twice — once as the POST
 * response, once over the socket, because they are in the conversation
 * room like any other participant — and a third time it is already on
 * screen as an unacknowledged draft. All three collapse here: matching id
 * wins, otherwise an inbound echo of our own text replaces the pending row
 * in place, so the bubble never jumps or duplicates.
 */
function mergeMessage(list: ThreadMessage[], incoming: ThreadMessage): ThreadMessage[] {
  if (list.some((m) => m.id === incoming.id)) return list;

  if (incoming.from === 'me' && !incoming.hasMedia) {
    const idx = list.findIndex((m) => m.pending && m.text === incoming.text && !m.hasMedia);
    if (idx >= 0) {
      const copy = [...list];
      copy[idx] = incoming;
      return copy;
    }
  }

  return [...list, incoming];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

/** "TODAY" / "YESTERDAY" / a short date — the chip above the first message of each day. */
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
    month: 'long',
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Messages from the same side within a few minutes read as one block, and only the first gets a tail. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function startsNewGroup(current: ThreadMessage, previous?: ThreadMessage): boolean {
  if (!previous) return true;
  if (previous.from !== current.from) return true;
  return new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
}

/** The three-dot bubble, using staggered bounces rather than a keyframe of its own. */
function TypingBubble() {
  return (
    <div className="mb-2 flex justify-start px-1">
      <div className="wa-tail-in relative flex items-center gap-1 rounded-[7.5px] rounded-tl-none bg-[var(--wa-in)] px-3.5 py-3 shadow-[var(--wa-bubble-shadow)]">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--wa-meta)]"
            style={{ animationDelay: delay + 'ms' }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Sent / delivered, under the customer's own messages.
 *
 * Two states only. There is no blue "read" tick because nothing tells a web
 * guest when an agent opened the thread, and a read receipt the customer
 * cannot rely on is worse than none.
 */
function MessageTicks({ pending }: { pending?: boolean }) {
  if (pending) return <ClockTick className="h-[13px] w-[13px] text-[var(--wa-tick)]" />;
  return <TickIcon double className="h-[13px] w-[16px] text-[var(--wa-tick)]" />;
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
    <main className="wa wa-wall relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden px-8 text-center text-[var(--wa-text)]">
      <div className="relative z-10 flex flex-col items-center gap-3">{children}</div>
    </main>
  );
}

export default function GuestChatWindow({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  /** Counter behind the temporary ids of unacknowledged messages. */
  const draftIdRef = useRef(0);
  /** See flash(), below — declared here so earlier callbacks can reach it. */
  const flashRef = useRef<((message: string) => void) | null>(null);

  /** Clears the indicator if the other side stops typing without saying so — a
   *  dropped socket or a closed app leaves no stop event behind. */
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Our own "still typing" throttle, so a keystroke does not become a packet. */
  const typingSentRef = useRef(false);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Whether this is the canned window rather than a real conversation.
   *
   * Read from the token, so the demo needs no separate route, no separate
   * component and no build flag — every behaviour below is the real one
   * with a single guard in front of the network call it would have made.
   */
  const demo = isDemoToken(token);
  /** Which canned reply comes next; a ref so answering does not re-render. */
  const demoReplyRef = useRef(0);

  const loadIce = useCallback(() => fetchIceServers(token), [token]);
  const call = useGuestCall(socket, loadIce);
  const recorder = useVoiceRecorder();
  /**
   * Whether the microphone button is worth showing at all.
   *
   * Read once, after mount: MediaRecorder does not exist on the server, and
   * deciding during render would make the first client paint disagree with
   * the markup it is hydrating.
   */
  const [canRecord, setCanRecord] = useState(false);
  useEffect(() => setCanRecord(canRecordAudio()), []);

  // ---- initial load -------------------------------------------------
  useEffect(() => {
    if (demo) {
      setSession(DEMO_SESSION);
      setMessages(demoMessages());
      setOlderCursor(null); // the demo thread is the whole thread
      setPhase('ready');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [loadedSession, loadedMessages] = await Promise.all([
          fetchSession(token),
          fetchMessages(token),
        ]);
        if (cancelled) return;
        setSession(loadedSession);
        setMessages(loadedMessages.items);
        setOlderCursor(loadedMessages.nextCursor);
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
  }, [token, demo]);

  // ---- realtime -----------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready') return;
    if (demo) {
      // No socket to open. The header still has to say something, and
      // "connecting…" forever would misrepresent a window that works.
      setConnected(true);
      setAgentOnline(true);
      return;
    }

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
  }, [phase, token, demo]);

  // ---- keep the newest message in view ------------------------------
  useEffect(() => {
    // Not while older messages are being spliced in above — that is a
    // length change too, and jumping to the bottom is the opposite of
    // what the customer just asked for. Not either when they have
    // scrolled up to read: the jump-to-latest button is there for that.
    if (loadingOlder || !atBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loadingOlder, atBottom, agentTyping, emojiOpen]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

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

  /**
   * The page before the one at the top.
   *
   * Scroll position is restored by height difference rather than left to
   * the browser: prepending content pushes everything down, and the
   * customer would find themselves somewhere they never scrolled to.
   */
  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder) return;
    const container = transcriptRef.current;
    const heightBefore = container?.scrollHeight ?? 0;

    setLoadingOlder(true);
    try {
      const page = await fetchMessages(token, olderCursor);
      setMessages((prev) => [...page.items, ...prev]);
      setOlderCursor(page.nextCursor);

      requestAnimationFrame(() => {
        if (!container) return;
        container.scrollTop += container.scrollHeight - heightBefore;
      });
    } catch {
      // Nothing to say: the thread they can see is unaffected, and they
      // can try again simply by scrolling up once more.
    } finally {
      setLoadingOlder(false);
    }
  }, [olderCursor, loadingOlder, token]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    // On screen before the round trip, with a clock instead of a tick. The
    // alternative — an empty box and a pause — is what makes a web chat
    // feel like a web page rather than a messenger.
    const tempId = `pending-${draftIdRef.current++}`;
    const optimistic: ThreadMessage = {
      id: tempId,
      from: 'me',
      type: 'text',
      text,
      hasMedia: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setSending(true);
    setDraft('');
    setEmojiOpen(false);
    setAtBottom(true);
    setMessages((prev) => [...prev, optimistic]);
    stopTyping();

    if (demo) {
      // The same three beats the real path produces — clock, then tick,
      // then the other side typing — on timers instead of a socket.
      window.setTimeout(
        () => setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false } : m))),
        600,
      );
      window.setTimeout(() => setAgentTyping(true), 1100);
      window.setTimeout(() => {
        setAgentTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `demo-reply-${demoReplyRef.current}`,
            from: 'business',
            type: 'text',
            text: demoReply(demoReplyRef.current++),
            hasMedia: false,
            createdAt: new Date().toISOString(),
          },
        ]);
      }, 2600);
      setSending(false);
      return;
    }

    try {
      const saved = await sendMessage(token, text);
      setMessages((prev) => {
        // The socket echo may have already replaced the pending row, in
        // which case this id is present and merge leaves the list alone.
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return mergeMessage(withoutTemp, saved);
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
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
  }, [draft, sending, token, stopTyping, demo]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;

      if (demo) {
        flashRef.current?.('Demo chat — photos are not uploaded anywhere. Open a real link to send one.');
        return;
      }

      setErrorText(null);
      setAtBottom(true);
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
    [token, demo],
  );

  /**
   * Starts recording, or explains why it cannot.
   *
   * The permission prompt is the first thing a customer sees here, so the
   * tray opens only once the browser has actually granted the microphone —
   * a bar that appears and then collapses on a refused prompt reads as a
   * bug rather than as an answer.
   */
  const startRecording = useCallback(async () => {
    setEmojiOpen(false);
    const started = await recorder.start();
    if (started) return;

    flashRef.current?.(
      recorder.error === 'denied'
        ? 'Microphone blocked. Allow it in your browser’s site settings to send a voice message.'
        : 'This browser cannot record audio. Try Chrome or Safari.',
    );
    recorder.clearError();
  }, [recorder]);

  const finishRecording = useCallback(async () => {
    const result = await recorder.stop();
    if (!result) {
      // Either they cancelled, or the press was too short to hold speech.
      return;
    }

    if (demo) {
      // Straight into the thread as a playable blob — nothing is uploaded,
      // which is the whole point of the demo.
      const url = URL.createObjectURL(result.blob);
      setAtBottom(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `demo-voice-${Date.now()}`,
          from: 'me',
          type: 'audio',
          hasMedia: true,
          mediaId: `demo:${url}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    setErrorText(null);
    setAtBottom(true);
    setUploading((n) => n + 1);
    try {
      const { sent, failed } = await uploadVoiceNote(token, result.blob, result.mimeType);
      setMessages((prev) => sent.reduce(mergeMessage, prev));
      if (sent.length === 0) {
        setErrorText(failed[0]?.message ?? 'Voice message could not be sent.');
      }
    } catch (err) {
      if (err instanceof GuestLinkInvalidError) setPhase('invalid');
      else setErrorText(err instanceof Error ? err.message : 'Voice message could not be sent.');
    } finally {
      setUploading((n) => Math.max(0, n - 1));
    }
  }, [recorder, token, demo]);

  const insertEmoji = useCallback((emoji: string) => {
    const field = inputRef.current;
    setDraft((prev) => {
      // At the caret, not at the end: a customer who taps back into the
      // middle of what they typed expects the emoji where the cursor is.
      const start = field?.selectionStart ?? prev.length;
      const end = field?.selectionEnd ?? prev.length;
      const next = prev.slice(0, start) + emoji + prev.slice(end);
      requestAnimationFrame(() => {
        if (!field) return;
        const caret = start + emoji.length;
        field.setSelectionRange(caret, caret);
      });
      return next;
    });
  }, []);

  /** A one-line message that fades itself out — for things with nothing to decide. */
  const flash = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? null : current)), 4200);
  }, []);
  // handleFiles is declared above this and needs it; a ref keeps the two
  // from having to be ordered around each other.
  flashRef.current = flash;

  const title = useMemo(() => session?.businessName ?? 'Chat', [session]);
  const initials = useMemo(
    () =>
      title
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!)
        .join('')
        .toUpperCase(),
    [title],
  );

  if (phase === 'loading') {
    return (
      <Screen>
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--wa-accent)]/25 border-t-[var(--wa-accent)]" />
        <p className="text-sm text-[var(--wa-meta)]">Opening your chat…</p>
      </Screen>
    );
  }

  if (phase === 'invalid') {
    return (
      <Screen>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--wa-notice)]">
          <LockIcon className="h-7 w-7 text-[var(--wa-notice-text)]" />
        </div>
        <h1 className="text-lg font-semibold">This chat link has expired</h1>
        <p className="max-w-xs text-sm leading-relaxed text-[var(--wa-meta)]">
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
          <CloseIcon className="h-7 w-7 text-red-500" />
        </div>
        <h1 className="text-lg font-semibold">Could not open the chat</h1>
        <p className="max-w-xs text-sm leading-relaxed text-[var(--wa-meta)]">{errorText}</p>
      </Screen>
    );
  }

  const callActive = call.phase !== 'idle';
  const ringing = call.phase === 'calling' || call.phase === 'incoming';
  const hasDraft = draft.trim().length > 0;

  return (
    <main className="wa flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--wa-wall)] text-[var(--wa-text)] antialiased">
      {/* Always mounted: ontrack fires before the call sheet would appear,
          and the first seconds of audio would land nowhere. */}
      <audio ref={call.remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="z-20 flex shrink-0 items-center gap-2 bg-[var(--wa-header)] px-1.5 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] text-[var(--wa-header-text)] shadow-[0_1px_2px_rgba(11,20,26,0.08)]">
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="Back"
          className="flex h-10 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-90"
        >
          <BackIcon className="h-6 w-6" />
        </button>

        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--wa-accent)]/18 text-[13px] font-semibold text-[var(--wa-accent)]">
            {initials || <PersonIcon className="h-6 w-6 opacity-70" />}
          </div>
        </div>

        <div className="min-w-0 flex-1 pl-1">
          <h1 className="truncate text-[17px] font-medium leading-tight">{title}</h1>
          <p className="truncate text-[12.5px] leading-[15px] text-[var(--wa-header-sub)]" aria-live="polite">
            {!connected
              ? 'connecting…'
              : agentTyping
                ? <span className="text-[var(--wa-accent)]">typing…</span>
                : agentOnline
                  ? 'online'
                  : 'tap to chat'}
          </p>
        </div>

        {/* No video-call button: this window carries audio only, and an
            icon that opens nothing is worse than an icon that is absent. */}
        <button
          type="button"
          onClick={() => {
            if (demo) {
              flash('Demo chat — calling needs a real link, since there is nobody to ring.');
              return;
            }
            void call.startCall();
          }}
          disabled={callActive || !connected}
          aria-label="Voice call"
          className="mr-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-35"
        >
          <PhoneIcon className="h-[22px] w-[22px]" />
        </button>
      </header>

      {/* ── Transcript ─────────────────────────────────────────── */}
      <div className="wa-wall relative min-h-0 flex-1">
        <div
          ref={transcriptRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop < 80) void loadOlder();
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
          }}
          className="wa-scroll absolute inset-0 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4"
        >
          <div className="mx-auto w-full max-w-[1100px]">
            {/* The privacy notice, in the place the messenger puts it. The
                wording is what is actually true here — the transport is
                encrypted and the thread is readable only by this business —
                rather than an end-to-end claim this architecture cannot
                make, since messages are stored in the business's inbox. */}
            <div className="mx-auto mb-2 max-w-[420px] rounded-lg bg-[var(--wa-notice)] px-3 py-2 text-center text-[12.5px] leading-[18px] text-[var(--wa-notice-text)] shadow-[var(--wa-bubble-shadow)]">
              <LockIcon className="mr-1 inline-block h-3 w-3 -translate-y-[1px] align-middle" />
              Messages and calls in this chat are private and encrypted in transit. Only you and{' '}
              {title} can see them.
            </div>

            {/* The contact card the messenger shows at the top of a thread
                with someone not in your address book. */}
            <div className="mx-auto mb-3 w-full max-w-[400px] rounded-xl bg-[var(--wa-card)] px-5 py-4 text-center shadow-[var(--wa-panel-shadow)]">
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--wa-accent)]/18 text-xl font-semibold text-[var(--wa-accent)]">
                {initials || <PersonIcon className="h-9 w-9 opacity-70" />}
              </div>
              <p className="text-[17px] font-medium leading-tight">{title}</p>
              {session?.contactName && (
                <p className="mt-0.5 text-[13.5px] text-[var(--wa-card-sub)]">~{session.contactName}</p>
              )}
              <p className="mt-1 text-[12.5px] leading-[17px] text-[var(--wa-card-sub)]">
                Business account · you opened this chat from a private link
              </p>
            </div>

            {loadingOlder && (
              <p className="pb-3 text-center text-[11.5px] text-[var(--wa-chip-text)]">
                Loading earlier messages…
              </p>
            )}

            <ul className="flex flex-col">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const mine = m.from === 'me';
                const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                const first = newDay || startsNewGroup(m, prev);
                const last =
                  !next || dayLabel(next.createdAt) !== dayLabel(m.createdAt) || startsNewGroup(next, m);
                const isImage = Boolean(m.mediaId) && m.type === 'image';
                const isVoice = Boolean(m.mediaId) && m.type === 'audio';
                const stamp = (
                  <>
                    {formatTime(m.createdAt)}
                    {mine && <MessageTicks pending={m.pending} />}
                  </>
                );

                return (
                  <li key={m.id} className="contents">
                    {newDay && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-md bg-[var(--wa-chip)] px-3 py-[5px] text-[12px] font-medium uppercase tracking-wide text-[var(--wa-chip-text)] shadow-[var(--wa-bubble-shadow)]">
                          {dayLabel(m.createdAt)}
                        </span>
                      </div>
                    )}

                    <div className={`flex px-1 ${mine ? 'justify-end' : 'justify-start'} ${last ? 'mb-2' : 'mb-[2px]'}`}>
                      <div
                        className={[
                          'relative max-w-[85%] rounded-[7.5px] shadow-[var(--wa-bubble-shadow)] sm:max-w-[65%] md:max-w-[440px]',
                          isImage ? 'p-[3px]' : isVoice ? 'px-[7px] pb-[6px] pt-[5px]' : 'px-[9px] pb-[7px] pt-[6px]',
                          mine ? 'bg-[var(--wa-out)]' : 'bg-[var(--wa-in)]',
                          // Only the opening bubble of a run carries a tail
                          // and a squared corner — a tail on every bubble is
                          // the tell of a chat UI copied from a screenshot.
                          first ? (mine ? 'wa-tail-out rounded-tr-none' : 'wa-tail-in rounded-tl-none') : '',
                        ].join(' ')}
                      >
                        {isImage ? (
                          <ChatImage token={token} mediaId={m.mediaId!} onOpen={setLightbox} />
                        ) : isVoice ? (
                          <VoiceBubble token={token} mediaId={m.mediaId!} mine={mine} />
                        ) : (
                          m.hasMedia &&
                          !m.text && (
                            <p className="italic text-[14.2px] opacity-70">[{m.type}]</p>
                          )
                        )}

                        {m.text && (
                          <p
                            className={`whitespace-pre-wrap break-words text-[14.2px] leading-[19px] ${
                              // A captioned image keeps the picture flush to
                              // the bubble edge but the words must not be.
                              isImage ? 'px-[6px] pb-[2px] pt-[4px]' : ''
                            }`}
                          >
                            {m.text}
                            {/* An invisible twin of the stamp, inline at the
                                end of the text, reserves exactly the room the
                                real one needs. A fixed pixel width has to
                                guess, and guesses short for "10:45 AM ✓✓" —
                                which is precisely when the stamp lands on top
                                of the last word. */}
                            <span
                              aria-hidden
                              className="invisible ml-2 inline-flex select-none items-center gap-[3px] align-bottom text-[11px] leading-none"
                            >
                              {stamp}
                            </span>
                          </p>
                        )}

                        <span
                          className={[
                            'absolute flex items-center gap-[3px] text-[11px] leading-none',
                            isVoice ? 'bottom-[6px] right-[9px]' : '',
                            // White over the picture only when the picture
                            // is what is underneath. With a caption the stamp
                            // sits on the words instead, where white on the
                            // bubble's own background is unreadable.
                            isImage && !m.text
                              ? 'bottom-[9px] right-[10px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]'
                              : 'bottom-[5px] right-[9px] text-[var(--wa-meta)]',
                          ].join(' ')}
                        >
                          {stamp}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {agentTyping && <TypingBubble />}
            <div ref={bottomRef} className="h-1" />
          </div>
        </div>

        {/* Jump to the latest message — the round button the messenger
            floats over the thread once you scroll away from the bottom. */}
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest messages"
            className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--wa-card)] text-[var(--wa-icon)] shadow-[var(--wa-panel-shadow)] transition active:scale-90"
          >
            <ChevronDownIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ── Status strips ──────────────────────────────────────── */}
      {uploading > 0 && (
        <p className="z-10 shrink-0 bg-[var(--wa-accent)]/12 px-4 py-1.5 text-center text-[12px] font-medium text-[var(--wa-accent)]">
          Sending {uploading} {uploading === 1 ? 'photo' : 'photos'}…
        </p>
      )}

      {notice && (
        <p className="z-10 shrink-0 bg-[var(--wa-notice)] px-4 py-1.5 text-center text-[12px] font-medium text-[var(--wa-notice-text)]">
          {notice}
        </p>
      )}

      {errorText && (
        <p className="z-10 shrink-0 bg-red-500/12 px-4 py-1.5 text-center text-[12px] font-medium text-red-600">
          {errorText}
        </p>
      )}

      {emojiOpen && !recorder.recording && <EmojiPicker onPick={insertEmoji} />}

      {/* ── Recording ──────────────────────────────────────────────
          Replaces the composer outright rather than sitting above it:
          while a recording is running there is nothing else to do, and a
          text field left in reach is a field a customer will type into
          and lose. */}
      {recorder.recording && (
        <div className="z-20 shrink-0 bg-[var(--wa-composer)] px-4 pb-[calc(0.6rem+env(safe-area-inset-bottom,0px))] pt-2.5">
          <div className="mx-auto flex w-full max-w-[560px] items-center gap-3">
            <span className="w-[46px] shrink-0 text-[15px] tabular-nums text-[var(--wa-text)]">
              {`${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')}`}
            </span>
            <LiveWaveform levels={recorder.levels} paused={recorder.paused} />
          </div>

          <div className="mx-auto mt-3 flex w-full max-w-[560px] items-center justify-between">
            <button
              type="button"
              onClick={recorder.cancel}
              aria-label="Discard recording"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 hover:bg-[var(--wa-hover)]"
            >
              <TrashIcon className="h-[24px] w-[24px]" />
            </button>

            <button
              type="button"
              onClick={() => (recorder.paused ? recorder.resume() : recorder.pause())}
              aria-label={recorder.paused ? 'Resume recording' : 'Pause recording'}
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-500 text-red-500 transition active:scale-90"
            >
              {recorder.paused ? (
                <PlayIcon className="h-[22px] w-[22px] translate-x-[1px]" />
              ) : (
                <PauseIcon className="h-[22px] w-[22px]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void finishRecording()}
              aria-label="Send voice message"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wa-accent)] text-white shadow-[var(--wa-bubble-shadow)] transition active:scale-90"
            >
              <SendIcon className="h-[22px] w-[22px] translate-x-[1px]" />
            </button>
          </div>
        </div>
      )}

      {/* ── Composer ───────────────────────────────────────────── */}
      <form
        hidden={recorder.recording}
        className="z-20 flex shrink-0 items-end gap-1.5 bg-[var(--wa-composer)] px-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))] pt-1.5"
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
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading > 0}
          aria-label="Attach photos"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 hover:bg-[var(--wa-hover)] disabled:opacity-35"
        >
          <PlusIcon className="h-[26px] w-[26px]" />
        </button>

        <div className="flex min-w-0 flex-1 items-end rounded-[24px] bg-[var(--wa-input)] px-2 py-1 shadow-[var(--wa-bubble-shadow)]">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value.trim()) noteTyping();
              else stopTyping();
              // Grow with the text, up to the messenger's five-ish lines.
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onBlur={stopTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="Message"
            aria-label="Message"
            className="max-h-[120px] min-h-[34px] flex-1 resize-none bg-transparent px-2 py-[7px] text-[15px] leading-[20px] outline-none placeholder:text-[var(--wa-meta)]"
          />
          {/* The same button turns into the way back. With the tray open a
              smiley reads as "open emoji", which is what it was doing a
              moment ago — so there appeared to be no exit but sending, and
              the keyboard was unreachable. Swapping the glyph is how the
              original says the tap now returns you to typing. */}
          <button
            type="button"
            onClick={() => {
              if (emojiOpen) {
                setEmojiOpen(false);
                // Bring the keyboard back with the tray, rather than
                // leaving the customer to tap the field a second time.
                inputRef.current?.focus();
                return;
              }
              setEmojiOpen(true);
              // Keeping focus would leave the on-screen keyboard covering
              // the tray that just opened.
              inputRef.current?.blur();
            }}
            aria-label={emojiOpen ? 'Back to keyboard' : 'Open emoji'}
            aria-pressed={emojiOpen}
            className={`mb-[3px] flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
              emojiOpen ? 'text-[var(--wa-accent)]' : 'text-[var(--wa-icon)]'
            }`}
          >
            {emojiOpen ? (
              <KeyboardIcon className="h-[24px] w-[24px]" />
            ) : (
              <SmileyIcon className="h-[23px] w-[23px]" />
            )}
          </button>
        </div>

        {!hasDraft && (
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading > 0}
            aria-label="Take a photo"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 hover:bg-[var(--wa-hover)] disabled:opacity-35"
          >
            <CameraIcon className="h-[24px] w-[24px]" />
          </button>
        )}

        {/* Mic while the box is empty, send once there is something to
            send — the same swap the messenger does. Voice notes are not
            something this chat can carry, so the mic says so rather than
            appearing to record. */}
        {hasDraft ? (
          <button
            type="submit"
            disabled={sending}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--wa-accent)] text-white shadow-[var(--wa-bubble-shadow)] transition active:scale-90 disabled:opacity-50"
          >
            <SendIcon className="h-[21px] w-[21px] translate-x-[1px]" />
          </button>
        ) : canRecord ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            aria-label="Record a voice message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 hover:bg-[var(--wa-hover)]"
          >
            <MicIcon className="h-[23px] w-[23px]" />
          </button>
        ) : null}
      </form>

      {/* ── Call sheet ─────────────────────────────────────────── */}
      {callActive && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-[var(--wa-wall)]/97 px-8 text-center backdrop-blur-2xl">
          <div className="relative">
            {ringing && (
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--wa-accent)]/20" aria-hidden />
            )}
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-[var(--wa-accent)]/18 text-3xl font-semibold text-[var(--wa-accent)]">
              {initials || <PersonIcon className="h-14 w-14 opacity-70" />}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-medium tracking-tight">{title}</h2>
            <p className="mt-1.5 text-sm text-[var(--wa-meta)]">
              {call.phase === 'calling' && 'Ringing…'}
              {call.phase === 'incoming' && 'Incoming voice call'}
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
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--wa-accent)] text-white shadow-lg transition active:scale-90"
              >
                <Phone className="h-6 w-6" />
              </button>
            </div>
          ) : call.phase === 'ended' || call.phase === 'failed' ? (
            <button
              type="button"
              onClick={call.dismiss}
              className="rounded-full bg-[var(--wa-card)] px-7 py-3 text-sm font-semibold shadow-[var(--wa-panel-shadow)] transition active:scale-95"
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
                  call.muted ? 'bg-[var(--wa-text)] text-[var(--wa-wall)]' : 'bg-[var(--wa-card)] shadow-[var(--wa-panel-shadow)]'
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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/92 p-4"
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
            <CloseIcon className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Shared image" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </main>
  );
}

/**
 * The bar that moves while a recording is running.
 *
 * Fed by real microphone amplitude rather than an animation on a timer:
 * the one question a recording indicator has to answer is "is it hearing
 * me", and a bar that dances regardless of the room answers it wrongly.
 *
 * It fills from the right and pads the left, so a recording that has just
 * started grows into the space instead of stretching a handful of samples
 * across the whole width.
 */
function LiveWaveform({ levels, paused }: { levels: number[]; paused: boolean }) {
  const SLOTS = 44;
  const padded = [...new Array(Math.max(0, SLOTS - levels.length)).fill(0), ...levels.slice(-SLOTS)];

  return (
    <div
      className={`flex h-8 flex-1 items-center justify-end gap-[2px] transition-opacity ${
        paused ? 'opacity-40' : ''
      }`}
      aria-hidden
    >
      {padded.map((level, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-full bg-[var(--wa-icon)] transition-[height] duration-75"
          // A floor of two pixels keeps silence as a visible dotted line
          // rather than a gap, which is what the original shows too.
          style={{ height: `${Math.max(2, Math.round(level * 28))}px` }}
        />
      ))}
    </div>
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
  // The demo has no media route behind it, so its images arrive as a src
  // already usable by the tag — the one branch the canned thread needs
  // inside otherwise untouched rendering.
  const direct = mediaId.startsWith('demo:') ? mediaId.slice('demo:'.length) : null;
  const [url, setUrl] = useState<string | null>(direct);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (direct) return;

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
  }, [token, mediaId, direct]);

  if (failed) {
    return (
      <div className="flex h-40 w-56 items-center justify-center rounded-[6px] bg-black/5 text-xs text-[var(--wa-meta)]">
        Image unavailable
      </div>
    );
  }

  if (!url) {
    return <div className="h-52 w-56 animate-pulse rounded-[6px] bg-black/10" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Shared image"
      onClick={() => onOpen(url)}
      className="max-h-[330px] w-auto max-w-full cursor-zoom-in rounded-[6px] object-cover"
    />
  );
}
