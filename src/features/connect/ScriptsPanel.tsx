import { BookOpenText, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";
import { PHASES, type Phase, type Team } from "./model";
import { ScriptBody, ScriptButtons, ScriptMeta } from "./parts";
import type { ScriptTokens } from "./rules";
import { SCRIPTS, type Script } from "./scripts";

/**
 * Scripts beside the Log follow-up form (UI-C2, FI-68). Church Office: the 4
 * welcome-call scripts. Integration: grouped by phase, the selected phase open.
 * Collapsible on desktop; below the form on phones.
 */
export function ScriptsPanel({
  team,
  phase,
  onPhase,
  tokens,
  phone,
  canShare,
}: {
  team: Team;
  phase: Phase;
  onPhase: (p: Phase) => void;
  tokens: ScriptTokens;
  phone: string | null;
  canShare: boolean;
}) {
  const [open, setOpen] = useState(true);
  const co = team === "church_office";

  return (
    <section className="rounded-3xl border border-white bg-white shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span>
          <span className="block text-xs font-extrabold tracking-[0.14em] text-gold-600 uppercase">Scripts · {co ? "Church office" : "Integration Team"}</span>
          <span className="block font-display text-lg font-semibold text-maroon-900">{co ? "For this guest" : "By phase"}</span>
        </span>
        <ChevronDown className={cn("size-5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-line px-3 py-3 sm:px-4">
              {co ? (
                <ScriptList scripts={SCRIPTS.filter((s) => s.team === "church_office")} tokens={tokens} phone={phone} canShare={canShare} />
              ) : (
                PHASES.map((p) => {
                  const list = SCRIPTS.filter((s) => s.phase === p.phase);
                  const on = p.phase === phase;
                  return (
                    <div key={p.phase} className={cn("rounded-2xl border", on ? "border-maroon-200 bg-cream-50" : "border-line")}>
                      <button
                        type="button"
                        onClick={() => onPhase(p.phase)}
                        aria-expanded={on}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                      >
                        <span className="text-sm font-bold text-ink">
                          {p.label} <span className="font-semibold text-muted">· {p.weeks} · {list.length} scripts</span>
                        </span>
                        <ChevronDown className={cn("size-4 text-muted transition-transform", on && "rotate-180")} aria-hidden />
                      </button>
                      <AnimatePresence initial={false}>
                        {on ? (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                            <div className="px-2 pb-2">
                              <ScriptList scripts={list} tokens={tokens} phone={phone} canShare={canShare} />
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
              <p className="flex items-start gap-2 px-1 text-xs text-muted">
                <BookOpenText className="mt-px size-3.5 shrink-0 text-gold-600" aria-hidden />
                <span>
                  {co
                    ? "Gold words are filled in from the guest’s record and your name. Check before sending."
                    : "Words in gold are filled in from the guest’s record and your name; bracketed ones you fill in. Script text is from the integration SOP."}{" "}
                  <Link to="/connect/scripts" className="font-bold text-maroon-700 hover:underline">
                    All scripts
                  </Link>
                </span>
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function ScriptList({ scripts, tokens, phone, canShare }: { scripts: Script[]; tokens: ScriptTokens; phone: string | null; canShare: boolean }) {
  const [openId, setOpenId] = useState<string | null>(scripts[0]?.id ?? null);
  return (
    <ul className="space-y-2">
      {scripts.map((s) => {
        const on = openId === s.id;
        return (
          <li key={s.id} className="rounded-xl border border-line bg-white">
            <button
              type="button"
              onClick={() => setOpenId(on ? null : s.id)}
              aria-expanded={on}
              className="flex w-full items-start justify-between gap-2 px-3.5 py-3 text-left"
            >
              <span className="text-[14px] font-bold text-ink">{s.title}</span>
              <span className="flex items-center gap-2">
                <ScriptMeta script={{ ...s, phase: null }} />
                <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", on && "rotate-180")} aria-hidden />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {on ? (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="border-t border-line px-3.5 pt-3 pb-3.5">
                    <ScriptBody body={s.body} tokens={tokens} />
                    <ScriptButtons body={s.body} tokens={tokens} phone={phone} enabled={canShare} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
