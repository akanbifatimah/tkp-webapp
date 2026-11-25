import { CalendarClock, Pause, Pencil, Play, Send, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { IconAction } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { useDeleteSchedule, useRunSchedule, useSchedules, useSetScheduleActive } from "./report-queries";
import { PERIOD_LABEL, type ReportRun, type Schedule } from "./report-types";
import { ScheduleDialog, WEEKDAYS, type ScheduleDialogMode } from "./ShareDialogs";

/**
 * Reports › Schedules (PRD W-9, PL-4): reports sent to staff on a schedule,
 * replacing the manual PDF forwarding, and the history of every share.
 */

const FORMAT: Record<string, string> = { link: "Link", pdf: "PDF", csv: "CSV" };
const when = (s: Schedule) => (s.frequency === "monthly" ? `Monthly on day ${s.day} at ${s.time}` : `Every ${WEEKDAYS[s.day]} at ${s.time}`);

export function SchedulesPage() {
  const q = useSchedules();
  const [dialog, setDialog] = useState<ScheduleDialogMode | null>(null);
  const d = q.data;
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Scheduled sharing"
        tagline="Reports sent to staff on a schedule, and every report shared. Church time."
        actions={
          d?.can.share ? (
            <Button icon={<CalendarClock className="size-4" />} onClick={() => setDialog({ kind: "new" })}>
              New schedule
            </Button>
          ) : null
        }
      />
      {q.isError ? <ErrorBanner action={<Button variant="ghost" size="sm" onClick={() => void q.refetch()}>Try again</Button>}>We couldn't load the schedules.</ErrorBanner> : null}
      {d ? (
        <>
          {d.items.length ? (
            <div className="space-y-3">
              {d.items.map((s) => (
                <ScheduleRow key={s.id} s={s} canShare={d.can.share} onEdit={() => setDialog({ kind: "edit", schedule: s })} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<CalendarClock className="size-6" />} title="No schedules yet">
              Schedule a report and TKP Hub sends it to the people you choose, every week or month.
            </EmptyState>
          )}
          <section className="space-y-3">
            <h2 className="font-display text-xl font-semibold text-maroon-900">Sent</h2>
            {d.runs.length ? (
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {d.runs.map((r) => (
                    <RunRow key={r.id} r={r} />
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="text-sm text-muted">Nothing shared yet.</p>
            )}
          </section>
        </>
      ) : q.isPending ? (
        <Skeleton className="h-64" />
      ) : null}
      <ScheduleDialog mode={dialog} onClose={() => setDialog(null)} />
    </motion.div>
  );
}

function ScheduleRow({ s, canShare, onEdit }: { s: Schedule; canShare: boolean; onEdit: () => void }) {
  const run = useRunSchedule();
  const setActive = useSetScheduleActive();
  const remove = useDeleteSchedule();
  const confirm = useConfirm();
  const toast = useToast();
  const fail = (e: Error) => toast.show(e instanceof ApiError ? e.message : "That didn't work. Try again.", { tone: "crit" });
  const names = s.recipients.map((r) => r.name);
  return (
    <Card className={cn("flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4", !s.active && "bg-cream-50")}>
      <div className="min-w-0 flex-1 basis-80">
        <p className="flex flex-wrap items-center gap-2">
          <b className="text-ink">{s.name}</b>
          <Chip tone={s.active ? "ok" : "neutral"}>{s.active ? "On" : "Paused"}</Chip>
          <Chip tone="neutral">{FORMAT[s.format]}</Chip>
        </p>
        <p className="mt-1 text-sm text-ink">
          {s.reportTitle} · {PERIOD_LABEL[s.period]}
          {s.serviceType ? ` · ${s.serviceType}` : ""}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {when(s)} · to {names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ")}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {s.nextRunAt ? `Next: ${formatWhen(s.nextRunAt)}` : "Paused: nothing is sent"}
          {s.lastRun ? ` · Last sent ${formatWhen(s.lastRun.at)} (${s.lastRun.period})` : ""}
        </p>
      </div>
      {canShare ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Send className="size-4" />}
            loading={run.isPending}
            onClick={() =>
              run.mutate(s.id, {
                onSuccess: (r) => toast.show(r.status === "sent" ? `${s.name} sent to ${r.sentTo.length} ${r.sentTo.length === 1 ? "person" : "people"}` : "Not sent: no one on the list can open it now", { tone: r.status === "sent" ? "ok" : "crit" }),
                onError: fail,
              })
            }
          >
            Send now
          </Button>
          <IconAction label={s.active ? `Pause ${s.name}` : `Turn on ${s.name}`} icon={s.active ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setActive.mutate({ id: s.id, active: !s.active, rowVer: s.rowVer }, { onError: fail })} />
          <IconAction label={`Change ${s.name}`} icon={<Pencil className="size-4" />} onClick={onEdit} />
          <IconAction
            label={`Delete ${s.name}`}
            icon={<Trash2 className="size-4" />}
            tone="crit"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete the schedule “${s.name}”?`,
                body: `${names.join(", ")} will stop getting ${s.reportTitle}. Reports already sent are not affected. To stop it for a while instead, pause it.`,
                confirmLabel: "Delete schedule",
              });
              if (ok) remove.mutate(s.id, { onSuccess: () => toast.show(`${s.name} deleted`), onError: fail });
            }}
          />
        </div>
      ) : null}
    </Card>
  );
}

function RunRow({ r }: { r: ReportRun }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3 text-sm">
      <span className="w-44 shrink-0 text-xs font-semibold text-muted">{formatWhen(r.at)}</span>
      <span className="min-w-0 flex-1">
        <b className="text-ink">{r.reportTitle}</b> <span className="text-muted">· {r.period} · {FORMAT[r.format]}</span>
        <span className="block text-xs text-muted">
          {r.status === "sent" ? `To ${r.sentTo.join(", ")}` : "Not sent"} · {r.scheduleName ? `Schedule “${r.scheduleName}”` : `Shared by ${r.by}`}
          {r.note ? ` · ${r.note}` : ""}
        </span>
      </span>
      {r.status === "skipped" ? <Chip tone="warn">Skipped</Chip> : null}
    </li>
  );
}
