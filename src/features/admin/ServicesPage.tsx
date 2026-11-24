import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, CalendarDays, ClipboardList, Pencil, Plus, Repeat, Trash2, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { churchDate, serviceDateShort } from "@/lib/time";
import { useCreateService, useDeleteService, useReorderServices, useServices, useSetServiceActive, useUpdateService } from "./config-queries";
import type { Service, ServiceInput } from "./config-types";
import { Field, IconAction, inputClass, selectClass } from "./parts";

/**
 * Admin › Services (PRD W-13, W-2, CA-2): the services and special events guests
 * choose on the welcome form, which of them use the short form, and their order.
 * A service with entries is retired, never deleted, so past entries keep it.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "09:30" → "9:30 am". */
function clock(t: string) {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function when(s: Pick<Service, "kind" | "day" | "time" | "startsOn" | "endsOn">) {
  if (s.kind === "weekly") return s.day !== null && s.time ? `Every ${DAYS[s.day]} · ${clock(s.time)}` : "Weekly";
  if (!s.startsOn || !s.endsOn) return "Special event · on the form until retired";
  return s.startsOn === s.endsOn ? `Special event · ${serviceDateShort(s.startsOn)}` : `Special event · ${serviceDateShort(s.startsOn)} – ${serviceDateShort(s.endsOn)}`;
}

export function ServicesPage() {
  const services = useServices();
  const d = services.data;
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const active = d?.items.filter((s) => s.active) ?? [];
  const retired = d?.items.filter((s) => !s.active) ?? [];

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Services"
        tagline="The services and special events guests choose on the welcome form."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            Add a service
          </Button>
        }
      />
      {services.isError ? <ErrorBanner>{services.error.message}</ErrorBanner> : null}
      {!d ? (
        <Skeleton className="h-125 w-full rounded-3xl" />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-6">
            <Card>
              <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-semibold text-maroon-950">On the form</h2>
                <p className="text-sm text-muted">In the order guests see them. Use the arrows to change it.</p>
              </header>
              <ServiceList items={active} onEdit={setEditing} />
            </Card>
            <Card>
              <header className="mb-2">
                <h2 className="font-display text-xl font-semibold text-maroon-950">Retired</h2>
                <p className="text-sm text-muted">Off the form. Their past entries still count everywhere.</p>
              </header>
              {retired.length ? (
                <ServiceList items={retired} onEdit={setEditing} />
              ) : (
                <EmptyState icon={<Archive />} title="Nothing retired">
                  Retire a service when it stops running. Its past entries stay.
                </EmptyState>
              )}
            </Card>
          </div>
          <FormPreview names={d.formToday} items={d.items} />
        </div>
      )}
      <ServiceDialog editing={editing} onClose={() => setEditing(null)} />
    </motion.div>
  );
}

function ServiceList({ items, onEdit }: { items: Service[]; onEdit: (s: Service) => void }) {
  const reorder = useReorderServices();
  const setActive = useSetServiceActive();
  const remove = useDeleteService();
  const confirm = useConfirm();
  const toast = useToast();
  const busy = reorder.isPending || setActive.isPending || remove.isPending;
  const today = churchDate(new Date());

  const fail = (e: unknown) => toast.show(e instanceof ApiError ? e.message : "Something went wrong. Please try again.", { tone: "crit" });

  const move = (i: number, by: -1 | 1) => {
    const ids = items.map((s) => s.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    reorder.mutate(ids, { onError: fail });
  };

  const retire = async (s: Service) => {
    const ok = await confirm({
      title: `Retire ${s.name}?`,
      body: `Guests will no longer see it on the welcome form. ${s.entries ? `Its ${plural(s.entries, "past entry", "past entries")} stay and still count in every report.` : ""} You can restore it later.`,
      confirmLabel: `Retire ${s.name}`,
    });
    if (!ok) return;
    setActive.mutate({ id: s.id, active: false }, { onSuccess: () => toast.show(`${s.name} retired`), onError: fail });
  };

  const del = async (s: Service) => {
    const ok = await confirm({
      title: `Delete ${s.name}?`,
      body: "No guest has chosen it yet, so nothing else changes. This cannot be undone; you would have to add it again.",
      confirmLabel: `Delete ${s.name}`,
    });
    if (!ok) return;
    remove.mutate(s.id, { onSuccess: () => toast.show(`${s.name} deleted`), onError: fail });
  };

  return (
    <ul className="divide-y divide-line/70">
      {items.map((s, i) => (
        <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 sm:flex-nowrap">
          {s.active ? (
            <span className="flex shrink-0 flex-col">
              <IconAction label={`Move ${s.name} up`} icon={<ArrowUp />} onClick={() => move(i, -1)} disabled={busy || i === 0} />
              <IconAction label={`Move ${s.name} down`} icon={<ArrowDown />} onClick={() => move(i, 1)} disabled={busy || i === items.length - 1} />
            </span>
          ) : null}
          <span
            className={cn("grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5", s.active ? "bg-maroon-100 text-maroon-700" : "bg-cream-200 text-muted")}
            aria-hidden
          >
            {s.kind === "weekly" ? <Repeat /> : <CalendarDays />}
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-bold text-ink">{s.name}</span>
              {s.shortForm ? (
                <Chip tone="gold" icon={<Zap className="size-3" />}>
                  Short form
                </Chip>
              ) : null}
              {s.active && !s.onForm && s.startsOn && s.endsOn ? (
                <Chip>{s.startsOn > today ? `On the form from ${serviceDateShort(s.startsOn)}` : `Ended ${serviceDateShort(s.endsOn)}`}</Chip>
              ) : null}
            </p>
            <p className="text-sm text-muted">{when(s)}</p>
            <p className="text-xs text-muted">
              {s.entries ? `${plural(s.entries, "entry", "entries")} · last ${serviceDateShort(s.lastUsed!)}` : "No entries yet"}
              {s.shortName !== s.name ? ` · charts say “${s.shortName}”` : ""}
            </p>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <IconAction label={`Change ${s.name}`} icon={<Pencil />} onClick={() => onEdit(s)} disabled={busy} />
            {s.active ? (
              <IconAction label={`Retire ${s.name}`} icon={<Archive />} onClick={() => void retire(s)} disabled={busy} tone="crit" />
            ) : (
              <IconAction
                label={`Restore ${s.name}`}
                icon={<ArchiveRestore />}
                onClick={() => setActive.mutate({ id: s.id, active: true }, { onSuccess: () => toast.show(`${s.name} is back on the form`), onError: fail })}
                disabled={busy}
                tone="ok"
              />
            )}
            <IconAction
              label={`Delete ${s.name}`}
              icon={<Trash2 />}
              onClick={() => void del(s)}
              disabled={busy || s.entries > 0}
              reason={s.entries > 0 ? "Guests have chosen it, so it can only be retired" : undefined}
              tone="crit"
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What a guest sees in the form's service question today. */
function FormPreview({ names, items }: { names: string[]; items: Service[] }) {
  const short = new Set(items.filter((s) => s.shortForm).map((s) => s.name));
  const coming = items.filter((s) => s.active && !s.onForm);
  return (
    <Card className="xl:sticky xl:top-6">
      <p className="mb-1 text-[11px] font-extrabold tracking-[0.12em] text-gold-600 uppercase">Preview</p>
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
        <ClipboardList className="size-5 text-gold-600" aria-hidden />
        Guest form today
      </h2>
      <div className="mt-4 rounded-2xl border border-dashed border-line bg-cream-50 p-4">
        <p className="mb-3 text-sm font-bold text-ink">Which service did you attend?</p>
        <ul className="space-y-2">
          {names.map((n) => (
            <li key={n} className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink">
              <span className="size-4 shrink-0 rounded-full border-2 border-line" aria-hidden />
              <span className="min-w-0 flex-1">{n}</span>
              {short.has(n) ? <Zap className="size-3.5 shrink-0 text-gold-600" aria-label="Short form" /> : null}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-muted">
        <Zap className="inline size-3 text-gold-600" aria-hidden /> Short form: fewer questions, for busy special services (PRD W-2). “Other” is always last.
      </p>
      {coming.length ? (
        <p className="mt-2 text-xs text-muted">
          Coming later: {coming.map((s) => `${s.name} (${s.startsOn ? serviceDateShort(s.startsOn) : "date not set"})`).join(", ")}.
        </p>
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------------- add / change */

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter the service name").max(60, "Keep the name under 60 characters"),
    shortName: z.string().trim().max(20, "Keep the chart label under 20 characters"),
    kind: z.enum(["weekly", "special"]),
    day: z.string(),
    time: z.string(),
    startsOn: z.string(),
    endsOn: z.string(),
    shortForm: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.name.trim().toLowerCase() === "other") ctx.addIssue({ code: "custom", path: ["name"], message: "“Other” is always on the form; choose another name" });
    if (v.kind === "weekly") {
      if (v.day === "") ctx.addIssue({ code: "custom", path: ["day"], message: "Choose the day" });
      if (!v.time) ctx.addIssue({ code: "custom", path: ["time"], message: "Enter the start time" });
    } else if (!!v.startsOn !== !!v.endsOn) {
      ctx.addIssue({ code: "custom", path: [v.startsOn ? "endsOn" : "startsOn"], message: "Give both dates, or neither" });
    } else if (v.startsOn && v.endsOn < v.startsOn) {
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The last day is before the first day" });
    }
  });
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: "", shortName: "", kind: "weekly", day: "0", time: "", startsOn: "", endsOn: "", shortForm: false };
const toValues = (s: Service): Values => ({
  name: s.name,
  shortName: s.shortName === s.name ? "" : s.shortName,
  kind: s.kind,
  day: s.day === null ? "0" : String(s.day),
  time: s.time ?? "",
  startsOn: s.startsOn ?? "",
  endsOn: s.endsOn ?? "",
  shortForm: s.shortForm,
});

function ServiceDialog({ editing, onClose }: { editing: Service | "new" | null; onClose: () => void }) {
  const svc = editing && editing !== "new" ? editing : null;
  const create = useCreateService();
  const update = useUpdateService();
  const toast = useToast();
  const [banner, setBanner] = useState<string | null>(null);
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
    if (!editing) return;
    setBanner(null);
    reset(svc ? toValues(svc) : EMPTY);
  }, [editing, svc, reset]);

  const kind = watch("kind");
  const name = watch("name");
  const renaming = !!svc && svc.entries > 0 && name.trim() !== svc.name;

  const onSubmit = handleSubmit(async (v) => {
    setBanner(null);
    const body: ServiceInput = {
      name: v.name.trim(),
      shortName: v.shortName.trim() || v.name.trim().slice(0, 20),
      kind: v.kind,
      day: v.kind === "weekly" ? Number(v.day) : null,
      time: v.kind === "weekly" ? v.time : null,
      startsOn: v.kind === "special" ? v.startsOn || null : null,
      endsOn: v.kind === "special" ? v.endsOn || null : null,
      shortForm: v.shortForm,
    };
    try {
      if (svc) {
        const r = await update.mutateAsync({ id: svc.id, body: { ...body, rowVer: svc.rowVer } });
        toast.show(r.renamedEntries ? `Saved · ${plural(r.renamedEntries, "past entry", "past entries")} now show the new name` : "Service saved");
      } else {
        await create.mutateAsync(body);
        toast.show(`${body.name} added`);
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
  });

  return (
    <Dialog
      open={!!editing}
      onClose={onClose}
      subtitle={svc ? "Change service" : "Add a service"}
      title={svc ? svc.name : "New service"}
      className="max-w-2xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="service-form" loading={isSubmitting}>
            {svc ? "Save changes" : "Add service"}
          </Button>
        </div>
      }
    >
      <form id="service-form" onSubmit={onSubmit} noValidate className="space-y-5">
        {banner ? (
          <p role="alert" className="rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit">
            {banner}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field label="Name on the form" htmlFor="sv-name" error={errors.name?.message} hint="Exactly as guests will see it.">
            <input id="sv-name" data-autofocus autoComplete="off" className={inputClass(!!errors.name)} {...register("name")} />
          </Field>
          <Field
            label={<>Chart label <span className="font-semibold text-muted">(optional)</span></>}
            htmlFor="sv-short"
            error={errors.shortName?.message}
            hint="Shorter name for charts."
          >
            <input id="sv-short" autoComplete="off" placeholder={name.trim().slice(0, 20)} className={inputClass(!!errors.shortName)} {...register("shortName")} />
          </Field>
        </div>
        {renaming ? (
          <p className="-mt-2 rounded-xl bg-cream-200 px-4 py-3 text-xs text-muted">
            {plural(svc.entries, "past entry", "past entries")} will show the new name too, in Welcome, LCM Metrics and Connect.
          </p>
        ) : null}

        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-sm font-bold text-ink">Kind</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {(
                  [
                    { id: "weekly", icon: <Repeat />, label: "Weekly service", hint: "Every week on the same day." },
                    { id: "special", icon: <CalendarDays />, label: "Special event", hint: "On the form for set dates, or until retired." },
                  ] as const
                ).map((k) => {
                  const on = field.value === k.id;
                  return (
                    <button
                      key={k.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => field.onChange(k.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors [&_svg]:size-5",
                        on ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200",
                      )}
                    >
                      <span className={cn("mt-0.5", on ? "text-maroon-700" : "text-muted")} aria-hidden>
                        {k.icon}
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-ink">{k.label}</span>
                        <span className="block text-xs text-muted">{k.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        />

        {kind === "weekly" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Day" htmlFor="sv-day" error={errors.day?.message}>
              <select id="sv-day" className={selectClass(false)} {...register("day")}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start time" htmlFor="sv-time" error={errors.time?.message} hint="Church time (Central).">
              <input id="sv-time" type="time" className={inputClass(!!errors.time)} {...register("time")} />
            </Field>
          </div>
        ) : (
          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First day on the form" htmlFor="sv-from" error={errors.startsOn?.message}>
                <input id="sv-from" type="date" className={inputClass(!!errors.startsOn)} {...register("startsOn")} />
              </Field>
              <Field label="Last day on the form" htmlFor="sv-to" error={errors.endsOn?.message}>
                <input id="sv-to" type="date" className={inputClass(!!errors.endsOn)} {...register("endsOn")} />
              </Field>
            </div>
            <p className="mt-1.5 text-xs text-muted">Leave both empty to keep it on the form until you retire it (for example a monthly Power Night).</p>
          </div>
        )}

        <Controller
          control={control}
          name="shortForm"
          render={({ field }) => (
            <label
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3.5 transition-colors",
                field.value ? "border-gold-300 bg-gold-100/50" : "border-line bg-white hover:border-maroon-200",
              )}
            >
              <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} className="mt-0.5 size-4.5 shrink-0 accent-maroon-700" />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  <Zap className="size-4 text-gold-600" aria-hidden />
                  Use the short form
                </span>
                <span className="block text-xs text-muted">Fewer questions, so a crowd at a special service can finish quickly. Ratings and some details are skipped.</span>
              </span>
            </label>
          )}
        />
      </form>
    </Dialog>
  );
}
