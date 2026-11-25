import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Printer, QrCode as QrIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { Field, inputClass, selectClass } from "@/features/admin/parts";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fromChurchLocal, toChurchLocal } from "@/lib/time";
import { DEST_ICON } from "./qr-parts";
import { useCreateQr, useSetQrDates, useUpdateQr } from "./qr-queries";
import { DESTINATION_LABEL, DESTINATIONS, NEEDS_TARGET, type DestinationType, type QrCode, type QrInput, type QrListResponse } from "./qr-types";

/**
 * Add and change QR codes; quick edit of the dates (PRD QR-1, QR-4, QR-7, QR-8).
 * One "Add a QR code" form for both a new code and one already printed (TKP,
 * 2026-11-25): an already-printed code takes the link it opens. Problems are
 * errors that keep Save off until fixed; there are no warnings.
 */

export type QrDialogMode = { kind: "new" } | { kind: "edit"; code: QrCode };

const HINT: Record<DestinationType, string> = {
  guest_form: "The full welcome form.",
  short_form: "Fewer questions, for busy services.",
  plan_visit: "For people who have not come yet.",
  event: "An event's page.",
  course: "A course sign-up.",
  prayer_wall: "Share a prayer request.",
};

/** datetime-local values are church time; the API takes UTC (PRD 8.3). */
const toUtc = (local: string) => (local ? fromChurchLocal(local) : null);
const toLocal = (iso: string | null) => (iso ? toChurchLocal(iso) : "");

const schema = z
  .object({
    name: z.string().trim().min(2, "Give the code a name").max(60, "Keep the name under 60 characters"),
    destination: z.enum(DESTINATIONS),
    targetId: z.string(),
    serviceId: z.string(),
    activeFrom: z.string(),
    expiresAt: z.string(),
    noExpiry: z.boolean(),
    caption: z.string().trim().max(60, "Keep the caption under 60 characters"),
    note: z.string().trim().max(500, "Keep the note under 500 characters"),
    printed: z.boolean(),
    legacyUrl: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.printed && !/^https?:\/\/\S+\.\S+/.test(v.legacyUrl))
      ctx.addIssue({ code: "custom", path: ["legacyUrl"], message: v.legacyUrl ? "Enter the full link, starting with https://" : "Paste the link the printed code opens" });
    if (NEEDS_TARGET.includes(v.destination) && !v.targetId)
      ctx.addIssue({ code: "custom", path: ["targetId"], message: v.destination === "event" ? "Choose the event" : "Choose the course" });
    if (!v.noExpiry && !v.expiresAt) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Choose the expiry, or tick No expiry" });
    if (!v.noExpiry && v.expiresAt && v.activeFrom && v.expiresAt <= v.activeFrom)
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "The expiry must be after the start" });
  });
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  name: "",
  destination: "guest_form",
  targetId: "",
  serviceId: "",
  activeFrom: "",
  expiresAt: "",
  noExpiry: true,
  caption: "",
  note: "",
  printed: false,
  legacyUrl: "",
};
const toValues = (c: QrCode): Values => ({
  name: c.name,
  destination: c.destination,
  targetId: c.targetId ?? "",
  serviceId: c.serviceId ?? "",
  activeFrom: toLocal(c.activeFrom),
  expiresAt: toLocal(c.expiresAt),
  noExpiry: !c.expiresAt,
  caption: c.caption,
  note: c.note,
  printed: c.legacy,
  legacyUrl: c.legacy ? c.shortUrl : "",
});

const body = (v: Values): QrInput => ({
  name: v.name.trim(),
  destination: v.destination,
  targetId: NEEDS_TARGET.includes(v.destination) ? v.targetId || null : null,
  serviceId: v.serviceId || null,
  activeFrom: toUtc(v.activeFrom),
  expiresAt: v.noExpiry ? null : toUtc(v.expiresAt),
  caption: v.caption.trim(),
  note: v.note.trim(),
});

/** Check the dates against the linked service once the form has been still for a moment (QR-8). The answer is an error, never a warning. */
function useDateCheck(enabled: boolean, input: Partial<QrInput> & { id?: string }) {
  const key = JSON.stringify(input);
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(key), 400);
    return () => window.clearTimeout(t);
  }, [key]);
  const q = useQuery({
    queryKey: ["qr", "check", settled],
    queryFn: ({ signal }) => api.qr.check(JSON.parse(settled) as Partial<QrInput>, signal),
    enabled,
    placeholderData: (prev) => prev,
  });
  // Until the latest values are checked, Save waits.
  const pending = enabled && (settled !== key || q.isFetching);
  return { expiresAt: q.data?.fields.expiresAt ?? null, pending };
}

export function QrDialog({ mode, list, onClose }: { mode: QrDialogMode | null; list: QrListResponse; onClose: () => void }) {
  const editing = mode?.kind === "edit" ? mode.code : null;
  const create = useCreateQr();
  const update = useUpdateQr();
  const toast = useToast();
  const [banner, setBanner] = useState<string | null>(null);
  const [asDraft, setAsDraft] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!mode) return;
    setBanner(null);
    reset(editing ? toValues(editing) : { ...EMPTY, activeFrom: toChurchLocal(new Date()), noExpiry: true });
  }, [mode, editing, reset]);

  const v = watch();
  const legacy = editing ? editing.legacy : v.printed;
  const check = useDateCheck(!!mode, { ...body(v), ...(editing ? { id: editing.id } : {}) });
  const blocked = !!check.expiresAt;

  const submit = (draft: boolean) =>
    handleSubmit(async (values) => {
      setBanner(null);
      if (check.expiresAt) return setError("expiresAt", { message: check.expiresAt });
      setAsDraft(draft);
      try {
        if (editing) {
          await update.mutateAsync({ id: editing.id, body: { ...body(values), rowVer: editing.rowVer } });
          toast.show(`${values.name.trim()} saved. Printed copies keep working.`);
        } else {
          await create.mutateAsync({ ...body(values), draft: draft && !values.printed, ...(values.printed ? { legacyUrl: values.legacyUrl } : {}) });
          toast.show(values.printed ? `${values.name.trim()} added. The printed copies keep working.` : draft ? `${values.name.trim()} saved as a draft` : `${values.name.trim()} added`);
        }
        onClose();
      } catch (e) {
        if (!(e instanceof ApiError)) return setBanner("Something went wrong. Please try again.");
        let mapped = false;
        for (const [k, msgs] of Object.entries(e.fields ?? {})) {
          if (k in EMPTY) {
            setError(k as keyof Values, { message: msgs[0] });
            mapped = true;
          }
        }
        if (!mapped) setBanner(e.message);
      }
    })();

  const targets = v.destination === "event" ? list.targets.event : v.destination === "course" ? list.targets.course : [];

  return (
    <Dialog
      open={!!mode}
      onClose={onClose}
      subtitle={editing ? "Change QR code" : "Add a QR code"}
      title={editing ? editing.name : "New QR code"}
      className="max-w-2xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {blocked ? (
            <p role="alert" className="text-xs font-semibold text-crit sm:mr-auto">
              Fix the expiry to save: the code must keep working until its service ends.
            </p>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!editing && !legacy ? (
            <Button variant="ghost" onClick={() => void submit(true)} loading={isSubmitting && asDraft} disabled={blocked || check.pending} disabledReason={blocked ? "Fix the expiry first" : undefined}>
              Save as draft
            </Button>
          ) : null}
          <Button onClick={() => void submit(false)} loading={isSubmitting && !asDraft} disabled={blocked || check.pending} disabledReason={blocked ? "Fix the expiry first" : undefined}>
            {editing ? "Save changes" : legacy ? "Add printed code" : "Add and turn on"}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        noValidate
        className="space-y-5"
      >
        {banner ? (
          <p role="alert" className="rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit">
            {banner}
          </p>
        ) : null}
        {!editing ? (
          <Controller
            control={control}
            name="printed"
            render={({ field }) => (
              <fieldset>
                <legend className="mb-1.5 text-sm font-bold text-ink">Is this code already printed?</legend>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                  {(
                    [
                      [false, QrIcon, "No, make a new code", "TKP Hub gives it a short link to print."],
                      [true, Printer, "Yes, it's already printed", "Add the link it opens, so the copies around the church keep working."],
                    ] as const
                  ).map(([val, Icon, label, hint]) => {
                    const on = field.value === val;
                    return (
                      <button
                        key={label}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => field.onChange(val)}
                        className={cn("flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors", on ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200")}
                      >
                        <Icon className={cn("mt-0.5 size-4.5 shrink-0", on ? "text-maroon-700" : "text-muted")} aria-hidden />
                        <span>
                          <span className="block text-sm font-bold text-ink">{label}</span>
                          <span className="block text-xs text-muted">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
          />
        ) : null}
        {editing && !editing.legacy ? (
          <p className="rounded-xl bg-cream-200 px-4 py-3 text-xs text-muted">
            The printed address stays <b className="text-ink">{editing.shortUrl.replace(/^https?:\/\//, "")}</b>. Printed copies keep working; only where they lead
            changes.
          </p>
        ) : null}

        <Field label="Name" htmlFor="qr-name" error={errors.name?.message} hint="For staff only, for example “Welcome desk table card”.">
          <input id="qr-name" data-autofocus autoComplete="off" className={inputClass(!!errors.name)} {...register("name")} />
        </Field>

        {legacy ? (
          <Field
            label="Link on the printed code"
            htmlFor="qr-legacy"
            error={errors.legacyUrl?.message}
            hint={editing ? "The printed copies keep this link. It can't be changed." : "Scan the printed code with a phone and copy the link it opens."}
          >
            <input
              id="qr-legacy"
              type="url"
              inputMode="url"
              placeholder="https://"
              autoComplete="off"
              readOnly={!!editing}
              className={cn(inputClass(!!errors.legacyUrl), editing && "bg-cream-100 text-muted")}
              {...register("legacyUrl")}
            />
          </Field>
        ) : null}

        <Controller
          control={control}
          name="destination"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-sm font-bold text-ink">Opens</legend>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
                {DESTINATIONS.map((id) => {
                  const on = field.value === id;
                  const Icon = DEST_ICON[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => field.onChange(id)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors",
                        on ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200",
                      )}
                    >
                      <Icon className={cn("mt-0.5 size-4.5 shrink-0", on ? "text-maroon-700" : "text-muted")} aria-hidden />
                      <span>
                        <span className="block text-sm font-bold text-ink">{DESTINATION_LABEL[id]}</span>
                        <span className="block text-xs text-muted">{HINT[id]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {NEEDS_TARGET.includes(v.destination) ? (
            <Field
              label={v.destination === "event" ? "Event" : "Course"}
              htmlFor="qr-target"
              error={errors.targetId?.message}
              hint={v.destination === "event" ? "Special events from Admin › Services." : "Placeholder list until Grow arrives (M8)."}
            >
              <select id="qr-target" className={selectClass(!!v.targetId)} {...register("targetId")}>
                <option value="">Choose…</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.hint ? ` (${t.hint})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field
            label={<>Service <span className="font-semibold text-muted">(optional)</span></>}
            htmlFor="qr-service"
            error={errors.serviceId?.message}
            hint="The service it is for. The code must keep working until that service ends."
          >
            <select id="qr-service" className={selectClass(!!v.serviceId)} {...register("serviceId")}>
              <option value="">No particular service</option>
              {list.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-ink">
            When it works <span className="font-semibold text-muted">(church time, Central)</span>
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Active from" htmlFor="qr-from" error={errors.activeFrom?.message} hint={editing ? undefined : "Leave as now to start straight away."}>
              <input id="qr-from" type="datetime-local" className={inputClass(!!errors.activeFrom)} {...register("activeFrom")} />
            </Field>
            <div>
              <Field label="Expires" htmlFor={v.noExpiry ? "qr-noexp" : "qr-to"} error={check.expiresAt ?? errors.expiresAt?.message}>
                {v.noExpiry ? (
                  <p className="flex h-11 items-center rounded-xl border border-dashed border-line px-3.5 text-sm text-muted">Keeps working until you pause it</p>
                ) : (
                  <input id="qr-to" type="datetime-local" className={inputClass(!!errors.expiresAt)} {...register("expiresAt")} />
                )}
              </Field>
              <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <input id="qr-noexp" type="checkbox" className="size-4 accent-maroon-700" {...register("noExpiry")} />
                No expiry
              </label>
            </div>
          </div>
        </fieldset>

        <Field label="Caption" htmlFor="qr-caption" error={errors.caption?.message} hint="Printed with the code. Leave empty for the usual wording.">
          <input id="qr-caption" autoComplete="off" placeholder="New here? Scan to say hello" className={inputClass(!!errors.caption)} {...register("caption")} />
        </Field>
        <Field label={<>Note <span className="font-semibold text-muted">(optional, staff only)</span></>} htmlFor="qr-note" error={errors.note?.message}>
          <textarea id="qr-note" rows={2} className={cn(inputClass(!!errors.note), "h-auto py-2.5")} {...register("note")} />
        </Field>
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- quick edit */

const addDays = (local: string, days: number) => toChurchLocal(new Date(Date.parse(fromChurchLocal(local)) + days * 86_400_000));

/** QR-4 quick edit, and the "extend" action for a code expiring during a live service (PRD 8.3). */
export function QrDatesDialog({ code, onClose }: { code: QrCode | null; onClose: () => void }) {
  const save = useSetQrDates();
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [noExpiry, setNoExpiry] = useState(true);
  const [error, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    setFrom(toLocal(code.activeFrom));
    setUntil(toLocal(code.expiresAt));
    setNoExpiry(!code.expiresAt);
    setErrorText(null);
  }, [code]);

  const check = useDateCheck(!!code, {
    id: code?.id,
    destination: code?.destination,
    targetId: code?.targetId,
    serviceId: code?.serviceId,
    activeFrom: toUtc(from),
    expiresAt: noExpiry ? null : toUtc(until),
  });

  const extend = (days: number) => {
    const base = until && !noExpiry && Date.parse(fromChurchLocal(until)) > Date.now() ? until : toChurchLocal(new Date());
    setUntil(addDays(base, days));
    setNoExpiry(false);
  };

  const onSave = async () => {
    if (!code) return;
    setErrorText(null);
    if (!noExpiry && !until) return setErrorText("Choose the expiry, or tick No expiry");
    if (!noExpiry && from && until <= from) return setErrorText("The expiry must be after the start");
    if (check.expiresAt) return;
    try {
      const r = await save.mutateAsync({ id: code.id, body: { activeFrom: toUtc(from), expiresAt: noExpiry ? null : toUtc(until), rowVer: code.rowVer } });
      toast.show(code.status === "expired" && r.code.status !== "expired" ? `${code.name} renewed` : "Dates saved");
      onClose();
    } catch (e) {
      setErrorText(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog
      open={!!code}
      onClose={onClose}
      subtitle="Change dates"
      title={code?.name ?? ""}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void onSave()} loading={save.isPending} disabled={!!check.expiresAt || check.pending} disabledReason={check.expiresAt ? "Fix the expiry first" : undefined}>
            {code?.status === "expired" ? "Save and renew" : "Save dates"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit">
            {error}
          </p>
        ) : null}
        {code?.status === "expired" ? (
          <p className="rounded-xl bg-cream-200 px-4 py-3 text-xs text-muted">This code has expired. Move the expiry forward to switch it back on; the renewal is logged.</p>
        ) : null}
        <Field label="Active from" htmlFor="qd-from" hint="Church time (Central).">
          <input id="qd-from" data-autofocus type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass()} />
        </Field>
        <div>
          <Field label="Expires" htmlFor="qd-to" error={check.expiresAt ?? undefined}>
            <input id="qd-to" type="datetime-local" value={until} disabled={noExpiry} onChange={(e) => setUntil(e.target.value)} className={inputClass()} />
          </Field>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="mr-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} className="size-4 accent-maroon-700" />
              No expiry
            </label>
            <span className="text-xs font-bold text-muted">Extend:</span>
            {[
              [1, "+1 day"],
              [7, "+1 week"],
              [30, "+30 days"],
            ].map(([n, label]) => (
              <Button key={label} size="sm" variant="ghost" onClick={() => extend(n as number)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
