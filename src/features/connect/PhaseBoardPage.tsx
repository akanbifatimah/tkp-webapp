import { Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Chip } from "@/components/ui/Chip";
import { ConfidentialChip, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import type { Team } from "@/lib/permissions";
import { churchDate, serviceDateShort } from "@/lib/time";
import { DraftNotice } from "./DraftNotice";
import { CONNECT_TAGLINE, PHASES, type Phase } from "./model";
import { CellDot, ProgressDots, TeamSwitch } from "./parts";
import { useQueue } from "./queries";
import type { QueueRow } from "./types";

/**
 * TKP Connect UI-C6 (PLANNED) · Phase board: every open guest by phase, as
 * cards with the assignee. Read-only: guests move between phases only when
 * “Phase n Complete” is ticked on Log follow-up (BR-12), so no drag and drop.
 */

/** Planned length of each phase in days (Phase 1 weeks 1–2, Phase 2 weeks 3–4, Phase 3 weeks 5–12). */
const PHASE_END_DAY: Record<Phase, number> = { 1: 14, 2: 28, 3: 84 };

export function PhaseBoardPage() {
  const [params, setParams] = useSearchParams();
  const team = (params.get("team") as Team | null) ?? undefined;
  const q = useQueue(team, "all");
  const d = q.data;
  const [who, setWho] = useState<"all" | "mine">("all");
  const today = churchDate(new Date());

  const columns = useMemo(() => {
    if (!d) return null;
    const col = d.team === "church_office" ? "coMemberId" : "itMemberId";
    const rows = d.rows.filter((r) => (who === "all" ? true : r[col] === d.me.id));
    return PHASES.map((p) => ({ ...p, rows: rows.filter((r) => r.phase === p.phase).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate)) }));
  }, [d, who]);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="Connect · 12 weeks at a glance" title="Phase board" tagline={CONNECT_TAGLINE} actions={<ConfidentialChip />} />
      <DraftNotice questions="Q12, Q13">
        Columns follow today’s phases (no Guest Track or Paused columns from the older mockup). Who sees the board, including the Church Office, is still to be confirmed.
      </DraftNotice>

      {q.isError && !d ? (
        <ErrorBanner>{q.error.message}</ErrorBanner>
      ) : !d || !columns ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
            <TeamSwitch id="board" teams={d.teams} value={d.team} onChange={(t) => setParams({ team: t })} />
            <div role="radiogroup" aria-label="Show" className="inline-flex rounded-2xl border border-line bg-white p-1 shadow-card">
              {(
                [
                  ["all", d.seesWholeTeam ? "Everyone" : "My guests"],
                  ["mine", "Assigned to me"],
                ] as const
              )
                .filter(([k]) => d.seesWholeTeam || k === "all")
                .map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={who === k}
                    onClick={() => setWho(k)}
                    className={cn("h-9 rounded-xl px-3.5 text-sm font-bold transition-colors", who === k ? "bg-ink text-cream-50" : "text-muted hover:text-ink")}
                  >
                    {label}
                  </button>
                ))}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Info className="size-3.5" aria-hidden /> Amber cards have stayed past the phase’s planned length. Tap a card for the guest’s journey.
            </p>
          </motion.div>

          <div className="grid gap-4 lg:grid-cols-3">
            {columns.map((c) => (
              <motion.section key={c.phase} variants={fadeUp} className="flex min-w-0 flex-col rounded-3xl bg-cream-200/60 p-3">
                <header className="flex items-baseline justify-between px-2 pt-1 pb-3">
                  <h2 className="font-display text-lg font-semibold text-maroon-900">{c.label}</h2>
                  <span className="text-xs font-bold text-muted">
                    {c.weeks} · <b className="text-ink tabular">{c.rows.length}</b>
                  </span>
                </header>
                <motion.ul layout className="scroll-warm grid max-h-[70svh] gap-2 overflow-y-auto pr-1">
                  <AnimatePresence initial={false}>
                    {c.rows.map((r) => (
                      <BoardCard key={r.connectId} row={r} team={d.team} today={today} />
                    ))}
                  </AnimatePresence>
                  {!c.rows.length ? <li className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">Nobody in {c.label}.</li> : null}
                </motion.ul>
              </motion.section>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

function BoardCard({ row: r, team, today }: { row: QueueRow; team: Team; today: string }) {
  const days = Math.round((Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)) - Date.UTC(+r.serviceDate.slice(0, 4), +r.serviceDate.slice(5, 7) - 1, +r.serviceDate.slice(8, 10))) / 86_400_000);
  const late = days > PHASE_END_DAY[r.phase];
  const assignee = team === "church_office" ? r.coName : r.itName;
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }}>
      <Link
        to={`/connect/journey/${r.connectId}`}
        className={cn(
          "block rounded-2xl border bg-white p-3 shadow-card transition-[translate,box-shadow] hover:-translate-y-0.5 hover:shadow-lift",
          r.overdue48 ? "border-crit/40" : late ? "border-warn/50 bg-warn-soft/40" : "border-white",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <b className="text-sm text-maroon-800">
            {r.firstName} {r.lastName}
          </b>
          <span className={cn("text-xs font-bold whitespace-nowrap", late ? "text-warn" : "text-muted")}>{days} days</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{assignee ?? <span className="font-semibold text-crit">Not assigned</span>}</span>
          <CellDot cell={r.cellGroup} />
          <span>since {serviceDateShort(r.serviceDate)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <ProgressDots phase={r.phase} done={r.done[`p${r.phase}` as const]} />
          {r.overdue48 ? <Chip tone="crit">48h overdue</Chip> : r.returned2ndVisit ? <Chip tone="ok">Returned</Chip> : null}
        </div>
      </Link>
    </motion.li>
  );
}
