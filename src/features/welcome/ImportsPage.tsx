import { Download, FileSpreadsheet, FileUp, History, Undo2, Users, PhoneCall } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { download, errorCsv, errorFileName, fileSize, templateCsv } from "./import-files";
import { useImports, useUndoImport, useUploadImport } from "./import-queries";
import { IMPORT_KIND_LABEL, IMPORT_LIMITS, type ImportKind, type ImportSummary } from "./import-types";

/**
 * Welcome › Import (PRD W-16, WT-7): start an import, and the history of
 * imports with undo for 30 days. The wizard itself is ImportWizardPage.
 */

const KIND_HINT: Record<ImportKind, string> = {
  guests: "Welcome cards and form exports from before TKP Hub. Each row is one visit.",
  followups: "Call notes from the old follow-up tracker. Each row is one contact with a guest who is already here.",
};


export function ImportsPage() {
  const q = useImports();
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="Welcome" title="Import" tagline="Bring in past guest entries and follow-up tracker records from Excel or CSV." />
      <StartPanel followups={q.data?.can.followups ?? false} />
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-maroon-900">Past imports</h2>
        {q.isError ? (
          <ErrorBanner action={<Button variant="ghost" size="sm" onClick={() => void q.refetch()}>Try again</Button>}>We couldn't load the imports.</ErrorBanner>
        ) : q.data ? (
          q.data.items.length ? (
            <div className="space-y-3">
              {q.data.items.map((i) => (
                <HistoryRow key={i.id} item={i} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<History className="size-6" />} title="No imports yet">
              Imports show here with what they added. Each one can be undone for {IMPORT_LIMITS.undoDays} days.
            </EmptyState>
          )
        ) : (
          <Skeleton className="h-24" />
        )}
      </section>
    </motion.div>
  );
}

function StartPanel({ followups }: { followups: boolean }) {
  const [kind, setKind] = useState<ImportKind>("guests");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadImport();
  const navigate = useNavigate();
  const toast = useToast();

  const send = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(
      { kind, file },
      {
        onSuccess: (job) => navigate(`/welcome/import/${job.id}`),
        onError: (e) => toast.show(e instanceof ApiError ? e.message : "The upload didn't go through. Try again.", { tone: "crit" }),
      },
    );
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    send(e.dataTransfer.files[0]);
  };

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-maroon-900">New import</h2>
      <p className="mt-0.5 text-sm text-muted">Nothing is saved until the last step, and nothing is ever sent to guests.</p>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-bold text-ink">1. What's in the file?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(followups ? (["guests", "followups"] as const) : (["guests"] as const)).map((k) => (
            <label
              key={k}
              className={cn(
                "flex cursor-pointer gap-3 rounded-2xl border bg-white p-4 transition-colors",
                kind === k ? "border-maroon-600 ring-2 ring-maroon-600/15" : "border-line hover:border-maroon-200",
              )}
            >
              <input type="radio" name="import-kind" checked={kind === k} onChange={() => setKind(k)} className="mt-1 shrink-0 accent-maroon-700" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-bold text-ink">
                  {k === "guests" ? <Users className="size-4 text-maroon-700" aria-hidden /> : <PhoneCall className="size-4 text-maroon-700" aria-hidden />}
                  {IMPORT_KIND_LABEL[k]}
                </span>
                <span className="mt-0.5 block text-sm text-muted">{KIND_HINT[k]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <p className="mb-2 text-sm font-bold text-ink">2. Choose the file</p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn("grid place-items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors", over ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-cream-50")}
        >
          <FileUp className="size-8 text-maroon-700" aria-hidden />
          <p className="text-sm text-ink">Drop an .xlsx or .csv file here, or</p>
          <Button icon={<FileSpreadsheet className="size-4" />} loading={upload.isPending} onClick={() => input.current?.click()}>
            Choose a file
          </Button>
          <input
            ref={input}
            id="import-file"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            onChange={(e) => {
              send(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted">
            Up to 10 MB and {IMPORT_LIMITS.maxRows.toLocaleString()} rows. Files with macros (.xlsm) are refused, and formulas are never run.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-maroon-700 hover:underline" onClick={() => download(`TKP ${IMPORT_KIND_LABEL[kind].toLowerCase()} template.csv`, templateCsv(kind))}>
          <Download className="size-4" aria-hidden />
          Download the template
        </button>
        {env.useMocks ? (
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            Fictional samples to try:
            <a className="font-semibold text-maroon-700 hover:underline" href="/samples/tkp-guests-sample.xlsx" download>
              guests (.xlsx)
            </a>
            {followups ? (
              <a className="font-semibold text-maroon-700 hover:underline" href="/samples/tkp-followups-sample.csv" download>
                follow-up records (.csv)
              </a>
            ) : null}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

const STATUS: Record<ImportSummary["status"], { label: string; tone: "ok" | "neutral" | "warn" | "gold" }> = {
  draft: { label: "Not imported yet", tone: "gold" },
  committed: { label: "Imported", tone: "ok" },
  undone: { label: "Undone", tone: "neutral" },
  discarded: { label: "Discarded", tone: "neutral" },
};

function HistoryRow({ item }: { item: ImportSummary }) {
  const undo = useUndoImport();
  const confirm = useConfirm();
  const toast = useToast();
  const [fetching, setFetching] = useState(false);
  const canUndo = item.status === "committed" && !!item.undoUntil && item.undoUntil > new Date().toISOString();
  const r = item.result;
  const what = item.kind === "guests" ? "guest entries" : "follow-up notes";

  const runUndo = async () => {
    const ok = await confirm({
      title: `Undo the import of ${item.fileName}?`,
      body: (
        <>
          The {r?.added ?? 0} {what} it added are removed{r?.newGuests ? `, with the ${r.newGuests} guests it created` : ""}
          {r?.updated ? `, and the ${r.updated} it changed go back to how they were` : ""}. The file can be imported again later.
        </>
      ),
      confirmLabel: "Undo import",
    });
    if (!ok) return;
    const go = (force: boolean) =>
      undo.mutate(
        { id: item.id, force },
        {
          onSuccess: () => toast.show(`The import of ${item.fileName} was undone`),
          onError: async (e) => {
            if (e instanceof ApiError && e.code === "CHANGED_SINCE") {
              const list = e.fields?.changed ?? [];
              const again = await confirm({
                title: "Some of it was worked on since",
                body: (
                  <>
                    <p>Undoing also removes this work:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {list.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </>
                ),
                confirmLabel: "Undo anyway",
              });
              if (again) go(true);
            } else toast.show(e instanceof ApiError ? e.message : "That didn't work. Try again.", { tone: "crit" });
          },
        },
      );
    go(false);
  };

  const errorFile = async () => {
    setFetching(true);
    try {
      const job = await api.imports.get(item.id);
      download(errorFileName(job), errorCsv(job));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "The error file couldn't be made.", { tone: "crit" });
    } finally {
      setFetching(false);
    }
  };

  return (
    <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1 basis-72">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate font-bold text-ink">{item.fileName}</span>
          <Chip tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Chip>
          <Chip tone="neutral">{IMPORT_KIND_LABEL[item.kind]}</Chip>
        </p>
        <p className="mt-1 text-sm text-ink">
          {r ? (
            <>
              {r.added} added{r.newGuests ? ` (${r.newGuests} new guests)` : ""} · {r.updated} updated · {r.unchanged} unchanged
              {r.failed ? <span className="font-semibold text-crit"> · {r.failed} not imported</span> : null}
            </>
          ) : (
            <>
              {item.counts.total} rows · {item.counts.error} to fix
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {fileSize(item.fileSize)} ·{" "}
          {item.committedAt ? `Imported by ${item.committedBy ?? "someone"} · ${formatWhen(item.committedAt)}` : `Uploaded ${formatWhen(item.createdAt)} · kept until ${formatWhen(item.expiresAt)}`}
          {item.undoneAt ? ` · undone by ${item.undoneBy ?? "someone"} · ${formatWhen(item.undoneAt)}` : ""}
          {canUndo ? ` · can be undone until ${formatWhen(item.undoUntil!)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {item.status === "draft" ? (
          <Link to={`/welcome/import/${item.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-maroon-700 px-3 text-[13px] font-bold text-cream-50 hover:bg-maroon-600">
            Continue
          </Link>
        ) : null}
        {r?.failed ? (
          <Button variant="ghost" size="sm" icon={<Download className="size-4" />} loading={fetching} onClick={() => void errorFile()}>
            Rows to fix
          </Button>
        ) : null}
        {canUndo ? (
          <Button variant="ghost" size="sm" icon={<Undo2 className="size-4" />} loading={undo.isPending} onClick={() => void runUndo()}>
            Undo import
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
