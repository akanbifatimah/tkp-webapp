import { Lock, Route } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "@/features/auth/auth";
import { Chip } from "@/components/ui/Chip";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorBanner, Skeleton } from "@/components/ui/misc";
import { serviceDateLong } from "@/lib/time";
import { CellChip, LogFollowUpLink, MemberChip, RatingBars, ViewEntryButton } from "./parts";
import { useGuestRecord } from "./queries";

/**
 * TKP Connect UI-W2 · the guest record drawer. In sections, with the legacy
 * follow-up notes and ✎ Log follow-up. No prayer request here (BR-30).
 */
export function GuestDrawer({ id, onClose, onViewEntry }: { id: number | null; onClose: () => void; onViewEntry: (id: number) => void }) {
  const q = useGuestRecord(id);
  const g = q.data;
  const { has } = useAuth();

  return (
    <Drawer open={id !== null} onClose={onClose} label={g ? `Guest · form entry #${g.id}` : "Guest"}>
      {q.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : q.isError ? (
        <ErrorBanner>{q.error.message}</ErrorBanner>
      ) : g ? (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-maroon-900">{[g.firstName, g.middleName, g.lastName].filter(Boolean).join(" ")}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <CellChip cell={g.cellGroup} />
              <Chip>{g.serviceType || "Service not given"}</Chip>
              {g.entriesWithPhone > 1 ? <Chip tone="warn">{g.entriesWithPhone} form entries with this phone</Chip> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <LogFollowUpLink connectId={g.connectId} />
              <ViewEntryButton onClick={() => onViewEntry(g.id)} />
              {g.connectId && has("connect.journey.view") ? (
                <Link
                  to={`/connect/journey/${g.connectId}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink hover:border-maroon-200"
                >
                  <Route className="size-4" aria-hidden /> Guest journey
                </Link>
              ) : null}
            </div>
          </div>

          <Card title="Visit & contact">
            <Kv label="Service" value={`${serviceDateLong(g.serviceDate)} · ${g.serviceType || "—"}`} />
            <Kv label="Phone" value={g.phone} />
            <Kv label="Email" value={g.email} />
            <Kv
              label="Address"
              value={
                [g.address, g.apt].filter(Boolean).join(" ") || [g.city, g.state, g.zip].some(Boolean) ? (
                  <>
                    {[g.address, g.apt].filter(Boolean).join(" ") || "—"}
                    <br />
                    {[g.city, g.state, g.zip].filter(Boolean).join(", ")}
                  </>
                ) : null
              }
            />
            <Kv label="Best time to visit" value={g.bestTimeToVisit} />
          </Card>

          <Card title="About them">
            <Kv label="Gender" value={g.gender} />
            <Kv label="Age group" value={g.ageBracket ? `${g.ageBracket}${g.ageGroup ? ` · ${g.ageGroup}` : ""}` : null} />
            <Kv label="Marital status" value={g.maritalStatus} />
            <Kv label="Heard via" value={g.howHeard ? `${g.howHeard}${g.howHeardOther ? ` · “${g.howHeardOther}”` : ""}` : null} />
            <Kv label="Invited by" value={g.invitedBy ? `${g.invitedBy}${g.invitingCellGroup && g.invitingCellGroup !== "Not given" ? ` · ${g.invitingCellGroup} cell` : ""}` : null} />
            <Kv label="Come again?" value={g.willComeAgain} />
            <Kv label="Become a member?" value={<MemberChip value={g.membershipIntent} />} />
            <Kv label="Comments" value={g.comments} />
          </Card>

          <Card title="Ratings">
            <RatingBars ratings={g.ratings} />
          </Card>

          <Card title="Follow-up notes" sub="from the form record">
            {g.followUpNotes.length ? (
              g.followUpNotes.map((f, i) => (
                <p key={i} className="text-sm">
                  <b>{f.by ?? "—"}:</b> {f.text}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted">None yet.</p>
            )}
          </Card>

          <p className="flex items-center gap-2 rounded-2xl bg-gold-100 px-4 py-3 text-sm font-semibold text-gold-800">
            <Lock className="size-4 shrink-0" aria-hidden />
            Prayer requests are not shown here. They go only to the prayer team.
          </p>
        </div>
      ) : null}
    </Drawer>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h3 className="mb-3 text-xs font-extrabold tracking-[0.14em] text-maroon-700 uppercase">
        {title} {sub ? <span className="font-semibold tracking-normal text-muted normal-case">{sub}</span> : null}
      </h3>
      <dl className="grid gap-2">{children}</dl>
    </section>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 text-sm">
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 text-ink wrap-break-word">{value ?? "—"}</dd>
    </div>
  );
}
