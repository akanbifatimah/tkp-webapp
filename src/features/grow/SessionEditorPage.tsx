import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, FileText, Link2, Plus, Trash2, Undo2, UploadCloud, Video, X } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, IconAction, inputClass, selectClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { fromChurchLocal, toChurchLocal } from "@/lib/time";
import { fileSize, plural } from "./grow-parts";
import { useCourse, useCreateSession, useDeleteSession, usePublishSession, useUpdateSession, useUpload } from "./grow-queries";
import { hasMeetings, type CourseDetail, type Session, type SessionInput, type SessionVideo, type Upload } from "./grow-types";

/**
 * Grow › add or change a session (Figma 135:22208 "Upload Class Session"; PRD
 * LMS-4 to LMS-6, WEB-10, RG-1). Empty sessions can't be published; a change to
 * a session people have opened asks who should see it.
 */

const VIDEO_LINK = /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\/\S+/;

const schema = z
  .object({
    title: z.string().trim().min(2, "Enter the session title").max(100, "Keep the title under 100 characters"),
    number: z.string(),
    kind: z.enum(["live", "recorded", "reading"]),
    startsAt: z.string(),
    joinUrl: z.string().trim(),
    durationMin: z.string().trim(),
    speaker: z.string().trim().max(80, "Keep it under 80 characters"),
    summary: z.string().trim().max(1000, "Keep the summary under 1,000 characters"),
    videoMode: z.enum(["file", "link"]),
    videoFile: z.custom<Upload | null>(),
    videoUrl: z.string().trim(),
    scripture: z.string().trim().max(120, "Keep it under 120 characters"),
    handouts: z.custom<Upload[]>(),
    takeaways: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.joinUrl && !/^https:\/\/\S+\.\S+/.test(v.joinUrl)) issue("joinUrl", "Enter the full link, starting with https://");
    if (v.durationMin && !(/^\d+$/.test(v.durationMin) && +v.durationMin >= 1 && +v.durationMin <= 600)) issue("durationMin", "Between 1 and 600 minutes");
    if (v.videoMode === "link" && v.videoUrl && !VIDEO_LINK.test(v.videoUrl)) issue("videoUrl", "Use a YouTube or Vimeo link, starting with https://");
    v.takeaways.forEach((t, i) => {
      if (t.trim().length > 200) issue(`takeaways.${i}`, "Keep each takeaway under 200 characters");
    });
  });
type Values = z.infer<typeof schema>;

function toValues(s: Session | null, c: CourseDetail): Values {
  const live = hasMeetings(c.format);
  return {
    title: s?.title ?? "",
    number: String(s?.number ?? c.sessions.length + 1),
    kind: s?.kind ?? (live ? "live" : c.format === "reading" ? "reading" : "recorded"),
    startsAt: s?.startsAt ? toChurchLocal(s.startsAt) : "",
    joinUrl: s?.joinUrl ?? "",
    durationMin: s?.durationMin ? String(s.durationMin) : "",
    speaker: s?.speaker ?? "",
    summary: s?.summary ?? "",
    videoMode: s?.video?.kind === "link" ? "link" : "file",
    videoFile: s?.video?.kind === "file" ? s.video.file : null,
    videoUrl: s?.video?.kind === "link" ? s.video.url : "",
    scripture: s?.scripture ?? "",
    handouts: s?.handouts ?? [],
    takeaways: s?.takeaways.length ? [...s.takeaways] : ["", "", ""],
  };
}

function toInput(v: Values, online: boolean): SessionInput {
  const video: SessionVideo | null = v.videoMode === "file" ? (v.videoFile ? { kind: "file", file: v.videoFile } : null) : v.videoUrl ? { kind: "link", url: v.videoUrl } : null;
  return {
    title: v.title.trim(),
    number: Number(v.number),
    kind: v.kind,
    startsAt: v.kind === "live" && v.startsAt ? fromChurchLocal(v.startsAt) : null,
    joinUrl: v.kind === "live" && online ? v.joinUrl || null : null,
    durationMin: v.durationMin ? Number(v.durationMin) : null,
    speaker: v.speaker.trim(),
    summary: v.summary.trim(),
    video,
    scripture: v.scripture.trim(),
    handouts: v.handouts,
    takeaways: v.takeaways.map((t) => t.trim()).filter(Boolean),
  };
}

/** What still stops publishing (the server checks the same, RG-1). */
function problems(i: SessionInput, online: boolean) {
  const out: string[] = [];
  if (!i.video && !i.handouts.length && !i.summary && !i.takeaways.length) out.push("Add a video, a handout, a summary or a takeaway");
  if (i.kind === "live" && !i.startsAt) out.push("Set when it meets");
  if (i.kind === "live" && online && !i.joinUrl) out.push("Add the join link");
  return out;
}

export function SessionEditorPage() {
  const { id = "", sid = "" } = useParams();
  const q = useCourse(id);
  const c = q.data;
  if (q.isError) return <ErrorBanner>{q.error.message}</ErrorBanner>;
  if (!c) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;
  const session = !sid || sid === "new" ? null : (c.sessions.find((s) => s.id === sid) ?? undefined);
  if (session === undefined) return <ErrorBanner>That session no longer exists.</ErrorBanner>;
  return <Editor key={`${session?.id ?? "new"}-${session?.rowVer ?? 0}`} c={c} s={session} />;
}

function Section({ n, title, hint, tag, children }: { n: string; title: string; hint: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-cream-50 tabular" aria-hidden>
            {n}
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold text-maroon-950">{title}</h2>
            <p className="text-xs text-muted">{hint}</p>
          </div>
        </div>
        {tag}
      </header>
      <div className="space-y-5">{children}</div>
    </motion.section>
  );
}

function Editor({ c, s }: { c: CourseDetail; s: Session | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateSession();
  const update = useUpdateSession();
  const publish = usePublishSession();
  const remove = useDeleteSession();
  const upload = useUpload();
  const videoInput = useRef<HTMLInputElement>(null);
  const handoutInput = useRef<HTMLInputElement>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ publishAfter: boolean } | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(s, c) });

  const v = watch();
  const online = c.schedule.where === "online";
  const canEdit = c.can.author && c.status !== "archived";
  const count = c.sessions.length + (s ? 0 : 1);
  const back = s ? `/grow/classes/${c.id}/sessions/${s.id}` : `/grow/classes/${c.id}`;
  const draft = !s || s.state === "draft";
  const input = toInput(v, online);
  const missing = problems(input, online);
  const contentDirty = ["title", "summary", "videoFile", "videoUrl", "videoMode", "scripture", "handouts", "takeaways", "speaker", "durationMin"].some((k) => k in dirtyFields);

  const leave = async () => {
    if (isDirty && canEdit) {
      const ok = await confirm({ title: "Discard your changes?", body: "What you changed on this page since the last save will be lost.", confirmLabel: "Discard changes", cancelLabel: "Keep editing" });
      if (!ok) return;
    }
    void navigate(back);
  };

  const pickFile = async (purpose: "video" | "handout", file: File | undefined) => {
    if (!file) return;
    try {
      const r = await upload.mutateAsync({ purpose, file });
      if (purpose === "video") setValue("videoFile", r.file, { shouldDirty: true });
      else setValue("handouts", [...v.handouts, r.file], { shouldDirty: true });
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "The upload didn't work. Please try again.", { tone: "crit" });
    } finally {
      if (videoInput.current) videoInput.current.value = "";
      if (handoutInput.current) handoutInput.current.value = "";
    }
  };

  const showError = (e: unknown) => {
    if (!(e instanceof ApiError)) return setBanner("Something went wrong. Please try again.");
    let mapped = false;
    for (const [k, msgs] of Object.entries(e.fields ?? {})) {
      const f = k === "video" ? (v.videoMode === "link" ? "videoUrl" : "videoFile") : k;
      if (f in v) {
        setError(f as keyof Values, { message: msgs[0] });
        mapped = true;
      }
    }
    if (!mapped) setBanner(e.message);
  };

  /** Save, then publish if asked. `applyTo` answers RG-1 for sessions people have opened. */
  const save = async (values: Values, publishAfter: boolean, applyTo?: "new" | "everyone") => {
    setBanner(null);
    setBusy(publishAfter ? "publish" : "draft");
    try {
      const body = toInput(values, online);
      let saved: Session;
      if (!s) saved = (await create.mutateAsync({ courseId: c.id, body })).session;
      else saved = (await update.mutateAsync({ id: s.id, body: { ...body, rowVer: s.rowVer, ...(applyTo ? { applyTo } : {}) } })).session;
      if (publishAfter && saved.state === "draft") await publish.mutateAsync({ id: saved.id, rowVer: saved.rowVer, publish: true });
      toast.show(publishAfter && draft ? `Session ${saved.number} published` : s ? "Session saved" : `Session ${saved.number} added as a draft`);
      void navigate(back);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const submit = (publishAfter: boolean) =>
    handleSubmit((values) => {
      if (s && s.state === "published" && s.opened > 0 && contentDirty) return setAsking({ publishAfter });
      void save(values, publishAfter);
    })();

  const unpublish = async () => {
    if (!s) return;
    const ok = await confirm({ title: `Move session ${s.number} back to draft?`, body: "People in the class won't see it until you publish it again.", confirmLabel: "Move back to draft" });
    if (ok) publish.mutate({ id: s.id, rowVer: s.rowVer, publish: false }, { onSuccess: () => toast.show(`Session ${s.number} is a draft again`), onError: showError });
  };

  const del = async () => {
    if (!s) return;
    const ok = await confirm({ title: `Delete session ${s.number}, “${s.title}”?`, body: "Its content and files go with it, and the sessions after it move up one. This can't be undone.", confirmLabel: "Delete session" });
    if (ok)
      remove.mutate(s.id, {
        onSuccess: () => {
          toast.show(`Session ${s.number} deleted`);
          void navigate(back);
        },
        onError: showError,
      });
  };

  return (
    <motion.form variants={stagger(0.05)} initial="hidden" animate="show" onSubmit={(e) => e.preventDefault()} noValidate className="mx-auto max-w-3xl space-y-6 pb-4">
      <motion.div variants={fadeUp}>
        <button type="button" onClick={() => void leave()} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
          <ArrowLeft className="size-4" aria-hidden />
          Back to {c.title}
        </button>
      </motion.div>
      <PageHeader
        eyebrow={c.title}
        title={s ? `Session ${s.number}: ${s.title}` : "Add a session"}
        tagline={canEdit ? "The video, study notes and takeaways people see for this session." : "You can read this session. Its teachers and the Registrar change it."}
        actions={
          s && canEdit ? (
            s.state === "published" ? (
              s.opened === 0 ? (
                <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => void unpublish()}>
                  Move back to draft
                </Button>
              ) : null
            ) : c.sessions.length > 1 ? (
              <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void del()}>
                Delete session
              </Button>
            ) : null
          ) : null
        }
      />
      {s ? (
        <motion.div variants={fadeUp} className="-mt-3 flex flex-wrap gap-2">
          {s.state === "published" ? <Chip tone="gold">Published</Chip> : <Chip>Draft</Chip>}
          {s.state === "published" ? <Chip>Opened by {plural(s.opened, "person", "people")}</Chip> : null}
          {s.version > 1 ? <Chip>Version {s.version}</Chip> : null}
        </motion.div>
      ) : null}
      {banner ? <ErrorBanner>{banner}</ErrorBanner> : null}

      <fieldset disabled={!canEdit} className="space-y-6">
        <Section n="01" title="Session basics" hint="What it's called and where it sits in the class." tag={<Chip>{draft ? "Draft session" : "Published"}</Chip>}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field label="Session title" htmlFor="se-title" error={errors.title?.message}>
              <input id="se-title" data-autofocus placeholder="Walking in Covenant Community" className={inputClass(!!errors.title)} {...register("title")} />
            </Field>
            <Field label="Length (minutes)" htmlFor="se-dur" error={errors.durationMin?.message}>
              <input id="se-dur" inputMode="numeric" placeholder="45" className={inputClass(!!errors.durationMin)} {...register("durationMin")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Position in the class" htmlFor="se-num" error={errors.number?.message} hint="The others move to make room.">
              <select id="se-num" className={selectClass(false)} {...register("number")}>
                {Array.from({ length: count }, (_, i) => (
                  <option key={i} value={i + 1}>
                    Session {i + 1}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={<>Speaker <span className="font-semibold text-muted">(optional)</span></>} htmlFor="se-speaker" error={errors.speaker?.message} hint="When it isn't the class teacher.">
              <input id="se-speaker" placeholder="A guest pastor" className={inputClass(!!errors.speaker)} {...register("speaker")} />
            </Field>
          </div>
          {hasMeetings(c.format) ? (
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-bold text-ink">This session</legend>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                    {(
                      [
                        ["live", "Meets live", online ? "Online, at a set time" : `In person${c.schedule.place ? `, ${c.schedule.place}` : ""}`],
                        ["recorded", "Recorded only", "People watch it in their own time"],
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
          ) : null}
          {v.kind === "live" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Meets" htmlFor="se-when" error={errors.startsAt?.message} hint="Church time (Central).">
                <input id="se-when" type="datetime-local" className={inputClass(!!errors.startsAt)} {...register("startsAt")} />
              </Field>
              {online ? (
                <Field label="Join link" htmlFor="se-join" error={errors.joinUrl?.message} hint="People see it 15 minutes before the start.">
                  <input id="se-join" type="url" inputMode="url" placeholder="https://" className={inputClass(!!errors.joinUrl)} {...register("joinUrl")} />
                </Field>
              ) : null}
            </div>
          ) : null}
          <Field label="Summary" htmlFor="se-summary" error={errors.summary?.message} hint="A short, encouraging note on what this session covers. Shown before the video.">
            <textarea id="se-summary" rows={3} className={cn(inputClass(!!errors.summary), "h-auto py-2.5")} {...register("summary")} />
          </Field>
        </Section>

        <Section
          n="02"
          title="Teaching video"
          hint={v.kind === "live" ? "Add the recording after the session, for anyone who missed it." : "Upload the video, or link an unlisted YouTube or Vimeo video."}
          tag={
            <Controller
              control={control}
              name="videoMode"
              render={({ field }) => (
                <span className="inline-flex rounded-xl bg-cream-200 p-1" role="radiogroup" aria-label="Video source">
                  {(
                    [
                      ["file", "Upload a file"],
                      ["link", "YouTube or Vimeo link"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      role="radio"
                      aria-checked={field.value === val}
                      onClick={() => field.onChange(val)}
                      className={cn("h-8 rounded-lg px-3 text-xs font-bold transition-colors", field.value === val ? "bg-ink text-cream-50" : "text-muted hover:text-ink")}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              )}
            />
          }
        >
          {v.videoMode === "file" ? (
            v.videoFile ? (
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-cream-50 p-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-maroon-100 text-maroon-700" aria-hidden>
                  <Video className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{v.videoFile.name}</span>
                  <span className="block text-xs text-muted">{fileSize(v.videoFile.size)}</span>
                </span>
                {canEdit ? <IconAction label="Remove the video" icon={<X />} onClick={() => setValue("videoFile", null, { shouldDirty: true })} /> : null}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-line bg-cream-50 px-4 py-8 text-center">
                <UploadCloud className="mx-auto size-8 text-gold-600" aria-hidden />
                <p className="mt-2 text-sm font-bold text-ink">Choose the teaching video</p>
                <p className="text-xs text-muted">MP4, MOV or M4V, up to 2 GB. 1080p is plenty.</p>
                <input ref={videoInput} type="file" accept=".mp4,.mov,.m4v,video/*" className="sr-only" id="se-video" onChange={(e) => void pickFile("video", e.target.files?.[0])} />
                <Button variant="ghost" size="sm" className="mt-3" onClick={() => videoInput.current?.click()} loading={upload.isPending && upload.variables?.purpose === "video"}>
                  Browse files
                </Button>
              </div>
            )
          ) : (
            <Field label="Video link" htmlFor="se-vlink" error={errors.videoUrl?.message} hint="An unlisted video, so only the class finds it.">
              <span className="relative block">
                <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input id="se-vlink" type="url" inputMode="url" placeholder="https://vimeo.com/…" className={cn(inputClass(!!errors.videoUrl), "pl-10")} {...register("videoUrl")} />
              </span>
            </Field>
          )}
        </Section>

        <Section n="03" title="Study notes, Scripture and handouts" hint="What people read alongside the video.">
          <Field label={<>Scripture <span className="font-semibold text-muted">(optional)</span></>} htmlFor="se-scripture" error={errors.scripture?.message}>
            <input id="se-scripture" placeholder="Acts 2:42-47; Hebrews 10:23-25" className={inputClass(!!errors.scripture)} {...register("scripture")} />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-bold text-ink">Handouts</p>
            {v.handouts.length ? (
              <ul className="mb-3 space-y-2">
                {v.handouts.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 rounded-2xl border border-line bg-cream-50 px-3.5 py-2.5">
                    <FileText className="size-5 shrink-0 text-maroon-700" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{h.name}</span>
                      <span className="block text-xs text-muted">{fileSize(h.size)}</span>
                    </span>
                    {canEdit ? (
                      <IconAction label={`Remove ${h.name}`} icon={<X />} onClick={() => setValue("handouts", v.handouts.filter((x) => x.id !== h.id), { shouldDirty: true })} />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-muted">No handouts yet. PDF, up to 25 MB each.</p>
            )}
            {canEdit ? (
              <>
                <input ref={handoutInput} type="file" accept=".pdf,application/pdf" className="sr-only" id="se-handout" onChange={(e) => void pickFile("handout", e.target.files?.[0])} />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Plus className="size-4" />}
                  onClick={() => handoutInput.current?.click()}
                  disabled={v.handouts.length >= 10}
                  disabledReason={v.handouts.length >= 10 ? "Up to 10 handouts" : undefined}
                  loading={upload.isPending && upload.variables?.purpose === "handout"}
                >
                  Upload a PDF handout
                </Button>
              </>
            ) : null}
          </div>
          <Controller
            control={control}
            name="takeaways"
            render={({ field }) => (
              <fieldset>
                <legend className="mb-1.5 text-sm font-bold text-ink">Key takeaways</legend>
                <p className="mb-2 text-xs text-muted">Short cards shown under the video. Up to 5.</p>
                <ol className="space-y-2">
                  {field.value.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-3 w-5 shrink-0 text-right text-xs font-bold text-muted tabular">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <label htmlFor={`se-take-${i}`} className="sr-only">
                          Takeaway {i + 1}
                        </label>
                        <input
                          id={`se-take-${i}`}
                          value={t}
                          onChange={(e) => field.onChange(field.value.map((x, j) => (j === i ? e.target.value : x)))}
                          className={inputClass(!!errors.takeaways?.[i])}
                        />
                        {errors.takeaways?.[i]?.message ? <span className="mt-1 block text-xs font-bold text-crit">{errors.takeaways[i]!.message}</span> : null}
                      </span>
                      {canEdit && field.value.length > 1 ? (
                        <IconAction label={`Remove takeaway ${i + 1}`} icon={<X />} onClick={() => field.onChange(field.value.filter((_, j) => j !== i))} />
                      ) : null}
                    </li>
                  ))}
                </ol>
                {canEdit && field.value.length < 5 ? (
                  <button type="button" onClick={() => field.onChange([...field.value, ""])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-gold-800 hover:text-maroon-800">
                    <Plus className="size-4" aria-hidden />
                    Add another takeaway
                  </button>
                ) : null}
              </fieldset>
            )}
          />
        </Section>
      </fieldset>

      {canEdit ? (
        <div className="sticky bottom-3 z-10 rounded-3xl bg-ink p-3 text-cream-50 shadow-card">
          {draft && missing.length ? <p className="px-2 pb-2 text-xs text-cream-100/80">To publish: {missing.join(" · ")}.</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex gap-2">
              <Button variant="onDark" onClick={() => void leave()}>
                {isDirty ? "Discard" : "Cancel"}
              </Button>
              {draft ? (
                <Button variant="onDark" onClick={() => void submit(false)} loading={busy === "draft"} disabled={!!busy}>
                  Save as draft
                </Button>
              ) : null}
            </span>
            {draft ? (
              <Button
                variant="gold"
                onClick={() => void submit(true)}
                loading={busy === "publish"}
                disabled={!!busy || missing.length > 0}
                disabledReason={missing.length ? missing[0] : undefined}
              >
                Publish to the class
              </Button>
            ) : (
              <Button variant="gold" onClick={() => void submit(false)} loading={busy === "draft"} disabled={!!busy || !isDirty}>
                Save changes
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <ApplyToDialog
        open={!!asking}
        opened={s?.opened ?? 0}
        onClose={() => setAsking(null)}
        onChoose={(applyTo) => {
          const publishAfter = asking?.publishAfter ?? false;
          setAsking(null);
          void handleSubmit((values) => save(values, publishAfter, applyTo))();
        }}
      />
    </motion.form>
  );
}

/** RG-1: "edits to live courses apply to new lessons unless confirmed". */
function ApplyToDialog({ open, opened, onClose, onChoose }: { open: boolean; opened: number; onClose: () => void; onChoose: (a: "new" | "everyone") => void }) {
  const [choice, setChoice] = useState<"new" | "everyone">("new");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      subtitle="Published session"
      title="Who should see this change?"
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button onClick={() => onChoose(choice)}>Save the change</Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{plural(opened, "person has", "people have")} already opened this session.</p>
      <div className="space-y-2" role="radiogroup">
        {(
          [
            ["new", "People who haven't opened it yet", `The ${plural(opened, "person", "people")} who opened it keep the version they saw. Best for small fixes.`],
            ["everyone", "Everyone", `The ${plural(opened, "person", "people")} who opened it see the new version too, marked as updated.`],
          ] as const
        ).map(([val, label, hint]) => (
          <button
            key={val}
            type="button"
            role="radio"
            aria-checked={choice === val}
            onClick={() => setChoice(val)}
            className={cn("block w-full rounded-2xl border p-3 text-left transition-colors", choice === val ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200")}
          >
            <span className="block text-sm font-bold text-ink">{label}</span>
            <span className="block text-xs text-muted">{hint}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
