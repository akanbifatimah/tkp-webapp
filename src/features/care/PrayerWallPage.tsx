import { AlertTriangle, CheckCircle2, EyeOff, Flame, Flag, Hourglass, Inbox, Pencil, RotateCcw, Search, Settings2, StickyNote, Trash2, UserSearch } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { Tile } from "@/components/ui/Tile";
import { useToast } from "@/components/ui/Toast";
import { Field, inputClass, selectClass } from "@/features/admin/parts";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { useAnswered, useApprove, useEditPrayer, usePrayerList, usePrayerNote, usePrayerSettings, useRemovePrayer, useRestorePrayer } from "./prayer-queries";
import { PRAYER_CATEGORIES, PRAYER_STATUS_LABEL, type PosterIdentity, type PrayerFilter, type PrayerPost, type PrayerSettings, type PrayerStatus } from "./prayer-types";

/**
 * Care › Prayer Wall moderation (PRD PR-4, PR-5, PR-7, PR-9, PR-11, OS-1). No
 * admin Figma exists; the card follows the member Prayer Wall (Figma G4).
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
const STATUS_TONE: Record<PrayerStatus, ChipTone> = { pending: "gold", published: "ok", hidden: "crit", removed: "neutral" };
const KIND_LABEL = { member: "Member", guest: "Guest", learner: "External Student" } as const;
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

export function PrayerWallPage() {
  const [filter, setFilter] = useState<PrayerFilter>("review");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const q = usePrayerList({ filter, q: text, category });
  const [editing, setEditing] = useState<PrayerPost | null>(null);
  const [removing, setRemoving] = useState<PrayerPost | null>(null);
  const [who, setWho] = useState<{ post: PrayerPost; identity: PosterIdentity } | null>(null);
  const [settings, setSettings] = useState(false);
  const toast = useToast();
  const d = q.data;

  const lookUp = async (p: PrayerPost) => {
    try {
      setWho({ post: p, identity: await api.prayer.poster(p.id) });
    } catch (e) {
      toast.show(errText(e), { tone: "crit" });
    }
  };

  const chips: { id: PrayerFilter; label: string; count?: number }[] = [
    { id: "review", label: "Needs review", count: d?.counts.review },
    { id: "published", label: "On the wall", count: d?.counts.published },
    { id: "removed", label: "Removed", count: d?.counts.removed },
    { id: "all", label: "All", count: d?.counts.all },
  ];

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="5 · Care"
        title="Prayer Wall"
        tagline={d ? (d.settings.mode === "hold" ? "Every request is read here before it goes on the wall." : "Requests go on the wall at once; reported and flagged ones come back here.") : undefined}
        actions={
          d?.can.settings ? (
            <Button variant="ghost" icon={<Settings2 className="size-4" />} onClick={() => setSettings(true)}>
              Settings
            </Button>
          ) : null
        }
      />
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}
      {!d ? (
        <Skeleton className="h-125 w-full rounded-3xl" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Waiting for review" value={d.counts.pending} icon={<Hourglass />} accent="gold" hint={d.settings.mode === "hold" ? "New requests are held for review" : "Flagged by the care check"} />
            <Tile label="Hidden by reports" value={d.counts.hidden} icon={<Flag />} accent="rose" hint={`${d.settings.reportThreshold} reports take a request off the wall`} />
            <Tile label="Care check" value={d.counts.distress} icon={<AlertTriangle />} accent="rose" critical={d.counts.distress > 0} hint="Words that may mean someone is in distress" />
            <Tile label="Prayers on the wall" value={d.week.prayed} icon={<Flame />} accent="teal" hint={`“Pray” taps across ${d.counts.published} requests · ${d.week.posted} new requests this week`} />
          </div>

          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={filter === c.id}
                  onClick={() => setFilter(c.id)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
                    filter === c.id ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-line bg-white text-muted hover:text-ink",
                  )}
                >
                  {c.label} ({c.count ?? 0})
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative block flex-1">
                <span className="sr-only">Search requests</span>
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search requests or first names…" className={cn(inputClass(), "pl-10")} />
              </label>
              <label className="sm:w-48">
                <span className="sr-only">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass(!!category)}>
                  <option value="">Every category</option>
                  {PRAYER_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          {d.items.length ? (
            <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="space-y-3">
              {d.items.map((p) => (
                <PrayerCard key={p.id} p={p} moderate={d.can.moderate} onEdit={() => setEditing(p)} onRemove={() => setRemoving(p)} onWho={() => void lookUp(p)} />
              ))}
            </motion.ul>
          ) : (
            <Card>
              <EmptyState icon={<Inbox />} title={filter === "review" ? "Nothing waiting" : "No requests here"}>
                {filter === "review" ? "Every request has been read. New ones show here as they come in." : "Try another filter or search."}
              </EmptyState>
            </Card>
          )}
        </>
      )}

      <EditDialog post={editing} onClose={() => setEditing(null)} />
      <RemoveDialog post={removing} purgeDays={d?.settings.purgeDays ?? 30} onClose={() => setRemoving(null)} />
      <WhoDialog state={who} onClose={() => setWho(null)} />
      {d ? <SettingsDialog open={settings} settings={d.settings} onClose={() => setSettings(false)} /> : null}
    </motion.div>
  );
}

function PrayerCard({ p, moderate, onEdit, onRemove, onWho }: { p: PrayerPost; moderate: boolean; onEdit: () => void; onRemove: () => void; onWho: () => void }) {
  const approve = useApprove();
  const restore = useRestorePrayer();
  const answered = useAnswered();
  const note = usePrayerNote();
  const toast = useToast();
  const [noting, setNoting] = useState(false);
  const [draft, setDraft] = useState("");
  const done = (msg: string) => ({ onSuccess: () => toast.show(msg), onError: (e: unknown) => toast.show(errText(e), { tone: "crit" }) });
  const review = p.status === "pending" || p.status === "hidden";

  return (
    <motion.li variants={fadeUp} className={cn("rounded-3xl border bg-white p-5 shadow-card sm:p-6", p.distress.length && review ? "border-crit/40 border-l-4 border-l-crit" : review ? "border-l-4 border-white border-l-gold-500" : "border-white", p.status === "removed" && "opacity-80")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">{p.displayName}</span>
          <Chip>{KIND_LABEL[p.posterKind]}</Chip>
          <span className="text-xs text-muted">{ago(p.createdAt)}</span>
        </p>
        <span className="flex flex-wrap gap-1.5">
          <Chip tone="gold">{p.category}</Chip>
          <Chip tone={STATUS_TONE[p.status]}>{PRAYER_STATUS_LABEL[p.status]}</Chip>
          {p.answered ? <Chip tone="ok">Answered</Chip> : null}
        </span>
      </div>

      {p.distress.length ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-crit/20 bg-crit-soft px-3.5 py-2.5 text-sm text-crit" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <b>Care check:</b> it mentions “{p.distress.join("”, “")}”. The poster was shown the care numbers. A person should read it and follow the church's care steps. This is a flag, not a diagnosis.
          </span>
        </p>
      ) : null}

      <p className="mt-3 text-[15px] leading-relaxed text-ink">{p.text}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {p.status === "published" || p.prayed ? (
          <span className="inline-flex items-center gap-1 font-bold text-gold-800">
            <Flame className="size-3.5" aria-hidden />
            {p.prayed} praying
          </span>
        ) : null}
        {p.reports.length ? (
          <span className="inline-flex items-center gap-1 font-bold text-crit">
            <Flag className="size-3.5" aria-hidden />
            {p.reports.length} {p.reports.length === 1 ? "report" : "reports"}: {[...new Set(p.reports.map((r) => r.reason))].join(", ")}
          </span>
        ) : null}
        {p.answeredBy ? (
          <span className="inline-flex items-center gap-1 font-bold text-ok">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Marked answered by {p.answeredBy.by} {ago(p.answeredBy.at)}
          </span>
        ) : null}
        {p.edited ? (
          <span>
            Edited by {p.edited.by} {ago(p.edited.at)}: {p.edited.reason}
          </span>
        ) : null}
        {p.status === "removed" ? (
          <span>
            Removed{p.moderatedBy ? ` by ${p.moderatedBy}` : ""}: {p.removedReason}
            {p.purgeAt ? ` · deleted for good ${formatWhen(p.purgeAt)}` : ""}
          </span>
        ) : p.moderatedBy && p.status === "published" ? (
          <span>Approved by {p.moderatedBy}</span>
        ) : null}
      </div>

      {p.notes.length ? (
        <ul className="mt-3 space-y-1.5 rounded-xl bg-cream-100 px-3.5 py-2.5 text-sm">
          {p.notes.map((n, i) => (
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
              { id: p.id, text: draft },
              {
                onSuccess: () => {
                  setDraft("");
                  setNoting(false);
                  toast.show("Note added. Only moderators see it.");
                },
                onError: (err) => toast.show(errText(err), { tone: "crit" }),
              },
            );
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Note for moderators</span>
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A note only moderators see…" className={inputClass()} />
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

      {moderate ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {review ? (
            <Button size="sm" variant="dark" icon={<CheckCircle2 className="size-4" />} loading={approve.isPending} onClick={() => approve.mutate({ id: p.id, rowVer: p.rowVer }, done(p.status === "hidden" ? "Reports dismissed. It's back on the wall." : "Approved. It's on the wall."))}>
              {p.status === "hidden" ? "Put back on the wall" : "Approve"}
            </Button>
          ) : null}
          {p.status === "removed" ? (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} loading={restore.isPending} onClick={() => restore.mutate({ id: p.id, rowVer: p.rowVer }, done("Restored to the wall"))}>
              Restore
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={onEdit}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={onRemove}>
                Remove
              </Button>
            </>
          )}
          <Button size="sm" variant="subtle" icon={<StickyNote className="size-4" />} onClick={() => setNoting(true)}>
            Note
          </Button>
          {p.status === "published" ? (
            <Button
              size="sm"
              variant="subtle"
              icon={<CheckCircle2 className="size-4" />}
              loading={answered.isPending}
              onClick={() => answered.mutate({ id: p.id, answered: !p.answered, rowVer: p.rowVer }, done(p.answered ? "Answered mark taken off" : "Marked answered. Your name is recorded with it."))}
            >
              {p.answered ? "Not answered" : "Mark answered"}
            </Button>
          ) : null}
          <Button size="sm" variant="subtle" icon={<UserSearch className="size-4" />} onClick={onWho} className="ml-auto">
            Who posted?
          </Button>
        </div>
      ) : null}
    </motion.li>
  );
}

function EditDialog({ post, onClose }: { post: PrayerPost | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState<string | null>(null);
  const edit = useEditPrayer();
  const toast = useToast();
  if (post && seen !== post.id) {
    setSeen(post.id);
    setText(post.text);
    setCategory(post.category);
    setReason("");
    setFields({});
  }
  const close = () => {
    setSeen(null);
    onClose();
  };
  const submit = () => {
    if (!post) return;
    edit.mutate(
      { id: post.id, text, category, reason, rowVer: post.rowVer },
      {
        onSuccess: () => {
          toast.show("Saved. The original wording is kept in the record.");
          close();
        },
        onError: (e) => setFields(e instanceof ApiError && e.fields ? Object.fromEntries(Object.entries(e.fields).map(([k, m]) => [k, m[0] ?? ""])) : { reason: errText(e) }),
      },
    );
  };
  return (
    <Dialog
      open={!!post}
      onClose={close}
      subtitle="Edit request"
      title={post?.displayName ?? ""}
      className="max-w-xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={edit.isPending}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">Edit lightly: take out names, contact details or anything private. The poster's words are kept in the record.</p>
        <Field label="Request" htmlFor="pe-text" error={fields.text}>
          <textarea id="pe-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} className={cn(inputClass(!!fields.text), "h-auto py-2.5")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="pe-cat" error={fields.category}>
            <select id="pe-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass(false)}>
              {PRAYER_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="What you changed" htmlFor="pe-reason" error={fields.reason}>
            <input id="pe-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Took out a surname" className={inputClass(!!fields.reason)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function RemoveDialog({ post, purgeDays, onClose }: { post: PrayerPost | null; purgeDays: number; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const remove = useRemovePrayer();
  const toast = useToast();
  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };
  const submit = () => {
    if (!post) return;
    if (reason.trim().length < 3) return setError("Say why it's being removed");
    remove.mutate(
      { id: post.id, reason: reason.trim(), rowVer: post.rowVer },
      {
        onSuccess: () => {
          toast.show(`Removed. You can restore it for ${purgeDays} days.`);
          close();
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };
  return (
    <Dialog
      open={!!post}
      onClose={close}
      subtitle="Remove request"
      title={post ? `${post.displayName}'s request` : ""}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={remove.isPending}>
            Remove request
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">
        It comes off the wall now. Moderators can restore it for {purgeDays} days; after that it's deleted for good. The poster isn't told.
      </p>
      <Field label="Reason" htmlFor="pr-why" error={error ?? undefined} hint="Kept with the request and in the audit log.">
        <input id="pr-why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Advertising" className={inputClass(!!error)} />
      </Field>
    </Dialog>
  );
}

function WhoDialog({ state, onClose }: { state: { post: PrayerPost; identity: PosterIdentity } | null; onClose: () => void }) {
  const i = state?.identity;
  return (
    <Dialog
      open={!!state}
      onClose={onClose}
      subtitle="Who posted"
      title={state?.post.displayName ?? ""}
      className="max-w-md"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {i ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2 rounded-xl bg-cream-200 px-3.5 py-2.5 text-xs text-muted">
            <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            For handling abuse only. This look is in the audit log. The wall never shows any of it.
          </p>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
            <dt className="text-muted">Posted as</dt>
            <dd className="font-bold text-ink">{KIND_LABEL[i.kind]}</dd>
            <dt className="text-muted">Name</dt>
            <dd className="text-ink">{i.name ?? "Not given"}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="text-ink">{i.email ?? "Not given"}</dd>
            <dt className="text-muted">Device</dt>
            <dd className="font-mono text-xs text-ink">{i.device}</dd>
            <dt className="text-muted">From this person</dt>
            <dd className="text-ink">
              {i.posts} {i.posts === 1 ? "request" : "requests"}, {i.removed} removed
            </dd>
          </dl>
        </div>
      ) : null}
    </Dialog>
  );
}

function SettingsDialog({ open, settings, onClose }: { open: boolean; settings: PrayerSettings; onClose: () => void }) {
  const toLines = (s: PrayerSettings) => s.careResources.map((r) => `${r.label}: ${r.phone}`).join("\n");
  const [v, setV] = useState({ mode: settings.mode, reportThreshold: String(settings.reportThreshold), words: settings.distressWords.join(", "), retentionDays: String(settings.retentionDays), purgeDays: String(settings.purgeDays), resources: toLines(settings) });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState(false);
  const save = usePrayerSettings();
  const toast = useToast();
  if (open && !seen) {
    setSeen(true);
    setV({ mode: settings.mode, reportThreshold: String(settings.reportThreshold), words: settings.distressWords.join(", "), retentionDays: String(settings.retentionDays), purgeDays: String(settings.purgeDays), resources: toLines(settings) });
    setFields({});
  }
  const close = () => {
    setSeen(false);
    onClose();
  };
  const submit = () =>
    save.mutate(
      { ...settings, mode: v.mode, reportThreshold: Number(v.reportThreshold), distressWords: v.words.split(",").map((w) => w.trim()).filter(Boolean), retentionDays: Number(v.retentionDays), purgeDays: Number(v.purgeDays), careResources: v.resources.split("\n").map((l) => { const i = l.lastIndexOf(":"); return i < 0 ? { label: l.trim(), phone: "" } : { label: l.slice(0, i).trim(), phone: l.slice(i + 1).trim() }; }).filter((r) => r.label || r.phone) },
      {
        onSuccess: () => {
          toast.show("Prayer Wall settings saved");
          close();
        },
        onError: (e) => setFields(e instanceof ApiError && e.fields ? Object.fromEntries(Object.entries(e.fields).map(([k, m]) => [k, m[0] ?? ""])) : { mode: errText(e) }),
      },
    );
  return (
    <Dialog
      open={open}
      onClose={close}
      subtitle="Prayer Wall"
      title="Settings"
      className="max-w-xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save settings
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-ink">New requests</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
            {(
              [
                ["hold", "Hold for review", "A moderator reads each one first."],
                ["publish", "Publish at once", "They go on the wall; reports bring them back here."],
              ] as const
            ).map(([val, label, hint]) => (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={v.mode === val}
                onClick={() => setV({ ...v, mode: val })}
                className={cn("rounded-2xl border p-3 text-left transition-colors", v.mode === val ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200")}
              >
                <span className="block text-sm font-bold text-ink">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Either way, a request that trips the care check waits for a person.</p>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Reports that hide it" htmlFor="ps-th" error={fields.reportThreshold}>
            <input id="ps-th" inputMode="numeric" value={v.reportThreshold} onChange={(e) => setV({ ...v, reportThreshold: e.target.value })} className={inputClass(!!fields.reportThreshold)} />
          </Field>
          <Field label="Days on the wall" htmlFor="ps-ret" error={fields.retentionDays}>
            <input id="ps-ret" inputMode="numeric" value={v.retentionDays} onChange={(e) => setV({ ...v, retentionDays: e.target.value })} className={inputClass(!!fields.retentionDays)} />
          </Field>
          <Field label="Keep removed (days)" htmlFor="ps-purge" error={fields.purgeDays}>
            <input id="ps-purge" inputMode="numeric" value={v.purgeDays} onChange={(e) => setV({ ...v, purgeDays: e.target.value })} className={inputClass(!!fields.purgeDays)} />
          </Field>
        </div>
        <Field label="Care check words" htmlFor="ps-words" error={fields.distressWords} hint="Separate with commas. A match flags the request for a person and shows the poster the care resources.">
          <textarea id="ps-words" rows={3} value={v.words} onChange={(e) => setV({ ...v, words: e.target.value })} className={cn(inputClass(!!fields.distressWords), "h-auto py-2.5")} />
        </Field>
        <Field label="Care resources: numbers to call" htmlFor="ps-res" error={fields.careResources} hint="One per line, as “Name: number”. Shown to anyone whose request trips the care check.">
          <textarea id="ps-res" rows={3} value={v.resources} onChange={(e) => setV({ ...v, resources: e.target.value })} className={cn(inputClass(!!fields.careResources), "h-auto py-2.5 font-mono text-xs")} />
        </Field>
      </div>
    </Dialog>
  );
}
