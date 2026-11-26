import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheck, History, Lock, SendHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, inputClass, selectClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { useReview, useSubmission } from "./grow-queries";
import { OUTCOME_LABEL, QUESTION_LABEL, RESPONSE_LABEL, SCALE, type Outcome, type Question, type SubmissionDetail } from "./grow-types";

/** One person's answers and the pastor's response (Figma 136:27588 "Class Assessment – Adaeze Okafor"). */

export function ReviewPage() {
  const { id = "", aid = "", subId = "" } = useParams();
  const q = useSubmission(subId);
  const list = `/grow/classes/${id}/assessments/${aid}/submissions`;
  if (q.isError)
    return (
      <div className="space-y-4">
        <Link to={list} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700">
          <ArrowLeft className="size-4" aria-hidden />
          Back to the answers
        </Link>
        <ErrorBanner>{q.error.message}</ErrorBanner>
      </div>
    );
  if (!q.data) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;
  return <Review key={`${q.data.id}-${q.data.rowVer}`} d={q.data} list={list} />;
}

function Review({ d, list }: { d: SubmissionDetail; list: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const review = useReview();
  const [note, setNote] = useState(d.note);
  const [outcome, setOutcome] = useState<Outcome | "">(d.outcome ?? "");
  const [share, setShare] = useState(d.state === "submitted" ? true : d.shareNote);
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "return" | null>(null);
  const edit = d.can.review;
  const returned = d.state === "returned";
  const changed = returned && (outcome !== (d.outcome ?? "") || note.trim() !== d.note);
  const base = list.replace(/\/submissions$/, "/submissions/");

  const submit = async (release: boolean) => {
    setFields({});
    setError(null);
    setBusy(release ? "return" : "save");
    try {
      const r = await review.mutateAsync({ id: d.id, body: { outcome: outcome || null, note, shareNote: share, release, rowVer: d.rowVer, ...(changed ? { reason } : {}) } });
      if (release) {
        toast.show(changed ? `Review changed and returned to ${d.firstName}` : `Returned to ${d.firstName}`);
        void navigate(r.queue.next ? base + r.queue.next : list);
      } else {
        toast.show("Saved for later");
        void navigate(list);
      }
    } catch (e) {
      if (!(e instanceof ApiError)) return setError("Something went wrong. Please try again.");
      setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, m]) => [k, m[0] ?? ""])));
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="mx-auto max-w-3xl space-y-6 pb-4">
      <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <Link to={list} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
          <ArrowLeft className="size-4" aria-hidden />
          Back to {d.assessment.title}
        </Link>
        <span className="flex items-center gap-1 text-xs text-muted">
          {d.queue.left ? `${d.queue.left} more to review` : "Last one to review"}
          <button
            type="button"
            aria-label="Previous answer"
            disabled={!d.queue.prev}
            onClick={() => d.queue.prev && void navigate(base + d.queue.prev)}
            className="grid size-8 place-items-center rounded-lg border border-line bg-white text-maroon-700 disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next answer"
            disabled={!d.queue.next}
            onClick={() => d.queue.next && void navigate(base + d.queue.next)}
            className="grid size-8 place-items-center rounded-lg border border-line bg-white text-maroon-700 disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </span>
      </motion.div>
      <PageHeader
        eyebrow={d.assessment.courseTitle}
        title={`${d.assessment.title}: ${d.name}`}
        tagline={`Submitted ${formatWhen(d.submittedAt)} · ${d.attended} of ${d.sessions} sessions attended`}
      />
      <motion.div variants={fadeUp} className="-mt-3 flex flex-wrap gap-2">
        {returned ? (
          <Chip tone="ok" icon={<CircleCheck className="size-3" aria-hidden />}>
            Returned {d.returnedAt ? formatWhen(d.returnedAt) : ""}
            {d.reviewer ? ` by ${d.reviewer}` : ""}
          </Chip>
        ) : d.state === "in_review" ? (
          <Chip tone="warn">Saved for later{d.reviewer ? ` by ${d.reviewer}` : ""}</Chip>
        ) : (
          <Chip tone="crit">Needs pastoral review</Chip>
        )}
      </motion.div>
      {d.can.blocked ? (
        <p className="flex items-center gap-2 rounded-2xl bg-cream-200 px-4 py-3 text-sm font-bold text-ink">
          <Lock className="size-4" aria-hidden />
          {d.can.blocked}
        </p>
      ) : null}
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <motion.ol variants={stagger(0.04)} className="space-y-4">
        {d.assessment.questions.map((q, i) => (
          <motion.li key={q.id} variants={fadeUp}>
            <AnswerCard q={q} n={i + 1} answer={d.answers[q.id] ?? null} />
          </motion.li>
        ))}
      </motion.ol>

      <motion.section variants={fadeUp} aria-labelledby="note-h" className="space-y-4">
        <div>
          <h2 id="note-h" className="font-display text-2xl font-semibold text-maroon-950">
            Your note to {d.firstName}
          </h2>
          <p className="text-sm text-muted">What would encourage them? Be specific.</p>
        </div>
        <label htmlFor="rv-note" className="sr-only">
          Your note to {d.firstName}
        </label>
        <textarea
          id="rv-note"
          rows={5}
          value={note}
          disabled={!edit}
          onChange={(e) => setNote(e.target.value)}
          className={cn(inputClass(!!fields.note), "h-auto bg-cream-100 py-3")}
          placeholder={`${d.firstName}, thank you for sharing this…`}
        />
        {fields.note ? <p className="-mt-2 text-xs font-bold text-crit">{fields.note}</p> : null}
        <div className="flex flex-col gap-3 rounded-2xl bg-cream-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-3 text-sm font-bold text-ink">
            Outcome
            <select value={outcome} disabled={!edit} onChange={(e) => setOutcome(e.target.value as Outcome | "")} className={cn(selectClass(!!outcome), "w-auto min-w-64", fields.outcome && "border-crit")} aria-invalid={!!fields.outcome}>
              <option value="">Choose…</option>
              {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm font-bold text-ink">
            <button
              type="button"
              role="switch"
              aria-checked={share}
              disabled={!edit}
              onClick={() => setShare((s) => !s)}
              className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", share ? "bg-gold-600" : "bg-cream-300", fields.shareNote && "ring-2 ring-crit/40")}
            >
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]", share ? "left-4.5" : "left-0.5")} />
            </button>
            Share my note with {d.firstName}
          </label>
        </div>
        {fields.outcome || fields.shareNote ? <p className="-mt-2 text-xs font-bold text-crit">{fields.outcome ?? fields.shareNote}</p> : null}
        {outcome === "resubmit" ? <p className="-mt-2 text-xs text-muted">Their answers open again so they can resubmit before it closes.</p> : null}
        {changed ? (
          <Field label="Why are you changing a returned review?" htmlFor="rv-reason" error={fields.reason} hint={`${d.firstName} sees the new outcome. The change is kept in the audit log.`}>
            <input id="rv-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass(!!fields.reason)} />
          </Field>
        ) : null}
      </motion.section>

      {d.history.length ? (
        <Card className="p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-muted">
            <History className="size-4" aria-hidden />
            History
          </h3>
          <ul className="space-y-1 text-sm text-ink">
            {d.history.map((h, i) => (
              <li key={i}>
                {formatWhen(h.at)} · {h.by} {h.kind === "saved" ? "saved it for later" : h.kind === "changed" ? "changed the review" : "returned it"}
                {h.outcome ? `: ${OUTCOME_LABEL[h.outcome].split(":")[0]}` : ""}
                {h.reason ? <span className="text-muted"> (“{h.reason}”)</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {edit ? (
        <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-3xl border border-white bg-white/95 p-3 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          {!returned ? (
            <Button variant="subtle" onClick={() => void submit(false)} loading={busy === "save"} disabled={!!busy}>
              Save for later
            </Button>
          ) : null}
          <Button
            variant="dark"
            icon={<SendHorizontal className="size-4" />}
            onClick={() => void submit(true)}
            loading={busy === "return"}
            disabled={!!busy || (returned && !changed)}
            disabledReason={returned && !changed ? "Change the outcome or note to return it again" : undefined}
          >
            {returned ? `Return the change to ${d.firstName}` : `Return to ${d.firstName}`}
          </Button>
        </div>
      ) : null}
    </motion.div>
  );
}

function AnswerCard({ q, n, answer }: { q: Question; n: number; answer: string | number | null }) {
  return (
    <Card className="bg-cream-100">
      <p className="text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase">
        {n}. {QUESTION_LABEL[q.kind]} · {RESPONSE_LABEL[q.kind]}
      </p>
      <p className="mt-1 font-bold text-ink">{q.prompt}</p>
      {answer === null || answer === "" ? (
        <p className="mt-3 text-sm text-muted italic">No answer{q.required ? "" : " (optional)"}</p>
      ) : q.kind === "short" ? (
        <blockquote className="mt-3 rounded-2xl bg-white p-4 text-[15px] leading-relaxed text-ink">“{String(answer)}”</blockquote>
      ) : q.kind === "choice" ? (
        <p className="mt-3">
          <Chip tone="gold" icon={<CircleCheck className="size-3" aria-hidden />}>
            {q.options[Number(answer)] ?? String(answer)}
          </Chip>
        </p>
      ) : (
        <div className="relative mt-4" role="img" aria-label={`Answered ${answer}: ${SCALE[Number(answer) - 1] ?? ""}`}>
          <span className="absolute top-2 right-[10%] left-[10%] h-1 -translate-y-1/2 rounded-full bg-cream-300" aria-hidden />
          <ol className="relative grid grid-cols-5 text-center text-xs">
            {SCALE.map((label, i) => {
              const on = i + 1 === Number(answer);
              return (
                <li key={label} className="flex flex-col items-center gap-2">
                  <span className={cn("block rounded-full", on ? "size-4 bg-gold-600 ring-4 ring-gold-100" : "mt-0.5 size-3 bg-cream-300")} aria-hidden />
                  <span className={on ? "font-bold text-gold-800" : "text-muted"}>{label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Card>
  );
}
