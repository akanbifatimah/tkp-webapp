import { AlarmClock, CalendarDays, CheckCircle2, CircleDashed, UserPlus, UserX, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { Chip } from "@/components/ui/Chip";
import { ConfidentialChip, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { Tile } from "@/components/ui/Tile";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { TEAM_LABEL, type Team } from "@/lib/permissions";
import { serviceDateLong, serviceDateShort } from "@/lib/time";
import { CONNECT_TAGLINE, TEAM_SHORT } from "./model";
import { CellDot, ContactActions, PhaseChip, ProgressDots, TeamSwitch } from "./parts";
import { connectKeys, useAssign, useQueue } from "./queries";
import { nextStepLabel } from "./rules";
import type { ConnectMember, QueueResponse, QueueRow } from "./types";

/** TKP Connect UI-C1 · Work queue: "Who do I need to reach today?" */

export const logHref = (connectId: number, team: Team) => `/connect/log/${connectId}?team=${team}`;

export function QueuePage() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const team = (params.get("team") as Team | null) ?? undefined;
  const date = params.get("date") ?? undefined;
  const queue = useQueue(team, date);
  const d = queue.data;
  const [who, setWho] = useState<string>("all");

  // Keep the address in step with what the server chose (latest date, default team).
  useEffect(() => {
    // Only while this page owns the address (not while it animates out).
    if (!d || pathname !== "/connect/queue") return;
    if (params.get("team") !== d.team || params.get("date") !== d.date) {
      setParams({ team: d.team, date: d.date }, { replace: true });
    }
  }, [d, params, setParams, pathname]);

  useEffect(() => setWho("all"), [team, date]);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="2 · Connect · Who do I need to reach today?"
        title="Work queue"
        tagline={CONNECT_TAGLINE}
        actions={<ConfidentialChip />}
      />

      {queue.isError && !d ? (
        <QueueError error={queue.error} />
      ) : !d ? (
        <QueueSkeleton />
      ) : (
        <QueueBody
          data={d}
          who={who}
          setWho={setWho}
          fetching={queue.isFetching}
          onTeam={(t) => setParams({ team: t })}
          onDate={(v) => setParams({ team: d.team, date: v })}
        />
      )}
    </motion.div>
  );
}

function QueueError({ error }: { error: Error }) {
  // AC-04: a team role without a follow-up team gets the exact message, calmly.
  if (error instanceof ApiError && error.code === "NO_FOLLOW_UP_TEAM") {
    return (
      <motion.div variants={fadeUp} className="rounded-3xl bg-white shadow-card">
        <EmptyState icon={<UserX />} title="Not on a follow-up team">
          {error.message}
        </EmptyState>
      </motion.div>
    );
  }
  return <ErrorBanner>{error.message}</ErrorBanner>;
}

function QueueBody({
  data: d,
  who,
  setWho,
  fetching,
  onTeam,
  onDate,
}: {
  data: QueueResponse;
  who: string;
  setWho: (w: string) => void;
  fetching: boolean;
  onTeam: (t: Team) => void;
  onDate: (d: string) => void;
}) {
  const co = d.team === "church_office";
  const admin = d.seesWholeTeam;
  const col = co ? "coMemberId" : "itMemberId";
  const all = d.rows;
  const rows = all.filter((r) => (who === "all" ? true : who === "un" ? !r[col] : r[col] === who));
  const dateLbl = d.date === "all" ? "all service dates" : `${serviceDateLong(d.date)} service`;

  return (
    <div className={cn("space-y-6 transition-opacity", fetching && "opacity-70")}>
      <motion.p variants={fadeUp} className="max-w-3xl text-[15px] text-muted">
        {co ? (
          <>
            Church office makes <b className="text-ink">one</b> welcome call to every guest.
          </>
        ) : (
          <>
            The Integration Team follows up in <b className="text-ink">3 phases over 12 weeks</b>.
          </>
        )}{" "}
        Every guest has one Church office person and one Integration Team person.
      </motion.p>

      <motion.div variants={fadeUp} className="flex flex-wrap items-end gap-3">
        <TeamSwitch id="queue" teams={d.teams} value={d.team} onChange={onTeam} />
        <label className="grid gap-1">
          <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-muted uppercase">
            <CalendarDays className="size-3.5" aria-hidden />
            Service date
          </span>
          <select
            value={d.date}
            onChange={(e) => onDate(e.target.value)}
            className="h-11 min-w-56 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink shadow-card"
          >
            <option value="all">All service dates</option>
            {d.dates.map((x) => (
              <option key={x} value={x}>
                {serviceDateLong(x)}
              </option>
            ))}
          </select>
        </label>
        {!admin ? <Chip tone="maroon">Assigned to you · {all.length}</Chip> : null}
        <p className="basis-full text-xs font-semibold text-muted">
          Opens on the latest service date · pick “All service dates” to see the backlog
        </p>
      </motion.div>

      <Tiles data={d} rows={rows} who={who} dateLbl={dateLbl} />

      {admin ? <NameButtons members={d.members} rows={all} col={col} who={who} setWho={setWho} /> : null}

      {d.truncated ? <p className="text-sm font-semibold text-warn">Showing the first {all.length} guests. Pick one service date to see the rest.</p> : null}

      {!rows.length ? (
        <motion.div variants={fadeUp} className="rounded-3xl bg-white shadow-card">
          <EmptyState icon={<Users />} title={all.length ? "No guests for this person" : admin ? "No open guests" : "No guests assigned to you"}>
            {all.length ? "Choose Everyone to see the whole list." : `Nothing open for ${dateLbl}. When new guests arrive from the welcome form, they appear here within five minutes.`}
          </EmptyState>
        </motion.div>
      ) : admin ? (
        <AssignList data={d} rows={rows} dateLbl={dateLbl} />
      ) : (
        <MyGuests data={d} rows={rows} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- tiles (FI-52) */

function Tiles({ data: d, rows, who, dateLbl }: { data: QueueResponse; rows: QueueRow[]; who: string; dateLbl: string }) {
  const co = d.team === "church_office";
  const admin = d.seesWholeTeam;
  const all = d.rows;
  const count = (f: (r: QueueRow) => boolean) => rows.filter(f).length;
  const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);
  const key = `${d.team}-${d.date}-${who}`;

  let tiles: React.ReactNode;
  if (co) {
    const assigned = rows.filter((r) => r.coMemberId);
    const contacted = assigned.filter((r) => r.coContacted).length;
    if (admin) {
      const person = who !== "all" && who !== "un";
      const personName = d.members.find((m) => m.id === who)?.fullName;
      tiles = (
        <>
          <Tile label="Total guests" value={all.length} hint={dateLbl} icon={<Users />} accent="teal" />
          <Tile
            label="Assigned"
            value={assigned.length}
            hint={person ? `to ${personName}` : `${pct(assigned.length, all.length)}% of total`}
            icon={<UserPlus />}
            accent="blue"
          />
          {person ? null : (
            <Tile label="Not assigned" value={all.filter((r) => !r.coMemberId).length} hint="to a church office person" critical icon={<UserX />} />
          )}
          <Tile label="Contacted" value={contacted} hint="of assigned" icon={<CheckCircle2 />} accent="teal" />
          <Tile label="Not contacted" value={assigned.length - contacted} hint="of assigned" critical icon={<CircleDashed />} />
        </>
      );
    } else {
      const c = rows.filter((r) => r.coContacted).length;
      tiles = (
        <>
          <Tile label="Total guests" value={d.totalGuests} hint={dateLbl} icon={<Users />} accent="teal" />
          <Tile label="Assigned" value={all.length} hint="to you" icon={<UserPlus />} accent="blue" />
          <Tile label="Contacted" value={c} hint="of your guests" icon={<CheckCircle2 />} accent="teal" />
          <Tile label="Not contacted" value={all.length - c} hint="of your guests" critical icon={<CircleDashed />} />
        </>
      );
    }
  } else {
    tiles = (
      <>
        <Tile label="Total guests" value={admin ? rows.length : d.totalGuests} hint={dateLbl} icon={<Users />} accent="teal" />
        <Tile label="48 hrs overdue" value={count((r) => r.overdue48)} critical icon={<AlarmClock />} />
        <Tile label="Phase 1" value={count((r) => r.phase === 1)} hint="weeks 1–2" accent="phase" />
        <Tile label="Phase 2" value={count((r) => r.phase === 2)} hint="weeks 3–4" accent="phase" />
        <Tile label="Phase 3" value={count((r) => r.phase === 3)} hint="weeks 5–12" accent="phase" />
      </>
    );
  }

  return (
    <motion.div
      key={key}
      variants={stagger(0.04)}
      initial="hidden"
      animate="show"
      className={cn("grid grid-cols-2 gap-3 sm:gap-4", co && admin && who !== "all" && who !== "un" ? "lg:grid-cols-4" : co && !admin ? "lg:grid-cols-4" : "lg:grid-cols-5")}
    >
      {tiles}
    </motion.div>
  );
}

/* ----------------------------------------------------------------- name buttons (FI-53) */

function NameButtons({
  members,
  rows,
  col,
  who,
  setWho,
}: {
  members: ConnectMember[];
  rows: QueueRow[];
  col: "coMemberId" | "itMemberId";
  who: string;
  setWho: (w: string) => void;
}) {
  const btn = (k: string, label: string, n: number, warn = false) => {
    const on = who === k;
    return (
      <button
        key={k}
        type="button"
        onClick={() => setWho(k)}
        aria-pressed={on}
        className={cn(
          "relative inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-bold transition-colors",
          on ? "border-ink text-cream-50" : warn ? "border-crit/30 bg-crit-soft text-crit hover:border-crit/60" : "border-line bg-white text-ink hover:border-maroon-200",
        )}
      >
        {on ? <motion.span layoutId="who-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
        <span className="relative">{label}</span>
        <span className={cn("relative rounded-full px-1.5 text-[11px] tabular", on ? "bg-white/20" : "bg-cream-200")}>{n}</span>
      </button>
    );
  };
  return (
    <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-extrabold tracking-wide text-muted uppercase">Show numbers for</span>
      {btn("all", "Everyone", rows.length)}
      {members.map((m) => btn(m.id, m.fullName, rows.filter((r) => r[col] === m.id).length))}
      {btn("un", "Not assigned", rows.filter((r) => !r[col]).length, true)}
    </motion.div>
  );
}

/* ----------------------------------------------------------------- whole-team list */

function AssignList({ data: d, rows, dateLbl }: { data: QueueResponse; rows: QueueRow[]; dateLbl: string }) {
  const co = d.team === "church_office";
  return (
    <motion.section variants={fadeUp} className="@container rounded-3xl border border-white bg-white shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="font-display text-lg font-semibold text-maroon-900">
          {d.canAssign ? "Assign guests" : "Guests"} · {dateLbl}
        </h2>
        <p className="text-xs font-semibold text-muted">
          {d.canAssign ? "Choose who follows up each guest. " : ""}Call · Text · WhatsApp work only on guests assigned to you. On other members’ guests,{" "}
          <b>👁 Log</b> opens their log view only.
        </p>
      </header>

      {/* Table on wide screens */}
      <div className="hidden @4xl:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-extrabold tracking-wide text-muted uppercase">
              <th className="px-5 py-3">Guest</th>
              <th className="px-3 py-3">Service</th>
              <th className="px-3 py-3">{TEAM_SHORT[d.team]} person</th>
              {co ? <th className="px-3 py-3">Status</th> : <><th className="px-3 py-3">Stage</th><th className="px-3 py-3">Clock</th><th className="px-3 py-3">Next step</th></>}
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <motion.tbody variants={stagger(0.025)} initial="hidden" animate="show">
            <AnimatePresence initial={false}>
              {rows.map((r) => (
                <motion.tr
                  key={r.connectId}
                  layout="position"
                  variants={fadeUp}
                  exit={{ opacity: 0 }}
                  className={cn("border-t border-line align-middle", !r[co ? "coMemberId" : "itMemberId"] && "bg-crit-soft/40")}
                >
                  <td className="px-5 py-3">
                    <Link to={logHref(r.connectId, d.team)} className="font-bold text-maroon-800 hover:underline">
                      {r.firstName} {r.lastName}
                    </Link>
                    <div className="mt-0.5">
                      <CellDot cell={r.cellGroup} />
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted">{serviceDateShort(r.serviceDate)}</td>
                  <td className="px-3 py-3">
                    <AssignCell data={d} row={r} />
                  </td>
                  {co ? (
                    <td className="px-3 py-3">
                      <CoStatus row={r} />
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-3">
                        <PhaseChip phase={r.phase} week={r.weekNo} />
                      </td>
                      <td className="px-3 py-3">
                        <Clock row={r} />
                      </td>
                      <td className="px-3 py-3">
                        <NextStep row={r} />
                      </td>
                    </>
                  )}
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <ContactActions
                        size="sm"
                        iconOnly
                        phone={r.phone}
                        mine={r[co ? "coMemberId" : "itMemberId"] === d.me.id}
                        logHref={logHref(r.connectId, d.team)}
                        viewOnlyLog={!!r[co ? "coMemberId" : "itMemberId"]}
                      />
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </motion.tbody>
        </table>
      </div>

      {/* Cards on phones and narrow screens (UI-G2) */}
      <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="grid gap-3 p-3 @4xl:hidden">
        {rows.map((r) => {
          const col = co ? "coMemberId" : "itMemberId";
          return (
            <motion.li
              key={r.connectId}
              layout="position"
              variants={fadeUp}
              className={cn("rounded-2xl border p-4", r[col] ? "border-line bg-cream-50/60" : "border-crit/25 bg-crit-soft/40")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={logHref(r.connectId, d.team)} className="font-bold text-maroon-800 hover:underline">
                    {r.firstName} {r.lastName}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <CellDot cell={r.cellGroup} />
                    <span className="text-xs font-semibold text-muted">Service {serviceDateShort(r.serviceDate)}</span>
                  </div>
                </div>
                {co ? <CoStatus row={r} /> : <Clock row={r} />}
              </div>
              {co ? null : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <PhaseChip phase={r.phase} week={r.weekNo} />
                  <NextStep row={r} />
                </div>
              )}
              <div className="mt-3">
                <AssignCell data={d} row={r} />
              </div>
              <div className="mt-3">
                <ContactActions phone={r.phone} mine={r[col] === d.me.id} logHref={logHref(r.connectId, d.team)} viewOnlyLog={!!r[col]} />
              </div>
            </motion.li>
          );
        })}
      </motion.ul>
    </motion.section>
  );
}

/** The assign dropdown (FI-54): saves straight away; on error it reverts with a toast. */
function AssignCell({ data: d, row: r }: { data: QueueResponse; row: QueueRow }) {
  const toast = useToast();
  const queueKey = useMemo(() => connectKeys.queue(d.team, d.date), [d.team, d.date]);
  const mutation = useAssign(queueKey);
  const co = d.team === "church_office";
  const current = co ? r.coMemberId : r.itMemberId;
  const currentName = co ? r.coName : r.itName;
  const [flash, setFlash] = useState(false);

  if (!d.canAssign) {
    return <span className={cn("text-sm font-semibold", current ? "text-ink" : "text-crit")}>{currentName ?? "— Not assigned —"}</span>;
  }
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={`${TEAM_LABEL[d.team]} person for ${r.firstName} ${r.lastName}`}
        value={current ?? ""}
        disabled={mutation.isPending}
        onChange={(e) => {
          const memberId = e.target.value || null;
          mutation.mutate(
            { connectId: r.connectId, team: d.team, memberId },
            {
              onSuccess: () => {
                toast.show(memberId ? "Assigned" : "Unassigned");
                setFlash(true);
                window.setTimeout(() => setFlash(false), 900);
              },
              onError: (err) => toast.show(err.message, { tone: "crit" }),
            },
          );
        }}
        className={cn(
          "h-9 w-full max-w-56 rounded-xl border px-2.5 text-[13px] font-bold transition-[border-color,box-shadow] disabled:cursor-wait",
          current ? "border-line bg-white text-ink" : "border-crit/40 bg-crit-soft text-crit",
          flash && "border-ok ring-4 ring-ok/15",
        )}
      >
        <option value="">— Not assigned —</option>
        <optgroup label={TEAM_SHORT[d.team]}>
          {d.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </optgroup>
      </select>
      <AnimatePresence>
        {flash ? (
          <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-ok text-white shadow-card">
            <CheckCircle2 className="size-3.5" aria-hidden />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function CoStatus({ row: r }: { row: QueueRow }) {
  if (!r.coMemberId) return <span className="text-sm text-muted">—</span>;
  return r.coContacted ? <Chip tone="ok">✓ Contacted</Chip> : <Chip tone="crit">Not contacted</Chip>;
}

function Clock({ row: r }: { row: QueueRow }) {
  return (
    <span className={cn("inline-flex flex-col leading-tight", r.overdue48 ? "text-crit" : "text-ink")}>
      <b className="text-sm whitespace-nowrap">{r.overdue48 ? "48h overdue" : `Wk ${r.weekNo || 1}`}</b>
      <span className="text-xs text-muted">of 12</span>
    </span>
  );
}

function NextStep({ row: r }: { row: QueueRow }) {
  const done = r.done[`p${r.phase}` as const];
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-ink">{nextStepLabel(r.phase, done)}</span>
      <ProgressDots phase={r.phase} done={done} />
    </span>
  );
}

/* ----------------------------------------------------------------- member view: my guests */

function MyGuests({ data: d, rows }: { data: QueueResponse; rows: QueueRow[] }) {
  const co = d.team === "church_office";
  // Church Office: not contacted first. Integration: 48h overdue first (UI-C1).
  const sorted = [...rows].sort((a, b) => (co ? Number(a.coContacted) - Number(b.coContacted) : Number(b.overdue48) - Number(a.overdue48)));
  return (
    <motion.section variants={fadeUp} className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-maroon-900">My guests · {rows.length}</h2>
      <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="grid gap-3">
        {sorted.map((r) => {
          const crit = co ? !r.coContacted : r.overdue48;
          const done = r.done[`p${r.phase}` as const];
          return (
            <motion.li
              key={r.connectId}
              layout="position"
              variants={fadeUp}
              className={cn(
                "grid gap-4 rounded-2xl border bg-white p-4 shadow-card sm:grid-cols-[6.5rem_1fr_auto] sm:items-center",
                crit ? "border-crit/25" : co ? "border-ok/25" : "border-white",
              )}
            >
              <div className={cn("flex items-baseline gap-2 rounded-xl px-3 py-2 sm:flex-col sm:gap-0", crit ? "bg-crit-soft text-crit" : co ? "bg-ok-soft text-ok" : "bg-cream-200 text-ink")}>
                <b className="text-[15px] leading-tight whitespace-nowrap">
                  {co ? (r.coContacted ? "Contacted" : "Not yet") : r.overdue48 ? "48h overdue" : `Wk ${r.weekNo || 1}`}
                </b>
                <span className="text-xs font-semibold opacity-80">{co ? (r.coContacted ? "call logged" : "one call") : "of 12"}</span>
              </div>
              <div className="min-w-0">
                <Link to={logHref(r.connectId, d.team)} className="text-[16px] font-bold text-maroon-800 hover:underline">
                  {r.firstName} {r.lastName}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {co ? null : <PhaseChip phase={r.phase} />}
                  <Chip>Service {serviceDateShort(r.serviceDate)}</Chip>
                  {co ? <CoStatus row={r} /> : null}
                  <CellDot cell={r.cellGroup} />
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                  {co ? (
                    r.coContacted ? (
                      "Done — the Integration Team carries the 12 weeks."
                    ) : (
                      <>
                        <b className="text-ink">Next step:</b> one welcome call, then Log it.
                      </>
                    )
                  ) : (
                    <>
                      <b className="text-ink">Next step:</b> {nextStepLabel(r.phase, done)} <ProgressDots phase={r.phase} done={done} />
                    </>
                  )}
                </p>
              </div>
              <ContactActions phone={r.phone} mine logHref={logHref(r.connectId, d.team)} viewOnlyLog={false} />
            </motion.li>
          );
        })}
      </motion.ul>
    </motion.section>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the work queue">
      <Skeleton className="h-11 w-80 rounded-xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3 rounded-3xl bg-white p-5 shadow-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-40 rounded-xl" />
            <Skeleton className="ml-auto h-8 w-64 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
