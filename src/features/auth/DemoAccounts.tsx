import { ChevronDown, FlaskConical } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { ROLE_LABEL } from "@/lib/permissions";
import { DEMO_PASSWORD, STAFF } from "@/mocks/seed/staff";

/**
 * Mock mode only: one click fills in a fictional account for any role, so
 * every cell of the access matrix can be tried. Never shown against the real API.
 */
export function DemoAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-gold-400 bg-gold-100/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[13px] font-extrabold text-gold-800"
      >
        <span className="flex items-center gap-2">
          <FlaskConical className="size-4" aria-hidden />
          Demo accounts (mock data)
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="grid max-h-64 gap-1 overflow-y-auto px-2 pb-2"
          >
            {STAFF.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s.email, DEMO_PASSWORD)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-white"
                >
                  <span className="font-bold text-ink">{s.fullName}</span>
                  <span className="text-right text-xs font-semibold text-muted">
                    {s.roles.map((r) => ROLE_LABEL[r]).join(" + ")}
                    {s.isActive ? "" : " · inactive"}
                    {s.mustChangePassword ? " · temporary password" : ""}
                    {!s.connectTeam && (s.roles.includes("integration_team") || s.roles.includes("church_office")) ? " · no team" : ""}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
      <p className="px-4 pb-3 text-xs text-gold-800/80">
        Password for every demo account: <code className="font-bold">{DEMO_PASSWORD}</code>
      </p>
    </div>
  );
}
