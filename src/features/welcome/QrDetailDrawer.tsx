import { CalendarClock, ExternalLink, Pencil, Printer, ScanLine, Table2, BarChart3 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { formatStamp, formatWhen, serviceDateShort } from "@/lib/time";
import { Warnings } from "./QrDialogs";
import { QrImage } from "./QrImage";
import { CopyButton, DEST_ICON, QrStatusChip, datesText, shortText } from "./qr-parts";
import { qrKeys, useQrDetail } from "./qr-queries";
import type { QrCode, QrDetail, QrStatus } from "./qr-types";

/** One code: the image, where it leads, its dates and its scan counts (PRD QR-6). */

/** What a phone sees if it scans the code right now (QR-3). */
function scanNow(c: QrCode): { tone: "ok" | "warn"; text: string } {
  const s: Record<QrStatus, string> = {
    active: `Opens ${c.destinationLabel}.`,
    scheduled: `Shows the “not active yet” page until ${c.activeFrom ? formatWhen(c.activeFrom) : "it starts"}, with links to the guest form and Plan a Visit.`,
    paused: "Shows the “not active” page, with links to the guest form and Plan a Visit, until it is resumed.",
    draft: "Shows the “not active” page until the code is turned on.",
    expired: "Shows the “this code has ended” page, with links to the guest form and Plan a Visit.",
  };
  return { tone: c.status === "active" ? "ok" : "warn", text: s[c.status] };
}

export function QrDetailDrawer({
  id,
  summary,
  can,
  onClose,
  onEdit,
  onDates,
  onPrint,
}: {
  id: string | null;
  summary: QrCode | null;
  can: { manage: boolean; print: boolean };
  onClose: () => void;
  onEdit: (c: QrCode) => void;
  onDates: (c: QrCode) => void;
  onPrint: (c: QrCode) => void;
}) {
  const detail = useQrDetail(id);
  const c = detail.data?.code ?? summary;

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      label={c ? c.name : "QR code"}
      footer={
        c ? (
          <div className="flex flex-wrap justify-end gap-2">
            {can.print ? (
              <Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => onPrint(c)}>
                Print
              </Button>
            ) : null}
            {can.manage ? (
              <>
                <Button variant="ghost" icon={<CalendarClock className="size-4" />} onClick={() => onDates(c)}>
                  Change dates
                </Button>
                <Button icon={<Pencil className="size-4" />} onClick={() => onEdit(c)}>
                  Change
                </Button>
              </>
            ) : null}
          </div>
        ) : null
      }
    >
      {!c ? (
        <Skeleton className="h-96 w-full rounded-3xl" />
      ) : (
        <div className="space-y-6">
          <header>
            <p className="mb-1 text-[11px] font-extrabold tracking-[0.12em] text-gold-600 uppercase">QR code</p>
            <h2 className="font-display text-2xl font-semibold text-maroon-950">{c.name}</h2>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              <QrStatusChip status={c.status} />
              {c.legacy ? <Chip tone="maroon">Already printed</Chip> : null}
            </p>
          </header>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <span className="shrink-0 rounded-2xl border border-line bg-white p-2">
              <QrImage value={c.shortUrl} className="size-40" title={`QR code: ${c.name}`} />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-bold text-muted">Printed address</p>
                <p className="flex items-center gap-1">
                  <span className="min-w-0 font-bold break-all text-maroon-700">{shortText(c.shortUrl)}</span>
                  <CopyButton value={c.shortUrl} />
                </p>
              </div>
              <ScanNow code={c} />
            </div>
          </div>

          <Warnings items={c.warnings} />

          <Facts code={c} />

          {detail.isError ? <ErrorBanner>{detail.error.message}</ErrorBanner> : detail.data ? <Scans d={detail.data} /> : <Skeleton className="h-64 w-full rounded-2xl" />}
        </div>
      )}
    </Drawer>
  );
}

function ScanNow({ code: c }: { code: QrCode }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const now = scanNow(c);
  // Mock mode only: run the short address and count the scan, as a phone would.
  const tryScan = async () => {
    if (!c.slug) return;
    setBusy(true);
    try {
      const r = await api.qr.resolve(c.slug);
      toast.show(r.outcome === "redirect" ? `Scan counted · would open ${r.url}` : `Scan counted · showed the not-active page (${r.reason.replace("_", " ")})`);
      await qc.invalidateQueries({ queryKey: qrKeys.all });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={now.tone === "ok" ? "rounded-2xl bg-ok-soft px-4 py-3" : "rounded-2xl bg-cream-200 px-4 py-3"}>
      <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
        <ScanLine className="size-4" aria-hidden /> A scan right now
      </p>
      <p className="mt-0.5 text-sm text-ink">{now.text}</p>
      {env.useMocks && c.slug ? (
        <button type="button" onClick={() => void tryScan()} disabled={busy} className="mt-1.5 text-xs font-bold text-maroon-700 underline-offset-2 hover:underline">
          Try a scan (demo data)
        </button>
      ) : null}
    </div>
  );
}

function Facts({ code: c }: { code: QrCode }) {
  const Icon = DEST_ICON[c.destination];
  const { from, until } = datesText(c);
  const rows: [string, React.ReactNode][] = [
    [
      "Opens",
      <span key="o" className="flex flex-col">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon className="size-4 text-gold-600" aria-hidden /> {c.destinationLabel}
        </span>
        <a href={c.destinationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs break-all text-muted hover:text-maroon-700">
          {c.destinationUrl} <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
      </span>,
    ],
    ["Service", c.serviceName ?? "No particular service"],
    ["Active from", from],
    ["Expires", until],
    ["Time zone", "Church time (Central)"],
    ["Caption", c.caption || "—"],
    ["Note", c.note || "—"],
    ["Added", `${formatStamp(c.createdAt)}${c.createdBy ? ` by ${c.createdBy}` : ""}`],
    ["Last changed", `${formatStamp(c.updatedAt)}${c.updatedBy ? ` by ${c.updatedBy}` : ""}`],
  ];
  return (
    <dl className="divide-y divide-line/70 rounded-2xl border border-line">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm">
          <dt className="font-bold text-muted">{k}</dt>
          <dd className="min-w-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const MAROON = "#6e0d12";

function Scans({ d }: { d: QrDetail }) {
  const [table, setTable] = useState(false);
  const total60 = d.byDay.reduce((a, x) => a + x.scans, 0);
  const rows = d.byDay.map((x) => ({ ...x, label: serviceDateShort(x.date) }));
  const busy = d.byDay.filter((x) => x.scans || x.inactive);
  return (
    <section aria-labelledby="qr-scans" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="qr-scans" className="font-display text-lg font-semibold text-maroon-950">
            Scans
          </h3>
          <p className="text-xs text-muted">Counted by day and by service. No names, phones or locations are kept.</p>
        </div>
        <Button size="sm" variant="ghost" icon={table ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />} onClick={() => setTable((t) => !t)}>
          {table ? "Chart" : "Table"}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["All time", d.code.scans.total],
          ["Last 60 days", total60],
          ["Met the not-active page", d.inactiveTotal],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-2xl bg-cream-100 px-3 py-2.5">
            <p className="font-display text-xl font-semibold text-ink tabular">{(n as number).toLocaleString()}</p>
            <p className="text-[11px] leading-tight text-muted">{label}</p>
          </div>
        ))}
      </div>

      {table ? (
        busy.length ? (
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-cream-100 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-bold">Day</th>
                  <th className="px-3 py-2 text-right font-bold">Scans</th>
                  <th className="px-3 py-2 text-right font-bold">Not active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70 tabular">
                {[...busy].reverse().map((x) => (
                  <tr key={x.date}>
                    <td className="px-3 py-1.5 font-semibold">{serviceDateShort(x.date)}</td>
                    <td className="px-3 py-1.5 text-right">{x.scans}</td>
                    <td className="px-3 py-1.5 text-right text-muted">{x.inactive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No scans in the last 60 days.</p>
        )
      ) : (
        <div className="h-48" role="img" aria-label={`Scans per day over the last 60 days: ${total60} in all. Use the Table button for the numbers.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap={1}>
              <CartesianGrid vertical={false} stroke="#ebe3d6" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#ebe3d6" }} tick={{ fontSize: 10, fill: "#6b5f57", fontWeight: 600 }} interval={13} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#6b5f57" }} />
              <Tooltip
                cursor={{ fill: "#6b5f57", fillOpacity: 0.08 }}
                content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                  return active && r ? (
                    <div className="rounded-xl bg-ink px-3 py-2 text-xs text-cream-50 shadow-lift">
                      <p className="font-bold">{r.label}</p>
                      <p>
                        Scans: <b>{r.scans}</b>
                      </p>
                      {r.inactive ? <p>Not active page: {r.inactive}</p> : null}
                    </div>
                  ) : null;
                }}
              />
              <Bar dataKey="scans" fill={MAROON} radius={[3, 3, 0, 0]} maxBarSize={10} animationDuration={600} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <h4 className="mb-1.5 text-sm font-bold text-ink">By service, all time</h4>
        {d.byService.length ? (
          <ul className="space-y-1.5">
            {d.byService.map((s) => {
              const pct = d.code.scans.total ? s.scans / d.code.scans.total : 0;
              return (
                <li key={s.service} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{s.service}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-cream-200">
                      <span className="block h-full rounded-full bg-maroon-700" style={{ width: `${Math.max(2, pct * 100)}%` }} />
                    </span>
                  </span>
                  <span className="text-right font-bold text-ink tabular">{s.scans.toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No scans yet.</p>
        )}
      </div>
    </section>
  );
}
