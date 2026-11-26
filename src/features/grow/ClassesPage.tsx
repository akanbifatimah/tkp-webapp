import { BookOpen, Plus, Search } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { inputClass } from "@/features/admin/parts";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { CourseStatusChip, SeatsBar, StepTag } from "./grow-parts";
import { useCourses } from "./grow-queries";
import { STATUS_LABEL, type CourseStatus, type CourseSummary } from "./grow-types";

/** Grow › Classes (Figma 135:20953 "Class Management"; PRD WEB-10, WEB-17). */

const FILTERS: (CourseStatus | "all")[] = ["all", "open", "in_session", "completed", "draft", "archived"];

export function ClassesPage() {
  const q = useCourses();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<CourseStatus | "all">("all");
  const [text, setText] = useState("");
  const d = q.data;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const x of d?.items ?? []) {
      if (x.status !== "archived") c.all = (c.all ?? 0) + 1;
      c[x.status] = (c[x.status] ?? 0) + 1;
    }
    return c;
  }, [d]);

  const items = (d?.items ?? []).filter((c) => {
    if (filter === "all" ? c.status === "archived" : c.status !== filter) return false;
    const n = text.trim().toLowerCase();
    return !n || c.title.toLowerCase().includes(n) || c.teachers.some((t) => t.name.toLowerCase().includes(n)) || (c.term ?? "").toLowerCase().includes(n);
  });

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Grow"
        title="Classes"
        tagline={d?.scope === "assigned" ? "The classes you teach or mark." : "Everything running in Grow."}
        actions={
          d?.can.manage ? (
            <Button icon={<Plus className="size-4" />} onClick={() => void navigate("/grow/classes/new")}>
              Create a class
            </Button>
          ) : null
        }
      />
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}

      <div className="space-y-3">
        <label className="relative block max-w-md">
          <span className="sr-only">Search classes</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search class, teacher or term…" className={cn(inputClass(), "pl-10")} />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {FILTERS.filter((f) => f === "all" || counts[f]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "h-9 rounded-full border px-3.5 text-sm font-bold transition-colors",
                filter === f ? "border-gold-400 bg-gold-100 text-gold-800" : "border-line bg-white text-muted hover:border-maroon-200 hover:text-ink",
              )}
            >
              {f === "all" ? "All" : STATUS_LABEL[f]} ({counts[f] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {!d ? (
        <Skeleton className="h-125 w-full rounded-3xl" />
      ) : (
        <Card className="p-0 sm:p-0">
          {items.length ? (
            <>
              <table className="hidden w-full text-left text-sm lg:table">
                <thead className="bg-cream-100 text-xs font-extrabold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="rounded-tl-3xl px-6 py-4">Class</th>
                    <th className="px-3 py-4">Pathway step</th>
                    <th className="px-3 py-4">Teacher</th>
                    <th className="px-3 py-4">Schedule</th>
                    <th className="px-3 py-4">Enrolled</th>
                    <th className="rounded-tr-3xl px-6 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {items.map((c) => (
                    <Row key={c.id} c={c} />
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-line/70 lg:hidden">
                {items.map((c) => (
                  <li key={c.id}>
                    <Link to={`/grow/classes/${c.id}`} className="block space-y-2 px-4 py-4 hover:bg-cream-50 sm:px-6">
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-bold text-ink">{c.title}</span>
                        <CourseStatusChip status={c.status} />
                      </span>
                      <StepTag step={c.step} />
                      <span className="block text-sm text-muted">
                        {c.scheduleLabel} · {c.teachers.map((t) => t.name).join(", ")}
                      </span>
                      <SeatsBar enrolled={c.enrolled} seats={c.seats} waitlisted={c.waitlisted} className="max-w-xs" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState icon={<BookOpen />} title={text ? "No class matches that search" : "No classes here"}>
              {d.items.length ? "Try another filter or search." : d.can.manage ? "Create the first class for this term." : "When the Registrar assigns you a class, it shows here."}
            </EmptyState>
          )}
        </Card>
      )}
      {d ? (
        <p className="text-right text-xs text-muted">
          Showing {items.length} of {d.items.length} classes{filter === "all" && counts.archived ? `. ${counts.archived} archived are under Archived.` : "."}
        </p>
      ) : null}
    </motion.div>
  );
}

function Row({ c }: { c: CourseSummary }) {
  const navigate = useNavigate();
  return (
    <tr className="cursor-pointer hover:bg-cream-50" onClick={() => void navigate(`/grow/classes/${c.id}`)}>
      <td className="px-6 py-4">
        <Link to={`/grow/classes/${c.id}`} className="font-bold text-ink hover:text-maroon-700" onClick={(e) => e.stopPropagation()}>
          {c.title}
        </Link>
        {c.term ? <span className="block text-xs text-muted">{c.term}</span> : null}
      </td>
      <td className="px-3 py-4">
        <StepTag step={c.step} />
      </td>
      <td className="px-3 py-4 text-ink">{c.teachers.map((t) => t.name).join(", ")}</td>
      <td className="max-w-48 px-3 py-4 text-muted">{c.scheduleLabel}</td>
      <td className="px-3 py-4">
        <SeatsBar enrolled={c.enrolled} seats={c.seats} waitlisted={c.waitlisted} />
      </td>
      <td className="px-6 py-4 text-right">
        <span className="flex flex-col items-end gap-1">
          <CourseStatusChip status={c.status} />
          {c.status !== "draft" && c.status !== "archived" && c.status !== "completed" ? (
            <span className="text-xs text-muted">Registration {c.registration}</span>
          ) : null}
        </span>
      </td>
    </tr>
  );
}
