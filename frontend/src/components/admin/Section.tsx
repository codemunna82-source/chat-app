/**
 * One tab's content on the admin page.
 *
 * The page used to be six cards stacked in one column with nothing saying
 * which belonged together — users, Business Managers, numbers and
 * automation all looked like peers of each other, and finding anything
 * meant scrolling past everything else first. It is a tab bar now (see
 * admin/page.tsx), one task on screen at a time; this is just that tab's
 * heading and one-line description, above whatever it holds.
 */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="border-b border-border pb-3">
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}
