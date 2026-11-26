import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarCheck,
  CalendarDays,
  Copy,
  Inbox,
  Lock,
  PlusCircle,
  Rocket,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import {
  Field,
  IconAction,
  inputClass,
  selectClass,
} from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import {
  useAssessment,
  useCourse,
  useCreateAssessment,
  useDeleteAssessment,
  usePublishAssessment,
  useUpdateAssessment,
} from "./grow-queries";
import {
  ASSESSMENT_STATUS_LABEL,
  hasMeetings,
  QUESTION_LABEL,
  RESPONSE_LABEL,
  SCALE,
  type Assessment,
  type AssessmentInput,
  type CourseDetail,
  type Question,
  type QuestionKind,
} from "./grow-types";

/**
 * Assessment builder (Figma 135:23449 / 135:24058 "New assessment", "Step 1 of 2"):
 * short reflections, multiple choice and the 1–5 spiritual check-in. Step 2
 * previews it as members will see it, then publishes.
 */

const DAY = 86_400_000;
const WINDOWS = [
  [3, "3 days"],
  [7, "1 week"],
  [14, "2 weeks"],
  [21, "3 weeks"],
  [28, "4 weeks"],
] as const;
const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  year: "numeric",
});
let qid = 0;
const newQuestion = (kind: QuestionKind): Question => ({
  id: `new-${Date.now()}-${qid++}`,
  kind,
  prompt: "",
  required: true,
  options: kind === "choice" ? ["", ""] : [],
});

/** The same checks the server makes before publishing. */
function problemsOf(v: AssessmentInput): string[] {
  const out: string[] = [];
  if (v.title.trim().length < 3) out.push("Give it a title.");
  if (!v.questions.length) out.push("Add at least one question.");
  v.questions.forEach((q, i) => {
    if (q.prompt.trim().length < 3)
      out.push(`Question ${i + 1} needs a prompt.`);
    if (q.kind === "choice") {
      const o = q.options.map((x) => x.trim());
      if (o.filter(Boolean).length < 2)
        out.push(`Question ${i + 1} needs at least two options.`);
      else if (o.some((x) => !x))
        out.push(`Question ${i + 1} has an empty option.`);
      else if (new Set(o.map((x) => x.toLowerCase())).size !== o.length)
        out.push(`Question ${i + 1} has the same option twice.`);
    }
  });
  if (v.questions.length && !v.questions.some((q) => q.required))
    out.push("Make at least one question required.");
  return out;
}

export function AssessmentBuilderPage() {
  const { id = "", aid } = useParams();
  const course = useCourse(id);
  const existing = useAssessment(aid);
  if (course.isError) return <ErrorBanner>{course.error.message}</ErrorBanner>;
  if (existing.isError)
    return <ErrorBanner>{existing.error.message}</ErrorBanner>;
  if (!course.data || (aid && !existing.data))
    return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;
  return (
    <Builder
      key={existing.data?.rowVer ?? "new"}
      c={course.data}
      a={existing.data ?? null}
    />
  );
}

function Builder({ c, a }: { c: CourseDetail; a: Assessment | null }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateAssessment();
  const update = useUpdateAssessment();
  const publish = usePublishAssessment();
  const remove = useDeleteAssessment();
  const after = Number(params.get("after")) || c.sessions.at(-1)?.number || 1;
  const start: AssessmentInput = a
    ? {
        title: a.title,
        afterSession: a.afterSession,
        windowDays: a.windowDays,
        final: a.final,
        questions: a.questions,
      }
    : {
        title: "",
        afterSession: after,
        windowDays: 14,
        final:
          c.completion.assessment === "final" &&
          !c.assessments.some((x) => x.final),
        questions: [newQuestion("short")],
      };
  const [v, setV] = useState<AssessmentInput>(start);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const edit = (a?.can.edit ?? c.can.author) && c.status !== "archived";
  const locked = !!a?.questionsLocked;
  const live = hasMeetings(c.format);
  const back = `/grow/classes/${c.id}?tab=assessments`;
  const dirty = JSON.stringify(v) !== JSON.stringify(start);
  const problems = problemsOf(v);
  const published =
    a?.status === "scheduled" || a?.status === "open" || a?.status === "closed";

  const session = c.sessions.find((s) => s.number === v.afterSession);
  const opens =
    live && session?.startsAt
      ? Date.parse(session.startsAt) + c.schedule.lengthMin * 60_000
      : null;
  const closes = opens !== null ? opens + v.windowDays * DAY : null;

  const setQ = (i: number, patch: Partial<Question>) =>
    setV((x) => ({
      ...x,
      questions: x.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)),
    }));
  const move = (i: number, by: -1 | 1) =>
    setV((x) => {
      const qs = [...x.questions];
      [qs[i], qs[i + by]] = [qs[i + by]!, qs[i]!];
      return { ...x, questions: qs };
    });
  const drop = async (i: number) => {
    const q = v.questions[i]!;
    if (q.prompt.trim()) {
      const ok = await confirm({
        title: `Remove question ${i + 1}?`,
        body: `“${q.prompt.trim()}” and its options come off this assessment.`,
        confirmLabel: "Remove question",
      });
      if (!ok) return;
    }
    setV((x) => ({ ...x, questions: x.questions.filter((_, j) => j !== i) }));
  };

  const leave = async () => {
    if (dirty && edit) {
      const ok = await confirm({
        title: "Leave without saving?",
        body: "Your changes to this assessment will be lost.",
        confirmLabel: "Leave without saving",
        cancelLabel: "Keep editing",
      });
      if (!ok) return;
    }
    void navigate(back);
  };

  const showError = (e: unknown) => {
    if (!(e instanceof ApiError))
      return setError("Something went wrong. Please try again.");
    const f = Object.fromEntries(
      Object.entries(e.fields ?? {}).map(([k, m]) => [k, m[0] ?? ""]),
    );
    setFields(f);
    setError(e.message);
  };

  /** Save (create or update); then publish if asked. */
  const save = async (andPublish: boolean) => {
    setError(null);
    setFields({});
    setBusy(andPublish ? "publish" : "draft");
    try {
      const r = a
        ? await update.mutateAsync({
            id: a.id,
            body: { ...v, rowVer: a.rowVer },
          })
        : await create.mutateAsync({ courseId: c.id, body: v });
      if (andPublish && r.assessment.status === "draft")
        await publish.mutateAsync({
          id: r.assessment.id,
          rowVer: r.assessment.rowVer,
          publish: true,
        });
      const moved = r.movedFinal
        ? ` “${r.movedFinal}” is no longer the final assessment.`
        : "";
      toast.show(
        andPublish
          ? `${v.title.trim()} published. It opens ${opens ? formatWhen(new Date(opens)) : `when people finish session ${v.afterSession}`}.${moved}`
          : `${v.title.trim()} saved.${moved}`,
      );
      void navigate(back);
    } catch (e) {
      showError(e);
      setStep(1);
    } finally {
      setBusy(null);
    }
  };

  const unpublish = async () => {
    if (!a) return;
    const ok = await confirm({
      title: `Move ${a.title} back to draft?`,
      body: "It won't open after its session until you publish it again.",
      confirmLabel: "Move back to draft",
    });
    if (ok)
      publish.mutate(
        { id: a.id, rowVer: a.rowVer, publish: false },
        {
          onSuccess: () => toast.show(`${a.title} is a draft again`),
          onError: showError,
        },
      );
  };

  const del = async () => {
    if (!a) return;
    const ok = await confirm({
      title: `Delete ${a.title}?`,
      body: "The draft and its questions are deleted. This can't be undone.",
      confirmLabel: "Delete assessment",
    });
    if (ok)
      remove.mutate(a.id, {
        onSuccess: () => {
          toast.show(`${a.title} deleted`);
          void navigate(back);
        },
        onError: showError,
      });
  };

  return (
    <motion.div
      variants={stagger(0.04)}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-3xl space-y-6 pb-4"
    >
      <motion.div variants={fadeUp}>
        <button
          type="button"
          onClick={() => void leave()}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to {c.title}
        </button>
      </motion.div>
      <PageHeader
        eyebrow={c.title}
        title={a ? a.title : "New assessment"}
        actions={
          <>
            {a && a.status !== "draft" && a.status !== "scheduled" ? (
              <Button
                variant="dark"
                icon={<Inbox className="size-4" />}
                onClick={() =>
                  void navigate(
                    `/grow/classes/${c.id}/assessments/${a.id}/submissions`,
                  )
                }
              >
                Review answers ({a.submissions}/{c.enrolled})
              </Button>
            ) : null}
            {a && edit ? (
              a.status === "draft" ? (
                <Button
                  variant="ghost"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => void del()}
                >
                  Delete draft
                </Button>
              ) : a.status === "scheduled" ? (
                <Button
                  variant="ghost"
                  icon={<Undo2 className="size-4" />}
                  onClick={() => void unpublish()}
                >
                  Move back to draft
                </Button>
              ) : null
            ) : null}
          </>
        }
      />
      <motion.div variants={fadeUp} className="-mt-3 flex flex-wrap gap-2">
        <Chip
          tone={
            a?.status === "open"
              ? "gold"
              : a?.status === "closed"
                ? "ok"
                : a?.status === "scheduled"
                  ? "maroon"
                  : "neutral"
          }
        >
          {ASSESSMENT_STATUS_LABEL[a?.status ?? "draft"]}
        </Chip>
        {v.final ? <Chip tone="gold">Final assessment</Chip> : null}
        {locked ? (
          <Chip icon={<Lock className="size-3" aria-hidden />}>
            Open: only the closing date can change
          </Chip>
        ) : null}
      </motion.div>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      {step === 1 ? (
        <fieldset disabled={!edit} className="space-y-6">
          <Card>
            <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
                <CalendarDays className="size-5 text-gold-600" aria-hidden />
                Cohort and schedule
              </h2>
              <span className="text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase">
                Step 1 of 2
              </span>
            </header>
            <div className="space-y-5">
              <Field
                label="Assessment title"
                htmlFor="as-title"
                error={fields.title}
              >
                <input
                  id="as-title"
                  data-autofocus
                  value={v.title}
                  onChange={(e) => setV({ ...v, title: e.target.value })}
                  placeholder="Class Reflection"
                  className={inputClass(!!fields.title)}
                />
              </Field>
              <Field label="Class and cohort">
                <p className="flex h-11 items-center rounded-xl border border-line bg-cream-100 px-3.5 text-sm text-ink">
                  {c.title}
                </p>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Opens for the cohort"
                  htmlFor="as-after"
                  error={fields.afterSession}
                  hint={
                    live
                      ? "When that session ends."
                      : "As each person finishes that session."
                  }
                >
                  <select
                    id="as-after"
                    disabled={locked}
                    value={v.afterSession}
                    onChange={(e) =>
                      setV({ ...v, afterSession: Number(e.target.value) })
                    }
                    className={selectClass(false)}
                  >
                    {c.sessions.map((s) => (
                      <option key={s.id} value={s.number}>
                        After session {s.number}
                        {s.startsAt
                          ? ` · ${dayFmt.format(new Date(s.startsAt))}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Submission window closes"
                  htmlFor="as-window"
                  error={fields.windowDays}
                >
                  <select
                    id="as-window"
                    value={v.windowDays}
                    onChange={(e) =>
                      setV({ ...v, windowDays: Number(e.target.value) })
                    }
                    className={selectClass(false)}
                  >
                    {WINDOWS.map(([d, label]) => (
                      <option key={d} value={d}>
                        {label} after opening
                        {opens
                          ? ` (${dayFmt.format(new Date(opens + d * DAY))})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3.5 transition-colors",
                  v.final
                    ? "border-gold-300 bg-gold-100/50"
                    : "border-line bg-white hover:border-maroon-200",
                )}
              >
                <input
                  type="checkbox"
                  checked={v.final}
                  onChange={(e) => setV({ ...v, final: e.target.checked })}
                  className="mt-0.5 size-4.5 shrink-0 accent-maroon-700"
                />
                <span>
                  <span className="block text-sm font-bold text-ink">
                    Final assessment
                  </span>
                  <span className="block text-xs text-muted">
                    {c.completion.assessment === "final"
                      ? "This class needs its final assessment passed for the certificate. Only one assessment can be final."
                      : c.completion.assessment === "every"
                        ? "This class needs every assessment passed, so this is a label only."
                        : "This class needs no assessment for the certificate, so this is a label only."}
                  </span>
                </span>
              </label>
            </div>
          </Card>

          <section aria-labelledby="qs-h" className="space-y-4">
            <header className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2
                  id="qs-h"
                  className="font-display text-xl font-semibold text-maroon-950"
                >
                  Questions ({v.questions.length})
                </h2>
                <p className="text-sm text-muted">
                  Pastoral check-in questions for the cohort's reflection.
                </p>
              </div>
              <Chip tone="gold">Recommended: 3–5 questions</Chip>
            </header>
            {fields.questions ? (
              <p className="text-sm font-bold text-crit">{fields.questions}</p>
            ) : null}
            {v.questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                q={q}
                n={i + 1}
                count={v.questions.length}
                locked={locked || !edit}
                onChange={(p) => setQ(i, p)}
                onMove={(by) => move(i, by)}
                onCopy={() =>
                  setV((x) => ({
                    ...x,
                    questions: [
                      ...x.questions.slice(0, i + 1),
                      {
                        ...q,
                        id: newQuestion(q.kind).id,
                        options: [...q.options],
                      },
                      ...x.questions.slice(i + 1),
                    ],
                  }))
                }
                onRemove={() => void drop(i)}
              />
            ))}
            {edit && !locked && v.questions.length < 20 ? (
              <button
                type="button"
                onClick={() =>
                  setV((x) => ({
                    ...x,
                    questions: [...x.questions, newQuestion("short")],
                  }))
                }
                className="flex h-14 w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line bg-white/60 text-sm font-bold text-muted hover:border-maroon-200 hover:text-ink"
              >
                <PlusCircle className="size-4.5" aria-hidden />
                Add another question
              </button>
            ) : null}
          </section>
        </fieldset>
      ) : (
        <Review v={v} c={c} opens={opens} closes={closes} />
      )}

      {edit ? (
        <div className="sticky bottom-3 z-10 rounded-3xl border border-white bg-white/95 p-3 shadow-card backdrop-blur">
          {problems.length && (step === 2 || !published) ? (
            <p className="px-2 pb-2 text-xs text-muted">
              To publish: {problems.join(" ")}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {step === 1 ? (
              published ? (
                <Button variant="ghost" onClick={() => void leave()}>
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => void save(false)}
                  loading={busy === "draft"}
                  disabled={!!busy || v.title.trim().length < 3}
                  disabledReason={
                    v.title.trim().length < 3
                      ? "Give it a title first"
                      : undefined
                  }
                >
                  Save as draft
                </Button>
              )
            ) : (
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back to the questions
              </Button>
            )}
            {published ? (
              <Button
                variant="dark"
                onClick={() => void save(false)}
                loading={busy === "draft"}
                disabled={!!busy || !dirty || problems.length > 0}
                disabledReason={
                  problems[0] ?? (!dirty ? "Nothing has changed" : undefined)
                }
              >
                Save changes
              </Button>
            ) : step === 1 ? (
              <Button
                variant="dark"
                onClick={() => setStep(2)}
                disabled={problems.length > 0}
                disabledReason={problems[0]}
              >
                Review and publish
              </Button>
            ) : (
              <Button
                variant="dark"
                icon={<Rocket className="size-4" />}
                onClick={() => void save(true)}
                loading={busy === "publish"}
                disabled={!!busy || problems.length > 0}
              >
                Publish assessment
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">
          You can read this assessment. Its class teachers and the Registrar
          change it.{" "}
          <Link to={back} className="font-bold text-maroon-700 hover:underline">
            Back to the class
          </Link>
        </p>
      )}
    </motion.div>
  );
}

function QuestionCard({
  q,
  n,
  count,
  locked,
  onChange,
  onMove,
  onCopy,
  onRemove,
}: {
  q: Question;
  n: number;
  count: number;
  locked: boolean;
  onChange: (p: Partial<Question>) => void;
  onMove: (by: -1 | 1) => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const pid = `q-${q.id}`;
  return (
    <motion.article
      variants={fadeUp}
      className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6"
      aria-label={`Question ${n}`}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2.5 text-xs font-extrabold tracking-widest text-ink uppercase">
          <span
            className="grid size-6 place-items-center rounded-full bg-ink text-[11px] text-cream-50 tabular"
            aria-hidden
          >
            {n}
          </span>
          {QUESTION_LABEL[q.kind]}
        </p>
        <span className="flex items-center gap-1">
          <label className="mr-1 flex items-center gap-2 text-xs font-bold text-muted">
            Required
            <button
              type="button"
              role="switch"
              aria-checked={q.required}
              aria-label={`Question ${n} required`}
              disabled={locked}
              onClick={() => onChange({ required: !q.required })}
              className={cn(
                "relative h-6 w-10 rounded-full transition-colors",
                q.required ? "bg-gold-600" : "bg-cream-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]",
                  q.required ? "left-4.5" : "left-0.5",
                )}
              />
            </button>
          </label>
          {!locked ? (
            <>
              <IconAction
                label={`Move question ${n} up`}
                icon={<ArrowUp />}
                onClick={() => onMove(-1)}
                disabled={n === 1}
              />
              <IconAction
                label={`Move question ${n} down`}
                icon={<ArrowDown />}
                onClick={() => onMove(1)}
                disabled={n === count}
              />
              <IconAction
                label={`Duplicate question ${n}`}
                icon={<Copy />}
                onClick={onCopy}
                disabled={count >= 20}
              />
              <IconAction
                label={`Remove question ${n}`}
                icon={<Trash2 />}
                tone="crit"
                onClick={onRemove}
                disabled={count === 1}
                reason={
                  count === 1 ? "An assessment needs a question" : undefined
                }
              />
            </>
          ) : null}
        </span>
      </header>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Prompt" htmlFor={pid}>
          <input
            id={pid}
            value={q.prompt}
            disabled={locked}
            onChange={(e) => onChange({ prompt: e.target.value })}
            placeholder="What's one thing from this class that stuck with you?"
            className={inputClass()}
          />
        </Field>
        <Field label="Response type" htmlFor={`${pid}-kind`}>
          <select
            id={`${pid}-kind`}
            value={q.kind}
            disabled={locked}
            onChange={(e) => {
              const kind = e.target.value as QuestionKind;
              onChange({
                kind,
                options:
                  kind === "choice"
                    ? q.options.length
                      ? q.options
                      : ["", ""]
                    : [],
              });
            }}
            className={selectClass(false)}
          >
            {(Object.keys(RESPONSE_LABEL) as QuestionKind[]).map((k) => (
              <option key={k} value={k}>
                {RESPONSE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {q.kind === "short" ? (
        <p className="mt-4 rounded-xl bg-cream-100 px-4 py-2.5 text-xs text-muted italic">
          Members will respond with 2–4 sentences.
        </p>
      ) : q.kind === "choice" ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-muted">
            Options presented to members
          </p>
          <ol className="space-y-2">
            {q.options.map((o, j) => (
              <li key={j} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-xs font-bold text-muted">
                  {String.fromCharCode(65 + j)}.
                </span>
                <label htmlFor={`${pid}-o${j}`} className="sr-only">
                  Option {String.fromCharCode(65 + j)}
                </label>
                <input
                  id={`${pid}-o${j}`}
                  value={o}
                  disabled={locked}
                  onChange={(e) =>
                    onChange({
                      options: q.options.map((x, k) =>
                        k === j ? e.target.value : x,
                      ),
                    })
                  }
                  className={cn(inputClass(), "h-10")}
                />
                {!locked ? (
                  <IconAction
                    label={`Remove option ${String.fromCharCode(65 + j)}`}
                    icon={<X />}
                    onClick={() =>
                      onChange({ options: q.options.filter((_, k) => k !== j) })
                    }
                    disabled={q.options.length <= 2}
                    reason={
                      q.options.length <= 2
                        ? "Keep at least two options"
                        : undefined
                    }
                  />
                ) : null}
              </li>
            ))}
          </ol>
          {!locked && q.options.length < 8 ? (
            <button
              type="button"
              onClick={() => onChange({ options: [...q.options, ""] })}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-gold-800 hover:text-maroon-800"
            >
              <PlusCircle className="size-4" aria-hidden />
              Add option
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-muted">
            5-point check-in scale
          </p>
          <ScalePreview />
        </div>
      )}
    </motion.article>
  );
}

function ScalePreview({ picked }: { picked?: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1 rounded-2xl bg-cream-100 px-2 py-3">
      {SCALE.map((label, i) => (
        <li
          key={label}
          className="flex flex-col items-center gap-1 text-center"
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full text-[11px] font-bold tabular",
              i === (picked ?? 4)
                ? "bg-gold-500 text-ink"
                : "bg-cream-300 text-muted",
            )}
          >
            {i + 1}
          </span>
          <span className="text-[11px] text-muted">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Step 2: what members will see, and when. */
function Review({
  v,
  c,
  opens,
  closes,
}: {
  v: AssessmentInput;
  c: CourseDetail;
  opens: number | null;
  closes: number | null;
}) {
  return (
    <motion.div
      variants={stagger(0.04)}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <Card>
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
            <CalendarCheck className="size-5 text-gold-600" aria-hidden />
            When it runs
          </h2>
          <span className="text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase">
            Step 2 of 2
          </span>
        </header>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-bold text-muted">Opens</dt>
            <dd className="font-bold text-ink">
              {opens
                ? formatWhen(new Date(opens))
                : `As each person finishes session ${v.afterSession}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-muted">Closes</dt>
            <dd className="font-bold text-ink">
              {closes
                ? formatWhen(new Date(closes))
                : `${v.windowDays} days after it opens for them`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-muted">Who gets it</dt>
            <dd className="font-bold text-ink">
              Everyone on {c.title} ({c.enrolled})
            </dd>
          </div>
        </dl>
      </Card>
      <Card>
        <p className="mb-1 text-[11px] font-extrabold tracking-[0.12em] text-gold-600 uppercase">
          Preview
        </p>
        <h2 className="mb-5 font-display text-2xl font-semibold text-maroon-950">
          {v.title}
        </h2>
        <ol className="space-y-4">
          {v.questions.map((q, i) => (
            <li key={q.id} className="rounded-2xl bg-cream-50 p-4">
              <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
                {i + 1}. {QUESTION_LABEL[q.kind]}
                {q.required ? "" : " · optional"}
              </p>
              <p className="mt-1 font-bold text-ink">{q.prompt}</p>
              {q.kind === "short" ? (
                <div
                  className="mt-3 h-16 rounded-xl border border-line bg-white"
                  aria-hidden
                />
              ) : q.kind === "choice" ? (
                <ul className="mt-3 space-y-1.5">
                  {q.options.map((o, j) => (
                    <li
                      key={j}
                      className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                    >
                      <span
                        className="size-4 shrink-0 rounded-full border-2 border-line"
                        aria-hidden
                      />
                      {o}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3">
                  <ScalePreview picked={-1} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </motion.div>
  );
}
