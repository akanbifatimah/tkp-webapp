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
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-60 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-center text-xs font-semibold text-cream-50 opacity-0 shadow-lift transition-[opacity,translate] duration-150",
          "group-hover/tt:opacity-100 group-focus-visible/tt:opacity-100",
          side === "top" ? "bottom-full mb-2 translate-y-1 group-hover/tt:translate-y-0" : "top-full mt-2 -translate-y-1 group-hover/tt:translate-y-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}
