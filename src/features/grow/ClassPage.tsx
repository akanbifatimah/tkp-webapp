import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Clock,
  Eye,
  FileText,
  FolderOpen,
  Lock,
  LockOpen,
  MessagesSquare,
  Paperclip,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  Upload,
  Users,
  Video,
} from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { IconAction } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { ChecksList, CourseStatusChip, fileSize, plural, SeatsBar } from "./grow-parts";
import { useAddResource, useArchiveCourse, useCourse, useDeleteCourse, usePublishCourse, usePublishSession, useRegistration, useRemoveResource, useUpload } from "./grow-queries";
import { FORMAT_LABEL, stepLabel, type CourseDetail, type Session } from "./grow-types";
import { AssessmentsPanel } from "./AssessmentsPanel";
import { RosterPanel } from "./RosterPanel";

/**
 * Grow › one class (Figma 135:21567 "Classroom Details", 136:29273 "Classroom
 * Members"; PRD WEB-10, WEB-13, WEB-17, RG-1, RG-4): publish checks, sessions,
 * roster and resources.
 */

type Tab = "sessions" | "assessments" | "roster" | "resources";

const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast.show(e instanceof ApiError ? e.message : "Something went wrong. Please try again.", { tone: "crit" });

export function ClassPage() {
  const { id = "" } = useParams();
  const q = useCourse(id);
  const [params, setParams] = useSearchParams();
  const tab = (["sessions", "assessments", "roster", "resources"].includes(params.get("tab") ?? "") ? params.get("tab") : "sessions") as Tab;
  const c = q.data;

  if (q.isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBanner>{q.error.message}</ErrorBanner>
      </div>
    );
  }
  if (!c) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;

  const published = c.sessions.filter((s) => s.state === "published").length;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "sessions", label: "Sessions", count: c.sessions.length },
    { id: "assessments", label: "Assessments", count: c.assessments.length },
    { id: "roster", label: "Roster", count: c.enrolled + c.waitlisted },
    { id: "resources", label: "Resources", count: c.resources.length },
  ];

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <BackLink />
      <PageHeader
        eyebrow={c.step ? `Step ${c.step} · ${stepLabel(c.step)}` : "Grow"}
        title={c.title}
        tagline={`${c.scheduleLabel}${c.term ? ` · ${c.term}` : ""} · ${c.teachers.map((t) => t.name).join(", ")}`}
        actions={<HeaderActions c={c} />}
      />
      <motion.div variants={fadeUp} className="-mt-3 flex flex-wrap gap-2">
        <CourseStatusChip status={c.status} />
        {c.state === "published" && c.status !== "completed" ? (
          <Chip tone={c.registration === "open" ? "ok" : "neutral"} icon={c.registration === "open" ? <LockOpen className="size-3" aria-hidden /> : <Lock className="size-3" aria-hidden />}>
            Registration {c.registration}
          </Chip>
        ) : null}
        <Chip>{FORMAT_LABEL[c.format]}</Chip>
        {c.audience === "members" ? <Chip tone="maroon">Members only</Chip> : null}
      </motion.div>

      {c.state === "draft" ? <PublishPanel c={c} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Sessions published" icon={<FileText />}>
          <p className="font-display text-2xl font-semibold text-ink">
            {published} of {c.sessions.length}
          </p>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-cream-300" aria-hidden>
            <span className="block h-full rounded-full bg-gold-600" style={{ width: `${c.sessions.length ? (published / c.sessions.length) * 100 : 0}%` }} />
          </span>
        </StatCard>
        <StatCard label="Enrolled" icon={<Users />}>
          <SeatsBar enrolled={c.enrolled} seats={c.seats} waitlisted={c.waitlisted} />
        </StatCard>
        <StatCard label="Average progress" icon={<Eye />}>
          <p className="font-display text-2xl font-semibold text-ink">{c.progress}%</p>
          <p className="text-xs text-muted">Of the published sessions, opened by each person enrolled</p>
        </StatCard>
      </div>

      <div role="tablist" aria-label="Class" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setParams(t.id === "sessions" ? {} : { tab: t.id }, { replace: true })}
            className={cn(
              "relative -mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors",
              tab === t.id ? "border-maroon-700 text-maroon-800" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="ml-1.5 text-xs text-muted tabular">{t.count}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "sessions" ? <SessionsPanel c={c} /> : tab === "assessments" ? <AssessmentsPanel c={c} /> : tab === "roster" ? <RosterPanel courseId={c.id} /> : <ResourcesPanel c={c} />}
      </div>
    </motion.div>
  );
}

function BackLink() {
  return (
    <Link to="/grow/classes" className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
      <ArrowLeft className="size-4" aria-hidden />
      All classes
    </Link>
  );
}

function StatCard({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="mb-2 flex items-center justify-between text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase">
        {label}
        <span className="text-gold-600 [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      </p>
      {children}
    </Card>
  );
}

/* ---------------------------------------------------------------- actions */

function HeaderActions({ c }: { c: CourseDetail }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const registration = useRegistration();
  const archive = useArchiveCourse();
  const remove = useDeleteCourse();
  const forum = (
    <Button variant="ghost" icon={<MessagesSquare className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/forum`)}>
      Class forum
    </Button>
  );
  if (!c.can.manage) return c.status === "draft" ? null : forum;
  const busy = registration.isPending || archive.isPending || remove.isPending;
  const finished = c.status === "completed" || c.status === "archived";

  const toggleRegistration = async () => {
    const open = c.registration !== "open";
    if (!open) {
      const ok = await confirm({
        title: `Close registration for ${c.title}?`,
        body: "Nobody new can join or join the waitlist. Everyone already on the roster keeps their place. You can open it again later.",
        confirmLabel: "Close registration",
      });
      if (!ok) return;
    }
    registration.mutate({ id: c.id, open, rowVer: c.rowVer }, { onSuccess: () => toast.show(open ? "Registration is open" : "Registration closed"), onError: fail(toast) });
  };

  const doArchive = async () => {
    const ok = await confirm({
      title: `Archive ${c.title}?`,
      body: "It leaves the class list and nothing on it can change. Its roster, sessions and records are kept.",
      confirmLabel: `Archive ${c.title}`,
    });
    if (ok) archive.mutate({ id: c.id, rowVer: c.rowVer }, { onSuccess: () => toast.show(`${c.title} archived`), onError: fail(toast) });
  };

  const doDelete = async () => {
    const ok = await confirm({
      title: `Delete ${c.title}?`,
      body: "It's a draft nobody has joined, so nothing else changes. Its sessions are deleted too. This can't be undone.",
      confirmLabel: "Delete class",
    });
    if (ok)
      remove.mutate(c.id, {
        onSuccess: () => {
          toast.show(`${c.title} deleted`);
          void navigate("/grow/classes");
        },
        onError: fail(toast),
      });
  };

  const archivable = c.status === "completed" || (c.status === "open" && c.enrolled + c.waitlisted === 0);
  return (
    <>
      {c.status !== "draft" ? forum : null}
      {c.status !== "archived" ? (
        <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/edit`)} disabled={busy}>
          Edit class
        </Button>
      ) : null}
      {c.state === "published" && !finished ? (
        <Button variant="ghost" icon={c.registration === "open" ? <Lock className="size-4" /> : <LockOpen className="size-4" />} onClick={() => void toggleRegistration()} disabled={busy}>
          {c.registration === "open" ? "Close registration" : "Open registration"}
        </Button>
      ) : null}
      {c.state === "draft" ? (
        <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void doDelete()} disabled={busy || c.enrolled + c.waitlisted > 0}>
          Delete draft
        </Button>
      ) : archivable ? (
        <Button variant="ghost" icon={<Archive className="size-4" />} onClick={() => void doArchive()} disabled={busy}>
          Archive
        </Button>
      ) : null}
    </>
  );
}

function PublishPanel({ c }: { c: CourseDetail }) {
  const publish = usePublishCourse();
  const toast = useToast();
  const confirm = useConfirm();
  const ready = c.checks.every((x) => x.ok);
  const todo = c.checks.filter((x) => !x.ok).length;

  const go = async () => {
    const ok = await confirm({
      title: `Publish ${c.title}?`,
      body: `It appears in the catalogue${c.audience === "members" ? " for members" : ""} and registration opens. Sessions still in draft stay hidden until you publish them.`,
      confirmLabel: "Publish and open registration",
      destructive: false,
    });
    if (ok) publish.mutate({ id: c.id, rowVer: c.rowVer }, { onSuccess: () => toast.show(`${c.title} is published. Registration is open.`), onError: fail(toast) });
  };

  return (
    <Card className="border-l-4 border-l-gold-500">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.12em] text-gold-600 uppercase">Draft</p>
          <h2 className="font-display text-xl font-semibold text-maroon-950">{ready ? "Ready to publish" : `${plural(todo, "thing")} to finish before publishing`}</h2>
          <p className="mb-4 text-sm text-muted">Nobody sees this class until it's published.</p>
          <ChecksList checks={c.checks} />
        </div>
        {c.can.manage ? (
          <Button icon={<Rocket className="size-4" />} onClick={() => void go()} disabled={!ready} disabledReason={ready ? undefined : "Finish the list first"} loading={publish.isPending} className="shrink-0">
            Publish class
          </Button>
        ) : (
          <p className="text-sm text-muted">The Registrar publishes it.</p>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- sessions */

function SessionsPanel({ c }: { c: CourseDetail }) {
  const navigate = useNavigate();
  const now = Date.now();
  const nextLive = c.sessions.find((s) => s.startsAt && Date.parse(s.startsAt) + 3 * 3600_000 > now);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {c.state === "published" ? "People see published sessions only, in this order." : "Publish sessions as their content is ready."}
        </p>
        {c.can.author && c.status !== "archived" ? (
          <Button variant="dark" icon={<Plus className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/sessions/new`)}>
            Add a session
          </Button>
        ) : null}
      </div>
      <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="space-y-2.5">
        {c.sessions.map((s) => (
          <SessionRow key={s.id} c={c} s={s} next={s.id === nextLive?.id && c.status !== "draft"} />
        ))}
      </motion.ul>
    </div>
  );
}

function SessionRow({ c, s, next }: { c: CourseDetail; s: Session; next: boolean }) {
  const navigate = useNavigate();
  const publish = usePublishSession();
  const toast = useToast();
  const open = () => void navigate(`/grow/classes/${c.id}/sessions/${s.id}`);
  const edit = () => void navigate(`/grow/classes/${c.id}/sessions/${s.id}/edit`);
  const canEdit = c.can.author && c.status !== "archived";
  const draft = s.state === "draft";
  return (
    <motion.li
      variants={fadeUp}
      className={cn("flex flex-col gap-3 rounded-3xl border border-white bg-white p-4 shadow-card sm:flex-row sm:items-center sm:p-5", draft && !s.empty && "border-l-4 border-l-gold-500")}
    >
      <span className="w-8 shrink-0 font-display text-lg font-semibold text-gold-800 tabular">{String(s.number).padStart(2, "0")}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={`/grow/classes/${c.id}/sessions/${s.id}`} className="font-bold text-ink hover:text-maroon-700">
            {s.title}
          </Link>
          {draft ? <Chip tone={s.empty ? "neutral" : "warn"}>{s.empty ? "Draft · empty" : "Draft · ready to publish"}</Chip> : <Chip tone="gold">Published</Chip>}
          {next ? <Chip tone="phase">Next up</Chip> : null}
          {s.version > 1 ? <Chip>Version {s.version}</Chip> : null}
          {s.attendance?.due ? (
            <Chip tone="warn">Attendance not marked</Chip>
          ) : s.attendance?.rate !== null && s.attendance ? (
            <Chip tone="ok">{s.attendance.rate}% attended</Chip>
          ) : null}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {s.startsAt ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              {formatWhen(s.startsAt)}
            </span>
          ) : null}
          {s.durationMin ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {s.durationMin} min
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Video className="size-3.5" aria-hidden />
            {s.video ? (s.video.kind === "link" ? "Video link" : "Video uploaded") : s.kind === "live" ? "Recording after the session" : "No video"}
          </span>
          {s.handouts.length ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" aria-hidden />
              {plural(s.handouts.length, "handout")}
            </span>
          ) : null}
          {!draft ? (
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden />
              Opened by {plural(s.opened, "person", "people")}
            </span>
          ) : null}
        </p>
      </div>
      {canEdit ? (
        <span className="flex shrink-0 flex-wrap items-center gap-2">
          {s.attendance?.due ? (
            <Button size="sm" variant="dark" onClick={() => void navigate(`/grow/classes/${c.id}/sessions/${s.id}/attendance`)}>
              Mark attendance
            </Button>
          ) : null}
          {draft && !s.empty ? (
            <Button
              size="sm"
              variant="gold"
              loading={publish.isPending}
              onClick={() =>
                publish.mutate({ id: s.id, rowVer: s.rowVer, publish: true }, { onSuccess: () => toast.show(`Session ${s.number} published`), onError: fail(toast) })
              }
            >
              Publish
            </Button>
          ) : null}
          {draft && s.empty ? (
            <Button size="sm" variant="gold" onClick={edit}>
              Add content
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={open}>
              Open
            </Button>
          )}
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={open}>
          Open
        </Button>
      )}
    </motion.li>
  );
}

/* ---------------------------------------------------------------- resources */

function ResourcesPanel({ c }: { c: CourseDetail }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUpload();
  const add = useAddResource();
  const remove = useRemoveResource();
  const confirm = useConfirm();
  const toast = useToast();
  const canEdit = c.can.author && c.status !== "archived";

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = await upload.mutateAsync({ purpose: "resource", file });
      await add.mutateAsync({ courseId: c.id, file: r.file });
      toast.show(`${file.name} added`);
    } catch (e) {
      fail(toast)(e);
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const drop = async (fileId: string, name: string) => {
    const ok = await confirm({ title: `Remove ${name}?`, body: "People in the class will no longer see it. Upload it again to bring it back.", confirmLabel: "Remove file" });
    if (ok) remove.mutate({ courseId: c.id, fileId }, { onSuccess: () => toast.show(`${name} removed`), onError: fail(toast) });
  };

  return (
    <Card>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-maroon-950">Class resources</h2>
          <p className="text-sm text-muted">For the whole class: the syllabus, reading lists, sheets. Session handouts go on each session.</p>
        </div>
        {canEdit ? (
          <>
            <input ref={input} type="file" accept=".pdf,.docx,.xlsx,.pptx" className="sr-only" id="res-file" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button variant="ghost" icon={<Upload className="size-4" />} onClick={() => input.current?.click()} loading={upload.isPending || add.isPending}>
              Upload a resource
            </Button>
          </>
        ) : null}
      </header>
      {c.resources.length ? (
        <ul className="divide-y divide-line/70">
          {c.resources.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream-200 text-maroon-700" aria-hidden>
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{f.name}</span>
                <span className="block text-xs text-muted">{fileSize(f.size)}</span>
              </span>
              {canEdit ? <IconAction label={`Remove ${f.name}`} icon={<Trash2 />} tone="crit" onClick={() => void drop(f.id, f.name)} disabled={remove.isPending} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<FolderOpen />} title="No resources yet">
          PDF, Word, Excel or PowerPoint, up to 25 MB each.
        </EmptyState>
      )}
    </Card>
  );
}
