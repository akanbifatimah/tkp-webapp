import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { fadeUp } from "@/lib/motion";
import { pct, pctChange } from "./model";

/**
 * Chart pieces for the LCM report. Series colours: the validated brand trio
 * (dataviz validator: all checks pass), fixed order, never cycled.
 */
export const S1 = "#9B2A31"; // this year / primary series
export const S2 = "#2E6CA8"; // last year / second series
export const S3 = "#B8861B"; // third series
export const PRIOR = "#9A9893";
const GRID = "#ebe3d6";
const AXIS = { fontSize: 11, fill: "#6b5f57" } as const;

/* ----------------------------------------------------------------- layout */

export function ReportSection({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <motion.section variants={fadeUp} className="space-y-4 break-inside-avoid-page">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2">
        <h2 className="font-display text-2xl font-semibold text-maroon-900">{title}</h2>
        {sub ? <span className="text-sm text-muted">{sub}</span> : null}
      </div>
      {children}
    </motion.section>
  );
}

export function Panel({ title, sub, aside, className, children }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-3xl border border-white bg-white p-5 shadow-card", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-maroon-900">
          {title} {sub ? <span className="font-sans text-xs font-semibold text-muted">{sub}</span> : null}
        </h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-3 text-xs font-bold text-ink">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- numbers */

/** ▲ 12% · new · ■ 0% (TKP Connect delta). */
export function Change({ cur, pri, unit, big }: { cur: number; pri: number; unit?: string; big?: boolean }) {
  const ch = pctChange(cur, pri);
  const cls = ch === null ? "text-muted" : ch > 0.5 ? "text-ok" : ch < -0.5 ? "text-crit" : "text-muted";
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-1 font-bold", big ? "text-base" : "text-xs")}>
      <span className={cls}>{ch === null ? "new" : `${ch > 0.5 ? "▲" : ch < -0.5 ? "▼" : "■"} ${Math.abs(ch).toFixed(big ? 1 : 0)}%`}</span>
      {unit ? <span className="font-semibold text-muted">{unit}</span> : null}
    </span>
  );
}

export function RatingChange({ a, b, unit }: { a: number | null; b: number | null; unit?: string }) {
  if (a === null || b === null) return <span className="text-xs text-muted">—</span>;
  const d = a - b;
  const cls = d > 0.04 ? "text-ok" : d < -0.04 ? "text-crit" : "text-muted";
  return (
    <span className="inline-flex items-baseline gap-1 text-xs font-bold">
      <span className={cls}>
        {d > 0.04 ? "▲ " : d < -0.04 ? "▼ " : ""}
        {d >= 0 ? "+" : ""}
        {d.toFixed(2)}
      </span>
      {unit ? <span className="font-semibold text-muted">{unit}</span> : null}
    </span>
  );
}

/** Headline comparison card: this period vs that period. */
export function CompareCard({ title, cur, curLabel, pri, priLabel }: { title: string; cur: number; curLabel: string; pri: number; priLabel: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 rounded-3xl border border-maroon-200 bg-linear-to-br from-white to-maroon-100/50 p-5 shadow-card">
      <p className="col-span-3 text-xs font-extrabold tracking-[0.14em] text-maroon-700 uppercase">{title}</p>
      <div>
        <p className="font-display text-[40px] leading-none font-semibold text-maroon-900 tabular">{cur}</p>
        <p className="mt-1 text-xs font-semibold text-muted">{curLabel}</p>
      </div>
      <p className="pb-5 text-xs font-bold text-muted">vs</p>
      <div>
        <p className="font-display text-[40px] leading-none font-semibold text-muted/70 tabular">{pri}</p>
        <p className="mt-1 text-xs font-semibold text-muted">{priLabel}</p>
      </div>
      <p className="col-span-3 flex items-baseline gap-2 border-t border-line pt-3">
        <Change cur={cur} pri={pri} big />
        <span className="text-sm font-semibold text-muted">
          {cur - pri >= 0 ? "+" : ""}
          {cur - pri} guests
        </span>
      </p>
    </div>
  );
}

export function StatTile({ label, value, extra, sub }: { label: string; value: ReactNode; extra?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white bg-white p-4 shadow-card">
      <p className="flex items-baseline gap-1.5">
        <span className="font-display text-[26px] leading-none font-semibold text-maroon-900 tabular">{value}</span>
        {extra ? <span className="text-sm font-bold text-muted">{extra}</span> : null}
      </p>
      <p className="mt-2 text-sm font-semibold text-ink">{label}</p>
      <div className="mt-1 min-h-4">{sub}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- bars */

/** Horizontal bars with count and share (who is visiting, top cities…). */
export function HBars({ counts, order, color = S2, top }: { counts: Record<string, number>; order?: string[] | null; color?: string; top?: number }) {
  const tot = Object.values(counts).reduce((a, b) => a + b, 0);
  let keys = order ? order.filter((k) => counts[k]) : Object.keys(counts).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  if (top) keys = keys.slice(0, top);
  if (!keys.length) return <p className="text-sm text-muted">No guests in this selection.</p>;
  const max = Math.max(...keys.map((k) => counts[k] ?? 0), 1);
  return (
    <div className="grid gap-2">
      {keys.map((k) => {
        const v = counts[k] ?? 0;
        return (
          <div key={k} className="grid grid-cols-[minmax(0,8.5rem)_1fr_4.5rem] items-center gap-3 text-sm" title={`${k}: ${v} (${pct(v, tot)}%)`}>
            <span className="truncate font-semibold text-ink">{k}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-cream-200">
              <motion.span
                className="block h-full rounded-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                whileInView={{ width: `${(v * 100) / max}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="text-right tabular">
              <b>{v}</b> <span className="text-xs text-muted">{pct(v, tot)}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Female / Male split bar. */
export function GenderSplit({ female, male, other }: { female: number; male: number; other: number }) {
  const t = female + male + other || 1;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-cream-200" role="img" aria-label={`Female ${female}, Male ${male}`}>
        <motion.span className="h-full" style={{ background: S1 }} initial={{ width: 0 }} whileInView={{ width: `${(female * 100) / t}%` }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
        <motion.span className="h-full border-l-2 border-white" style={{ background: S2 }} initial={{ width: 0 }} whileInView={{ width: `${(male * 100) / t}%` }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink tabular">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: S1 }} />
          Female <b>{female}</b> · {pct(female, t)}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: S2 }} />
          Male <b>{male}</b> · {pct(male, t)}%
        </span>
        {other ? <span className="text-muted">Not given {other}</span> : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- small charts */

/** A 0–10 half-circle gauge. */
export function Gauge({ value }: { value: number | null }) {
  const v = value ?? 0;
  const a = Math.PI * (1 - v / 10);
  const x = 60 + 50 * Math.cos(a);
  const y = 60 - 50 * Math.sin(a);
  return (
    <svg viewBox="0 0 120 76" className="w-full max-w-36" role="img" aria-label={`${value === null ? "No rating" : value.toFixed(2)} out of 10`}>
      <path d="M10,60 A50,50 0 0 1 110,60" fill="none" stroke="#f1e9dc" strokeWidth="11" strokeLinecap="round" />
      {value !== null && v > 0 ? (
        <motion.path
          d={`M10,60 A50,50 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}`}
          fill="none"
          stroke={v <= 5 ? "#b3382e" : S1}
          strokeWidth="11"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : null}
      <text x="60" y="56" textAnchor="middle" className="fill-maroon-900 font-display text-[19px] font-semibold">
        {value === null ? "—" : value.toFixed(2)}
      </text>
      <text x="10" y="74" textAnchor="middle" className="fill-muted text-[9px]">
        0
      </text>
      <text x="110" y="74" textAnchor="middle" className="fill-muted text-[9px]">
        10
      </text>
    </svg>
  );
}

/** A tiny trend line (nulls leave gaps). */
export function Spark({ values, color = S1, w = 120, h = 28 }: { values: (number | null)[]; color?: string; w?: number; h?: number }) {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return <span className="text-xs text-muted">—</span>;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = values.length > 1 ? (w - 4) / (values.length - 1) : 0;
  let d = "";
  values.forEach((v, i) => {
    if (v === null) return;
    const px = 2 + i * step;
    const py = h - 3 - ((v - min) / span) * (h - 6);
    d += `${d && values[i - 1] !== null ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)} `;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full max-w-32" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ----------------------------------------------------------------- Recharts wrappers */

type Series = { key: string; label: string; color: string };

function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: { dataKey?: unknown; value?: unknown; color?: string; name?: unknown }[]; label?: unknown; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-ink px-3 py-2 text-xs text-cream-50 shadow-lift">
      <p className="mb-1 font-bold">{String(label)}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          {String(p.name)}: <b>{p.value === null || p.value === undefined ? "—" : fmt ? fmt(Number(p.value)) : String(p.value)}</b>
        </p>
      ))}
    </div>
  );
}

/** Line chart with value labels on every point where asked (the LCM needs them). */
export function Lines({
  data,
  series,
  height = 240,
  domain,
  labels,
  fmt,
}: {
  data: Record<string, string | number | null>[];
  series: Series[];
  height?: number;
  domain?: [number, number];
  labels?: boolean;
  fmt?: (v: number) => string;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={AXIS} interval={0} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} domain={domain ?? [0, "auto"]} allowDecimals={!!fmt} />
          <Tooltip content={<ChartTip fmt={fmt} />} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} animationDuration={700}>
              {labels ? <LabelList dataKey={s.key} position={i === 0 ? "top" : "bottom"} className="tabular" style={{ fontSize: 10, fill: "#4a3f38", fontWeight: 700 }} formatter={(v: unknown) => (v === null || v === undefined ? "" : fmt ? fmt(Number(v)) : String(v))} /> : null}
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Columns: single series, stacked, or grouped. */
export function Columns({
  data,
  series,
  height = 230,
  stacked,
  onPick,
}: {
  data: Record<string, string | number>[];
  series: Series[];
  height?: number;
  stacked?: boolean;
  onPick?: (key: string) => void;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: -18 }} barCategoryGap={stacked ? "24%" : "18%"} barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={AXIS} interval={0} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS} />
          <Tooltip cursor={{ fill: "rgb(110 13 18 / 0.06)" }} content={<ChartTip />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? "a" : undefined}
              stroke="#fff"
              strokeWidth={stacked ? 1 : 0}
              radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              animationDuration={600}
              onClick={onPick ? (b: { payload?: { key?: string } }) => b.payload?.key && onPick(b.payload.key) : undefined}
              cursor={onPick ? "pointer" : undefined}
            >
              {!stacked && series.length === 1 ? <LabelList dataKey={s.key} position="top" style={{ fontSize: 10, fill: "#4a3f38", fontWeight: 700 }} /> : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A plain data table with tabular numbers. */
export function DataTable({ head, rows, className }: { head: ReactNode[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left text-[13px] tabular">
        <thead>
          <tr className="text-[11px] font-extrabold tracking-wide whitespace-nowrap text-muted uppercase">
            {head.map((h, i) => (
              <th key={i} className={cn("px-2 py-2", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className={cn("px-2 py-2 align-middle", j > 0 && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
