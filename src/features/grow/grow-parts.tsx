import { Check } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, stepLabel, type CourseStatus, type PublishCheck } from "./grow-types";

/** Small pieces shared by the Grow screens. */

const STATUS_TONE: Record<CourseStatus, ChipTone> = {
  draft: "neutral",
  open: "maroon",
  in_session: "gold",
  completed: "ok",
  archived: "neutral",
};

export function CourseStatusChip({ status }: { status: CourseStatus }) {
  return (
    <Chip tone={STATUS_TONE[status]} icon={status === "completed" ? <Check className="size-3" aria-hidden /> : undefined}>
      {STATUS_LABEL[status]}
    </Chip>
  );
}

/** "Step 4 · Growth" with the gold dot from the Figma class list. */
export function StepTag({ step, className }: { step: number | null; className?: string }) {
  if (!step) return <span className={cn("text-sm text-muted", className)}>Not on the pathway</span>;
  return (
    <span className={cn("text-sm text-ink", className)}>
      <span className="mr-1.5 inline-block size-1.5 rounded-full bg-gold-500 align-middle" aria-hidden />
      <span className="font-bold whitespace-nowrap">Step {step}:</span> <span className="text-muted">{stepLabel(step)}</span>
    </span>
  );
}

/** Enrolled against seats, as a thin bar (Figma class list). */
export function SeatsBar({ enrolled, seats, waitlisted = 0, className }: { enrolled: number; seats: number | null; waitlisted?: number; className?: string }) {
  const pct = seats ? Math.min(100, Math.round((enrolled / seats) * 100)) : 100;
  const full = seats !== null && enrolled >= seats;
  return (
    <div className={cn("min-w-28", className)}>
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold text-ink tabular">{enrolled}</span>
        <span className="text-xs text-muted tabular">{seats === null ? "no limit" : `/ ${seats} seats`}</span>
      </p>
      <span
        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-cream-300"
        role="meter"
        aria-label="Seats taken"
        aria-valuemin={0}
        aria-valuemax={seats ?? enrolled}
        aria-valuenow={enrolled}
      >
        <span className={cn("block h-full rounded-full", seats === null ? "bg-line" : full ? "bg-maroon-600" : "bg-gold-600")} style={{ width: `${pct}%` }} />
      </span>
      {waitlisted ? <p className="mt-1 text-xs font-bold text-maroon-700">{waitlisted} waiting</p> : null}
    </div>
  );
}

export function ChecksList({ checks }: { checks: PublishCheck[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", c.ok ? "bg-ok-soft text-ok" : "border-2 border-dashed border-line")}
            aria-hidden
          >
            {c.ok ? <Check className="size-3" /> : null}
          </span>
          <span className={c.ok ? "text-muted" : "font-semibold text-ink"}>
            {c.label}
            <span className="sr-only">{c.ok ? " (done)" : " (to do)"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export const fileSize = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
