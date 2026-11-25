import { CalendarClock, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useServiceOptions } from "@/features/admin/config-queries";
import { inputClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useCreateSchedule, useRecipients, useShareReport, useUpdateSchedule } from "./report-queries";
import { PERIOD_LABEL, REPORTS, type Period, type ReportDef, type ReportId, type Schedule, type ShareFormat } from "./report-types";

/**
 * Share a report now, or on a schedule (PRD W-9, PL-4). Only staff who may
 * open the report themselves can be chosen: a share never widens access.
 */

const FORMAT_LABEL: Record<ShareFormat, string> = {
  link: "A link to the report in TKP Hub (sign-in needed)",
  pdf: "The report as a PDF",
  csv: "The numbers as a CSV file",
};
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function RecipientPicker({ reportId, value, onChange, error }: { reportId: ReportId; value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const q = useRecipients(reportId);
  if (!q.data) return <Skeleton className="h-40" />;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset>
      <legend className="text-sm font-bold text-ink">Send to</legend>
      <p className="text-xs text-muted">Only people who can open this report themselves can be chosen.</p>
      <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-white">
        {q.data.items.map((p) => (
          <li key={p.id}>
            <label className={cn("flex items-center gap-3 px-3.5 py-2.5", p.eligible ? "cursor-pointer hover:bg-cream-50" : "cursor-not-allowed opacity-55")}>
              <input type="checkbox" className="size-4 shrink-0 accent-maroon-700" checked={value.includes(p.id)} disabled={!p.eligible} onChange={() => toggle(p.id)} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="block truncate text-xs text-muted">{p.eligible ? p.roles : `${p.roles} · ${p.reason}`}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-1.5 text-xs font-semibold text-crit">{error}</p> : null}
    </fieldset>
  );
}

function Choices<T extends string>({ name, legend, options, value, onChange, label }: { name: string; legend: string; options: T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-ink">{legend}</legend>
      {options.map((o) => (
        <label key={o} className="mt-2 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
          <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} className="mt-0.5 shrink-0 accent-maroon-700" />
          <span>{label(o)}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ServiceSelect({ id, value, onChange }: { id: string; value: string | null; onChange: (v: string | null) => void }) {
  const services = useServiceOptions();
  return (
    <label className="block">
      <span className="text-sm font-bold text-ink">Service</span>
      <select id={id} className={cn(inputClass(), "mt-1.5")} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">All services</option>
        {services.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
            {s.retired ? " (retired)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

const footer = (children: React.ReactNode) => <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;

export function ShareDialog({ report, initial, onClose }: { report: ReportDef | null; initial?: { period?: Period; serviceType?: string | null }; onClose: () => void }) {
  return (
    <Dialog open={!!report} onClose={onClose} subtitle="Share now" title={report?.title ?? ""}>
      {report ? <ShareForm key={report.id} report={report} initial={initial} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ShareForm({ report, initial, onClose }: { report: ReportDef; initial?: { period?: Period; serviceType?: string | null }; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>(initial?.period && report.periods.includes(initial.period) ? initial.period : report.periods[0]!);
  const [serviceType, setServiceType] = useState<string | null>(initial?.serviceType ?? null);
  const [format, setFormat] = useState<ShareFormat>(report.formats.includes("pdf") ? "pdf" : report.formats[0]!);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | undefined>();
  const share = useShareReport();
  const toast = useToast();
  const send = () => {
    if (!recipients.length) return setError("Choose at least one person");
    share.mutate(
      { id: report.id, body: { period, serviceType, format, recipients, message: message.trim() || null } },
      {
        onSuccess: (r) => {
          onClose();
          toast.show(`${report.title} (${r.period}) sent to ${r.sentTo.length} ${r.sentTo.length === 1 ? "person" : "people"}`);
        },
        onError: (e) => setError(e instanceof ApiError ? (e.fields?.recipients?.[0] ?? e.message) : "It didn't send. Try again."),
      },
    );
  };
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          <Choices name="share-period" legend="Period" options={report.periods} value={period} onChange={setPeriod} label={(p) => PERIOD_LABEL[p]} />
          {report.id !== "lcm-pack" ? <ServiceSelect id="share-service" value={serviceType} onChange={setServiceType} /> : null}
          <Choices name="share-format" legend="What they get" options={report.formats} value={format} onChange={setFormat} label={(f) => FORMAT_LABEL[f]} />
          <label className="block">
            <span className="text-sm font-bold text-ink">Message (optional)</span>
            <textarea id="share-message" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10" />
          </label>
        </div>
        <RecipientPicker
          reportId={report.id}
          value={recipients}
          onChange={(v) => {
            setRecipients(v);
            setError(undefined);
          }}
          error={error}
        />
      </div>
      <div className="sticky -bottom-5 z-10 -mx-5 mt-6 -mb-5 border-t border-line bg-white px-5 py-3 sm:-mx-6 sm:px-6">
        {footer(
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button icon={<Send className="size-4" />} loading={share.isPending} onClick={send}>
              Send to {recipients.length || "…"} {recipients.length === 1 ? "person" : "people"}
            </Button>
          </>,
        )}
      </div>
    </>
  );
}

export type ScheduleDialogMode = { kind: "new"; reportId?: ReportId; period?: Period; serviceType?: string | null } | { kind: "edit"; schedule: Schedule };

export function ScheduleDialog({ mode, onClose }: { mode: ScheduleDialogMode | null; onClose: () => void }) {
  return (
    <Dialog open={!!mode} onClose={onClose} subtitle={mode?.kind === "edit" ? "Change schedule" : "Schedule sharing"} title={mode?.kind === "edit" ? mode.schedule.name : "New schedule"} className="max-w-3xl">
      {mode ? <ScheduleForm key={mode.kind === "edit" ? mode.schedule.id : "new"} mode={mode} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ScheduleForm({ mode, onClose }: { mode: ScheduleDialogMode; onClose: () => void }) {
  const s = mode.kind === "edit" ? mode.schedule : null;
  const shareable = REPORTS.filter((r) => r.shareable);
  const seed = mode.kind === "new" ? mode : null;
  const [reportId, setReportId] = useState<ReportId>(s?.reportId ?? seed?.reportId ?? "lcm-pack");
  const report = shareable.find((r) => r.id === reportId) ?? shareable[0]!;
  const [name, setName] = useState(s?.name ?? "");
  const [period, setPeriod] = useState<Period>(s?.period ?? (seed?.period && report.periods.includes(seed.period) ? seed.period : report.periods[0]!));
  const [serviceType, setServiceType] = useState<string | null>(s?.serviceType ?? seed?.serviceType ?? null);
  const [frequency, setFrequency] = useState<"monthly" | "weekly">(s?.frequency ?? "monthly");
  const [day, setDay] = useState(s?.day ?? 2);
  const [time, setTime] = useState(s?.time ?? "08:00");
  const [format, setFormat] = useState<ShareFormat>(s?.format ?? "pdf");
  const [recipients, setRecipients] = useState<string[]>(s?.recipients.map((r) => r.id) ?? []);
  const [message, setMessage] = useState(s?.message ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const toast = useToast();
  const periods = report.periods;
  const formats = report.formats;
  const pickReport = (id: ReportId) => {
    const r = shareable.find((x) => x.id === id)!;
    setReportId(id);
    if (!r.periods.includes(period)) setPeriod(r.periods[0]!);
    if (!r.formats.includes(format)) setFormat(r.formats.includes("pdf") ? "pdf" : r.formats[0]!);
    setRecipients([]);
  };

  const save = () => {
    const body = { reportId, name: name.trim(), period, serviceType, frequency, day, time, format, recipients, message: message.trim() || null };
    const local: Record<string, string> = {};
    if (body.name.length < 2) local.name = "Give it a name";
    if (!recipients.length) local.recipients = "Choose at least one person";
    setErrors(local);
    if (Object.keys(local).length) return;
    const done = {
      onSuccess: (x: Schedule) => {
        onClose();
        toast.show(s ? `${x.name} saved` : `${x.name} scheduled`);
      },
      onError: (e: Error) => {
        if (e instanceof ApiError && e.fields) setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, v[0] ?? ""])));
        else toast.show(e instanceof ApiError ? e.message : "It didn't save. Try again.", { tone: "crit" });
      },
    };
    if (s) update.mutate({ id: s.id, body: { ...body, rowVer: s.rowVer } }, done);
    else create.mutate(body, done);
  };

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-ink">Name</span>
            <input id="sch-name" data-autofocus className={cn(inputClass(!!errors.name), "mt-1.5")} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. LCM pack for the council" />
            {errors.name ? <span className="mt-1 block text-xs font-semibold text-crit">{errors.name}</span> : null}
          </label>
          <label className="block">
            <span className="text-sm font-bold text-ink">Report</span>
            <select id="sch-report" className={cn(inputClass(), "mt-1.5")} value={reportId} onChange={(e) => pickReport(e.target.value as ReportId)}>
              {shareable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-ink">Period each time</span>
            <select id="sch-period" className={cn(inputClass(), "mt-1.5")} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          {reportId !== "lcm-pack" ? <ServiceSelect id="sch-service" value={serviceType} onChange={setServiceType} /> : null}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem] gap-2">
            <label className="block">
              <span className="text-sm font-bold text-ink">How often</span>
              <select
                id="sch-frequency"
                className={cn(inputClass(), "mt-1.5")}
                value={frequency}
                onChange={(e) => {
                  const f = e.target.value as "monthly" | "weekly";
                  setFrequency(f);
                  setDay(f === "monthly" ? 2 : 1);
                }}
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-ink">{frequency === "monthly" ? "Day" : "On"}</span>
              <select id="sch-day" className={cn(inputClass(!!errors.day), "mt-1.5")} value={day} onChange={(e) => setDay(+e.target.value)}>
                {frequency === "monthly"
                  ? Array.from({ length: 28 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))
                  : WEEKDAYS.map((w, i) => (
                      <option key={w} value={i}>
                        {w}
                      </option>
                    ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-ink">At</span>
              <input id="sch-time" type="time" className={cn(inputClass(!!errors.time), "mt-1.5")} value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted">Church time (Central). Days stop at 28 so every month has one.</p>
          <Choices name="sch-format" legend="What they get" options={formats} value={formats.includes(format) ? format : formats[0]!} onChange={setFormat} label={(f) => FORMAT_LABEL[f]} />
          <label className="block">
            <span className="text-sm font-bold text-ink">Message (optional)</span>
            <textarea id="sch-message" rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10" />
          </label>
        </div>
        <RecipientPicker reportId={reportId} value={recipients} onChange={setRecipients} error={errors.recipients} />
      </div>
      <div className="sticky -bottom-5 z-10 -mx-5 mt-6 -mb-5 border-t border-line bg-white px-5 py-3 sm:-mx-6 sm:px-6">
        {footer(
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button icon={<CalendarClock className="size-4" />} loading={create.isPending || update.isPending} onClick={save}>
              {s ? "Save changes" : "Schedule it"}
            </Button>
          </>,
        )}
      </div>
    </>
  );
}
