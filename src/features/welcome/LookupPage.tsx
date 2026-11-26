import { Phone, RotateCcw, Search, UserSearch } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Chip } from "@/components/ui/Chip";
import { ConfidentialChip, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { serviceDateLong, serviceDateShort } from "@/lib/time";
import { GuestDrawer } from "./GuestDrawer";
import { useServiceOptions } from "@/features/admin/config-queries";
import { CELLS, WELCOME_TAGLINE } from "./model";
import { CellChip, LogFollowUpLink, MemberChip, ViewEntryButton } from "./parts";
import { useGuestSearch, useServiceDates } from "./queries";
import type { GuestItem, GuestSearch } from "./types";
import { ViewEntryDialog } from "./ViewEntryDialog";

/** TKP Connect UI-W2 · Welcome › Guest lookup. Every search and opened record is audited by the API. */

export function LookupPage() {
  const [params] = useSearchParams();
  const [phone, setPhone] = useState(params.get("phone") ?? "");
  const [name, setName] = useState(params.get("name") ?? "");
  const [filters, setFilters] = useState({ date: "", cell: "", type: "", member: "" });
  const serviceOptions = useServiceOptions();
  // Text boxes wait 350 ms after typing stops; filters search at once (as the live page).
  const [typed, setTyped] = useState({ phone, name });
  useEffect(() => {
    const t = window.setTimeout(() => setTyped({ phone, name }), 350);
    return () => window.clearTimeout(t);
  }, [phone, name]);

  const query: GuestSearch = useMemo(() => {
    const q: GuestSearch = {};
    const digits = typed.phone.replace(/\D/g, "");
    if (digits) q.phone = digits;
    if (typed.name.trim()) q.name = typed.name.trim();
    for (const [k, v] of Object.entries(filters)) if (v) q[k as keyof GuestSearch] = v;
    return q;
  }, [typed, filters]);

  const search = useGuestSearch(query);
  const dates = useServiceDates();
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [entryId, setEntryId] = useState<number | null>(null);
  const phoneBox = useRef<HTMLInputElement>(null);
  useEffect(() => phoneBox.current?.focus(), []);

  const any = Object.keys(query).length > 0;
  const phoneTooShort = !!query.phone && query.phone.length < 3 && Object.keys(query).length === 1;
  const items = search.data?.items ?? [];

  const status = !any
    ? "Type a phone number or a name, or pick a filter."
    : phoneTooShort
      ? "Type at least 3 digits of the phone number."
      : search.isFetching && !search.data
        ? "Searching…"
        : search.data
          ? `${search.data.total} guest${search.data.total === 1 ? "" : "s"} match${search.data.truncated ? ` (showing the first ${items.length} — add a filter)` : ""}`
          : "";

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="Welcome" title="Guest lookup" tagline={WELCOME_TAGLINE} actions={<ConfidentialChip />} />

      <motion.section variants={fadeUp} className="space-y-4 rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <SearchBox
            ref={phoneBox}
            icon={<Phone className="size-4.5" aria-hidden />}
            label="Phone"
            placeholder="Any part of the number, any format"
            inputMode="tel"
            value={phone}
            onChange={setPhone}
          />
          <SearchBox icon={<Search className="size-4.5" aria-hidden />} label="Name" placeholder="Full name, or first / last in any order" value={name} onChange={setName} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <Filter label="Service date" value={filters.date} onChange={(v) => setFilters((f) => ({ ...f, date: v }))}>
            <option value="">Any date</option>
            {(dates.data ?? []).map((d) => (
              <option key={d} value={d}>
                {serviceDateLong(d)}
              </option>
            ))}
          </Filter>
          <Filter label="Cell group" value={filters.cell} onChange={(v) => setFilters((f) => ({ ...f, cell: v }))}>
            <option value="">Any cell</option>
            {CELLS.map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option value="None">No cell</option>
          </Filter>
          <Filter label="Service type" value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))}>
            <option value="">Any service</option>
            {serviceOptions.map((t) => (
              <option key={t.name} value={t.name}>
                {t.retired ? `${t.name} (retired)` : t.name}
              </option>
            ))}
          </Filter>
          <Filter label="Become a member?" value={filters.member} onChange={(v) => setFilters((f) => ({ ...f, member: v }))}>
            <option value="">Any answer</option>
            <option>Yes</option>
            <option>Undecided</option>
            <option>No</option>
          </Filter>
          <button
            type="button"
            onClick={() => {
              setPhone("");
              setName("");
              setFilters({ date: "", cell: "", type: "", member: "" });
            }}
            className="col-span-2 inline-flex h-11 items-center justify-center gap-1.5 self-end rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink hover:border-maroon-200 lg:col-span-1"
          >
            <RotateCcw className="size-4" aria-hidden /> Clear
          </button>
        </div>
        <p className="text-sm font-semibold text-muted" aria-live="polite">
          {status}
        </p>
      </motion.section>

      {search.isError ? <ErrorBanner>{search.error.message}</ErrorBanner> : null}

      {any && !phoneTooShort ? (
        search.isPending ? (
          <ResultsSkeleton />
        ) : items.length ? (
          <Results items={items} fetching={search.isFetching} onOpen={setDrawerId} onEntry={setEntryId} />
        ) : (
          <motion.div variants={fadeUp} className="rounded-3xl bg-white shadow-card">
            <EmptyState icon={<UserSearch />} title="No guests match">
              Try fewer words, part of the phone number, or a different filter.
            </EmptyState>
          </motion.div>
        )
      ) : null}

      <GuestDrawer id={drawerId} onClose={() => setDrawerId(null)} onViewEntry={setEntryId} />
      <ViewEntryDialog guestId={entryId} onClose={() => setEntryId(null)} list={items.map((i) => i.id)} onNavigate={setEntryId} />
    </motion.div>
  );
}

/* ----------------------------------------------------------------- results */

function Results({ items, fetching, onOpen, onEntry }: { items: GuestItem[]; fetching: boolean; onOpen: (id: number) => void; onEntry: (id: number) => void }) {
  const name = (g: GuestItem) => `${g.firstName ?? ""} ${g.lastName ?? ""}`.trim() || "No name given";
  const open = (e: React.KeyboardEvent, id: number) => {
    if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest("a,button")) {
      e.preventDefault();
      onOpen(id);
    }
  };

  return (
    <motion.section variants={fadeUp} className={cn("@container rounded-3xl border border-white bg-white shadow-card transition-opacity", fetching && "opacity-70")}>
      {/* Table on wide screens */}
      <div className="hidden overflow-x-auto @5xl:block">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11px] font-extrabold tracking-wide whitespace-nowrap text-muted uppercase">
              <th className="px-5 py-3">Service</th>
              <th className="px-3 py-3">Guest</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Gender · age</th>
              <th className="px-3 py-3">City · zip</th>
              <th className="px-3 py-3">Cell</th>
              <th className="px-3 py-3">Heard via</th>
              <th className="px-3 py-3">Member?</th>
              <th className="px-5 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <motion.tbody variants={stagger(0.02)} initial="hidden" animate="show">
            {items.map((g) => (
              <motion.tr
                key={g.id}
                variants={fadeUp}
                tabIndex={0}
                onClick={(e) => !(e.target as HTMLElement).closest("a,button") && onOpen(g.id)}
                onKeyDown={(e) => open(e, g.id)}
                className="cursor-pointer border-t border-line align-middle transition-colors hover:bg-cream-50"
              >
                <td className="px-5 py-3 whitespace-nowrap">
                  {serviceDateShort(g.serviceDate)}
                  <div className="text-xs text-muted">{g.serviceType}</div>
                </td>
                <td className="px-3 py-3">
                  <b className="text-maroon-800">{name(g)}</b> {g.visitNumber > 1 ? <Chip tone="warn">visit {g.visitNumber}</Chip> : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{g.phone ?? "—"}</td>
                <td className="px-3 py-3">
                  {g.gender ?? "—"} · {g.ageBracket ?? "—"}
                </td>
                <td className="px-3 py-3">
                  {g.city ?? "—"}
                  {g.zip ? ` · ${g.zip}` : ""}
                </td>
                <td className="px-3 py-3">
                  <CellChip cell={g.cellGroup} />
                </td>
                <td className="px-3 py-3">{g.howHeard ?? "—"}</td>
                <td className="px-3 py-3">
                  <MemberChip value={g.membershipIntent} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-1.5">
                    <ViewEntryButton size="sm" onClick={() => onEntry(g.id)} />
                    <LogFollowUpLink size="sm" connectId={g.connectId} />
                  </div>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>

      {/* Cards on phones and narrow screens */}
      <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="grid gap-3 p-3 @5xl:hidden">
        {items.map((g) => (
          <motion.li
            key={g.id}
            variants={fadeUp}
            tabIndex={0}
            onClick={(e) => !(e.target as HTMLElement).closest("a,button") && onOpen(g.id)}
            onKeyDown={(e) => open(e, g.id)}
            className="cursor-pointer rounded-2xl border border-line bg-cream-50/60 p-4 transition-colors hover:border-maroon-200"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <b className="text-[15px] text-maroon-800">{name(g)}</b> {g.visitNumber > 1 ? <Chip tone="warn">visit {g.visitNumber}</Chip> : null}
                <p className="text-xs text-muted">
                  {serviceDateShort(g.serviceDate)} · {g.serviceType}
                </p>
              </div>
              <MemberChip value={g.membershipIntent} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{g.phone ?? "No phone"}</span>
              <span>
                {g.city ?? "—"}
                {g.zip ? ` · ${g.zip}` : ""}
              </span>
              <CellChip cell={g.cellGroup} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <ViewEntryButton size="sm" onClick={() => onEntry(g.id)} />
              <LogFollowUpLink size="sm" connectId={g.connectId} />
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </motion.section>
  );
}

/* ----------------------------------------------------------------- inputs */

const SearchBox = ({
  ref,
  icon,
  label,
  placeholder,
  value,
  onChange,
  inputMode,
}: {
  ref?: React.Ref<HTMLInputElement>;
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "tel" | "text";
}) => (
  <label className="grid gap-1.5">
    <span className="text-sm font-bold text-ink">{label}</span>
    <span className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted">{icon}</span>
      <input
        ref={ref}
        type="search"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-xl border border-line bg-white pr-4 pl-10.5 text-[15px] text-ink transition-[border-color,box-shadow] outline-none placeholder:text-muted/60 focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10"
      />
    </span>
  </label>
);

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-xs font-extrabold tracking-wide text-muted uppercase">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-11 w-full min-w-0 rounded-xl border bg-white px-3 text-sm font-semibold text-ink", value ? "border-maroon-600" : "border-line")}
      >
        {children}
      </select>
    </label>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3 rounded-3xl bg-white p-5 shadow-card" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}
