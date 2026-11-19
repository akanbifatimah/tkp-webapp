import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fadeUp } from "@/lib/motion";
import { CountUp } from "./CountUp";

/**
 * KPI tile (Figma "TKP Hub" dashboard tiles). Big number in the display font,
 * a label, and a small line beneath. TKP Connect: critical tiles use the critical tint;
 * tiles that filter a list are buttons.
 */
type Accent = "teal" | "blue" | "rose" | "gold" | "maroon" | "phase";

const ACCENT: Record<Accent, string> = {
  teal: "bg-[#d6f3ee] text-[#167a6b]",
  blue: "bg-[#e3ecfd] text-[#3563c9]",
  rose: "bg-[#fde2e2] text-[#c23b3b]",
  gold: "bg-gold-100 text-gold-800",
  maroon: "bg-maroon-100 text-maroon-700",
  phase: "bg-phase-soft text-phase",
};

export type TileProps = {
  label: string;
  value: number;
  format?: (n: number) => string;
  icon?: ReactNode;
  accent?: Accent;
  hint?: ReactNode;
  critical?: boolean;
  selected?: boolean;
  onClick?: () => void;
};

export function Tile({ label, value, format, icon, accent = "maroon", hint, critical, selected, onClick }: TileProps) {
  const body = (
    <>
      {icon ? (
        <span className={cn("mb-4 grid size-11 place-items-center rounded-xl [&_svg]:size-5", ACCENT[accent])} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className={cn("block text-sm font-semibold", critical ? "text-crit" : "text-muted")}>{label}</span>
      <span
        className={cn(
          "mt-1 block font-display text-[34px] leading-tight font-semibold tracking-tight",
          critical ? "text-crit" : "text-maroon-900",
        )}
      >
        <CountUp value={value} format={format} />
      </span>
      {hint ? <span className="mt-1 block text-xs font-semibold text-muted">{hint}</span> : null}
    </>
  );

  const classes = cn(
    "relative block w-full rounded-2xl border p-5 text-left shadow-card transition-[box-shadow,border-color,translate] duration-200",
    critical ? "border-crit/20 bg-crit-soft" : "border-white bg-white",
    onClick && "hover:-translate-y-0.5 hover:shadow-lift",
    selected && "border-maroon-700 ring-2 ring-maroon-700/15",
  );

  return (
    <motion.div variants={fadeUp}>
      {onClick ? (
        <button type="button" onClick={onClick} aria-pressed={selected} className={classes}>
          {body}
        </button>
      ) : (
        <div className={classes}>{body}</div>
      )}
    </motion.div>
  );
}
