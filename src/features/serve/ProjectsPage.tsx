import { Briefcase, Hourglass, Inbox, MousePointerClick, Plus, Search, Users } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { Tile } from "@/components/ui/Tile";
import { inputClass, selectClass } from "@/features/admin/parts";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { Cover, DueChip, ProjectStatusChip } from "./project-parts";
import { useProjects } from "./project-queries";
import { MINISTRIES, PROJECT_STATUS_LABEL, type ProjectStatus } from "./project-types";

/**
 * Serve › Projects (M9 step 2): member project posts reviewed by the pastoral
 * team within 3 days (Figma PJ5), and the projects live in the app (PJ1).
 */

const TABS: ProjectStatus[] = ["submitted", "changes", "live", "closed", "declined"];
const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  const d = Math.round(h / 24);
  return h < 1 ? "just now" : h < 24 ? `${h} ${h === 1 ? "hour" : "hours"} ago` : d === 1 ? "yesterday" : `${d} days ago`;
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ProjectStatus>("submitted");
  const [text, setText] = useState("");
  const [ministry, setMinistry] = useState("");
  const q = useProjects({ status, q: text, ministry });
  const d = q.data;

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="6 · Serve"
        title="Projects"
        tagline={d?.scope === "mine" ? "The projects you coordinate." : "Members post projects; the pastoral team reviews each one within 3 days."}
        actions={
          d?.can.create ? (
            <Button icon={<Plus className="size-4" />} onClick={() => void navigate("/serve/projects/new")}>
              New project
            </Button>
          ) : null
        }
      />
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}
      {!d ? (
        <Skeleton className="h-125 w-full rounded-3xl" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Waiting for review" value={d.counts.submitted} icon={<Hourglass />} accent="gold" critical={d.counts.overdue > 0} hint={d.counts.overdue ? `${d.counts.overdue} past the 3-day promise` : "All within 3 days"} />
            <Tile label="Live projects" value={d.counts.live} icon={<Briefcase />} accent="maroon" hint="On the Projects page in the app" />
            <Tile label="Open spots" value={d.stats.openSpots} icon={<Users />} accent="teal" hint={`Across ${d.stats.openPositions} open positions`} />
            <Tile label="Contact taps" value={d.stats.contactTaps} icon={<MousePointerClick />} accent="blue" hint="Call, WhatsApp or Email taps on live positions" />
          </div>

          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
              {TABS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
                    status === s ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-line bg-white text-muted hover:text-ink",
                  )}
                >
                  {s === "submitted" && d.counts.overdue ? <span className={cn("size-1.5 rounded-full", status === s ? "bg-white" : "bg-crit")} aria-hidden /> : null}
                  {PROJECT_STATUS_LABEL[s]} ({d.counts[s]})
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative block flex-1">
                <span className="sr-only">Search projects</span>
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search projects, positions or who posted…" className={cn(inputClass(), "pl-10")} />
              </label>
              <label className="sm:w-48">
                <span className="sr-only">Ministry</span>
                <select value={ministry} onChange={(e) => setMinistry(e.target.value)} className={selectClass(!!ministry)}>
                  <option value="">Every ministry</option>
                  {MINISTRIES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          {d.items.length ? (
            <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {d.items.map((p) => (
                <motion.li key={p.id} variants={fadeUp}>
                  <Link to={`/serve/projects/${p.id}`} className="block h-full overflow-hidden rounded-3xl border border-white bg-white shadow-card transition-shadow hover:shadow-lift">
                    <Cover ministry={p.ministry} file={p.cover} featured={p.featured} className="h-32" />
                    <div className="space-y-2 p-4">
                      <p className="flex items-start justify-between gap-2">
                        <span className="font-display text-lg leading-snug font-semibold text-maroon-950">{p.name}</span>
                        <ProjectStatusChip status={p.status} />
                      </p>
                      <p className="text-sm text-muted">
                        Posted by {p.postedBy} · {ago(p.submittedAt)}
                        {p.lead ? ` · Lead: ${p.lead}` : ""}
                      </p>
                      {p.status === "submitted" ? (
                        <DueChip dueAt={p.reviewDueAt} overdue={p.overdue} />
                      ) : p.status === "live" ? (
                        <p className="flex flex-wrap gap-x-3 text-xs font-bold text-gold-800">
                          <span>
                            {p.openPositions} open {p.openPositions === 1 ? "position" : "positions"} · {p.openSpots} {p.openSpots === 1 ? "spot" : "spots"}
                          </span>
                          <span className="text-muted">{p.contactTaps} contact taps</span>
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <Card>
              <EmptyState icon={<Inbox />} title={status === "submitted" ? "Nothing waiting for review" : "No projects here"}>
                {status === "submitted" ? "New project posts from members show here." : text ? "Try another search." : "Projects move here as their status changes."}
              </EmptyState>
            </Card>
          )}
        </>
      )}
    </motion.div>
  );
}
