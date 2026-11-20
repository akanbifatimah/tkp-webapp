import { ChevronDown, Lock, ScrollText, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { ROLE_LABEL, type ConnectTeam, type Role } from "@/lib/permissions";
import { formatDay, formatTime } from "@/lib/time";
import { CATEGORIES, FIELD_LABEL, actionLabel, actionTone } from "./audit-labels";
import { Pager, TEAM_NAME, selectClass } from "./parts";
import { useAudit } from "./queries";
import type { AuditCategory, AuditEntry } from "./types";

/**
 * Admin › Audit log (PRD F-5, SA-3). Read-only and immutable: sign-ins, guest
 * searches and views, assignments, saves, exports and admin changes, with old
 * and new values. Tech Admin and Tech Team.
 */
const PAGE_SIZE = 50;

export function AuditPage() {
  const [q, setQ] = useState("");
  const [actorId, setActorId] = useState("");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const audit = useAudit({ q, actorId, category, from, to, page, pageSize: PAGE_SIZE });
  const d = audit.data;
  const filtered = !!(q || actorId || category || from || to);

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const clear = () => {
    setQ("");
    setActorId("");
    setCategory("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        tagline="Who did what, and when. Times are church time (Katy, Texas)."
        actions={
          <Chip tone="neutral" icon={<Lock className="size-3" aria-hidden />}>
            Read-only{d ? ` · kept ${Math.round(d.retentionDays / 365)} ${Math.round(d.retentionDays / 365) === 1 ? "year" : "years"}` : ""}
          </Chip>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr]">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => set(setQ)(e.target.value)}
              placeholder="Search action, person or record"
              className="h-11 w-full rounded-xl border border-line bg-white pr-4 pl-10.5 text-sm outline-none focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10"
            />
          </label>
          <label className="block">
            <span className="sr-only">Who</span>
            <select value={actorId} onChange={(e) => set(setActorId)(e.target.value)} className={selectClass(!!actorId)}>
              <option value="">Everyone</option>
              {d?.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Kind of action</span>
            <select value={category} onChange={(e) => set(setCategory)(e.target.value as AuditCategory | "")} className={selectClass(!!category)}>
              <option value="">Every action</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase xl:sr-only">From</span>
            <input type="date" aria-label="From" value={from} max={to || undefined} onChange={(e) => set(setFrom)(e.target.value)} className={selectClass(!!from)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase xl:sr-only">To</span>
            <input type="date" aria-label="To" value={to} min={from || undefined} onChange={(e) => set(setTo)(e.target.value)} className={selectClass(!!to)} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-muted tabular">{d ? `${d.total.toLocaleString()} ${d.total === 1 ? "entry" : "entries"}` : " "}</span>
          {filtered ? (
            <button type="button" onClick={clear} className="inline-flex items-center gap-1 font-bold text-maroon-700 hover:text-maroon-600">
              <X className="size-4" aria-hidden />
              Clear filters
            </button>
          ) : null}
        </div>
      </Card>

      {audit.isError ? <ErrorBanner>{audit.error.message}</ErrorBanner> : null}

      <Card className={cn("p-0 sm:p-0", audit.isFetching && d && "opacity-70 transition-opacity")}>
        {!d ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : d.items.length ? (
          <ul className="divide-y divide-line">
            {d.items.map((e) => (
              <AuditRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen((o) => (o === e.id ? null : e.id))} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<ScrollText />} title="Nothing matches">
            Try a wider date range or clear the filters.
          </EmptyState>
        )}
      </Card>
      {d ? <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} /> : null}
    </motion.div>
  );
}

function AuditRow({ e, open, onToggle }: { e: AuditEntry; open: boolean; onToggle: () => void }) {
  const hasDetail = !!e.meta && (Object.keys(e.meta.before ?? {}).length > 0 || Object.keys(e.meta.after ?? {}).length > 0);
  const main = (
    <>
      <span className="w-24 shrink-0 text-xs leading-tight font-semibold text-muted tabular sm:w-28">
        <span className="block text-ink">{formatDay(e.at)}</span>
        {formatTime(e.at)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold text-ink">{e.actorName ?? "Someone"}</span>
          <Chip tone={actionTone(e.action)}>{actionLabel(e.action)}</Chip>
        </span>
        {e.targetLabel ? <span className="mt-0.5 block truncate text-xs text-muted">{e.targetLabel}</span> : null}
      </span>
      {hasDetail ? (
        <ChevronDown className={cn("size-4.5 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
      ) : (
        <span className="w-4.5 shrink-0" aria-hidden />
      )}
    </>
  );
  return (
    <li>
      {hasDetail ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-cream-50 sm:px-6">
          {main}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 text-sm sm:px-6">{main}</div>
      )}
      <AnimatePresence initial={false}>
        {open && e.meta ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <Changes before={e.meta.before ?? {}} after={e.meta.after ?? {}} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "roles" && Array.isArray(v)) return v.map((r) => ROLE_LABEL[r as Role] ?? String(r)).join(", ");
  if (key === "connectTeam") return TEAM_NAME[v as ConnectTeam] ?? String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

/** Old and new values, one line per field. */
function Changes({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const isNew = Object.keys(before).length === 0;
  return (
    <div className="mx-4 mb-3 overflow-x-auto rounded-2xl bg-cream-100 p-3 sm:mx-6">
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="px-2 py-1 font-bold">Field</th>
            {isNew ? null : <th className="px-2 py-1 font-bold">Before</th>}
            <th className="px-2 py-1 font-bold">{isNew ? "Value" : "After"}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
              <tr key={k} className="border-t border-line align-top">
                <td className="px-2 py-1.5 font-bold text-ink">{FIELD_LABEL[k] ?? k}</td>
                {isNew ? null : <td className="px-2 py-1.5 text-muted line-through decoration-crit/50">{show(k, before[k])}</td>}
                <td className="px-2 py-1.5 font-semibold text-ink">{show(k, after[k])}</td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
