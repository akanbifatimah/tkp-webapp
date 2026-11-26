import { Check, Hammer } from "lucide-react";
import { motion } from "motion/react";
import { Chip } from "@/components/ui/Chip";
import { Card, PageHeader } from "@/components/ui/misc";
import { stagger } from "@/lib/motion";

/**
 * Stand-in for a page that is not built yet. Says what is coming and where the
 * spec comes from, so testers know what they are looking at.
 */
export type ComingSpec = {
  eyebrow: string;
  title: string;
  tagline?: string;
  milestone: string;
  source: string;
  features: string[];
};

export function ModuleComing({ spec }: { spec: ComingSpec }) {
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow={spec.eyebrow}
        title={spec.title}
        tagline={spec.tagline}
        actions={<Chip tone="gold" icon={<Hammer className="size-3.5" aria-hidden />}>{spec.milestone}</Chip>}
      />
      <Card className="max-w-3xl">
        <h2 className="font-display text-lg font-semibold text-maroon-900">What this page will do</h2>
        <p className="mt-1 text-sm text-muted">Source: {spec.source}</p>
        <motion.ul variants={stagger(0.04, 0.1)} className="mt-4 grid gap-2.5">
          {spec.features.map((f) => (
            <motion.li
              key={f}
              variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
              className="flex items-start gap-3 text-[15px]"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-cream-200 text-maroon-700">
                <Check className="size-3" aria-hidden />
              </span>
              {f}
            </motion.li>
          ))}
        </motion.ul>
      </Card>
    </motion.div>
  );
}


const later = (title: string, features: string[]): ComingSpec => ({
  eyebrow: title,
  title,
  milestone: "Part 2 · from the PRD",
  source: "TKP Hub PRD",
  features,
});

export const COMING_LATER: Record<string, ComingSpec> = {
  belong: later("Belong", ["Small groups and the opt-in member directory", "Cell groups and rosters"]),
  grow: later("Grow", ["Class catalogue and enrolment for members and External Students", "Lessons, exams and your certificates (member portal)"]),
  care: later("Care", ["Prayer Wall moderation", "Care team overview"]),
  serve: later("Serve", ["Projects, positions and applicant review", "Events and 168 Hours of Praise"]),
  lead: later("Lead", ["Leadership dashboards with totals only"]),
  go: later("Go", ["Outreach and missions"]),
  transform: later("Transform", ["Long-term discipleship metrics"]),
};
