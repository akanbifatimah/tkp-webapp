import { Check, CircleDot, Flag, HeartHandshake, Lock, MessageSquareText, PartyPopper, Search, SquarePen, UserRound, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Chip } from "@/components/ui/Chip";
import { ConfidentialChip, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/auth";
import { useGuestSearch } from "@/features/welcome/queries";
import { ViewEntryButton } from "@/features/welcome/parts";
import { ViewEntryDialog } from "@/features/welcome/ViewEntryDialog";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatStamp, serviceDateLong, serviceDateShort } from "@/lib/time";
import { DraftNotice } from "./DraftNotice";
import { CONNECT_TAGLINE, PHASES, STEPS, type Phase } from "./model";
import { CellDot, PhaseChip } from "./parts";
import { useJourney } from "./queries";
import type { JourneyEvent, JourneyResponse } from "./types";

/**
 * TKP Connect UI-C5 (PLANNED) · Guest journey: one guest's whole journey on a
 * timeline: both teams' logs, checklist ticks, outcomes and phase changes.
 * Connect roles; the Welcome Lead and Welcome Team view only.
 */
const KPI_DEADLINE: Record<string, string> = {
  P1Welcome48h: "within 48 hours of the form",
  P1WelcomeCall: "day 1–3 after the visit",
  P1Culture: "by the end of week 2",
  P1Relationship: "by the end of week 2",
  P1Complete: "moves the guest to Phase 2",
  P2Complete: "moves the guest to Phase 3",
  P3Complete: "completes the 12-week journey",
};

export function JourneyPage() {
  const { connectId } = useParams();
  const id = connectId ? Number(connectId) : null;
  const q = useJourney(id);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="Connect · One guest, start to finish" title="Guest journey" tagline={CONNECT_TAGLINE} actions={<ConfidentialChip />} />
      <DraftNotice questions="Q13">The layout follows the approved mockup, adjusted to today’s data model (Active · Completed · Closed, no Paused). Final design still to be agreed.</DraftNotice>
      {id === null ? <GuestPicker /> : q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : !q.data ? <Skeleton className="h-125 rounded-3xl" /> : <Journey d={q.data} />}
    </motion.div>
  );
}

/** Without a guest chosen: find one (uses Guest lookup's search). */
function GuestPicker() {
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const search = useGuestSearch(name.trim().length >= 2 ? { name: name.trim() } : {});
  const items = (search.data?.items ?? []).filter((i) => i.connectId);
  return (
    <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6">
      <label className="grid max-w-xl gap-1.5">
        <span className="text-sm font-bold text-ink">Find a guest</span>
        <span className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First or last name"
            className="h-12 w-full rounded-xl border border-line bg-white pr-4 pl-10.5 text-[15px] outline-none focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10"
          />
        </span>
      </label>
      {name.trim().length >= 2 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 18).map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => navigate(`/connect/journey/${g.connectId}`)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-cream-50/60 px-4 py-3 text-left hover:border-maroon-200"
              >
                <span>
                  <b className="text-maroon-800">
                    {g.firstName} {g.lastName}
                  </b>
                  <span className="block text-xs text-muted">First seen {serviceDateShort(g.serviceDate)}</span>
                </span>
                <CellDot cell={g.cellGroup} />
              </button>
            </li>
          ))}
          {!items.length && !search.isFetching ? <li className="text-sm text-muted">No guests match.</li> : null}
        </ul>
      ) : (
        <EmptyState icon={<UserRound />} title="Choose a guest">
          Type at least two letters of a name, or open a guest from the Work queue, the Phase board or Guest lookup.
        </EmptyState>
      )}
    </motion.section>
  );
}

function Journey({ d }: { d: JourneyResponse }) {
  const g = d.guest;
  const { has } = useAuth();
  const [entry, setEntry] = useState<number | null>(null);
  const canLog = has("connect.log.view");
  const progress = g.status === "Completed" ? 4 : g.phase;
  const statusChip = g.status === "Active" ? <Chip tone="ok">Active</Chip> : g.status === "Completed" ? <Chip tone="gold">Completed</Chip> : <Chip tone="crit">Closed · {g.closedReason}</Chip>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-maroon-600 to-maroon-800 font-display text-xl font-semibold text-cream-50">
            {(g.firstName[0] ?? "") + (g.lastName[0] ?? "")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold tracking-[0.14em] text-gold-600 uppercase">Guest journey · Connect #{g.connectId}</p>
            <h2 className="font-display text-[28px] leading-tight font-semibold text-maroon-900">
              {g.firstName} {g.lastName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {statusChip}
              {g.status === "Active" ? <PhaseChip phase={g.phase} week={g.weekNo} /> : null}
              {g.overdue48 ? <Chip tone="crit">48h overdue</Chip> : null}
              <CellDot cell={g.cellGroup} />
              <span className="text-xs text-muted">First visit {serviceDateLong(g.serviceDate)} · {g.serviceType}</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              Church office: <b className="text-ink">{g.coName ?? "not assigned"}</b> · Integration Team: <b className="text-ink">{g.itName ?? "not assigned"}</b>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canLog && g.status === "Active" ? (
              <Link
                to={`/connect/log/${g.connectId}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-linear-to-br from-gold-300 via-gold-500 to-gold-600 px-4 text-sm font-extrabold text-maroon-950 shadow-glow"
              >
                <SquarePen className="size-4" aria-hidden /> Log follow-up
              </Link>
            ) : null}
            <ViewEntryButton onClick={() => setEntry(g.guestId)} />
          </div>
        </div>

        {/* Progress rail */}
        <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Journey progress">
          {[...PHASES.map((p) => ({ n: p.phase as number, label: p.label, sub: p.weeks })), { n: 4, label: "Completed", sub: "week 12" }].map((s) => {
            const done = s.n < progress || (s.n === 4 && g.status === "Completed");
            const here = s.n === progress && g.status === "Active";
            const count = s.n <= 3 ? STEPS[s.n as Phase].filter((x) => g.checklist[x.key]).length : null;
            return (
              <li key={s.n} className="space-y-1.5">
                <span className="block h-2 overflow-hidden rounded-full bg-cream-200">
                  <motion.span
                    className={cn("block h-full rounded-full", g.status === "Closed" ? "bg-muted/40" : "bg-maroon-700")}
                    initial={{ width: 0 }}
                    animate={{ width: done ? "100%" : here && count !== null ? `${Math.max(8, (count * 100) / STEPS[s.n as Phase].length)}%` : "0%" }}
                    transition={{ duration: 0.7, delay: 0.1 * s.n, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
                <span className={cn("block text-xs font-bold", here ? "text-maroon-800" : "text-ink")}>{s.label}</span>
                <span className="block text-[11px] text-muted">
                  {s.sub}
                  {count !== null ? ` · ${count} of ${STEPS[s.n as Phase].length}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </motion.section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {/* Checklists */}
          <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6">
            <h3 className="font-display text-lg font-semibold text-maroon-900">Checklist</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {PHASES.map((p) => (
                <div key={p.phase} className={cn("rounded-2xl border p-4", p.phase === g.phase && g.status === "Active" ? "border-maroon-200 bg-cream-50" : "border-line")}>
                  <p className="text-sm font-bold text-ink">
                    {p.label} <span className="font-semibold text-muted">· {p.weeks}</span>
                  </p>
                  <ul className="mt-3 space-y-3">
                    {STEPS[p.phase].map((s) => {
                      const c = g.checklist[s.key];
                      return (
                        <li key={s.key} className="flex gap-2.5 text-sm">
                          <span className={cn("mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full", c ? "bg-ok text-white" : "border-2 border-line")}>{c ? <Check className="size-3" strokeWidth={3.5} aria-hidden /> : null}</span>
                          <span className="min-w-0">
                            <span className={cn("block font-semibold", c ? "text-ink" : "text-muted")}>{s.label}</span>
                            {c ? (
                              <span className="block text-xs font-semibold text-ok">
                                ✓ by {c.by} · {formatStamp(c.at)}
                              </span>
                            ) : KPI_DEADLINE[s.key] ? (
                              <span className="block text-xs text-muted">{KPI_DEADLINE[s.key]}</span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Logs */}
          <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6">
            <h3 className="font-display text-lg font-semibold text-maroon-900">Follow-up log · both teams</h3>
            {d.logs.length ? (
              <ul className="mt-4 space-y-3">
                {d.logs.map((l) => (
                  <li key={l.logId} className="rounded-2xl border border-line bg-cream-50/60 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <Chip tone={l.team === "church_office" ? "maroon" : "phase"}>{l.team === "church_office" ? "Church office" : `Integration${l.phase ? ` · Phase ${l.phase}` : ""}`}</Chip>
                        <b>{l.method}</b>
                        {l.callOutcome ? <span className="text-muted">· {l.callOutcome}</span> : null}
                      </span>
                      <span className="text-xs text-muted">
                        {formatStamp(l.savedAt)} · {l.author}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {l.wantsMembership ? <Chip>Member? {l.wantsMembership}</Chip> : null}
                      {l.nextAction ? <Chip tone="gold">{l.nextAction}</Chip> : null}
                      {l.membership ? <Chip tone={l.membership === "Interested" ? "ok" : l.membership === "Not Interested" ? "crit" : "neutral"}>Membership: {l.membership}</Chip> : null}
                      {l.workforce ? <Chip>Workforce: {l.workforce}{l.department ? ` · ${l.department}` : ""}</Chip> : null}
                      {l.lifeGroup ? <Chip>Life group: {l.lifeGroup}</Chip> : null}
                      {[...l.spiritual, ...l.other].map((x) => (
                        <Chip key={x}>{x}</Chip>
                      ))}
                    </div>
                    {l.note ? <p className="mt-2 text-ink">{l.note}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No logs yet.</p>
            )}
          </motion.section>
        </div>

        <div className="space-y-6">
          {/* Person */}
          <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card">
            <h3 className="font-display text-lg font-semibold text-maroon-900">Person</h3>
            <dl className="mt-3 grid gap-2.5 text-sm">
              <Kv k="Phone" v={g.phone ?? "—"} />
              <Kv k="How they heard" v={d.howHeard ?? "—"} />
              <Kv k="Visits" v={d.visits.map((v) => serviceDateShort(v.serviceDate)).join(" · ")} />
              <Kv k="Return confirmed" v={g.state.returnVisitDate ? serviceDateLong(g.state.returnVisitDate) : "Not yet"} />
              <Kv k="Membership" v={g.state.itMembership ?? g.state.coWantsMembership ?? "Not asked yet"} />
              <Kv k="Department" v={d.department ?? (g.state.itWorkforce ? `Workforce: ${g.state.itWorkforce}` : "—")} />
              <Kv k="Life group" v={g.state.itLifeGroup ?? "—"} />
            </dl>
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-gold-100 px-3 py-2.5 text-xs font-semibold text-gold-800">
              <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
              Pastoral and counseling details stay in the Counseling Hub, never here.
            </p>
          </motion.section>

          {/* History */}
          <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card">
            <h3 className="font-display text-lg font-semibold text-maroon-900">Status history</h3>
            <ol className="relative mt-4 space-y-4 border-l-2 border-line pl-5">
              {d.events.map((e, i) => (
                <motion.li key={`${e.at}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.04, 0.6) }} className="relative">
                  <span className="absolute top-0.5 -left-7.5 grid size-5 place-items-center rounded-full border-2 border-white bg-cream-200 text-maroon-700 [&_svg]:size-3">
                    <EventIcon kind={e.kind} />
                  </span>
                  <p className="text-sm font-semibold text-ink">{e.text}</p>
                  <p className="text-xs text-muted">
                    {formatStamp(e.at)}
                    {e.by ? ` · ${e.by}` : ""}
                  </p>
                </motion.li>
              ))}
            </ol>
          </motion.section>
        </div>
      </div>

      <ViewEntryDialog guestId={entry} onClose={() => setEntry(null)} list={d.visits.map((v) => v.guestId)} onNavigate={setEntry} />
    </div>
  );
}

function EventIcon({ kind }: { kind: JourneyEvent["kind"] }) {
  switch (kind) {
    case "form":
      return <Flag />;
    case "contact":
      return <MessageSquareText />;
    case "phase":
      return <CircleDot />;
    case "return":
      return <HeartHandshake />;
    case "completed":
      return <PartyPopper />;
    case "closed":
      return <XCircle />;
    default:
      return <Check />;
  }
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="font-semibold text-muted">{k}</dt>
      <dd className="min-w-0 text-ink wrap-break-word">{v}</dd>
    </div>
  );
}
