import { ChevronDown, Route, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { Chip } from "@/components/ui/Chip";
import { ConfidentialChip, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { serviceDateShort, serviceWeekday } from "@/lib/time";
import { DraftNotice } from "./DraftNotice";
import { GUEST_TRACK_SCRIPTS, STAGES } from "./guest-track-scripts";
import { CONNECT_TAGLINE } from "./model";
import { ScriptBody, ScriptButtons } from "./parts";
import { useGuestTrack } from "./queries";
import type { GuestTrackResponse, GuestTrackRow, GuestTrackStage } from "./types";

/**
 * TKP Connect UI-C4 (PLANNED) · Guest Track: guests before or between visits,
 * with the Guest Track text that is due for each (48-hour text, invitations to
 * visits 2 and 3). Draft built from the three scripts' timing notes.
 */
export function GuestTrackPage() {
  const q = useGuestTrack();
  const [stage, setStage] = useState<GuestTrackStage>("48h");
  const d = q.data;
  const rows = d?.rows.filter((r) => r.stage === stage) ?? [];
  const meta = STAGES.find((s) => s.id === stage)!;

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="2 · Connect · Before and between visits" title="Guest Track" tagline={CONNECT_TAGLINE} actions={<ConfidentialChip />} />
      <DraftNotice questions="Q13">
        The stages follow the “when” notes on the three Guest Track scripts in the SOP library. Who sends each text, and whether “sent” should be recorded, are still to be agreed.
      </DraftNotice>

      {q.isError ? (
        <ErrorBanner>{q.error.message}</ErrorBanner>
      ) : !d ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : (
        <>
          <motion.div variants={fadeUp} role="tablist" aria-label="Guest Track stage" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {STAGES.map((s) => {
              const on = s.id === stage;
              const n = d.rows.filter((r) => r.stage === s.id).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setStage(s.id)}
                  className={cn(
                    "relative rounded-2xl border p-4 text-left transition-[border-color,box-shadow,translate] duration-200",
                    on ? "border-maroon-700 bg-white shadow-lift" : "border-white bg-white shadow-card hover:-translate-y-0.5",
                  )}
                >
                  {on ? <motion.span layoutId="gt-stage" className="absolute inset-x-4 -bottom-px h-1 rounded-full bg-maroon-700" /> : null}
                  <span className="block font-display text-[30px] leading-none font-semibold text-maroon-900 tabular">{n}</span>
                  <span className="mt-2 block text-sm font-bold text-ink">{s.label}</span>
                  <span className="text-xs text-muted">{s.hint}</span>
                </button>
              );
            })}
          </motion.div>

          {stage !== "awaiting" ? <ScriptCard stage={stage} /> : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.ul key={stage} variants={stagger(0.04)} initial="hidden" animate="show" exit={{ opacity: 0 }} className="grid gap-3 lg:grid-cols-2">
              {rows.length ? (
                rows.map((r) => <GuestCard key={r.connectId} row={r} data={d} />)
              ) : (
                <li className="rounded-3xl bg-white shadow-card lg:col-span-2">
                  <EmptyState icon={<Route />} title={`Nobody in “${meta.label}” right now`}>
                    {d.seesAll ? "Guests move here as their visits and texts come due." : "None of your guests are at this stage."}
                  </EmptyState>
                </li>
              )}
            </motion.ul>
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

function ScriptCard({ stage }: { stage: Exclude<GuestTrackStage, "awaiting"> }) {
  const s = GUEST_TRACK_SCRIPTS[stage];
  const [open, setOpen] = useState(false);
  return (
    <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white shadow-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span>
          <span className="block text-xs font-extrabold tracking-[0.14em] text-gold-600 uppercase">Script · {s.when}</span>
          <span className="block font-display text-lg font-semibold text-maroon-900">{s.title}</span>
        </span>
        <ChevronDown className={cn("size-5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-line px-5 py-4">
              <ScriptBody body={s.body} />
              <p className="mt-2 text-xs text-muted">Open a guest below to send it with their name filled in.</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

function GuestCard({ row: r, data: d }: { row: GuestTrackRow; data: GuestTrackResponse }) {
  const [open, setOpen] = useState(false);
  const mine = r.coMemberId === d.me.id || r.itMemberId === d.me.id;
  const script = r.stage !== "awaiting" ? GUEST_TRACK_SCRIPTS[r.stage] : null;
  const tokens = { Name: r.firstName, "Your Name": d.me.fullName, Day: serviceWeekday(r.serviceDate) };
  const hoursLeft = Math.max(0, Math.round(48 - (Date.now() - new Date(r.clockStartAt).getTime()) / 3_600_000));

  return (
    <motion.li variants={fadeUp} layout="position" className="rounded-3xl border border-white bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/connect/journey/${r.connectId}`} className="text-[16px] font-bold text-maroon-800 hover:underline">
            {r.firstName} {r.lastName}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Chip>
              Visit 1 · {serviceDateShort(r.serviceDate)} · {r.daysSince === 0 ? "today" : `${r.daysSince} day${r.daysSince === 1 ? "" : "s"} ago`}
            </Chip>
            {r.returnVisitDate ? <Chip tone="ok">Returned {serviceDateShort(r.returnVisitDate)}</Chip> : null}
            {r.stage === "48h" ? <Chip tone="warn">{hoursLeft} h left</Chip> : null}
          </div>
        </div>
        <span className="text-right text-xs text-muted">
          Church office: <b className="text-ink">{r.coName ?? "—"}</b>
          <br />
          Integration: <b className="text-ink">{r.itName ?? "—"}</b>
        </span>
      </div>
      {script ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl border border-gold-300 bg-gold-100/60 px-3 text-sm font-bold text-gold-800 hover:bg-gold-100"
          >
            <Send className="size-4" aria-hidden /> {open ? "Hide the text" : "Send the text"}
          </button>
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-3 rounded-2xl bg-cream-50 p-4">
                  <ScriptBody body={script.body} tokens={tokens} />
                  <ScriptButtons body={script.body} tokens={tokens} phone={r.phone} enabled={mine} />
                  {!mine ? <p className="mt-2 text-xs text-muted">Only the people assigned to this guest can send from here.</p> : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Route className="size-4 text-muted" aria-hidden /> No second visit confirmed yet. Log it on Log follow-up when the guest confirms by phone.
        </p>
      )}
    </motion.li>
  );
}
