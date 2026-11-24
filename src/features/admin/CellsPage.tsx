import { MapPin, MapPinOff, Plus, Search, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { CellChip } from "@/features/welcome/parts";
import { CELL_COLOR } from "@/features/welcome/model";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { formatStamp, serviceDateShort } from "@/lib/time";
import { useCellMap, useSetZip } from "./config-queries";
import { CELL_NAMES, type CellMapResponse, type CellName, type ZipRow } from "./config-types";
import { Field, inputClass } from "./parts";

/**
 * Admin › Cells and ZIPs (PRD W-12, W-11, IL-5). Which home cell each ZIP code
 * belongs to. A change recalculates the cell group of every entry with that ZIP,
 * so the Welcome overview, LCM Metrics, Connect and the dashboard follow at once.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

type Target = { zip: string; row: ZipRow | null; cell: CellName | null } | "new";

export function CellsPage() {
  const map = useCellMap();
  const d = map.data;
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Target | null>(null);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Cells and ZIPs"
        tagline="Which home cell each ZIP code belongs to. Guests are counted in the cell of the ZIP they give."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {d?.updatedAt ? (
              <Chip>
                Last changed {formatStamp(d.updatedAt)}
                {d.updatedBy ? ` by ${d.updatedBy}` : ""}
              </Chip>
            ) : null}
            <Button icon={<Plus className="size-4" />} onClick={() => setTarget("new")} disabled={!d}>
              Add a ZIP
            </Button>
          </div>
        }
      />
      {map.isError ? <ErrorBanner>{map.error.message}</ErrorBanner> : null}
      {!d ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {CELL_NAMES.map((c) => (
            <Skeleton key={c} className="h-72 w-full rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <motion.div variants={stagger(0)} className="flex flex-wrap items-center gap-3">
            <label className="relative w-full max-w-xs">
              <span className="sr-only">Find a ZIP or city</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a ZIP or city"
                className={cn(inputClass(), "pl-10")}
              />
            </label>
            <p className="text-sm text-muted">
              {plural(d.cells.reduce((a, c) => a + c.zips.length, 0), "ZIP")} on the map · changes apply to past entries too
            </p>
          </motion.div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {d.cells.map((c) => (
              <CellCard key={c.cell} cell={c} q={q} onOpen={(row) => setTarget({ zip: row.zip, row, cell: c.cell })} />
            ))}
          </div>
          <Unmapped d={d} q={q} onAdd={(row) => setTarget({ zip: row.zip, row, cell: null })} />
        </>
      )}
      {d ? <ZipDialog target={target} map={d} onClose={() => setTarget(null)} /> : null}
    </motion.div>
  );
}

const matches = (z: ZipRow, q: string) => {
  const t = q.trim().toLowerCase();
  return !t || z.zip.includes(t) || (z.city ?? "").toLowerCase().includes(t) || (z.county ?? "").toLowerCase().includes(t);
};

function CellCard({ cell, q, onOpen }: { cell: CellMapResponse["cells"][number]; q: string; onOpen: (z: ZipRow) => void }) {
  const zips = cell.zips.filter((z) => matches(z, q));
  return (
    <Card className="flex flex-col">
      <header className="flex items-center gap-3 border-b border-line pb-4">
        <span className="size-3 shrink-0 rounded-full" style={{ background: CELL_COLOR[cell.cell] }} aria-hidden />
        <h2 className="font-display text-xl font-semibold text-maroon-950">{cell.cell} cell</h2>
        <span className="ml-auto text-right text-xs leading-tight text-muted">
          <b className="block text-sm text-ink tabular">{plural(cell.zips.length, "ZIP")}</b>
          {cell.thisYear.toLocaleString()} guests this year
        </span>
      </header>
      {zips.length ? (
        <ul className="-mx-3 divide-y divide-line/70 pt-1">
          {zips.map((z) => (
            <li key={z.zip}>
              <button
                type="button"
                onClick={() => onOpen(z)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-cream-50 focus-visible:bg-cream-50"
                aria-label={`${z.zip}${z.city ? `, ${z.city}` : ""}: move or take off the map`}
              >
                <span className="font-mono text-sm font-bold text-ink tabular">{z.zip}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{z.city ?? "—"}</span>
                <span className="text-xs font-semibold text-muted tabular">{z.entries ? plural(z.entries, "entry", "entries") : "no entries"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted">{cell.zips.length ? "No ZIP here matches your search." : "No ZIPs yet. Use Add a ZIP."}</p>
      )}
    </Card>
  );
}

/** PRD W-11: ZIPs guests gave that no cell covers. */
function Unmapped({ d, q, onAdd }: { d: CellMapResponse; q: string; onAdd: (z: ZipRow) => void }) {
  const rows = d.unmapped.filter((z) => matches(z, q));
  return (
    <Card>
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream-200 text-muted" aria-hidden>
          <MapPinOff className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold text-maroon-950">Greater Houston ZIPs no cell covers</h2>
          <p className="text-sm text-muted">Guests from these ZIPs show as N/A. Busiest first, so you can see where a cell could grow.</p>
        </div>
      </header>
      {rows.length ? (
        <>
          <table className="hidden w-full text-sm md:table">
            <thead className="text-left text-xs font-extrabold tracking-wide whitespace-nowrap text-muted uppercase">
              <tr className="border-b border-line">
                <th className="py-2 pr-3">ZIP</th>
                <th className="py-2 pr-3">Place</th>
                <th className="py-2 pr-3 text-right">This year</th>
                <th className="py-2 pr-3 text-right">All entries</th>
                <th className="py-2 pr-3">Last seen</th>
                <th className="py-2" aria-label="Action" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map((z) => (
                <tr key={z.zip}>
                  <td className="py-2.5 pr-3 font-mono font-bold text-ink tabular">{z.zip}</td>
                  <td className="py-2.5 pr-3 text-muted">
                    {z.city ?? "—"}
                    {z.county ? ` · ${z.county} County` : ""}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold text-ink tabular">{z.thisYear.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-right text-muted tabular">{z.entries.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-muted">{z.lastSeen ? serviceDateShort(z.lastSeen) : "—"}</td>
                  <td className="py-1.5 text-right">
                    <Button size="sm" variant="ghost" icon={<MapPin className="size-3.5" />} onClick={() => onAdd(z)}>
                      Add to a cell
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-line/70 md:hidden">
            {rows.map((z) => (
              <li key={z.zip} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-bold text-ink tabular">{z.zip}</p>
                  <p className="truncate text-xs text-muted">
                    {z.city ?? "—"} · {plural(z.thisYear, "guest")} this year
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onAdd(z)}>
                  Add to a cell
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState icon={<MapPin />} title={d.unmapped.length ? "No match" : "Every Greater Houston ZIP is on a cell"}>
          {d.unmapped.length ? "No uncovered ZIP matches your search." : "Guests from Greater Houston all count toward a cell."}
        </EmptyState>
      )}
      <p className="mt-4 text-xs text-muted">
        Not listed: {plural(d.outOfArea, "entry", "entries")} from outside Greater Houston and {plural(d.noZip, "entry", "entries")} with no ZIP (mostly guests from
        abroad). They stay N/A.
      </p>
    </Card>
  );
}

/** Add a ZIP to a cell, move it, or take it off the map. */
function ZipDialog({ target, map, onClose }: { target: Target | null; map: CellMapResponse; onClose: () => void }) {
  const open = !!target;
  const isNew = target === "new";
  const t = target && target !== "new" ? target : null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      subtitle={isNew ? "Cell map" : t?.cell ? `${t.cell} cell` : "Not on a cell"}
      title={isNew ? "Add a ZIP" : t ? `${t.zip}${t.row?.city ? ` · ${t.row.city}` : ""}` : ""}
      className="max-w-lg"
    >
      {/* Re-mount per target so the form starts fresh. */}
      {open ? <ZipForm key={isNew ? "new" : t?.zip} target={target} map={map} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ZipForm({ target, map, onClose }: { target: Target; map: CellMapResponse; onClose: () => void }) {
  const isNew = target === "new";
  const t = target === "new" ? null : target;
  const [zipText, setZipText] = useState(t?.zip ?? "");
  const [cell, setCell] = useState<CellName | null>(t?.cell ?? null);
  const [error, setError] = useState<string | null>(null);
  const save = useSetZip();
  const confirm = useConfirm();
  const toast = useToast();
  // The newest map version at the moment of saving, even after a confirm dialog.
  const latest = useRef(map);
  useEffect(() => {
    latest.current = map;
  }, [map]);

  const zip = zipText.trim();
  const valid = /^\d{5}$/.test(zip);
  // What is known about the ZIP typed in: its cell now and how many entries it carries.
  const known = useMemo(() => {
    for (const c of map.cells) {
      const row = c.zips.find((z) => z.zip === zip);
      if (row) return { row, cell: c.cell as CellName | null };
    }
    const row = map.unmapped.find((z) => z.zip === zip) ?? null;
    return { row, cell: null };
  }, [map, zip]);
  const current = isNew ? known.cell : t!.cell;
  const entries = (isNew ? known.row : t!.row)?.entries ?? 0;
  const changed = valid && cell !== null && cell !== current;

  const run = async (to: CellName | null) => {
    setError(null);
    try {
      const r = await save.mutateAsync({ zip, cell: to, rowVer: latest.current.rowVer });
      const what = to ? (r.from ? `${zip} moved to ${to}` : `${zip} added to ${to}`) : `${zip} taken off the map`;
      toast.show(r.recalculated ? `${what} · ${plural(r.recalculated, "entry", "entries")} updated` : what);
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.isConflict
            ? "Someone else changed the cell map a moment ago. It has been reloaded: check the cells and save again."
            : e.message
          : "Something went wrong. Please try again.",
      );
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Take ${zip} off the ${current} cell?`,
      body: entries
        ? `${plural(entries, "guest entry", "guest entries")} from ${zip} will count as N/A (not on a cell) in Welcome, LCM Metrics, Connect and the dashboard, including past months.`
        : `${zip} has no guest entries yet. Future guests from it will count as N/A.`,
      confirmLabel: `Take ${zip} off the map`,
    });
    if (ok) await run(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) void run(cell);
      }}
      noValidate
      className="space-y-5"
    >
      {error ? (
        <p role="alert" className="rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit">
          {error}
        </p>
      ) : null}

      {isNew ? (
        <Field
          label="ZIP code"
          htmlFor="z-zip"
          error={zip && !valid ? "Enter a 5-digit ZIP code" : undefined}
          hint={valid ? (known.cell ? `Now on the ${known.cell} cell.` : known.row ? `Not on a cell yet · ${plural(known.row.entries, "entry", "entries")}.` : "No guest has given this ZIP yet.") : "5 digits, for example 77494."}
        >
          <input
            id="z-zip"
            data-autofocus
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            value={zipText}
            onChange={(e) => setZipText(e.target.value.replace(/\D/g, ""))}
            className={cn(inputClass(!!zip && !valid), "font-mono tracking-wider")}
          />
        </Field>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <CellChip cell={current ?? "N/A"} />
          {t!.row?.county ? <span>{t!.row.county} County</span> : null}
          <span>· {entries ? plural(entries, "guest entry", "guest entries") : "no guest entries yet"}</span>
          {t!.row?.lastSeen ? <span>· last {serviceDateShort(t!.row.lastSeen)}</span> : null}
        </div>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-bold text-ink">{current ? "Move to" : "Cell group"}</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {CELL_NAMES.map((c) => {
            const on = cell === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                data-autofocus={!isNew && on ? true : undefined}
                onClick={() => setCell(c)}
                className={cn(
                  "flex h-12 items-center gap-2.5 rounded-xl border px-3.5 text-sm font-bold transition-colors",
                  on ? "border-maroon-700 bg-maroon-100/40 text-maroon-900" : "border-line bg-white text-ink hover:border-maroon-200",
                )}
              >
                <span className="size-3 rounded-full" style={{ background: CELL_COLOR[c] }} aria-hidden />
                {c}
                {c === current ? <span className="ml-auto text-xs font-semibold text-muted">now</span> : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      {changed && entries ? (
        <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-xs font-bold text-warn">
          <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
          {plural(entries, "guest entry", "guest entries")} will move from {current ?? "N/A"} to {cell}, including past months. Welcome, LCM Metrics, Connect and the
          dashboard update straight away.
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center">
        {current ? (
          <Button variant="subtle" className="text-crit hover:bg-crit-soft sm:mr-auto" onClick={() => void remove()} disabled={save.isPending}>
            Take off the map
          </Button>
        ) : null}
        <Button variant="ghost" className={current ? undefined : "sm:ml-auto"} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={save.isPending}
          disabled={!changed}
          disabledReason={!valid ? "Enter a 5-digit ZIP first" : cell === null ? "Choose a cell group" : "It is already on that cell"}
        >
          {!valid || cell === null ? "Save" : current ? `Move to ${cell}` : `Add to ${cell}`}
        </Button>
      </div>
    </form>
  );
}
