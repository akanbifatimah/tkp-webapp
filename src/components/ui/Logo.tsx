import { cn } from "@/lib/cn";

/** TKP crest + wordmark, as on the Figma sidebar. */
export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cream-50 shadow-[0_6px_18px_-6px_rgb(0_0_0/0.5)]">
        <img src="/tkp-logo.png" alt="" width={30} height={33} className="h-8 w-auto" />
      </span>
      {compact ? null : (
        <span className="leading-tight">
          <span className="block font-display text-lg font-semibold text-cream-50">TKP Hub</span>
          <span className="block text-[10px] font-bold tracking-[0.12em] whitespace-nowrap text-gold-300/80 uppercase">The King's Palace · RCCG</span>
        </span>
      )}
    </span>
  );
}
