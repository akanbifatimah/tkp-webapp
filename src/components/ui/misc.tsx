import { ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { fadeUp } from "@/lib/motion";

/** White card from the Figma dashboard. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.section variants={fadeUp} className={cn("rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6", className)}>
      {children}
    </motion.section>
  );
}

/** Loading placeholder: skeletons instead of spinners. */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("skeleton block rounded-lg", className)} aria-hidden />;
}

/** Exact wording, TKP Connect UI-G8. */
export const CONFIDENTIAL_TEXT = "Guest details are confidential · every search is logged";

export function ConfidentialChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-100 px-3 py-1.5 text-xs font-bold text-gold-800",
        className,
      )}
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      {CONFIDENTIAL_TEXT}
    </span>
  );
}

/** Empty state with a helpful sentence (UI-G4). */
export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-cream-200 text-maroon-700 [&_svg]:size-6" aria-hidden>
          {icon}
        </span>
      ) : null}
      <p className="font-display text-lg font-semibold text-maroon-900">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

/** Error banner with the API's message (UI-G4). */
export function ErrorBanner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-semibold text-crit">
      <span>{children}</span>
      {action}
    </div>
  );
}

/** Page title block (Figma: navy heading, warm subtitle, actions on the right). */
export function PageHeader({
  eyebrow,
  title,
  tagline,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  tagline?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <motion.header variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-extrabold tracking-[0.18em] text-gold-600 uppercase">{eyebrow}</p> : null}
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-navy-900 sm:text-[34px]">{title}</h1>
        {tagline ? <p className="mt-1 text-[15px] text-muted italic">{tagline}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.header>
  );
}
