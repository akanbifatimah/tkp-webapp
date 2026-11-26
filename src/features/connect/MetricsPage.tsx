import { CalendarRange, UserX } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { CountUp } from "@/components/ui/CountUp";
import { EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { Columns, DataTable, Legend, Panel, S1, S2, S3 } from "@/features/welcome/lcm-parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { TEAM_LABEL } from "@/lib/permissions";
import { churchDate } from "@/lib/time";
import { DraftNotice } from "./DraftNotice";
import { CONNECT_TAGLINE } from "./model";
import { useMetrics } from "./queries";
import type { MetricsResponse, Ratio } from "./types";

/**
 * TKP Connect UI-C7 (PLANNED) · Team metrics: the doc 01 §8.2 metrics, with
 * DRAFT definitions (doc 09 Q10–Q12), plus the live Integration % (FI-70).
 */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (k: string) => `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
const addMonths = (k: string, n: number) => {
  const m = +k.slice(0, 4) * 12 + (+k.slice(5, 7) - 1) + n;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};
const pctOf = (r: Ratio) => (r.due ? Math.round((r.done * 100) / r.due) : null);

export function MetricsPage() {
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const q = useMetrics(period);
  const d = q.data;
  const thisMonth = churchDate(new Date()).slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, -i));

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="Connect · How the teams are doing" title="Team metrics" tagline={CONNECT_TAGLINE} />
      <DraftNotice questions="Q10, Q11, Q12">
        Definitions follow doc 01 §8.2 and are not confirmed yet. KPI deadlines use Q10’s proposal: 48 hours for the welcome, the welcome call by day 3, culture and interests by the end of week 2. Every Connect role sees this page until Q12 is answered.
      </DraftNotice>

      <motion.label variants={fadeUp} className="grid w-fit gap-1">
        <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-muted uppercase">
          <CalendarRange className="size-3.5" aria-hidden /> Guests whose first visit was in
        </span>
        <select value={d?.period.key ?? period ?? ""} onChange={(e) => setPeriod(e.target.value)} className="h-11 min-w-56 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink shadow-card">
          {months.map((m, i) => (
            <option key={m} value={m}>
              {ym(m)}
              {i === 0 ? " (to date)" : ""}
            </option>
          ))}
          <option value="ytd">Year to date</option>
        </select>
      </motion.label>

      {q.isError && !d ? (
        q.error instanceof ApiError && q.error.code === "NO_FOLLOW_UP_TEAM" ? (
          <div className="rounded-3xl bg-white shadow-card">
            <EmptyState icon={<UserX />} title="Not on a follow-up team">
              {q.error.message}
            </EmptyState>
          </div>
        ) : (
          <ErrorBanner>{q.error.message}</ErrorBanner>
        )
      ) : !d ? (
        <Skeleton className="h-125 rounded-3xl" />
      ) : (
        <Metrics d={d} fetching={q.isFetching} />
      )}
    </motion.div>
  );
}

function Metrics({ d, fetching }: { d: MetricsResponse; fetching: boolean }) {
  const drops = d.funnel.slice(1).map((f, i) => ({ from: d.funnel[i]!.label, to: f.label, lost: d.funnel[i]!.n - f.n }));
  const worst = [...drops].sort((a, b) => b.lost - a.lost)[0];
  const maxF = Math.max(1, ...d.funnel.map((f) => f.n));

  return (
    <div className={cn("space-y-6 transition-opacity", fetching && "opacity-60")}>
      {/* Phase 1 checklist as KPIs */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-maroon-900">
          Phase 1 checklist · {d.period.label} <span className="font-sans text-sm font-semibold text-muted">· {d.cohort} first-time guests · goal 100%</span>
        </h2>
        <motion.div key={d.period.key} variants={stagger(0.04)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {d.kpis.map((k) => {
            const p = pctOf(k.ratio);
            return (
              <motion.div key={k.key} variants={fadeUp} className="rounded-2xl border border-white bg-white p-4 shadow-card">
                <p className="text-sm font-bold text-ink">{k.label}</p>
                <p className={cn("mt-2 font-display text-[32px] leading-none font-semibold tabular", p === null ? "text-muted" : p >= 80 ? "text-ok" : p >= 50 ? "text-warn" : "text-crit")}>
                  {p === null ? "—" : <CountUp value={p} format={(n) => `${Math.round(n)}%`} />}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cream-200">
                  <motion.div className="h-full rounded-full bg-maroon-700" initial={{ width: 0 }} animate={{ width: `${p ?? 0}%` }} transition={{ duration: 0.7 }} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {k.ratio.done} of {k.ratio.due} · {k.deadline}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Phase 1 funnel" sub={`${d.period.label} first visits`}>
          <ul className="grid gap-2">
            {d.funnel.map((f) => (
              <li key={f.label} className="grid grid-cols-[minmax(0,11rem)_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="truncate font-semibold text-ink">{f.label}</span>
                <span className="h-3 overflow-hidden rounded-full bg-cream-200">
                  <motion.span className="block h-full rounded-full" style={{ background: S1 }} initial={{ width: 0 }} animate={{ width: `${(f.n * 100) / maxF}%` }} transition={{ duration: 0.6 }} />
                </span>
                <b className="text-right tabular">{f.n}</b>
              </li>
            ))}
          </ul>
          {worst && worst.lost > 0 ? (
            <p className="mt-3 text-sm text-muted">
              Biggest drop: between <b className="text-ink">{worst.from.toLowerCase()}</b> and <b className="text-ink">{worst.to.toLowerCase()}</b> ({worst.lost} guests).
            </p>
          ) : null}
        </Panel>

        <Panel title="Contact and return">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="48-hour contact rate" value={pctOf(d.contact48)} sub={`${d.contact48.done} of ${d.contact48.due}`} />
            <Stat
              label="Median hours to first contact"
              raw={d.medianHoursToFirstContact === null ? "—" : `${Math.round(d.medianHoursToFirstContact)} h`}
              sub={d.priorMedianHoursToFirstContact === null ? "no earlier data" : `before: ${Math.round(d.priorMedianHoursToFirstContact)} h`}
            />
            <Stat label="Confirmed 30-day return" value={pctOf(d.return30)} sub={`${d.return30.done} of ${d.return30.due}`} />
            <Stat label="60-day cell-group connection" value={pctOf(d.cell60)} sub={`${d.cell60.done} of ${d.cell60.due}`} />
            <Stat label="90-day integration" value={pctOf(d.integration90)} sub={`${d.integration90.done} of ${d.integration90.due} · membership Interested`} />
            <Stat label="Completed this year" raw={String(d.completedThisYear)} sub="12-week journeys" />
          </div>
          <p className="mt-3 text-xs text-muted">“Due” counts only guests whose window (48 hours, 30, 60 or 90 days) has already ended.</p>
        </Panel>
      </div>

      <Panel title="Integration % by service month" sub="live in TKP Connect (FI-70) · Interested ÷ all guests" aside={<Legend items={[{ label: "Interested", color: S1 }, { label: "Undecided", color: S3 }, { label: "Not yet asked", color: "#9A9893" }, { label: "Not interested", color: S2 }]} />}>
        <Columns
          stacked
          height={250}
          data={d.integrationByMonth.map((m) => ({ label: MON[+m.month.slice(5, 7) - 1]!, Interested: m.interested, Undecided: m.undecided, "Not yet asked": m.notYetAsked, "Not interested": m.notInterested }))}
          series={[
            { key: "Interested", label: "Interested", color: S1 },
            { key: "Undecided", label: "Undecided", color: S3 },
            { key: "Not yet asked", label: "Not yet asked", color: "#9A9893" },
            { key: "Not interested", label: "Not interested", color: S2 },
          ]}
        />
        <DataTable
          className="mt-3"
          head={["Month", "Guests", "Interested", "Integration %"]}
          rows={[...d.integrationByMonth].reverse().slice(0, 6).map((m) => [ym(m.month), m.total, m.interested, <b key="p">{m.total ? `${Math.round((m.interested * 100) / m.total)}%` : "—"}</b>])}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Loss by stage" sub={`closed journeys · ${d.period.label} first visits`}>
          <Columns height={200} data={d.lossByStage.map((l) => ({ label: l.stage, closed: l.closed }))} series={[{ key: "closed", label: "Closed", color: S2 }]} />
        </Panel>
        <Panel title="Cohort retention" sub="by month of first visit · not closed = still with us">
          <DataTable
            head={["First visit", "Guests", "Active", "Completed", "Closed", "Retained"]}
            rows={d.retention.map((r) => [ym(r.month), r.guests, r.active, r.completed, r.closed, <b key="r">{r.guests ? `${Math.round(((r.active + r.completed) * 100) / r.guests)}%` : "—"}</b>])}
          />
        </Panel>
      </div>

      <Panel title="Workload · open guests by person" sub="48-hour rate over the last 90 days · logs in the last 30 days">
        <DataTable
          head={["Person", "Open", "Overdue", "48-hour rate", "Logged (30 d)"]}
          rows={d.workload.flatMap((w, i) => {
            const header =
              i === 0 || d.workload[i - 1]!.team !== w.team
                ? [[<b key="t" className="text-xs tracking-wide text-maroon-700 uppercase">{TEAM_LABEL[w.team]}</b>, "", "", "", ""]]
                : [];
            const p = pctOf(w.contact48);
            return [...header, [w.name, w.open, w.overdue ? <b key="o" className="text-crit">{w.overdue}</b> : 0, p === null ? "—" : `${p}%`, w.logged30]];
          })}
        />
        <p className="mt-2 text-xs text-muted">Overdue: Integration Team = 48 hours overdue (BR-13); Church office = assigned but not contacted yet.</p>
      </Panel>
    </div>
  );
}

function Stat({ label, value, raw, sub }: { label: string; value?: number | null; raw?: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-cream-50 p-3">
      <p className="font-display text-[26px] leading-none font-semibold text-maroon-900 tabular">{raw ?? (value === null || value === undefined ? "—" : <CountUp value={value} format={(n) => `${Math.round(n)}%`} />)}</p>
      <p className="mt-1.5 text-xs font-bold text-ink">{label}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}
