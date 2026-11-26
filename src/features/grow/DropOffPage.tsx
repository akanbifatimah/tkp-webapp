import { Copy, Heart, Route, UsersRound } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { selectClass } from "@/features/admin/parts";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { useDropOff } from "./grow-queries";
import { DROP_OFF_PERIOD_LABEL, type DropOffPeriod } from "./grow-types";

/**
 * Drop-off report (Figma 136:28729): how many people move from each pathway step
 * to the next. Counts only; groups under five are hidden (PRD PL-1). Names are
 * for personal follow-up, never a mass message.
 */

export function DropOffPage() {
  const [period, setPeriod] = useState<DropOffPeriod>("12m");
  const q = useDropOff(period);
  const toast = useToast();
  const d = q.data;

  const copy = async (id: string, names: string[]) => {
    try {
      await api.learn.logDropOffCopy(id);
      await navigator.clipboard.writeText(names.join("\n"));
      toast.show(`${names.length} names copied. The copy is in the audit log.`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Couldn't copy the list. Please try again.", { tone: "crit" });
    }
  };

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="Grow" title="Drop-off report" tagline="Counts by pathway step. Names stay private here: reach out personally, not en masse." />
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}

      <Card className="flex flex-wrap items-center justify-between gap-3 bg-cream-100 p-4">
        <label className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="sr-only">Period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as DropOffPeriod)} className={cn(selectClass(false), "w-auto")}>
            {(Object.keys(DROP_OFF_PERIOD_LABEL) as DropOffPeriod[]).map((p) => (
              <option key={p} value={p}>
                {DROP_OFF_PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        {d ? (
          <Chip tone="gold" icon={<UsersRound className="size-3.5" aria-hidden />}>
            {d.tracked} people tracked
          </Chip>
        ) : null}
      </Card>

      {!d ? (
        <Skeleton className="h-125 w-full rounded-3xl" />
      ) : (
        <>
          {d.insight ? (
            <motion.div variants={fadeUp} className="flex items-start gap-4 rounded-3xl border border-gold-300 bg-gold-100/60 p-5 sm:p-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-maroon-700" aria-hidden>
                <Heart className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold tracking-[0.12em] text-gold-800 uppercase">Biggest drop</p>
                <p className="font-display text-xl font-semibold text-maroon-950">
                  Most people stop between {d.insight.from} and {d.insight.to}: {d.insight.movedOn} of {d.insight.started} moved on.
                </p>
                <p className="mt-1 text-sm text-muted">Worth a conversation with the teachers, not a campaign. A personal call at this point usually helps most.</p>
              </div>
            </motion.div>
          ) : null}

          <section aria-labelledby="path-h" className="space-y-3">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="path-h" className="flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
                <Route className="size-5 text-gold-600" aria-hidden />
                The pathway
              </h2>
              <span className="text-xs text-muted">Started a step in the period · then started the next step</span>
            </header>
            <motion.ol variants={stagger(0.03)} className="space-y-2.5">
              {d.steps.map((s) => {
                const worst = d.insight?.from === s.label;
                return (
                  <motion.li key={s.step} variants={fadeUp} className={cn("rounded-2xl border bg-white p-4 shadow-card", worst ? "border-gold-400 border-l-4" : "border-white")}>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <p className="flex items-center gap-2.5">
                        <span className="grid size-6 place-items-center rounded-full bg-cream-200 text-xs font-bold text-muted tabular">{s.step}</span>
                        <span className="font-bold text-ink">{s.label}</span>
                        {worst ? <Chip tone="gold">Biggest drop</Chip> : null}
                      </p>
                      {s.hidden ? (
                        <span className="text-xs text-muted">Fewer than 5 people: not shown</span>
                      ) : !s.started ? (
                        <span className="text-xs text-muted">Nobody started it in this period</span>
                      ) : (
                        <p className="flex flex-wrap items-center gap-x-4 text-sm text-muted">
                          <span>
                            Started <span className="font-bold text-ink tabular">{s.started}</span>
                          </span>
                          {s.movedOn !== null ? (
                            <span>
                              Moved on <span className="font-bold text-ink tabular">{s.movedOn}</span>
                            </span>
                          ) : (
                            <span>{s.step === 7 ? "The last step" : "Nobody has started the next step yet"}</span>
                          )}
                          {s.rate !== null ? <Chip tone={worst ? "gold" : "neutral"}>{s.rate}% continued</Chip> : null}
                        </p>
                      )}
                    </div>
                    {s.rate !== null ? (
                      <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-cream-300" aria-hidden>
                        <span className={cn("block h-full rounded-full", worst ? "bg-maroon-600" : "bg-gold-600")} style={{ width: `${s.rate}%` }} />
                      </span>
                    ) : null}
                  </motion.li>
                );
              })}
            </motion.ol>
          </section>

          <section aria-labelledby="fu-h" className="space-y-3">
            <header>
              <h2 id="fu-h" className="font-display text-xl font-semibold text-maroon-950">
                Follow-ups this week
              </h2>
              <p className="text-sm text-muted">Contact lists for a natural pause in someone's walk. One person, one call.</p>
            </header>
            {d.followUps.length ? (
              <ul className="space-y-2.5">
                {d.followUps.map((f) => (
                  <li key={f.id} className="flex flex-col gap-2 rounded-2xl border border-white bg-white p-4 shadow-card sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">{f.title}</span>
                      <span className="block text-xs text-muted">{f.detail}</span>
                    </span>
                    {d.can.copy ? (
                      <button
                        type="button"
                        onClick={() => void copy(f.id, f.names)}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-xl px-3 text-sm font-bold text-maroon-700 hover:bg-maroon-100/60 sm:self-center"
                      >
                        <Copy className="size-4" aria-hidden />
                        Copy list
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Card>
                <EmptyState icon={<Heart />} title="Nobody to follow up this week">
                  Lists show here when people finish a step and don't start the next, or go quiet in a class.
                </EmptyState>
              </Card>
            )}
          </section>
        </>
      )}
    </motion.div>
  );
}
