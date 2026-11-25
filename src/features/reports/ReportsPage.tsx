import { ArrowRight, CalendarClock, Share2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { useReports } from "./report-queries";
import type { ReportDef } from "./report-types";
import { ScheduleDialog, ShareDialog, type ScheduleDialogMode } from "./ShareDialogs";

/**
 * Reports › Library (PRD PL-5, 8.3 "reports hub"). Every report leadership
 * uses, in one place: open it, export it, share it now or on a schedule.
 * The list only shows reports the person may open.
 */
export function ReportsPage() {
  const q = useReports();
  const [sharing, setSharing] = useState<ReportDef | null>(null);
  const [scheduling, setScheduling] = useState<ScheduleDialogMode | null>(null);
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Report library"
        tagline="Open, export or share the reports leadership uses. Totals only: no guest names, and groups under five are never shown alone."
        actions={
          q.data?.can.share ? (
            <Button icon={<CalendarClock className="size-4" />} onClick={() => setScheduling({ kind: "new" })}>
              New schedule
            </Button>
          ) : null
        }
      />
      {q.isError ? <ErrorBanner action={<Button variant="ghost" size="sm" onClick={() => void q.refetch()}>Try again</Button>}>We couldn't load the reports.</ErrorBanner> : null}
      {q.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data.reports.map((r) => (
            <Card key={r.id} className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="neutral">{r.covers}</Chip>
                {r.schedules ? (
                  <Chip tone="gold">
                    {r.schedules} {r.schedules === 1 ? "schedule" : "schedules"}
                  </Chip>
                ) : null}
              </div>
              <h2 className="mt-3 font-display text-xl font-semibold text-maroon-900">{r.title}</h2>
              <p className="mt-1 text-sm text-ink">{r.summary}</p>
              <p className="mt-2 text-xs font-semibold text-gold-800">Source: {r.source}</p>
              {r.lastShared ? <p className="mt-1 text-xs text-muted">Last shared {formatWhen(r.lastShared)}</p> : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Link to={r.href} className="inline-flex h-10 items-center gap-2 rounded-xl bg-maroon-700 px-4 text-sm font-bold text-cream-50 shadow-card hover:bg-maroon-600">
                  Open <ArrowRight className="size-4" aria-hidden />
                </Link>
                {r.shareable && q.data.can.share ? (
                  <>
                    <Button variant="ghost" icon={<Share2 className="size-4" />} onClick={() => setSharing(r)}>
                      Share
                    </Button>
                    <Button variant="ghost" icon={<CalendarClock className="size-4" />} onClick={() => setScheduling({ kind: "new", reportId: r.id })}>
                      Schedule
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : null}
      <ShareDialog report={sharing} onClose={() => setSharing(null)} />
      <ScheduleDialog mode={scheduling} onClose={() => setScheduling(null)} />
    </motion.div>
  );
}
