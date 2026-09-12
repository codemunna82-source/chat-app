import Link from 'next/link';

/**
 * waprivate.dev's front door.
 *
 * This domain's real job is /c/<token> — the window a customer lands in
 * from a WhatsApp button — and the root used to answer 404 to everyone
 * else. That was fine while nobody had reason to type the domain, and
 * stopped being fine the moment it started appearing inside WhatsApp
 * messages: a customer who reads the link before tapping it, or types the
 * bare domain to check what they are being sent to, is exactly the person
 * a "Nothing here" page turns away.
 *
 * So this page has one job — say what the link is and who sent it — and
 * one link, to sign in. It sells nothing, because the people arriving are
 * not buying: they are checking that a URL in a message is real.
 */
export const metadata = {
  title: 'waprivate — secure business chat',
  description:
    'The private chat window businesses use to continue WhatsApp conversations securely.',
};

const POINTS = [
  {
    title: 'Opened from WhatsApp',
    body: 'A business sends you a link. Tapping it opens the same conversation in a private window — nothing to install, no account to make.',
  },
  {
    title: 'Your own thread',
    body: 'The link is yours alone. It carries the conversation you were already having, with the business you were already talking to.',
  },
  {
    title: 'Yours to end',
    body: 'Block or report from inside the chat at any time, and the business can revoke the link from their side.',
  },
];

export default function Landing() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-24">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white"
        >
          w
        </span>
        <span className="font-display text-xl font-bold tracking-tight">waprivate</span>
      </div>

      <h1 className="mt-10 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
        The private chat window behind a WhatsApp message.
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        If a business sent you a link to this site, it opens the conversation you were already
        having with them — in a window only you can open.
      </p>

      {/* The single most useful thing this page can do for the person most
          likely to be reading it: tell them the link they were sent is the
          way in, and that there is nothing to do here. */}
      <div className="mt-8 rounded-3xl border border-border bg-surface/80 p-5 sm:p-6">
        <h2 className="font-display text-base font-bold tracking-tight">Got a link?</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Go back to WhatsApp and tap <strong className="text-foreground">Open private chat</strong>{' '}
          in the message. There is nothing to sign up for here — the link is all you need, and it
          only works for you.
        </p>
      </div>

      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {POINTS.map((point) => (
          <li key={point.title} className="rounded-2xl border border-border bg-surface/60 p-4">
            <h3 className="text-[14.5px] font-semibold">{point.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{point.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-8">
        <Link
          href="/login"
          className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Business sign in
        </Link>
        <p className="text-[13px] text-muted">
          For the team answering the chats, not for customers.
        </p>
      </div>
    </main>
  );
}
