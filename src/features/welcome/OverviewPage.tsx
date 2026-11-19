import { ChevronLeft, ChevronRight, CalendarDays, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountUp } from "@/components/ui/CountUp";
import { ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { serviceDateLong, serviceDateShort } from "@/lib/time";
import { CELLS, CELL_COLOR, OTHER_TYPE_COLOR, SERVICE_TYPES, WELCOME_TAGLINE, pct, pctChange } from "./model";
import { useOverview } from "./queries";
import type { CellCounts, OverviewResponse, Scope } from "./types";

/** TKP Connect UI-W1 · Welcome › Overview (the landing page). Counts only; no names. */

const SCOPES: { id: Scope; label: string }[] = [
  { id: "service", label: "This service" },
  { id: "mtd", label: "Month to date" },
  { id: "ytd", label: "Year to date" },
];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function OverviewPage() {
  const [date, setDate] = useState<string | undefined>(undefined); // undefined = Latest
  const [scope, setScope] = useState<Scope>("service");
  const q = useOverview(date, scope);
  const d = q.data;

  const step = (dir: 1 | -1) => {
    if (!d) return;
    const i = d.dates.indexOf(d.meta.date);
    const j = i + dir;
    if (i >= 0 && j >= 0 && j < d.dates.length) setDate(d.dates[j]);
  };

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="1 · Welcome" title="Overview" tagline={WELCOME_TAGLINE} />

      {/* Date control and Show (UI-W1) */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-end gap-3">
        <div className="grid w-full gap-1 sm:w-auto">
          <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-muted uppercase">
            <CalendarDays className="size-3.5" aria-hidden /> Service date
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <StepButton label="Previous service date" onClick={() => step(1)} disabled={!d || d.dates.indexOf(d.meta.date) >= d.dates.length - 1}>
              <ChevronLeft className="size-4.5" />
            </StepButton>
            <select
              aria-label="Service date"
              value={d?.meta.date ?? ""}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink shadow-card sm:min-w-56 sm:flex-none"
            >
              {(d?.dates ?? []).map((x) => (
                <option key={x} value={x}>
                  {serviceDateLong(x)}
                </option>
              ))}
            </select>
            <StepButton label="Next service date" onClick={() => step(-1)} disabled={!d || d.dates.indexOf(d.meta.date) <= 0}>
              <ChevronRight className="size-4.5" />
            </StepButton>
            <button
              type="button"
              onClick={() => setDate(undefined)}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-bold transition-colors",
                date === undefined ? "border-gold-400 bg-gold-100 text-gold-800" : "border-line bg-white text-ink hover:border-maroon-200",
              )}
            >
              <Sparkles className="size-4" aria-hidden /> Latest
            </button>
          </div>
        </div>

        <div className="grid gap-1">
          <span className="text-xs font-extrabold tracking-wide text-muted uppercase">Show</span>
          <div role="radiogroup" aria-label="Show" className="inline-flex rounded-2xl border border-line bg-white p-1 shadow-card">
            {SCOPES.map((s) => {
              const on = s.id === scope;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setScope(s.id)}
                  className={cn("relative h-9 rounded-xl px-3.5 text-sm font-bold transition-colors", on ? "text-cream-50" : "text-muted hover:text-ink")}
                >
                  {on ? <motion.span layoutId="scope-pill" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
                  <span className="relative">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}

      {!d ? (
        <OverviewSkeleton />
      ) : (
        <div className={cn("space-y-6 transition-opacity", q.isFetching && "opacity-70")}>
          <p className="font-display text-lg font-semibold text-maroon-900">
            {d.meta.scope === "service" ? serviceDateLong(d.meta.date) : `${serviceDateShort(d.meta.currentStart)} – ${serviceDateLong(d.meta.currentEnd)}`}
          </p>
          <KpiTiles data={d} />
          <CellTiles current={d.cells.current} prior={d.cells.prior} priorLabel={d.meta.scope === "service" ? "vs prev." : "vs last year"} />
          <ServiceChart
            data={d}
            onPick={(key) => {
              if (d.meta.scope === "ytd") {
                // A month column opens that month (Month to date), on its last service date up to the selected date.
                const inMonth = d.dates.filter((x) => x.slice(0, 7) === key.slice(0, 7) && x <= d.meta.date);
                if (!inMonth.length) return;
                setDate(inMonth[0]);
                setScope("mtd");
              } else setDate(key);
            }}
          />
        </div>
      )}
    </motion.div>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-11 place-items-center rounded-xl border border-line bg-white text-ink shadow-card hover:border-maroon-200 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- change vs prior */

/** ▲ 12% / ▼ 4% / ■ 0% / new: TKP Connect's delta (itg-charts.js). */
export function Delta({ current, prior, unit }: { current: number; prior: number; unit?: string }) {
  const ch = pctChange(current, prior);
  const cls = ch === null ? "text-muted" : ch > 0.5 ? "text-ok" : ch < -0.5 ? "text-crit" : "text-muted";
  const text = ch === null ? "new" : `${ch > 0.5 ? "▲" : ch < -0.5 ? "▼" : "■"} ${Math.abs(ch).toFixed(0)}%`;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1 text-xs font-bold">
      <span className={cls}>{text}</span>
      {unit ? <span className="font-semibold text-muted">{unit}</span> : null}
    </span>
  );
}

function RatingDelta({ a, b }: { a: number | null; b: number | null }) {
  if (a === null || b === null) return null;
  const d = a - b;
  const cls = d > 0.04 ? "text-ok" : d < -0.04 ? "text-crit" : "text-muted";
  return (
    <span className={cn("text-xs font-bold", cls)}>
      {d > 0.04 ? "▲ " : d < -0.04 ? "▼ " : ""}
      {d >= 0 ? "+" : ""}
      {d.toFixed(2)}
    </span>
  );
}

/* ----------------------------------------------------------------- 10 KPI tiles (FI-31) */

function KpiTiles({ data: d }: { data: OverviewResponse }) {
  const c = d.kpis.current;
  const p = d.kpis.prior;
  const cmp =
    d.meta.scope === "service"
      ? d.meta.priorStart
        ? `vs ${serviceDateShort(d.meta.priorStart)}`
        : "no earlier service"
      : `vs same period ${Number(d.meta.date.slice(0, 4)) - 1}`;
  const share = (n: number) => `${pct(n, c.guests)}%`;

  const tiles: { label: string; value: React.ReactNode; extra?: string; delta?: React.ReactNode; tone?: "lead" | "warn" }[] = [
    { label: "Guests", value: <CountUp value={c.guests} />, delta: <Delta current={c.guests} prior={p.guests} unit={cmp} />, tone: "lead" },
    { label: "Female", value: <CountUp value={c.female} />, extra: share(c.female), delta: <Delta current={c.female} prior={p.female} /> },
    { label: "Male", value: <CountUp value={c.male} />, extra: share(c.male), delta: <Delta current={c.male} prior={p.male} /> },
    { label: "Want to become members", value: <CountUp value={c.membershipYes} />, extra: share(c.membershipYes), delta: <Delta current={c.membershipYes} prior={p.membershipYes} /> },
    { label: "Young adults (16–35)", value: <CountUp value={c.youngAdults} />, extra: share(c.youngAdults), delta: <Delta current={c.youngAdults} prior={p.youngAdults} /> },
    { label: "Adults (36+)", value: <CountUp value={c.adults} />, extra: share(c.adults), delta: <Delta current={c.adults} prior={p.adults} /> },
    { label: "Will come again (yes)", value: <CountUp value={pct(c.willComeAgainYes, c.guests)} format={(n) => `${Math.round(n)}%`} />, extra: String(c.willComeAgainYes) },
    {
      label: "Average rating",
      value: c.avgRating === null ? "—" : <CountUp value={c.avgRating} format={(n) => n.toFixed(2)} />,
      extra: "/ 10",
      delta: <RatingDelta a={c.avgRating} b={p.avgRating} />,
    },
    { label: "Invited by someone", value: <CountUp value={c.referrals} />, extra: share(c.referrals), delta: <Delta current={c.referrals} prior={p.referrals} /> },
    {
      label: "Zip not on cell map",
      value: <CountUp value={c.notOnCellMap} />,
      delta: c.notOnCellMap ? <span className="text-xs font-semibold text-muted">see LCM Metrics · map</span> : null,
      tone: c.notOnCellMap ? "warn" : undefined,
    },
  ];

  return (
    <motion.div key={`${d.meta.date}-${d.meta.scope}`} variants={stagger(0.03)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
      {tiles.map((t) => (
        <motion.div
          key={t.label}
          variants={fadeUp}
          className={cn(
            "rounded-2xl border p-4 shadow-card sm:p-5",
            t.tone === "lead" ? "border-maroon-200 bg-linear-to-br from-white to-maroon-100/50" : "border-white bg-white",
          )}
        >
          <div className="flex items-baseline gap-1.5">
            <span className={cn("font-display text-[30px] leading-none font-semibold tracking-tight tabular", t.tone === "warn" ? "text-warn" : "text-maroon-900")}>{t.value}</span>
            {t.extra ? <span className="text-sm font-bold text-muted">· {t.extra}</span> : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink">{t.label}</p>
          <div className="mt-1 min-h-4">{t.delta}</div>
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ----------------------------------------------------------------- cell tiles (FI-32) */

export function CellTiles({ current, prior, priorLabel }: { current: CellCounts; prior?: CellCounts; priorLabel?: string }) {
  const tot = Object.values(current).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <motion.section variants={fadeUp} className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-maroon-900">Cell groups</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[...CELLS, "N/A" as const].map((cell) => {
          const n = current[cell] ?? 0;
          const share = pct(n, tot);
          return (
            <div key={cell} className="rounded-2xl border border-white bg-white p-4 shadow-card" title={`${cell}: ${n} guests (${share}%)`}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-ink">
                  <span className="size-2.5 rounded-full" style={{ background: CELL_COLOR[cell] }} aria-hidden />
                  {cell === "N/A" ? "No cell for zip" : `${cell} cell`}
                </span>
                <span className="text-xs font-bold text-muted tabular">{share}%</span>
              </div>
              <p className="mt-2 font-display text-[28px] leading-none font-semibold text-maroon-900 tabular">
                <CountUp value={n} />
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream-200">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: CELL_COLOR[cell] }}
                  initial={{ width: 0 }}
                  animate={{ width: `${tot ? (n * 100) / tot : 0}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              {prior ? (
                <div className="mt-2">
                  <Delta current={n} prior={prior[cell] ?? 0} unit={priorLabel} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

/* ----------------------------------------------------------------- guests by service date (FI-33) */

function ServiceChart({ data: d, onPick }: { data: OverviewResponse; onPick: (key: string) => void }) {
  const ytd = d.meta.scope === "ytd";
  const yr = d.meta.date.slice(0, 4);
  const mo = Number(d.meta.date.slice(5, 7));
  const types = [...new Set(d.chart.map((c) => c.type))];
  const series = [
    ...SERVICE_TYPES.filter((s) => types.includes(s.full)),
    ...types.filter((t) => !SERVICE_TYPES.some((s) => s.full === t)).map((t) => ({ full: t, short: t, color: OTHER_TYPE_COLOR })),
  ];

  const keys = ytd
    ? Array.from({ length: mo }, (_, i) => `${yr}-${String(i + 1).padStart(2, "0")}-01`)
    : [...new Set(d.chart.map((c) => c.date))].sort();
  const rows = keys.map((k) => {
    const row: Record<string, string | number> = {
      key: k,
      label: ytd ? MON[Number(k.slice(5, 7)) - 1]! : serviceDateShort(k),
    };
    let total = 0;
    for (const s of series) {
      const n = d.chart.find((c) => c.date === k && c.type === s.full)?.guests ?? 0;
      row[s.full] = n;
      total += n;
    }
    row.total = total;
    return row;
  });
  const total = rows.reduce((a, r) => a + Number(r.total), 0);
  const selected = ytd ? keys[keys.length - 1] : d.meta.date;

  return (
    <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-maroon-900">
          {ytd ? "Guests by month" : "Guests by service date"}{" "}
          <span className="font-sans text-sm font-semibold text-muted">
            {ytd ? `· Jan – ${MON[mo - 1]} ${yr} · ${total} guests` : d.meta.scope === "service" ? "· last 16 service dates" : `· ${MON[mo - 1]} ${yr} to date · ${total} guests`}
          </span>
        </h2>
        <ul className="flex flex-wrap gap-3 text-xs font-bold text-ink">
          {series.map((s) => (
            <li key={s.full} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.short}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-1 text-xs text-muted">
        {ytd
          ? "Guests per month this year up to the selected date, one column per service. Click a month to see its service dates."
          : `${d.meta.scope === "service" ? "The 16 most recent service dates up to the selected one" : "Every service date this month up to the selected one"}, one column per service. Click a date to open it.`}
      </p>

      <div className="mt-4 h-72" role="img" aria-label={ytd ? `Guests per month by service type, ${yr}` : "Guests per service date by service type"}>
        {rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="#ebe3d6" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#ebe3d6" }} tick={{ fontSize: 11, fill: "#6b5f57", fontWeight: 600 }} interval={0} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6b5f57" }} />
              <Tooltip
                cursor={{ fill: "rgb(110 13 18 / 0.06)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-xl bg-ink px-3 py-2 text-xs text-cream-50 shadow-lift">
                      <p className="mb-1 font-bold">
                        {label} · {payload.reduce((a, p) => a + Number(p.value), 0)} guests
                      </p>
                      {payload.map((p) => (
                        <p key={String(p.dataKey)} className="flex items-center gap-1.5">
                          <span className="size-2 rounded-sm" style={{ background: String(p.color) }} />
                          {series.find((s) => s.full === p.dataKey)?.short}: <b>{p.value}</b>
                        </p>
                      ))}
                    </div>
                  ) : null
                }
              />
              {series.map((s) => (
                <Bar
                  key={s.full}
                  dataKey={s.full}
                  stackId="guests"
                  fill={s.color}
                  shape={(props: unknown) => <Segment {...(props as SegmentProps)} rounded={topSeries(rows[(props as SegmentProps).index], series) === s.full} />}
                  animationDuration={600}
                  cursor="pointer"
                  onClick={(bar: { payload?: { key?: string } }) => bar.payload?.key && onPick(bar.payload.key)}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="grid h-full place-items-center text-sm text-muted">No guests yet.</p>
        )}
      </div>
      {selected ? (
        <p className="mt-2 text-xs font-semibold text-muted">
          Selected: <span className="text-maroon-700">{ytd ? `${MON[mo - 1]} ${yr}` : serviceDateLong(selected)}</span>
        </p>
      ) : null}

      {/* The same numbers as a table, for screen readers (dataviz: a table view exists). */}
      <div className="sr-only">
      <table>
        <caption>{ytd ? "Guests by month" : "Guests by service date"}</caption>
        <thead>
          <tr>
            <th>{ytd ? "Month" : "Service date"}</th>
            {series.map((s) => (
              <th key={s.full}>{s.short}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.key)}>
              <td>{r.label}</td>
              {series.map((s) => (
                <td key={s.full}>{r[s.full]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </motion.section>
  );
}

type SegmentProps = { x: number; y: number; width: number; height: number; fill: string; index: number; onClick?: () => void };

/** The series drawn last (on top) with guests in this column. */
function topSeries(row: Record<string, string | number> | undefined, series: { full: string }[]) {
  if (!row) return null;
  for (let i = series.length - 1; i >= 0; i--) if (Number(row[series[i]!.full]) > 0) return series[i]!.full;
  return null;
}

/** A stacked segment: 2px surface gap between segments, 4px rounded top on the column's top segment. */
function Segment({ x, y, width, height, fill, rounded }: SegmentProps & { rounded: boolean }) {
  if (!height || height <= 0) return null;
  const g = 1; // half of the 2px gap
  const top = y + g;
  const h = Math.max(0, height - 2 * g);
  const r = rounded ? Math.min(4, width / 2, h) : 0;
  const d = r
    ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`
    : `M${x},${top} H${x + width} V${top + h} H${x} Z`;
  return <path d={d} fill={fill} className="cursor-pointer" />;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the overview">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-80 rounded-3xl" />
    </div>
  );
}
