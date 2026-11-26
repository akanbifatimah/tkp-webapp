import { ArrowLeft, BookOpen, CalendarDays, ClipboardList, ExternalLink, FileText, Link2, PencilLine, Play, Plus, UserCheck, Video } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { fileSize, plural } from "./grow-parts";
import { useSessionDetail } from "./grow-queries";
import { ASSESSMENT_STATUS_LABEL, type AssessmentStatus } from "./grow-types";

/** One session (Figma 136:26483 "Session Detail"): how it went, and quick links to attendance and its content. */

const STATUS_TONE: Record<AssessmentStatus, "neutral" | "gold" | "ok" | "maroon"> = { draft: "neutral", scheduled: "maroon", open: "gold", closed: "ok" };

export function SessionDetailPage() {
  const { id = "", sid = "" } = useParams();
  const navigate = useNavigate();
  const q = useSessionDetail(sid);
  const d = q.data;
  const back = (
    <Link to={`/grow/classes/${id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
      <ArrowLeft className="size-4" aria-hidden />
      {d ? `Back to ${d.course.title}` : "Back to the class"}
    </Link>
  );
  if (q.isError)
    return (
      <div className="space-y-4">
        {back}
        <ErrorBanner>{q.error.message}</ErrorBanner>
      </div>
    );
  if (!d) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;
  const { session: s, course: c, stats } = d;
  const met = !!s.startsAt && Date.parse(s.startsAt) < Date.now();

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      {back}
      <PageHeader
        eyebrow={c.title}
        title={`Session ${String(s.number).padStart(2, "0")}: ${s.title}`}
        tagline={`Teacher: ${c.teachers.map((t) => t.name).join(", ")} · ${plural(c.enrolled, "person", "people")} enrolled`}
      />
      <motion.div variants={fadeUp} className="-mt-3 flex flex-wrap gap-2">
        {s.state === "published" ? <Chip tone="gold">Published</Chip> : <Chip>Draft</Chip>}
        {s.startsAt ? <Chip icon={<CalendarDays className="size-3" aria-hidden />}>{formatWhen(s.startsAt)}</Chip> : null}
        {d.attendance?.due ? <Chip tone="warn">Attendance not marked</Chip> : null}
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Attendance rate" icon={<UserCheck />}>
          {stats.attendanceRate !== null ? (
            <>
              <Big>{stats.attendanceRate}%</Big>
              <Small>
                {stats.attended} of {stats.expected} joined or watched
              </Small>
            </>
          ) : (
            <>
              <Big muted>{d.attendance ? "Not marked" : met ? "Not taken" : "Not yet"}</Big>
              <Small>{d.attendance ? "Take attendance to see it" : s.kind === "live" ? "Opens when the session starts" : "Recorded sessions have no attendance"}</Small>
            </>
          )}
        </Stat>
        <Stat label="Assessment submissions" icon={<ClipboardList />}>
          {stats.submissions !== null ? (
            <>
              <Big>
                {stats.submissions} <span className="text-base text-muted">/ {stats.expected} received</span>
              </Big>
              <Small>Submitted so far</Small>
            </>
          ) : (
            <>
              <Big muted>None</Big>
              <Small>No published assessment opens after this session</Small>
            </>
          )}
        </Stat>
        <Stat label="Video engagement" icon={<Play />}>
          {stats.videoWatch !== null ? (
            <>
              <Big>{stats.videoWatch}%</Big>
              <Small>Average watched, by people who watched the recording</Small>
            </>
          ) : (
            <>
              <Big muted>No views yet</Big>
              <Small>{s.video ? "Nobody has watched the recording yet" : "No video on this session"}</Small>
            </>
          )}
        </Stat>
      </div>

      <Card className="bg-cream-100">
        <p className="mb-3 text-sm font-bold text-muted">Quick links</p>
        <div className="flex flex-wrap gap-2">
          {d.can.attendance ? (
            <Button variant="dark" icon={<UserCheck className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/sessions/${s.id}/attendance`)}>
              {d.attendance?.state === "saved" ? "Attendance" : "Take attendance"}
            </Button>
          ) : d.attendance ? (
            <Button variant="ghost" icon={<UserCheck className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/sessions/${s.id}/attendance`)}>
              See attendance
            </Button>
          ) : null}
          {d.assessments
            .filter((a) => a.status === "open" || a.status === "closed")
            .map((a) => (
              <Button key={a.id} variant="ghost" icon={<ClipboardList className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/assessments/${a.id}/submissions`)}>
                View submissions{stats.submissions !== null ? ` (${stats.submissions}/${stats.expected})` : ""}
              </Button>
            ))}
          {d.can.author ? (
            <>
              <Button variant="ghost" icon={<PencilLine className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/sessions/${s.id}/edit`)}>
                Edit session details
              </Button>
              <Button variant="ghost" icon={<Plus className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/assessments/new?after=${s.number}`)}>
                Add an assessment
              </Button>
            </>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
          <Play className="size-5 text-gold-600" aria-hidden />
          Session teaching media
        </h2>
        {s.video ? (
          <div className="relative mx-auto grid aspect-video max-w-3xl place-items-center overflow-hidden rounded-2xl bg-linear-to-br from-maroon-900 to-ink">
            <span className="grid size-16 place-items-center rounded-full bg-gold-500 text-ink shadow-glow" aria-hidden>
              <Play className="ml-1 size-7" />
            </span>
            <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 bg-ink/70 px-4 py-3 text-sm text-cream-50">
              {s.video.kind === "file" ? (
                <span className="flex min-w-0 items-center gap-2">
                  <Video className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{s.video.file.name}</span>
                  <span className="shrink-0 text-cream-100/70">{fileSize(s.video.file.size)}</span>
                </span>
              ) : (
                <a href={s.video.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 underline-offset-4 hover:underline">
                  <Link2 className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{s.video.url}</span>
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                </a>
              )}
            </span>
          </div>
        ) : (
          <EmptyState icon={<Video />} title={s.kind === "live" && !met ? "The recording comes after the session" : "No video yet"}>
            {s.kind === "live" && s.joinUrl ? `People join live at ${s.joinUrl}. ` : ""}
            {d.can.author ? "Add it in Edit session details." : ""}
          </EmptyState>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
            <BookOpen className="size-5 text-gold-600" aria-hidden />
            Scripture and key takeaways
          </h2>
          {s.summary ? <p className="mb-4 text-sm text-ink">{s.summary}</p> : null}
          {s.scripture ? (
            <p className="mb-4">
              <Chip tone="gold">{s.scripture}</Chip>
            </p>
          ) : null}
          {s.takeaways.length ? (
            <ol className="space-y-2">
              {s.takeaways.map((t, i) => (
                <li key={i} className="flex items-start gap-3 rounded-2xl bg-cream-50 px-4 py-3 text-sm text-ink">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cream-200 text-xs font-bold text-muted tabular">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          ) : !s.summary && !s.scripture ? (
            <p className="text-sm text-muted">No study notes yet.</p>
          ) : null}
        </Card>
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
            <FileText className="size-5 text-gold-600" aria-hidden />
            Handouts
          </h2>
          {s.handouts.length ? (
            <ul className="space-y-2">
              {s.handouts.map((h) => (
                <li key={h.id} className="flex items-center gap-3 rounded-2xl bg-cream-50 px-4 py-3">
                  <FileText className="size-5 shrink-0 text-maroon-700" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{h.name}</span>
                    <span className="block text-xs text-muted">{fileSize(h.size)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No handouts on this session.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-maroon-950">
          <ClipboardList className="size-5 text-gold-600" aria-hidden />
          Assessments after this session
        </h2>
        {d.assessments.length ? (
          <ul className="divide-y divide-line/70">
            {d.assessments.map((a) => (
              <li key={a.id}>
                <Link to={`/grow/classes/${c.id}/assessments/${a.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-maroon-700">
                  <span className="font-bold text-ink">{a.title}</span>
                  <Chip tone={STATUS_TONE[a.status]}>{ASSESSMENT_STATUS_LABEL[a.status]}</Chip>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">None opens after this session.</p>
        )}
      </Card>
    </motion.div>
  );
}

function Stat({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
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
const Big = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <p className={cn("font-display text-2xl font-semibold", muted ? "text-muted" : "text-ink")}>{children}</p>
);
const Small = ({ children }: { children: ReactNode }) => <p className="text-xs text-muted">{children}</p>;
