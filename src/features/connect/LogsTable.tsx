import { NotebookPen } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fadeUp } from "@/lib/motion";
import type { Team } from "@/lib/permissions";
import { formatStamp } from "@/lib/time";
import { GOOD_OUTCOMES, SOP_STEP, TEAM_SHORT } from "./model";
import { PhaseChip } from "./parts";
import { useLogs } from "./queries";
import { logHref } from "./QueuePage";
import type { LogRow } from "./types";

/**
 * Logs table below the form (FI-67): your own logs, or the whole team's for
 * admins, with a name filter for team admins.
 */
export function LogsTable({ team }: { team?: Team }) {
  const logs = useLogs(team);
  const [who, setWho] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const d = logs.data;

  const authors = useMemo(() => {
    const m = new Map<string, string>();
    d?.logs.forEach((l) => m.set(l.authorId, l.author));
    return [...m.entries()];
  }, [d]);

  if (logs.isPending) {
    return (
      <section className="space-y-3 rounded-3xl bg-white p-5 shadow-card" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-xl" />
        ))}
      </section>
    );
  }
  if (logs.isError) return <ErrorBanner>{logs.error.message}</ErrorBanner>;
  if (!d) return null;

  const co = d.team === "church_office";
  const matching = d.logs.filter((l) => who === "all" || l.authorId === who);
  const rows = matching.slice(0, limit);

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className="@container rounded-3xl border border-white bg-white shadow-card">
      <header className="space-y-1 border-b border-line px-5 py-4">
        <h2 className="font-display text-lg font-semibold text-maroon-900">
          {d.all ? `${TEAM_SHORT[d.team]} logs · all members` : `My logs · ${d.logs.length}`}
        </h2>
        <p className="text-xs font-semibold text-muted">
          {d.all
            ? `You can read every ${TEAM_SHORT[d.team].toLowerCase()} log. You can save logs only for guests assigned to you.`
            : "You can see your own logs."}
        </p>
        {d.all && authors.length ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="mr-1 text-xs font-extrabold tracking-wide text-muted uppercase">Show logs by</span>
            {[["all", "Everyone"] as const, ...authors].map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setWho(id);
                  setLimit(PAGE);
                }}
                aria-pressed={who === id}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
                  who === id ? "border-ink bg-ink text-cream-50" : "border-line bg-white text-ink hover:border-maroon-200",
                )}
              >
                {name}
                <span className={cn("rounded-full px-1.5 tabular", who === id ? "bg-white/20" : "bg-cream-200")}>
                  {id === "all" ? d.logs.length : d.logs.filter((l) => l.authorId === id).length}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {!rows.length ? (
        <EmptyState icon={<NotebookPen />} title="No logs yet">
          Saved calls and messages appear here.
        </EmptyState>
      ) : (
        <>
          <div className="hidden overflow-x-auto @5xl:block">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[11px] font-extrabold tracking-wide whitespace-nowrap text-muted uppercase">
                  <th className="px-4 py-3">Saved</th>
                  <th className="px-3 py-3">Author</th>
                  <th className="px-3 py-3">Guest</th>
                  <th className="px-3 py-3">How</th>
                  {co ? (
                    <>
                      <th className="px-3 py-3">Outcome</th>
                      <th className="px-3 py-3">Would like to be a member</th>
                      <th className="px-3 py-3">SOP step</th>
                      <th className="px-3 py-3">Next action</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3">Phase</th>
                      <th className="px-3 py-3">Membership</th>
                      <th className="px-3 py-3">Workforce / volunteer</th>
                      <th className="px-3 py-3">Life group</th>
                      <th className="px-3 py-3">Spiritual</th>
                      <th className="px-3 py-3">Other</th>
                    </>
                  )}
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.logId} className="border-t border-line align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatStamp(l.savedAt)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{l.author}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <GuestLink log={l} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{l.method}</td>
                    {co ? (
                      <>
                        <td className="px-3 py-3">{outcomeChip(l.callOutcome)}</td>
                        <td className="px-3 py-3">{(l.wantsMembership ?? "—") + (l.noReason ? ` · ${l.noReason}` : "")}</td>
                        <td className="px-3 py-3">{l.sopStep ?? (l.stepsTicked.includes("CoWelcomeCall") ? SOP_STEP : "—")}</td>
                        <td className="px-3 py-3">{l.nextAction ?? "—"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3">{l.phase ? <PhaseChip phase={l.phase} /> : "—"}</td>
                        <td className="px-3 py-3">{answerChip(l.membership)}</td>
                        <td className="px-3 py-3">{(l.workforce ?? "—") + (l.department ? ` · ${l.department}` : "")}</td>
                        <td className="px-3 py-3">{l.lifeGroup ?? "—"}</td>
                        <td className="px-3 py-3">{l.spiritual.join(" · ") || "—"}</td>
                        <td className="px-3 py-3">{l.other.join(" · ") || "—"}</td>
                      </>
                    )}
                    <td className="max-w-72 px-4 py-3 text-muted">{l.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-2 p-3 @5xl:hidden">
            {rows.map((l) => (
              <li key={l.logId} className="rounded-2xl border border-line bg-cream-50/60 p-4 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <GuestLink log={l} />
                  <span className="text-xs text-muted">
                    {formatStamp(l.savedAt)} · {l.author}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Chip>{l.method}</Chip>
                  {l.callOutcome ? outcomeChip(l.callOutcome) : null}
                  {co ? (l.nextAction ? <Chip tone="maroon">{l.nextAction}</Chip> : null) : l.phase ? <PhaseChip phase={l.phase} /> : null}
                  {!co && l.membership ? answerChip(l.membership) : null}
                </div>
                {l.note ? <p className="mt-2 text-muted">{l.note}</p> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {matching.length > rows.length ? (
        <div className="border-t border-line px-5 py-3 text-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE)}
            className="inline-flex h-9 items-center rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink hover:border-maroon-200 hover:bg-cream-50"
          >
            Show more · {matching.length - rows.length} older
          </button>
        </div>
      ) : null}
    </motion.section>
  );
}

const PAGE = 15;

function GuestLink({ log }: { log: LogRow }) {
  return (
    <Link to={logHref(log.connectId, log.team)} className="font-bold text-maroon-800 hover:underline">
      {log.guest}
    </Link>
  );
}

const outcomeChip = (v: string | null) => (v ? <Chip tone={GOOD_OUTCOMES.includes(v) ? "ok" : "crit"}>{v}</Chip> : "—");

function answerChip(v: string | null) {
  if (!v) return "—";
  const tone: ChipTone = /Not /.test(v) || v === "No" ? "crit" : /Interested$|^Yes$|Joined/.test(v) ? "ok" : "neutral";
  return <Chip tone={tone}>{v}</Chip>;
}
