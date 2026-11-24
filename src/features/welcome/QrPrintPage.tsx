import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, selectClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { QrImage, qrModules } from "./QrImage";
import { QrStatusChip, shortText } from "./qr-parts";
import { useLogQrPrint, useQrList } from "./qr-queries";
import { STATUS_LABEL, type PrintLayout, type QrCode } from "./qr-types";

/**
 * Welcome › QR codes › Print (PRD QR-5): poster, table card, bulletin insert,
 * sticker and plain layouts on US Letter, several codes at once. The sheet is
 * vector (SVG), so "Save as PDF" in the print dialog gives print-quality output.
 */

type LayoutSpec = {
  label: string;
  hint: string;
  cols: number;
  rows: number;
  /** Printed code size in inches. */
  qr: number;
  caption: number;
  logo: boolean;
};

const LAYOUTS: Record<Exclude<PrintLayout, "plain">, LayoutSpec> = {
  poster: { label: "Poster", hint: "One per page, for doors and walls", cols: 1, rows: 1, qr: 5.5, caption: 30, logo: true },
  table_card: { label: "Table card", hint: "Two per page, fold or stand", cols: 1, rows: 2, qr: 3, caption: 20, logo: true },
  bulletin: { label: "Bulletin insert", hint: "Four per page", cols: 2, rows: 2, qr: 2, caption: 13, logo: true },
  sticker: { label: "Sticker", hint: "Twelve per page, 2.5 in square", cols: 3, rows: 4, qr: 1.5, caption: 8, logo: false },
};
const PLAIN_SIZES = [0.75, 1, 1.25, 1.5, 2, 3, 4];
const PAGE_W = 8.5;
const PAGE_H = 11;
const MARGIN = 0.5;
/** Phones struggle when one square of the code prints smaller than this. */
const MIN_MODULE_MM = 0.75;

function specFor(layout: PrintLayout, plainSize: number): LayoutSpec {
  if (layout !== "plain") return LAYOUTS[layout];
  const cell = plainSize + 0.6;
  return {
    label: "Plain",
    hint: "The code and its address only",
    cols: Math.max(1, Math.floor((PAGE_W - 2 * MARGIN) / cell)),
    rows: Math.max(1, Math.floor((PAGE_H - 2 * MARGIN) / (cell + 0.2))),
    qr: plainSize,
    caption: 0,
    logo: false,
  };
}

export function QrPrintPage() {
  const list = useQrList();
  const [params] = useSearchParams();
  const [picked, setPicked] = useState<string[] | null>(null);
  const [layout, setLayout] = useState<PrintLayout>("table_card");
  const [copies, setCopies] = useState(1);
  const [plainSize, setPlainSize] = useState(1.5);
  const log = useLogQrPrint();
  const toast = useToast();

  const items = list.data?.items ?? [];
  useEffect(() => {
    if (picked || !list.data) return;
    const ids = (params.get("ids") ?? "").split(",").filter((id) => list.data.items.some((c) => c.id === id));
    setPicked(ids.length ? ids : list.data.items.filter((c) => c.status === "active").slice(0, 1).map((c) => c.id));
  }, [list.data, params, picked]);

  const chosen = useMemo(() => items.filter((c) => picked?.includes(c.id)), [items, picked]);
  const spec = specFor(layout, plainSize);
  const tiles = chosen.flatMap((c) => Array.from({ length: copies }, () => c));
  const perPage = spec.cols * spec.rows;
  const pages = Array.from({ length: Math.ceil(tiles.length / perPage) }, (_, i) => tiles.slice(i * perPage, (i + 1) * perPage));
  const tooSmall = chosen.filter((c) => (spec.qr * 25.4) / qrModules(c.shortUrl) < MIN_MODULE_MM);
  const notLive = chosen.filter((c) => c.status !== "active");

  const toggle = (id: string) => setPicked((p) => (p?.includes(id) ? p.filter((x) => x !== id) : [...(p ?? []), id]));

  const print = async () => {
    try {
      await log.mutateAsync({ ids: chosen.map((c) => c.id), layout, copies });
    } catch (e) {
      return toast.show(e instanceof ApiError ? e.message : "Could not print.", { tone: "crit" });
    }
    document.documentElement.classList.add("print-qr");
    const done = () => {
      document.documentElement.classList.remove("print-qr");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    window.setTimeout(done, 1000);
  };

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow={
          <Link to="/welcome/qr" className="inline-flex items-center gap-1 hover:text-maroon-700">
            <ArrowLeft className="size-3.5" aria-hidden /> QR codes
          </Link>
        }
        title="Print QR codes"
        tagline="Choose the codes and a layout. In the print window, choose Save as PDF for a print-quality file."
        actions={
          <Button icon={<Printer className="size-4" />} onClick={() => void print()} loading={log.isPending} disabled={!chosen.length} disabledReason="Choose at least one code">
            Print {pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}` : ""}
          </Button>
        }
      />
      {list.isError ? <ErrorBanner>{list.error.message}</ErrorBanner> : null}
      {!list.data ? (
        <Skeleton className="h-125 w-full rounded-3xl" />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card>
              <h2 className="mb-3 font-display text-lg font-semibold text-maroon-950">Codes</h2>
              <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {items.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-cream-100">
                      <input type="checkbox" checked={!!picked?.includes(c.id)} onChange={() => toggle(c.id)} className="size-4.5 shrink-0 accent-maroon-700" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                        <span className="block truncate text-xs text-muted">{shortText(c.shortUrl)}</span>
                      </span>
                      <QrStatusChip status={c.status} />
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2 className="mb-3 font-display text-lg font-semibold text-maroon-950">Layout</h2>
              <div className="grid gap-2" role="radiogroup" aria-label="Layout">
                {(["poster", "table_card", "bulletin", "sticker", "plain"] as const).map((id) => {
                  const s = specFor(id, plainSize);
                  const on = layout === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setLayout(id)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors",
                        on ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-bold text-ink">{s.label}</span>
                        <span className="block text-xs text-muted">{s.hint}</span>
                      </span>
                      <span className="text-xs font-bold text-muted tabular">{s.qr} in</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Field label="Copies of each" htmlFor="qp-copies">
                  <select id="qp-copies" value={copies} onChange={(e) => setCopies(Number(e.target.value))} className={selectClass()}>
                    {[1, 2, 3, 4, 6, 8, 12, 24].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                {layout === "plain" ? (
                  <Field label="Code size" htmlFor="qp-size">
                    <select id="qp-size" value={plainSize} onChange={(e) => setPlainSize(Number(e.target.value))} className={selectClass()}>
                      {PLAIN_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n} in ({(n * 2.54).toFixed(1)} cm)
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
            </Card>
            {tooSmall.length || notLive.length ? (
              <div role="status" className="space-y-2 rounded-2xl border border-warn/25 bg-warn/8 px-4 py-3 text-xs text-ink">
                {tooSmall.length ? (
                  <p className="flex gap-1.5">
                    <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden />
                    <span>
                      <b>Too small to scan reliably</b> at {spec.qr} in: {tooSmall.map((c) => c.name).join(", ")}. Choose a bigger size or layout.
                    </span>
                  </p>
                ) : null}
                {notLive.length ? (
                  <p className="flex gap-1.5">
                    <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden />
                    <span>
                      <b>Not active now:</b> {notLive.map((c) => `${c.name} (${STATUS_LABEL[c.status].toLowerCase()})`).join(", ")}. Printed copies show the “not active”
                      page until the code is on.
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <Card className="min-w-0">
            <h2 className="mb-1 font-display text-lg font-semibold text-maroon-950">Preview</h2>
            <p className="mb-4 text-xs text-muted">US Letter, {pages.length || 0} {pages.length === 1 ? "page" : "pages"}. Dashed lines are cutting guides; posters have none.</p>
            {pages.length ? (
              <Preview>
                {pages.map((p, i) => (
                  <Sheet key={i} tiles={p} spec={spec} />
                ))}
              </Preview>
            ) : (
              <EmptyState title="Nothing to print">Choose at least one code.</EmptyState>
            )}
          </Card>
        </div>
      )}
      {pages.length
        ? createPortal(
            <div className="qr-print-root">
              {pages.map((p, i) => (
                <Sheet key={i} tiles={p} spec={spec} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </motion.div>
  );
}

/** Real-size pages, zoomed to fit the card. */
function Preview({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / (PAGE_W * 96)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="max-h-[80vh] w-full min-w-0 overflow-y-auto rounded-2xl bg-cream-200">
      <div style={{ zoom } as CSSProperties} className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
}

const inch = (n: number) => `${n}in`;

function Sheet({ tiles, spec }: { tiles: QrCode[]; spec: LayoutSpec }) {
  const cellW = (PAGE_W - 2 * MARGIN) / spec.cols;
  const cellH = (PAGE_H - 2 * MARGIN) / spec.rows;
  const cut = spec.cols * spec.rows > 1;
  return (
    <div
      className="qr-sheet bg-white text-[#1a0f12] shadow-card"
      style={{ width: inch(PAGE_W), height: inch(PAGE_H), padding: inch(MARGIN), display: "grid", gridTemplateColumns: `repeat(${spec.cols}, ${inch(cellW)})`, gridAutoRows: inch(cellH) }}
    >
      {tiles.map((c, i) => (
        <div
          key={`${c.id}-${i}`}
          className={cn("flex flex-col items-center justify-center text-center", cut && "outline outline-1 -outline-offset-1 outline-dashed outline-[#d8cfc2]")}
          style={{ gap: inch(Math.min(0.25, spec.qr / 12)), padding: inch(0.15) }}
        >
          {spec.logo ? (
            <span className="flex items-center gap-2" style={{ fontSize: `${Math.max(9, spec.caption * 0.5)}pt` }}>
              <img src="/tkp-logo.png" alt="" style={{ height: inch(Math.max(0.35, spec.qr / 7)) }} />
              <span className="font-display font-semibold">The King's Palace</span>
            </span>
          ) : null}
          {spec.caption ? (
            <p className="font-display leading-tight font-semibold" style={{ fontSize: `${spec.caption}pt`, maxWidth: inch(cellW - 0.4) }}>
              {c.caption}
            </p>
          ) : null}
          <QrImage value={c.shortUrl} title={`QR code: ${c.name}`} className="block shrink-0" style={{ width: inch(spec.qr), height: inch(spec.qr) }} />
          <p className="font-bold" style={{ fontSize: `${Math.max(6, spec.caption ? spec.caption * 0.5 : spec.qr * 6)}pt`, maxWidth: inch(cellW - 0.3), overflowWrap: "anywhere" }}>
            {shortText(c.shortUrl)}
          </p>
        </div>
      ))}
    </div>
  );
}
