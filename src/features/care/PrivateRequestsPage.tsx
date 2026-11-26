import { AlertTriangle, HandHeart, Inbox, Lock, Mail, RotateCcw, StickyNote, UserRoundCheck, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, inputClass } from "@/features/admin/parts";
import { useAuth } from "@/features/auth/auth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { ago } from "./PrayerWallPage";
import { usePrayOver, usePrivateNote, usePrivateRequests, usePrivateStatus } from "./prayer-queries";
import { PRIVATE_STATUS_LABEL, type PrivateRequest, type PrivateStatus } from "./prayer-types";

/**
 * Care › Private requests (PRD PR-3, OS-2): requests sent to the prayer team
 * instead of the wall. Only Prayer Moderators see them (TKP, 2026-11-26).
 */

const TONE: Record<PrivateStatus, ChipTone> = { new: "gold", praying: "maroon", follow_up: "crit", closed: "neutral" };
const FILTERS: { id: PrivateStatus | ""; label: string }[] = [
  { id: "", label: "Open" },
  { id: "new", label: "New" },
  { id: "praying", label: "Being prayed for" },
  { id: "follow_up", label: "Needs follow-up" },
  { id: "closed", label: "Closed" },
];
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

export function PrivateRequestsPage() {
  const [status, setStatus] = useState<PrivateStatus | "">("");
  const q = usePrivateRequests(status);
  const [followUp, setFollowUp] = useState<PrivateRequest | null>(null);
  const d = q.data;
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="5 · Care" title="Private requests" tagline="Sent to the prayer team only. They never appear on the wall." />
      <motion.p variants={fadeUp} className="-mt-3 inline-flex items-center gap-2 rounded-full bg-cream-200 px-3 py-1.5 text-xs font-bold text-muted">
        <Lock className="size-3.5" aria-hidden />
        Only Prayer Moderators see this page. Every request is held in trust.
      </motion.p>
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id || "open"}
            type="button"
            aria-pressed={status === f.id}
            onClick={() => setStatus(f.id)}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-bold transition-colors",
              status === f.id ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-line bg-white text-muted hover:text-ink",
            )}
          >
            {f.label} ({d ? d.counts[f.id || "all"] : 0})
          </button>
        ))}
      </div>
      {!d ? (
        <Skeleton className="h-96 w-full rounded-3xl" />
      ) : d.items.length ? (
        <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="space-y-3">
          {d.items.map((r) => (
            <RequestCard key={r.id} r={r} onFollowUp={() => setFollowUp(r)} />
          ))}
        </motion.ul>
      ) : (
        <Card>
          <EmptyState icon={<Inbox />} title="Nothing here">
            Private requests show here as people send them.
          </EmptyState>
        </Card>
      )}
      <FollowUpDialog request={followUp} onClose={() => setFollowUp(null)} />
    </motion.div>
  );
}

function RequestCard({ r, onFollowUp }: { r: PrivateRequest; onFollowUp: () => void }) {
  const { member } = useAuth();
  const prayOver = usePrayOver();
  const setStatus = usePrivateStatus();
  const note = usePrivateNote();
  const toast = useToast();
  const confirm = useConfirm();
  const [noting, setNoting] = useState(false);
  const [draft, setDraft] = useState("");
  const mine = r.prayedBy.some((x) => x.name === member?.fullName);
  const done = (msg: string) => ({ onSuccess: () => toast.show(msg), onError: (e: unknown) => toast.show(errText(e), { tone: "crit" }) });

  const close = async () => {
    const ok = await confirm({
      title: "Close this request?",
      body: `${r.name ?? "This person"}'s request leaves the open list. It stays in the record and you can reopen it.`,
      confirmLabel: "Close request",
    });
    if (ok) setStatus.mutate({ id: r.id, status: "closed", rowVer: r.rowVer }, done("Closed"));
  };

  return (
    <motion.li variants={fadeUp} className={cn("rounded-3xl border bg-white p-5 shadow-card sm:p-6", r.distress.length ? "border-l-4 border-crit/40 border-l-crit" : r.status === "new" ? "border-l-4 border-white border-l-gold-500" : "border-white")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">{r.name ?? "No name given"}</span>
          <Chip>{r.posterKind === "learner" ? "External Student" : r.posterKind === "member" ? "Member" : "Guest"}</Chip>
          <span className="text-xs text-muted">{ago(r.createdAt)}</span>
        </p>
        <span className="flex flex-wrap gap-1.5">
          <Chip tone="gold">{r.category}</Chip>
          <Chip tone={TONE[r.status]}>{PRIVATE_STATUS_LABEL[r.status]}</Chip>
        </span>
      </div>
      {r.distress.length ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-crit/20 bg-crit-soft px-3.5 py-2.5 text-sm text-crit" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <b>Care check:</b> it mentions “{r.distress.join("”, “")}”. Pass it to a pastor today and follow the church's care steps.
          </span>
        </p>
      ) : null}
      <p className="mt-3 text-[15px] leading-relaxed text-ink">{r.text}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {r.contact ? (
          <span className="inline-flex items-center gap-1 font-bold text-ink">
            <Mail className="size-3.5" aria-hidden />
            {r.contact}
          </span>
        ) : (
          <span>No contact left</span>
        )}
        {r.prayedBy.length ? (
          <span className="inline-flex items-center gap-1">
            <HandHeart className="size-3.5 text-gold-800" aria-hidden />
            Prayed over by {r.prayedBy.map((x) => `${x.name.split(" ")[0]} (${ago(x.at)})`).join(", ")}
          </span>
        ) : null}
      </p>
      {r.notes.length ? (
        <ul className="mt-3 space-y-1.5 rounded-xl bg-cream-100 px-3.5 py-2.5 text-sm">
          {r.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
              <span>
                <span className="font-bold text-ink">{n.by}:</span> <span className="text-ink/85">{n.text}</span> <span className="text-xs text-muted">· {ago(n.at)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {noting ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            note.mutate(
              { id: r.id, text: draft },
              {
                onSuccess: () => {
                  setDraft("");
                  setNoting(false);
                  toast.show("Note added");
                },
                onError: (err) => toast.show(errText(err), { tone: "crit" }),
              },
            );
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Note for the prayer team</span>
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A note for the prayer team…" className={inputClass()} />
          </label>
          <span className="flex gap-2">
            <Button type="submit" size="sm" variant="dark" loading={note.isPending} disabled={draft.trim().length < 2}>
              Add note
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNoting(false)}>
              Cancel
            </Button>
          </span>
        </form>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {r.status !== "closed" ? (
          <>
            <Button size="sm" variant="gold" icon={<HandHeart className="size-4" />} disabled={mine} disabledReason={mine ? "You've marked this one" : undefined} loading={prayOver.isPending} onClick={() => prayOver.mutate(r.id, done("Marked: you prayed over it"))}>
              {mine ? "You prayed over it" : "I've prayed over this"}
            </Button>
            {r.status !== "follow_up" ? (
              <Button size="sm" variant="ghost" icon={<UserRoundCheck className="size-4" />} onClick={onFollowUp}>
                Needs a pastor's follow-up
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" icon={<XCircle className="size-4" />} onClick={() => void close()}>
              Close
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setStatus.mutate({ id: r.id, status: "praying", rowVer: r.rowVer }, done("Reopened"))}>
            Reopen
          </Button>
        )}
        <Button size="sm" variant="subtle" icon={<StickyNote className="size-4" />} onClick={() => setNoting(true)} className="ml-auto">
          Note
        </Button>
      </div>
    </motion.li>
  );
}

function FollowUpDialog({ request, onClose }: { request: PrivateRequest | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const setStatus = usePrivateStatus();
  const toast = useToast();
  const close = () => {
    setNote("");
    setError(null);
    onClose();
  };
  const submit = () => {
    if (!request) return;
    if (note.trim().length < 5) return setError("Say what follow-up is needed");
    setStatus.mutate(
      { id: request.id, status: "follow_up", rowVer: request.rowVer, note: note.trim() },
      {
        onSuccess: () => {
          toast.show("Marked for a pastor's follow-up");
          close();
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };
  return (
    <Dialog
      open={!!request}
      onClose={close}
      subtitle="Needs a pastor's follow-up"
      title={request?.name ?? "No name given"}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={setStatus.isPending}>
            Mark for follow-up
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{request?.contact ? `They left ${request.contact} for contact.` : "They left no contact, so say how the pastor can respond."}</p>
      <Field label="What follow-up is needed" htmlFor="fu-note" error={error ?? undefined}>
        <input id="fu-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pastor Bimbo to call this week" className={inputClass(!!error)} />
      </Field>
    </Dialog>
  );
}
