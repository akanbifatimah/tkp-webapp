import { ArrowLeft, ClipboardPen, Inbox, MailCheck, Search, Send, UserX } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, Initials, inputClass, selectClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { plural } from "./grow-parts";
import { useExcuse, useRemind, useSubmissions } from "./grow-queries";
import { ASSESSMENT_STATUS_LABEL, OUTCOME_LABEL, type PendingRow, type SubmissionRow } from "./grow-types";

/**
 * Assessment answers (Figma 135:25044 "Assessment Submission"): who needs a
 * pastor's review, who has heard back, and who hasn't answered yet.
 */

type Filter = "pending" | "all" | "review" | "returned";
const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

export function SubmissionsPage() {
  const { id = "", aid = "" } = useParams();
  const q = useSubmissions(aid);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("review");
  const [text, setText] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("oldest");
  const [excusing, setExcusing] = useState<PendingRow | null>(null);
  const d = q.data;

  const back = (
    <Link to={`/grow/classes/${id}/assessments/${aid}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
      <ArrowLeft className="size-4" aria-hidden />
      {d ? `Back to ${d.assessment.title}` : "Back to the assessment"}
    </Link>
  );
  if (q.isError)
    return (
      <div className="space-y-4">
        {back}
        <ErrorBanner>{q.error.message}</ErrorBanner>
      </div>
    );
  if (!d) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;

  const n = text.trim().toLowerCase();
  const rows = d.items
    .filter((x) => (filter === "review" ? x.state !== "returned" : filter === "returned" ? x.state === "returned" : true))
    .filter((x) => !n || x.name.toLowerCase().includes(n) || (x.preview ?? "").toLowerCase().includes(n))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "newest" ? b.submittedAt.localeCompare(a.submittedAt) : a.submittedAt.localeCompare(b.submittedAt)));
  const pending = d.pending.filter((p) => !n || p.name.toLowerCase().includes(n));
  const chips: { id: Filter; label: string; count: number }[] = [
    { id: "pending", label: "Not submitted", count: d.counts.pending + d.counts.excused },
    { id: "all", label: "All submissions", count: d.counts.all },
    { id: "review", label: "Needs pastoral review", count: d.counts.review },
    { id: "returned", label: "Approved and returned", count: d.counts.returned },
  ];

  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-6">
      {back}
      <PageHeader
        eyebrow={`${d.assessment.courseTitle} · after session ${d.assessment.afterSession}`}
        title={d.assessment.title}
        tagline={`${ASSESSMENT_STATUS_LABEL[d.assessment.status]}${d.assessment.closesAt ? ` · closes ${formatWhen(d.assessment.closesAt)}` : ""}`}
      />

      <Card className="space-y-3 bg-cream-100">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative block flex-1">
            <span className="sr-only">Search answers</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name or what they wrote…" className={cn(inputClass(), "pl-10")} />
          </label>
          <label className="sm:w-48">
            <span className="sr-only">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selectClass(false)}>
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
              <option value="name">By name</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={filter === c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
                filter === c.id ? (c.id === "review" ? "border-crit bg-crit text-white" : "border-ink bg-ink text-cream-50") : "border-line bg-white text-muted hover:text-ink",
              )}
            >
              {c.id === "review" && c.count ? <span className={cn("size-1.5 rounded-full", filter === c.id ? "bg-white" : "bg-crit")} aria-hidden /> : null}
              {c.label} ({c.count})
            </button>
          ))}
        </div>
      </Card>

      {filter === "pending" ? (
        <PendingList rows={pending} canExcuse={d.can.excuse} onExcuse={setExcusing} assessmentId={aid} />
      ) : rows.length ? (
        <motion.ul variants={stagger(0.02)} initial="hidden" animate="show" className="space-y-3">
          {rows.map((r) => (
            <SubmissionItem key={r.id} r={r} canReview={d.can.review} onOpen={() => void navigate(`/grow/classes/${id}/assessments/${aid}/submissions/${r.id}`)} />
          ))}
        </motion.ul>
      ) : (
        <Card>
          <EmptyState icon={<Inbox />} title={filter === "review" ? "Nothing waiting for review" : "No answers here"}>
            {filter === "review" ? "Every answer so far has been returned." : n ? "Try another search." : "Answers show here as people submit them."}
          </EmptyState>
        </Card>
      )}

      <PendingSummary d={d} onShow={() => setFilter("pending")} />
      <ExcuseDialog row={excusing} assessmentId={aid} onClose={() => setExcusing(null)} />
    </motion.div>
  );
}

function SubmissionItem({ r, canReview, onOpen }: { r: SubmissionRow; canReview: boolean; onOpen: () => void }) {
  const waiting = r.state !== "returned";
  return (
    <motion.li variants={fadeUp} className={cn("flex flex-col gap-3 rounded-3xl border border-white bg-white p-4 shadow-card sm:flex-row sm:items-center sm:p-5", waiting && "border-l-4 border-l-crit")}>
      <Initials name={r.name} muted={!waiting} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">{r.name}</span>
          {r.state === "in_review" ? <Chip tone="warn">Saved for later{r.reviewer ? ` · ${r.reviewer}` : ""}</Chip> : null}
          {r.state === "returned" && r.outcome ? <Chip tone={r.outcome === "passed" ? "ok" : "gold"}>{OUTCOME_LABEL[r.outcome].split(":")[0]}</Chip> : null}
        </p>
        <p className="text-xs text-muted">
          Submitted {formatWhen(r.submittedAt)} ({ago(r.submittedAt)}){r.state === "returned" && r.reviewer ? ` · returned by ${r.reviewer}` : ""}
        </p>
        {r.preview ? <p className="mt-1 line-clamp-2 text-sm text-ink/80 italic">“{r.preview}”</p> : null}
      </div>
      <Button size="sm" variant={waiting && canReview ? "gold" : "ghost"} icon={<ClipboardPen className="size-4" />} onClick={onOpen} className="shrink-0 self-start sm:self-center">
        {waiting && canReview ? "Review" : "Open"}
      </Button>
    </motion.li>
  );
}

function PendingList({ rows, canExcuse, onExcuse, assessmentId }: { rows: PendingRow[]; canExcuse: boolean; onExcuse: (r: PendingRow) => void; assessmentId: string }) {
  const excuse = useExcuse();
  const toast = useToast();
  const confirm = useConfirm();
  if (!rows.length)
    return (
      <Card>
        <EmptyState icon={<MailCheck />} title="Everyone has answered">
          Nobody is waiting to submit.
        </EmptyState>
      </Card>
    );
  const takeBack = async (r: PendingRow) => {
    const ok = await confirm({ title: `Take back ${r.name}'s excusal?`, body: "They'll be asked to answer again, and get reminders.", confirmLabel: "Take back excusal" });
    if (ok)
      excuse.mutate({ assessmentId, enrolmentId: r.enrolmentId, reason: null }, { onSuccess: () => toast.show(`${r.name} is no longer excused`), onError: (e) => toast.show(errText(e), { tone: "crit" }) });
  };
  return (
    <Card className="p-0 sm:p-0">
      <ul className="divide-y divide-line/70">
        {rows.map((r) => (
          <li key={r.enrolmentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-6">
            <Initials name={r.name} muted />
            <span className="min-w-0 flex-1 basis-48">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-ink">{r.name}</span>
                {r.excused ? <Chip>Excused: {r.excused}</Chip> : null}
              </span>
              <span className="block text-xs text-muted">
                Attended {r.attended} of {r.sessions} sessions{r.watched !== null ? ` · watched ${r.watched}% of the recording` : ""}
              </span>
            </span>
            {canExcuse ? (
              r.excused ? (
                <Button size="sm" variant="ghost" onClick={() => void takeBack(r)}>
                  Take back
                </Button>
              ) : (
                <Button size="sm" variant="ghost" icon={<UserX className="size-4" />} onClick={() => onExcuse(r)}>
                  Excuse
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The Figma's bottom card: who hasn't answered, and a gentle reminder. */
function PendingSummary({ d, onShow }: { d: NonNullable<ReturnType<typeof useSubmissions>["data"]>; onShow: () => void }) {
  const remind = useRemind();
  const toast = useToast();
  const confirm = useConfirm();
  const waiting = d.pending.filter((p) => !p.excused);
  if (!d.pending.length) return null;
  const tooSoon = !!d.lastReminder && Date.now() - Date.parse(d.lastReminder.at) < 86_400_000;
  const send = async () => {
    const ok = await confirm({
      title: `Send a reminder to ${plural(waiting.length, "person", "people")}?`,
      body: `Each gets a short, gentle email asking them to answer “${d.assessment.title}”${d.assessment.closesAt ? ` before ${formatWhen(d.assessment.closesAt)}` : ""}. People who are excused don't get one.`,
      confirmLabel: "Send reminder",
      destructive: false,
    });
    if (ok) remind.mutate(d.assessment.id, { onSuccess: (r) => toast.show(`Reminder sent to ${plural(r.sent, "person", "people")}`), onError: (e) => toast.show(errText(e), { tone: "crit" }) });
  };
  return (
    <Card className="flex flex-col gap-4 bg-cream-100 sm:flex-row sm:items-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-crit" aria-hidden>
        <Inbox className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">
          {plural(waiting.length, "person hasn't", "people haven't")} answered yet
          {d.counts.excused ? <span className="font-semibold text-muted"> · {d.counts.excused} excused</span> : null}
        </p>
        <p className="text-sm text-muted">
          {d.pending
            .slice(0, 3)
            .map((p) => `${p.name}${p.excused ? ` (excused: ${p.excused})` : p.watched !== null ? ` (watched ${p.watched}% of the recording)` : ""}`)
            .join(" · ")}
          {d.pending.length > 3 ? (
            <>
              {" "}
              ·{" "}
              <button type="button" onClick={onShow} className="font-bold text-maroon-700 hover:underline">
                and {d.pending.length - 3} more
              </button>
            </>
          ) : null}
        </p>
        {d.lastReminder ? (
          <p className="text-xs text-muted">
            Last reminder {formatWhen(d.lastReminder.at)} by {d.lastReminder.by}, to {plural(d.lastReminder.count, "person", "people")}.
          </p>
        ) : null}
      </div>
      {d.can.remind && waiting.length ? (
        <Button
          variant="ghost"
          icon={<Send className="size-4" />}
          onClick={() => void send()}
          loading={remind.isPending}
          disabled={tooSoon}
          disabledReason={tooSoon ? "One reminder a day" : undefined}
          className="shrink-0"
        >
          Send a gentle reminder to {waiting.length}
        </Button>
      ) : null}
    </Card>
  );
}

function ExcuseDialog({ row, assessmentId, onClose }: { row: PendingRow | null; assessmentId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const excuse = useExcuse();
  const toast = useToast();
  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };
  const submit = () => {
    if (!row) return;
    if (reason.trim().length < 3) return setError("Say why");
    excuse.mutate(
      { assessmentId, enrolmentId: row.enrolmentId, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.show(`${row.name} is excused`);
          close();
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };
  return (
    <Dialog
      open={!!row}
      onClose={close}
      subtitle="Excuse from this assessment"
      title={row?.name ?? ""}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={excuse.isPending}>
            Excuse them
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">They won't get reminders, and this assessment won't hold back their certificate.</p>
      <Field label="Reason" htmlFor="ex-reason" error={error ?? undefined} hint="Shown on the list and kept in the audit log.">
        <input id="ex-reason" data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass(!!error)} placeholder="Out of state travel" />
      </Field>
    </Dialog>
  );
}
