import { CalendarClock, Pause, Pencil, Play, Plus, Power, Printer, QrCode as QrIcon, Search, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { IconAction, inputClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { QrDatesDialog, QrDialog, type QrDialogMode } from "./QrDialogs";
import { QrDetailDrawer } from "./QrDetailDrawer";
import { QrImage } from "./QrImage";
import { CopyButton, DEST_ICON, QrStatusChip, datesText, shortText } from "./qr-parts";
import { useDeleteQr, useQrList, useSetQrState } from "./qr-queries";
import { STATUS_LABEL, type QrCode, type QrStatus } from "./qr-types";

/**
 * Welcome › QR codes (PRD 5.8, QR-1 to QR-9). Church Admin and the integration
 * lead create and change codes; the welcome team views and prints; the pastor
 * sees scan counts. The printed address never changes, only where it leads.
 */

const FILTERS: (QrStatus | "all")[] = ["all", "active", "scheduled", "paused", "draft", "expired"];

export function QrCodesPage() {
  const list = useQrList();
  const d = list.data;
  const navigate = useNavigate();
  const [filter, setFilter] = useState<QrStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<QrDialogMode | null>(null);
  const [datesFor, setDatesFor] = useState<QrCode | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (d?.items ?? []).filter(
      (c) => (filter === "all" || c.status === filter) && (!q || `${c.name} ${c.destinationLabel} ${c.shortUrl}`.toLowerCase().includes(q)),
    );
  }, [d, filter, query]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const print = (ids: string[]) => navigate(`/welcome/qr/print?ids=${ids.join(",")}`);
  const live = d?.items.find((c) => c.id === openId) ?? null;

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Welcome"
        title="QR codes"
        tagline="The codes printed around the church: where each one leads, when it works, and how often it is scanned."
        actions={
          d ? (
            <>
              {d.can.print ? (
                <Button
                  variant="ghost"
                  icon={<Printer className="size-4" />}
                  onClick={() => print(picked.size ? [...picked] : [])}
                >
                  {picked.size ? `Print ${picked.size} selected` : "Print codes"}
                </Button>
              ) : null}
              {d.can.manage ? (
                // One way in (TKP, 2026-11-25): the form asks whether the code is already printed.
                <Button icon={<Plus className="size-4" />} onClick={() => setDialog({ kind: "new" })}>
                  Add a QR code
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {list.isError ? <ErrorBanner>{list.error.message}</ErrorBanner> : null}
      {!d ? (
        <Skeleton className="h-125 w-full rounded-3xl" />
      ) : (
        <Card>
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show codes by status">
              {FILTERS.map((f) => {
                const n = f === "all" ? d.items.length : d.counts[f];
                const on = filter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
                      on ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-line bg-white text-ink hover:border-maroon-200",
                    )}
                  >
                    {f === "all" ? "All" : STATUS_LABEL[f]}
                    <span className={cn("tabular text-xs", on ? "text-cream-50/80" : "text-muted")}>{n}</span>
                  </button>
                );
              })}
            </div>
            <label className="relative block lg:w-72">
              <span className="sr-only">Find a code</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a code" className={cn(inputClass(), "pl-9")} />
            </label>
          </div>
          {items.length ? (
            <ul className="divide-y divide-line/70">
              {items.map((c) => (
                <QrRow
                  key={c.id}
                  code={c}
                  canManage={d.can.manage}
                  canPrint={d.can.print}
                  picked={picked.has(c.id)}
                  onPick={() => toggle(c.id)}
                  onOpen={() => setOpenId(c.id)}
                  onEdit={() => setDialog({ kind: "edit", code: c })}
                  onDates={() => setDatesFor(c)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<QrIcon />} title={d.items.length ? "No codes match" : "No QR codes yet"}>
              {d.items.length ? "Try another status or search." : "Add a code, or register the one already printed."}
            </EmptyState>
          )}
        </Card>
      )}
      {d ? (
        <>
          <QrDialog mode={dialog} list={d} onClose={() => setDialog(null)} />
          <QrDatesDialog code={datesFor} onClose={() => setDatesFor(null)} />
          <QrDetailDrawer
            id={openId}
            summary={live}
            can={d.can}
            onClose={() => setOpenId(null)}
            onEdit={(c) => setDialog({ kind: "edit", code: c })}
            onDates={(c) => setDatesFor(c)}
            onPrint={(c) => print([c.id])}
          />
        </>
      ) : null}
    </motion.div>
  );
}

function QrRow({
  code: c,
  canManage,
  canPrint,
  picked,
  onPick,
  onOpen,
  onEdit,
  onDates,
}: {
  code: QrCode;
  canManage: boolean;
  canPrint: boolean;
  picked: boolean;
  onPick: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDates: () => void;
}) {
  const setState = useSetQrState();
  const remove = useDeleteQr();
  const confirm = useConfirm();
  const toast = useToast();
  const busy = setState.isPending || remove.isPending;
  const Icon = DEST_ICON[c.destination];
  const { from, until } = datesText(c);
  const fail = (e: unknown) => toast.show(e instanceof ApiError ? e.message : "Something went wrong. Please try again.", { tone: "crit" });

  const pause = () =>
    setState.mutate(
      { id: c.id, verb: "pause", rowVer: c.rowVer },
      {
        onSuccess: (r) =>
          toast.show(`${c.name} paused. Scans now show the “not active” page.`, {
            undo: () => setState.mutate({ id: c.id, verb: "resume", rowVer: r.code.rowVer }, { onError: fail }),
          }),
        onError: fail,
      },
    );

  const del = async () => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      body: (
        <>
          Anyone who scans a printed copy will see the “This code is not active” page, with links to the guest form and Plan a Visit. Its scan counts go too. This
          cannot be undone. {c.status === "active" ? "To stop it for a while, pause it instead." : ""}
        </>
      ),
      confirmLabel: `Delete ${c.name}`,
    });
    if (ok) remove.mutate(c.id, { onSuccess: () => toast.show(`${c.name} deleted`), onError: fail });
  };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 lg:flex-nowrap">
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3.5">
        {canPrint ? (
          <input
            type="checkbox"
            checked={picked}
            onChange={onPick}
            aria-label={`Select ${c.name} for printing`}
            className="mt-6 size-4.5 shrink-0 accent-maroon-700"
          />
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${c.name}`}
          className={cn("shrink-0 rounded-xl border border-line bg-white p-1 transition-colors hover:border-maroon-200", c.status !== "active" && "opacity-60")}
        >
          <QrImage value={c.shortUrl} className="size-14" title={`QR code: ${c.name}`} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" onClick={onOpen} className="text-left font-bold text-ink hover:text-maroon-700">
              {c.name}
            </button>
            <QrStatusChip status={c.status} />
            {c.legacy ? <Chip tone="maroon">Already printed</Chip> : null}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted">
            <Icon className="size-4 shrink-0 text-gold-600" aria-hidden />
            <span className="truncate">
              {c.destinationLabel}
              {c.serviceName ? ` · ${c.serviceName}` : ""}
            </span>
          </p>
          <p className="flex min-w-0 items-center gap-0.5 text-sm">
            <span className="min-w-0 truncate font-semibold text-maroon-700" title={c.shortUrl}>
              {shortText(c.shortUrl)}
            </span>
            <CopyButton value={c.shortUrl} label={`Copy the address of ${c.name}`} />
          </p>
        </div>
      </div>

      <div className="min-w-0 basis-full text-xs text-muted sm:basis-52 lg:w-52 lg:basis-auto">
        <p>
          <span className="font-bold text-ink">From</span> {from}
        </p>
        <p>
          <span className="font-bold text-ink">Until</span> {until}
        </p>
      </div>

      <div className="w-24 shrink-0 lg:text-right">
        <p className="font-display text-xl font-semibold text-ink tabular">{c.scans.last30.toLocaleString()}</p>
        <p className="text-[11px] text-muted">scans, 30 days</p>
      </div>

      {canManage ? (
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <IconAction label={`Change the dates of ${c.name}`} icon={<CalendarClock />} onClick={onDates} disabled={busy} />
          <IconAction label={`Change ${c.name}`} icon={<Pencil />} onClick={onEdit} disabled={busy} />
          {c.state === "draft" ? (
            <IconAction
              label={`Turn on ${c.name}`}
              icon={<Power />}
              tone="ok"
              disabled={busy}
              onClick={() =>
                setState.mutate({ id: c.id, verb: "publish", rowVer: c.rowVer }, { onSuccess: () => toast.show(`${c.name} is on`), onError: fail })
              }
            />
          ) : c.state === "paused" ? (
            <IconAction
              label={`Resume ${c.name}`}
              icon={<Play />}
              tone="ok"
              disabled={busy}
              onClick={() => setState.mutate({ id: c.id, verb: "resume", rowVer: c.rowVer }, { onSuccess: () => toast.show(`${c.name} resumed`), onError: fail })}
            />
          ) : (
            <IconAction label={`Pause ${c.name}`} icon={<Pause />} onClick={pause} disabled={busy} />
          )}
          <IconAction
            label={`Delete ${c.name}`}
            icon={<Trash2 />}
            tone="crit"
            onClick={() => void del()}
            disabled={busy || c.legacy}
            reason={c.legacy ? "This code is already printed around the church. Pause it instead." : undefined}
          />
        </span>
      ) : null}
    </li>
  );
}
