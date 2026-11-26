import { ArrowLeft, CheckCheck, CircleCheck, Church, Info, Lock, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { Field, Initials, inputClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { useAttendance, useSaveAttendance } from "./grow-queries";
import { GRACE_DAYS, MARK_LABEL, type AttendanceSheet, type Mark } from "./grow-types";

/**
 * Mark attendance (Figma 135:24429): Joined, Recording or Missed for everyone on
 * the class, started from the join log. Joined and Recording both count.
 */

const MARKS: Mark[] = ["joined", "recording", "missed"];
const ON: Record<Mark, string> = {
  joined: "bg-ink text-cream-50",
  recording: "bg-gold-100 text-gold-800 ring-1 ring-gold-300",
  missed: "bg-crit-soft text-crit ring-1 ring-crit/20",
};

export function AttendancePage() {
  const { id = "", sid = "" } = useParams();
  const q = useAttendance(sid);
  if (q.isError)
    return (
      <div className="space-y-4">
        <Back courseId={id} sessionId={sid} />
        <ErrorBanner>{q.error.message}</ErrorBanner>
      </div>
    );
  if (!q.data) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;
  return <Sheet key={q.data.rowVer} sheet={q.data} />;
}

function Back({ courseId, sessionId, title }: { courseId: string; sessionId: string; title?: string }) {
  return (
    <Link to={`/grow/classes/${courseId}/sessions/${sessionId}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
      <ArrowLeft className="size-4" aria-hidden />
      {title ? `Back to ${title}` : "Back to the session"}
    </Link>
  );
}

function Sheet({ sheet }: { sheet: AttendanceSheet }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const save = useSaveAttendance();
  const initial = useMemo(() => Object.fromEntries(sheet.rows.map((r) => [r.enrolmentId, r.mark ?? (sheet.state === "not_started" ? r.suggested : null)])) as Record<string, Mark | null>, [sheet]);
  const [marks, setMarks] = useState(initial);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "final" | null>(null);
  const edit = sheet.can.edit;
  const back = `/grow/classes/${sheet.courseId}/sessions/${sheet.sessionId}`;

  const values = Object.values(marks);
  const joined = values.filter((m) => m === "joined").length;
  const recording = values.filter((m) => m === "recording").length;
  const unmarked = values.filter((m) => !m).length;
  const total = sheet.rows.length;
  const pct = total ? Math.round(((joined + recording) / total) * 100) : 0;
  const dirty = JSON.stringify(marks) !== JSON.stringify(initial);
  const n = text.trim().toLowerCase();
  const rows = sheet.rows.filter((r) => !n || r.name.toLowerCase().includes(n));

  const set = (id: string, m: Mark) => setMarks((x) => ({ ...x, [id]: m }));

  const resetToLogs = async () => {
    const ok = await confirm({
      title: "Reset to the join logs?",
      body: "Every mark goes back to what the join log suggests. Marks you changed by hand are replaced.",
      confirmLabel: "Reset marks",
    });
    if (ok) setMarks(Object.fromEntries(sheet.rows.map((r) => [r.enrolmentId, r.suggested])));
  };

  const submit = async (final: boolean) => {
    setError(null);
    if (sheet.can.override && reason.trim().length < 5) return setError("Say why the attendance is changing after the grace period.");
    setBusy(final ? "final" : "draft");
    try {
      await save.mutateAsync({ sessionId: sheet.sessionId, body: { marks, final, rowVer: sheet.rowVer, ...(sheet.can.override ? { reason: reason.trim() } : {}) } });
      toast.show(final ? `Attendance saved · ${joined + recording} of ${total} attended` : "Saved. Come back to finish it.");
      void navigate(back);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-6 pb-4">
      <Back courseId={sheet.courseId} sessionId={sheet.sessionId} title={`session ${sheet.number}`} />
      <PageHeader eyebrow={`${sheet.courseTitle} · Attendance`} title={`${sheet.number}. ${sheet.sessionTitle}`} tagline={formatWhen(sheet.startsAt)} />
      <motion.div variants={fadeUp} className="-mt-3 flex flex-wrap gap-2">
        {sheet.state === "saved" ? (
          <Chip tone="ok" icon={<CircleCheck className="size-3" aria-hidden />}>
            Saved{sheet.savedBy ? ` by ${sheet.savedBy}` : ""}
            {sheet.savedAt ? ` · ${formatWhen(sheet.savedAt)}` : ""}
          </Chip>
        ) : sheet.state === "draft" ? (
          <Chip tone="warn">Saved part-way</Chip>
        ) : (
          <Chip>Not marked yet · started from the join log</Chip>
        )}
        {sheet.locked ? (
          <Chip icon={<Lock className="size-3" aria-hidden />}>Grace period ended {formatWhen(sheet.graceEndsAt)}</Chip>
        ) : null}
      </motion.div>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold text-ink">{total} enrolled</span>
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full bg-gold-600" aria-hidden />
              {joined} joined live
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full bg-gold-300" aria-hidden />
              {recording} watching later
            </span>
            {unmarked ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-crit">
                <span className="size-2 rounded-full bg-crit" aria-hidden />
                {unmarked} unmarked
              </span>
            ) : null}
          </p>
          <p className="text-xs font-extrabold tracking-[0.12em] text-gold-800 uppercase">{pct}% attended</p>
        </div>
        <span className="mt-3 flex h-2 overflow-hidden rounded-full bg-cream-300" aria-hidden>
          <span className="block h-full bg-gold-600" style={{ width: `${total ? (joined / total) * 100 : 0}%` }} />
          <span className="block h-full bg-gold-300" style={{ width: `${total ? (recording / total) * 100 : 0}%` }} />
        </span>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {edit ? (
          <span className="flex flex-wrap items-center gap-3">
            <Button variant="dark" icon={<CheckCheck className="size-4" />} onClick={() => setMarks(Object.fromEntries(sheet.rows.map((r) => [r.enrolmentId, "joined" as Mark])))}>
              Mark all joined
            </Button>
            <button type="button" onClick={() => void resetToLogs()} className="text-xs font-extrabold tracking-[0.08em] text-muted uppercase underline-offset-4 hover:text-ink hover:underline">
              Reset to join logs
            </button>
          </span>
        ) : (
          <p className="text-sm text-muted">{sheet.locked ? "The grace period has ended. Only the Registrar can change marks now." : "You can see the marks. The class teachers and the Registrar take attendance."}</p>
        )}
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">Filter by name</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by name…" className={cn(inputClass(), "pl-10")} />
        </label>
      </div>

      <Card className="p-2 sm:p-3">
        <ul className="space-y-2">
          {rows.map((r) => {
            const m = marks[r.enrolmentId];
            return (
              <li key={r.enrolmentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-cream-50 px-3 py-3 sm:px-4">
                <Initials name={r.name} muted />
                <span className="min-w-0 flex-1 basis-44">
                  <span className="flex items-center gap-1.5 font-bold text-ink">
                    {r.name}
                    {r.flag ? (
                      <Tooltip label={r.flag}>
                        <span className="text-gold-800">
                          <Info className="size-4" aria-hidden />
                          <span className="sr-only">Note</span>
                        </span>
                      </Tooltip>
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted">{r.log}</span>
                  {r.auto ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-gold-800">
                      <Sparkles className="size-3" aria-hidden />
                      Counted: watched within the grace period
                    </span>
                  ) : null}
                </span>
                <span className="inline-flex shrink-0 rounded-xl bg-white p-1 shadow-card" role="radiogroup" aria-label={`Attendance for ${r.name}`}>
                  {MARKS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={m === k}
                      disabled={!edit}
                      onClick={() => set(r.enrolmentId, k)}
                      className={cn(
                        "h-8 rounded-lg px-3 text-xs font-bold transition-colors disabled:cursor-default",
                        m === k ? ON[k] : "text-muted enabled:hover:bg-cream-100 enabled:hover:text-ink",
                      )}
                    >
                      {MARK_LABEL[k]}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
          {!rows.length ? <li className="px-4 py-6 text-center text-sm text-muted">Nobody matches that name.</li> : null}
        </ul>
      </Card>

      <Card className="flex items-start gap-3 bg-cream-100">
        <Church className="mt-0.5 size-5 shrink-0 text-gold-600" aria-hidden />
        <div>
          <p className="font-display text-lg font-semibold text-maroon-950">Grace period</p>
          <p className="text-sm text-muted">
            People marked <span className="font-bold text-ink">Missed</span> have {GRACE_DAYS} days to watch the recording. If they watch most of it by{" "}
            {formatWhen(sheet.graceEndsAt)}, they count as attended without anyone changing the mark.
          </p>
        </div>
      </Card>

      {edit ? (
        <div className="sticky bottom-3 z-10 space-y-3 rounded-3xl border border-white bg-white/95 p-3 shadow-card backdrop-blur">
          {sheet.can.override ? (
            <Field label="Why is it changing after the grace period?" htmlFor="att-reason" hint="Kept in the audit log.">
              <input id="att-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass(!!error && reason.trim().length < 5)} placeholder="Late sign-in sheet from the chapel" />
            </Field>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {sheet.state !== "saved" ? (
              <Button variant="ghost" onClick={() => void submit(false)} loading={busy === "draft"} disabled={!!busy}>
                Save and come back later
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => void navigate(back)}>
                Cancel
              </Button>
            )}
            <Button
              variant="dark"
              icon={<CircleCheck className="size-4" />}
              onClick={() => void submit(true)}
              loading={busy === "final"}
              disabled={!!busy || unmarked > 0 || (sheet.state === "saved" && !dirty)}
              disabledReason={unmarked ? `${unmarked} still unmarked` : sheet.state === "saved" && !dirty ? "Nothing has changed" : undefined}
            >
              Save attendance
            </Button>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
