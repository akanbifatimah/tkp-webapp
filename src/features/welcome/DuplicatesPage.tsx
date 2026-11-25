import { Check, GitMerge, History, RotateCcw, TriangleAlert, Undo2, UserX, Users } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { Card, ConfidentialChip, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { serviceDateShort } from "@/lib/time";
import { MergeDialog } from "./DuplicateMerge";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatWhen } from "@/lib/time";
import { useDismissDuplicates, useDuplicates, useRestoreDuplicate, useUnmerge } from "./duplicate-queries";
import { JourneyChip, ReasonChips, callers } from "./duplicate-parts";
import type { DismissedPair, DuplicateGroup, MergeHistory } from "./duplicate-types";

/**
 * Welcome › Duplicates (PRD W-14, A-1, WT-7). The same person with two or more
 * records, found by a shared phone or email, never by name. Tech Admin, Church
 * Admin, Integration Admin and the Welcome Lead merge them, mark them "not the
 * same person", or undo a merge; Tech Team sees the list.
 */

export function DuplicatesPage() {
  const q = useDuplicates();
  const d = q.data;
  const [tab, setTab] = useState<"review" | "dismissed" | "merged">("review");
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);
  const [dismissing, setDismissing] = useState<DuplicateGroup | null>(null);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Welcome"
        title="Duplicate guests"
        tagline="The same person with more than one record, matched by phone or email, never by name."
        actions={<ConfidentialChip />}
      />

      {q.isError ? (
        <ErrorBanner action={<Button variant="ghost" size="sm" onClick={() => void q.refetch()}>Try again</Button>}>We couldn't load the duplicates.</ErrorBanner>
      ) : null}

      {d ? (
        <>
          <div role="tablist" aria-label="Duplicates" className="flex flex-wrap gap-2">
            {(
              [
                ["review", `To review · ${d.groups.length}`],
                ["dismissed", `Not the same person · ${d.dismissed.length}`],
                ["merged", `Merged · ${d.merges.filter((m) => !m.undoneAt).length}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "h-9 rounded-full border px-4 text-sm font-bold transition-colors",
                  tab === id ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-line bg-white text-ink hover:border-maroon-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {!d.can.merge ? (
            <p className="text-sm text-muted">You can see possible duplicates. Tech Admin, Church Admin, Integration Admin and the Welcome Lead merge them.</p>
          ) : null}

          {tab === "review" ? (
            d.groups.length ? (
              <div className="space-y-4">
                {d.groups.map((g) => (
                  <GroupCard key={g.id} g={g} canMerge={d.can.merge} onMerge={() => setMerging(g)} onDismiss={() => setDismissing(g)} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Users className="size-6" />} title="No duplicates to review">
                Every guest has their own phone and email. New matches show here when someone fills in the form again.
              </EmptyState>
            )
          ) : tab === "merged" ? (
            d.merges.length ? (
              <div className="space-y-3">
                {d.merges.map((m) => (
                  <MergeRow key={m.id} m={m} canMerge={d.can.merge} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<History className="size-6" />} title="No merges yet">
                Every merge is listed here, and can be undone.
              </EmptyState>
            )
          ) : d.dismissed.length ? (
            <div className="space-y-3">
              {d.dismissed.map((p) => (
                <DismissedRow key={p.key} p={p} canMerge={d.can.merge} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<UserX className="size-6" />} title="Nothing marked yet">
              Pairs you mark “not the same person”, such as a couple sharing a phone, are listed here and never suggested again.
            </EmptyState>
          )}
        </>
      ) : q.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : null}

      <MergeDialog group={merging} onClose={() => setMerging(null)} />
      <DismissDialog group={dismissing} onClose={() => setDismissing(null)} />
    </motion.div>
  );
}

/* ----------------------------------------------------------------- pieces */

function GroupCard({ g, canMerge, onMerge, onDismiss }: { g: DuplicateGroup; canMerge: boolean; onMerge: () => void; onDismiss: () => void }) {
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <ReasonChips reasons={g.reasons} />
        {g.namesDiffer ? (
          <Chip tone="warn">
            <TriangleAlert className="size-3.5" aria-hidden />
            Names differ: check before merging
          </Chip>
        ) : null}
        <span className="ml-auto text-xs font-bold text-muted">{g.people.length} records</span>
      </div>
      <ul className="divide-y divide-line">
        {g.people.map((p) => (
          <li key={p.connectId} className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">
                {p.name} <span className="font-semibold text-muted">#{p.connectId}</span>
              </p>
              <p className="truncate text-xs text-muted">{[p.fields.phone, p.fields.email].filter(Boolean).join(" · ") || "No phone or email"}</p>
            </div>
            <p className="text-sm text-ink">
              First came {serviceDateShort(p.firstVisit)}
              <span className="block text-xs text-muted">
                {p.visits} {p.visits === 1 ? "visit" : "visits"} · {p.serviceTypes.join(", ")}
              </span>
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <JourneyChip p={p} />
              <span className="text-xs text-muted">
                {callers(p)} · {p.logs} {p.logs === 1 ? "note" : "notes"}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {canMerge ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" size="sm" icon={<UserX className="size-4" />} onClick={onDismiss}>
            Not the same person
          </Button>
          <Button size="sm" icon={<GitMerge className="size-4" />} onClick={onMerge}>
            Review and merge
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function MergeRow({ m, canMerge }: { m: MergeHistory; canMerge: boolean }) {
  const unmerge = useUnmerge();
  const confirm = useConfirm();
  const toast = useToast();
  const names = m.merged.map((x) => `${x.name} (#${x.connectId})`).join(" and ");
  const undo = async () => {
    const ok = await confirm({
      title: `Undo the merge into ${m.keptName}?`,
      body: (
        <>
          {names} will be separate records again, each with their own visits, follow-up notes and journey. Notes saved on {m.keptName} since the merge stay with {m.keptName}.
        </>
      ),
      confirmLabel: "Undo merge",
      destructive: false,
    });
    if (!ok) return;
    unmerge.mutate(m.id, {
      onSuccess: (r) =>
        toast.show(r.journeyKept ? `Merge undone. ${m.keptName} keeps the follow-up saved since the merge.` : `Merge undone: ${m.merged.length + 1} separate records again`),
      onError: (e) => toast.show(e instanceof ApiError ? e.message : "That didn't work. Try again.", { tone: "crit" }),
    });
  };
  return (
    <Card className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3", m.undoneAt && "opacity-70")}>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">
          {m.merged.map((x) => x.name).join(", ")} <span className="font-semibold text-muted">into</span> {m.keptName}{" "}
          <span className="font-semibold text-muted">#{m.keptId}</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          Merged by {m.by ?? "someone"} · {formatWhen(m.at)}
          {m.undoneAt ? ` · undone by ${m.undoneBy ?? "someone"} · ${formatWhen(m.undoneAt)}` : ""}
        </p>
        {m.blocked ? <p className="mt-1 text-xs font-semibold text-warn">{m.blocked}</p> : null}
      </div>
      {m.undoneAt ? (
        <Chip tone="neutral">Undone</Chip>
      ) : canMerge ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<Undo2 className="size-4" />}
          loading={unmerge.isPending}
          disabled={!!m.blocked}
          disabledReason={m.blocked ?? undefined}
          onClick={() => void undo()}
        >
          Undo merge
        </Button>
      ) : null}
    </Card>
  );
}

function DismissedRow({ p, canMerge }: { p: DismissedPair; canMerge: boolean }) {
  const restore = useRestoreDuplicate();
  const toast = useToast();
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">
          {p.names[0]} <span className="font-semibold text-muted">and</span> {p.names[1]}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <ReasonChips reasons={p.reasons} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Marked by {p.by ?? "someone"} on {serviceDateShort(p.at.slice(0, 10))}
          {p.note ? ` · “${p.note}”` : ""}
        </p>
      </div>
      {canMerge ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw className="size-4" />}
          loading={restore.isPending}
          onClick={() =>
            restore.mutate(p.key, {
              onSuccess: () => toast.show(`${p.names[0]} and ${p.names[1]} are back in the review list`),
              onError: (e) => toast.show(e instanceof ApiError ? e.message : "That didn't work. Try again.", { tone: "crit" }),
            })
          }
        >
          Put back for review
        </Button>
      ) : null}
    </Card>
  );
}

/** "Not the same person": not destructive (it can be put back), so no confirmation; Undo in the toast. */
function DismissDialog({ group, onClose }: { group: DuplicateGroup | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const dismiss = useDismissDuplicates();
  const restore = useRestoreDuplicate();
  const toast = useToast();
  const names = group ? group.people.map((p) => p.name) : [];
  const save = () => {
    if (!group) return;
    dismiss.mutate(
      { ids: group.people.map((p) => p.connectId), note: note.trim() || null },
      {
        onSuccess: (r) => {
          onClose();
          setNote("");
          toast.show(`${names.join(" and ")} won't be suggested again`, {
            undo: () => {
              for (const k of r.dismissed) restore.mutate(k);
            },
          });
        },
        onError: (e) => toast.show(e instanceof ApiError ? e.message : "That didn't work. Try again.", { tone: "crit" }),
      },
    );
  };
  return (
    <Dialog
      open={!!group}
      onClose={onClose}
      subtitle="Not the same person"
      title={names.join(" and ")}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<Check className="size-4" />} loading={dismiss.isPending} onClick={save}>
            Mark as not the same person
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink">
          They keep their own records and journeys, and this match isn't suggested again. You can put it back from “Not the same person”.
        </p>
        <label className="block">
          <span className="text-sm font-bold text-ink">Why? (optional)</span>
          <textarea
            data-autofocus
            id="dup-note"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="For example: husband and wife share the home phone."
            className="mt-1.5 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10"
          />
        </label>
      </div>
    </Dialog>
  );
}
