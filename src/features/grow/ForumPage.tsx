import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheck, EyeOff, Heart, Lock, LockOpen, MessageCircleQuestion, MessagesSquare, Pin, PinOff, Plus, Reply, Search, ShieldCheck, Undo2, Users } from "lucide-react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { IconAction, inputClass, selectClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { ago, AuthorLine, HideDialog, PostText, PromptDialog } from "./forum-parts";
import { useCourse, useForum, useSetHidden, useThreadFlag } from "./grow-queries";
import { THREAD_KIND_LABEL, type ForumFilter, type ForumSort, type ThreadSummary } from "./grow-types";

/**
 * Cohort community and forum (Figma 136:29952): what the cohort is talking
 * about, what waits for a pastor, and moderation.
 */

const FILTERS: { id: ForumFilter; label: string }[] = [
  { id: "all", label: "All discussions" },
  { id: "pastor", label: "Pastor replies needed" },
  { id: "reflection", label: "Weekly reflections" },
  { id: "prayer", label: "Prayer requests" },
  { id: "question", label: "Study questions" },
  { id: "testimony", label: "Testimonies" },
];
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

export function ForumPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.some((f) => f.id === params.get("filter")) ? params.get("filter") : "all") as ForumFilter;
  const [text, setText] = useState("");
  const [sort, setSort] = useState<ForumSort>("activity");
  const [page, setPage] = useState(1);
  const q = useForum(id, { filter, q: text, sort, page });
  const course = useCourse(id);
  const [prompt, setPrompt] = useState<{ id: string; title: string; body: string } | "new" | null>(null);
  const [hiding, setHiding] = useState<{ kind: "threads"; id: string; label: string } | null>(null);
  const d = q.data;

  const setFilter = (f: ForumFilter) => {
    setPage(1);
    setParams(f === "all" ? {} : { filter: f }, { replace: true });
  };

  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-6">
      <Link to={`/grow/classes/${id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
        <ArrowLeft className="size-4" aria-hidden />
        Back to {d?.course.title ?? "the class"}
      </Link>
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}
      {!d ? (
        <Skeleton className="h-150 w-full rounded-3xl" />
      ) : (
        <>
          <motion.header variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-cream-100 p-5 sm:p-6">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-extrabold tracking-[0.18em] text-gold-600 uppercase">4 · Grow · Forum</p>
              <h1 className="font-display text-[26px] leading-tight font-semibold tracking-tight text-navy-900 sm:text-[32px]">{d.course.title}: cohort community</h1>
              <p className="mt-1 text-sm text-muted">
                {d.course.enrolled} enrolled · <span className="font-bold text-gold-800">Moderated by {d.course.moderators.join(" and ")}</span>
              </p>
            </div>
            {d.can.reply ? (
              <Button icon={<Plus className="size-4" />} onClick={() => setPrompt("new")}>
                New reflection prompt
              </Button>
            ) : null}
          </motion.header>

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Cohort discussion" icon={<MessagesSquare />} value={`${d.stats.threads} threads`} />
            <Stat label="Pastoral questions" icon={<MessageCircleQuestion />} value={`${d.stats.needsPastor} waiting`} tone={d.stats.needsPastor ? "gold" : undefined} />
            <Stat label="Cohort participation" icon={<Users />} value={`${d.stats.participation}%`} hint={`${d.stats.participants} of ${d.course.enrolled} posted in the last 30 days`} />
          </div>

          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors",
                    filter === f.id ? "border-gold-600 bg-gold-500 text-ink" : "border-line bg-white text-muted hover:text-ink",
                  )}
                >
                  {f.id === "pastor" && d.counts.pastor ? <span className="size-1.5 rounded-full bg-crit" aria-hidden /> : null}
                  {f.label} ({d.counts[f.id]})
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative block flex-1">
                <span className="sr-only">Search the forum</span>
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search threads, topics, Scripture or names…"
                  className={cn(inputClass(), "pl-10")}
                />
              </label>
              <label className="sm:w-52">
                <span className="sr-only">Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as ForumSort)} className={selectClass(false)}>
                  <option value="activity">Latest activity</option>
                  <option value="newest">Newest first</option>
                  <option value="replies">Most replies</option>
                </select>
              </label>
            </div>
          </Card>

          {d.pinned ? <PinnedCard t={d.pinned} courseId={id} canEdit={d.can.reply && d.pinned.author.staff} onEdit={() => setPrompt({ id: d.pinned!.id, title: d.pinned!.title, body: d.pinned!.body })} /> : null}

          {d.items.length ? (
            <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="space-y-3">
              {d.items.map((t) => (
                <ThreadCard key={t.id} t={t} courseId={id} moderate={d.can.moderate} onHide={() => setHiding({ kind: "threads", id: t.id, label: t.title })} />
              ))}
            </motion.ul>
          ) : (
            <Card>
              <EmptyState icon={<MessagesSquare />} title={filter === "pastor" ? "Nothing waits for a pastor" : "No conversations here"}>
                {filter === "pastor" ? "Every question and prayer request has a reply, or was marked done." : text ? "Try another search." : "Conversations show here as the cohort posts."}
              </EmptyState>
            </Card>
          )}

          {d.total > d.pageSize ? (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted">
                Showing {d.items.length} of {d.total} conversations
              </span>
              <span className="flex items-center gap-1">
                <button type="button" disabled={d.page <= 1} onClick={() => setPage(d.page - 1)} aria-label="Previous page" className="grid size-9 place-items-center rounded-xl border border-line bg-white text-maroon-700 disabled:opacity-40">
                  <ChevronLeft className="size-4" />
                </button>
                {Array.from({ length: Math.ceil(d.total / d.pageSize) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-current={n === d.page ? "page" : undefined}
                    onClick={() => setPage(n)}
                    className={cn("grid size-9 place-items-center rounded-xl border font-bold tabular", n === d.page ? "border-gold-500 bg-gold-100 text-gold-800" : "border-line bg-white text-muted")}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={d.page * d.pageSize >= d.total}
                  onClick={() => setPage(d.page + 1)}
                  aria-label="Next page"
                  className="grid size-9 place-items-center rounded-xl border border-line bg-white text-maroon-700 disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </span>
            </nav>
          ) : null}
        </>
      )}

      <PromptDialog
        open={!!prompt}
        onClose={() => setPrompt(null)}
        courseId={id}
        sessions={(course.data?.sessions ?? []).map((s) => ({ number: s.number, title: s.title }))}
        editing={prompt && prompt !== "new" ? prompt : null}
      />
      <HideDialog target={hiding} onClose={() => setHiding(null)} />
    </motion.div>
  );
}

function Stat({ label, icon, value, hint, tone }: { label: string; icon: ReactNode; value: string; hint?: string; tone?: "gold" }) {
  return (
    <Card className="p-5">
      <p className="mb-3 flex items-center justify-between text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase">
        {label}
        <span className="grid size-8 place-items-center rounded-full bg-cream-100 text-gold-800 [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      </p>
      <p className={cn("font-display text-2xl font-semibold", tone === "gold" ? "text-gold-800" : "text-ink")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

function PinnedCard({ t, courseId, canEdit, onEdit }: { t: ThreadSummary; courseId: string; canEdit: boolean; onEdit: () => void }) {
  const navigate = useNavigate();
  return (
    <motion.article variants={fadeUp} className="rounded-3xl border-l-4 border-gold-500 bg-cream-100 p-5 sm:p-6">
      <p className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-extrabold tracking-[0.12em] text-gold-800 uppercase">
        <span className="inline-flex items-center gap-1.5">
          <Pin className="size-3.5" aria-hidden />
          Pinned by {t.author.name}
          {t.session ? ` · Session ${t.session}` : ""}
        </span>
        <span className="font-semibold tracking-normal text-muted normal-case">Posted {ago(t.createdAt)}</span>
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold text-maroon-950">{t.title}</h2>
      <PostText text={t.body} className="mt-2 text-sm text-ink/85" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-xs text-muted">
          <span className="font-bold text-ink">{t.replies} replied</span>
          {t.lastBy ? ` · last reply ${ago(t.lastActivityAt)} by ${t.lastBy}` : ""}
        </p>
        <span className="flex gap-2">
          {canEdit ? (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit message
            </Button>
          ) : null}
          <Button size="sm" variant="gold" onClick={() => void navigate(`/grow/classes/${courseId}/forum/${t.id}`)}>
            View all {t.replies} responses
          </Button>
        </span>
      </div>
    </motion.article>
  );
}

function ThreadCard({ t, courseId, moderate, onHide }: { t: ThreadSummary; courseId: string; moderate: boolean; onHide: () => void }) {
  const navigate = useNavigate();
  const flag = useThreadFlag();
  const restore = useSetHidden();
  const toast = useToast();
  const open = () => void navigate(`/grow/classes/${courseId}/forum/${t.id}`);
  const set = (f: "pinned" | "locked" | "shepherdDone", on: boolean, done: string) => flag.mutate({ id: t.id, flag: f, on }, { onSuccess: () => toast.show(done), onError: (e) => toast.show(errText(e), { tone: "crit" }) });
  return (
    <motion.li variants={fadeUp} className={cn("rounded-3xl border bg-white p-5 shadow-card sm:p-6", t.hidden ? "border-dashed border-line opacity-80" : "border-white", t.needsPastor && "border-l-4 border-l-crit")}>
      {t.hidden ? (
        <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream-200 px-3 py-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <EyeOff className="size-3.5" aria-hidden />
            Hidden by {t.hidden.by}: {t.hidden.reason}. Only moderators see it.
          </span>
          {moderate ? (
            <button
              type="button"
              onClick={() => restore.mutate({ kind: "threads", id: t.id, reason: null }, { onSuccess: () => toast.show("Restored"), onError: (e) => toast.show(errText(e), { tone: "crit" }) })}
              className="inline-flex items-center gap-1 font-bold text-maroon-700 hover:underline"
            >
              <Undo2 className="size-3.5" aria-hidden />
              Restore
            </button>
          ) : null}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <AuthorLine a={t.author} at={t.createdAt} />
        <span className="flex flex-wrap gap-1.5">
          {t.needsPastor ? <Chip tone="crit">Needs a pastor</Chip> : null}
          {t.shepherdDone ? <Chip tone="ok" icon={<ShieldCheck className="size-3" aria-hidden />}>Shepherded</Chip> : null}
          {t.locked ? <Chip icon={<Lock className="size-3" aria-hidden />}>Locked</Chip> : null}
          {t.kind === "testimony" ? <Chip tone="gold">Uplifting testimony</Chip> : null}
        </span>
      </div>
      <p className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{THREAD_KIND_LABEL[t.kind]}</Chip>
        {t.session ? <Chip>Session {t.session}</Chip> : null}
      </p>
      <h3 className="mt-2 font-display text-lg font-semibold text-maroon-950">
        <Link to={`/grow/classes/${courseId}/forum/${t.id}`} className="hover:text-maroon-700">
          {t.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-ink/85">{t.excerpt}</p>
      {t.pastoral ? (
        <p className="mt-3 flex gap-2 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink/85 italic">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold-800" aria-hidden />
          <span>
            <span className="font-bold text-gold-800 not-italic">{t.pastoral.by}:</span> “{t.pastoral.body}”
          </span>
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className="flex flex-wrap items-center gap-2">
          {moderate && !t.hidden ? (
            <>
              <Button size="sm" variant="gold" icon={<Reply className="size-4" />} onClick={() => void navigate(`/grow/classes/${courseId}/forum/${t.id}#reply`)}>
                Reply as pastor
              </Button>
              {t.needsPastor ? (
                <Button size="sm" variant="ghost" icon={<CircleCheck className="size-4" />} onClick={() => set("shepherdDone", true, "Marked as shepherded")} disabled={flag.isPending}>
                  Mark shepherd done
                </Button>
              ) : null}
              <IconAction label={t.pinned ? "Unpin" : "Pin to the top"} icon={t.pinned ? <PinOff /> : <Pin />} onClick={() => set("pinned", !t.pinned, t.pinned ? "Unpinned" : "Pinned to the top")} disabled={flag.isPending} />
              <IconAction label={t.locked ? "Unlock replies" : "Lock replies"} icon={t.locked ? <LockOpen /> : <Lock />} onClick={() => set("locked", !t.locked, t.locked ? "Unlocked" : "Locked: the cohort can't reply")} disabled={flag.isPending} />
              <IconAction label="Hide conversation" icon={<EyeOff />} tone="crit" onClick={onHide} />
            </>
          ) : null}
        </span>
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3.5 text-crit" aria-hidden />
            {t.amens} {t.amens === 1 ? "blessing" : "blessings"}
          </span>
          <span>{t.replies} replies</span>
          <Button size="sm" variant="ghost" onClick={open}>
            Open thread
          </Button>
        </span>
      </div>
    </motion.li>
  );
}
