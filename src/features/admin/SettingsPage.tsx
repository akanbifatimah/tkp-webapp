import { zodResolver } from "@hookform/resolvers/zod";
import { Clock, Globe2, KeyRound, LifeBuoy, ScrollText, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { formatStamp } from "@/lib/time";
import { Field, inputClass, selectClass } from "./parts";
import { useSaveSettings, useSettings } from "./queries";
import type { AdminSettings } from "./types";

/**
 * Admin › Settings (PRD SA-1: retention, time zone; TKP Connect UI-S1: who
 * resets passwords). Saved with rowVer, so two admins cannot overwrite each other.
 */
const schema = z.object({
  resetContact: z.string().trim().min(2, "Enter the name people should ask").max(80, "That name is too long"),
  resetRelay: z.string().trim().max(80, "That name is too long"),
  idleMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  forcePasswordChange: z.boolean(),
  auditRetentionDays: z.number(),
});
type Values = z.infer<typeof schema>;

const IDLE = [15, 30, 60] as const;
const RETENTION = [
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
  { days: 1825, label: "5 years" },
  { days: 2555, label: "7 years" },
];

const toValues = (s: AdminSettings): Values => ({
  resetContact: s.resetContact,
  resetRelay: s.resetRelay ?? "",
  idleMinutes: s.idleMinutes as Values["idleMinutes"],
  forcePasswordChange: s.forcePasswordChange,
  auditRetentionDays: s.auditRetentionDays,
});

export function SettingsPage() {
  const settings = useSettings();
  const s = settings.data;
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        tagline="Choices that apply to everyone who uses TKP Hub."
        actions={s?.updatedAt ? <Chip>Last changed {formatStamp(s.updatedAt)}{s.updatedBy ? ` by ${s.updatedBy}` : ""}</Chip> : null}
      />
      {settings.isError ? <ErrorBanner>{settings.error.message}</ErrorBanner> : null}
      {s ? <SettingsForm s={s} reload={() => void settings.refetch()} /> : <Skeleton className="h-150 w-full rounded-3xl" />}
    </motion.div>
  );
}

function SettingsForm({ s, reload }: { s: AdminSettings; reload: () => void }) {
  const save = useSaveSettings();
  const toast = useToast();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(s) });

  // A fresh copy from the server (after Reload) replaces the form.
  useEffect(() => reset(toValues(s)), [s, reset]);

  const contact = watch("resetContact");
  const relay = watch("resetRelay");

  const onSubmit = handleSubmit(async (v) => {
    setConflict(null);
    try {
      await save.mutateAsync({ ...v, resetRelay: v.resetRelay || null, rowVer: s.rowVer });
      toast.show("Settings saved");
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) return setConflict(e.message);
      if (e instanceof ApiError && e.fields) {
        for (const [k, m] of Object.entries(e.fields)) setError(k as keyof Values, { message: m[0] });
        return;
      }
      toast.show(e instanceof ApiError ? e.message : "Something went wrong. Please try again.", { tone: "crit" });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {conflict ? (
        <ErrorBanner
          action={
            <Button size="sm" variant="ghost" onClick={reload}>
              Reload
            </Button>
          }
        >
          {conflict}
        </ErrorBanner>
      ) : null}

      <Section icon={<LifeBuoy />} title="Forgot password?" text="Shown on the sign-in page. TKP Hub has no self-service reset: people ask a named person.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Who resets passwords" htmlFor="s-contact" error={errors.resetContact?.message} hint="Usually a Tech Admin.">
            <input id="s-contact" className={inputClass(!!errors.resetContact)} {...register("resetContact")} />
          </Field>
          <Field
            label={<>Second contact <span className="font-semibold text-muted">(optional)</span></>}
            htmlFor="s-relay"
            error={errors.resetRelay?.message}
            hint="Passes the message on when the first person cannot be reached."
          >
            <input id="s-relay" className={inputClass(!!errors.resetRelay)} {...register("resetRelay")} />
          </Field>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-line bg-cream-50 p-4 text-sm leading-relaxed">
          <p className="mb-1 text-[11px] font-extrabold tracking-[0.12em] text-gold-600 uppercase">Preview</p>
          Ask <b className="text-maroon-800">{contact?.trim() || "…"}</b> to reset it for you.
          {relay?.trim() ? (
            <>
              {" "}
              If you cannot reach them, <b className="text-maroon-800">{relay.trim()}</b> will pass the message on.
            </>
          ) : null}
        </div>
      </Section>

      <Section icon={<ShieldCheck />} title="Sign-in and sessions" text="Keeps guest details safe on shared and church computers.">
        <div className="space-y-5">
          <Controller
            control={control}
            name="idleMinutes"
            render={({ field }) => (
              <fieldset>
                <legend className="mb-1.5 flex items-center gap-2 text-sm font-bold text-ink">
                  <Clock className="size-4 text-gold-600" aria-hidden />
                  Sign out after no activity for
                </legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {IDLE.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={field.value === m}
                      onClick={() => field.onChange(m)}
                      className={cn(
                        "h-11 rounded-xl border px-5 text-sm font-bold transition-colors",
                        field.value === m ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-line bg-white text-ink hover:border-maroon-200",
                      )}
                    >
                      {m} minutes
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">A warning appears one minute before, so nobody loses work by surprise.</p>
              </fieldset>
            )}
          />

          <Controller
            control={control}
            name="forcePasswordChange"
            render={({ field }) => (
              <Toggle
                checked={field.value}
                onChange={field.onChange}
                label="People with a one-time password must choose their own before anything else"
                hint="Applies to new people and to password resets. Recommended: on."
                icon={<KeyRound className="size-4 text-gold-600" aria-hidden />}
              />
            )}
          />

          <Fact icon={<ShieldCheck className="size-4 text-gold-600" aria-hidden />} label="Email code at sign-in for staff">
            <Chip tone="ok">Always on</Chip> Every staff account confirms a 6-digit code after the password. Members are not asked.
          </Fact>
        </div>
      </Section>

      <Section icon={<ScrollText />} title="Records" text="How long TKP Hub keeps its own records.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Keep the audit log for" htmlFor="s-retention" error={errors.auditRetentionDays?.message} hint="Older entries are removed by a nightly job. Nobody can delete entries by hand.">
            <Controller
              control={control}
              name="auditRetentionDays"
              render={({ field }) => (
                <select id="s-retention" value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} className={selectClass(false)}>
                  {RETENTION.map((r) => (
                    <option key={r.days} value={r.days}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>
          <Fact icon={<Globe2 className="size-4 text-gold-600" aria-hidden />} label="Church time zone">
            Central Time (Katy, Texas) · {s.timeZone}. Every date and time in TKP Hub is shown in church time.
          </Fact>
        </div>
      </Section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-white/90 p-3 shadow-lift backdrop-blur">
        <span className="mr-auto pl-2 text-sm font-semibold text-muted">{isDirty ? "You have unsaved changes." : "Everything is saved."}</span>
        <Button variant="ghost" disabled={!isDirty || isSubmitting} onClick={() => reset(toValues(s))}>
          Undo changes
        </Button>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty} disabledReason="Nothing to save yet">
          Save settings
        </Button>
      </div>
    </form>
  );
}

function Section({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <Card>
      <header className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-maroon-100 text-maroon-700 [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold text-maroon-950">{title}</h2>
          <p className="text-sm text-muted">{text}</p>
        </div>
      </header>
      {children}
    </Card>
  );
}

function Toggle({ checked, onChange, label, hint, icon }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; icon: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id="toggle-label" className="flex items-center gap-2 text-sm font-bold text-ink">
          {icon}
          {label}
        </p>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby="toggle-label"
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-maroon-700" : "bg-cream-300")}
      >
        <motion.span
          className="absolute top-1 left-1 size-5 rounded-full bg-white shadow-card"
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 36 }}
        />
      </button>
    </div>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-2 text-sm font-bold text-ink">
        {icon}
        {label}
      </p>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}
