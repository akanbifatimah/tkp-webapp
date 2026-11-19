import { CalendarClock, Inbox, PhoneCall, Save, SquarePen, UserPlus, Users } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card, ConfidentialChip, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { Tile } from "@/components/ui/Tile";
import { useToast } from "@/components/ui/Toast";
import { stagger } from "@/lib/motion";

/**
 * Foundation review page (mock mode only): every building block in one place,
 * with fictional numbers. Not part of the product.
 */
export function UiKitPage() {
  const toast = useToast();
  const [picked, setPicked] = useState("assigned");
  const [saving, setSaving] = useState(false);

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="space-y-8">
      <PageHeader
        eyebrow="Foundation · M0"
        title="UI kit"
        tagline="Every building block of TKP Hub, with fictional data."
        actions={<ConfidentialChip />}
      />

      <section aria-labelledby="tiles" className="space-y-3">
        <h2 id="tiles" className="font-display text-xl font-semibold text-maroon-900">
          Tiles (they count up, and filter when clicked)
        </h2>
        <motion.div variants={stagger(0.05)} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Tile label="Total guests" value={1500} icon={<Users />} accent="teal" hint="since Jan 21, 2024" onClick={() => setPicked("total")} selected={picked === "total"} />
          <Tile label="Assigned" value={42} icon={<UserPlus />} accent="blue" hint="of 48 this service" onClick={() => setPicked("assigned")} selected={picked === "assigned"} />
          <Tile label="Contacted within 48h" value={92} format={(n) => `${Math.round(n)}%`} icon={<PhoneCall />} accent="gold" hint="of assigned" onClick={() => setPicked("contacted")} selected={picked === "contacted"} />
          <Tile label="48h overdue" value={2} icon={<CalendarClock />} critical hint="need a call today" onClick={() => setPicked("overdue")} selected={picked === "overdue"} />
        </motion.div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold text-maroon-900">Chips: meanings kept from TKP Connect</h2>
          <div className="mt-4 space-y-3">
            <Row label="Status">
              <Chip tone="ok">✓ Contacted</Chip>
              <Chip tone="warn">Due soon</Chip>
              <Chip tone="crit">48h overdue</Chip>
              <Chip tone="crit">Not assigned</Chip>
            </Row>
            <Row label="Phases (charcoal)">
              <Chip tone="phase">Phase 1 · Week 1</Chip>
              <Chip tone="phase">Phase 2</Chip>
              <Chip tone="phase">Phase 3</Chip>
            </Row>
            <Row label="Cell groups">
              <Chip tone="cell-red">Red</Chip>
              <Chip tone="cell-yellow">Yellow</Chip>
              <Chip tone="cell-blue">Blue</Chip>
              <Chip tone="cell-green">Green</Chip>
              <Chip tone="cell-na">No cell</Chip>
            </Row>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-maroon-900">Buttons</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button>Primary</Button>
            <Button
              variant="gold"
              icon={<Save className="size-4" />}
              loading={saving}
              onClick={() => {
                setSaving(true);
                window.setTimeout(() => {
                  setSaving(false);
                  toast.show("Log saved");
                }, 900);
              }}
            >
              Save log
            </Button>
            <Button variant="gold" size="sm" icon={<SquarePen className="size-3.5" />}>
              Log follow-up
            </Button>
            <Button variant="dark">Dark</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="subtle">Subtle</Button>
            <Button disabled disabledReason="Only the assigned person can save this log">
              Disabled
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button variant="ghost" size="sm" onClick={() => toast.show("Guest assigned to Tobi Martins", { undo: () => toast.show("Assignment undone", { tone: "info" }) })}>
              Toast with Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast.show("Log saved · journey closed")}>
              Journey closed toast
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast.show("Someone else saved this guest first. Reload to see it.", { tone: "crit" })}>
              Conflict toast
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-maroon-900">Loading: skeletons, not spinners</h2>
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-8 w-20 rounded-xl" />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-maroon-900">Empty and error states</h2>
          <EmptyState icon={<Inbox />} title="No guests for this service date">
            When the welcome form brings in new guests, they appear here within five minutes.
          </EmptyState>
          <ErrorBanner>TKP Hub cannot reach its server. Check your connection and try again.</ErrorBanner>
        </Card>
      </div>
    </motion.div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-36 text-xs font-extrabold tracking-wide text-muted uppercase">{label}</span>
      {children}
    </div>
  );
}
