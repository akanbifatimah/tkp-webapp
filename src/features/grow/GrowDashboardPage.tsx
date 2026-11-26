import { ArrowRight, BookOpen, CalendarClock, CalendarDays, ClipboardCheck, ClipboardList, FilePen, Hourglass, MessageSquareHeart, Plus, Radio, UserCheck, UserRound, Users } from "lucide-react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { Tile } from "@/components/ui/Tile";
import { useAuth } from "@/features/auth/auth";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatTime, greeting } from "@/lib/time";
import { plural } from "./grow-parts";
import { useGrowOverview } from "./grow-queries";
import type { GrowOverview } from "./grow-types";

/**
 * Grow dashboard (Figma 135:20362 "Grow Dashboard"; PRD WEB-9, RG-4): the
 * term at a glance for the Registrar, and for teachers and graders their own classes.
 */

const ATTENTION_ICON: Record<GrowOverview["attention"][number]["kind"], React.ReactNode> = {
  draft: <FilePen />,
  unpublished: <CalendarClock />,
  full: <Users />,
  seats: <Users />,
  attendance: <UserCheck />,
  assessment: <ClipboardList />,
  review: <MessageSquareHeart />,
};

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", month: "short", day: "numeric" });

export function GrowDashboardPage() {
  const q = useGrowOverview();
  const { member } = useAuth();
  const navigate = useNavigate();
  const d = q.data;
  const first = member?.fullName.split(" ")[0];

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-7">
      <PageHeader
        eyebrow="4 · Grow"
        title={`${greeting()}${first ? `, ${first}` : ""}.`}
        tagline={d ? "Here's today across your classes." : undefined}
        actions={
          <>
            {d ? (
              <Chip tone="gold" icon={<CalendarDays className="size-3.5" aria-hidden />}>
                {d.term.label} · Week {d.term.week}
              </Chip>
            ) : null}
            {d?.can.manage ? (
              <Button icon={<Plus className="size-4" />} onClick={() => void navigate("/grow/classes/new")}>
                Create a class
              </Button>
            ) : null}
          </>
        }
      />
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}

      {!d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-3xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="People enrolled" value={d.tiles.enrolled} icon={<UserRound />} accent="maroon" hint="In classes that haven't finished" />
            <Tile label="Joined live" value={d.tiles.joinedThisWeek} icon={<Radio />} accent="teal" hint="Live session joins in the last 7 days" />
            <Tile label="Classes in session" value={d.tiles.running} icon={<BookOpen />} accent="gold" hint="Between their first and last session" />
            <Tile label="Waiting for a seat" value={d.tiles.waitlisted} icon={<Hourglass />} accent="rose" hint="On a class waitlist" />
          </div>

          <section aria-labelledby="attention-h">
            <motion.header variants={fadeUp} className="mb-3 flex items-center gap-2.5">
              <h2 id="attention-h" className="font-display text-2xl font-semibold text-maroon-950">
                Needs your attention
              </h2>
              {d.attention.length ? <Chip tone="gold">{plural(d.attention.length, "item")}</Chip> : null}
            </motion.header>
            {d.attention.length ? (
              <motion.ul variants={stagger(0.04)} className="space-y-3">
                {d.attention.map((a) => (
                  <motion.li key={a.id} variants={fadeUp}>
                    <div
                      className={cn(
                        "flex flex-col gap-3 rounded-3xl border border-white bg-white p-4 shadow-card sm:flex-row sm:items-center sm:p-5",
                        a.kind !== "draft" && "border-l-4 border-l-gold-500",
                      )}
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cream-200 text-maroon-700 [&_svg]:size-5" aria-hidden>
                        {ATTENTION_ICON[a.kind]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-ink">{a.title}</p>
                        <p className="text-sm text-muted">{a.detail}</p>
                      </div>
                      <Link
                        to={a.to ?? `/grow/classes/${a.courseId}${a.kind === "full" ? "?tab=roster" : ""}`}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-cream-50 hover:bg-maroon-900"
                      >
                        {a.action}
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            ) : (
              <Card>
                <EmptyState icon={<ClipboardCheck />} title="Nothing needs you right now">
                  Sessions meeting this week are published, and no class is waiting to be finished.
                </EmptyState>
              </Card>
            )}
          </section>

          <section aria-labelledby="week-h">
            <motion.header variants={fadeUp} className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="week-h" className="font-display text-2xl font-semibold text-maroon-950">
                This week at a glance
              </h2>
              <p className="text-xs font-extrabold tracking-[0.12em] text-muted uppercase">{plural(d.week.length, "session")} in the next 7 days</p>
            </motion.header>
            <Card className="p-0 sm:p-0">
              {d.week.length ? (
                <ul className="divide-y divide-line/70">
                  {d.week.map((w) => (
                    <li key={w.sessionId}>
                      <Link to={`/grow/classes/${w.courseId}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 hover:bg-cream-50 sm:px-6">
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cream-200 text-gold-800" aria-hidden>
                          <CalendarDays className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1 basis-56">
                          <span className="block font-bold text-ink">{w.title}</span>
                          <span className="block text-sm text-muted">
                            {dayFmt.format(new Date(w.at))} · {formatTime(w.at)} · {w.where}
                          </span>
                          <span className="block text-xs text-muted">Session {w.sessionTitle}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
                          <Users className="size-4" aria-hidden />
                          <span className="font-bold text-ink tabular">{w.enrolled}</span> enrolled
                        </span>
                        <span className="flex min-w-40 shrink-0 items-center gap-1.5 text-sm text-muted">
                          <UserRound className="size-4" aria-hidden />
                          Teacher: <span className="font-bold text-ink">{w.teachers.join(", ")}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<CalendarDays />} title="No live sessions this week">
                  Self-paced classes carry on as usual.
                </EmptyState>
              )}
            </Card>
          </section>
        </>
      )}
    </motion.div>
  );
}
