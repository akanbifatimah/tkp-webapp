import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { ROLE_LABEL, type ConnectTeam, type Role } from "@/lib/permissions";
import type { UserStatus } from "./types";

/** Small building blocks shared by the Admin pages. */

export const inputClass = (invalid = false) =>
  cn(
    "h-11 w-full min-w-0 rounded-xl border bg-white px-3.5 text-sm text-ink transition-[border-color,box-shadow] outline-none placeholder:text-muted/60",
    "focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10 disabled:bg-cream-200",
    invalid ? "border-crit" : "border-line",
  );

export const selectClass = (active = false) =>
  cn("h-11 w-full min-w-0 rounded-xl border bg-white px-3 text-sm font-semibold text-ink", active ? "border-maroon-600" : "border-line");

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-bold text-crit" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const STATUS: Record<UserStatus, { label: string; tone: ChipTone }> = {
  active: { label: "Active", tone: "ok" },
  temporary: { label: "Temporary password", tone: "warn" },
  deactivated: { label: "Deactivated", tone: "neutral" },
};

export function StatusChip({ status }: { status: UserStatus }) {
  return <Chip tone={STATUS[status].tone}>{STATUS[status].label}</Chip>;
}

export function RoleChips({ roles }: { roles: Role[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Chip key={r} tone={r === "tech_admin" ? "maroon" : "neutral"}>
          {ROLE_LABEL[r]}
        </Chip>
      ))}
    </span>
  );
}

export const TEAM_NAME: Record<ConnectTeam, string> = {
  church_office: "Church Office",
  integration: "Integration Team",
  both: "Both teams",
};

export function Initials({ name, muted }: { name: string; muted?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold",
        muted ? "bg-cream-300 text-muted" : "bg-linear-to-br from-gold-300 to-gold-600 text-maroon-950",
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Page through a server-paged list. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "grid size-9 place-items-center rounded-xl border border-line bg-white text-maroon-700 hover:bg-cream-50 disabled:opacity-40";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 px-1 pt-4 text-sm">
      <span className="font-semibold text-muted tabular">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <span className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-bold text-ink tabular">
          {page} / {pages}
        </span>
        <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </span>
    </nav>
  );
}

/** A small icon button for row actions. */
export function IconAction({
  label,
  icon,
  onClick,
  disabled,
  reason,
  tone,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  reason?: string;
  tone?: "crit" | "ok";
}) {
  const button = (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={disabled ? undefined : label}
        className={cn(
          "grid size-9 place-items-center rounded-xl text-muted transition-colors disabled:opacity-35 [&_svg]:size-4.5",
          tone === "crit" ? "hover:bg-crit-soft hover:text-crit" : tone === "ok" ? "hover:bg-ok-soft hover:text-ok" : "hover:bg-cream-200 hover:text-maroon-700",
        )}
      >
        {icon}
    </button>
  );
  // A disabled control says why, in a tooltip keyboard users can reach too.
  return disabled && reason ? <Tooltip label={reason}>{button}</Tooltip> : button;
}
