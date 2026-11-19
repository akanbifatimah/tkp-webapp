import { Eye, SquarePen } from "lucide-react";
import { Link } from "react-router";
import { Chip } from "@/components/ui/Chip";
import { useAuth } from "@/features/auth/auth";
import { cn } from "@/lib/cn";
import { RATINGS } from "./model";

/** Small pieces shared by Guest lookup, the drawer and View entry. */

export function CellChip({ cell }: { cell: string }) {
  const tone = ({ Red: "cell-red", Yellow: "cell-yellow", Blue: "cell-blue", Green: "cell-green" } as const)[cell as "Red"];
  return <Chip tone={tone ?? "cell-na"}>{tone ? cell : "N/A"}</Chip>;
}

export function MemberChip({ value }: { value: string | null }) {
  if (value === "Yes") return <Chip tone="ok">Yes</Chip>;
  if (value === "Undecided") return <Chip tone="gold">Undecided</Chip>;
  if (value === "No") return <Chip>No</Chip>;
  return <span className="text-muted">—</span>;
}

/**
 * ✎ Log follow-up: opens Connect › Log follow-up for that person. Shown only
 * to people who can open Connect, so it never leads to Access Denied.
 */
export function LogFollowUpLink({ connectId, size = "md" }: { connectId: number | null | undefined; size?: "sm" | "md" }) {
  const { has } = useAuth();
  if (!has("connect.log.view")) return null;
  const href = connectId ? `/connect/log/${connectId}` : "/connect/queue";
  return (
    <Link
      to={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-linear-to-br from-gold-300 via-gold-500 to-gold-600 font-extrabold text-maroon-950 shadow-glow transition-[filter,translate] hover:-translate-y-px hover:brightness-105",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-4 text-sm",
      )}
      title="Log a follow-up in Connect"
    >
      <SquarePen className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
      Log follow-up
    </Link>
  );
}

export function ViewEntryButton({ onClick, size = "md" }: { onClick: () => void; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="The guest form as submitted"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gold-300 bg-linear-to-b from-white to-gold-100 font-extrabold text-maroon-900 transition-[translate,box-shadow] hover:-translate-y-px hover:shadow-card",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-4 text-sm",
      )}
    >
      <Eye className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
      View entry
    </button>
  );
}

/** The 8 ratings as bars; 0–5 shown in red (TKP Connect View entry). */
export function RatingBars({ ratings }: { ratings: Record<string, number | null> }) {
  return (
    <div className="grid gap-2">
      {RATINGS.map((r) => {
        const v = ratings[r.key] ?? null;
        return (
          <div key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="truncate font-semibold text-ink">
              <span aria-hidden>{r.icon}</span> {r.label}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-cream-200">
              <span className={cn("block h-full rounded-full transition-[width] duration-500", v !== null && v <= 5 ? "bg-crit" : "bg-maroon-600")} style={{ width: `${v === null ? 0 : v * 10}%` }} />
            </span>
            <b className="text-right tabular">{v ?? <span className="font-semibold text-muted">—</span>}</b>
          </div>
        );
      })}
    </div>
  );
}
