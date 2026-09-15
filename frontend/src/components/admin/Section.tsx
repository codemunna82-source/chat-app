/**
 * One labelled area of the admin page.
 *
 * The page grew a panel at a time and ended up as six cards in a column
 * with nothing saying which belonged together — users, Business Managers,
 * numbers and automation all looked like peers of each other, so finding
 * anything meant reading every heading.
 *
 * Grouping them under a titled rule fixes that with no new concepts: the
 * numbered heading says where you are, and the one-line description says
 * what the section is for before any control is read.
 */
export function Section({
  step,
  title,
  description,
  children,
}: {
  /** Position in the natural setup order — credentials, then numbers, then people. */
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 first:mt-10">
      <div className="flex items-baseline gap-3 border-b border-border pb-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-bold text-primary">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
