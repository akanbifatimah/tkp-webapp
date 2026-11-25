import { ArrowLeft, ArrowRight, Check, CircleAlert, Download, FileWarning, Trash2, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { inputClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { formatWhen, serviceDateLong } from "@/lib/time";
import { download, errorCsv, errorFileName, fileSize } from "./import-files";
import { useCommitImport, useDiscardImport, useImportJob, usePatchImport } from "./import-queries";
import { IMPORT_FIELDS, IMPORT_KIND_LABEL, IMPORT_LIMITS, type ImportJob, type ImportPreviewRow, type ImportSettings, type RowStatus } from "./import-types";

/**
 * The import wizard (PRD W-16; steps as EV-23): start, columns and settings,
 * preview and fix, confirm. The job lives on the server between steps, so a
 * draft can be continued later from the history until it expires.
 */

type Step = "columns" | "preview" | "confirm";
const STEPS: { id: Step | "start"; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "columns", label: "Columns and settings" },
  { id: "preview", label: "Preview and fix" },
  { id: "confirm", label: "Confirm" },
];

export function ImportWizardPage() {
  const { id } = useParams();
  const q = useImportJob(id);
  const [step, setStep] = useState<Step>("columns");
  const job = q.data;

  if (q.isPending) return <Skeleton className="h-96" />;
  if (!job)
    return (
      <EmptyState icon={<FileWarning className="size-6" />} title="This import isn't here">
        It may have expired (drafts are kept for {IMPORT_LIMITS.stagedHours} hours) or been discarded.{" "}
        <Link to="/welcome/import" className="font-semibold text-maroon-700 underline">
          Back to imports
        </Link>
      </EmptyState>
    );

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow={`Import · ${IMPORT_KIND_LABEL[job.kind]}`}
        title={job.fileName}
        tagline={`${fileSize(job.fileSize)} · ${job.counts.total} rows${job.status === "draft" ? ` · kept until ${formatWhen(job.expiresAt)}` : ""}`}
        actions={
          <>
            <Link to="/welcome/import" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink hover:border-maroon-200">
              <ArrowLeft className="size-4" aria-hidden />
              All imports
            </Link>
            {job.status === "draft" ? <DiscardButton job={job} /> : null}
          </>
        }
      />
      {job.status === "draft" ? (
        <>
          <Stepper step={step} />
          {step === "columns" ? <ColumnsStep job={job} onNext={() => setStep("preview")} /> : null}
          {step === "preview" ? <PreviewStep job={job} onBack={() => setStep("columns")} onNext={() => setStep("confirm")} /> : null}
          {step === "confirm" ? <ConfirmStep job={job} onBack={() => setStep("preview")} /> : null}
        </>
      ) : (
        <ResultView job={job} />
      )}
    </motion.div>
  );
}

function Stepper({ step }: { step: Step }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-2" aria-label="Import steps">
      {STEPS.map((s, i) => (
        <li key={s.id} aria-current={i === at ? "step" : undefined} className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
              i < at ? "bg-ok text-white" : i === at ? "bg-maroon-700 text-cream-50" : "bg-cream-200 text-muted",
            )}
          >
            {i < at ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={cn("text-sm font-bold", i === at ? "text-maroon-900" : "text-muted")}>{s.label}</span>
          {i < STEPS.length - 1 ? <span className="mx-1 hidden h-px w-8 bg-line sm:block" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function DiscardButton({ job }: { job: ImportJob }) {
  const discard = useDiscardImport();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      icon={<Trash2 className="size-4" />}
      loading={discard.isPending}
      onClick={async () => {
        const ok = await confirm({
          title: `Discard the import of ${job.fileName}?`,
          body: "The uploaded file and any fixes you made here are deleted. Nothing was imported, so no guest records change.",
          confirmLabel: "Discard import",
        });
        if (!ok) return;
        discard.mutate(job.id, {
          onSuccess: () => {
            toast.show(`${job.fileName} discarded`);
            navigate("/welcome/import");
          },
          onError: (e) => toast.show(e instanceof ApiError ? e.message : "That didn't work. Try again.", { tone: "crit" }),
        });
      }}
    >
      Discard
    </Button>
  );
}

/* ----------------------------------------------------------------- columns and settings */

function ColumnsStep({ job, onNext }: { job: ImportJob; onNext: () => void }) {
  const patch = usePatchImport(job.id);
  const toast = useToast();
  const fields = IMPORT_FIELDS[job.kind];
  const send = (body: Parameters<typeof patch.mutate>[0]) =>
    patch.mutate(body, { onError: (e) => toast.show(e instanceof ApiError ? e.message : "That change didn't save.", { tone: "crit" }) });
  const mapped = new Set(job.columns.map((c) => c.field).filter(Boolean));
  const missing = fields.filter((f) => f.required && !mapped.has(f.key)).map((f) => f.label);
  if (job.kind === "followups" && !mapped.has("phone") && !mapped.has("email")) missing.push("Guest phone or Guest email");
  const set = (s: Partial<ImportSettings>) => send({ settings: s });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="min-w-0">
        <div className="flex flex-wrap items-end gap-4">
          {job.sheets.length > 1 ? (
            <label className="block min-w-48">
              <span className="text-sm font-bold text-ink">Sheet</span>
              <select id="imp-sheet" className={cn(inputClass(), "mt-1.5")} value={job.sheet} onChange={(e) => send({ sheet: e.target.value })}>
                {job.sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.rows} rows)
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block w-44">
            <span className="text-sm font-bold text-ink">Column names are in row</span>
            <select id="imp-header" className={cn(inputClass(), "mt-1.5")} value={job.settings.headerRow} onChange={(e) => set({ headerRow: +e.target.value })}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Row {n}
                </option>
              ))}
            </select>
          </label>
          {patch.isPending ? <span className="pb-3 text-xs font-semibold text-muted">Saving…</span> : null}
        </div>

        <h2 className="mt-6 font-display text-lg font-semibold text-maroon-900">Match the columns</h2>
        <p className="text-sm text-muted">We matched what we could from the column names. Check the ones marked “Check this”.</p>
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
          {job.columns.map((c) => (
            <li key={c.index} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <b className="truncate text-ink">{c.header}</b>
                  {c.field ? (
                    c.confidence >= 1 ? (
                      <Chip tone="ok">Matched</Chip>
                    ) : (
                      <Chip tone="warn">Check this</Chip>
                    )
                  ) : (
                    <Chip tone="neutral">{job.settings.unmapped === "notes" ? "Goes to notes" : "Left out"}</Chip>
                  )}
                </p>
                <p className="truncate text-xs text-muted">{c.samples.length ? c.samples.join(" · ") : "Empty column"}</p>
              </div>
              <select
                aria-label={`Field for the column ${c.header}`}
                className={inputClass()}
                value={c.field ?? ""}
                onChange={(e) => send({ mapping: { [c.index]: e.target.value || null } })}
              >
                <option value="">Leave out</option>
                {fields.map((f) => {
                  const other = job.columns.find((x) => x.field === f.key && x.index !== c.index);
                  return (
                    <option key={f.key} value={f.key}>
                      {f.label}
                      {f.required ? " (required)" : ""}
                      {other ? ` · now “${other.header}”` : ""}
                    </option>
                  );
                })}
              </select>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4">
        <Card>
          <h2 className="font-display text-lg font-semibold text-maroon-900">Settings</h2>
          <fieldset className="mt-3">
            <legend className="text-sm font-bold text-ink">Dates like 3/4/2025 mean</legend>
            {(
              [
                ["MDY", "4 March (month first, as in the US)"],
                ["DMY", "3 April (day first)"],
              ] as const
            ).map(([v, label]) => (
              <Radio key={v} name="imp-dates" checked={job.settings.dateOrder === v} onChange={() => set({ dateOrder: v })}>
                {label}
              </Radio>
            ))}
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-sm font-bold text-ink">Columns that match nothing</legend>
            <Radio name="imp-unmapped" checked={job.settings.unmapped === "notes"} onChange={() => set({ unmapped: "notes" })}>
              Add them to the {job.kind === "guests" ? "comments" : "note"}
            </Radio>
            <Radio name="imp-unmapped" checked={job.settings.unmapped === "ignore"} onChange={() => set({ unmapped: "ignore" })}>
              Leave them out
            </Radio>
          </fieldset>
          {job.kind === "guests" ? (
            <>
              <label className="mt-4 block">
                <span className="text-sm font-bold text-ink">Service when the file has none</span>
                <select id="imp-service" className={cn(inputClass(), "mt-1.5")} value={job.settings.defaultService ?? ""} onChange={(e) => set({ defaultService: e.target.value || null })}>
                  <option value="">None: those rows need fixing</option>
                  {job.services.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="mt-4">
                <legend className="text-sm font-bold text-ink">New guests from the file</legend>
                <Radio name="imp-follow" checked={job.settings.followUp === "history"} onChange={() => set({ followUp: "history" })}>
                  History only: no follow-up starts
                </Radio>
                <Radio name="imp-follow" checked={job.settings.followUp === "start"} onChange={() => set({ followUp: "start" })}>
                  Start follow-up for visits in the last 14 days
                </Radio>
              </fieldset>
            </>
          ) : (
            <fieldset className="mt-4">
              <legend className="text-sm font-bold text-ink">Team when the file has none</legend>
              <Radio name="imp-team" checked={job.settings.defaultTeam === "church_office"} onChange={() => set({ defaultTeam: "church_office" })}>
                Church office
              </Radio>
              <Radio name="imp-team" checked={job.settings.defaultTeam === "integration"} onChange={() => set({ defaultTeam: "integration" })}>
                Integration Team
              </Radio>
            </fieldset>
          )}
        </Card>
        {missing.length ? (
          <p role="status" className="flex gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Choose a column for <b>{missing.join(" and ")}</b> to go on.
            </span>
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button icon={<ArrowRight className="size-4" />} disabled={missing.length > 0} disabledReason="Match the required columns first" onClick={onNext}>
            Preview {job.counts.total} rows
          </Button>
        </div>
      </div>
    </div>
  );
}

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 shrink-0 accent-maroon-700" />
      <span>{children}</span>
    </label>
  );
}

/* ----------------------------------------------------------------- preview and fix */

const STATUS_CHIP: Record<RowStatus, { label: string; tone: "ok" | "gold" | "neutral" | "crit" }> = {
  new: { label: "New", tone: "ok" },
  update: { label: "Changes", tone: "gold" },
  unchanged: { label: "Already here", tone: "neutral" },
  error: { label: "To fix", tone: "crit" },
};
type Filter = RowStatus | "all" | "warnings";
const PAGE = 50;

export function PreviewTable({ job, readOnly }: { job: ImportJob; readOnly?: boolean }) {
  const [filter, setFilter] = useState<Filter>(job.counts.error && !readOnly ? "error" : "all");
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () => job.rows.filter((r) => filter === "all" || (filter === "warnings" ? r.warnings.length > 0 : r.status === filter)),
    [job.rows, filter],
  );
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pills: [Filter, string, number][] = [
    ["all", "All", job.counts.total],
    ["new", "New", job.counts.new],
    ["update", "Changes", job.counts.update],
    ["unchanged", "Already here", job.counts.unchanged],
    ["error", "To fix", job.counts.error],
    ["warnings", "With a warning", job.counts.warnings],
  ];
  const guests = job.kind === "guests";

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show rows">
        {pills.map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => {
              setFilter(id);
              setPage(0);
            }}
            className={cn(
              "h-8 rounded-full border px-3 text-xs font-bold transition-colors",
              filter === id ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-line bg-white text-ink hover:border-maroon-200",
            )}
          >
            {label} · {n}
          </button>
        ))}
      </div>
      {/* relative: keeps the sr-only labels in the Fix cells inside this scroll box on phones. */}
      <div className="relative overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-200 text-left text-sm">
          <thead className="bg-cream-100 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-bold">Row</th>
              <th className="px-3 py-2 font-bold">Status</th>
              <th className="px-3 py-2 font-bold">{guests ? "Visit" : "Contact"}</th>
              <th className="px-3 py-2 font-bold">{guests ? "Guest" : "Caller"}</th>
              <th className="px-3 py-2 font-bold">Matched to</th>
              <th className="px-3 py-2 font-bold">What to know</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={r.rowNo} className={cn("align-top", r.status === "error" && "bg-crit-soft/30")}>
                <td className="px-3 py-2.5 font-semibold text-muted tabular">{r.rowNo}</td>
                <td className="px-3 py-2.5">
                  <Chip tone={STATUS_CHIP[r.status].tone}>{STATUS_CHIP[r.status].label}</Chip>
                  {r.fixed.length ? <span className="mt-1 block text-xs text-muted">Fixed here</span> : null}
                </td>
                <td className="px-3 py-2.5 text-ink">{guests ? <VisitCell r={r} /> : <ContactCell r={r} />}</td>
                <td className="px-3 py-2.5 text-ink">
                  {guests ? (
                    <>
                      <b>{[r.values.firstName, r.values.lastName].filter(Boolean).join(" ") || "No name"}</b>
                      <span className="block text-xs text-muted">{[r.values.phone, r.values.email].filter(Boolean).join(" · ") || "No phone or email"}</span>
                    </>
                  ) : (
                    <>
                      <b>{r.values.caller ?? "No caller"}</b>
                      <span className="block text-xs text-muted">
                        {r.values.team} · {r.values.method}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-ink">{r.match ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <Issues r={r} job={job} readOnly={readOnly} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <p className="px-4 py-6 text-center text-sm text-muted">No rows here.</p> : null}
      </div>
      {rows.length > PAGE ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted">
            {page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} of {rows.length}
          </span>
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="ghost" size="sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function VisitCell({ r }: { r: ImportPreviewRow }) {
  const d = r.values.serviceDate;
  return (
    <>
      <b>{d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? serviceDateLong(d) : (d ?? "No date")}</b>
      <span className="block text-xs text-muted">{r.values.serviceType ?? "No service"}</span>
    </>
  );
}

function ContactCell({ r }: { r: ImportPreviewRow }) {
  const d = r.values.date;
  return (
    <>
      <b>{d && d.endsWith("Z") ? formatWhen(d) : (d ?? "No date")}</b>
      <span className="block max-w-64 truncate text-xs text-muted">{r.values.note ?? r.values.callOutcome ?? ""}</span>
    </>
  );
}

function Issues({ r, job, readOnly }: { r: ImportPreviewRow; job: ImportJob; readOnly?: boolean }) {
  if (!r.errors.length && !r.warnings.length && !r.changes.length) return <span className="text-xs text-muted">—</span>;
  const label = (k: string) => IMPORT_FIELDS[job.kind].find((f) => f.key === k)?.label ?? k;
  return (
    <ul className="space-y-1.5 text-xs">
      {r.errors.map((e, i) => (
        <li key={`e${i}`} className="text-crit">
          <span className="flex gap-1.5 font-semibold">
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {e.message}
          </span>
          {e.field && !readOnly ? <FixCell job={job} rowNo={r.rowNo} field={e.field} /> : null}
        </li>
      ))}
      {r.warnings.map((w, i) => (
        <li key={`w${i}`} className="flex gap-1.5 text-warn">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {w}
        </li>
      ))}
      {r.changes.map((c) => (
        <li key={c.field} className="text-ink">
          <b>{label(c.field)}</b>: <span className="text-muted line-through">{c.from ?? "blank"}</span> → {c.to ?? "blank"}
        </li>
      ))}
    </ul>
  );
}

/** Fix one cell in place (EV-23 "fix in place"). The server checks it again. */
function FixCell({ job, rowNo, field }: { job: ImportJob; rowNo: number; field: string }) {
  const patch = usePatchImport(job.id);
  const [value, setValue] = useState("");
  const def = IMPORT_FIELDS[job.kind].find((f) => f.key === field);
  const id = `fix-${rowNo}-${field}`;
  const save = () => patch.mutate({ fixes: [{ rowNo, field, value: value.trim() || null }] });
  const options = field === "serviceType" ? job.services : def?.options;
  return (
    <form
      className="mt-1.5 flex max-w-72 gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {def?.label ?? field} for row {rowNo}
      </label>
      {options ? (
        <select id={id} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-xs text-ink">
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={def?.type === "date" || def?.type === "datetime" ? "e.g. 3/2/2025" : (def?.label ?? "")}
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-xs text-ink"
        />
      )}
      <Button type="submit" size="sm" variant="ghost" loading={patch.isPending} disabled={!value.trim()}>
        Fix
      </Button>
    </form>
  );
}

function PreviewStep({ job, onBack, onNext }: { job: ImportJob; onBack: () => void; onNext: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Rows marked “To fix” are left out unless you fix them here. You can also fix them in the file and upload it again. A row already here is never added twice.
      </p>
      <PreviewTable job={job} />
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
          Columns and settings
        </Button>
        <Button icon={<ArrowRight className="size-4" />} onClick={onNext}>
          Review and import
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- confirm and result */

function ConfirmStep({ job, onBack }: { job: ImportJob; onBack: () => void }) {
  const [mode, setMode] = useState<"add" | "update">(job.settings.mode);
  const [key] = useState(() => crypto.randomUUID());
  const commit = useCommitImport();
  const toast = useToast();
  const c = job.counts;
  const going = c.new + (mode === "update" ? c.update : 0);
  const linked = job.rows.filter((r) => r.status === "new" && r.match?.startsWith("Existing guest")).length;
  const what = job.kind === "guests" ? "guest visits" : "follow-up notes";

  return (
    <Card className="max-w-3xl space-y-5">
      <h2 className="font-display text-xl font-semibold text-maroon-900">Ready to import</h2>
      <ul className="space-y-2 text-sm text-ink">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
          <span>
            <b>{c.new}</b> new {what}
            {job.kind === "guests" && c.new ? ` (${linked} for guests already in TKP Hub, the rest for new guests)` : ""}.
          </span>
        </li>
        {c.update ? (
          <li className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-gold-700" aria-hidden />
            <span>
              <b>{c.update}</b> already here with different details.
            </span>
          </li>
        ) : null}
        <li className="flex gap-2 text-muted">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <b>{c.unchanged}</b> already here and the same: skipped.
          </span>
        </li>
        {c.error ? (
          <li className="flex flex-wrap items-center gap-2 text-crit">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span>
              <b>{c.error}</b> to fix won't be imported.
            </span>
            <Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={() => download(errorFileName(job), errorCsv(job))}>
              Download the rows to fix
            </Button>
          </li>
        ) : null}
      </ul>

      {c.update ? (
        <fieldset>
          <legend className="text-sm font-bold text-ink">The {c.update} with different details</legend>
          <Radio name="imp-mode" checked={mode === "add"} onChange={() => setMode("add")}>
            Leave them as they are (add new rows only)
          </Radio>
          <Radio name="imp-mode" checked={mode === "update"} onChange={() => setMode("update")}>
            Update them from the file. A blank cell never clears a value.
          </Radio>
        </fieldset>
      ) : null}

      <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-muted">
        Nothing is sent to guests or staff.{" "}
        {job.kind === "guests"
          ? job.settings.followUp === "history"
            ? "New guests are added as history: no follow-up starts."
            : "Follow-up starts for new guests who visited in the last 14 days; older ones are history."
          : "Notes are added to each guest's history; journeys don't change."}{" "}
        You can undo this import for {IMPORT_LIMITS.undoDays} days.
      </p>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
          Preview and fix
        </Button>
        <Button
          icon={<Check className="size-4" />}
          loading={commit.isPending}
          disabled={going === 0}
          disabledReason="Nothing new to import"
          onClick={() =>
            commit.mutate(
              { id: job.id, mode, key },
              {
                onSuccess: (s) => toast.show(`${s.result?.added ?? 0} added, ${s.result?.updated ?? 0} updated from ${job.fileName}`),
                onError: (e) => toast.show(e instanceof ApiError ? e.message : "The import didn't go through. Nothing was saved.", { tone: "crit" }),
              },
            )
          }
        >
          Import {going} {going === 1 ? "row" : "rows"}
        </Button>
      </div>
    </Card>
  );
}

function ResultView({ job }: { job: ImportJob }) {
  const r = job.result;
  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <p className="flex flex-wrap items-center gap-2">
          <Chip tone={job.status === "undone" ? "neutral" : "ok"}>{job.status === "undone" ? "Undone" : "Imported"}</Chip>
          <span className="text-sm text-muted">
            {job.committedAt ? `by ${job.committedBy ?? "someone"} · ${formatWhen(job.committedAt)}` : ""}
            {job.undoneAt ? ` · undone by ${job.undoneBy ?? "someone"} · ${formatWhen(job.undoneAt)}` : ""}
          </span>
        </p>
        {r ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Added", r.added],
                ["Updated", r.updated],
                ["Already here", r.unchanged],
                ["Not imported", r.failed],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-cream-100 px-4 py-3">
                <dt className="text-xs font-bold text-muted">{k}</dt>
                <dd className={cn("font-display text-2xl font-semibold tabular", k === "Not imported" && v ? "text-crit" : "text-maroon-900")}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {r?.failed ? (
            <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => download(errorFileName(job), errorCsv(job))}>
              Download the rows to fix
            </Button>
          ) : null}
          {job.status === "committed" && job.undoUntil ? <p className="self-center text-sm text-muted">Undo from the import list until {formatWhen(job.undoUntil)}.</p> : null}
        </div>
      </Card>
      <PreviewTable job={job} readOnly />
    </div>
  );
}
