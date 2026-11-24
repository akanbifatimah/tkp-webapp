import { CalendarRange, Download } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { churchDate, serviceDateLong, serviceDateShort } from "@/lib/time";
import { CellTiles } from "./OverviewPage";
import type { BreakdownDim, LcmOutcome, LcmResponse } from "./lcm-types";
import { Map1, Map2, EmergingChip } from "./LcmMaps";
import { Change, Columns, CompareCard, DataTable, GenderSplit, Gauge, HBars, Legend, Lines, Panel, PRIOR, RatingChange, ReportSection, S1, S2, S3, Spark, StatTile } from "./lcm-parts";
import { useServiceOptions } from "@/features/admin/config-queries";
import { CELLS, OTHER_TYPE_COLOR, SERVICE_TYPES, WELCOME_TAGLINE, pct, pctChange } from "./model";
import { useLcm } from "./queries";

/**
 * TKP Connect UI-W4 · Welcome › LCM Metrics: the monthly Leadership Council
 * Meeting report. Totals only: no names or phones of guests.
 */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (k: string) => `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
const monName = (k: string) => MON[+k.slice(5, 7) - 1]!;
const addMonths = (k: string, n: number) => {
  const m = +k.slice(0, 4) * 12 + (+k.slice(5, 7) - 1) + n;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};
const HOW = {
  "invited by someone": { ic: "🤝", name: "Referrals", sub: "Invited by someone", color: S1 },
  "social media": { ic: "📱", name: "Social media", sub: "Facebook · Instagram · WhatsApp", color: S2 },
  "google search": { ic: "🔎", name: "Google search", sub: "Website · search engines", color: S3 },
} as const;
const HOW_OTHER: Record<string, string> = { youtube: "▶️", "drove by": "🚗", other: "✳️" };
const RATING_ICON: Record<string, string> = { Music: "🎼", Preaching: "🎤", Comfort: "💺", Hospitality: "😀", "Church environment": "⛪", "The people": "👥", Parking: "🚗", Traffic: "🚦" };
const AGE_ORDER = ["Below 16", "16-20", "21-25", "26-30", "31-35", "36-40", "41-45", "46-50", "51-65", "Above 65", "Not given"];


export function LcmPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [type, setType] = useState<string>("");
  const serviceOptions = useServiceOptions();
  const q = useLcm(month, type || undefined);
  const d = q.data;
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const exportReport = async () => {
    if (!d) return;
    setExporting(true);
    try {
      await api.welcome.lcmExport(d.meta.month, d.meta.serviceType ?? undefined);
      const root = document.documentElement;
      root.classList.add("print-lcm");
      const previousTitle = document.title;
      document.title = `LCM Metrics ${d.meta.month}${d.meta.serviceType ? ` ${d.meta.serviceType}` : ""} - TKP Hub`;
      // Let charts and maps resize to the page before the print dialog opens.
      window.dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      const done = () => {
        root.classList.remove("print-lcm");
        document.title = previousTitle;
        window.dispatchEvent(new Event("resize"));
        window.removeEventListener("afterprint", done);
      };
      window.addEventListener("afterprint", done);
      window.print();
      window.setTimeout(done, 1500);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Could not export.", { tone: "crit" });
    } finally {
      setExporting(false);
    }
  };

  const thisMonth = churchDate(new Date()).slice(0, 7);
  const months = Array.from({ length: 14 }, (_, i) => addMonths(thisMonth, -i));

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-8">
      <PageHeader
        eyebrow="1 · Welcome · Leadership Council Meeting"
        title={d ? `LCM Metrics · ${ym(d.meta.month)}${d.meta.inProgress ? ` (to ${serviceDateShort(d.meta.asOf)})` : ""}` : "LCM Metrics"}
        tagline={WELCOME_TAGLINE}
        actions={
          // Export enabled (decided Nov 19, replacing TKP Connect FI-40 for this report). Logged first, then printed.
          <button
            type="button"
            data-noprint
            disabled={!d || exporting}
            onClick={() => void exportReport()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 text-sm font-bold text-ink shadow-card hover:border-maroon-200 disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden /> {exporting ? "Preparing…" : "Export / Print to PDF"}
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3" data-noprint>
        <label className="grid gap-1">
          <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-muted uppercase">
            <CalendarRange className="size-3.5" aria-hidden /> Month
          </span>
          <select
            value={d?.meta.month ?? month ?? ""}
            onChange={(e) => setMonth(e.target.value)}
            className="h-11 min-w-52 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink shadow-card"
          >
            {months.map((k, i) => (
              <option key={k} value={k}>
                {ym(k)}
                {i === 0 ? " (to date)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-extrabold tracking-wide text-muted uppercase">Service type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-11 min-w-52 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink shadow-card">
            <option value="">All services</option>
            {serviceOptions.map((t) => (
              <option key={t.name} value={t.name}>
                {t.retired ? `${t.name} (retired)` : t.name}
              </option>
            ))}
          </select>
        </label>
        {d ? (
          <p className="pb-3 text-sm font-semibold text-muted">
            As of {serviceDateLong(d.meta.asOf)}
            {d.meta.serviceType ? ` · ${d.meta.serviceType}` : ""} · totals only, no names
          </p>
        ) : null}
      </div>

      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}
      {!d ? <LcmSkeleton /> : <Report d={d} fetching={q.isFetching} />}
    </motion.div>
  );
}

/* ================================================================= the report */

function Report({ d, fetching }: { d: LcmResponse; fetching: boolean }) {
  const m = d.meta;
  const k = m.month;
  const pk = m.priorMonth;
  const y = m.year;
  const mName = monName(k);
  const pName = monName(pk);
  const label = `${ym(k)}${m.inProgress ? ` (to ${serviceDateShort(m.asOf)})` : ""}`;
  const c = d.kpis.current;
  const p = d.kpis.prior;
  const period = (n: string) => d.periods.find((x) => x.comparison === n)!;
  const mom = period("Month over month");
  const ytd = period("Year to date");
  const wow = period("Week over week");
  const yoy = period("Year over year (month)");
  const bd = (dim: BreakdownDim) => d.breakdowns[dim] ?? [];
  const bmap = (dim: BreakdownDim, f: "month" | "priorMonth" | "ytd" = "month") => Object.fromEntries(bd(dim).map((r) => [r.value, r[f]]));
  const bval = (dim: BreakdownDim, v: string, f: "month" | "priorMonth" | "ytd" | "priorYtd") => bd(dim).find((r) => r.value === v)?.[f] ?? 0;
  const m12 = Array.from({ length: 12 }, (_, i) => addMonths(k, i - 11));
  const howFind = (name: string) => bd("HowHeard").find((r) => r.value.toLowerCase() === name) ?? { value: name, month: 0, priorMonth: 0, ytd: 0, priorYtd: 0 };
  const howSeries = (name: string) => m12.map((mm) => d.howByMonth.filter((r) => r.month === mm && r.source.toLowerCase() === name).reduce((a, r) => a + r.guests, 0));
  const howTot = Object.fromEntries(m12.map((mm) => [mm, d.howByMonth.filter((r) => r.month === mm).reduce((a, r) => a + r.guests, 0)]));
  const houstonZips = useMemo(() => new Set(d.emergingZips.map((z) => z.zip)), [d.emergingZips]);

  const types = [...new Set([...d.serviceByDate.map((r) => r.type), ...bd("ServiceType").filter((r) => r.month || r.priorMonth).map((r) => r.value)])];
  const tser = [
    ...SERVICE_TYPES.filter((s) => types.includes(s.full)),
    ...types.filter((t) => !SERVICE_TYPES.some((s) => s.full === t)).map((t) => ({ full: t, short: t, color: OTHER_TYPE_COLOR })),
  ];
  const dates = [...new Set(d.serviceByDate.map((r) => r.date))].sort();
  const emerg = d.emergingZips.filter((e) => e.isEmerging);
  const ratings = [...d.ratings].sort((a, b) => a.sort - b.sort);
  const overall = m12.map((mm) => {
    let s = 0;
    let n = 0;
    for (const r of d.ratingTrend) if (r.month === mm && r.avg !== null) (s += r.avg * r.count), (n += r.count);
    return n ? Math.round((s / n) * 100) / 100 : null;
  });
  const refPct = m12.map((mm) => (howTot[mm] ? Math.round((howSeries("invited by someone")[m12.indexOf(mm)]! * 100) / howTot[mm]!) : null));

  return (
    <div className={cn("space-y-10 transition-opacity", fetching && "opacity-60")}>
      {/* Headline */}
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <CompareCard title="Month over month" cur={mom.current} curLabel={label} pri={mom.prior} priLabel={`${ym(pk)}${m.inProgress ? " (same days)" : ""}`} />
          <CompareCard title="Year to date" cur={ytd.current} curLabel={`Jan 1 – ${serviceDateShort(m.asOf)} ${y}`} pri={ytd.prior} priLabel={`Jan 1 – ${serviceDateShort(`${y - 1}${m.asOf.slice(4)}`)} ${y - 1}`} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatTile label={`Same month last year · ${ym(addMonths(k, -12))}`} value={yoy.prior} sub={<Change cur={yoy.current} pri={yoy.prior} unit="YoY" />} />
          <StatTile label="Latest 7 days" value={wow.current} sub={<Change cur={wow.current} pri={wow.prior} unit="WoW" />} />
          {(
            [
              ["Female", "Gender", "Female"],
              ["Male", "Gender", "Male"],
              ["Young adults (16–35)", "AgeGroup", "Young Adults (16-35)"],
              ["Adults (36+)", "AgeGroup", "Adults"],
            ] as const
          ).map(([lab, dim, v]) => (
            <StatTile key={lab} label={lab} value={bval(dim, v, "month")} extra={`· ${pct(bval(dim, v, "month"), c.guests)}%`} sub={<Change cur={bval(dim, v, "month")} pri={bval(dim, v, "priorMonth")} unit="MoM" />} />
          ))}
          <StatTile label="Want to become members" value={`${pct(c.membershipYes, c.guests)}%`} extra={`· ${c.membershipYes}`} sub={<span className="text-xs text-muted">{pName} {pct(p.membershipYes, p.guests)}%</span>} />
          <StatTile label="Average rating" value={c.avgRating === null ? "—" : c.avgRating.toFixed(2)} extra="/ 10" sub={<RatingChange a={c.avgRating} b={p.avgRating} unit="MoM" />} />
          <StatTile label="Came by invitation" value={`${pct(c.referrals, c.guests)}%`} extra={`· ${c.referrals}`} sub={<Change cur={c.referrals} pri={p.referrals} unit="MoM" />} />
          <StatTile label="Zip not on cell map" value={c.notOnCellMap} sub={<span className="text-xs text-muted">see Maps 1 and 2 below</span>} />
        </div>
      </div>

      {/* Visitor trends */}
      <ReportSection title="Visitor trends" sub="Month over month · year to date · week over week · year over year">
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Guests by month" sub={`Jan–${mName} ${y} vs Jan–${mName} ${y - 1}`} aside={<Legend items={[{ label: String(y), color: S1 }, { label: String(y - 1), color: S2 }]} />}>
            <Lines
              labels
              data={MON.slice(0, +k.slice(5, 7)).map((lab, i) => ({
                label: lab,
                cur: d.monthly.find((r) => r.year === y && r.month === i + 1)?.guests ?? 0,
                prev: d.monthly.find((r) => r.year === y - 1 && r.month === i + 1)?.guests ?? 0,
              }))}
              series={[
                { key: "cur", label: String(y), color: S1 },
                { key: "prev", label: String(y - 1), color: S2 },
              ]}
            />
          </Panel>
          <Panel title="Guests by week" sub="12 weeks to the as-of date">
            <Columns data={d.weekly.map((w) => ({ label: `${+w.weekEnd.slice(5, 7)}/${+w.weekEnd.slice(8, 10)}`, guests: w.guests }))} series={[{ key: "guests", label: "Guests", color: S1 }]} />
          </Panel>
          <Panel title="Period comparison" className="xl:col-span-2">
            <DataTable
              head={["Comparison", "Current period", "Guests", "Compared with", "Guests", "Change", "% change"]}
              rows={[mom, ytd, wow, yoy].map((pr, i) => [
                <b key="n" className={i < 2 ? "text-maroon-800" : ""}>
                  {pr.comparison}
                </b>,
                <span key="c" className="text-muted">{`${serviceDateShort(pr.currentStart)} – ${serviceDateShort(pr.currentEnd)}`}</span>,
                <b key="g">{pr.current}</b>,
                <span key="p" className="text-muted">{`${serviceDateShort(pr.priorStart)} – ${serviceDateShort(pr.priorEnd)}`}</span>,
                pr.prior,
                `${pr.change >= 0 ? "+" : ""}${pr.change}`,
                <Change key="x" cur={pr.current} pri={pr.prior} />,
              ])}
            />
          </Panel>
        </div>
      </ReportSection>

      {/* Service type */}
      <ReportSection title="Service type" sub={`${label} compared with ${ym(pk)}`}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={`By service date · ${mName}`} aside={<Legend items={tser.map((s) => ({ label: s.short, color: s.color }))} />}>
            {dates.length ? (
              <Columns
                stacked
                data={dates.map((dt) => ({
                  label: serviceDateShort(dt),
                  ...Object.fromEntries(tser.map((s) => [s.full, d.serviceByDate.find((r) => r.date === dt && r.type === s.full)?.guests ?? 0])),
                }))}
                series={tser.map((s) => ({ key: s.full, label: s.short, color: s.color }))}
              />
            ) : (
              <p className="text-sm text-muted">No guests this month.</p>
            )}
          </Panel>
          <Panel title="Selected month vs previous month" aside={<Legend items={[{ label: pName, color: PRIOR }, { label: mName, color: S1 }]} />}>
            <Columns
              height={190}
              data={tser.map((s) => ({ label: s.short, prior: bval("ServiceType", s.full, "priorMonth"), cur: bval("ServiceType", s.full, "month") }))}
              series={[
                { key: "prior", label: pName, color: PRIOR },
                { key: "cur", label: mName, color: S1 },
              ]}
            />
            <DataTable
              className="mt-3"
              head={["Service", pName, mName, "Change", "% change", "Share"]}
              rows={tser.map((s) => {
                const cc = bval("ServiceType", s.full, "month");
                const pp = bval("ServiceType", s.full, "priorMonth");
                return [
                  <span key="s" className="inline-flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                    {s.full}
                  </span>,
                  pp,
                  <b key="c">{cc}</b>,
                  `${cc - pp >= 0 ? "+" : ""}${cc - pp}`,
                  <Change key="x" cur={cc} pri={pp} />,
                  `${pct(cc, c.guests)}%`,
                ];
              })}
            />
          </Panel>
        </div>
      </ReportSection>

      {/* Who */}
      <ReportSection title="Who is visiting" sub={label}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Female · Male">
            <GenderSplit female={bval("Gender", "Female", "month")} male={bval("Gender", "Male", "month")} other={bval("Gender", "Not given", "month")} />
            <h4 className="mt-5 mb-2 font-display text-base font-semibold text-maroon-900">Marital status</h4>
            <HBars counts={bmap("MaritalStatus")} order={["Married", "Single", "Widowed", "Divorced", "Not given"]} />
          </Panel>
          <Panel title="Age group">
            <HBars counts={bmap("AgeGroup")} order={["Below 16", "Young Adults (16-35)", "Adults", "Not given"]} />
            <div className="h-4" />
            <HBars counts={bmap("AgeBracket")} order={AGE_ORDER} color={S1} />
          </Panel>
          <Panel title="Will you come again?">
            <HBars counts={bmap("WillComeAgain")} order={["Yes", "Maybe", "No", "Not given"]} />
            <h4 className="mt-5 mb-2 font-display text-base font-semibold text-maroon-900">Would you like to become a member?</h4>
            <HBars counts={bmap("MembershipIntent")} order={["Yes", "Undecided", "No", "Not given"]} color={S1} />
          </Panel>
        </div>
      </ReportSection>

      {/* Cells and maps */}
      <ReportSection title="Cell groups & where visitors come from" sub={`${label} (cell tiles) · Map 1: Greater Houston, year to date · Map 2: where ${mName}’s visitors came from`}>
        <CellTiles current={bmap("CellGroup")} prior={bmap("CellGroup", "priorMonth")} priorLabel={`vs ${pName}`} />
        <Map1
          zips={d.emergingZips}
          year={y}
          title={
            <>
              Map 1 · Greater Houston zip codes{" "}
              <span className="font-sans text-xs font-semibold text-muted">
                Jan 1 – {serviceDateShort(m.asOf)} {y}
                {m.serviceType ? ` · ${m.serviceType}` : ""} · cell-group zips and emerging zips
              </span>
            </>
          }
        />
        <Map2
          cities={d.visitorCities}
          houstonZips={houstonZips}
          monthLabel={mName}
          title={
            <>
              Map 2 · Where visitors came from{" "}
              <span className="font-sans text-xs font-semibold text-muted">
                {label}
                {m.serviceType ? ` · ${m.serviceType}` : ""} · by city
              </span>
            </>
          }
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Top cities" sub="YTD">
            <HBars counts={bmap("City", "ytd")} top={7} />
          </Panel>
          <Panel title="Emerging zip codes" sub="Greater Houston, not on the cell list">
            {emerg.length ? (
              <DataTable
                head={["Zip", "YTD", String(y - 1), "Signal"]}
                rows={emerg.map((e) => [
                  <span key="z" title={`First seen ${serviceDateLong(e.firstSeen)} · last 90 days ${e.last90} vs prior 90 ${e.prior90}`}>
                    <b>{e.zip}</b>
                    <span className="block text-xs text-muted">{[e.city, e.county && `${e.county} County`].filter(Boolean).join(" · ")}</span>
                  </span>,
                  e.ytd,
                  e.priorYtd,
                  <EmergingChip key="s" signal={e.signal} />,
                ])}
              />
            ) : (
              <p className="text-sm text-muted">Every Greater Houston guest this year lives in a cell-group zip.</p>
            )}
          </Panel>
        </div>
      </ReportSection>

      {/* How they found us */}
      <ReportSection title="How they found us" sub={`${label} vs ${ym(pk)} · trend over 12 months`}>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(HOW) as (keyof typeof HOW)[]).map((h) => {
            const meta = HOW[h];
            const r = howFind(h);
            return (
              <div key={h} className="rounded-3xl border border-white bg-white p-5 shadow-card" style={{ boxShadow: `inset 4px 0 0 ${meta.color}, var(--shadow-card)` }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>
                    {meta.ic}
                  </span>
                  <div>
                    <b className="block text-ink">{meta.name}</b>
                    <span className="text-xs text-muted">{meta.sub}</span>
                  </div>
                </div>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-[34px] leading-none font-semibold text-maroon-900 tabular">{r.month}</span>
                  <span className="text-sm text-muted">
                    {pct(r.month, c.guests)}% of {mName} guests
                  </span>
                </p>
                <p className="mt-1 flex flex-wrap items-baseline gap-2 text-xs">
                  <Change cur={r.month} pri={r.priorMonth} unit={`vs ${pName} (${r.priorMonth})`} />
                  <span className="text-muted">· YTD {r.ytd}</span>
                </p>
                <div className="mt-2">
                  <Spark values={howSeries(h)} color={meta.color} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {bd("HowHeard")
            .filter((r) => !(r.value.toLowerCase() in HOW))
            .map((r) => (
              <Chip key={r.value}>
                {HOW_OTHER[r.value.toLowerCase()] ?? "•"} {r.value} <b className="text-ink">{r.month}</b> ({pName} {r.priorMonth})
              </Chip>
            ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title="Trend · referrals, social media, Google search"
            sub="guests per month"
            aside={<Legend items={(Object.keys(HOW) as (keyof typeof HOW)[]).map((h) => ({ label: `${HOW[h].ic} ${HOW[h].name}`, color: HOW[h].color }))} />}
          >
            <Lines
              data={m12.map((mm, i) => ({ label: monName(mm), ref: howSeries("invited by someone")[i]!, soc: howSeries("social media")[i]!, goo: howSeries("google search")[i]! }))}
              series={[
                { key: "ref", label: "Referrals", color: S1 },
                { key: "soc", label: "Social media", color: S2 },
                { key: "goo", label: "Google search", color: S3 },
              ]}
            />
          </Panel>
          <Panel title="All sources · month over month">
            <DataTable
              head={["Source", pName, mName, "MoM", "Share", "YTD"]}
              rows={[...bd("HowHeard")]
                .sort((a, b) => b.month - a.month || b.ytd - a.ytd)
                .map((r) => {
                  const hi = r.value.toLowerCase() in HOW;
                  const ic = hi ? HOW[r.value.toLowerCase() as keyof typeof HOW].ic : (HOW_OTHER[r.value.toLowerCase()] ?? "•");
                  return [
                    <span key="s" className={cn(hi && "font-bold text-maroon-800")}>
                      {ic} {hi ? HOW[r.value.toLowerCase() as keyof typeof HOW].name : r.value}
                    </span>,
                    r.priorMonth,
                    <b key="m">{r.month}</b>,
                    <Change key="c" cur={r.month} pri={r.priorMonth} />,
                    `${pct(r.month, c.guests)}%`,
                    r.ytd,
                  ];
                })}
            />
            {d.otherAnswers.length ? (
              <>
                <p className="mt-4 mb-2 text-xs font-extrabold tracking-wide text-muted uppercase">“Other”, in their words · {mName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.otherAnswers.map((o) => (
                    <Chip key={o.text}>
                      “{o.text}” · {o.guests}
                    </Chip>
                  ))}
                </div>
              </>
            ) : null}
          </Panel>
        </div>
      </ReportSection>

      {/* Ratings & referrals */}
      <ReportSection title="Ratings & referrals" sub="Scores 0–10 from the guest form, the same scale as the Power BI gauges">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {ratings.map((r) => (
            <div key={r.dimension} className="flex flex-col items-center rounded-2xl border border-white bg-white p-3 text-center shadow-card" title={`${r.dimension}: ${r.month?.toFixed(2) ?? "—"} in ${mName}${r.prior !== null ? ` · ${r.prior.toFixed(2)} in ${pName}` : ""}`}>
              <p className="text-xs font-bold text-ink">
                <span aria-hidden>{RATING_ICON[r.dimension]}</span> {r.dimension}
              </p>
              <Gauge value={r.month} />
              <RatingChange a={r.month} b={r.prior} unit={`vs ${pName}`} />
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Average rating by month" sub="all 8 areas · 12 months">
            <Lines labels height={280} domain={[6, 10]} fmt={(v) => v.toFixed(2)} data={m12.map((mm, i) => ({ label: monName(mm), avg: overall[i]! }))} series={[{ key: "avg", label: "Average rating", color: S1 }]} />
          </Panel>
          <Panel title="Referrals">
            <div className="grid grid-cols-3 gap-2">
              <StatTile label={`Invited · ${mName}`} value={`🤝 ${pct(c.referrals, c.guests)}%`} />
              <StatTile label="Invited guests YTD" value={howFind("invited by someone").ytd} />
              <StatTile label="Top inviters listed" value={d.topInviters.length} />
            </div>
            <p className="mt-4 text-xs font-extrabold tracking-wide text-muted uppercase">
              Referral rate by month <span className="font-semibold tracking-normal normal-case">· share of guests who were invited</span>
            </p>
            <Lines labels height={170} domain={[0, 100]} fmt={(v) => `${Math.round(v)}%`} data={m12.map((mm, i) => ({ label: monName(mm), rate: refPct[i]! }))} series={[{ key: "rate", label: "Referral rate", color: S2 }]} />
            <p className="mt-3 mb-2 text-xs font-extrabold tracking-wide text-muted uppercase">Top inviters · year to date</p>
            <HBars counts={Object.fromEntries(d.topInviters.map((t) => [t.name, t.guests]))} order={d.topInviters.map((t) => t.name)} color={S3} top={5} />
          </Panel>
          <Panel title="Rating by area" className="xl:col-span-2">
            <DataTable
              head={["Area", mName, pName, "Change", "12-month avg", "12-month trend", "Rated 0–5"]}
              rows={ratings.map((r) => [
                <b key="a">
                  {RATING_ICON[r.dimension]} {r.dimension}
                </b>,
                r.month?.toFixed(2) ?? "—",
                <span key="p" className="text-muted">
                  {r.prior?.toFixed(2) ?? "—"}
                </span>,
                <RatingChange key="c" a={r.month} b={r.prior} />,
                r.twelveMonth?.toFixed(2) ?? "—",
                <span key="s" className="flex justify-end">
                  <Spark values={m12.map((mm) => d.ratingTrend.find((t) => t.dimension === r.dimension && t.month === mm)?.avg ?? null)} />
                </span>,
                r.monthLow ? <Chip key="l" tone="crit">{r.monthLow}</Chip> : 0,
              ])}
            />
          </Panel>
        </div>
      </ReportSection>

      {/* Insights */}
      <ReportSection title="Insights for the meeting" sub="Generated from the numbers above">
        <Insights d={d} label={label} mName={mName} pName={pName} m12={m12} howTot={howTot} tser={tser} dates={dates} ratings={ratings} />
      </ReportSection>

      <ReportSection title="Follow-up and growth" sub="What happened after the first visit. First-time guests only, totals only.">
        <Outcomes items={d.outcomes} month={d.meta.month} />
      </ReportSection>
    </div>
  );
}

/* ================================================================= follow-up and growth */

const BREAKDOWN_HEAD: Partial<Record<LcmOutcome["key"], [string, string]>> = {
  lowRatings: ["Area · alert goes to", "Rated ≤ 5 / rated"],
  completeness: ["Filled in", "Forms"],
};
const NOUN: Partial<Record<LcmOutcome["key"], string>> = { completeness: "forms", lowRatings: "guests who rated" };

function Outcomes({ items, month }: { items: LcmOutcome[]; month: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((o) => (
        <OutcomeCard key={o.key} o={o} month={month} />
      ))}
    </div>
  );
}

function OutcomeCard({ o, month }: { o: LcmOutcome; month: string }) {
  const per100 = o.unit === "per 100";
  const fmt = (v: number | null) => (v === null ? "—" : per100 ? v.toFixed(1) : `${Math.round(v)}%`);
  const diff = o.current.value !== null && o.prior.value !== null ? o.current.value - o.prior.value : null;
  const good = diff === null || Math.abs(diff) < 0.5 ? null : diff > 0 === o.higherIsBetter;
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-white bg-white p-4 shadow-card">
      <b className="text-ink">{o.label}</b>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-[32px] leading-none font-semibold text-maroon-900 tabular">{fmt(o.current.value)}</span>
        <span className="text-sm font-semibold text-muted">
          {per100 ? "per 100 attendees" : `${o.current.count} of ${o.current.of} ${NOUN[o.key] ?? "guests"}`}
        </span>
      </p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-1.5 text-xs font-semibold text-muted">
        {diff === null ? (
          <span>No figure for {ym(o.prior.cohort)}</span>
        ) : (
          <>
            <span className={cn("font-bold", good === null ? "text-muted" : good ? "text-ok" : "text-crit")}>
              {Math.abs(diff) < 0.5 ? "■ no change" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(per100 ? 1 : 0)}${per100 ? "" : " pts"}`}
            </span>
            <span>
              vs {fmt(o.prior.value)} in {ym(o.prior.cohort)}
            </span>
          </>
        )}
      </p>
      <p className="mt-3 text-sm text-muted">{o.measures}</p>
      {o.cohort !== month ? (
        <p className="mt-1.5 text-xs font-semibold text-maroon-700">Guests who first came in {ym(o.cohort)}, so the window has had time to close.</p>
      ) : null}
      {o.open > 0 ? (
        <p className="mt-1.5 text-xs font-semibold text-gold-800">
          Still open for {o.open} {o.open === 1 ? "guest" : "guests"}: this can still go up.
        </p>
      ) : null}
      {o.breakdown?.length ? (
        <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
          {BREAKDOWN_HEAD[o.key] ? (
            <li className="flex justify-between gap-3 font-bold tracking-wide text-muted uppercase">
              <span>{BREAKDOWN_HEAD[o.key]![0]}</span>
              <span>{BREAKDOWN_HEAD[o.key]![1]}</span>
            </li>
          ) : null}
          {o.breakdown.map((b) => (
            <li key={b.label} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-semibold text-ink">
                {b.label}
                {b.note ? <span className="font-normal text-muted"> · {b.note}</span> : null}
              </span>
              <span className="shrink-0 font-bold text-ink tabular">
                {b.count.toLocaleString()}
                {b.of ? <span className="font-semibold text-muted"> / {b.of}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : o.key === "lowRatings" ? (
        <p className="mt-3 border-t border-line pt-2 text-xs text-muted">No low ratings this month.</p>
      ) : null}
      <p className="mt-auto pt-3 text-xs font-semibold text-gold-800">Source: {o.source}</p>
    </div>
  );
}

/* ================================================================= insights (same rules as the live app) */

function Insights({
  d,
  label,
  mName,
  pName,
  m12,
  howTot,
  tser,
  dates,
  ratings,
}: {
  d: LcmResponse;
  label: string;
  mName: string;
  pName: string;
  m12: string[];
  howTot: Record<string, number>;
  tser: { full: string; short: string }[];
  dates: string[];
  ratings: LcmResponse["ratings"];
}) {
  void mName;
  const c = d.kpis.current;
  const p = d.kpis.prior;
  const k = d.meta.month;
  const period = (n: string) => d.periods.find((x) => x.comparison === n)!;
  const bval = (dim: BreakdownDim, v: string, f: "month" | "priorMonth") => d.breakdowns[dim]?.find((r) => r.value === v)?.[f] ?? 0;
  const sh = (n: number, t: number) => (t ? (n * 100) / t : 0);
  const mom = period("Month over month");
  const ytd = period("Year to date");
  const yoy = period("Year over year (month)");

  const tag = (cur: number, pri: number) => {
    const ch = pctChange(cur, pri);
    if (ch === null) return <Tag tone="up">new</Tag>;
    return <Tag tone={ch > 0.5 ? "up" : ch < -0.5 ? "down" : "flat"}>{`${ch > 0.5 ? "▲ " : ch < -0.5 ? "▼ " : ""}${Math.abs(ch).toFixed(0)}%`}</Tag>;
  };
  const pts = (a: number, b: number) => {
    const dd = Math.round(a - b);
    return <Tag tone={dd > 0 ? "up" : dd < 0 ? "down" : "flat"}>{`${dd > 0 ? "▲ " : dd < 0 ? "▼ " : ""}${Math.abs(dd)} pts`}</Tag>;
  };

  const growth: React.ReactNode[] = [
    <>
      {tag(mom.current, mom.prior)}
      <span>
        <b>{mom.current} guests</b> in {label} vs {mom.prior} in {ym(d.meta.priorMonth)} (month over month).
      </span>
    </>,
    <>
      {tag(yoy.current, yoy.prior)}
      <span>
        Compared with {ym(addMonths(k, -12))} ({yoy.prior}), year over year.
      </span>
    </>,
    <>
      {tag(ytd.current, ytd.prior)}
      <span>
        Year to date: <b>{ytd.current}</b> vs {ytd.prior} at this point last year ({ytd.change >= 0 ? "+" : ""}
        {ytd.change} guests).
      </span>
    </>,
  ];
  const q3 = [0, 1, 2].reduce((a, i) => a + (howTot[m12[11 - i]!] ?? 0), 0);
  const q3p = [0, 1, 2].reduce((a, i) => a + (howTot[m12[8 - i]!] ?? 0), 0);
  growth.push(
    <>
      {tag(q3, q3p)}
      <span>
        Last 3 months ({q3}) vs the 3 months before ({q3p}): {q3 >= q3p ? "a rising" : "a cooling"} trend.
      </span>
    </>,
  );
  const best = dates.map((dt) => [dt, d.serviceByDate.filter((r) => r.date === dt).reduce((a, r) => a + r.guests, 0)] as const).sort((a, b) => b[1] - a[1])[0];
  if (best)
    growth.push(
      <>
        <Tag tone="flat">peak</Tag>
        <span>
          Busiest service date: <b>{serviceDateShort(best[0])}</b> with {best[1]} guests.
        </span>
      </>,
    );

  const services = tser.map((s) => {
    const cc = bval("ServiceType", s.full, "month");
    const pq = bval("ServiceType", s.full, "priorMonth");
    return (
      <>
        {tag(cc, pq)}
        <span>
          <b>{s.full}</b>: {cc} guests ({pct(cc, c.guests)}% of the month) vs {pq} in {pName}.
        </span>
      </>
    );
  });

  const fS = sh(bval("Gender", "Female", "month"), c.guests);
  const fSp = sh(bval("Gender", "Female", "priorMonth"), p.guests);
  const yS = sh(bval("AgeGroup", "Young Adults (16-35)", "month"), c.guests);
  const ySp = sh(bval("AgeGroup", "Young Adults (16-35)", "priorMonth"), p.guests);
  const who: React.ReactNode[] = [
    <>
      {pts(fS, fSp)}
      <span>
        Women were <b>{Math.round(fS)}%</b> of guests ({Math.round(fSp)}% in {pName}).
      </span>
    </>,
    <>
      {pts(yS, ySp)}
      <span>
        Young adults (16–35) were <b>{Math.round(yS)}%</b> ({Math.round(ySp)}% in {pName}).
      </span>
    </>,
  ];
  const cm = CELLS.map((cc) => [cc, bval("CellGroup", cc, "month"), bval("CellGroup", cc, "priorMonth")] as const).sort((a, b) => b[1] - b[2] - (a[1] - a[2]))[0];
  if (cm)
    who.push(
      <>
        {tag(cm[1], cm[2])}
        <span>
          Biggest cell-area gain: <b>{cm[0]}</b> ({cm[1]} vs {cm[2]}).
        </span>
      </>,
    );
  const zip = (d.breakdowns.Zip5 ?? []).filter((r) => r.value !== "Not given" && r.month).sort((a, b) => b.month - a.month)[0];
  if (zip)
    who.push(
      <>
        {tag(zip.month, zip.priorMonth)}
        <span>
          Top zip: <b>{zip.value}</b> with {zip.month} guests.
        </span>
      </>,
    );
  who.push(
    <>
      <Tag tone={c.notOnCellMap ? "act" : "flat"}>{`${pct(c.notOnCellMap, c.guests)}%`}</Tag>
      <span>
        <b>{c.notOnCellMap}</b> guests live in zips not on the cell list.
      </span>
    </>,
  );
  const houZips = new Set(d.emergingZips.map((z) => z.zip));
  const outside = d.visitorCities.filter((x) => !(x.state === "TX" && x.zips.some((z) => houZips.has(z))));
  const outsideN = outside.reduce((a, x) => a + x.guests, 0);
  const abroadN = d.visitorCities.filter((x) => !/^united states$/i.test(x.country) && x.country !== "Not given").reduce((a, x) => a + x.guests, 0);
  if (outsideN)
    who.push(
      <>
        <Tag tone="flat">map 2</Tag>
        <span>
          <b>{outsideN}</b> guest{outsideN === 1 ? "" : "s"} came from outside Greater Houston{abroadN ? `, ${abroadN} from outside the US` : ""} ({outside.length} place
          {outside.length === 1 ? "" : "s"}).
        </span>
      </>,
    );

  const hf = (name: string) => d.breakdowns.HowHeard?.find((r) => r.value.toLowerCase() === name) ?? { month: 0, priorMonth: 0, value: name, ytd: 0, priorYtd: 0 };
  const ref = hf("invited by someone");
  const how: React.ReactNode[] = [
    <>
      {pts(sh(ref.month, c.guests), sh(ref.priorMonth, p.guests))}
      <span>
        🤝 Referrals: <b>{ref.month}</b> guests, {pct(ref.month, c.guests)}% of the month ({pct(ref.priorMonth, p.guests)}% in {pName}).
      </span>
    </>,
    ...(["social media", "google search"] as const).map((h) => {
      const r = hf(h);
      return (
        <>
          {tag(r.month, r.priorMonth)}
          <span>
            {HOW[h].ic} {HOW[h].name}: <b>{r.month}</b> vs {r.priorMonth} in {pName}.
          </span>
        </>
      );
    }),
  ];
  const fast = (d.breakdowns.HowHeard ?? [])
    .filter((r) => r.month >= 2 && r.priorMonth)
    .map((r) => [r.value, pctChange(r.month, r.priorMonth) ?? 0] as const)
    .sort((a, b) => b[1] - a[1])[0];
  if (fast && fast[1] > 0)
    how.push(
      <>
        <Tag tone="up">fastest</Tag>
        <span>
          Fastest-growing source: <b>{fast[0]}</b> (+{fast[1].toFixed(0)}% MoM).
        </span>
      </>,
    );

  const exp: React.ReactNode[] = [];
  if (c.avgRating !== null && p.avgRating !== null)
    exp.push(
      <>
        <Tag tone={c.avgRating - p.avgRating > 0.04 ? "up" : c.avgRating - p.avgRating < -0.04 ? "down" : "flat"}>{`${c.avgRating - p.avgRating >= 0 ? "+" : ""}${(c.avgRating - p.avgRating).toFixed(2)}`}</Tag>
        <span>
          Average rating <b>{c.avgRating.toFixed(2)}</b> / 10 vs {p.avgRating.toFixed(2)} in {pName}.
        </span>
      </>,
    );
  const rs = ratings.filter((r) => r.month !== null) as (LcmResponse["ratings"][number] & { month: number })[];
  const hi = [...rs].sort((a, b) => b.month - a.month)[0];
  const lo = [...rs].sort((a, b) => a.month - b.month)[0];
  if (hi)
    exp.push(
      <>
        <Tag tone="up">best</Tag>
        <span>
          Highest rated: {RATING_ICON[hi.dimension]} <b>{hi.dimension}</b> ({hi.month.toFixed(2)}).
        </span>
      </>,
    );
  if (lo)
    exp.push(
      <>
        <Tag tone="down">lowest</Tag>
        <span>
          Lowest rated: {RATING_ICON[lo.dimension]} <b>{lo.dimension}</b> ({lo.month.toFixed(2)}).
        </span>
      </>,
    );
  exp.push(
    <>
      {pts(sh(c.membershipYes, c.guests), sh(p.membershipYes, p.guests))}
      <span>
        <b>{pct(c.membershipYes, c.guests)}%</b> want to become members ({pct(p.membershipYes, p.guests)}% in {pName}); <b>{c.membershipUndecided}</b> undecided.
      </span>
    </>,
  );

  const act: React.ReactNode[] = [];
  const em = d.emergingZips.filter((e) => e.signal === "Emerging");
  if (em.length)
    act.push(
      <>
        <Tag tone="act">cells</Tag>
        <span>
          Consider a cell or house fellowship for {em.map((e) => `${e.zip}${e.city ? ` ${e.city}` : ""}`).join(", ")}.
        </span>
      </>,
    );
  if (c.membershipUndecided)
    act.push(
      <>
        <Tag tone="act">Connect</Tag>
        <span>
          Send the <b>{c.membershipUndecided} undecided</b> guests to Phase 1 follow-up this week.
        </span>
      </>,
    );
  if (lo)
    act.push(
      <>
        <Tag tone="act">feedback</Tag>
        <span>Share the {lo.dimension.toLowerCase()} score with the department responsible.</span>
      </>,
    );
  if (d.topInviters.length)
    act.push(
      <>
        <Tag tone="act">thank</Tag>
        <span>Recognize the top inviters ({d.topInviters.slice(0, 3).map((t) => t.name).join(", ")}).</span>
      </>,
    );

  const box = (ic: string, title: string, items: React.ReactNode[], actions = false) =>
    items.length ? (
      <div className={cn("rounded-3xl border p-5 shadow-card", actions ? "border-gold-300 bg-gold-100/50 md:col-span-2 xl:col-span-3" : "border-white bg-white")}>
        <h4 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-maroon-900">
          <span aria-hidden>{ic}</span>
          {title}
        </h4>
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-ink">
              {it}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {box("📈", "Growth", growth)}
      {box("⛪", "Services", services)}
      {box("🧭", "Who & where", who)}
      {box("📣", "How they found us", how)}
      {box("⭐", "Experience & intent", exp)}
      {box("✅", "Suggested actions for the meeting", act, true)}
    </div>
  );
}

function Tag({ tone, children }: { tone: "up" | "down" | "flat" | "act"; children: React.ReactNode }) {
  const cls = { up: "bg-ok-soft text-ok", down: "bg-crit-soft text-crit", flat: "bg-cream-200 text-muted", act: "bg-gold-100 text-gold-800" }[tone];
  return <span className={cn("mt-px inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap", cls)}>{children}</span>;
}

function LcmSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the LCM report">
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-44 rounded-3xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-3xl" />
    </div>
  );
}
