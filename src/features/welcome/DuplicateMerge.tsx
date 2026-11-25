import { Check, GitMerge, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { serviceDateShort } from "@/lib/time";
import { JourneyChip, ReasonChips, callers } from "./duplicate-parts";
import { useMergeDuplicates } from "./duplicate-queries";
import { MERGE_FIELDS, MERGE_FIELD_LABEL, type DuplicateGroup, type MergeField } from "./duplicate-types";

/**
 * Review and merge (PRD W-14). Staff choose the record to keep, the value to
 * keep wherever the records differ, and whose follow-up journey carries on.
 * Merging cannot be undone from the screen, so it asks first.
 */

/** Two values are the same when they only differ in format: phones by digits, the rest ignoring case. */
const same = (f: MergeField, a: string | null, b: string | null) => {
  const n = (v: string | null) => (f === "phone" ? (v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "") : (v ?? "").trim().toLowerCase());
  return n(a) === n(b);
};

export function MergeDialog({ group, onClose }: { group: DuplicateGroup | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!group}
      onClose={onClose}
      subtitle="Review and merge"
      title={group ? group.people.map((p) => p.name).filter((n, i, a) => a.indexOf(n) === i).join(" / ") : ""}
      meta={group ? <div className="mt-2 flex flex-wrap gap-1.5"><ReasonChips reasons={group.reasons} /></div> : null}
      className="max-w-5xl"
    >
      {/* Keyed by the group so the choices start fresh for each one. */}
      {group ? <MergeForm key={group.id} group={group} onClose={onClose} /> : null}
    </Dialog>
  );
}

function MergeForm({ group, onClose }: { group: DuplicateGroup; onClose: () => void }) {
  const people = group.people;
  const [keepId, setKeepId] = useState(people[0]!.connectId);
  const [journeyFrom, setJourneyFrom] = useState(group.suggestedJourney);
  const [picked, setPicked] = useState<Partial<Record<MergeField, number>>>({});
  const merge = useMergeDuplicates();
  const confirm = useConfirm();
  const toast = useToast();

  const keep = people.find((p) => p.connectId === keepId)!;
  const others = people.filter((p) => p.connectId !== keepId);
  const differs = (f: MergeField) => people.some((p) => !same(f, p.fields[f], people[0]!.fields[f]));
  // The record kept wins unless it is blank there; then the first record that has a value.
  const fallback = (f: MergeField) => (keep.fields[f] ? keepId : (people.find((p) => p.fields[f])?.connectId ?? keepId));
  const sourceOf = (f: MergeField) => picked[f] ?? fallback(f);
  const valueOf = (f: MergeField) => people.find((p) => p.connectId === sourceOf(f))!.fields[f];
  const finalName = `${valueOf("firstName") ?? ""} ${valueOf("lastName") ?? ""}`.trim();
  const j = people.find((p) => p.connectId === journeyFrom)!;
  const visits = people.reduce((n, p) => n + p.visits, 0);
  const notes = people.reduce((n, p) => n + p.logs, 0);

  const submit = async () => {
    const othersText = others.map((p) => `${p.name} (#${p.connectId})`).join(" and ");
    const ok = await confirm({
      title: `Merge into ${finalName}?`,
      body: (
        <>
          {othersText} will be merged into {finalName} (#{keepId}). All visits and follow-up notes move across, and{" "}
          {others.length === 1 ? "the other follow-up journey closes" : "the other follow-up journeys close"}. This can't be undone from this screen.
        </>
      ),
      confirmLabel: `Merge ${people.length} records`,
    });
    if (!ok) return;
    const fields: Partial<Record<MergeField, number>> = {};
    for (const f of MERGE_FIELDS) if (differs(f) || sourceOf(f) !== keepId) fields[f] = sourceOf(f);
    merge.mutate(
      {
        keepId,
        mergeIds: others.map((p) => p.connectId),
        journeyFrom,
        fields,
        rowVers: Object.fromEntries(people.map((p) => [String(p.connectId), p.rowVer])),
      },
      {
        onSuccess: () => {
          onClose();
          toast.show(`${people.length} records merged into ${finalName}`);
        },
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : "The merge didn't go through. Try again.";
          if (e instanceof ApiError && (e.code === "CONFLICT" || e.code === "NOT_FOUND" || e.code === "NOT_DUPLICATE")) onClose();
          toast.show(msg, { tone: "crit" });
        },
      },
    );
  };

  return (
    <>
      <div className="space-y-6">
        {group.namesDiffer ? (
          <p className="flex gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <b>The names differ.</b> A shared phone or email can belong to two people, such as a couple or a parent and child. If they aren't the same person, cancel and choose “Not the same
              person” instead.
            </span>
          </p>
        ) : null}

        <Section n={1} title="Which record to keep" hint="Its record number stays. The others merge into it.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <Choice key={p.connectId} name="dup-keep" checked={keepId === p.connectId} onChange={() => setKeepId(p.connectId)}>
                <b className="block text-ink">
                  {p.name} <span className="font-semibold text-muted">#{p.connectId}</span>
                </b>
                <span className="block text-xs text-muted">
                  First came {serviceDateShort(p.firstVisit)} · {p.visits} {p.visits === 1 ? "visit" : "visits"}
                </span>
              </Choice>
            ))}
          </div>
        </Section>

        <Section n={2} title="Details to keep" hint="Where the records differ, choose the value to keep.">
          <div className="divide-y divide-line rounded-2xl border border-line bg-white">
            {MERGE_FIELDS.map((f) => (
              <fieldset key={f} className="grid gap-2 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
                <legend className="contents">
                  <span className="text-sm font-bold text-ink">{MERGE_FIELD_LABEL[f]}</span>
                </legend>
                {differs(f) ? (
                  <div className="flex flex-wrap gap-2">
                    {people.map((p) => (
                      <label
                        key={p.connectId}
                        className={cn(
                          "inline-flex max-w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition-colors",
                          sourceOf(f) === p.connectId ? "border-maroon-600 bg-maroon-100/40 text-ink" : "border-line text-muted hover:border-maroon-200",
                        )}
                      >
                        <input
                          type="radio"
                          name={`dup-${f}`}
                          className="accent-maroon-700"
                          checked={sourceOf(f) === p.connectId}
                          onChange={() => setPicked((x) => ({ ...x, [f]: p.connectId }))}
                        />
                        <span className="min-w-0 truncate font-semibold">{p.fields[f] ?? <i className="font-normal">blank</i>}</span>
                        <span className="text-xs text-muted">#{p.connectId}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="flex min-w-0 items-center gap-2 text-sm text-muted">
                    <span className="truncate">{people[0]!.fields[f] ?? "blank"}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ok">
                      <Check className="size-3.5" aria-hidden />
                      Same on every record
                    </span>
                  </p>
                )}
              </fieldset>
            ))}
          </div>
        </Section>

        <Section n={3} title="Follow-up journey to keep" hint="Suggested: the one furthest along. The others close as “Merged”; their notes move across and stay in the history.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <Choice key={p.connectId} name="dup-journey" checked={journeyFrom === p.connectId} onChange={() => setJourneyFrom(p.connectId)}>
                <span className="flex flex-wrap items-center gap-2">
                  <b className="text-ink">#{p.connectId}</b>
                  <JourneyChip p={p} />
                  {p.connectId === group.suggestedJourney ? <Chip tone="gold">Suggested</Chip> : null}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {p.journey.steps} checklist {p.journey.steps === 1 ? "step" : "steps"} done · {p.logs} {p.logs === 1 ? "note" : "notes"}
                </span>
                <span className="block text-xs text-muted">{callers(p)}</span>
              </Choice>
            ))}
          </div>
        </Section>

        <div className="rounded-2xl border border-maroon-200 bg-maroon-100/30 p-4 text-sm text-ink">
          <p className="font-bold text-maroon-900">After merging</p>
          <ul className="mt-1.5 space-y-0.5">
            <li>
              One record: <b>{finalName}</b> (#{keepId}), {visits} {visits === 1 ? "visit" : "visits"} and {notes} follow-up {notes === 1 ? "note" : "notes"}.
            </li>
            <li>
              The journey from #{journeyFrom} carries on ({j.journey.status === "Active" ? `Phase ${j.journey.phase}` : j.journey.status}). {callers(j)}.
            </li>
            <li>The merge is written to the audit log with the old and new values.</li>
          </ul>
        </div>
      </div>
      {/* Pinned to the bottom of the scrolling body, so Merge is always in reach. */}
      <footer className="sticky -bottom-5 z-10 -mx-5 mt-6 -mb-5 flex flex-col-reverse gap-2 border-t border-line bg-white px-5 py-3 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" icon={<GitMerge className="size-4" />} loading={merge.isPending} onClick={() => void submit()}>
          Merge {people.length} records
        </Button>
      </footer>
    </>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-baseline gap-2 font-display text-lg font-semibold text-maroon-900">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-maroon-700 font-sans text-xs font-bold text-cream-50">{n}</span>
        {title}
      </h3>
      <p className="mt-0.5 mb-3 text-sm text-muted">{hint}</p>
      {children}
    </section>
  );
}

function Choice({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-2xl border bg-white p-3.5 transition-colors",
        checked ? "border-maroon-600 ring-2 ring-maroon-600/15" : "border-line hover:border-maroon-200",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 shrink-0 accent-maroon-700" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

