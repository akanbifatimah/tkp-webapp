import { Check, Copy, Eye, MessageCircle, MessageSquareText, Phone, SquarePen } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { TEAM_LABEL, type Team } from "@/lib/permissions";
import { STEPS, type Phase } from "./model";
import { fillScript, phoneDigits, scriptLines, waNumber, type ScriptTokens } from "./rules";
import type { Script } from "./scripts";

/* ----------------------------------------------------------------- team switch */

/** Church Office / Integration Team. Shown only to roles that can open both (UI-C1). */
export function TeamSwitch({ teams, value, onChange, id }: { teams: Team[]; value: Team; onChange: (t: Team) => void; id: string }) {
  if (teams.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Team" className="inline-flex rounded-2xl border border-line bg-white p-1 shadow-card">
      {teams.map((t) => {
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t)}
            className={cn("relative h-9 rounded-xl px-4 text-sm font-bold transition-colors", on ? "text-cream-50" : "text-muted hover:text-ink")}
          >
            {on ? <motion.span layoutId={`team-${id}`} className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
            <span className="relative">{TEAM_LABEL[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- chips and dots */

/** Phases are charcoal; told apart by label (design guide §2.4). */
export function PhaseChip({ phase, week }: { phase: Phase; week?: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-phase-soft px-2.5 py-1 text-xs leading-none font-bold whitespace-nowrap text-phase">
      Phase {phase}
      {week ? ` · wk ${week}` : ""}
    </span>
  );
}

const CELL_TONE: Record<string, string> = {
  Red: "bg-cell-red",
  Yellow: "bg-cell-yellow",
  Blue: "bg-cell-blue",
  Green: "bg-cell-green",
};
export function CellDot({ cell }: { cell: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
      <span className={cn("size-2 rounded-full", CELL_TONE[cell] ?? "bg-cell-na")} aria-hidden />
      {cell === "N/A" ? "No cell" : cell}
    </span>
  );
}

/** Checklist progress for the current phase. */
export function ProgressDots({ phase, done }: { phase: Phase; done: number }) {
  const total = STEPS[phase].length;
  return (
    <span className="inline-flex items-center gap-1" title={`Phase ${phase} checklist: ${done} of ${total}`} aria-label={`Phase ${phase} checklist: ${done} of ${total} done`}>
      {STEPS[phase].map((s, i) => (
        <motion.i
          key={s.key}
          initial={false}
          animate={{ scale: i < done ? 1 : 0.85 }}
          className={cn("block size-2 rounded-full", i < done ? "bg-ok" : "bg-line")}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------- contact actions */

/**
 * Call · Text · WhatsApp · Log (FI-55). Active only for your own guests; for
 * whole-team viewers 👁 Log opens other people's guests view only.
 */
export function ContactActions({
  phone,
  mine,
  logHref,
  viewOnlyLog,
  size = "md",
}: {
  phone: string | null;
  mine: boolean;
  logHref: string;
  viewOnlyLog: boolean;
  size?: "sm" | "md";
}) {
  const d = phoneDigits(phone);
  const base = cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border font-bold transition-colors",
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-[13px]",
  );
  const on = "border-line bg-white text-ink hover:border-maroon-200 hover:bg-cream-50";
  const off = "border-line/70 bg-cream-50 text-muted/50";
  const offReason = "Assigned to someone else. Only they can call and log.";

  const action = (label: string, icon: ReactNode, href: string | null, external?: boolean) =>
    mine && href ? (
      <a href={href} className={cn(base, on)} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {icon}
        <span className="max-sm:sr-only">{label}</span>
      </a>
    ) : (
      <Tooltip label={!mine ? offReason : "No phone number"}>
        <span className={cn(base, off)} aria-disabled="true">
          {icon}
          <span className="max-sm:sr-only">{label}</span>
        </span>
      </Tooltip>
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {action("Call", <Phone className="size-3.5" aria-hidden />, d ? `tel:${d}` : null)}
      {action("Text", <MessageSquareText className="size-3.5" aria-hidden />, d ? `sms:${d}` : null)}
      {action("WhatsApp", <MessageCircle className="size-3.5" aria-hidden />, d ? `https://wa.me/${waNumber(phone)}` : null, true)}
      {mine ? (
        <Link to={logHref} className={cn(base, "border-ink bg-ink text-cream-50 hover:bg-maroon-900")}>
          <SquarePen className="size-3.5" aria-hidden />
          Log
        </Link>
      ) : viewOnlyLog ? (
        <Link to={logHref} className={cn(base, on)} title="View only">
          <Eye className="size-3.5" aria-hidden />
          Log
        </Link>
      ) : (
        <Tooltip label="Not assigned to you">
          <span className={cn(base, off)} aria-disabled="true">
            <SquarePen className="size-3.5" aria-hidden />
            Log
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- option buttons */

/** Single choice: a rounded rectangle with a radio circle that fills (design guide §4). Clicking again clears it. */
export function OptionGroup({
  label,
  options,
  value,
  onChange,
  disabled,
  name,
}: {
  label?: ReactNode;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  name: string;
}) {
  return (
    <fieldset className="min-w-0">
      {label ? <legend className="mb-2 text-sm font-bold text-ink">{label}</legend> : null}
      <div role="radiogroup" aria-label={typeof label === "string" ? label : name} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(on ? "" : o)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[14px] font-semibold transition-[background-color,border-color,color] duration-150",
                on ? "border-maroon-700 bg-maroon-100/60 text-maroon-900" : "border-line bg-white text-ink hover:border-maroon-200",
                "disabled:opacity-60 disabled:hover:border-line",
              )}
            >
              <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors", on ? "border-maroon-700" : "border-muted/40")}>
                <motion.span initial={false} animate={{ scale: on ? 1 : 0 }} transition={{ type: "spring", stiffness: 600, damping: 30 }} className="size-2 rounded-full bg-maroon-700" />
              </span>
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Multi-select: checkbox squares; a ticked box shows a white ✓ on a filled square. */
export function MultiOption({ label, checked, disabled, onToggle }: { label: string; checked: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[14px] font-semibold transition-[background-color,border-color,opacity] duration-150",
        checked ? "border-maroon-700 bg-maroon-100/60 text-maroon-900" : "border-line bg-white text-ink hover:border-maroon-200",
        "disabled:opacity-45 disabled:hover:border-line",
      )}
    >
      <span className={cn("grid size-4 shrink-0 place-items-center rounded-[5px] border-2 transition-colors", checked ? "border-maroon-700 bg-maroon-700" : "border-muted/40 bg-white")}>
        <motion.span initial={false} animate={{ scale: checked ? 1 : 0 }} transition={{ type: "spring", stiffness: 600, damping: 28 }}>
          <Check className="size-2.5 text-white" strokeWidth={4} aria-hidden />
        </motion.span>
      </span>
      {label}
    </button>
  );
}

/* ----------------------------------------------------------------- scripts */

/** One script: gold placeholders, orange-italic caller instructions, and the share buttons (FI-68). */
export function ScriptBody({ body, tokens }: { body: string; tokens?: Partial<ScriptTokens> }) {
  return (
    <div className="space-y-0.5 text-[14px] leading-relaxed text-ink">
      {scriptLines(body, tokens).map((line, i) =>
        line.pieces.length === 0 ? (
          <div key={i} className="h-2.5" aria-hidden />
        ) : (
          <p key={i} className={cn(line.direction && "text-[#b4410e] italic")}>
            {line.pieces.map((p, j) =>
              p.token ? (
                <span key={j} className={cn("rounded-md px-1 font-bold", p.token === "filled" ? "bg-gold-100 text-gold-800" : "bg-gold-100/60 text-gold-600")}>
                  {p.text}
                </span>
              ) : (
                <span key={j}>{p.text}</span>
              ),
            )}
          </p>
        ),
      )}
    </div>
  );
}

export function ScriptButtons({
  body,
  tokens,
  phone,
  enabled,
  callDisabledReason,
}: {
  body: string;
  tokens?: Partial<ScriptTokens>;
  phone: string | null;
  /** Share buttons work only for your own guest (and on the Scripts tab without a number). */
  enabled: boolean;
  callDisabledReason?: string;
}) {
  const toast = useToast();
  const text = fillScript(body, tokens ?? {});
  const t = encodeURIComponent(text);
  const d = phoneDigits(phone);
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors";
  const on = "border-line bg-white text-ink hover:border-maroon-200 hover:bg-cream-50";
  const off = "border-line/70 bg-cream-50 text-muted/50";

  const link = (label: string, icon: ReactNode, href: string | null, reason: string, external = false) =>
    enabled && href ? (
      <a href={href} className={cn(btn, on)} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {icon}
        {label}
      </a>
    ) : (
      <Tooltip label={reason}>
        <span className={cn(btn, off)} aria-disabled="true">
          {icon}
          {label}
        </span>
      </Tooltip>
    );

  const noGuest = callDisabledReason ?? "Only for your own guest";
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(
            () => toast.show("Script copied"),
            () => toast.show("Could not copy. Select the text instead.", { tone: "crit" }),
          );
        }}
        className={cn(btn, "border-ink bg-ink text-cream-50 hover:bg-maroon-900")}
      >
        <Copy className="size-3.5" aria-hidden />
        Copy
      </button>
      {link("Open in WhatsApp", <MessageCircle className="size-3.5" aria-hidden />, d ? `https://wa.me/${waNumber(phone)}?text=${t}` : `https://wa.me/?text=${t}`, noGuest, true)}
      {link("Open in Messages", <MessageSquareText className="size-3.5" aria-hidden />, d ? `sms:${d}?&body=${t}` : `sms:?&body=${t}`, noGuest)}
      {link("Call", <Phone className="size-3.5" aria-hidden />, d ? `tel:${d}` : null, callDisabledReason ?? (d ? noGuest : "No phone number"))}
    </div>
  );
}

export function ScriptMeta({ script }: { script: Script }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {script.channel ? <span className="rounded-full bg-maroon-100 px-2 py-0.5 text-[11px] font-bold text-maroon-700">{script.channel}</span> : null}
      {script.phase ? <PhaseChip phase={script.phase} /> : null}
    </span>
  );
}
