import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorBanner, Skeleton } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/auth";
import { useEntry } from "@/features/connect/queries";
import type { GuestEntry } from "@/features/connect/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatTime, serviceDateLong } from "@/lib/time";
import { RATINGS } from "./model";
import { CellChip, LogFollowUpLink, MemberChip } from "./parts";

/**
 * TKP Connect UI-W3 · View entry: the guest's welcome form exactly as
 * submitted, as a sectioned card (option B, approved Nov 13, 2026).
 * - The prayer request appears here and nowhere else (BR-30).
 * - Blank answers are hidden until "Show blank answers".
 * - Previous / Next step through the current search results.
 * - Print / PDF (D8): enabled for the export roles; every export is logged first.
 */
export function ViewEntryDialog({
  guestId,
  onClose,
  list,
  onNavigate,
}: {
  guestId: number | null;
  onClose: () => void;
  /** The ids of the current search results, for Previous / Next. */
  list?: number[];
  onNavigate?: (id: number) => void;
}) {
  const entry = useEntry(guestId);
  const [showBlank, setShowBlank] = useState(false);
  const { has } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const e = entry.data;
  const idx = guestId !== null && list ? list.indexOf(guestId) : -1;

  const exportPdf = async () => {
    if (guestId === null) return;
    setExporting(true);
    try {
      await api.welcome.logExport(guestId);
      document.documentElement.classList.add("print-entry");
      const done = () => {
        document.documentElement.classList.remove("print-entry");
        window.removeEventListener("afterprint", done);
      };
      window.addEventListener("afterprint", done);
      window.print();
      window.setTimeout(done, 1000);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Could not export.", { tone: "crit" });
    } finally {
      setExporting(false);
    }
  };

  const name = e ? [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ") || "No name given" : "Guest entry";
  const answered = e ? answeredCount(e) : null;

  return (
    <Dialog
      open={guestId !== null}
      onClose={onClose}
      className="max-w-3xl"
      subtitle={e ? `Guest form · as submitted · form record #${e.id}` : "Guest form · as submitted"}
      title={name}
      leading={
        e ? (
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-maroon-600 to-maroon-800 font-display text-lg font-semibold text-cream-50 shadow-card" aria-hidden>
            {((e.firstName ?? "?")[0] ?? "") + ((e.lastName ?? "")[0] ?? "")}
          </span>
        ) : null
      }
      meta={
        e && answered ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Chip>{e.serviceType || "Service not given"}</Chip>
              <Chip>
                {serviceDateLong(e.serviceDate)} · submitted {formatTime(e.submittedAt)}
              </Chip>
              <CellChip cell={e.cellGroup} />
              {e.membershipIntent ? <MemberChip value={e.membershipIntent} /> : null}
              {e.visitNumber > 1 ? <Chip tone="warn">visit {e.visitNumber}</Chip> : null}
              {e.entriesThatDay > 1 ? <Chip tone="gold">{e.entriesThatDay} entries this day · showing the latest</Chip> : null}
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-cream-200">
                <motion.span
                  className="block h-full rounded-full bg-gold-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(answered.got * 100) / answered.of}%` }}
                  transition={{ duration: 0.6 }}
                />
              </span>
              Answered {answered.got} of {answered.of} questions
            </div>
          </div>
        ) : null
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <LogFollowUpLink connectId={e?.connectId} />
          {has("welcome.export") ? (
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={!e || exporting}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 text-sm font-bold text-ink hover:border-maroon-200 disabled:opacity-50"
            >
              <Download className="size-4" aria-hidden /> Print / PDF
            </button>
          ) : (
            <Tooltip label="Your role cannot export guest records">
              <span aria-disabled="true" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-cream-50 px-3.5 text-sm font-bold text-muted/60">
                <Download className="size-4" aria-hidden /> Print / PDF
              </span>
            </Tooltip>
          )}
          {list ? (
            <span className="inline-flex gap-1">
              <button
                type="button"
                disabled={idx <= 0}
                onClick={() => idx > 0 && onNavigate?.(list[idx - 1]!)}
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink hover:border-maroon-200 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" aria-hidden /> Previous
              </button>
              <button
                type="button"
                disabled={idx < 0 || idx >= list.length - 1}
                onClick={() => idx >= 0 && idx < list.length - 1 && onNavigate?.(list[idx + 1]!)}
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink hover:border-maroon-200 disabled:opacity-40"
              >
                Next <ChevronRight className="size-4" aria-hidden />
              </button>
            </span>
          ) : null}
          <label className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={showBlank} onChange={(ev) => setShowBlank(ev.target.checked)} className="size-4 accent-maroon-700" />
            Show blank answers
          </label>
        </div>
      }
    >
      {entry.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : entry.isError ? (
        <ErrorBanner>{entry.error.message}</ErrorBanner>
      ) : e ? (
        <motion.div key={e.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="grid gap-3 sm:grid-cols-2">
          <Section title="About them">
            <Pairs show={showBlank} rows={[["Gender", e.gender], ["Marital status", e.maritalStatus], ["Date of birth", e.dob ? serviceDateLong(e.dob) : null], ["Age bracket", e.ageBracket], ["Nationality", e.nationality]]} />
          </Section>
          <Section title="How to reach them">
            <Pairs
              show={showBlank}
              rows={[
                ["Phone", e.phone ? <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-maroon-700 hover:underline">{e.phone}</a> : null],
                ["Email", e.email ? <a href={`mailto:${e.email}`} className="font-semibold text-maroon-700 hover:underline">{e.email}</a> : null],
                ["Best time to visit", e.bestTimeToVisit],
              ]}
            />
            <h4 className="mt-4 mb-2 text-xs font-extrabold tracking-[0.14em] text-maroon-700 uppercase">Where they live</h4>
            <Pairs
              show={showBlank}
              rows={[
                ["Address", [e.address, e.apt].filter(Boolean).join(", ") || null],
                ["City, state", [e.city, e.state].filter(Boolean).join(", ") || null],
                ["Zip", e.zip],
                ["Country", e.country],
              ]}
            />
          </Section>
          <Section title="Their visit" span>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Pairs
                show={showBlank}
                rows={[
                  ["How did you hear about us?", e.howHeard ? `${e.howHeard}${e.howHeardOther ? ` — ${e.howHeardOther}` : ""}` : null],
                  ["Please who invited you?", e.whoInvitedYou],
                  ["Cell that invited them", e.invitingCellGroup],
                ]}
              />
              <Pairs
                show={showBlank}
                rows={[
                  ["Will you come again?", e.willComeAgain],
                  ["Likely never to come again?", e.likelyNeverComeAgain],
                  ["Like to become a member?", e.likeToBecomeMember],
                  ["Give a thought to membership?", e.giveThoughtToMembership],
                ]}
              />
            </div>
            {e.ifYesWhy ? (
              <>
                <p className="mt-3 text-xs font-semibold text-muted">If “Yes”, please why?</p>
                <Quote text={e.ifYesWhy} />
              </>
            ) : showBlank ? (
              <p className="mt-3 text-xs text-muted">If “Yes”, please why? —</p>
            ) : null}
          </Section>
          <Section title="How was the service?" note="0–10" span>
            <Ratings ratings={e.ratings} showBlank={showBlank} />
          </Section>
          <Section title="Comments">{e.comments ? <Quote text={e.comments} /> : <p className="text-sm text-muted">None.</p>}</Section>
          <Section title="Prayer request" tone="gold">
            {e.prayerRequest ? <Quote text={e.prayerRequest} /> : <p className="text-sm text-muted">None.</p>}
          </Section>
        </motion.div>
      ) : null}
    </Dialog>
  );
}

/** Fields counted by "Answered x of y questions", as on the live page. */
function answeredCount(g: GuestEntry) {
  const all: unknown[] = [
    g.serviceDate, g.serviceType, g.firstName, g.middleName, g.lastName, g.gender, g.maritalStatus, g.dob, g.ageBracket, g.nationality,
    g.address, g.apt, g.city, g.state, g.zip, g.country, g.phone, g.email, g.bestTimeToVisit, g.howHeard, g.whoInvitedYou, g.willComeAgain,
    g.giveThoughtToMembership, g.likeToBecomeMember, g.likelyNeverComeAgain, g.ifYesWhy, g.prayerRequest, g.comments,
    ...RATINGS.map((r) => g.ratings[r.key]),
  ];
  return { got: all.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length, of: all.length };
}

function Section({ title, note, span, tone, children }: { title: string; note?: string; span?: boolean; tone?: "gold"; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border p-4", span && "sm:col-span-2", tone === "gold" ? "border-gold-300 bg-gold-100/50" : "border-line bg-white")}>
      <h3 className="mb-3 text-xs font-extrabold tracking-[0.14em] text-maroon-700 uppercase">
        {title} {note ? <span className="rounded-full bg-cream-200 px-1.5 py-0.5 text-[10px] tracking-normal text-muted">{note}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function Pairs({ rows, show }: { rows: [string, React.ReactNode][]; show: boolean }) {
  const visible = rows.filter(([, v]) => show || (v !== null && v !== undefined && v !== ""));
  if (!visible.length) return <p className="text-sm text-muted">No answers.</p>;
  return (
    <dl className="grid gap-2">
      {visible.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 text-sm">
          <dt className="font-semibold text-muted">{k}</dt>
          <dd className={cn("min-w-0 wrap-break-word", v ? "text-ink" : "text-muted/60")}>{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Quote({ text }: { text: string }) {
  return <blockquote className="rounded-xl border-l-4 border-gold-500 bg-cream-50 px-3 py-2 text-[15px] text-ink">{text}</blockquote>;
}

function Ratings({ ratings, showBlank }: { ratings: Record<string, number | null>; showBlank: boolean }) {
  const rated = RATINGS.filter((r) => ratings[r.key] !== null && ratings[r.key] !== undefined);
  if (!rated.length) return <p className="text-sm text-muted">No ratings given.</p>;
  const avg = rated.reduce((a, r) => a + (ratings[r.key] ?? 0), 0) / rated.length;
  return (
    <>
      <p className="mb-3 text-xs font-semibold text-muted">
        Average <b className="text-ink">{avg.toFixed(1)}</b> / 10 · {rated.length} of 8 rated · 0–5 shown in red
      </p>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-8">
        {RATINGS.filter((r) => showBlank || rated.includes(r)).map((r) => {
          const v = ratings[r.key] ?? null;
          return (
            <div key={r.key} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm">
              <span className="truncate font-semibold text-ink">
                <span aria-hidden>{r.icon}</span> {r.label}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-cream-200">
                <motion.span
                  className={cn("block h-full rounded-full", v !== null && v <= 5 ? "bg-crit" : "bg-maroon-600")}
                  initial={{ width: 0 }}
                  animate={{ width: `${v === null ? 0 : v * 10}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
              <b className="text-right tabular">{v ?? <span className="text-muted">—</span>}</b>
            </div>
          );
        })}
      </div>
    </>
  );
}
