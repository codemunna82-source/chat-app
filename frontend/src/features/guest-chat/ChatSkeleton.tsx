/**
 * What the window shows while the first page is loading.
 *
 * A spinner says "something is happening"; this says "a chat is about to
 * be here" — the header, the wallpaper and the shape of a thread are all
 * already in place, so when the real messages arrive nothing jumps. That
 * absence of movement is most of what separates an app from a web page,
 * and it costs nothing: every element here is markup the real window
 * renders anyway.
 *
 * Widths and sides are fixed rather than random, so the skeleton is
 * identical on the server and after hydration.
 */
const ROWS: { mine: boolean; width: number; lines: number }[] = [
  { mine: false, width: 62, lines: 2 },
  { mine: true, width: 44, lines: 1 },
  { mine: false, width: 52, lines: 1 },
  { mine: true, width: 68, lines: 2 },
  { mine: false, width: 38, lines: 1 },
];

function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`wa-shimmer rounded-md ${className ?? ''}`} style={style} />;
}

export function ChatSkeleton() {
  return (
    <main
      className="wa flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--wa-wall)]"
      aria-busy="true"
      aria-label="Loading chat"
    >
      <header className="z-20 flex shrink-0 items-center gap-2 bg-[var(--wa-header)] px-1.5 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] shadow-[0_1px_2px_rgba(11,20,26,0.08)]">
        <div className="h-10 w-8 shrink-0" />
        <Shimmer className="h-10 w-10 shrink-0 !rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5 pl-1">
          <Shimmer className="h-[15px] w-32" />
          <Shimmer className="h-[11px] w-16" />
        </div>
        <Shimmer className="mr-1.5 h-6 w-6 shrink-0 !rounded-full" />
      </header>

      <div className="wa-wall relative min-h-0 flex-1 overflow-hidden px-2 py-3 sm:px-4">
        {/* Above the wallpaper's own pseudo-element, which is absolutely
            positioned and would otherwise draw its doodles over all of
            this. The real transcript clears it by being a positioned
            scroller; this has to say so itself. */}
        <div className="relative z-10 mx-auto w-full max-w-[1100px]">
          {/* The two cards the real thread opens with, in their own
              colours, so nothing shifts or changes shade when they land. */}
          <div className="mx-auto mb-2 max-w-[420px] rounded-lg bg-[var(--wa-notice)] px-3 py-2.5 shadow-[var(--wa-bubble-shadow)]">
            <Shimmer className="mx-auto h-[11px] w-[86%]" />
            <Shimmer className="mx-auto mt-2 h-[11px] w-[62%]" />
          </div>

          <div className="mx-auto mb-3 w-full max-w-[400px] rounded-xl bg-[var(--wa-card)] px-5 py-4 shadow-[var(--wa-panel-shadow)]">
            <Shimmer className="mx-auto h-16 w-16 !rounded-full" />
            <Shimmer className="mx-auto mt-2.5 h-[15px] w-40" />
            <Shimmer className="mx-auto mt-2 h-[12px] w-32" />
            <div className="mt-3 border-t border-[var(--wa-divider)] pt-3">
              <Shimmer className="mx-auto h-[11px] w-[88%]" />
            </div>
          </div>

          {ROWS.map((row, i) => (
            <div key={i} className={`mb-2 flex px-1 ${row.mine ? 'justify-end' : 'justify-start'}`}>
              {/* A real bubble with placeholder lines inside it, not a grey
                  slab. The slab version read as a broken layout, which is
                  the opposite of what a skeleton is for. */}
              <div
                className={`space-y-2 rounded-[7.5px] px-[9px] pb-[9px] pt-[8px] shadow-[var(--wa-bubble-shadow)] ${
                  row.mine ? 'bg-[var(--wa-out)] rounded-tr-none' : 'bg-[var(--wa-in)] rounded-tl-none'
                }`}
                style={{ width: `${row.width}%`, maxWidth: 440 }}
              >
                {Array.from({ length: row.lines }, (_, line) => (
                  <Shimmer
                    key={line}
                    className="h-[11px]"
                    style={{ width: line === row.lines - 1 ? '68%' : '100%' }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="z-20 flex shrink-0 items-center gap-1.5 bg-[var(--wa-composer)] px-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))] pt-1.5">
        <Shimmer className="h-11 w-11 shrink-0 !rounded-full" />
        <Shimmer className="h-11 flex-1 !rounded-[24px]" />
        <Shimmer className="h-11 w-11 shrink-0 !rounded-full" />
        <Shimmer className="h-11 w-11 shrink-0 !rounded-full" />
      </div>
    </main>
  );
}
