'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import {
  GuestLinkInvalidError,
  GuestNetworkError,
  fetchBusinessAvatarUrl,
  fetchIceServers,
  fetchMessages,
  fetchSession,
  fetchMediaObjectUrl,
  markRead,
  sendLocation,
  sendMessage,
  sendReaction,
  savePushToken,
  setBlocked,
  socketUrl,
  uploadImages,
} from './guestApi';
import { useGuestCall } from './useGuestCall';
import { EmojiPicker } from './EmojiPicker';
import { ChatSkeleton } from './ChatSkeleton';
import { tapFeedback, useDismissOnBack } from './useDismissOnBack';
import { outboxToMessage, readOutbox, writeOutbox, type OutboxItem } from './outbox';
import {
  BlockIcon,
  CameraIcon,
  ChevronDownIcon,
  ClockTick,
  CloseIcon,
  FlagIcon,
  KeyboardIcon,
  LockIcon,
  MicIcon,
  MoreIcon,
  PauseIcon,
  PersonIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  ReplyIcon,
  VideoIcon,
  VideoOffIcon,
  SendIcon,
  SmileyIcon,
  TickIcon,
  TrashIcon,
  VerifiedIcon,
} from './waIcons';
import { VoiceBubble } from './VoiceBubble';
import { LocationBubble } from './LocationBubble';
import { AttachSheet } from './AttachSheet';
import { ReportSheet, type ReportIntent } from './ReportSheet';
import { SafetyRow } from './SafetyRow';
import { NotifyBar } from './NotifyBar';
import { enablePush, pushSupport, refreshPush, type PushSupport } from './pushClient';
import { canRecordAudio, useVoiceRecorder } from './useVoiceRecorder';
import { DEMO_SESSION, demoMessages, demoReply, isDemoToken } from './demoChat';
import { DeleteSheet } from './DeleteSheet';
import { uploadVoiceNote } from './guestApi';
import {
  realtimeToGuestMessage,
  guestStatusFrom,
  rankStatus,
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
  const existing = list.findIndex((m) => m.id === incoming.id);
  if (existing >= 0) {
    // Already here, but not necessarily as completely. The socket echo and
    // the POST response are the same message by two routes, and whichever
    // arrives second used to be discarded whole — so a reply whose echo won
    // the race lost its quote permanently. Fields the newcomer does not
    // carry are kept from the copy already on screen.
    const current = list[existing]!;
    const merged: ThreadMessage = {
      ...current,
      ...incoming,
      replyTo: incoming.replyTo ?? current.replyTo,
      reactions: incoming.reactions ?? current.reactions,
    };
    const copy = [...list];
    copy[existing] = merged;
    return copy;
  }

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

/**
 * How many messages are rendered at once, and how much the window grows by.
 *
 * content-visibility already stops off-screen rows being laid out, but
 * they are still nodes React reconciles on every update. Past a few
 * hundred that reconciliation is what makes typing feel heavy.
 */
const RENDER_WINDOW_STEP = 120;

/** The emoji offered on a long press, in the order the app it copies uses. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** Messages from the same side within a few minutes read as one block, and only the first gets a tail. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function startsNewGroup(current: ThreadMessage, previous?: ThreadMessage): boolean {
  if (!previous) return true;
  if (previous.from !== current.from) return true;
  return new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
}

/** Photos sent together group into one grid, exactly as the agent app does. */
const ALBUM_WINDOW_MS = 5 * 60_000;
/** Three tiles, then a "+N" — a fourth means a second full row, which is the strip again. */
const ALBUM_MAX_TILES = 3;

type ThreadItem =
  | { kind: 'one'; key: string; message: ThreadMessage }
  | { kind: 'album'; key: string; messages: ThreadMessage[] };

/**
 * Collects runs of consecutive photos into albums.
 *
 * The same rules the agent app applies, so a batch of five looks the
 * same to the customer as it does to the business — which is the point:
 * the two are halves of one conversation, and a grid on one side and a
 * vertical strip on the other make them look like two products.
 *
 * A captioned photo never joins a run and ENDS one: the words belong to
 * that picture and a grid has nowhere to put them, and a caption left
 * dangling would end up describing the tile above it. A reply does the
 * same. A run of one is an ordinary bubble — a "grid" of a single photo
 * is just a smaller photo.
 */
function groupThread(messages: ThreadMessage[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  let run: ThreadMessage[] = [];

  const flush = () => {
    if (run.length >= 2) {
      items.push({ kind: 'album', key: `album-${run[0]!.id}`, messages: run });
    } else if (run.length === 1) {
      items.push({ kind: 'one', key: run[0]!.id, message: run[0]! });
    }
    run = [];
  };

  const isTile = (m: ThreadMessage) =>
    m.type === 'image' && Boolean(m.mediaId || m.localUrl) && !m.text && !m.replyTo;

  for (const m of messages) {
    if (!isTile(m)) {
      flush();
      items.push({ kind: 'one', key: m.id, message: m });
      continue;
    }
    const last = run[run.length - 1];
    const sameRun =
      !last ||
      (last.from === m.from &&
        dayLabel(last.createdAt) === dayLabel(m.createdAt) &&
        new Date(m.createdAt).getTime() - new Date(last.createdAt).getTime() <= ALBUM_WINDOW_MS);
    if (!sameRun) flush();
    run.push(m);
  }
  flush();
  return items;
}

/** One line standing in for a message inside a quote — mirrors the server's own rule. */
function previewOfMessage(m: ThreadMessage): string {
  if (m.text) return m.text;
  if (m.type === 'image') return '[photo]';
  if (m.type === 'audio') return '[voice message]';
  return `[${m.type}]`;
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
 * Sending / sent / delivered / read, under the customer's own messages.
 *
 * There used to be no read tick here, and the reason given was sound at
 * the time: nothing told a web guest when an agent had opened the thread,
 * and a read receipt the customer cannot rely on is worse than none. That
 * is no longer true — opening a chat now marks the customer's messages
 * READ and pushes message:status into this window (see the backend's
 * readReceipts.service.ts), so the mark is backed by a real event.
 *
 * Green rather than WhatsApp's blue, to match this app's palette.
 */
function MessageTicks({ pending, status }: { pending?: boolean; status?: ThreadMessage['status'] }) {
  if (pending) return <ClockTick className="h-[13px] w-[13px] text-[var(--wa-tick)]" />;
  const read = status === 'read';
  return (
    <>
      <TickIcon
        double={status !== 'sent'}
        className={`h-[13px] w-[16px] ${read ? 'text-[var(--wa-tick-read)]' : 'text-[var(--wa-tick)]'}`}
      />
      {/* The icons are aria-hidden, so the state has to be said in words
          for anyone who cannot see the colour it is carried by. */}
      <span className="sr-only">{read ? 'Read' : status === 'sent' ? 'Sent' : 'Delivered'}</span>
    </>
  );
}

/**
 * What a photo looks like while its bytes are still going up.
 *
 * A percentage and a determinate bar rather than a spinner: on a slow
 * connection a spinner is indistinguishable from a stalled upload, which
 * is exactly when someone gives up and sends the picture twice. The
 * spinner is kept only for the case the browser reports no total, where
 * an honest "working" beats a bar invented out of nothing.
 */
/**
 * The DOM id of one message row.
 *
 * A function rather than a template literal at each site, because a jump
 * that looks a row up by a slightly different string finds nothing and
 * reports "scroll up to load that message" about a message that is
 * already on screen.
 */
/**
 * Whatever best identifies the business, in whichever circle it is in.
 *
 * Three circles show it — the header, the contact card at the top of the
 * thread, and the call screen — and they had each written their own
 * `initials || <PersonIcon/>`. One component so a photo reaches all three
 * at once, and so they can never disagree about what to draw when there
 * is none.
 *
 * The photo fills its container rather than carrying a size of its own:
 * every one of those circles is a different size, and passing the size in
 * twice is how one of them ends up wrong.
 */
function BusinessFace({
  photo,
  initials,
  iconClass,
}: {
  photo: string | null;
  initials: string;
  /** The person glyph's size, for the caller that has no initials either. */
  iconClass: string;
}) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className="h-full w-full object-cover" />;
  }
  if (initials) return <>{initials}</>;
  return <PersonIcon className={iconClass} />;
}

function rowDomId(messageId: string): string {
  return `wa-msg-${messageId}`;
}

/**
 * The photo inside a reply's quote.
 *
 * Asks for the 480px copy — the same one an album cell uses, so a quote
 * of a picture already on screen is served from the browser's cache
 * rather than downloaded again.
 *
 * Renders nothing until it has the bytes. A spinner in a 38px box is a
 * grey smear, and the line beside it already says a photo is there.
 */
function QuotedPhoto({ token, mediaId }: { token: string; mediaId: string }) {
  const { url } = useMediaObjectUrl(token, { mediaId }, 480);
  return (
    <span className="block h-[38px] w-[38px] shrink-0 self-center overflow-hidden rounded-[4px] bg-black/10">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}

function UploadCover({ progress }: { progress?: number }) {
  const known = typeof progress === 'number' && progress > 0;
  const pct = Math.round(Math.min(1, Math.max(0, progress ?? 0)) * 100);

  return (
    <span
      className="absolute inset-0 flex items-center justify-center rounded-[7px] bg-black/40"
      role="progressbar"
      aria-label={known ? `Uploading, ${pct} percent` : 'Uploading'}
      aria-valuenow={known ? pct : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {known ? (
        <span className="text-[13px] font-medium tabular-nums text-white">{pct}%</span>
      ) : (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      <span className="absolute inset-x-3 bottom-3 h-[3px] overflow-hidden rounded-full bg-white/30">
        <span
          className="block h-full rounded-full bg-[#25d366] transition-[width] duration-150"
          style={{ width: known ? `${pct}%` : '0%' }}
        />
      </span>
    </span>
  );
}

/**
 * The green check beside the business name.
 *
 * Shown on every number, which is what makes the two meanings worth
 * keeping apart rather than collapsing into one icon that says whatever
 * is convenient.
 *
 * By default it stands for "this is a WhatsApp Business account". That is
 * true of every number in this system by construction — a conversation
 * only exists here because it arrived through the WhatsApp Business Cloud
 * API — so the badge is never claiming something unearned.
 *
 * When Meta additionally reports the display NAME as APPROVED, the same
 * mark carries the stronger claim, and only then. That distinction is not
 * pedantry: "WhatsApp checked this business's name" is a statement only
 * Meta can make, and a badge that made it on every account would tell the
 * customer reading it precisely nothing — which is the entire value of
 * the badge to them.
 */
function BusinessBadge({ verified, className }: { verified?: boolean; className?: string }) {
  return (
    <>
      <VerifiedIcon className={`shrink-0 text-[#25d366] ${className ?? ''}`} />
      <span className="sr-only">
        {verified ? 'Business name verified by WhatsApp' : 'WhatsApp Business account'}
      </span>
    </>
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
  /**
   * The open photo, and the batch it belongs to.
   *
   * It used to be one object URL and nothing else, which made the viewer
   * a dead end: you could look at a picture and that was all. It could
   * not say WHICH message you were looking at, so there was nothing to
   * reply to — and in an album of five, the two photos behind the "+2"
   * had no tile at all and could not be opened by any means.
   *
   * Carrying the messages instead fixes both: the viewer knows the photo
   * it is showing, so it can offer Reply, and it holds the whole batch,
   * so the ones with no tile are reachable through the strip at the
   * bottom.
   */
  const [viewer, setViewer] = useState<{ photos: ThreadMessage[]; index: number } | null>(null);

  /**
   * What the connection is actually doing, measured rather than assumed.
   *
   * Twice now a latency question has been answered with arithmetic —
   * "the server is in Oregon, so the network is about 120ms" — and twice
   * the arithmetic was wrong by a multiple. This is the number itself.
   *
   * `rtt` is a full round trip timed START TO FINISH IN THIS BROWSER, on
   * one clock. Comparing a server timestamp against Date.now() here would
   * look more precise and would silently report the difference between
   * two clocks that were never synchronised.
   *
   * `transport` matters as much: socket.io falls back to HTTP polling
   * when a WebSocket cannot be established, and polling adds delay of its
   * own. A chat that "feels slow" because it is not really on a socket
   * looks identical, from the outside, to one that is far away.
   *
   * Shown only with ?debug=1 on the link; otherwise it goes to the
   * console and nowhere else. A customer has no use for it.
   */
  const [link, setLink] = useState<{ transport: string; rtt: number | null } | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  /** Counter behind the temporary ids of unacknowledged messages. */
  const draftIdRef = useRef(0);
  /**
   * Messages waiting for a connection, newest last.
   *
   * A ref rather than state: the flush loop reads it between awaits and
   * would otherwise work from a snapshot taken before the send it just
   * completed. What renders is the pending bubbles in `messages`.
   */
  const outboxRef = useRef<OutboxItem[]>([]);
  /** Guards against two flushes running at once — a reconnect and an online event often land together. */
  const flushingRef = useRef(false);
  const [offline, setOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  /** How far the thread has been dragged past its top, in pixels. */
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartRef = useRef<number | null>(null);
  /**
   * Whether the opening jump to the newest message has finished.
   *
   * Until it has, the transcript is scrolled at the top and every frame of
   * that animation looks exactly like the customer scrolling up — which
   * grew the render window and asked for another page, over and over, so a
   * four-hundred message thread rendered all four hundred rows on open.
   */
  const settledRef = useRef(false);
  /** The message the composer is currently answering. */
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  /** Which message has its reaction row open. */
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  /** The message whose delete sheet is open. */
  const [deleting, setDeleting] = useState<ThreadMessage | null>(null);
  /** The `+` tray. */
  const [attachOpen, setAttachOpen] = useState(false);
  /** True while the browser is resolving a position fix, which can take seconds. */
  const [locating, setLocating] = useState(false);
  /** The header's overflow menu. */
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * The open report sheet, and what it is about.
   *
   * `message` is null for a complaint about the conversation rather than
   * one line of it — which is what the header menu opens, and what someone
   * who wants the business to stop generally means.
   */
  const [report, setReport] = useState<{ message: ThreadMessage | null; intent: ReportIntent } | null>(
    null,
  );
  /**
   * Whether the customer has blocked this chat.
   *
   * Held here rather than read off `session` on each render because it
   * changes without a session reload — the sheet sets it, and the bar at
   * the bottom of the window unsets it.
   */
  const [blocked, setBlockedState] = useState(false);
  /**
   * Whether this browser can be told about replies, and whether it has
   * been asked.
   *
   * Starts 'unsupported' rather than reading the browser during render:
   * Notification.permission does not exist on the server, and deciding
   * from it here would make the first client paint disagree with the
   * markup it is hydrating.
   */
  const [push, setPush] = useState<PushSupport>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [notifyDismissed, setNotifyDismissed] = useState(true);
  /**
   * How many of the newest messages are rendered.
   *
   * A thread of a thousand messages does not need a thousand rows in the
   * document; nothing above the fold has ever been looked at. The window
   * grows as the customer scrolls up, which is also when loadOlder runs,
   * so the two move together and there is never a gap between what has
   * been fetched and what can be seen.
   */
  const [renderWindow, setRenderWindow] = useState(RENDER_WINDOW_STEP);
  /**
   * The committed message list, readable synchronously.
   *
   * Handlers that have to decide something from current state before
   * updating it cannot use a setState updater for the decision: the
   * updater runs at the next render, so anything it assigns is still
   * unset when the handler continues. Assigned during render, which is
   * exactly when it becomes true.
   */
  const messagesRef = useRef<ThreadMessage[]>([]);
  messagesRef.current = messages;
  /**
   * The transcript's inner wrapper, and synchronous mirrors of the two
   * flags the resize observer has to consult.
   *
   * The observer is created once, so a value it closed over at that moment
   * would be the value from the first render forever — which for atBottom
   * means "true", and would re-pin the view under someone reading history.
   */
  const contentRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  atBottomRef.current = atBottom;
  const loadingOlderRef = useRef(false);
  loadingOlderRef.current = loadingOlder;
  /**
   * The gesture in progress.
   *
   * A ref shared across renders rather than variables closed over inside
   * the handler factory: that factory runs on every render, so any
   * re-render between pointerdown and pointerup handed the cancel a fresh,
   * empty closure — and the hold timer from the old one fired anyway. A
   * plain tap on a bubble popped the reaction row open 420ms later.
   */
  const gestureRef = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    startX: 0,
    startY: 0,
    dragging: false,
    /** Set when a hold or swipe fired, so the click it produces is swallowed. */
    acted: false,
  });

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
  const call = useGuestCall(socket, loadIce, { demo });
  /**
   * The two <video> elements.
   *
   * A MediaStream cannot be handed to React as a prop — `srcObject` is a
   * DOM property with no HTML attribute behind it, so it has to be
   * assigned to the element itself. Assigned in an effect keyed on the
   * stream, which is also what reattaches it if the element remounts.
   */
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  /**
   * The business's photo.
   *
   * The window had a name and a coloured circle with a letter in it, so
   * every business looked the same. On a page whose entire job is
   * persuading a stranger it is safe to keep talking, a photo is most of
   * what makes it read as a business rather than a form.
   *
   * Keyed on the version from the session, so a photo changed in the
   * workspace's settings is picked up on the next load and a cached one
   * is never served under the new address.
   */
  const [businessAvatar, setBusinessAvatar] = useState<string | null>(null);
  const avatarVersion = session?.businessAvatarUpdatedAt ?? null;

  useEffect(() => {
    // No version means no photo. Not an error, and not worth a request.
    if (!avatarVersion || demo) return;

    let cancelled = false;
    let created: string | null = null;
    void fetchBusinessAvatarUrl(token, avatarVersion).then((url) => {
      if (!url) return;
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      created = url;
      setBusinessAvatar(url);
    });

    return () => {
      cancelled = true;
      // An object URL that is never revoked pins the whole file in memory
      // for the life of the tab.
      if (created) URL.revokeObjectURL(created);
    };
  }, [token, avatarVersion, demo]);

  /** The message a quote just jumped to, marked until the timer clears it. */
  const [jumpedTo, setJumpedTo] = useState<string | null>(null);
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Scrolls the transcript to one message and marks it briefly.
   *
   * The container is scrolled directly rather than through
   * scrollIntoView, for the same reason pinToBottom is: scrollIntoView
   * walks EVERY scrollable ancestor, and on iOS Safari the document is
   * one of them — so it scrolls the page out from under the chat.
   *
   * The mark is not decoration. A thread that jumps somewhere and does
   * nothing else leaves the reader working out which of the bubbles on
   * screen was the point, which on a run of similar messages is a real
   * question.
   */
  const jumpTo = useCallback((messageId: string) => {
    const container = transcriptRef.current;
    const row = document.getElementById(rowDomId(messageId));
    if (!container || !row) {
      // Above the page that is loaded. Saying so beats a tap that
      // silently does nothing.
      flashRef.current?.('Scroll up to load that message first.');
      return;
    }
    const top = row.getBoundingClientRect().top - container.getBoundingClientRect().top;
    // Roughly a third down rather than at the very top, so what came
    // BEFORE the quoted message is visible too — which is usually why
    // someone went looking for it.
    container.scrollTo({ top: container.scrollTop + top - container.clientHeight * 0.3, behavior: 'smooth' });

    setJumpedTo(messageId);
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = setTimeout(() => setJumpedTo(null), 2000);
  }, []);

  // A pending mark must die with the component, or it fires setState on
  // something that is gone.
  useEffect(
    () => () => {
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    },
    [],
  );

  const onCall = call.phase === 'connecting' || call.phase === 'active';
  /**
   * The far end's picture, once it exists — not simply "is this a video
   * call". The stream arrives when WebRTC negotiates it, which is after
   * the answer, so between accepting and the first frame there is a
   * moment with nothing to show. The avatar covers it.
   */
  const showRemoteVideo = call.media === 'video' && onCall && Boolean(call.remoteStream);
  /** This side's own camera, from the moment it opens — including while
   *  an outgoing call is still ringing, which is when people check what
   *  they look like. */
  const showSelfView = call.media === 'video' && onCall && call.cameraOn && Boolean(call.localStream);

  /**
   * A MediaStream reaches a <video> through `srcObject`, a DOM property
   * with no HTML attribute behind it — React cannot set it as a prop.
   *
   * Declared here rather than beside the call screen it belongs to,
   * because there is an early return between the two and a hook may not
   * sit after one. Keyed on the visibility flag as well as the stream,
   * since the flag is what mounts the element: an effect on the stream
   * alone would run in the render before the element existed.
   */
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.srcObject = call.remoteStream;
    // Autoplay is permitted here — both call paths begin with a tap — and
    // the element is muted anyway, which browsers allow to play
    // regardless. The catch is for the odd case neither holds.
    void el.play().catch(() => {});
  }, [call.remoteStream, showRemoteVideo]);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = call.localStream;
    void el.play().catch(() => {});
  }, [call.localStream, showSelfView]);
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

  // Back closes the layer that is open rather than leaving the chat. Order
  // matters only in that each hook owns its own history entry; the browser
  // pops the most recently pushed, which is the innermost layer.
  const closeViewer = useCallback(() => setViewer(null), []);
  const closeEmoji = useCallback(() => setEmojiOpen(false), []);
  const closeReactions = useCallback(() => setReactingTo(null), []);
  const closeAttach = useCallback(() => setAttachOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeReport = useCallback(() => setReport(null), []);
  const closeDeleting = useCallback(() => setDeleting(null), []);
  useDismissOnBack(emojiOpen, closeEmoji);
  useDismissOnBack(reactingTo !== null, closeReactions);
  useDismissOnBack(attachOpen, closeAttach);
  useDismissOnBack(menuOpen, closeMenu);
  useDismissOnBack(viewer !== null, closeViewer);
  useDismissOnBack(report !== null, closeReport);
  useDismissOnBack(deleting !== null, closeDeleting);

  /**
   * The two gestures a bubble answers to.
   *
   * Hold opens the reaction row; a sideways drag starts a reply. Both live
   * in one handler because they share a pointer: a drag has to cancel the
   * hold, or scrolling the thread with a finger resting on a bubble opens
   * a reaction row every time.
   *
   * Pointer events rather than touch, so a held mouse works too, and the
   * bubble is select-none — otherwise the hold starts a text selection and
   * the browser's own handles appear instead of ours.
   */
  const bubbleGestures = useCallback(
    (message: ThreadMessage) => {
      // A message still on its way has only a temporary client id. Sending
      // that as a reply target or a reaction target asks the server about a
      // message it has never seen, and the outbox treats the refusal as
      // permanent and drops what the customer typed.
      if (message.pending) return {};

      const cancelHold = () => {
        const g = gestureRef.current;
        if (g.timer) clearTimeout(g.timer);
        g.timer = null;
      };

      return {
        onPointerDown: (e: React.PointerEvent) => {
          cancelHold();
          gestureRef.current = {
            timer: setTimeout(() => {
              gestureRef.current.acted = true;
              tapFeedback(14);
              setReactingTo(message.id);
            }, 420),
            startX: e.clientX,
            startY: e.clientY,
            dragging: false,
            acted: false,
          };
        },
        onPointerMove: (e: React.PointerEvent) => {
          const g = gestureRef.current;
          const dx = e.clientX - g.startX;
          const dy = e.clientY - g.startY;
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelHold();
          // Sideways and clearly not a scroll: the reply gesture.
          if (!g.dragging && dx > 56 && Math.abs(dy) < 34) {
            g.dragging = true;
            g.acted = true;
            tapFeedback(10);
            setReplyTo(message);
            inputRef.current?.focus();
          }
        },
        onPointerUp: cancelHold,
        onPointerLeave: cancelHold,
        onPointerCancel: cancelHold,
        // A hold or a swipe is not also a tap. Without this, long-pressing a
        // photo opens the reaction row and the lightbox, and swiping a voice
        // note starts playing it.
        onClickCapture: (e: React.MouseEvent) => {
          if (!gestureRef.current.acted) return;
          gestureRef.current.acted = false;
          e.stopPropagation();
          e.preventDefault();
        },
      };
    },
    [],
  );

  /**
   * Sends whatever is waiting, oldest first, and stops at the first
   * failure.
   *
   * Order matters: a customer who typed three lines expects them in that
   * order at the other end, so a failure has to halt the loop rather than
   * skip past and deliver the rest out of sequence. A rejected fetch means
   * no connection — the item stays queued. An error the server answered
   * with means this message will never be accepted, so it is dropped and
   * reported rather than retried forever.
   */
  const flushOutbox = useCallback(async () => {
    if (flushingRef.current || demo) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    flushingRef.current = true;
    try {
      while (outboxRef.current.length > 0) {
        const item = outboxRef.current[0]!;
        try {
          const saved = await sendMessage(token, item.text, item.replyToMessageId);
          outboxRef.current = outboxRef.current.slice(1);
          writeOutbox(token, outboxRef.current);
          setQueuedCount(outboxRef.current.length);
          setMessages((prev) => mergeMessage(prev.filter((m) => m.id !== item.id), saved));
        } catch (err) {
          if (err instanceof GuestLinkInvalidError) {
            outboxRef.current = [];
            writeOutbox(token, []);
            setQueuedCount(0);
            setPhase('invalid');
            return;
          }
          if (err instanceof GuestNetworkError) {
            // Still no connection. Leave everything queued; the online
            // event or the socket reconnecting will call this again.
            setOffline(true);
            return;
          }
          // The server answered and refused. Retrying cannot help.
          outboxRef.current = outboxRef.current.slice(1);
          writeOutbox(token, outboxRef.current);
          setQueuedCount(outboxRef.current.length);
          setMessages((prev) => prev.filter((m) => m.id !== item.id));
          setErrorText(err instanceof Error ? err.message : 'Message could not be sent');
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [token, demo]);

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
        // The block survives the tab that set it, so it is restored here
        // rather than being state the window only ever learns about from
        // its own tap.
        setBlockedState(Boolean(loadedSession.blocked));
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

    /**
     * One round trip, timed here and nowhere else.
     *
     * Re-read on every measurement rather than captured once: socket.io
     * upgrades from polling to WebSocket after connecting, so a name read
     * at connect time can describe a transport that is already gone.
     */
    const measure = () => {
      const started = performance.now();
      const name = s.io.engine?.transport?.name ?? 'unknown';
      let answered = false;
      s.timeout(8000).emit('ping:check', () => {
        if (answered) return;
        answered = true;
        const rtt = Math.round(performance.now() - started);
        setLink({ transport: name, rtt });
        console.log(`[perf] socket ${name} rtt=${rtt}ms`);
      });
      // An older server has no handler for this, so the ack never comes.
      // The timeout above fires the callback with an error argument we
      // ignore; what matters is that the readout says so instead of
      // showing a stale number forever.
      setLink((prev) => prev ?? { transport: name, rtt: null });
    };

    s.on('connect', () => {
      setConnected(true);
      setOffline(false);
      // Not immediately: the upgrade from polling to WebSocket happens in
      // the first moments of a connection, and measuring before it lands
      // reports the transport that is on its way out.
      window.setTimeout(measure, 1200);
      // The reliable "you are reachable again" signal — see the online
      // listener above for why navigator.onLine alone is not enough.
      void flushOutbox();
    });
    s.on('disconnect', () => setConnected(false));
    // The link was revoked or expired while the page sat open. The server
    // has already closed the socket; showing it as disconnected is more
    // honest than a silent, permanently idle window.
    s.on('connect_error', () => setConnected(false));

    s.on('message:new', (payload: RealtimeMessage) => {
      // A reaction is a row in the same collection but not a message on
      // screen. Rendered as one it became a lone emoji bubble that vanished
      // on the next reload, because the page query leaves reaction rows
      // out. It belongs on the message it points at.
      if (payload.type === 'reaction') {
        const target = payload.replyToMessageId;
        if (!target || !payload.text) return;
        const emoji = payload.text;
        const mine = payload.direction === 'IN';
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== target) return m;
            const others = (m.reactions ?? []).filter((r) => r.mine !== mine);
            return { ...m, reactions: [...others, { emoji, mine }] };
          }),
        );
        return;
      }

      const incoming = realtimeToGuestMessage(payload);
      setMessages((prev) => mergeMessage(prev, incoming));
      if (incoming.from === 'business') markRead(token);
      // A message means they finished typing, whether or not a stop event
      // arrives — and it always looks wrong to still say "typing" under a
      // message that has already landed.
      setAgentTyping(false);
    });

    /**
     * A message that changed after it was sent — today, only one that was
     * taken back.
     *
     * It arrives for both directions: the business withdrawing one of
     * theirs, and this customer's own revoke echoing back from another
     * tab they left open. Applied by replacing the row rather than
     * removing it, because the business sees a tombstone too and a
     * thread that silently drops a message reads as a bug to whoever is
     * looking at the other half of the conversation.
     *
     * Nothing is done for an update to a message this window has never
     * loaded: it is above the page the customer is looking at, and the
     * fetch that eventually reaches it already returns it withdrawn.
     */
    s.on('message:updated', (payload: RealtimeMessage) => {
      if (!payload?.id || !payload.revokedAt) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.id
            ? {
                ...m,
                revokedAt: payload.revokedAt,
                revokedBy: payload.revokedBy,
                text: undefined,
                mediaId: undefined,
                hasMedia: false,
                location: undefined,
                localUrl: undefined,
                reactions: undefined,
              }
            : m,
        ),
      );
      setReplyTo((prev) => (prev?.id === payload.id ? null : prev));
      setDeleting((prev) => (prev?.id === payload.id ? null : prev));
    });

    // The other half of the ticks. The window already tells the server
    // when the CUSTOMER reads; this is the server telling the window when
    // an agent has read theirs, so a message does not sit on two grey
    // ticks after someone has plainly seen it.
    s.on('message:status', (payload: { messageId?: string; status?: string }) => {
      const id = payload?.messageId;
      const next = guestStatusFrom(payload?.status);
      if (!id || !next) return;
      setMessages((prev) =>
        prev.map((m) =>
          // Only forwards. Status events can arrive out of order, and a
          // late DELIVERED after a READ would take a green tick back to
          // grey in front of the customer.
          m.id === id && rankStatus(next) > rankStatus(m.status) ? { ...m, status: next } : m,
        ),
      );
    });

    s.on('agent:presence', (payload: { online: boolean }) => setAgentOnline(Boolean(payload?.online)));

    s.on('typing:start', () => {
      setAgentTyping(true);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingClearRef.current = setTimeout(() => setAgentTyping(false), 6000);
    });
    s.on('typing:stop', () => setAgentTyping(false));

    // Every half minute, because one reading on a mobile network says
    // very little — the number people actually live with is the spread.
    const repeat = window.setInterval(measure, 30_000);

    setSocket(s);

    return () => {
      window.clearInterval(repeat);
      s.off('message:new');
      s.off('message:updated');
      s.off('message:status');
      s.off('agent:presence');
      s.off('typing:start');
      s.off('typing:stop');
      s.disconnect();
      setSocket(null);
      setAgentOnline(false);
      setAgentTyping(false);
    };
  }, [phase, token, demo, flushOutbox]);

  // ---- the outbox ---------------------------------------------------
  useEffect(() => {
    if (phase !== 'ready' || demo) return;

    // Anything typed before the tab was closed comes back as pending
    // bubbles in its original place, then goes out.
    const restored = readOutbox(token);
    outboxRef.current = restored;
    setQueuedCount(restored.length);
    if (restored.length > 0) {
      setMessages((prev) => restored.map(outboxToMessage).reduce(mergeMessage, prev));
    }
    void flushOutbox();
  }, [phase, token, demo, flushOutbox]);

  useEffect(() => {
    const update = () => {
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setOffline(isOffline);
      if (!isOffline) void flushOutbox();
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // navigator.onLine lies often — it reports a WiFi association, not
    // whether anything is reachable through it. The socket reconnecting is
    // the honest signal that a send will now go through, so that retries
    // too, and the two together cover both directions.
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [flushOutbox]);

  /**
   * Scrolls the transcript, and nothing else.
   *
   * This was `bottomRef.scrollIntoView()`, which walks EVERY scrollable
   * ancestor and moves each one until the element is in view. On iOS
   * Safari the document is one of those ancestors, so pressing
   * jump-to-latest scrolled the PAGE instead of the thread — the customer
   * asked for the newest message and watched the whole window travel
   * upwards.
   *
   * The container is the only thing that should move here, so it is the
   * only thing this touches.
   */
  const pinToBottom = useCallback((smooth = false) => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // ---- keep the newest message in view ------------------------------
  useEffect(() => {
    // Not while older messages are being spliced in above — that is a
    // length change too, and jumping to the bottom is the opposite of
    // what the customer just asked for. Not either when they have
    // scrolled up to read: the jump-to-latest button is there for that.
    if (loadingOlder || !atBottom) return;
    pinToBottom(true);
  }, [messages.length, loadingOlder, atBottom, agentTyping, emojiOpen, pinToBottom]);

  /**
   * Keeps the view pinned to the bottom while content grows underneath it.
   *
   * The effect above fires on the message list changing, which is the
   * wrong moment for anything whose height is not known until later — a
   * photo, most of all. The bubble is laid out at nearly zero height, the
   * scroll lands on it, and the image then decodes and pushes several
   * hundred pixels of thread below the fold. What the customer sees is a
   * chat that opened halfway up, on a message from an hour ago.
   *
   * A ResizeObserver on the content catches every such growth — decoded
   * images, a wrapped line after a font swap, anything a later change adds
   * — and only re-pins while the customer is already at the bottom, so it
   * can never yank someone who has scrolled up to read.
   */
  useEffect(() => {
    const content = contentRef.current;
    if (phase !== 'ready' || !content || typeof ResizeObserver === 'undefined') return;

    let first = true;
    const observer = new ResizeObserver(() => {
      // The observer's own first call reports the current size rather than
      // a change; the effect above has already handled that.
      if (first) {
        first = false;
        return;
      }
      if (!atBottomRef.current || loadingOlderRef.current) return;
      // 'auto', not 'smooth': this fires while things are still settling,
      // and a smooth scroll restarted every few milliseconds never
      // arrives.
      pinToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [phase, pinToBottom]);

  /**
   * Paging waits for the opening jump to the newest message to finish.
   *
   * Its own effect, keyed only on the thread being ready — tied to the
   * scroll effect it never ran for anyone who scrolled up in the first
   * second, because that effect returns early once atBottom is false and
   * its cleanup cancelled the timer. Those customers got a thread that
   * would never load another page for as long as it stayed open.
   */
  useEffect(() => {
    if (phase !== 'ready') return;
    const settle = setTimeout(() => {
      settledRef.current = true;
    }, 700);
    return () => clearTimeout(settle);
  }, [phase]);

  const scrollToBottom = useCallback(() => {
    // Instant, not smooth. A smooth scroll emits scroll events the whole
    // way down, and the first one that lands within 120px of the end
    // flips `atBottom` — which re-runs the effect above and starts a
    // second animation on top of the one still running. Instant arrives
    // once and stays.
    pinToBottom();
    // A photo still decoding grows the thread AFTER the scroll position
    // has been worked out, which leaves the view short of the real bottom
    // — the exact gap this button exists to close. Re-pinned once this
    // frame's layout lands, and again after a late decode.
    requestAnimationFrame(() => pinToBottom());
    window.setTimeout(() => pinToBottom(), 150);
  }, [pinToBottom]);

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
      // Widened in the same commit as the prepend, so the one scroll
      // correction below covers both. Left out, a fetch made at the exact
      // moment the thread filled the window appended a page the window
      // then sliced straight back off — a pull that visibly did nothing.
      setRenderWindow((w) => w + page.items.length);
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

  /**
   * Going further back, one step at a time.
   *
   * Never both at once. Growing the window and fetching a page in the same
   * tick meant the scroll restore in loadOlder measured a height that
   * changed underneath it, so the thread jumped; and the pull gesture,
   * which only fetched, appended a page that the window then sliced off —
   * a pull that visibly did nothing once the thread passed the window size.
   */
  const showOlder = useCallback(() => {
    const container = transcriptRef.current;

    if (messagesRef.current.length > renderWindow) {
      // Revealing rows above the viewport pushes everything down exactly
      // the way fetching a page does, and needs the same correction —
      // without it, uncovering a hundred and twenty messages threw the
      // reader a hundred and twenty messages backwards.
      const heightBefore = container?.scrollHeight ?? 0;
      setRenderWindow((w) => w + RENDER_WINDOW_STEP);
      requestAnimationFrame(() => {
        if (container) container.scrollTop += container.scrollHeight - heightBefore;
      });
      return;
    }

    void loadOlder();
  }, [renderWindow, loadOlder]);

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
      replyTo: replyTo
        ? { id: replyTo.id, from: replyTo.from, preview: previewOfMessage(replyTo) }
        : undefined,
    };

    setReplyTo(null);
    setSending(true);
    setDraft('');
    setEmojiOpen(false);
    tapFeedback();
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

    // Queued first, sent second — always, not only when offline. The
    // queue is what survives the tab being closed mid-send, and a message
    // that took the direct path would be the one message that did not.
    outboxRef.current = [
      ...outboxRef.current,
      {
        id: tempId,
        text,
        createdAt: optimistic.createdAt,
        // Not a message that has no server id yet. A temp id means
        // nothing to the server, which drops the quote and keeps the
        // reply — so the cost is only ever a missing quote, but sending
        // junk it has to discard is not the way to arrive at that. The
        // media path has always guarded this; the viewer's Reply button
        // is what made a still-uploading photo easy to aim at.
        replyToMessageId: replyTo && !replyTo.pending ? replyTo.id : undefined,
        replyPreview: replyTo
          ? { id: replyTo.id, from: replyTo.from, preview: previewOfMessage(replyTo) }
          : undefined,
      },
    ];
    writeOutbox(token, outboxRef.current);
    setQueuedCount(outboxRef.current.length);
    setSending(false);
    void flushOutbox();
  }, [draft, sending, token, stopTyping, demo, flushOutbox, replyTo]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;

      if (demo) {
        flashRef.current?.('Demo chat — photos are not uploaded anywhere. Open a real link to send one.');
        return;
      }

      // The quote does not carry to a photo, and leaving the banner up
      // silently attached it to whatever text was typed next.
      setReplyTo(null);
      setErrorText(null);
      setAtBottom(true);
      setUploading((n) => n + files.length);

      // On screen before a byte has moved, the way every messenger does
      // it. Picking a photo used to show nothing at all in the thread
      // until the upload finished, so on a slow connection the customer
      // had no evidence anything had happened.
      const batchId = `local-${Date.now()}`;
      const previews: ThreadMessage[] = files.map((file, i) => ({
        id: `${batchId}-${i}`,
        from: 'me',
        type: file.type.startsWith('video/') ? 'video' : 'image',
        hasMedia: true,
        createdAt: new Date().toISOString(),
        pending: true,
        localUrl: URL.createObjectURL(file),
        uploadProgress: 0,
      }));
      setMessages((prev) => [...prev, ...previews]);

      const dropPreviews = () => {
        for (const p of previews) if (p.localUrl) URL.revokeObjectURL(p.localUrl);
        const ids = new Set(previews.map((p) => p.id));
        setMessages((prev) => prev.filter((m) => !ids.has(m.id)));
      };

      try {
        const { sent, failed } = await uploadImages(token, files, (fraction) => {
          const ids = new Set(previews.map((p) => p.id));
          // One progress figure for the whole multipart body, shown on
          // every bubble in the batch. Per-file progress is not something
          // one request can report, and a bar that only moved on the last
          // photo would be worse than one that moves on all of them.
          setMessages((prev) =>
            prev.map((m) => (ids.has(m.id) ? { ...m, uploadProgress: fraction } : m)),
          );
        });
        dropPreviews();
        setMessages((prev) => sent.reduce(mergeMessage, prev));
        // Partial success is still success for what got through; only the
        // ones that did not are worth saying anything about.
        if (failed.length > 0) {
          setErrorText(
            failed.length === 1 ? failed[0]!.message : `${failed.length} images could not be sent.`,
          );
        }
      } catch (err) {
        dropPreviews();
        if (err instanceof GuestLinkInvalidError) setPhase('invalid');
        else setErrorText(err instanceof Error ? err.message : 'Could not send those images.');
      } finally {
        setUploading((n) => Math.max(0, n - files.length));
      }
    },
    [token, demo],
  );

  /**
   * Sharing where the customer is.
   *
   * The browser's own permission prompt is the gate — there is no way to
   * ask for a position without it, and no way to get one the customer has
   * not agreed to hand over. What this adds is an answer for each way it
   * can end, because the failures are common and mutually unhelpful: a
   * refused prompt, a device with the radio off, and a fix that never
   * arrives all look identical from here unless they are told apart.
   *
   * No watchPosition and no repeat: this sends one place once. A window
   * that kept a location subscription open after a single share would be
   * tracking someone who asked to be pinned, which is a different thing
   * from what the button says.
   */
  const shareLocation = useCallback(async () => {
    setAttachOpen(false);

    if (demo) {
      // A canned pin, and the browser's location API is never called at
      // all. Showing the card is the point of a demo; reading someone's
      // actual position to populate a page they opened to look around
      // would be taking something real for a pretend send.
      setAtBottom(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `demo-loc-${Date.now()}`,
          from: 'me',
          type: 'location',
          text: 'Location (12.961100, 77.638700)',
          hasMedia: false,
          createdAt: new Date().toISOString(),
          location: { latitude: 12.9611, longitude: 77.6387 },
        },
      ]);
      flashRef.current?.('Demo chat — that is a sample pin. Your real location was never read.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      flashRef.current?.('This browser cannot share a location.');
      return;
    }

    setLocating(true);
    let position: GeolocationPosition;
    try {
      position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          // Long enough for a cold GPS fix outdoors, short enough that a
          // device that is never going to answer stops pretending to try.
          timeout: 15_000,
          // A fix from the last half minute is the same place. Re-acquiring
          // it costs seconds and battery for no difference.
          maximumAge: 30_000,
        });
      });
    } catch (err) {
      const code = (err as GeolocationPositionError | undefined)?.code;
      flashRef.current?.(
        code === 1
          ? 'Location blocked. Allow it in your browser’s site settings to share where you are.'
          : code === 3
            ? 'Could not get a location in time. Try again somewhere with a clearer sky or signal.'
            : 'Could not get your location. Check that location is turned on for this device.',
      );
      return;
    } finally {
      setLocating(false);
    }

    setReplyTo(null);
    setErrorText(null);
    setAtBottom(true);
    tapFeedback(10);

    try {
      const sent = await sendLocation(token, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        replyToMessageId: replyTo && !replyTo.pending ? replyTo.id : undefined,
      });
      setMessages((prev) => mergeMessage(prev, sent));
    } catch (err) {
      if (err instanceof GuestLinkInvalidError) setPhase('invalid');
      else setErrorText(err instanceof Error ? err.message : 'Could not send your location.');
    }
  }, [demo, token, replyTo]);

  /**
   * What this browser can do about notifications, decided after mount.
   *
   * Also the moment an already-granted registration is refreshed: FCM
   * rotates tokens, and a browser holding one the server has never seen
   * stops receiving anything without either side noticing. Nobody is
   * prompted by this — refreshPush returns immediately unless permission
   * was already given.
   */
  useEffect(() => {
    if (demo) return;
    const support = pushSupport();
    setPush(support);

    // Asked once. Someone who closed the bar came here to talk to a
    // business, not to be asked again every time they open the link.
    try {
      setNotifyDismissed(window.localStorage.getItem(`wa-notify-asked:${token}`) === '1');
    } catch {
      // A private window, or storage the browser has switched off. Not
      // asking is the safer failure: the bar is still reachable, and
      // asking on every load is the version that annoys.
      setNotifyDismissed(true);
    }

    if (support === 'granted') {
      void refreshPush((pushToken) => savePushToken(token, pushToken));
    }
  }, [token, demo]);

  const dismissNotifyBar = useCallback(() => {
    setNotifyDismissed(true);
    try {
      window.localStorage.setItem(`wa-notify-asked:${token}`, '1');
    } catch {
      /* nothing to remember it in; the bar simply reappears next time */
    }
  }, [token]);

  const turnOnNotifications = useCallback(async () => {
    setPushBusy(true);
    try {
      const result = await enablePush((pushToken) => savePushToken(token, pushToken));
      setPush(result);
      if (result === 'granted') {
        flashRef.current?.('Notifications are on. We will tell you when they reply.');
      } else if (result === 'denied') {
        // The browser will not ask again, so pointing at where it can be
        // undone is the only useful thing left to say.
        flashRef.current?.('Notifications are blocked for this site. You can allow them in your browser settings.');
      }
    } finally {
      setPushBusy(false);
      // Either way it has been asked, and asking again on the next load
      // would be asking a question the browser has already answered.
      dismissNotifyBar();
    }
  }, [token, dismissNotifyBar]);

  /** Turning the block off from the bar at the bottom of the window. */
  const unblock = useCallback(async () => {
    if (demo) {
      setBlockedState(false);
      return;
    }
    try {
      await setBlocked(token, false);
      setBlockedState(false);
      flashRef.current?.('Unblocked. You can send messages again.');
    } catch (err) {
      if (err instanceof GuestLinkInvalidError) setPhase('invalid');
      else flashRef.current?.('Could not unblock just now. Try again in a moment.');
    }
  }, [demo, token]);

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
    if (started) {
      // Longer than a send: the customer needs to know recording began
      // without looking, because they are about to start talking.
      tapFeedback(18);
      return;
    }

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

    setReplyTo(null);
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

  /**
   * Toggling a reaction.
   *
   * Applied locally before the request, and rolled back if it fails: a
   * reaction is a one-tap gesture, and a tap that does nothing for a
   * round trip reads as a tap that missed.
   */
  const react = useCallback(
    async (messageId: string, emoji: string) => {
      setReactingTo(null);
      tapFeedback(12);

      // Read before the update, not inside it. A setState updater runs at
      // the next render, so reading a variable it assigns is reading it
      // before it has been written — which made every removal POST an add,
      // and made the rollback wipe the business's reactions along with the
      // customer's.
      const target = messagesRef.current.find((m) => m.id === messageId);
      const previous = target?.reactions;
      const had = previous?.some((r) => r.mine && r.emoji === emoji) ?? false;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const others = (m.reactions ?? []).filter((r) => !r.mine);
          return { ...m, reactions: had ? others : [...others, { emoji, mine: true }] };
        }),
      );

      if (demo) return;

      try {
        await sendReaction(token, messageId, had ? '' : emoji);
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: previous } : m)));
        flashRef.current?.('Could not save that reaction.');
      }
    },
    [token, demo],
  );

  /**
   * What the window does once the server has accepted a delete.
   *
   * 'me' drops the row outright — the server will not send it again, so
   * there is nothing to reconcile with. 'everyone' leaves the row in
   * place as a tombstone rather than removing it, because the business
   * sees one too and a thread that silently loses a message reads as a
   * bug to whoever is looking at the other half of it.
   *
   * The socket event for the same revoke arrives moments later and does
   * exactly this again, which is why it is written as a replacement
   * rather than a toggle.
   */
  const applyDeleted = useCallback((message: ThreadMessage, scope: 'me' | 'everyone') => {
    setMessages((prev) =>
      scope === 'me'
        ? prev.filter((m) => m.id !== message.id)
        : prev.map((m) =>
            m.id === message.id
              ? {
                  ...m,
                  revokedAt: new Date().toISOString(),
                  revokedBy: 'customer' as const,
                  // The server really deleted these; a bubble still
                  // holding its text after "delete for everyone" is the
                  // one thing this must never look like.
                  text: undefined,
                  mediaId: undefined,
                  hasMedia: false,
                  location: undefined,
                  localUrl: undefined,
                  reactions: undefined,
                }
              : m,
          ),
    );
    // A reply still pointing at it would keep the customer answering a
    // message that is no longer there.
    setReplyTo((prev) => (prev?.id === message.id ? null : prev));
  }, []);

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

  /**
   * The slice of the thread actually put in the document.
   *
   * Everything older than the window is fetched and held in state; it is
   * simply not rendered until scrolling up asks for it, at which point the
   * window grows by a step. Nobody has ever looked at the top of a
   * thousand-message thread without scrolling there first.
   */
  const visible = useMemo(
    () => (messages.length > renderWindow ? messages.slice(-renderWindow) : messages),
    [messages, renderWindow],
  );

  /**
   * The albums in what is on screen, and which messages belong to one.
   *
   * Two lookups rather than a restructured list: the render below reads
   * each message's neighbours by index for its bubble corners, and
   * rewriting that to walk groups would have touched every line of it.
   * The first photo of a run draws the whole grid; the rest draw nothing.
   */
  const { albumByFirstId, inAlbum } = useMemo(() => {
    const byFirst = new Map<string, ThreadMessage[]>();
    const members = new Set<string>();
    for (const item of groupThread(visible)) {
      if (item.kind !== 'album') continue;
      byFirst.set(item.messages[0]!.id, item.messages);
      for (const m of item.messages) members.add(m.id);
    }
    return { albumByFirstId: byFirst, inAlbum: members };
  }, [visible]);

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

  if (phase === 'loading') return <ChatSkeleton />;

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
      {/* No back button. This window is opened from a link, so there is
          almost never anywhere to go back TO — history.back() either did
          nothing or dropped the customer out of the conversation onto
          whatever page happened to precede it. An arrow that usually does
          nothing reads as a broken control, and the space it took is
          better given to the name. */}
      <header className="z-20 flex shrink-0 items-center gap-2 bg-[var(--wa-header)] px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] text-[var(--wa-header-text)] shadow-[0_1px_2px_rgba(11,20,26,0.08)]">
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--wa-accent)]/18 text-[13px] font-semibold text-[var(--wa-accent)]">
            <BusinessFace photo={businessAvatar} initials={initials} iconClass="h-6 w-6 opacity-70" />
          </div>
        </div>

        <div className="min-w-0 flex-1 pl-1">
          <h1 className="flex items-center gap-1 text-[17px] font-medium leading-tight">
            <span className="truncate">{title}</span>
            <BusinessBadge
              verified={session?.verifiedByWhatsApp}
              className="h-[17px] w-[17px] translate-y-[0.5px]"
            />
          </h1>
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

        <button
          type="button"
          onClick={() => void call.startCall('video')}
          disabled={callActive || !connected || blocked}
          aria-label="Video call"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-35"
        >
          <VideoIcon className="h-[22px] w-[22px]" />
        </button>

        <button
          type="button"
          onClick={() => void call.startCall('audio')}
          disabled={callActive || !connected || blocked}
          aria-label="Voice call"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-35"
        >
          <PhoneIcon className="h-[22px] w-[22px]" />
        </button>

        {/* The overflow menu, where the messenger keeps the actions that
            are about the chat rather than in it. Block and Report belong
            here and nowhere else in the header: they are rare, they are
            consequential, and a one-tap button for either would be reached
            by accident. */}
        <div className="relative mr-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-10 w-9 items-center justify-center rounded-full transition active:scale-90"
          >
            <MoreIcon className="h-[19px] w-[19px]" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                role="menu"
                className="absolute right-1 top-[calc(100%-2px)] z-50 w-[232px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[8px] bg-[var(--wa-card)] py-1 shadow-[var(--wa-panel-shadow)]"
              >
                <MenuItem
                  icon={<FlagIcon className="h-[17px] w-[17px]" />}
                  onClick={() => {
                    setMenuOpen(false);
                    setReport({ message: null, intent: 'report' });
                  }}
                >
                  Report this chat
                </MenuItem>
                {/* The one entry here that changes something, coloured to
                    say so. Unblock is the same switch going the other way
                    and is not a warning, so it loses the red. */}
                <MenuItem
                  icon={<BlockIcon className="h-[17px] w-[17px]" />}
                  tone={blocked ? 'accent' : 'danger'}
                  onClick={() => {
                    setMenuOpen(false);
                    if (blocked) {
                      void unblock();
                      return;
                    }
                    setReport({ message: null, intent: 'block' });
                  }}
                >
                  {blocked ? `Unblock ${title}` : `Block ${title}`}
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Transcript ─────────────────────────────────────────── */}
      <div className="wa-wall relative min-h-0 flex-1">
        <div
          ref={transcriptRef}
          onPointerDownCapture={(e) => {
            // A tap anywhere that is not the row itself dismisses it. Capture
            // phase so it runs before the bubble's own gesture handler
            // re-opens the row that was just closed.
            if (reactingTo && !(e.target as HTMLElement).closest('[data-reaction-row]')) {
              setReactingTo(null);
            }
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (settledRef.current && el.scrollTop < 80) showOlder();
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
          }}
          /* Pull down at the top to fetch the page before. Scrolling to the
             top already triggers it, but on a phone that only works if
             there is enough thread to scroll — and the gesture is what
             people reach for anyway. */
          onTouchStart={(e) => {
            pullStartRef.current =
              e.currentTarget.scrollTop <= 0 && olderCursor ? (e.touches[0]?.clientY ?? null) : null;
          }}
          onTouchMove={(e) => {
            const start = pullStartRef.current;
            if (start === null) return;
            const delta = (e.touches[0]?.clientY ?? start) - start;
            // Damped, so the thread follows the finger without travelling
            // as far as it — the resistance is what says "this is the end".
            setPullDistance(delta > 0 ? Math.min(72, delta * 0.45) : 0);
          }}
          onTouchEnd={() => {
            if (pullDistance > 44) {
              tapFeedback(10);
              showOlder();
            }
            pullStartRef.current = null;
            setPullDistance(0);
          }}
          className="wa-scroll absolute inset-0 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4"
        >
          {(pullDistance > 0 || loadingOlder) && (
            <div
              className="pointer-events-none flex items-center justify-center overflow-hidden transition-[height] duration-150"
              style={{ height: loadingOlder ? 36 : pullDistance }}
              aria-hidden
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full bg-[var(--wa-chip)] text-[var(--wa-chip-text)] shadow-[var(--wa-bubble-shadow)] ${
                  loadingOlder ? 'animate-spin' : ''
                }`}
                style={{ transform: loadingOlder ? undefined : `rotate(${pullDistance * 4}deg)` }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <path d="M12 5v9M8 9l4-4 4 4" />
                </svg>
              </span>
            </div>
          )}
          <div ref={contentRef} className="mx-auto w-full max-w-[1100px]">
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
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--wa-accent)]/18 text-xl font-semibold text-[var(--wa-accent)]">
                <BusinessFace photo={businessAvatar} initials={initials} iconClass="h-9 w-9 opacity-70" />
              </div>
              <p className="flex items-center justify-center gap-1.5 text-[17px] font-medium leading-tight">
                {title}
                <BusinessBadge
                  verified={session?.verifiedByWhatsApp}
                  className="h-[18px] w-[18px] translate-y-[1px]"
                />
              </p>

              {session?.businessPhone && (
                <p className="mt-1 text-[13px] text-[var(--wa-card-sub)]">{session.businessPhone}</p>
              )}

              {/* One line, and every clause in it is something this window
                  can actually stand behind.
                  "Verified business" is shown only where Meta reports the
                  display name APPROVED — it is Meta's word, not ours, and it
                  disappears when Meta has not given it.
                  "No ads or spam" is a fact about the architecture rather
                  than a promise about conduct: a link token stands for
                  exactly one conversation with one business, so nobody else
                  can reach the customer through this window at all. */}
              <div className="mt-3 flex items-start justify-center gap-1.5 border-t border-[var(--wa-divider)] pt-3">
                <span className="mt-[2px] shrink-0 text-[var(--wa-accent)]" aria-hidden>
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                    <path d="M8 .9 2 3.4v4.2c0 3.5 2.6 6.4 6 7.5 3.4-1.1 6-4 6-7.5V3.4zm-.9 10.2L4.4 8.4l1.2-1.2 1.5 1.5 3.3-3.3 1.2 1.2z" />
                  </svg>
                </span>
                <p className="text-[12.5px] leading-[17px] text-[var(--wa-card-sub)]">
                  {session?.verifiedByWhatsApp ? (
                    <>
                      <span className="font-medium text-[var(--wa-accent)]">Verified business</span> ·
                      your chat here is private and secure. No ads or spam.
                    </>
                  ) : (
                    <>
                      <span className="font-medium">WhatsApp Business account</span> · your chat here
                      is private and secure. No ads or spam.
                    </>
                  )}
                </p>
              </div>
            </div>

            <ul className="flex flex-col">
              {visible.map((m, i) => {
                // Photos sent together are drawn once, as a grid, by the
                // first of them; the rest render nothing of their own.
                const album = albumByFirstId.get(m.id);
                if (album) {
                  return (
                    <AlbumRow
                      key={`album-${m.id}`}
                      messages={album}
                      token={token}
                      mine={m.from === 'me'}
                      newDay={!visible[i - 1] || dayLabel(visible[i - 1]!.createdAt) !== dayLabel(m.createdAt)}
                      // The whole batch, not the three that have tiles —
                      // the viewer's strip is how the hidden ones are
                      // reached at all.
                      onOpen={(index) => setViewer({ photos: album, index })}
                    />
                  );
                }
                if (inAlbum.has(m.id)) return null;

                const prev = visible[i - 1];
                const next = visible[i + 1];
                const mine = m.from === 'me';
                const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                const first = newDay || startsNewGroup(m, prev);
                const last =
                  !next || dayLabel(next.createdAt) !== dayLabel(m.createdAt) || startsNewGroup(next, m);
                // A local preview counts as an image too: the file is on
                // screen before the server has an id for it.
                // Taken back by whoever sent it. The server clears the
                // content when it does that, so every branch below would
                // already fall through to nothing — this is what puts the
                // tombstone in the empty bubble, and what stops a payload
                // from an older server rendering a photo it should not.
                const revoked = Boolean(m.revokedAt);
                const isImage =
                  !revoked && (Boolean(m.mediaId) || Boolean(m.localUrl)) && m.type === 'image';
                const isVoice = !revoked && Boolean(m.mediaId) && m.type === 'audio';
                // Only when the coordinates actually came through. A
                // location message from before this field existed still has
                // its text line, and rendering it as a pin at (0, 0) would
                // be worse than rendering it as the sentence it is.
                const place = !revoked && m.type === 'location' ? m.location : undefined;
                const highlighted = report?.message?.id === m.id || jumpedTo === m.id;
                const hasReactions = (m.reactions?.length ?? 0) > 0;
                const stamp = (
                  <>
                    {formatTime(m.createdAt)}
                    {mine && <MessageTicks pending={m.pending} status={m.status} />}
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

                    <div
                      /* The anchor a jump scrolls to, and deliberately
                         NOT the <li> above: that is `display: contents`,
                         which generates no box at all, so asking it where
                         it is returns nothing useful and the jump would
                         land at the top of the thread every time. */
                      id={rowDomId(m.id)}
                      className={[
                        // Not wa-row while this message's reaction row is
                        // open: content-visibility's paint containment clips
                        // to the row's box, and the row of emoji sits above
                        // the bubble, outside it. One row rendering without
                        // containment for as long as a menu is open costs
                        // nothing.
                        reactingTo === m.id ? 'flex px-1' : 'wa-row flex px-1',
                        mine ? 'justify-end' : 'justify-start',
                        last ? 'mb-2' : 'mb-[2px]',
                        // Padding, not margin. content-visibility brings
                        // paint containment with it, which clips anything
                        // outside the row's own box — and the reaction chip
                        // deliberately hangs off the bottom of the bubble.
                        // Margin sits outside that box and was letting the
                        // chip be cut in half; padding grows the box so it
                        // fits inside.
                        hasReactions ? 'pb-3' : '',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'relative max-w-[85%] rounded-[7.5px] shadow-[var(--wa-bubble-shadow)] sm:max-w-[65%] md:max-w-[440px]',
                          isImage || place
                            ? 'p-[3px]'
                            : isVoice
                              ? 'px-[7px] pb-[6px] pt-[5px]'
                              : 'px-[9px] pb-[7px] pt-[6px]',
                          // The message the open report sheet is about. It
                          // stays exactly where it was in the thread — the
                          // ring is the whole highlight — so the customer
                          // can still read what came before and after it
                          // while deciding what to write.
                          highlighted ? 'wa-highlighted' : '',
                          mine ? 'bg-[var(--wa-out)]' : 'bg-[var(--wa-in)]',
                          // Only the opening bubble of a run carries a tail
                          // and a squared corner — a tail on every bubble is
                          // the tell of a chat UI copied from a screenshot.
                          first ? (mine ? 'wa-tail-out rounded-tr-none' : 'wa-tail-in rounded-tl-none') : '',
                          m.text ? 'select-none' : '',
                        ].join(' ')}
                        {...bubbleGestures(m)}
                      >
                        {m.replyTo && (
                          /* The quote sits inside the bubble with a bar down
                             its leading edge, the way the app it copies does
                             — a quote above the bubble reads as a separate
                             message. */
                          <button
                            type="button"
                            /* Tapping the quote goes to what it quotes —
                               the thing every messenger does, and the
                               reason a quote is worth rendering at all: a
                               reply to something from twenty messages ago
                               is unreadable until you can get back to it.

                               Its own button rather than the whole
                               bubble, because a plain tap on a bubble
                               already means other things here (opening a
                               photo, playing a voice note), and one
                               gesture that sometimes scrolls the thread
                               away instead is the worst kind of
                               surprise. */
                            onClick={(e) => {
                              e.stopPropagation();
                              jumpTo(m.replyTo!.id);
                            }}
                            aria-label="Go to the quoted message"
                            className={`mb-1 flex w-full items-stretch gap-2 overflow-hidden rounded-[5px] border-l-[3px] pl-2 pr-1 py-1 text-left text-[13px] leading-[17px] transition active:opacity-70 ${
                              m.replyTo.from === 'me'
                                ? 'border-[var(--wa-accent)] bg-black/[0.06]'
                                : 'border-[#53bdeb] bg-black/[0.05]'
                            }`}
                          >
                            <span className="min-w-0 flex-1 self-center">
                              <span className="block truncate font-medium text-[12px] text-[var(--wa-accent)]">
                                {m.replyTo.from === 'me' ? 'You' : title}
                              </span>
                              <span className="line-clamp-2 block text-[var(--wa-meta)]">
                                {m.replyTo.preview}
                              </span>
                            </span>
                            {/* The quoted photo itself. Without it a reply
                                to a picture said only "[photo]", which in
                                a thread of nine of them answers nothing. */}
                            {m.replyTo.mediaId && (
                              <QuotedPhoto
                                key={m.replyTo.mediaId}
                                token={token}
                                mediaId={m.replyTo.mediaId}
                              />
                            )}
                          </button>
                        )}

                        {revoked ? (
                          /* The line both sides read. Italic and dimmed
                             rather than styled as a normal message,
                             because it is not one — it is the shape a
                             message used to occupy, kept so the thread
                             still reads as the conversation that
                             happened. The icon is what makes it legible
                             at a glance among real bubbles. */
                          <p className="flex items-center gap-1.5 pr-[52px] text-[14.2px] italic leading-[19px] opacity-60">
                            <BlockIcon className="h-[15px] w-[15px] shrink-0" />
                            {m.revokedBy === 'customer'
                              ? mine
                                ? 'You deleted this message'
                                : 'This message was deleted'
                              : mine
                                ? 'This message was deleted'
                                : `${title} deleted this message`}
                          </p>
                        ) : isImage ? (
                          m.localUrl ? (
                            // Still going up: the picked file itself,
                            // under a cover that says how far it has got.
                            <span className="relative block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={m.localUrl}
                                alt=""
                                // w-auto, matching ChatImage below: w-full
                                // with object-cover stretched the picked
                                // file to the bubble and cropped it, so a
                                // portrait photo changed shape the moment
                                // the upload finished and the real image
                                // replaced it.
                                className="block max-h-[320px] w-auto max-w-full rounded-[7px] object-cover"
                              />
                              <UploadCover progress={m.uploadProgress} />
                            </span>
                          ) : (
                            <ChatImage
                              token={token}
                              mediaId={m.mediaId!}
                              onOpen={() => setViewer({ photos: [m], index: 0 })}
                            />
                          )
                        ) : isVoice ? (
                          <VoiceBubble token={token} mediaId={m.mediaId!} mine={mine} />
                        ) : place ? (
                          <LocationBubble place={place} mine={mine} />
                        ) : (
                          m.hasMedia &&
                          !m.text && (
                            <p className="italic text-[14.2px] opacity-70">[{m.type}]</p>
                          )
                        )}

                        {/* A location's text is its own coordinate line,
                            already printed inside the card. Repeating it
                            underneath is the sort of duplication that only
                            happens because the branch above forgot to
                            exclude it. */}
                        {m.text && !place && (
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
                            // The location card's stamp sits on its label
                            // strip, which is the bubble's own colour — so
                            // it takes the bubble's meta colour, not the
                            // white-on-photo treatment.
                            isImage && !m.text
                              ? 'bottom-[9px] right-[10px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]'
                              : place
                                ? 'bottom-[8px] right-[11px] text-[var(--wa-meta)]'
                                : 'bottom-[5px] right-[9px] text-[var(--wa-meta)]',
                          ].join(' ')}
                        >
                          {stamp}
                        </span>

                        {m.reactions && m.reactions.length > 0 && (
                          /* Overlapping the bottom edge, so a reaction reads
                             as attached to its message rather than as a tiny
                             message of its own underneath. */
                          <div
                            className={`absolute -bottom-[11px] flex items-center gap-0.5 rounded-full border border-[var(--wa-divider)] bg-[var(--wa-in)] px-1.5 py-[2px] text-[12px] shadow-[var(--wa-bubble-shadow)] ${
                              mine ? 'right-2' : 'left-2'
                            }`}
                          >
                            {m.reactions.map((r, ri) => (
                              <span key={`${r.emoji}-${ri}`}>{r.emoji}</span>
                            ))}
                          </div>
                        )}

                        {reactingTo === m.id && (
                          <div
                            data-reaction-row
                            // The row sits inside the bubble that carries the
                            // gestures. Without this, holding an emoji button
                            // for longer than the press threshold re-armed the
                            // hold, marked the gesture as acted, and the click
                            // guard then swallowed the button's own click —
                            // the reaction simply never happened.
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerMove={(e) => e.stopPropagation()}
                            className={`absolute -top-12 z-20 flex items-center gap-1 rounded-full bg-[var(--wa-card)] px-2 py-1.5 shadow-[var(--wa-panel-shadow)] ${
                              mine ? 'right-0' : 'left-0'
                            }`}
                          >
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => void react(m.id, emoji)}
                                aria-label={`React ${emoji}`}
                                className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none transition active:scale-90 hover:bg-[var(--wa-hover)]"
                              >
                                {emoji}
                              </button>
                            ))}

                            {!m.pending && !m.revokedAt && (
                              <>
                                <span
                                  className="mx-0.5 h-5 w-px shrink-0 bg-[var(--wa-divider)]"
                                  aria-hidden
                                />
                                {/* On every message, not only the
                                    customer's own: "delete for me" tidies
                                    this window and applies just as much to
                                    something the business sent. Which of
                                    the two deletes is actually on offer is
                                    the sheet's decision, not this
                                    button's. */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReactingTo(null);
                                    setDeleting(m);
                                  }}
                                  aria-label="Delete this message"
                                  title="Delete this message"
                                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 hover:bg-[var(--wa-hover)]"
                                >
                                  <TrashIcon className="h-[18px] w-[18px]" />
                                </button>
                                {/* Reporting one message lives here, at
                                    the end of the row a long press already
                                    opens, for the same reason the emoji do:
                                    it is about THIS message, and any other
                                    entry point would make the customer
                                    describe which one in words. Only
                                    messages from the business — reporting
                                    your own is not a thing anyone means to
                                    do. */}
                                {m.from === 'business' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReactingTo(null);
                                      setReport({ message: m, intent: 'report' });
                                    }}
                                    aria-label="Report this message"
                                    title="Report this message"
                                    className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90 hover:bg-[var(--wa-hover)]"
                                  >
                                    <FlagIcon className="h-[18px] w-[18px]" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {agentTyping && <TypingBubble />}

            {/* Report and Block where the conversation ends — see
                SafetyRow for why they are not pinned above the composer. */}
            <SafetyRow
              blocked={blocked}
              onReport={() => setReport({ message: null, intent: 'report' })}
              onBlock={() => setReport({ message: null, intent: 'block' })}
            />

            {/* Trailing breathing room under the last bubble. No ref:
                the scroll is done on the container itself now. */}
            <div className="h-1" />
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
      {/* Only when the device is actually OFFLINE.
          The "Sending N messages…" and "Sending N photos…" strips are
          gone. A message on its way already says so where the eye
          already is — the clock tick under the bubble, and the progress
          cover over the photo — so the strips repeated it in a band that
          pushed the whole thread up and down as it appeared and
          disappeared on every send. Losing a connection is different:
          nothing else on screen tells the customer that, which is why
          this half stays. */}
      {offline && (
        <p className="z-10 shrink-0 bg-[var(--wa-notice)] px-4 py-1.5 text-center text-[12px] font-medium text-[var(--wa-notice-text)]">
          {queuedCount > 0
            ? `No connection · ${queuedCount} ${queuedCount === 1 ? 'message' : 'messages'} will send when you're back online`
            : "No connection · you can keep typing, messages will send when you're back"}
        </p>
      )}

      {notice && (
        <p className="z-10 shrink-0 bg-[var(--wa-notice)] px-4 py-1.5 text-center text-[12px] font-medium text-[var(--wa-notice-text)]">
          {notice}
        </p>
      )}

      {errorText && (
        <p className="z-10 shrink-0 bg-[var(--wa-danger)]/12 px-4 py-1.5 text-center text-[12px] font-medium text-[var(--wa-danger)]">
          {errorText}
        </p>
      )}

      {/* Offered only where it can be granted, and only once. See
          pushSupport() for why an iPhone in a browser tab never sees it. */}
      {push === 'available' && !notifyDismissed && !recorder.recording && !blocked && (
        <NotifyBar
          businessName={title}
          busy={pushBusy}
          onEnable={() => void turnOnNotifications()}
          onDismiss={dismissNotifyBar}
        />
      )}

      {replyTo && !recorder.recording && (
        <div className="z-20 flex shrink-0 items-center gap-2 bg-[var(--wa-composer)] px-3 pt-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] border-l-[3px] border-[var(--wa-accent)] bg-[var(--wa-input)] px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-[var(--wa-accent)]">
                {replyTo.from === 'me' ? 'You' : title}
              </p>
              <p className="truncate text-[13px] text-[var(--wa-meta)]">{previewOfMessage(replyTo)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="Cancel reply"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--wa-icon)] transition active:scale-90"
          >
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}

      {emojiOpen && !recorder.recording && <EmojiPicker onPick={insertEmoji} />}

      {attachOpen && !recorder.recording && !blocked && (
        <AttachSheet
          locating={locating}
          onClose={() => setAttachOpen(false)}
          onPhotos={() => {
            setAttachOpen(false);
            fileInputRef.current?.click();
          }}
          onCamera={() => {
            setAttachOpen(false);
            cameraInputRef.current?.click();
          }}
          onLocation={() => void shareLocation()}
        />
      )}

      {/* ── Blocked ────────────────────────────────────────────────
          Replaces the composer rather than disabling it. A greyed-out
          text field still invites typing, and the message that gets typed
          into it is lost — while the one thing someone in this state is
          looking for is the way back out, which is the button. */}
      {blocked && !recorder.recording && (
        <div className="z-20 shrink-0 bg-[var(--wa-composer)] px-4 pb-[calc(0.7rem+env(safe-area-inset-bottom,0px))] pt-3 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[13.5px] font-medium text-[var(--wa-text)]">
            <BlockIcon className="h-4 w-4 text-[var(--wa-card-sub)]" />
            You blocked {title}
          </p>
          <p className="mx-auto mt-0.5 max-w-[330px] text-[12.5px] leading-[17px] text-[var(--wa-card-sub)]">
            They cannot message or call you here, and you cannot send messages either. Nothing in this
            chat has been deleted.
          </p>
          <button
            type="button"
            onClick={() => void unblock()}
            className="mt-2.5 h-10 rounded-full bg-[var(--wa-accent)] px-7 text-[14.5px] font-medium text-white transition active:scale-95"
          >
            Unblock
          </button>
        </div>
      )}

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
        hidden={recorder.recording || blocked}
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
          onClick={() => {
            setEmojiOpen(false);
            setAttachOpen((v) => !v);
          }}
          disabled={uploading > 0}
          aria-label="Attach"
          aria-haspopup="menu"
          aria-expanded={attachOpen}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 hover:bg-[var(--wa-hover)] disabled:opacity-35 ${
            attachOpen ? 'rotate-45 text-[var(--wa-accent)]' : 'text-[var(--wa-icon)]'
          }`}
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

      {/* ── Call screen ────────────────────────────────────────────
          Name and status at the top, avatar in the middle, controls along
          the bottom — the shape of a phone call rather than of a dialog
          box, which is what a centred stack of everything reads as. */}
      {callActive && (
        <div className="wa-call wa-call-enter fixed inset-0 z-50 flex flex-col items-center justify-between px-8 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] pt-[calc(4rem+env(safe-area-inset-top,0px))] text-center">
          {/* Behind everything, not beside it: the other side's picture
              IS the screen on a video call, and the name, status and
              controls sit on top of it. Only once a stream has actually
              arrived — between accepting and the first frame there is a
              moment with nothing to show, and the avatar covers it
              rather than the screen going black.

              Muted on purpose: the sound comes from the <audio> element
              that is mounted for the whole call and never moves, so it
              cannot be interrupted by this element remounting. */}
          {showRemoteVideo && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {showSelfView && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              /* Mirrored, because a self-view that is not is the one thing
                 everybody notices at once — it is a mirror, not a
                 photograph. Fixed top-right rather than draggable: one
                 more thing to get wrong mid-call, and every phone puts it
                 there anyway. */
              className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-10 h-[150px] w-[104px] scale-x-[-1] rounded-[14px] border border-white/20 bg-black object-cover shadow-lg"
            />
          )}

          <div className={`relative z-10 flex flex-col items-center gap-1.5 ${showRemoteVideo ? 'rounded-[18px] bg-black/45 px-5 py-3.5' : ''}`}>
            <h2 className="text-[24px] font-normal leading-tight">{title}</h2>
            <p className="text-[14.5px] text-[var(--call-sub)]" aria-live="polite">
              {call.phase === 'calling' && 'Ringing…'}
              {/* Which kind, before Accept is pressed. For someone who is
                  not presentable that is the difference between answering
                  and not. */}
              {call.phase === 'incoming' &&
                (call.media === 'video' ? 'Incoming video call' : 'Incoming voice call')}
              {call.phase === 'connecting' && 'Connecting…'}
              {call.phase === 'active' &&
                (call.connectedAt ? <CallDuration since={call.connectedAt} /> : 'Connected')}
              {(call.phase === 'ended' || call.phase === 'failed') && call.message}
            </p>
            {/* The same claim the thread makes, in the same words — a call
                screen that promised more than the chat above it would be
                the one place a customer could catch us out. */}
            <p className="mt-1 flex items-center gap-1 text-[12px] text-[var(--call-sub)]">
              <LockIcon className="h-3 w-3" />
              Private · encrypted in transit
            </p>
          </div>

          <div className={`relative z-10 flex items-center justify-center ${showRemoteVideo ? 'hidden' : ''}`}>
            {ringing && (
              <>
                <span className="wa-call-pulse absolute h-[132px] w-[132px] rounded-full bg-white/16" aria-hidden />
                <span
                  className="wa-call-pulse absolute h-[132px] w-[132px] rounded-full bg-white/16"
                  style={{ animationDelay: '1100ms' }}
                  aria-hidden
                />
              </>
            )}
            <div className="relative flex h-[132px] w-[132px] items-center justify-center overflow-hidden rounded-full bg-[var(--wa-accent)]/25 text-4xl font-semibold text-[var(--call-text)]">
              <BusinessFace photo={businessAvatar} initials={initials} iconClass="h-16 w-16 opacity-70" />
            </div>
          </div>

          {call.phase === 'incoming' ? (
            <div className="relative z-10 flex w-full max-w-[280px] items-start justify-between">
              <CallAction label="Decline" onClick={call.endCall} tone="decline">
                <PhoneOff className="h-7 w-7" />
              </CallAction>
              <CallAction label="Accept" onClick={() => void call.acceptCall()} tone="accept" bob>
                <Phone className="h-7 w-7" />
              </CallAction>
            </div>
          ) : call.phase === 'ended' || call.phase === 'failed' ? (
            <button
              type="button"
              onClick={call.dismiss}
              className="rounded-full bg-[var(--call-surface)] px-8 py-3.5 text-[15px] font-medium text-[var(--call-text)] transition active:scale-95"
            >
              Close
            </button>
          ) : (
            <div className="relative z-10 flex w-full max-w-[320px] items-start justify-center gap-10">
              <CallAction
                label={call.muted ? 'Unmute' : 'Mute'}
                onClick={call.toggleMute}
                tone={call.muted ? 'on' : 'plain'}
                caption={call.muted ? 'Unmute' : 'Mute'}
              >
                {call.muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </CallAction>
              {/* Only on a call that has a camera in it. An audio call
                  cannot grow one without being placed again — the media
                  is negotiated once — so a button offering it would be a
                  promise this does not keep. */}
              {call.media === 'video' && (
                <CallAction
                  label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
                  onClick={call.toggleCamera}
                  tone={call.cameraOn ? 'plain' : 'on'}
                  caption={call.cameraOn ? 'Camera' : 'Camera off'}
                >
                  {call.cameraOn ? <VideoIcon className="h-6 w-6" /> : <VideoOffIcon className="h-6 w-6" />}
                </CallAction>
              )}
              <CallAction label="End call" onClick={call.endCall} tone="decline" caption="End">
                <PhoneOff className="h-7 w-7" />
              </CallAction>
            </div>
          )}
        </div>
      )}

      {report && (
        <ReportSheet
          token={token}
          demo={demo}
          businessName={title}
          message={report.message}
          intent={report.intent}
          onClose={() => setReport(null)}
          onBlockedChange={setBlockedState}
        />
      )}

      {deleting && (
        <DeleteSheet
          token={token}
          demo={demo}
          message={deleting}
          onClose={closeDeleting}
          onDeleted={(scope) => applyDeleted(deleting, scope)}
        />
      )}

      {/* Only with ?debug=1 on the link. Fixed to the corner rather than
          in the layout: it must not move a single pixel of the chat, or
          it is measuring a page that is not the one customers see. */}
      {link && typeof window !== 'undefined' && window.location.search.includes('debug=1') && (
        <div className="pointer-events-none fixed left-2 top-2 z-[70] rounded bg-black/75 px-2 py-1 font-mono text-[11px] leading-tight text-white">
          {link.transport}
          {' · '}
          {link.rtt === null ? 'rtt —' : `rtt ${link.rtt}ms`}
        </div>
      )}

      {viewer && (
        <PhotoViewer
          token={token}
          photos={viewer.photos}
          index={viewer.index}
          onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
          onClose={closeViewer}
          onReply={(message) => {
            // Closed first: the composer it focuses is behind this
            // overlay, and a keyboard opening under a full-screen photo
            // is a reply you cannot see yourself typing.
            setViewer(null);
            setReplyTo(message);
            inputRef.current?.focus();
          }}
        />
      )}
    </main>
  );
}

/** One row of the header's overflow menu. */
function MenuItem({
  children,
  icon,
  onClick,
  tone = 'plain',
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'plain' | 'danger' | 'accent';
}) {
  const colour =
    tone === 'danger'
      ? 'text-[var(--wa-danger)]'
      : tone === 'accent'
        ? 'text-[var(--wa-accent)]'
        : 'text-[var(--wa-text)]';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14.5px] transition hover:bg-[var(--wa-hover)] active:bg-[var(--wa-hover)] ${colour}`}
    >
      {/* Inherits the row's colour when the row has one, so the icon and
          the words do not disagree about how serious this is. */}
      <span className={`shrink-0 ${tone === 'plain' ? 'text-[var(--wa-icon)]' : ''}`}>{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * One round control on the call screen, with its name underneath.
 *
 * The label is not decoration: an unlabelled row of circles is guesswork
 * for anyone who has not used this exact screen before, and a call is the
 * worst moment to be guessing which circle hangs up.
 */
function CallAction({
  children,
  label,
  caption,
  onClick,
  tone,
  bob,
}: {
  children: React.ReactNode;
  label: string;
  caption?: string;
  onClick: () => void;
  tone: 'plain' | 'on' | 'accept' | 'decline';
  bob?: boolean;
}) {
  const surface =
    tone === 'decline'
      ? 'bg-[#f15c6d] text-white'
      : tone === 'accept'
        ? 'bg-[#25d366] text-white'
        : tone === 'on'
          ? 'bg-[var(--call-surface-active)] text-[#0b141a]'
          : 'bg-[var(--call-surface)] text-[var(--call-text)]';

  const big = tone === 'accept' || tone === 'decline';

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex items-center justify-center rounded-full transition active:scale-90 ${surface} ${
          big ? 'h-[68px] w-[68px]' : 'h-[58px] w-[58px]'
        } ${bob ? 'wa-call-bob' : ''}`}
      >
        {children}
      </button>
      {caption && <span className="text-[12.5px] text-[var(--call-sub)]">{caption}</span>}
    </div>
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
  const SLOTS = 40;
  const padded = [...new Array(Math.max(0, SLOTS - levels.length)).fill(0), ...levels.slice(-SLOTS)];

  return (
    <div
      className={`flex h-8 flex-1 items-center justify-end gap-[3px] overflow-hidden transition-opacity ${
        paused ? 'opacity-40' : ''
      }`}
      aria-hidden
    >
      {padded.map((level, i) => (
        <span
          key={i}
          // Wider bars with a rounded cap, because a hairline reads as a
          // dotted rule rather than as sound. Uniform colour, like the
          // original — a fade across the row looked like a scroll hint
          // rather than like a level meter.
          className="w-[3.5px] shrink-0 rounded-full bg-[var(--wa-icon)]"
          style={{
            // A floor of three pixels keeps silence as a visible line
            // rather than a gap.
            height: `${Math.max(3, Math.round(level * 30))}px`,
            // Long enough to smooth the step between samples, short enough
            // that the bar has finished moving before the next one lands.
            transition: 'height 90ms linear',
          }}
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
/**
 * Several photos sent together, as one grid.
 *
 * The agent app's shape, tile for tile: two side by side, three or more
 * as one across the top with two beneath and the count on the last. The
 * two clients are halves of one conversation and a batch of five has to
 * look like the same batch on both.
 *
 * Tiles reuse ChatImage, so they fetch, cache and revoke exactly as a
 * single photo does — and tapping one opens the same lightbox.
 */
function AlbumRow({
  messages,
  token,
  mine,
  newDay,
  onOpen,
}: {
  messages: ThreadMessage[];
  token: string;
  mine: boolean;
  newDay: boolean;
  /** The tapped photo's position in the WHOLE batch, not among the tiles. */
  onOpen: (index: number) => void;
}) {
  const pair = messages.length === 2;
  const tiles = messages.slice(0, pair ? 2 : ALBUM_MAX_TILES);
  const hidden = messages.length - tiles.length;
  const last = messages[messages.length - 1]!;

  const tile = (m: ThreadMessage, index: number, more: number, className: string) => (
    <span key={m.id} className={`relative block overflow-hidden rounded-[3px] ${className}`}>
      {m.localUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.localUrl}
          alt=""
          onClick={() => onOpen(index)}
          className="h-full w-full cursor-zoom-in object-cover"
        />
      ) : m.mediaId ? (
        <ChatImage token={token} mediaId={m.mediaId} onOpen={() => onOpen(index)} tile />
      ) : null}
      {more > 0 && (
        // Over the last tile, and it opens the batch at the first photo
        // this grid does NOT show — which is what a "+2" is promising.
        <span
          onClick={() => onOpen(index + 1)}
          className="absolute inset-0 flex cursor-zoom-in items-center justify-center bg-black/45 text-[20px] font-semibold text-white"
        >
          +{more}
        </span>
      )}
    </span>
  );

  return (
    <li className="contents">
      {newDay && (
        <div className="my-3 flex justify-center">
          <span className="rounded-md bg-[var(--wa-chip)] px-3 py-[5px] text-[12px] font-medium uppercase tracking-wide text-[var(--wa-chip-text)] shadow-[var(--wa-bubble-shadow)]">
            {dayLabel(last.createdAt)}
          </span>
        </div>
      )}
      <div className={`wa-row mb-2 flex px-1 ${mine ? 'justify-end' : 'justify-start'}`}>
        <div
          className={[
            'relative w-[232px] max-w-[85%] rounded-[7.5px] p-[3px] shadow-[var(--wa-bubble-shadow)]',
            mine ? 'bg-[var(--wa-out)]' : 'bg-[var(--wa-in)]',
          ].join(' ')}
        >
          {pair ? (
            <span className="flex gap-[2px]">
              {tiles.map((m, i) => tile(m, i, 0, 'h-[112px] w-1/2'))}
            </span>
          ) : (
            <>
              {tile(tiles[0]!, 0, 0, 'h-[140px] w-full')}
              <span className="mt-[2px] flex gap-[2px]">
                {tiles.slice(1).map((m, i) =>
                  tile(m, i + 1, i === tiles.length - 2 ? hidden : 0, 'h-[112px] w-1/2'),
                )}
              </span>
            </>
          )}
          <span className="flex items-center justify-end gap-1 px-[3px] pt-[3px] text-[11px] text-[var(--wa-meta)]">
            {formatTime(last.createdAt)}
            {mine && <MessageTicks status={last.status} />}
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * One photo, full screen, with the batch it came from underneath it.
 *
 * Replaces a lightbox that took a single object URL. That was enough to
 * look at a picture and nothing else: it could not name the message it
 * was showing, so there was no reply; and the photos behind an album's
 * "+2" were never rendered, so there was no tile to tap and no way to
 * open them at all. They were in the thread and out of reach.
 *
 * Both follow from carrying the messages rather than a string.
 *
 * The strip is TAPPED, not swiped. A horizontal swipe over a photo is
 * the gesture the browser already uses for back-navigation on iOS, and
 * on Android it fights the pinch-and-pan people expect on a picture.
 * Tapping is unambiguous and, unlike a swipe, it also says how many
 * there are.
 */
function PhotoViewer({
  token,
  photos,
  index,
  onIndex,
  onClose,
  onReply,
}: {
  token: string;
  photos: ThreadMessage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onReply: (message: ThreadMessage) => void;
}) {
  // Defensive: a batch can shrink under the viewer if a message is
  // deleted while it is open, and an index past the end would blank it.
  const safeIndex = Math.min(index, photos.length - 1);
  const current = photos[safeIndex];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label="Image"
    >
      {/* Top bar. Its own row rather than buttons floated over the photo:
          a portrait picture fills the screen, and a control sitting on
          top of it is a control you cannot see. */}
      <div className="flex items-center justify-between px-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image"
          className="flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        {photos.length > 1 && (
          <span className="text-[13px] tabular-nums text-white/70">
            {safeIndex + 1} / {photos.length}
          </span>
        )}

        <button
          type="button"
          onClick={() => onReply(current)}
          aria-label="Reply to this photo"
          className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium active:bg-white/10"
        >
          <ReplyIcon className="h-5 w-5" />
          Reply
        </button>
      </div>

      {/* The photo. Tapping the backdrop closes; tapping the picture does
          not, or every attempt to look closely dismisses it. */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-2" onClick={onClose}>
        <ViewerImage
          key={current.id}
          token={token}
          message={current}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2">
          {photos.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === safeIndex}
              className={[
                'relative h-12 w-12 shrink-0 overflow-hidden rounded-[4px] transition',
                i === safeIndex ? 'ring-2 ring-white' : 'opacity-55',
              ].join(' ')}
            >
              <ViewerThumb token={token} message={m} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The full-size photo inside the viewer.
 *
 * Fetches its own copy rather than being handed the bubble's object URL.
 * It has to: the photos behind a "+2" have no bubble, so there is no URL
 * to hand over — and the request is the same one the browser already
 * has in its HTTP cache for the ones that do, so nothing is downloaded
 * twice.
 */
function ViewerImage({
  token,
  message,
  onClick,
}: {
  token: string;
  message: ThreadMessage;
  onClick: (e: React.MouseEvent) => void;
}) {
  const { url, failed } = useMediaObjectUrl(token, message, 960);

  if (failed) {
    return <p className="text-[14px] text-white/60">Image unavailable</p>;
  }
  if (!url) {
    return <div className="h-40 w-40 animate-pulse rounded-lg bg-white/10" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Shared image"
      onClick={onClick}
      className="max-h-full max-w-full object-contain"
    />
  );
}

/** A strip thumbnail — the small width, because that is all it is. */
function ViewerThumb({ token, message }: { token: string; message: ThreadMessage }) {
  const { url } = useMediaObjectUrl(token, message, 480);
  if (!url) return <span className="block h-full w-full animate-pulse bg-white/15" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" />
  );
}

/**
 * One photo's displayable URL, whatever stage it is at.
 *
 * Three cases, and they all have to work in the viewer as well as in a
 * bubble: a file still uploading has a local URL and no media id; the
 * canned demo thread carries its src inline behind a `demo:` prefix; and
 * a stored photo has to be fetched with the link token, because an
 * <img> tag cannot send an Authorization header.
 *
 * The object URL is revoked on unmount. Without that, every photo the
 * customer opens stays in memory for the life of the tab.
 */
function useMediaObjectUrl(
  token: string,
  message: Pick<ThreadMessage, 'mediaId' | 'localUrl'>,
  width: 480 | 960,
): { url: string | null; failed: boolean } {
  const mediaId = message.mediaId ?? null;
  const direct =
    message.localUrl ?? (mediaId?.startsWith('demo:') ? mediaId.slice('demo:'.length) : null);

  const [url, setUrl] = useState<string | null>(direct);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (direct || !mediaId) return;

    let cancelled = false;
    let created: string | null = null;

    // No `setFailed(false)` here to clear a previous failure: every
    // caller is keyed on the message id, so a different photo is a
    // different component instance with its own fresh state — and
    // setting state straight from an effect body costs a second render
    // on every image for a case that cannot happen.
    fetchMediaObjectUrl(token, mediaId, width)
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
  }, [token, mediaId, direct, width]);

  return { url: direct ?? url, failed };
}

function ChatImage({
  token,
  mediaId,
  onOpen,
  tile = false,
}: {
  token: string;
  mediaId: string;
  /** Opens the viewer. It fetches its own copy, so no url is passed up. */
  onOpen: () => void;
  /** Fills a fixed album cell instead of sizing itself to the photo. */
  tile?: boolean;
}) {
  // 960 rather than the full file: the bubble is a few hundred pixels
  // wide, and this is still enough for the viewer on a phone, so opening
  // a photo costs no second download. The demo's inline src and the
  // revoke-on-unmount both live in the hook — this used to be a second
  // copy of that logic, and two copies of a cleanup rule is one too many.
  const { url, failed } = useMediaObjectUrl(token, { mediaId }, 960);

  if (failed) {
    return (
      <div
        className={
          tile
            ? 'flex h-full w-full items-center justify-center bg-black/5 text-[10px] text-[var(--wa-meta)]'
            : 'flex h-40 w-56 items-center justify-center rounded-[6px] bg-black/5 text-xs text-[var(--wa-meta)]'
        }
      >
        Image unavailable
      </div>
    );
  }

  if (!url) {
    return <div className={tile ? 'h-full w-full animate-pulse bg-black/10' : 'h-52 w-56 animate-pulse rounded-[6px] bg-black/10'} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Shared image"
      onClick={onOpen}
      className={
        tile
          ? 'h-full w-full cursor-zoom-in object-cover'
          : 'max-h-[330px] w-auto max-w-full cursor-zoom-in rounded-[6px] object-cover'
      }
    />
  );
}
