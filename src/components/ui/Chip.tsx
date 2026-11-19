import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Pill chips. Tones carry TKP Connect's meanings:
 * ok / warn / crit = status, phase = charcoal (told apart by label), cell-* = cell-group data colours.
 */
export type ChipTone =
  | "neutral"
  | "ok"
  | "warn"
  | "crit"
  | "phase"
  | "gold"
  | "maroon"
  | "cell-red"
  | "cell-yellow"
  | "cell-blue"
  | "cell-green"
  | "cell-na";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-cream-200 text-muted",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  crit: "bg-crit-soft text-crit",
  phase: "bg-phase-soft text-phase",
  gold: "bg-gold-100 text-gold-800",
  maroon: "bg-maroon-100 text-maroon-700",
  "cell-red": "bg-cell-red/12 text-cell-red",
  "cell-yellow": "bg-cell-yellow/18 text-gold-800",
  "cell-blue": "bg-cell-blue/12 text-cell-blue",
  "cell-green": "bg-cell-green/12 text-cell-green",
  "cell-na": "bg-cell-na/15 text-muted",
};

const DOT: Partial<Record<ChipTone, string>> = {
  "cell-red": "bg-cell-red",
  "cell-yellow": "bg-cell-yellow",
  "cell-blue": "bg-cell-blue",
  "cell-green": "bg-cell-green",
  "cell-na": "bg-cell-na",
};

export function Chip({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none font-bold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {DOT[tone] ? <span className={cn("size-2 rounded-full", DOT[tone])} aria-hidden /> : icon}
      {children}
    </span>
  );
}
