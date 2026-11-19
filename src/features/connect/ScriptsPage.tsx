import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ConfidentialChip, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { CONNECT_TAGLINE, stepLabel } from "./model";
import { ScriptBody, ScriptButtons, ScriptMeta } from "./parts";
import { SCRIPTS } from "./scripts";

/**
 * TKP Connect UI-C3 · Scripts: one read-only library of the 15 approved scripts
 * (FI-69). No editing in the app: wording changes go through the Tech Admin.
 */
const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "co", label: "Church office", test: (s: (typeof SCRIPTS)[number]) => s.team === "church_office" },
  { id: "p1", label: "Phase 1", test: (s: (typeof SCRIPTS)[number]) => s.phase === 1 },
  { id: "p2", label: "Phase 2", test: (s: (typeof SCRIPTS)[number]) => s.phase === 2 },
  { id: "p3", label: "Phase 3", test: (s: (typeof SCRIPTS)[number]) => s.phase === 3 },
] as const;

export function ScriptsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const active = FILTERS.find((f) => f.id === filter)!;
  const list = SCRIPTS.filter(active.test);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="2 · Connect" title="Scripts" tagline={CONNECT_TAGLINE} actions={<ConfidentialChip />} />

      <motion.div variants={fadeUp} className="flex flex-wrap gap-2" role="radiogroup" aria-label="Show scripts for">
        {FILTERS.map((f) => {
          const on = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFilter(f.id)}
              className={cn("relative inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-bold transition-colors", on ? "border-ink text-cream-50" : "border-line bg-white text-ink hover:border-maroon-200")}
            >
              {on ? <motion.span layoutId="script-filter" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
              <span className="relative">{f.label}</span>
              <span className={cn("relative rounded-full px-1.5 text-[11px] tabular", on ? "bg-white/20" : "bg-cream-200")}>{SCRIPTS.filter(f.test).length}</span>
            </button>
          );
        })}
      </motion.div>

      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-white px-4 py-3 text-[13px] text-muted">
        <span className="font-extrabold tracking-wide text-ink uppercase">Legend</span>
        <span>
          <span className="rounded-md bg-gold-100 px-1 font-bold text-gold-800">[Name]</span> <span className="rounded-md bg-gold-100 px-1 font-bold text-gold-800">[Your Name]</span>{" "}
          <span className="rounded-md bg-gold-100 px-1 font-bold text-gold-800">[Day]</span> are filled in on Log follow-up
        </span>
        <span>
          <span className="rounded-md bg-gold-100/60 px-1 font-bold text-gold-600">[Department]</span> <span className="rounded-md bg-gold-100/60 px-1 font-bold text-gold-600">[Cell Group]</span> you fill in by hand
        </span>
        <span className="text-[#b4410e] italic">Orange italic lines are instructions to the caller</span>
      </motion.div>

      <motion.ul key={filter} variants={stagger(0.04)} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {list.map((s) => (
            <motion.li key={s.id} layout variants={fadeUp} className="flex flex-col rounded-3xl border border-white bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-display text-lg leading-snug font-semibold text-maroon-900">{s.title}</h2>
                <ScriptMeta script={s} />
              </div>
              <p className="mt-1 text-xs font-semibold text-muted">
                {s.team === "church_office" ? "Church office" : "Integration Team"}
                {s.stepKey ? ` · serves: ${stepLabel(s.stepKey)}` : ""}
              </p>
              <div className="mt-4 flex-1 rounded-2xl bg-cream-50 p-4">
                <ScriptBody body={s.body} />
              </div>
              <ScriptButtons body={s.body} phone={null} enabled callDisabledReason="No guest is selected on this page" />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </motion.div>
  );
}
