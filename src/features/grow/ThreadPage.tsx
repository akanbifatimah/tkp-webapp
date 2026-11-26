import { ArrowLeft, BookOpen, CircleCheck, EyeOff, Heart, Lock, LockOpen, MessageCircle, Pin, PinOff, SendHorizontal, ShieldCheck, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { IconAction, Initials, inputClass } from "@/features/admin/parts";
import { useAuth } from "@/features/auth/auth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { ago, AuthorLine, HideDialog, PostText } from "./forum-parts";
import { useReplyToThread, useSetHidden, useThread, useThreadFlag } from "./grow-queries";
import { THREAD_KIND_LABEL, type ThreadDetail } from "./grow-types";

/** One conversation and the pastor's reply (Figma 136:30735 "Forum thread detail"). */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
const draftKey = (id: string) => `tkp-forum-draft-${id}`;

export function ThreadPage() {
  const { id = "", tid = "" } = useParams();
  const q = useThread(tid);
  const back = (
    <Link to={`/grow/classes/${id}/forum`} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
      <ArrowLeft className="size-4" aria-hidden />
      Back to the forum
    </Link>
  );
  if (q.isError)
    return (
      <div className="space-y-4">
        {back}
        <ErrorBanner>{q.error.message}</ErrorBanner>
      </div>
    );
  if (!q.data) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {back}
      <Thread t={q.data} />
    </div>
  );
}

function Thread({ t }: { t: ThreadDetail }) {
  const flag = useThreadFlag();
  const restore = useSetHidden();
  const toast = useToast();
  const [hiding, setHiding] = useState<{ kind: "threads" | "posts"; id: string; label: string } | null>(null);
  const [all, setAll] = useState(false);
  const set = (f: "pinned" | "locked" | "shepherdDone", on: boolean, done: string) => flag.mutate({ id: t.id, flag: f, on }, { onSuccess: () => toast.show(done), onError: (e) => toast.show(errText(e), { tone: "crit" }) });
  const replies = t.posts;
  const shown = all ? replies : replies.slice(-6);

  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-6">
      <motion.header variants={fadeUp} className="rounded-3xl bg-cream-100 p-5 sm:p-6">
        <p className="text-xs font-extrabold tracking-[0.18em] text-gold-600 uppercase">{t.courseTitle} · Forum</p>
        <h1 className="mt-1 font-display text-[24px] leading-tight font-semibold text-navy-900 sm:text-[30px]">“{t.title}”</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="font-bold text-ink">{t.author.name}</span>
          <span>Posted {ago(t.createdAt)}</span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3.5" aria-hidden />
            {t.replies} replies
          </span>
          <Chip>{THREAD_KIND_LABEL[t.kind]}</Chip>
          {t.session ? <Chip>Session {t.session}</Chip> : null}
          {t.needsPastor ? <Chip tone="crit">Waiting for a pastor</Chip> : null}
          {t.shepherdDone ? <Chip tone="ok">Shepherded by {t.shepherdDone.by}</Chip> : null}
          {t.locked ? <Chip icon={<Lock className="size-3" aria-hidden />}>Locked: the cohort can't reply</Chip> : null}
        </p>
        {t.can.moderate && !t.hidden ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {t.needsPastor ? (
              <Button size="sm" variant="ghost" icon={<CircleCheck className="size-4" />} onClick={() => set("shepherdDone", true, "Marked as shepherded")}>
                Mark shepherd done
              </Button>
            ) : t.shepherdDone ? (
              <Button size="sm" variant="ghost" onClick={() => set("shepherdDone", false, "Back on the pastor list")}>
                Reopen for a pastor
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" icon={t.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />} onClick={() => set("pinned", !t.pinned, t.pinned ? "Unpinned" : "Pinned to the top")}>
              {t.pinned ? "Unpin" : "Pin to the top"}
            </Button>
            <Button size="sm" variant="ghost" icon={t.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />} onClick={() => set("locked", !t.locked, t.locked ? "Unlocked" : "Locked")}>
              {t.locked ? "Unlock replies" : "Lock replies"}
            </Button>
            <Button size="sm" variant="ghost" icon={<EyeOff className="size-4" />} onClick={() => setHiding({ kind: "threads", id: t.id, label: t.title })}>
              Hide conversation
            </Button>
          </div>
        ) : null}
      </motion.header>

      {t.hidden ? (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream-200 px-4 py-3 text-sm text-muted">
          <span className="inline-flex items-center gap-2">
            <EyeOff className="size-4" aria-hidden />
            Hidden by {t.hidden.by} {ago(t.hidden.at)}: {t.hidden.reason}. Only moderators see it.
          </span>
          {t.can.moderate ? (
            <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => restore.mutate({ kind: "threads", id: t.id, reason: null }, { onSuccess: () => toast.show("Restored"), onError: (e) => toast.show(errText(e), { tone: "crit" }) })}>
              Restore
            </Button>
          ) : null}
        </p>
      ) : null}

      <Card>
        <AuthorLine a={t.author} at={t.createdAt} extra={t.courseTitle} />
        <PostText text={t.body} className="mt-4" />
        <p className="mt-4 flex gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 font-bold text-gold-800">
            <Heart className="size-3.5" aria-hidden />
            {t.amens} amens and prayers
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-cream-200 px-2.5 py-1 font-bold text-muted">
            <MessageCircle className="size-3.5" aria-hidden />
            {t.replies} replies
          </span>
        </p>
      </Card>

      <section aria-labelledby="replies-h" className="space-y-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="replies-h" className="font-display text-lg font-semibold text-maroon-950">
            Cohort reflections <span className="text-sm font-semibold text-muted">({shown.length} of {replies.length} shown)</span>
          </h2>
          {replies.length > shown.length ? (
            <button type="button" onClick={() => setAll(true)} className="text-xs font-extrabold tracking-[0.08em] text-gold-800 uppercase hover:underline">
              View all {replies.length} replies
            </button>
          ) : null}
        </header>
        {shown.length ? (
          <ul className="space-y-2.5">
            {shown.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "rounded-2xl border p-4",
                  p.hidden ? "border-dashed border-line bg-white/60 opacity-80" : p.pastoral ? "border-gold-300 border-l-4 border-l-gold-500 bg-gold-100/40" : "border-white bg-white shadow-card",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <AuthorLine a={p.author} at={p.createdAt} />
                  <span className="flex items-center gap-2">
                    {p.amens ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Heart className="size-3.5 text-crit" aria-hidden />
                        {p.amens}
                      </span>
                    ) : null}
                    {p.pastoral ? <Chip tone="gold" icon={<ShieldCheck className="size-3" aria-hidden />}>Pastoral guidance</Chip> : null}
                    {t.can.moderate && !p.hidden && !p.author.staff ? (
                      <IconAction label={`Hide ${p.author.name}'s reply`} icon={<EyeOff />} tone="crit" onClick={() => setHiding({ kind: "posts", id: p.id, label: `${p.author.name}'s reply` })} />
                    ) : null}
                  </span>
                </div>
                {p.hidden ? (
                  <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      Hidden by {p.hidden.by}: {p.hidden.reason}
                    </span>
                    {t.can.moderate ? (
                      <button
                        type="button"
                        onClick={() => restore.mutate({ kind: "posts", id: p.id, reason: null }, { onSuccess: () => toast.show("Restored"), onError: (e) => toast.show(errText(e), { tone: "crit" }) })}
                        className="font-bold text-maroon-700 hover:underline"
                      >
                        Restore
                      </button>
                    ) : null}
                  </p>
                ) : null}
                <PostText text={p.body} className={cn("mt-3 text-sm", p.hidden && "line-through decoration-muted/40")} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No replies yet.</p>
        )}
      </section>

      {t.can.reply ? <Composer t={t} /> : null}
      <HideDialog target={hiding} onClose={() => setHiding(null)} />
    </motion.div>
  );
}

/** "Replying as facilitator": the Figma composer, with a draft kept on this device. */
function Composer({ t }: { t: ThreadDetail }) {
  const { member } = useAuth();
  const location = useLocation();
  const reply = useReplyToThread();
  const toast = useToast();
  const confirm = useConfirm();
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(() => localStorage.getItem(draftKey(t.id)) ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(() => (localStorage.getItem(draftKey(t.id)) ? Date.now() : null));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (location.hash === "#reply") box.current?.focus();
  }, [location.hash]);

  // Autosave the draft a moment after typing stops.
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (text.trim()) {
        localStorage.setItem(draftKey(t.id), text);
        setSavedAt(Date.now());
      }
    }, 800);
    return () => window.clearTimeout(h);
  }, [text, t.id]);

  const insertPassage = () => {
    const el = box.current;
    const add = `${text && !text.endsWith("\n\n") ? (text.endsWith("\n") ? "\n" : "\n\n") : ""}> `;
    setText(text + add);
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(text.length + add.length, text.length + add.length);
    }, 0);
  };

  const discard = async () => {
    if (text.trim()) {
      const ok = await confirm({ title: "Discard this reply?", body: "What you've written is deleted from this device.", confirmLabel: "Discard reply" });
      if (!ok) return;
    }
    localStorage.removeItem(draftKey(t.id));
    setText("");
    setSavedAt(null);
  };

  const post = () => {
    setError(null);
    reply.mutate(
      { id: t.id, body: text },
      {
        onSuccess: () => {
          localStorage.removeItem(draftKey(t.id));
          setText("");
          setSavedAt(null);
          toast.show("Pastoral guidance posted");
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };

  return (
    <motion.section variants={fadeUp} id="reply" aria-label="Your reply" className="rounded-3xl border-l-4 border-gold-500 bg-cream-100 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Initials name={member?.fullName ?? "You"} />
        <span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink">{member?.fullName}</span>
            <span className="rounded-full bg-gold-600 px-2 py-0.5 text-[11px] font-bold text-white">Pastoral guidance</span>
          </span>
          <span className="block text-xs text-muted">Replying as facilitator. The whole cohort sees it.</span>
        </span>
      </div>
      <div className="mt-4 rounded-2xl border border-line bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <button type="button" onClick={insertPassage} className="inline-flex items-center gap-1.5 rounded-lg bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-800 hover:bg-gold-300/40">
            <BookOpen className="size-3.5" aria-hidden />
            Insert passage
          </button>
          <span className="text-xs text-muted" aria-live="polite">
            {savedAt ? `Draft saved on this device ${ago(new Date(savedAt).toISOString())}` : ""}
          </span>
        </div>
        <label htmlFor="fr-text" className="sr-only">
          Your reply
        </label>
        <textarea
          ref={box}
          id="fr-text"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Dear ${t.author.name.split(" ")[0]}, …`}
          className={cn(inputClass(!!error), "h-auto rounded-t-none border-0 py-3 focus:ring-0")}
        />
      </div>
      {error ? <p className="mt-2 text-xs font-bold text-crit">{error}</p> : null}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              localStorage.setItem(draftKey(t.id), text);
              setSavedAt(Date.now());
              toast.show("Draft saved on this device");
            }}
            disabled={!text.trim()}
          >
            Save as draft
          </Button>
          <Button variant="subtle" onClick={() => void discard()} disabled={!text}>
            Discard
          </Button>
        </span>
        <Button variant="dark" icon={<SendHorizontal className="size-4" />} onClick={post} loading={reply.isPending} disabled={text.trim().length < 2} disabledReason={text.trim().length < 2 ? "Write your reply first" : undefined}>
          Post pastoral guidance
        </Button>
      </div>
    </motion.section>
  );
}
