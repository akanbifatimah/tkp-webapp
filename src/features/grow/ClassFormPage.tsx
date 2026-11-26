import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Check, Info } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Controller, useForm, type Path } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, inputClass, selectClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { plural } from "./grow-parts";
import { useCourse, useCourses, useCreateCourse, useUpdateCourse } from "./grow-queries";
import {
  ASSESSMENT_RULE_LABEL,
  FORMAT_HINT,
  FORMAT_LABEL,
  hasMeetings,
  PATHWAY,
  type AssessmentRule,
  type CourseDetail,
  type CourseFormat,
  type CourseInput,
  type Person,
} from "./grow-types";

/**
 * Grow › Create a class / Edit class (Figma 135:22921 "Create a class"; PRD
 * WEB-10, LMS-1 to LMS-4, LMS-8). Creating makes a draft with blank sessions;
 * the class page publishes it once the checks pass.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);

const schema = z
  .object({
    title: z.string().trim().min(3, "Enter the class name").max(80, "Keep the name under 80 characters"),
    description: z.string().trim().max(500, "Keep the description under 500 characters"),
    step: z.string(),
    format: z.enum(["live", "recorded", "reading", "mixed"]),
    audience: z.enum(["everyone", "members"]),
    prerequisiteSteps: z.array(z.number()),
    teacherIds: z.array(z.string()).min(1, "Choose who teaches it"),
    graderIds: z.array(z.string()),
    day: z.string(),
    time: z.string(),
    where: z.enum(["online", "in_person"]),
    place: z.string().trim().max(60, "Keep it under 60 characters"),
    startsOn: z.string(),
    sessionCount: z.string(),
    lengthMin: z.string(),
    limited: z.boolean(),
    seats: z.string(),
    waitlist: z.boolean(),
    attendance: z.string(),
    assessment: z.enum(["none", "final", "every"]),
    welcomeNote: z.string().trim().max(1000, "Keep the welcome note under 1,000 characters"),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const count = int(v.sessionCount);
    if (!(count >= 1 && count <= 52)) issue("sessionCount", "Between 1 and 52 sessions");
    const len = int(v.lengthMin);
    if (!(len >= 15 && len <= 480)) issue("lengthMin", "Between 15 and 480 minutes");
    if (hasMeetings(v.format)) {
      if (!v.time) issue("time", "Enter the start time");
      if (v.where === "in_person" && !v.place.trim()) issue("place", "Say where it meets");
      if (v.startsOn && new Date(`${v.startsOn}T12:00:00Z`).getUTCDay() !== Number(v.day)) issue("startsOn", `Choose a ${DAYS[Number(v.day)]}`);
    }
    if (v.limited && !(int(v.seats) >= 1 && int(v.seats) <= 1000)) issue("seats", "Between 1 and 1,000 seats");
    const att = int(v.attendance);
    if (Number.isNaN(att)) issue("attendance", "Enter a number of sessions");
    else if (count >= 1 && att > count) issue("attendance", `It has ${count} sessions, so at most ${count}`);
    if (v.step && v.prerequisiteSteps.some((p) => p >= Number(v.step))) issue("prerequisiteSteps", "Prerequisites must come earlier on the pathway");
  });
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  title: "",
  description: "",
  step: "",
  format: "live",
  audience: "everyone",
  prerequisiteSteps: [],
  teacherIds: [],
  graderIds: [],
  day: "0",
  time: "",
  where: "online",
  place: "",
  startsOn: "",
  sessionCount: "6",
  lengthMin: "60",
  limited: true,
  seats: "30",
  waitlist: true,
  attendance: "5",
  assessment: "none",
  welcomeNote: "",
};

const toValues = (c: CourseDetail): Values => ({
  title: c.title,
  description: c.description,
  step: c.step ? String(c.step) : "",
  format: c.format,
  audience: c.audience,
  prerequisiteSteps: c.prerequisiteSteps,
  teacherIds: c.teacherIds,
  graderIds: c.graderIds,
  day: String(c.schedule.day ?? 0),
  time: c.schedule.time ?? "",
  where: c.schedule.where,
  place: c.schedule.place ?? "",
  startsOn: c.schedule.startsOn ?? "",
  sessionCount: String(c.schedule.sessionCount),
  lengthMin: String(c.schedule.lengthMin),
  limited: c.seats !== null,
  seats: c.seats === null ? "30" : String(c.seats),
  waitlist: c.waitlist,
  attendance: String(c.completion.attendance),
  assessment: c.completion.assessment,
  welcomeNote: c.welcomeNote,
});

const toInput = (v: Values): CourseInput => {
  const meets = hasMeetings(v.format);
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    step: v.step ? Number(v.step) : null,
    format: v.format,
    audience: v.audience,
    prerequisiteSteps: v.prerequisiteSteps,
    teacherIds: v.teacherIds,
    graderIds: v.graderIds,
    schedule: {
      day: meets ? Number(v.day) : null,
      time: meets ? v.time : null,
      where: v.where,
      place: meets && v.where === "in_person" ? v.place.trim() : null,
      startsOn: meets ? v.startsOn || null : null,
      sessionCount: int(v.sessionCount),
      lengthMin: int(v.lengthMin),
    },
    seats: v.limited ? int(v.seats) : null,
    waitlist: v.limited && v.waitlist,
    completion: { attendance: int(v.attendance), assessment: v.assessment },
    welcomeNote: v.welcomeNote.trim(),
  };
};

/** Server field names → form fields. */
const FIELD_MAP: Record<string, Path<Values>> = {
  title: "title",
  description: "description",
  step: "step",
  format: "format",
  audience: "audience",
  prerequisiteSteps: "prerequisiteSteps",
  teacherIds: "teacherIds",
  graderIds: "graderIds",
  "schedule.day": "day",
  "schedule.time": "time",
  "schedule.place": "place",
  "schedule.startsOn": "startsOn",
  "schedule.sessionCount": "sessionCount",
  "schedule.lengthMin": "lengthMin",
  seats: "seats",
  "completion.attendance": "attendance",
  "completion.assessment": "assessment",
  welcomeNote: "welcomeNote",
};

export function ClassFormPage() {
  const { id } = useParams();
  const course = useCourse(id);
  const list = useCourses();
  const editing = id ? course.data : undefined;
  if (id && course.isError) return <ErrorBanner>{course.error.message}</ErrorBanner>;
  if ((id && !editing) || !list.data) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;
  if (id && editing && !editing.can.manage) return <ErrorBanner>Only the Registrar can change a class's settings.</ErrorBanner>;
  return <ClassForm key={editing?.rowVer ?? "new"} editing={editing} options={list.data.options} />;
}

function Section({ n, title, tag, children }: { n: number; title: string; tag: string; children: ReactNode }) {
  return (
    <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6" aria-labelledby={`sec-${n}`}>
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`sec-${n}`} className="flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
          <span className="size-2 rounded-full bg-gold-500" aria-hidden />
          {n}. {title}
        </h2>
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase">{tag}</span>
      </header>
      <div className="space-y-5">{children}</div>
    </motion.section>
  );
}

/** Pick several people (teachers, graders) from a short list. */
function PeoplePicker({ people, value, onChange, label, invalid }: { people: Person[]; value: string[]; onChange: (v: string[]) => void; label: string; invalid?: boolean }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2 rounded-2xl", invalid && "ring-2 ring-crit/30")}>
      {people.map((p) => {
        const on = value.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
              on ? "border-maroon-600 bg-maroon-100/50 text-maroon-800" : "border-line bg-white text-muted hover:border-maroon-200 hover:text-ink",
            )}
          >
            {on ? <Check className="size-3.5" aria-hidden /> : null}
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className={cn("flex items-start gap-3 rounded-2xl border p-3.5 transition-colors", checked ? "border-gold-300 bg-gold-100/50" : "border-line bg-white hover:border-maroon-200")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4.5 shrink-0 accent-maroon-700" />
      <span>
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

function ClassForm({ editing, options }: { editing?: CourseDetail; options: { teachers: Person[]; graders: Person[] } }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const [banner, setBanner] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: editing ? toValues(editing) : EMPTY });

  const v = watch();
  const meets = hasMeetings(v.format);
  const started = editing && (editing.status === "in_session" || editing.status === "completed");
  const published = editing && editing.state === "published";
  const back = editing ? `/grow/classes/${editing.id}` : "/grow/classes";

  const leave = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Leave without saving?",
        body: "The changes on this page will be lost.",
        confirmLabel: "Leave without saving",
        cancelLabel: "Keep editing",
      });
      if (!ok) return;
    }
    void navigate(back);
  };

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    const body = toInput(values);
    try {
      if (editing) {
        const r = await update.mutateAsync({ id: editing.id, body: { ...body, rowVer: editing.rowVer } });
        const extra = [r.moved ? `${plural(r.moved, "session")} moved to the new time` : "", r.promoted.length ? `${r.promoted.join(", ")} moved off the waitlist` : ""].filter(Boolean).join(" · ");
        toast.show(extra ? `Saved · ${extra}` : "Class saved");
        void navigate(back);
      } else {
        const r = await create.mutateAsync(body);
        toast.show(`${r.course.title} created as a draft. Add the first session's content, then publish.`);
        void navigate(`/grow/classes/${r.course.id}`);
      }
    } catch (e) {
      if (!(e instanceof ApiError)) return setBanner("Something went wrong. Please try again.");
      let mapped = false;
      for (const [k, msgs] of Object.entries(e.fields ?? {})) {
        const f = FIELD_MAP[k];
        if (f) {
          setError(f, { message: msgs[0] });
          mapped = true;
        }
      }
      if (!mapped || e.isConflict) setBanner(e.message);
    }
  });

  return (
    <motion.form variants={stagger(0.05)} initial="hidden" animate="show" onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl space-y-6 pb-4">
      <motion.div variants={fadeUp}>
        <button type="button" onClick={() => void leave()} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
          <ArrowLeft className="size-4" aria-hidden />
          {editing ? `Back to ${editing.title}` : "Back to classes"}
        </button>
      </motion.div>
      <PageHeader eyebrow="Grow" title={editing ? "Edit class" : "Create a class"} tagline={editing ? editing.title : "Set it up once. Sessions, the roster and certificates follow from here."} />
      {banner ? <ErrorBanner>{banner}</ErrorBanner> : null}

      <Section n={1} title="Basics" tag="Core identity">
        <Field label="Class name" htmlFor="cf-title" error={errors.title?.message} hint="Add the cohort or term when a class runs more than once, for example “(Cohort 2027-A)”.">
          <input id="cf-title" autoComplete="off" className={inputClass(!!errors.title)} {...register("title")} />
        </Field>
        <Field label="Description" htmlFor="cf-desc" error={errors.description?.message} hint="Shown on the class page in the catalogue.">
          <textarea id="cf-desc" rows={3} className={cn(inputClass(!!errors.description), "h-auto py-2.5")} {...register("description")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pathway step" htmlFor="cf-step" error={errors.step?.message}>
            <select id="cf-step" className={selectClass(!!v.step)} {...register("step")}>
              <option value="">Not on the pathway</option>
              {PATHWAY.map((p) => (
                <option key={p.step} value={p.step}>
                  Step {p.step}: {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Format" htmlFor="cf-format" error={errors.format?.message} hint={FORMAT_HINT[v.format]}>
            <select id="cf-format" className={selectClass(false)} {...register("format")} disabled={!!published}>
              {(Object.keys(FORMAT_LABEL) as CourseFormat[]).map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {published ? <p className="-mt-2 text-xs text-muted">The format is fixed once a class is published.</p> : null}
      </Section>

      <Section n={2} title="Who teaches and marks" tag="Assigned staff">
        <Controller
          control={control}
          name="teacherIds"
          render={({ field }) => (
            <Field label="Teachers" error={errors.teacherIds?.message} hint="Course Authors. They build the sessions and can mark this class, never their own work.">
              <PeoplePicker label="Teachers" people={options.teachers} value={field.value} onChange={field.onChange} invalid={!!errors.teacherIds} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="graderIds"
          render={({ field }) => (
            <Field label={<>Extra graders <span className="font-semibold text-muted">(optional)</span></>} error={errors.graderIds?.message} hint="People who mark this class besides its teachers.">
              <PeoplePicker label="Extra graders" people={options.graders.filter((g) => !v.teacherIds.includes(g.id))} value={field.value.filter((x) => !v.teacherIds.includes(x))} onChange={field.onChange} />
            </Field>
          )}
        />
      </Section>

      <Section n={3} title="Who can join" tag="Audience and prerequisites">
        <Controller
          control={control}
          name="audience"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-sm font-bold text-ink">Open to</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {(
                  [
                    ["everyone", "Everyone", "Members and External Students."],
                    ["members", "Members only", "Hidden from External Students in the catalogue."],
                  ] as const
                ).map(([val, label, hint]) => (
                  <button
                    key={val}
                    type="button"
                    role="radio"
                    aria-checked={field.value === val}
                    onClick={() => field.onChange(val)}
                    className={cn("rounded-2xl border p-3 text-left transition-colors", field.value === val ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200")}
                  >
                    <span className="block text-sm font-bold text-ink">{label}</span>
                    <span className="block text-xs text-muted">{hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        />
        <Controller
          control={control}
          name="prerequisiteSteps"
          render={({ field }) => (
            <Field label={<>Finish first <span className="font-semibold text-muted">(optional)</span></>} error={errors.prerequisiteSteps?.message} hint="People must have finished these pathway steps. The Registrar can let someone in anyway, with a reason.">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Prerequisites">
                {PATHWAY.filter((p) => !v.step || p.step < Number(v.step)).map((p) => {
                  const on = field.value.includes(p.step);
                  return (
                    <button
                      key={p.step}
                      type="button"
                      aria-pressed={on}
                      onClick={() => field.onChange(on ? field.value.filter((x) => x !== p.step) : [...field.value, p.step].sort())}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition-colors",
                        on ? "border-maroon-600 bg-maroon-100/50 text-maroon-800" : "border-line bg-white text-muted hover:border-maroon-200 hover:text-ink",
                      )}
                    >
                      {on ? <Check className="size-3.5" aria-hidden /> : null}
                      {p.step}. {p.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        />
      </Section>

      <Section n={4} title="Schedule" tag="Timing and place">
        {meets ? (
          <>
            <Controller
              control={control}
              name="where"
              render={({ field }) => (
                <Toggle
                  checked={field.value === "online"}
                  onChange={(on) => field.onChange(on ? "online" : "in_person")}
                  title="Live online sessions"
                  hint="People join by link, which shows 15 minutes before the start. Untick for in person."
                />
              )}
            />
            {v.where === "in_person" ? (
              <Field label="Where it meets" htmlFor="cf-place" error={errors.place?.message}>
                <input id="cf-place" placeholder="Chapel" className={inputClass(!!errors.place)} {...register("place")} />
              </Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Day" htmlFor="cf-day" error={errors.day?.message}>
                <select id="cf-day" className={selectClass(false)} {...register("day")}>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}s
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start time" htmlFor="cf-time" error={errors.time?.message} hint="Church time (Central).">
                <input id="cf-time" type="time" className={inputClass(!!errors.time)} {...register("time")} />
              </Field>
              <Field label="First session" htmlFor="cf-start" error={errors.startsOn?.message} hint={started ? "The class has started, so this is fixed." : "Can wait until the term is set."}>
                <input id="cf-start" type="date" disabled={!!started} className={inputClass(!!errors.startsOn)} {...register("startsOn")} />
              </Field>
            </div>
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-2xl bg-cream-200 px-4 py-3 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Self-paced: people start any time and work through the sessions in order. No meeting times.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Number of sessions" htmlFor="cf-count" error={errors.sessionCount?.message} hint={meets ? "One a week." : undefined}>
            <input id="cf-count" inputMode="numeric" className={inputClass(!!errors.sessionCount)} {...register("sessionCount")} />
          </Field>
          <Field label={meets ? "Minutes per meeting" : "Minutes per session"} htmlFor="cf-len" error={errors.lengthMin?.message}>
            <input id="cf-len" inputMode="numeric" className={inputClass(!!errors.lengthMin)} {...register("lengthMin")} />
          </Field>
        </div>
      </Section>

      <Section n={5} title="Seats" tag="Cohort size">
        <Controller
          control={control}
          name="limited"
          render={({ field }) => <Toggle checked={field.value} onChange={field.onChange} title="Limit the seats" hint="Untick for classes anyone can take, such as self-paced ones." />}
        />
        {v.limited ? (
          <>
            <Field label="Seats" htmlFor="cf-seats" error={errors.seats?.message} hint={editing ? `${plural(editing.enrolled, "person", "people")} enrolled now.` : undefined}>
              <input id="cf-seats" inputMode="numeric" className={cn(inputClass(!!errors.seats), "max-w-40")} {...register("seats")} />
            </Field>
            <Controller
              control={control}
              name="waitlist"
              render={({ field }) => (
                <Toggle checked={field.value} onChange={field.onChange} title="Automatic waitlist" hint="When it's full, new people join a waitlist and get seats in order as they free up." />
              )}
            />
          </>
        ) : null}
      </Section>

      <Section n={6} title="Completion rules" tag="Ready for a certificate">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sessions to attend or watch" htmlFor="cf-att" error={errors.attendance?.message} hint={`Out of ${int(v.sessionCount) || "the"} sessions.`}>
            <input id="cf-att" inputMode="numeric" className={inputClass(!!errors.attendance)} {...register("attendance")} />
          </Field>
          <Field label="Assessment" htmlFor="cf-assess" error={errors.assessment?.message}>
            <select id="cf-assess" className={selectClass(false)} {...register("assessment")}>
              {(Object.keys(ASSESSMENT_RULE_LABEL) as AssessmentRule[]).map((k) => (
                <option key={k} value={k}>
                  {ASSESSMENT_RULE_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted">When someone meets these, they show as ready for their certificate.</p>
      </Section>

      <Section n={7} title="Messages" tag="Welcome">
        <Field label={<>Welcome note <span className="font-semibold text-muted">(optional)</span></>} htmlFor="cf-note" error={errors.welcomeNote?.message} hint="Sent as soon as someone's place is confirmed.">
          <textarea id="cf-note" rows={4} className={cn(inputClass(!!errors.welcomeNote), "h-auto py-2.5")} {...register("welcomeNote")} />
        </Field>
      </Section>

      <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-3xl border border-white bg-white/95 p-3 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={() => void leave()}>
          Cancel
        </Button>
        <span className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
          {!editing ? <span className="text-center text-xs text-muted sm:text-right">Saved as a draft. Nobody sees it until you publish.</span> : null}
          <Button type="submit" loading={isSubmitting}>
            {editing ? "Save changes" : "Create class"}
          </Button>
        </span>
      </div>
      {editing ? (
        <p className="text-center text-xs text-muted">
          <Link to={back} className="font-bold text-maroon-700 hover:underline">
            Sessions, roster and resources
          </Link>{" "}
          are on the class page.
        </p>
      ) : null}
    </motion.form>
  );
}
