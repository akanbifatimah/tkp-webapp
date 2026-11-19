import { ArrowLeft, ArrowRight, Eye, Lock, NotebookPen, RotateCcw, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { ConfidentialChip, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { ViewEntryDialog } from "@/features/welcome/ViewEntryDialog";
import { ApiError, newClientRequestId } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import type { Team } from "@/lib/permissions";
import { formatStamp, serviceDateLong, serviceDateShort, serviceWeekday } from "@/lib/time";
import { LogsTable } from "./LogsTable";
import {
  CONNECT_TAGLINE,
  IT_MULTI,
  IT_SINGLE,
  NEXT_ACTIONS,
  NOT_APPLICABLE,
  NO_REASONS,
  METHODS,
  PHASES,
  SOP_STEP,
  STEPS,
  STEP_KEYS,
  TEAM_SHORT,
  WANTS_MEMBERSHIP,
  outcomesFor,
  type Method,
  type MultiKey,
  type Phase,
  type SingleKey,
  type StepKey,
} from "./model";
import { CellDot, MultiOption, OptionGroup, PhaseChip, TeamSwitch } from "./parts";
import { useDepartments, useGuest, useSaveLog } from "./queries";
import { logHref } from "./QueuePage";
import { ScriptsPanel } from "./ScriptsPanel";
import type { GuestResponse, SaveLogBody } from "./types";

/** TKP Connect UI-C2 · Log follow-up: "During or right after the call". */

export function LogPage() {
  const { journeyId } = useParams();
  const [params, setParams] = useSearchParams();
  const id = journeyId ? Number(journeyId) : null;
  const team = (params.get("team") as Team | null) ?? undefined;
  const guest = useGuest(id, team);
  const d = guest.data;
  // A note kept across "Reload and keep my note" (UI-C2 SHOULD).
  const [carriedNote, setCarriedNote] = useState<string | null>(null);

  useEffect(() => {
    if (d && params.get("team") !== d.team) setParams({ team: d.team }, { replace: true });
  }, [d, params, setParams]);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="2 · Connect · During or right after the call" title="Log follow-up" tagline={CONNECT_TAGLINE} actions={<ConfidentialChip />} />

      {id === null ? (
        <motion.div variants={fadeUp} className="rounded-3xl bg-white shadow-card">
          <EmptyState icon={<NotebookPen />} title="No guest chosen">
            Open a guest from the{" "}
            <Link to="/connect/queue" className="font-bold text-maroon-700 hover:underline">
              Work queue
            </Link>{" "}
            and tap <b>✎ Log</b>.
          </EmptyState>
        </motion.div>
      ) : guest.isError && !d ? (
        <ErrorBanner>{guest.error.message}</ErrorBanner>
      ) : !d ? (
        <FormSkeleton />
      ) : (
        <>
          <TeamSwitch id="log" teams={d.teams} value={d.team} onChange={(t) => setParams({ team: t })} />
          <LogForm
            key={`${d.guest.connectId}-${d.team}-${d.guest.rowVer}`}
            data={d}
            carriedNote={carriedNote}
            onReloadKeepNote={async (note) => {
              setCarriedNote(note);
              await guest.refetch();
            }}
          />
        </>
      )}

      <LogsTable team={d?.team ?? team} />
    </motion.div>
  );
}

/* ----------------------------------------------------------------- form state */

type FormState = {
  cid: string;
  method: Method | "";
  outcome: string;
  note: string;
  wants: string;
  noReason: string;
  noOther: string;
  next: string;
  sop: boolean;
  phase: Phase;
  membership: string;
  workforce: string;
  lifeGroup: string;
  dept: string;
  multi: Record<MultiKey, boolean>;
  checks: Record<StepKey, boolean>;
  start: Record<StepKey, boolean>;
  returned: boolean;
  returnDate: string;
};

function startForm(d: GuestResponse, carriedNote: string | null): FormState {
  const g = d.guest;
  const s = g.state;
  const checks = Object.fromEntries(STEP_KEYS.map((k) => [k, !!g.checklist[k]])) as Record<StepKey, boolean>;
  return {
    cid: newClientRequestId(), // one request ID per form (BR-18)
    method: "",
    outcome: "",
    note: carriedNote ?? "",
    wants: s.coWantsMembership ?? "",
    noReason: s.coNoReason ?? "",
    noOther: s.coNoOtherDetails ?? "",
    next: s.coNextAction ?? "",
    sop: !!g.checklist.CoWelcomeCall,
    phase: g.phase,
    membership: s.itMembership ?? "",
    workforce: s.itWorkforce ?? "",
    lifeGroup: s.itLifeGroup ?? "",
    dept: s.itDepartmentId ? String(s.itDepartmentId) : "",
    multi: { ...s.multi },
    checks,
    start: { ...checks },
    returned: s.returned2ndVisit,
    returnDate: s.returnVisitDate ?? "",
  };
}

/* ----------------------------------------------------------------- the form */

function LogForm({
  data: d,
  carriedNote,
  onReloadKeepNote,
}: {
  data: GuestResponse;
  carriedNote: string | null;
  onReloadKeepNote: (note: string) => Promise<void>;
}) {
  const g = d.guest;
  const co = d.team === "church_office";
  const ro = !d.canSave;
  const toast = useToast();
  const navigate = useNavigate();
  const save = useSaveLog();
  const departments = useDepartments();
  const [f, setF] = useState<FormState>(() => startForm(d, carriedNote));
  const [error, setError] = useState<ApiError | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const idx = d.myList.indexOf(g.connectId);
  const prev = idx > 0 ? d.myList[idx - 1] : null;
  const next = idx !== -1 && idx < d.myList.length - 1 ? d.myList[idx + 1] : null;
  const notInt = !co && f.membership === "Not Interested";
  const assignee = co ? g.coName : g.itName;
  const tokens = { Name: g.firstName, "Your Name": d.me.fullName, Day: serviceWeekday(g.serviceDate) };

  const onSave = () => {
    setError(null);
    if (!f.method) return toast.show("Choose how you reached out.", { tone: "crit" });
    if (!co && !notInt && f.returned && !f.returnDate) return toast.show("Choose the return visit date.", { tone: "crit" });

    const ticked: StepKey[] = [];
    const unticked: StepKey[] = [];
    const body: SaveLogBody = {
      connectId: g.connectId,
      team: d.team,
      clientRequestId: f.cid,
      rowVer: g.rowVer,
      method: f.method,
      callOutcome: f.outcome || null,
      note: f.note || null,
      stepsTicked: ticked,
      stepsUnticked: unticked,
    };
    if (co) {
      if (f.sop && !f.start.CoWelcomeCall) ticked.push("CoWelcomeCall");
      if (!f.sop && f.start.CoWelcomeCall) unticked.push("CoWelcomeCall");
      body.wantsMembership = f.wants || null;
      body.noReason = f.wants === "No" ? f.noReason || null : null;
      body.noOtherDetails = f.wants === "No" && f.noReason === "Other" ? f.noOther || null : null;
      body.sopStep = f.sop ? SOP_STEP : null;
      body.nextAction = f.next || null;
    } else {
      for (const k of STEP_KEYS) {
        if (k === "CoWelcomeCall" || notInt) continue;
        if (f.checks[k] && !f.start[k]) ticked.push(k);
        if (!f.checks[k] && f.start[k]) unticked.push(k);
      }
      body.phase = f.phase;
      body.membership = f.membership || null;
      body.workforce = f.workforce || null;
      body.departmentId = f.workforce === "Interested" && f.dept ? Number(f.dept) : null;
      body.lifeGroup = f.lifeGroup || null;
      body.multi = f.multi;
      body.returned2ndVisit = f.returned;
      body.returnVisitDate = f.returned ? f.returnDate : null;
    }

    save.mutate(body, {
      onSuccess: (r) => {
        toast.show(r.status === "Closed" ? "Log saved · journey closed" : r.status === "Completed" ? "Log saved · 12-week journey completed" : "Log saved");
      },
      onError: (err) => {
        // Keep everything typed (UI-G4) and show the API's message.
        setError(err instanceof ApiError ? err : new ApiError(0, "UNKNOWN", err.message));
        toast.show(err.message, { tone: "crit" });
        window.setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      },
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start">
      <motion.section variants={fadeUp} className={cn("rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6", ro && "bg-white/80")}>
        {ro ? (
          <div role="note" className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-cream-50 px-4 py-3 text-sm">
            <Eye className="mt-0.5 size-4.5 shrink-0 text-maroon-700" aria-hidden />
            <p>
              <b className="text-maroon-800">View only. </b>
              {g.status !== "Active"
                ? `This journey is ${g.status.toLowerCase()}${g.closedReason ? ` (${g.closedReason})` : ""}.`
                : assignee
                  ? <>This guest is assigned to <b>{assignee}</b> for the {TEAM_SHORT[d.team]}. Only they can save a log.</>
                  : `This guest is not assigned to a ${TEAM_SHORT[d.team].toLowerCase()} person yet.`}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setEntryOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-gold-300 bg-linear-to-b from-white to-gold-100 px-4 text-sm font-extrabold text-maroon-900 shadow-card transition-[translate,box-shadow] hover:-translate-y-0.5 hover:shadow-lift"
          >
            <Eye className="size-4.5" aria-hidden />
            View entry
          </button>
          <p className="text-xs font-semibold text-muted">
            ←{" "}
            <Link to={`/connect/queue?team=${d.team}`} className="font-bold text-maroon-700 hover:underline">
              Work queue
            </Link>
            {idx !== -1 ? ` · guest ${idx + 1} of ${d.myList.length} assigned to you for ${serviceDateShort(g.serviceDate)}` : ""}
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ReadBox label="Guest">
            <span className="block text-[16px] font-bold text-ink">
              {g.firstName} {g.lastName}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{g.phone ?? "No phone"}</span>
              <CellDot cell={g.cellGroup} />
              {co ? null : <PhaseChip phase={g.phase} week={g.weekNo} />}
            </span>
            <span className="mt-1 block text-xs text-muted">Assigned: {assignee ?? "nobody yet"}</span>
          </ReadBox>
          <ReadBox label="Service attended">
            <span className="block text-[15px] font-semibold text-ink">{serviceDateLong(g.serviceDate)}</span>
            <span className="text-sm text-muted">{g.serviceType}</span>
          </ReadBox>
        </div>

        <div className="mt-6 space-y-6">
          <OptionGroup
            name="method"
            label="How did you reach out?"
            options={METHODS}
            value={f.method}
            disabled={ro}
            onChange={(v) => setF((s) => ({ ...s, method: v as Method | "", outcome: s.method === v ? s.outcome : "" }))}
          />
          <Reveal show={!!f.method}>
            <OptionGroup name="outcome" label={co ? "Outcome" : "Call / message result"} options={outcomesFor(f.method)} value={f.outcome} disabled={ro} onChange={(v) => set("outcome", v)} />
          </Reveal>

          {co ? (
            <ChurchOfficeFields f={f} set={set} ro={ro} d={d} />
          ) : (
            <IntegrationFields f={f} setF={setF} set={set} ro={ro} d={d} departments={departments.data ?? []} departmentsLoaded={!departments.isPending} notInt={notInt} />
          )}
        </div>

        <AnimatePresence>
          {error ? (
            <motion.div ref={errorRef} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
              <ErrorBanner
                action={
                  error.isConflict ? (
                    <button
                      type="button"
                      onClick={() => void onReloadKeepNote(f.note)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-crit hover:bg-cream-50"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      Reload and keep my note
                    </button>
                  ) : undefined
                }
              >
                {error.message}
              </ErrorBanner>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-line pt-5">
          <div>
            <Button variant="ghost" disabled={prev === null} disabledReason="This is the first of your guests for this date" onClick={() => prev !== null && navigate(logHref(prev!, d.team))} icon={<ArrowLeft className="size-4" />}>
              <span className="max-sm:sr-only">Previous guest</span>
            </Button>
          </div>
          {ro ? (
            <span className="inline-flex h-12 items-center gap-2 rounded-2xl border border-line bg-cream-50 px-5 text-sm font-bold text-muted">
              <Lock className="size-4" aria-hidden /> View only
            </span>
          ) : (
            <Button variant="gold" size="lg" loading={save.isPending} onClick={onSave} icon={<Save className="size-4.5" />} className="min-w-40">
              {save.isPending ? "Saving…" : "Save log"}
            </Button>
          )}
          <div className="flex justify-end">
            <Button variant="ghost" disabled={next === null} disabledReason="This is the last of your guests for this date" onClick={() => next !== null && navigate(logHref(next!, d.team))}>
              <span className="max-sm:sr-only">Next guest</span>
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Save log records the time and author ({d.me.fullName}). Previous / Next move through the guests assigned to you for this service date.
        </p>
      </motion.section>

      <motion.aside variants={fadeUp} className="xl:sticky xl:top-6">
        <ScriptsPanel team={d.team} phase={f.phase} onPhase={(p) => set("phase", p)} tokens={tokens} phone={g.phone} canShare={!ro} />
      </motion.aside>

      <ViewEntryDialog guestId={entryOpen ? g.guestId : null} onClose={() => setEntryOpen(false)} />
    </div>
  );
}

/* ----------------------------------------------------------------- Church Office */

function ChurchOfficeFields({
  f,
  set,
  ro,
  d,
}: {
  f: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  ro: boolean;
  d: GuestResponse;
}) {
  const done = d.guest.checklist.CoWelcomeCall;
  return (
    <>
      <Section title="Guest response">
        <OptionGroup name="wants" label="Would like to be a member?" options={WANTS_MEMBERSHIP} value={f.wants} disabled={ro} onChange={(v) => set("wants", v)} />
        <Reveal show={f.wants === "No"}>
          <div className="flex flex-wrap items-center gap-3">
            <em className="text-sm font-semibold text-muted">Why not?</em>
            <OptionGroup name="noReason" options={NO_REASONS} value={f.noReason} disabled={ro} onChange={(v) => set("noReason", v)} />
          </div>
        </Reveal>
        <Reveal show={f.wants === "No" && f.noReason === "Other"}>
          <TextField label="Other · details" value={f.noOther} disabled={ro} onChange={(v) => set("noOther", v)} maxLength={500} placeholder="e.g. already a member at another church nearby…" />
        </Reveal>
      </Section>

      <NoteField label="Note" value={f.note} disabled={ro} onChange={(v) => set("note", v)} />
      <LegacyNotes notes={d.guest.legacyNotes} />

      <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-ink">SOP step completed</span>
          <select value={f.sop ? "1" : ""} disabled={ro} onChange={(e) => set("sop", !!e.target.value)} className={selectClass}>
            <option value="">—</option>
            <option value="1">{SOP_STEP}</option>
          </select>
          {done ? <span className="text-xs font-semibold text-ok">✓ by {done.by} · {formatStamp(done.at)}</span> : null}
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-ink">Next action</span>
          <select value={f.next} disabled={ro} onChange={(e) => set("next", e.target.value)} className={selectClass}>
            <option value="">—</option>
            {NEXT_ACTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- Integration */

function IntegrationFields({
  f,
  setF,
  set,
  ro,
  d,
  departments,
  departmentsLoaded,
  notInt,
}: {
  f: FormState;
  setF: React.Dispatch<React.SetStateAction<FormState>>;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  ro: boolean;
  d: GuestResponse;
  departments: { id: number; name: string }[];
  departmentsLoaded: boolean;
  notInt: boolean;
}) {
  const g = d.guest;
  return (
    <>
      <Section title="Outcome">
        {IT_SINGLE.map((x, i) =>
          i > 0 && notInt ? null : (
            <div key={x.key} className="space-y-3">
              <OptionGroup name={x.key} label={x.label} options={x.options} value={f[x.key as SingleKey]} disabled={ro} onChange={(v) => set(x.key as SingleKey, v)} />
              {x.key === "membership" ? (
                <Reveal show={notInt}>
                  <p className="rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-semibold text-crit">
                    Not interested in membership — saving this log closes the guest’s journey. Add a note and Save log.
                  </p>
                </Reveal>
              ) : null}
              {x.key === "workforce" ? (
                <Reveal show={f.workforce === "Interested"}>
                  <label className="grid max-w-sm gap-1.5">
                    <span className="text-sm font-bold text-ink">Department</span>
                    <select value={f.dept} disabled={ro} onChange={(e) => set("dept", e.target.value)} className={selectClass}>
                      <option value="">Choose a department…</option>
                      {departments.map((dp) => (
                        <option key={dp.id} value={dp.id}>
                          {dp.name}
                        </option>
                      ))}
                    </select>
                    {departmentsLoaded && !departments.length ? <span className="text-xs text-muted">The department list has not been loaded yet.</span> : null}
                  </label>
                </Reveal>
              ) : null}
            </div>
          ),
        )}

        {notInt
          ? null
          : IT_MULTI.map((group) => {
              const keys = group.options.map((o) => o.key);
              const na = keys.find((k) => NOT_APPLICABLE.includes(k))!;
              const naOn = f.multi[na];
              const anyOn = keys.some((k) => k !== na && f.multi[k]);
              return (
                <fieldset key={group.label}>
                  <legend className="mb-2 text-sm font-bold text-ink">
                    {group.label} <span className="font-normal text-muted">· tick all that apply</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((o) => (
                      <MultiOption
                        key={o.key}
                        label={o.label}
                        checked={f.multi[o.key]}
                        disabled={ro || (o.key === na ? anyOn : naOn)}
                        onToggle={() => setF((s) => ({ ...s, multi: { ...s.multi, [o.key]: !s.multi[o.key] } }))}
                      />
                    ))}
                  </div>
                </fieldset>
              );
            })}
      </Section>

      <Reveal show={!notInt}>
        <Section title="Phase checklist">
          <div>
            <p className="mb-2 text-sm font-bold text-ink">
              Phase <span className="font-normal text-muted">· changes the checklist below and the scripts</span>
            </p>
            <div role="radiogroup" aria-label="Phase" className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-cream-50 p-1">
              {PHASES.map((p) => {
                const on = f.phase === p.phase;
                return (
                  <button
                    key={p.phase}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    // The phase view stays switchable even when the form is view only.
                    onClick={() => set("phase", p.phase)}
                    className={cn("relative rounded-xl px-2 py-2 text-center transition-colors", on ? "text-cream-50" : "text-ink hover:bg-white")}
                  >
                    {on ? <motion.span layoutId="phase-seg" className="absolute inset-0 rounded-xl bg-phase" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
                    <span className="relative block text-sm font-bold">{p.label}</span>
                    <span className={cn("relative block text-[11px] font-semibold", on ? "text-cream-50/75" : "text-muted")}>{p.weeks}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul key={f.phase} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="divide-y divide-line rounded-2xl border border-line bg-white">
              {STEPS[f.phase].map((s) => {
                const c = g.checklist[s.key];
                const on = f.checks[s.key];
                return (
                  <li key={s.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <label className={cn("flex items-center gap-3 text-[14px] font-semibold", s.key.endsWith("Complete") && "font-extrabold")}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={ro}
                        onChange={(e) => setF((st) => ({ ...st, checks: { ...st.checks, [s.key]: e.target.checked } }))}
                        className="size-4.5 accent-maroon-700"
                      />
                      {s.label}
                    </label>
                    <AnimatePresence initial={false}>
                      {c && on ? (
                        <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-xs font-semibold text-ok">
                          ✓ by {c.by} · {formatStamp(c.at)}
                        </motion.span>
                      ) : on && !c ? (
                        <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-xs font-semibold text-gold-800">
                          Ticked · saved with this log
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </li>
                );
              })}
            </motion.ul>
          </AnimatePresence>
          <p className="text-xs text-muted">
            {g.phase !== f.phase
              ? `The guest is in Phase ${g.phase}. Ticking “Phase ${f.phase} Complete” moves them on.`
              : `Ticking “Phase ${f.phase} Complete” moves the guest to the next phase.`}
          </p>
        </Section>
      </Reveal>

      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          Church Office Note
          <span className="inline-flex items-center gap-1 rounded-full bg-cream-200 px-2 py-0.5 text-[11px] font-bold text-muted">
            <Lock className="size-3" aria-hidden /> View only
          </span>
        </p>
        {g.coNote ? (
          <div className="rounded-2xl border border-line bg-cream-50 px-4 py-3 text-[14px]">
            <p className="mb-1 text-xs font-semibold text-muted">
              {formatStamp(g.coNote.savedAt)} · {g.coNote.by} · {g.coNote.method}
              {g.coNote.outcome ? ` · ${g.coNote.outcome}` : ""}
            </p>
            {g.coNote.note ?? <span className="text-muted italic">(no note)</span>}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">No Church office log yet.</div>
        )}
      </div>
      <LegacyNotes notes={g.legacyNotes} />
      <NoteField label="Integration Note" value={f.note} disabled={ro} onChange={(v) => set("note", v)} />

      {notInt ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <MultiOption label="Returned for 2nd visit" checked={f.returned} disabled={ro} onToggle={() => set("returned", !f.returned)} />
          <select
            aria-label="Return visit date"
            value={f.returnDate}
            disabled={ro || !f.returned}
            onChange={(e) => set("returnDate", e.target.value)}
            className={cn(selectClass, "min-w-60 disabled:opacity-45")}
          >
            <option value="">Return visit date…</option>
            {f.returnDate && !g.returnDates.includes(f.returnDate) ? <option value={f.returnDate}>{serviceDateLong(f.returnDate)}</option> : null}
            {g.returnDates.map((x) => (
              <option key={x} value={x}>
                {serviceDateLong(x)}
              </option>
            ))}
          </select>
          {!g.returnDates.length ? <span className="text-xs text-muted">No later service dates yet.</span> : null}
        </div>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- bits */

const selectClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink transition-[border-color,box-shadow] focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10 disabled:opacity-70";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl border border-line bg-cream-50/50 p-4 sm:p-5">
      <h3 className="text-xs font-extrabold tracking-[0.14em] text-maroon-700 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function ReadBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-cream-50 px-4 py-3">
      <p className="mb-1 text-xs font-extrabold tracking-wide text-muted uppercase">{label}</p>
      {children}
    </div>
  );
}

/** Height-animated show/hide for parts of the form that follow an answer. */
function Reveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function NoteField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-bold text-ink">{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        maxLength={4000}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-[15px] text-ink transition-[border-color,box-shadow] outline-none focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10 disabled:opacity-70"
      />
    </label>
  );
}

function TextField({ label, value, onChange, maxLength, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; maxLength: number; placeholder?: string; disabled?: boolean }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-bold text-ink">{label}</span>
      <input value={value} disabled={disabled} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, "placeholder:text-muted/60")} />
    </label>
  );
}

function LegacyNotes({ notes }: { notes: { text: string; by: string | null }[] }) {
  if (!notes.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        Earlier follow-up notes
        <span className="inline-flex items-center gap-1 rounded-full bg-cream-200 px-2 py-0.5 text-[11px] font-bold text-muted">
          <Lock className="size-3" aria-hidden /> before TKP Connect
        </span>
      </p>
      <ul className="space-y-1 rounded-2xl border border-line bg-cream-50 px-4 py-3 text-[14px]">
        {notes.map((n, i) => (
          <li key={i}>
            {n.text} {n.by ? <span className="text-muted">— {n.by}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]" aria-busy="true" aria-label="Loading the guest">
      <div className="space-y-4 rounded-3xl bg-white p-6 shadow-card">
        <Skeleton className="h-11 w-36 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-10 w-3/4 rounded-xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <Skeleton className="h-96 rounded-3xl" />
    </div>
  );
}

