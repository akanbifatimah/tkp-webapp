import { ArrowUpCircle, Download, GraduationCap, Search, UserMinus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, IconAction, Initials, inputClass } from "@/features/admin/parts";
import { download, toCsv } from "@/features/welcome/import-files";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/time";
import { plural } from "./grow-parts";
import { useEnrol, usePeopleSearch, usePromote, useRoster, useWithdraw } from "./grow-queries";
import type { Enrolment, PersonHit, RosterResponse } from "./grow-types";

/**
 * Roster and registration controls (Figma 136:29273 "Classroom Members"; PRD
 * WEB-17, RG-4, LMS-3): who is in, who is waiting, who left and why.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

export function RosterPanel({ courseId }: { courseId: string }) {
  const q = useRoster(courseId);
  const promote = usePromote();
  const toast = useToast();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState<Enrolment | null>(null);
  const [exporting, setExporting] = useState(false);
  const r = q.data;

  if (q.isError) return <ErrorBanner>{q.error.message}</ErrorBanner>;
  if (!r) return <Skeleton className="h-96 w-full rounded-3xl" />;

  const n = text.trim().toLowerCase();
  const match = (e: Enrolment) => !n || e.name.toLowerCase().includes(n) || e.email.includes(n);
  const enrolled = r.items.filter((e) => (e.status === "enrolled" || e.status === "completed") && match(e));
  const waiting = r.items.filter((e) => e.status === "waitlisted" && match(e));
  const left = r.items.filter((e) => e.status === "withdrawn" && match(e));
  const taken = r.items.filter((e) => e.status === "enrolled").length;
  const seatFree = r.seats === null || taken < r.seats;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.learn.logRosterExport(courseId);
      const rows = [
        [r.title],
        ["Name", "Email", "Status", "External Student", "Joined", "Waitlist place", "Sessions opened", "Prerequisite waived", "Reason for leaving"],
        ...r.items.map((e) => [
          e.name,
          e.email,
          e.status,
          e.learner ? "Yes" : "No",
          formatDay(e.enrolledAt),
          e.position ? String(e.position) : "",
          e.status === "waitlisted" ? "" : `${e.opened} of ${r.publishedSessions}`,
          e.waived ?? "",
          e.withdrawnReason ?? "",
        ]),
      ];
      download(`${r.title.replace(/[^\w]+/g, "-").toLowerCase()}-roster.csv`, toCsv(rows));
      toast.show("Roster downloaded. The export is in the audit log.");
    } catch (e) {
      toast.show(errText(e), { tone: "crit" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Find someone on the roster</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by name or email…" className={cn(inputClass(), "pl-10")} />
        </label>
        <span className="flex flex-wrap gap-2">
          {r.can.export ? (
            <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => void exportCsv()} loading={exporting}>
              Export CSV
            </Button>
          ) : null}
          {r.can.manage ? (
            <Button variant="dark" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
              Add a person
            </Button>
          ) : null}
        </span>
      </div>

      <Card className="p-0 sm:p-0">
        <h3 className="px-4 pt-4 font-display text-lg font-semibold text-maroon-950 sm:px-6 sm:pt-5">
          Enrolled <span className="text-sm font-semibold text-muted">{r.seats === null ? plural(taken, "person", "people") : `${taken} of ${r.seats} seats`}</span>
        </h3>
        {enrolled.length ? (
          <ul className="divide-y divide-line/70">
            {enrolled.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-6">
                <Initials name={e.name} />
                <span className="min-w-0 flex-1 basis-48">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-ink">{e.name}</span>
                    {e.learner ? <Chip tone="phase" icon={<GraduationCap className="size-3" aria-hidden />}>External Student</Chip> : null}
                    {e.status === "completed" ? <Chip tone="ok">Completed</Chip> : null}
                  </span>
                  <span className="block truncate text-sm text-muted">{e.email}</span>
                  {e.waived ? <span className="block text-xs text-gold-800">Prerequisite waived: {e.waived}</span> : null}
                </span>
                <span className="w-36 shrink-0 text-xs text-muted">
                  <span className="block">Joined {formatDay(e.enrolledAt)}</span>
                  <span className="block">
                    Opened {e.opened} of {r.publishedSessions} sessions
                  </span>
                </span>
                {r.can.manage && e.status === "enrolled" ? <IconAction label={`Take ${e.name} off the class`} icon={<UserMinus />} tone="crit" onClick={() => setLeaving(e)} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Users />} title={n ? "Nobody matches that filter" : "Nobody has joined yet"}>
            {n ? "Try another name." : "People who register, or whom the Registrar adds, show here."}
          </EmptyState>
        )}
      </Card>

      {waiting.length || r.items.some((e) => e.status === "waitlisted") ? (
        <Card className="p-0 sm:p-0">
          <h3 className="px-4 pt-4 font-display text-lg font-semibold text-maroon-950 sm:px-6 sm:pt-5">
            Waitlist <span className="text-sm font-semibold text-muted">in order · seats go to the first in line</span>
          </h3>
          <ul className="divide-y divide-line/70">
            {waiting.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-6">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-cream-200 font-display font-bold text-maroon-700 tabular" aria-label={`Place ${e.position}`}>
                  {e.position}
                </span>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block font-bold text-ink">{e.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {e.email} · waiting since {formatDay(e.enrolledAt)}
                  </span>
                </span>
                {r.can.manage ? (
                  <span className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ArrowUpCircle className="size-4" />}
                      disabled={!seatFree || promote.isPending}
                      disabledReason={seatFree ? undefined : "Every seat is taken. Raise the seats in Edit class first."}
                      onClick={() => promote.mutate(e.id, { onSuccess: () => toast.show(`${e.name} has a seat`), onError: (err) => toast.show(errText(err), { tone: "crit" }) })}
                    >
                      Give a seat
                    </Button>
                    <IconAction label={`Take ${e.name} off the waitlist`} icon={<UserMinus />} tone="crit" onClick={() => setLeaving(e)} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {left.length ? (
        <details className="rounded-3xl border border-white bg-white shadow-card">
          <summary className="cursor-pointer px-4 py-4 font-display text-lg font-semibold text-maroon-950 sm:px-6">
            Left the class <span className="text-sm font-semibold text-muted">{left.length}</span>
          </summary>
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {left.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
                <Initials name={e.name} muted />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{e.name}</span>
                  <span className="block text-sm text-muted">{e.withdrawnReason}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <AddDialog open={adding} onClose={() => setAdding(false)} roster={r} />
      <WithdrawDialog enrolment={leaving} onClose={() => setLeaving(null)} title={r.title} />
    </div>
  );
}

/* ---------------------------------------------------------------- add */

function AddDialog({ open, onClose, roster }: { open: boolean; onClose: () => void; roster: RosterResponse }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<PersonHit | null>(null);
  const [waive, setWaive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const search = usePeopleSearch(roster.courseId, text);
  const enrol = useEnrol();
  const toast = useToast();
  const full = roster.seats !== null && roster.items.filter((e) => e.status === "enrolled").length >= roster.seats;

  const close = () => {
    setText("");
    setPicked(null);
    setWaive("");
    setError(null);
    onClose();
  };

  const submit = () => {
    if (!picked) return;
    if (picked.missing.length && waive.trim().length < 5) return setError("Say why they can join without it");
    enrol.mutate(
      { courseId: roster.courseId, personId: picked.id, waive: picked.missing.length ? waive.trim() : undefined },
      {
        onSuccess: (r) => {
          toast.show(r.enrolment.status === "waitlisted" ? `${picked.name} is number ${r.enrolment.position} on the waitlist` : `${picked.name} added to the class`);
          close();
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      subtitle="Add a person"
      title={roster.title}
      className="max-w-xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!picked} loading={enrol.isPending}>
            {full ? "Add to the waitlist" : "Add to the class"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {full ? <p className="rounded-xl bg-cream-200 px-4 py-3 text-sm text-muted">Every seat is taken, so they join the end of the waitlist.</p> : null}
        <Field label="Find a member or External Student" htmlFor="add-q" hint="Two letters or more of their name or email.">
          <input
            id="add-q"
            data-autofocus
            autoComplete="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPicked(null);
              setError(null);
            }}
            className={inputClass()}
          />
        </Field>
        {text.trim().length >= 2 ? (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto" role="listbox" aria-label="People found">
            {search.data?.items.length ? (
              search.data.items.map((p) => {
                const on = picked?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      disabled={p.enrolled}
                      onClick={() => {
                        setPicked(p);
                        setError(null);
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        on ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200",
                      )}
                    >
                      <Initials name={p.name} muted={p.enrolled} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink">{p.name}</span>
                          {p.learner ? <Chip tone="phase">External Student</Chip> : null}
                          {p.enrolled ? <Chip>Already on this class</Chip> : null}
                        </span>
                        <span className="block truncate text-sm text-muted">{p.email}</span>
                        {p.missing.length && !p.enrolled ? <span className="block text-xs font-bold text-warn">Hasn't finished {p.missing.join(" and ")}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-1 text-sm text-muted">{search.isFetching ? "Searching…" : "Nobody found. Check the spelling, or ask them to register first."}</li>
            )}
          </ul>
        ) : null}
        {picked?.missing.length ? (
          <Field
            label={`Why can ${picked.name.split(" ")[0]} join without ${picked.missing.join(" and ")}?`}
            htmlFor="add-waive"
            error={error && waive.trim().length < 5 ? error : undefined}
            hint="Recorded on the roster and in the audit log."
          >
            <input id="add-waive" value={waive} onChange={(e) => setWaive(e.target.value)} className={inputClass(!!error && waive.trim().length < 5)} placeholder="Finished it at another branch" />
          </Field>
        ) : null}
        {error && !(picked?.missing.length && waive.trim().length < 5) ? (
          <p role="alert" className="rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- withdraw */

function WithdrawDialog({ enrolment, onClose, title }: { enrolment: Enrolment | null; onClose: () => void; title: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const withdraw = useWithdraw();
  const toast = useToast();
  const waiting = enrolment?.status === "waitlisted";

  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };

  const submit = () => {
    if (!enrolment) return;
    if (reason.trim().length < 3) return setError("Say why they are leaving");
    withdraw.mutate(
      { id: enrolment.id, reason: reason.trim() },
      {
        onSuccess: (r) => {
          toast.show(r.promoted.length ? `${enrolment.name} left · ${r.promoted.join(", ")} moved off the waitlist` : `${enrolment.name} left the class`);
          close();
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };

  return (
    <Dialog
      open={!!enrolment}
      onClose={close}
      subtitle={waiting ? "Take off the waitlist" : "Take off the class"}
      title={enrolment?.name ?? ""}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={withdraw.isPending}>
            {waiting ? "Take off the waitlist" : "Take off the class"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {waiting
            ? `${enrolment?.name} loses their place in line for ${title}. Everyone behind them moves up.`
            : `${enrolment?.name} loses their seat in ${title} and stops getting its reminders. What they've done so far stays on record. If anyone is waiting, the first in line gets the seat.`}
        </p>
        <Field label="Reason" htmlFor="wd-reason" error={error ?? undefined} hint="Kept on the roster and in the audit log.">
          <input id="wd-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass(!!error)} placeholder="Moved away" />
        </Field>
      </div>
    </Dialog>
  );
}
