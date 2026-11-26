import { BookOpen, Clapperboard, Hammer, HandHeart, HeartHandshake, ImageIcon, Music, Sparkles, Star, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import { PROJECT_STATUS_LABEL, type Ministry, type ProjectStatus } from "./project-types";

/** Small pieces shared by the Projects screens (Figma PJ1, PJ3). */

const STATUS_TONE: Record<ProjectStatus, ChipTone> = { submitted: "gold", changes: "warn", live: "ok", declined: "crit", closed: "neutral" };
export const ProjectStatusChip = ({ status }: { status: ProjectStatus }) => <Chip tone={STATUS_TONE[status]}>{PROJECT_STATUS_LABEL[status]}</Chip>;

const ICON: Record<Ministry, ReactNode> = {
  Media: <Clapperboard />,
  Music: <Music />,
  Education: <BookOpen />,
  Outreach: <HandHeart />,
  Children: <Users />,
  Hospitality: <HeartHandshake />,
  Prayer: <Sparkles />,
  Facilities: <Hammer />,
  Other: <Sparkles />,
};

/** The cover: the mock keeps the file's name only, so this stands in for the photo (Figma PJ1 cards). */
export function Cover({ ministry, file, featured, className, children }: { ministry: Ministry; file: { name: string } | null; featured?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden bg-linear-to-br from-maroon-800 via-maroon-900 to-ink", className)}>
      <span className="absolute -right-4 -bottom-6 text-cream-50/10 [&_svg]:size-32" aria-hidden>
        {ICON[ministry]}
      </span>
      <span className="absolute top-3 left-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-cream-50/90 px-2.5 py-1 text-[11px] font-bold text-maroon-800">{ministry}</span>
        {featured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-500 px-2.5 py-1 text-[11px] font-bold text-ink">
            <Star className="size-3" aria-hidden />
            Featured
          </span>
        ) : null}
      </span>
      {!file ? (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-crit/90 px-2.5 py-1 text-[11px] font-bold text-white">
          <ImageIcon className="size-3" aria-hidden />
          No cover photo
        </span>
      ) : null}
      {children}
    </div>
  );
}

const DAY = 86_400_000;
/** "Review by Fri · 2 days left" or "Overdue by 1 day" (Figma PJ5: reviewed within 3 days). */
export function DueChip({ dueAt, overdue }: { dueAt: string; overdue: boolean }) {
  const days = Math.ceil(Math.abs(Date.parse(dueAt) - Date.now()) / DAY);
  const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" }).format(new Date(dueAt));
  return overdue ? (
    <Chip tone="crit">
      Overdue by {days} {days === 1 ? "day" : "days"}
    </Chip>
  ) : (
    <Chip tone="gold">
      Review by {when} · {days <= 1 ? "today" : `${days} days left`}
    </Chip>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
export const civil = (d: string) => dateFmt.format(new Date(`${d}T12:00:00Z`));
