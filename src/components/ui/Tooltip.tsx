import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Small hover/focus tooltip. Wraps disabled controls in a focusable span so
 * keyboard users can still read why a control is disabled.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn("group/tt relative inline-flex", className)} tabIndex={0} aria-describedby={id}>
      {children}
      <span
        role="tooltip"
        id={id}
        className={cn(
          // Hidden tooltips take no layout space, so they can't widen the page on phones.
          "pointer-events-none absolute left-1/2 z-50 hidden w-max max-w-60 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-center text-xs font-semibold text-cream-50 shadow-lift",
          "group-hover/tt:block group-focus-visible/tt:block",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {label}
      </span>
    </span>
  );
}
