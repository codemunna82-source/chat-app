'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getTemplateStats,
  type MessageTally,
  type TemplateStats,
  type TeamMember,
  type WhatsAppNumber,
} from '@/lib/voxo';

/**
 * Template delivery health, for the admin who owns the WhatsApp Business
 * Account — not the agent app, which never shows a template's raw Meta
 * error (sendFailureNote.ts deliberately renders a failed one as sent).
 * This is where that same failure finally surfaces: which template is
 * being refused, how often, why, on which number, and how long a
 * delivered one typically takes — and, picking a Business Manager and
 * then one of its numbers, that same breakdown plus plain WhatsApp text
 * and the whole conversation's traffic, both directions.
 */

const WINDOW_OPTIONS = [7, 30, 90] as const;
/** "Every Business Manager" / "every number" in the pickers — never a
 *  real id, so neither can ever collide with one. */
const ALL = 'all';

/** emerald/rose — the same status colours already used for every other
 *  success/failure pair on this page (BusinessManagers, AutoReplySetup).
 *  Reused rather than picked fresh: a reader who has already learned
 *  "rose means refused" on three other tabs should not have to relearn
 *  it on a fourth. */
const DELIVERED_COLOR = '#10b981'; // tailwind emerald-500
const FAILED_COLOR = '#f43f5e'; // tailwind rose-500
/** The theme's own pair (globals.css) rather than a fresh categorical
 *  choice — in/out is not a status, so it stays off the rose/emerald
 *  vocabulary above, and the CSS variables already adapt between light
 *  and dark on their own. */
const IN_COLOR = 'var(--accent-2)';
const OUT_COLOR = 'var(--primary)';

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/70 px-4 py-3">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-bold tabular-nums ${
          tone === 'danger' ? 'text-rose-500' : tone === 'success' ? 'text-emerald-500' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** Sent/delivered/failed, as the three tiles both the template and the
 *  plain-text sections need — pulled out so the two stay visibly the
 *  same shape rather than drifting into two different layouts. */
function TallyTiles({ tally, sentLabel }: { tally: MessageTally; sentLabel: string }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile label={sentLabel} value={String(tally.total)} />
      <StatTile label="Delivered" value={String(tally.delivered)} tone="success" />
      <StatTile label="Failed" value={String(tally.failed)} tone={tally.failed > 0 ? 'danger' : undefined} />
    </div>
  );
}

/**
 * One day's delivered/failed pair, as two thin rounded-top bars sharing a
 * baseline — a grouped bar rather than stacked, so a day that is mostly
 * failures is not read as "tall" (good) at a glance before the colour
 * registers.
 */
function DayBars({ day, maxCount }: { day: TemplateStats['byDay'][number]; maxCount: number }) {
  const [hovered, setHovered] = useState(false);
  const scale = (n: number) => (maxCount === 0 ? 0 : Math.round((n / maxCount) * 100));
  const deliveredH = scale(day.delivered);
  const failedH = scale(day.failed);
  const label = new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div
      className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered ? (
        <div className="pointer-events-none absolute bottom-full z-10 mb-1.5 w-max max-w-[160px] -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] shadow-lg">
          <p className="font-semibold">{label}</p>
          <p className="text-emerald-500">Delivered {day.delivered}</p>
          <p className="text-rose-500">Failed {day.failed}</p>
        </div>
      ) : null}
      <div
        className="w-[7px] rounded-t-[4px]"
        style={{ height: `${Math.max(deliveredH, day.delivered > 0 ? 3 : 0)}%`, backgroundColor: DELIVERED_COLOR }}
      />
      <div
        className="w-[7px] rounded-t-[4px]"
        style={{ height: `${Math.max(failedH, day.failed > 0 ? 3 : 0)}%`, backgroundColor: FAILED_COLOR }}
      />
    </div>
  );
}

/** Same shape as DayBars, for the in/out pair instead of delivered/failed. */
function VolumeBars({ day, maxCount }: { day: TemplateStats['messagesByDay'][number]; maxCount: number }) {
  const [hovered, setHovered] = useState(false);
  const scale = (n: number) => (maxCount === 0 ? 0 : Math.round((n / maxCount) * 100));
  const inH = scale(day.in);
  const outH = scale(day.out);
  const label = new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div
      className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered ? (
        <div className="pointer-events-none absolute bottom-full z-10 mb-1.5 w-max max-w-[160px] -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] shadow-lg">
          <p className="font-semibold">{label}</p>
          <p style={{ color: IN_COLOR }}>In {day.in}</p>
          <p style={{ color: OUT_COLOR }}>Out {day.out}</p>
        </div>
      ) : null}
      <div className="w-[7px] rounded-t-[4px]" style={{ height: `${Math.max(inH, day.in > 0 ? 3 : 0)}%`, backgroundColor: IN_COLOR }} />
      <div className="w-[7px] rounded-t-[4px]" style={{ height: `${Math.max(outH, day.out > 0 ? 3 : 0)}%`, backgroundColor: OUT_COLOR }} />
    </div>
  );
}

export function TemplateStats({ numbers, members }: { numbers: WhatsAppNumber[]; members: TeamMember[] }) {
  const [windowDays, setWindowDays] = useState<(typeof WINDOW_OPTIONS)[number]>(30);
  const [metaAppKey, setMetaAppKey] = useState<string>(ALL);
  const [numberId, setNumberId] = useState<string>(ALL);
  const [stats, setStats] = useState<TemplateStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One Business Manager row per distinct metaAppId actually in use — a
  // BM with no numbers yet has nothing to drill into here, so it is left
  // out rather than shown as an empty dead end.
  const businessManagers = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const n of numbers) byKey.set(n.metaAppId ?? 'default', n.metaAppName ?? 'Default');
    return Array.from(byKey.entries()).map(([key, name]) => ({ key, name }));
  }, [numbers]);

  const numbersInScope = useMemo(
    () => (metaAppKey === ALL ? numbers : numbers.filter((n) => (n.metaAppId ?? 'default') === metaAppKey)),
    [numbers, metaAppKey],
  );

  // Who this number is assigned to — User.whatsappPhoneNumberId is the
  // only place that relationship lives; there is nothing on the number
  // itself to read it from.
  const assignedNameByNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      if (m.whatsappPhoneNumberId) map.set(m.whatsappPhoneNumberId, m.displayName || m.phone || m.email);
    }
    return map;
  }, [members]);

  useEffect(() => {
    // No reset to a loading state here: the previous selection's numbers
    // stay on screen until the new ones arrive, which reads as the report
    // updating rather than flashing back to "Loading…" on every click.
    let cancelled = false;
    getTemplateStats({ windowDays, whatsappPhoneNumberId: numberId === ALL ? undefined : numberId })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load template stats.');
      });
    return () => {
      cancelled = true;
    };
  }, [windowDays, numberId]);

  if (!stats) {
    return <p className="text-sm text-muted">{error ?? 'Loading…'}</p>;
  }

  const maxDayCount = Math.max(1, ...stats.byDay.map((d) => Math.max(d.delivered, d.failed)));
  const maxVolumeCount = Math.max(1, ...stats.messagesByDay.map((d) => Math.max(d.in, d.out)));
  const scopedLabel = numbers.find((n) => n.id === numberId)?.displayPhoneNumber;

  return (
    <div className="mt-6 flex flex-col gap-8">
      {error ? (
        <p className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-semibold text-muted">Business Manager</span>
          <select
            value={metaAppKey}
            onChange={(e) => {
              // Changing the BM can drop the number that was selected —
              // it may not belong to the new one — so this always goes
              // back to "All numbers" rather than risk showing a report
              // scoped to a number nobody can see the picker pointing at.
              setMetaAppKey(e.target.value);
              setNumberId(ALL);
            }}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-[13px] font-medium"
          >
            <option value={ALL}>All Business Managers</option>
            {businessManagers.map((bm) => (
              <option key={bm.key} value={bm.key}>
                {bm.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-semibold text-muted">Number</span>
          <select
            value={numberId}
            onChange={(e) => setNumberId(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-[13px] font-medium"
          >
            <option value={ALL}>All numbers</option>
            {numbersInScope.map((n) => {
              const assigned = assignedNameByNumber.get(n.id);
              return (
                <option key={n.id} value={n.id}>
                  {n.displayPhoneNumber}
                  {assigned ? ` — ${assigned}` : ' — unassigned'}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            Messages per day{scopedLabel ? ` — ${scopedLabel}` : ''}
          </h3>
          <div className="flex gap-1 rounded-xl border border-border p-0.5">
            {WINDOW_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition ${
                  windowDays === d ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">
          The whole WhatsApp conversation — every message type, both directions.
        </p>

        <div className="mt-3 flex items-center gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: IN_COLOR }} />
            From the customer
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: OUT_COLOR }} />
            From this workspace
          </span>
        </div>

        {stats.messagesByDay.every((d) => d.in === 0 && d.out === 0) ? (
          <p className="mt-4 rounded-2xl border border-border bg-surface/70 px-4 py-6 text-center text-sm text-muted">
            No messages in this window.
          </p>
        ) : (
          <div className="mt-3 flex h-32 items-end gap-[3px] rounded-2xl border border-border bg-surface/50 px-3 py-3">
            {stats.messagesByDay.map((day) => (
              <VolumeBars key={day.date} day={day} maxCount={maxVolumeCount} />
            ))}
          </div>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer text-[12.5px] text-muted hover:text-foreground">
            View as a table
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-4 font-medium">Date</th>
                  <th className="py-1 pr-4 font-medium">In</th>
                  <th className="py-1 font-medium">Out</th>
                </tr>
              </thead>
              <tbody>
                {stats.messagesByDay.map((day) => (
                  <tr key={day.date} className="border-t border-border/60">
                    <td className="py-1 pr-4">{day.date}</td>
                    <td className="py-1 pr-4 tabular-nums">{day.in}</td>
                    <td className="py-1 tabular-nums">{day.out}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div>
        <h3 className="text-sm font-semibold">
          Approved templates{scopedLabel ? ` — ${scopedLabel}` : ' (lifetime)'}
        </h3>
        <div className="mt-3">
          <TallyTiles tally={stats.totals} sentLabel="Sent" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Plain WhatsApp text{scopedLabel ? ` — ${scopedLabel}` : ' (lifetime)'}</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Ordinary replies — never an approved template — on the same number(s).
        </p>
        <div className="mt-3">
          <TallyTiles tally={stats.plainTotals} sentLabel="Sent" />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Templates sent per day</h3>
          <StatTile
            label={`Typical delivery time (${windowDays}d)`}
            value={formatMinutes(stats.medianDeliveryMinutes)}
          />
        </div>

        {/* Legend — never colour alone: both series are also named here,
            and every bar's own tooltip repeats the number in text. */}
        <div className="mt-3 flex items-center gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: DELIVERED_COLOR }} />
            Delivered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: FAILED_COLOR }} />
            Failed
          </span>
        </div>

        {stats.byDay.every((d) => d.total === 0) ? (
          <p className="mt-4 rounded-2xl border border-border bg-surface/70 px-4 py-6 text-center text-sm text-muted">
            No templates sent in this window.
          </p>
        ) : (
          <div className="mt-3 flex h-32 items-end gap-[3px] rounded-2xl border border-border bg-surface/50 px-3 py-3">
            {stats.byDay.map((day) => (
              <DayBars key={day.date} day={day} maxCount={maxDayCount} />
            ))}
          </div>
        )}

        {/* The accessible counterpart to the chart above — every number
            the bars draw, in a table a screen reader or a colourblind
            reader can use on its own. */}
        <details className="mt-2">
          <summary className="cursor-pointer text-[12.5px] text-muted hover:text-foreground">
            View as a table
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-4 font-medium">Date</th>
                  <th className="py-1 pr-4 font-medium">Delivered</th>
                  <th className="py-1 pr-4 font-medium">Failed</th>
                  <th className="py-1 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.byDay.map((day) => (
                  <tr key={day.date} className="border-t border-border/60">
                    <td className="py-1 pr-4">{day.date}</td>
                    <td className="py-1 pr-4 text-emerald-500">{day.delivered}</td>
                    <td className="py-1 pr-4 text-rose-500">{day.failed}</td>
                    <td className="py-1">{day.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div>
        <h3 className="text-sm font-semibold">By template{scopedLabel ? ` — ${scopedLabel}` : ''}</h3>
        {stats.byTemplate.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-border bg-surface/70 px-4 py-6 text-center text-sm text-muted">
            No templates sent yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-muted">
                <tr>
                  <th className="py-1.5 pr-4 font-medium">Template</th>
                  <th className="py-1.5 pr-4 font-medium">Sent</th>
                  <th className="py-1.5 pr-4 font-medium">Delivered</th>
                  <th className="py-1.5 pr-4 font-medium">Failed</th>
                  <th className="py-1.5 font-medium">Top failure reasons</th>
                </tr>
              </thead>
              <tbody>
                {stats.byTemplate.map((row) => (
                  <tr key={row.templateName} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-4 font-medium">{row.templateName}</td>
                    <td className="py-2 pr-4 tabular-nums">{row.total}</td>
                    <td className="py-2 pr-4 tabular-nums text-emerald-500">{row.delivered}</td>
                    <td className={`py-2 pr-4 tabular-nums ${row.failed > 0 ? 'text-rose-500' : ''}`}>{row.failed}</td>
                    <td className="py-2 text-muted">
                      {row.topFailureReasons.length === 0
                        ? '—'
                        : row.topFailureReasons.map((r) => `${r.reason} (${r.count})`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Only meaningful across the whole workspace — scoped to one
          number this would just repeat the single row the tiles above
          already show. */}
      {numberId === ALL ? (
        <div>
          <h3 className="text-sm font-semibold">By number</h3>
          {stats.byNumber.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-border bg-surface/70 px-4 py-6 text-center text-sm text-muted">
              No templates sent yet.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1.5 pr-4 font-medium">Number</th>
                    <th className="py-1.5 pr-4 font-medium">Assigned to</th>
                    <th className="py-1.5 pr-4 font-medium">Sent</th>
                    <th className="py-1.5 font-medium">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byNumber.map((row) => (
                    <tr
                      key={row.whatsappPhoneNumberId}
                      onClick={() => setNumberId(row.whatsappPhoneNumberId)}
                      className="cursor-pointer border-t border-border/60 hover:bg-surface-hover"
                    >
                      <td className="py-2 pr-4 font-medium">{row.displayPhoneNumber}</td>
                      <td className="py-2 pr-4 text-muted">
                        {assignedNameByNumber.get(row.whatsappPhoneNumberId) ?? 'Unassigned'}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{row.total}</td>
                      <td className={`py-2 tabular-nums ${row.failed > 0 ? 'text-rose-500' : ''}`}>{row.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[11.5px] text-muted">Tap a number to see its own breakdown above.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
