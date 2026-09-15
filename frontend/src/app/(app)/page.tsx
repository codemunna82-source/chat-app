import Link from 'next/link';

/**
 * waprivate.dev's front door.
 *
 * Two audiences arrive here and they want opposite things, which is the
 * whole design problem. A CUSTOMER types or taps the domain because they
 * were sent a link and want to know whether it is real — they need one
 * sentence and no pitch. A BUSINESS arrives to find out what this is, and
 * needs the pitch.
 *
 * So the customer is served first and above the fold, in a box that says
 * plainly there is nothing for them to do here, and the product page runs
 * underneath for everyone else. Putting the sales copy first would leave
 * the more common visitor scrolling a marketing page looking for
 * permission to trust a URL.
 *
 * Every claim below describes something that exists. No invented numbers,
 * no logos of businesses that have not used it, no testimonials — a
 * landing page for a product handling other people's customer
 * conversations is the last place to start with fiction.
 */
export const metadata = {
  title: 'waprivate — WhatsApp conversations, continued privately',
  description:
    'Answer WhatsApp on a shared team inbox, then move the conversation into a private chat window with calls, files and no 24-hour limit.',
};

/**
 * The product's whole idea, drawn: a WhatsApp thread that stops being a
 * WhatsApp thread.
 *
 * Built from the page's own tokens rather than a screenshot. A screenshot
 * would go stale the first time the chat window changed, would need a
 * second file for dark mode, and would ship a few hundred kilobytes to
 * say something two dozen divs say sharper at every screen size.
 *
 * Hidden from screen readers: it repeats the headline beside it, and
 * reading out a decorative mock-up of a conversation is noise.
 */
function HeroVisual() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[320px] sm:max-w-[360px]">
      {/* the WhatsApp side */}
      <div className="rounded-3xl border border-border bg-surface/80 p-4 shadow-xl shadow-foreground/[0.06]">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <span className="h-7 w-7 rounded-full bg-[#25d366]/20" />
          <div className="min-w-0 flex-1">
            <div className="h-2.5 w-24 rounded-full bg-foreground/15" />
            <div className="mt-1.5 h-2 w-16 rounded-full bg-foreground/10" />
          </div>
          <span className="rounded-md bg-[#25d366]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#128c7e] dark:text-[#25d366]">
            WhatsApp
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="max-w-[72%] rounded-2xl rounded-tl-md bg-foreground/[0.06] px-3 py-2">
            <div className="h-2 w-28 rounded-full bg-foreground/20" />
            <div className="mt-1.5 h-2 w-20 rounded-full bg-foreground/15" />
          </div>

          {/* the invitation, which is the hinge of the whole thing */}
          <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-md bg-[#25d366]/15 px-3 py-2.5">
            <div className="h-2 w-32 rounded-full bg-[#128c7e]/40 dark:bg-[#25d366]/45" />
            <div className="mt-1.5 h-2 w-24 rounded-full bg-[#128c7e]/30 dark:bg-[#25d366]/35" />
            <div className="mt-2.5 border-t border-[#128c7e]/20 pt-2 text-center text-[11px] font-semibold text-[#128c7e] dark:text-[#25d366]">
              Open private chat
            </div>
          </div>
        </div>
      </div>

      {/* the private window, overlapping — the move is the point */}
      <div className="relative -mt-6 ml-8 rounded-3xl border border-primary/30 bg-surface p-4 shadow-2xl shadow-primary/15 sm:ml-12">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <span className="h-7 w-7 rounded-full bg-primary/25" />
          <div className="min-w-0 flex-1">
            <div className="h-2.5 w-20 rounded-full bg-foreground/15" />
            <div className="mt-1.5 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#25d366]" />
              <div className="h-2 w-14 rounded-full bg-foreground/10" />
            </div>
          </div>
          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
            Private
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="max-w-[70%] rounded-2xl rounded-tl-md bg-foreground/[0.06] px-3 py-2">
            <div className="h-2 w-24 rounded-full bg-foreground/20" />
          </div>
          <div className="ml-auto max-w-[76%] rounded-2xl rounded-tr-md bg-primary px-3 py-2">
            <div className="h-2 w-28 rounded-full bg-white/70" />
            <div className="mt-1.5 h-2 w-16 rounded-full bg-white/50" />
          </div>
          <div className="max-w-[58%] rounded-2xl rounded-tl-md bg-foreground/[0.06] px-3 py-2">
            <div className="h-2 w-16 rounded-full bg-foreground/20" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary">
      <path
        fill="currentColor"
        d="M8.2 13.4 5 10.2l1.2-1.2 2 2 5.6-5.6L15 6.6z"
      />
      <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".35" />
    </svg>
  );
}

const PILLARS = [
  {
    title: 'One inbox for every number',
    body: 'Connect the WhatsApp numbers your business already uses — across more than one Business Manager if you have outgrown one — and answer them all from the same place. Each agent sees only the numbers they are assigned.',
  },
  {
    title: 'A private window, no install',
    body: 'Send a customer a link and the conversation continues in a browser: same thread, same history, nothing to download and no account to create. Photos, voice notes, files and location, both ways.',
  },
  {
    title: 'Calls that stay in the app',
    body: 'A customer calling your WhatsApp number rings inside the app and is answered there. From the private window, calls connect straight to the agent — no phone number ever changes hands.',
  },
];

const STEPS = [
  {
    title: 'Connect your number',
    body: 'Add the phone number ID from WhatsApp Manager. More than one Business Manager is fine — each keeps its own credentials and its own webhook.',
  },
  {
    title: 'Add your team',
    body: 'Create accounts with a phone number and password, choose what each person can do, and assign them to a number. Access expires on a date you set.',
  },
  {
    title: 'Customers message you',
    body: 'Messages land in the shared inbox in real time, with a notification on the agent’s phone even when the app is closed.',
  },
  {
    title: 'Move them somewhere better',
    body: 'An approved WhatsApp template invites them into the private window — automatically, if you want. From there the 24-hour reply limit no longer applies.',
  },
];

const FEATURES = [
  'Real-time shared inbox',
  'Android app for agents',
  'Voice calls, both directions',
  'Photos, files, voice notes',
  'Location sharing',
  'Replies, reactions and starred messages',
  'Approved WhatsApp templates',
  'Per-agent number assignment',
  'Permissions and access expiry',
  'Block and report, from the customer’s side',
  'Push notifications when the app is closed',
  'Automatic chat invitations',
];

export default function Landing() {
  return (
    <main className="relative w-full overflow-hidden">
      {/*
        A soft green wash behind everything. The app's own mesh background
        is mounted for signed-in screens and does not reach here, which
        left the page a flat off-white — correct, and lifeless for the one
        screen whose job is a first impression.

        Fixed at the top and fading out, so it reads as light coming from
        somewhere rather than a band of colour with an edge.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]"
        style={{
          background:
            'radial-gradient(ellipse 90% 65% at 18% 0%, color-mix(in srgb, #25d366 18%, transparent), transparent 60%), radial-gradient(ellipse 75% 55% at 92% 8%, color-mix(in srgb, #128c7e 16%, transparent), transparent 58%)',
        }}
      />
      {/* ── header ─────────────────────────────────────────────── */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-white"
          >
            w
          </span>
          <span className="font-display text-[17px] font-bold tracking-tight">waprivate</span>
        </div>
        <Link
          href="/login"
          className="rounded-xl border border-border px-4 py-2 text-[13.5px] font-semibold transition-colors hover:bg-surface-hover"
        >
          Sign in
        </Link>
      </header>

      {/* ── hero ───────────────────────────────────────────────── */}
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-5 pb-4 pt-6 sm:pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] font-bold leading-[1.12] tracking-tight sm:text-[2.75rem] lg:text-5xl">
            WhatsApp conversations,
            <br className="hidden sm:block" /> continued privately.
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted sm:text-[17px]">
            A shared inbox for the WhatsApp numbers your business already uses — and a private chat
            window to move each conversation into, where files, calls and time are not
            WhatsApp&rsquo;s to limit.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="rounded-2xl bg-primary px-6 py-3.5 text-[14.5px] font-semibold text-white shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
            >
              Sign in to your workspace
            </Link>
            <a
              href="#how"
              className="rounded-2xl border border-border px-6 py-3.5 text-[14.5px] font-semibold transition-colors hover:bg-surface-hover"
            >
              See how it works
            </a>
          </div>
        </div>

        <HeroVisual />
      </section>

      {/* ── the customer's box, deliberately high ──────────────── */}
      <section className="mx-auto w-full max-w-5xl px-5 pt-12 sm:pt-16">
        <div className="glass-panel rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-lg font-bold tracking-tight">Were you sent a link?</h2>
            <span className="text-[12.5px] text-muted">You&rsquo;re in the right place.</span>
          </div>
          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-muted">
            If a business sent you a link to this site, it opens the conversation you were already
            having with them. Go back to WhatsApp and tap{' '}
            <strong className="font-semibold text-foreground">Open private chat</strong> in their
            message &mdash; that link is the only way in, it works only for you, and there is
            nothing here to sign up for.
          </p>
        </div>
      </section>

      {/* ── pillars ────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-5 pt-14 sm:pt-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="rounded-3xl border border-border bg-surface/60 p-5">
              <h3 className="font-display text-[17px] font-bold tracking-tight">{pillar.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── the 24-hour point, which is the actual reason to care ─ */}
      <section className="mx-auto w-full max-w-5xl px-5 pt-14 sm:pt-20">
        <div className="rounded-3xl border border-primary/25 bg-primary/[0.06] p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            WhatsApp closes the door after 24 hours. This keeps it open.
          </h2>
          <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-muted">
            Meta only lets a business reply freely for 24 hours after a customer writes. After that
            it is approved templates or nothing &mdash; which is why so many support threads simply
            stop. Once a customer is in the private window, replies go there instead, and the clock
            stops mattering.
          </p>
        </div>
      </section>

      {/* ── how it works ───────────────────────────────────────── */}
      <section id="how" className="mx-auto w-full max-w-5xl scroll-mt-8 px-5 pt-14 sm:pt-20">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-bold text-primary"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-[16px] font-bold tracking-tight">{step.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── feature list ───────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-5 pt-14 sm:pt-20">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          What&rsquo;s in it
        </h2>
        <ul className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-[14px] leading-snug">
              <Check />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── footer ─────────────────────────────────────────────── */}
      <footer className="mx-auto mt-20 w-full max-w-5xl border-t border-border px-5 py-10 sm:mt-28">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[12px] font-bold text-white"
              >
                w
              </span>
              <span className="font-display text-[15px] font-bold tracking-tight">waprivate</span>
            </div>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">
              Not affiliated with or endorsed by WhatsApp or Meta. WhatsApp is a trademark of Meta
              Platforms, Inc.
            </p>
          </div>
          <Link
            href="/login"
            className="rounded-xl border border-border px-4 py-2 text-[13.5px] font-semibold transition-colors hover:bg-surface-hover"
          >
            Business sign in
          </Link>
        </div>
      </footer>
    </main>
  );
}
