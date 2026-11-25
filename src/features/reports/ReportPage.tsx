import { ArrowLeft, CalendarClock, FileSpreadsheet, Printer, Share2, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useServiceOptions } from "@/features/admin/config-queries";
import { download } from "@/features/welcome/import-files";
import { Change, Columns, DataTable, HBars, Legend, Panel, PRIOR, ReportSection, S1, S2, S3, StatTile } from "@/features/welcome/lcm-parts";
import { useAuth } from "@/features/auth/auth";
import { ApiError, api } from "@/lib/api";
import { stagger } from "@/lib/motion";
import { useReportData } from "./report-queries";
import { reportCsv } from "./report-csv";
import { PERIOD_LABEL, REPORTS, type CountRow, type Period, type RatingsReport, type ReportData, type ReportId, type RetentionReport, type YtdReport } from "./report-types";
import { ScheduleDialog, ShareDialog, type ScheduleDialogMode } from "./ShareDialogs";

/**
 * One hub report (PRD W-10, W-11, PL-2, PL-3): period and service pickers,
 * export to CSV or PDF (logged first), share now, schedule.
 */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mon = (k: string) => MON[+k.slice(5, 7) - 1]!;
const ym = (k: string) => `${mon(k)} ${k.slice(0, 4)}`;
const BUILT: ReportId[] = ["ratings-referrals", "ytd-service-location", "retention"];

export function ReportPage() {
  const { id } = useParams();
  const def = REPORTS.find((r) => r.id === id);
  const { has } = useAuth();
  const [period, setPeriod] = useState<Period | undefined>(undefined);
  const [type, setType] = useState("");
  const [sharing, setSharing] = useState(false);
  const [scheduling, setScheduling] = useState<ScheduleDialogMode | null>(null);
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);
  const services = useServiceOptions();
  const toast = useToast();
  const q = useReportData((def?.id ?? "retention") as ReportId, period ?? def?.periods[0], type || undefined);
  if (!def || !BUILT.includes(def.id)) return <Navigate to="/reports" replace />;
  const r = q.data;
  const p = period ?? def.periods[0]!;
  const canShare = has("reports.share");

  const exportAs = async (format: "csv" | "pdf") => {
    if (!r) return;
    setBusy(format);
    try {
      await api.reports.logExport(def.id, { format, period: p, type: type || null });
      if (format === "csv") download(`${def.title} - ${r.data.range.label}.csv`, reportCsv(r));
      else {
        // Same print path as LCM: the report only, full width.
        const root = document.documentElement;
        const title = document.title;
        root.classList.add("print-lcm");
        document.title = `${def.title} ${r.data.range.label} - TKP Hub`;
        window.dispatchEvent(new Event("resize"));
        await new Promise((res) => setTimeout(res, 300));
        const done = () => {
          root.classList.remove("print-lcm");
          document.title = title;
          window.dispatchEvent(new Event("resize"));
          window.removeEventListener("afterprint", done);
        };
        window.addEventListener("afterprint", done);
        window.print();
        window.setTimeout(done, 1500);
      }
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "The export didn't work.", { tone: "crit" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-8">
      <PageHeader
        eyebrow={`Reports · ${def.covers}`}
        title={def.title}
        tagline={r ? `${r.data.range.label} · ${r.data.serviceType ?? "All services"}` : def.summary}
        actions={
          <div className="flex flex-wrap gap-2" data-noprint>
            <Link to="/reports" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink hover:border-maroon-200">
              <ArrowLeft className="size-4" aria-hidden /> Library
            </Link>
            <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={busy === "csv"} disabled={!r} onClick={() => void exportAs("csv")}>
              CSV
            </Button>
            <Button variant="ghost" icon={<Printer className="size-4" />} loading={busy === "pdf"} disabled={!r} onClick={() => void exportAs("pdf")}>
              Print / PDF
            </Button>
            {canShare ? (
              <>
                <Button variant="ghost" icon={<Share2 className="size-4" />} onClick={() => setSharing(true)}>
                  Share
                </Button>
                <Button icon={<CalendarClock className="size-4" />} onClick={() => setScheduling({ kind: "new", reportId: def.id, period: p, serviceType: type || null })}>
                  Schedule
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3" data-noprint>
        {def.periods.length > 1 ? (
          <label className="grid gap-1">
            <span className="text-xs font-extrabold tracking-wide text-muted uppercase">Period</span>
            <select id="rep-period" value={p} onChange={(e) => setPeriod(e.target.value as Period)} className="h-11 min-w-52 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink shadow-card">
              {def.periods.map((x) => (
                <option key={x} value={x}>
                  {PERIOD_LABEL[x]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1">
          <span className="text-xs font-extrabold tracking-wide text-muted uppercase">Service</span>
          <select id="rep-service" value={type} onChange={(e) => setType(e.target.value)} className="h-11 min-w-52 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink shadow-card">
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
                {s.retired ? " (retired)" : ""}
              </option>
            ))}
          </select>
        </label>
        {q.isFetching ? <span className="pb-3 text-xs font-semibold text-muted">Updating…</span> : null}
      </div>

      {q.isError ? <ErrorBanner action={<Button variant="ghost" size="sm" onClick={() => void q.refetch()}>Try again</Button>}>{q.error instanceof ApiError ? q.error.message : "We couldn't load this report."}</ErrorBanner> : null}
      {r ? <Body r={r} /> : q.isPending ? <Skeleton className="h-96" /> : null}

      <p className="text-xs text-muted">
        Totals only. Groups with fewer than 5 guests are never shown on their own (PRD PL-1). Source: {def.source}.
      </p>

      <ShareDialog report={sharing ? def : null} initial={{ period: p, serviceType: type || null }} onClose={() => setSharing(false)} />
      <ScheduleDialog mode={scheduling} onClose={() => setScheduling(null)} />
    </motion.div>
  );
}

function Body({ r }: { r: ReportData }) {
  if (r.id === "ratings-referrals") return <Ratings d={r.data} />;
  if (r.id === "ytd-service-location") return <Ytd d={r.data} />;
  return <Retention d={r.data} />;
}

const counts = (rows: CountRow[]) => Object.fromEntries(rows.map((x) => [x.label, x.guests]));
const order = (rows: CountRow[]) => rows.map((x) => x.label);

function CountTable({ rows, prior }: { rows: CountRow[]; prior?: boolean }) {
  return (
    <DataTable
      head={prior ? ["", "This year", "Same days last year", "Change"] : ["", "Guests", "Share"]}
      rows={rows.map((x) =>
        prior
          ? [x.grouped ? <i key="l" className="text-muted">{x.label}</i> : <b key="l">{x.label}</b>, x.guests, <span key="p" className="text-muted">{x.prior ?? 0}</span>, <Change key="c" cur={x.guests} pri={x.prior ?? 0} />]
          : [x.grouped ? <i key="l" className="text-muted">{x.label}</i> : <b key="l">{x.label}</b>, x.guests, `${x.share}%`],
      )}
    />
  );
}

function Ratings({ d }: { d: RatingsReport }) {
  const low = d.ratings.reduce((s, x) => s + x.low, 0);
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Guests in the period" value={d.guests} />
        <StatTile label="Rated at least one area" value={d.rated} />
        <StatTile label="Ratings of 5 or below" value={low} sub={<span className="text-xs text-muted">Each one alerts that area's department</span>} />
      </div>
      <ReportSection title="Rating by area" sub="Average out of 10. A blank answer is not a zero.">
        <Panel title="Ratings">
          <DataTable
            head={["Area", "Average", "", "Rated", "5 or below", "Alerts go to"]}
            rows={d.ratings.map((x) => [
              <b key="a">{x.area}</b>,
              x.average === null ? "—" : x.average.toFixed(2),
              <span key="bar" className="block h-2 w-28 overflow-hidden rounded-full bg-cream-200" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${((x.average ?? 0) / 10) * 100}%`, background: S1 }} />
              </span>,
              x.rated,
              x.low ? <b key="l" className="text-crit">{x.low}</b> : 0,
              <span key="o" className="text-muted">{x.owner}</span>,
            ])}
          />
        </Panel>
      </ReportSection>
      <ReportSection title="Referrals" sub="How guests heard of the church, and who invited them">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="How they heard about us">
            <HBars counts={counts(d.howHeard)} order={order(d.howHeard)} color={S2} />
          </Panel>
          <Panel title="Who invited them" sub="two or more guests">
            {d.inviters.length ? <HBars counts={Object.fromEntries(d.inviters.map((i) => [i.name, i.guests]))} order={d.inviters.map((i) => i.name)} color={S3} /> : <p className="text-sm text-muted">No one invited two or more guests in this period.</p>}
          </Panel>
        </div>
      </ReportSection>
      <ReportSection title="Location" sub="Where guests live and the cell group split">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="City">
            <CountTable rows={d.cities} />
          </Panel>
          <Panel title="Cell group">
            <HBars counts={counts(d.cells)} order={order(d.cells)} color={S1} />
          </Panel>
        </div>
      </ReportSection>
    </div>
  );
}

function Ytd({ d }: { d: YtdReport }) {
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={`First-time guests in ${d.year} so far`} value={d.thisYear} />
        <StatTile label="Same days last year" value={d.lastYear} />
        <StatTile label="Change" value={<Change cur={d.thisYear} pri={d.lastYear} big />} />
      </div>
      <ReportSection title="By month" sub={`${d.year} against ${d.year - 1}`}>
        <Panel title="First-time guests" aside={<Legend items={[{ label: String(d.year), color: S1 }, { label: String(d.year - 1), color: PRIOR }]} />}>
          <Columns data={d.byMonth.map((m) => ({ label: mon(m.month), key: m.month, thisYear: m.thisYear, lastYear: m.lastYear }))} series={[{ key: "thisYear", label: String(d.year), color: S1 }, { key: "lastYear", label: String(d.year - 1), color: PRIOR }]} />
        </Panel>
      </ReportSection>
      <ReportSection title="By service and location" sub="This year so far against the same days last year">
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Service">
            <CountTable rows={d.byService} prior />
          </Panel>
          <Panel title="Cell group">
            <CountTable rows={d.byCell} prior />
          </Panel>
          <Panel title="City">
            <CountTable rows={d.byCity} prior />
          </Panel>
        </div>
      </ReportSection>
    </div>
  );
}

function Retention({ d }: { d: RetentionReport }) {
  const shown = d.cohorts.filter((c) => !c.hidden);
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="First-time guests" value={d.total.firstTime} />
        <StatTile label="Confirmed back within 30 days" value={d.total.back} />
        <StatTile label="Retention rate" value={d.total.rate === null ? "—" : `${d.total.rate}%`} />
      </div>
      <ReportSection title="Back within 30 days, by first-visit month" sub="Where the signal came from">
        <Panel
          title="Guests back"
          aside={
            <Legend
              items={[
                { label: "A second form", color: S1 },
                { label: "Follow-up team", color: S2 },
                { label: "Both", color: S3 },
              ]}
            />
          }
        >
          <Columns
            stacked
            data={shown.map((c) => ({ label: mon(c.month), key: c.month, viaForm: c.viaForm, viaConnect: c.viaConnect, viaBoth: c.viaBoth }))}
            series={[
              { key: "viaForm", label: "A second form", color: S1 },
              { key: "viaConnect", label: "Follow-up team", color: S2 },
              { key: "viaBoth", label: "Both", color: S3 },
            ]}
          />
        </Panel>
        <Panel title="By month">
          <DataTable
            head={["First visit in", "First-time guests", "Back in 30 days", "Rate", "A second form", "Follow-up team", "Both", "Still within 30 days"]}
            rows={d.cohorts.map((c) =>
              c.hidden
                ? [<b key="m">{ym(c.month)}</b>, <i key="f" className="text-muted">Fewer than 5</i>, "", "", "", "", "", ""]
                : [<b key="m">{ym(c.month)}</b>, c.firstTime, c.back, c.rate === null ? "—" : `${c.rate}%`, c.viaForm, c.viaConnect, c.viaBoth, c.open ? <span key="o" className="text-gold-800">{c.open}</span> : 0],
            )}
          />
          {d.cohorts.some((c) => c.open) ? (
            <p className="mt-3 flex gap-1.5 text-xs text-gold-800">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              Some guests' 30 days aren't over yet, so those months can still go up.
            </p>
          ) : null}
        </Panel>
      </ReportSection>
    </div>
  );
}
