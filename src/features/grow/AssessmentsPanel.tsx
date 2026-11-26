import { ClipboardList, Plus } from "lucide-react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Card, EmptyState } from "@/components/ui/misc";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { plural } from "./grow-parts";
import { ASSESSMENT_RULE_LABEL, ASSESSMENT_STATUS_LABEL, type AssessmentStatus, type CourseDetail } from "./grow-types";

/** The class page's Assessments tab: what each assessment asks and when it runs. */

const TONE: Record<AssessmentStatus, ChipTone> = { draft: "neutral", scheduled: "maroon", open: "gold", closed: "ok" };

export function AssessmentsPanel({ c }: { c: CourseDetail }) {
  const navigate = useNavigate();
  const canAdd = c.can.author && c.status !== "archived";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          For the certificate: <span className="font-bold text-ink">{ASSESSMENT_RULE_LABEL[c.completion.assessment].toLowerCase()}</span>.
        </p>
        {canAdd ? (
          <Button variant="dark" icon={<Plus className="size-4" />} onClick={() => void navigate(`/grow/classes/${c.id}/assessments/new`)}>
            New assessment
          </Button>
        ) : null}
      </div>
      {c.assessments.length ? (
        <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="space-y-2.5">
          {c.assessments.map((a) => (
            <motion.li key={a.id} variants={fadeUp}>
              <Link
                to={`/grow/classes/${c.id}/assessments/${a.id}`}
                className="flex flex-col gap-2 rounded-3xl border border-white bg-white p-4 shadow-card hover:border-maroon-200 sm:flex-row sm:items-center sm:p-5"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cream-200 text-maroon-700" aria-hidden>
                  <ClipboardList className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-ink">{a.title}</span>
                    <Chip tone={TONE[a.status]}>{ASSESSMENT_STATUS_LABEL[a.status]}</Chip>
                    {a.final ? <Chip tone="gold">Final</Chip> : null}
                  </span>
                  <span className="block text-sm text-muted">
                    {plural(a.questions.length, "question")} · after session {a.afterSession}
                    {a.opensAt ? ` · opens ${formatWhen(a.opensAt)}` : ""}
                    {a.closesAt ? ` · closes ${formatWhen(a.closesAt)}` : ` · open for ${a.windowDays} days`}
                  </span>
                  {a.status === "draft" && a.problems.length ? <span className="block text-xs text-muted">To publish: {a.problems.join(" ")}</span> : null}
                </span>
                {a.status === "open" || a.status === "closed" ? (
                  <span className="shrink-0 text-sm text-muted">
                    <span className="font-bold text-ink tabular">{a.submissions}</span> / {c.enrolled} submitted
                  </span>
                ) : null}
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      ) : (
        <Card>
          <EmptyState icon={<ClipboardList />} title="No assessments yet">
            {canAdd ? "Add a reflection for after a session, or the class's final assessment." : "The class teachers add them."}
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
