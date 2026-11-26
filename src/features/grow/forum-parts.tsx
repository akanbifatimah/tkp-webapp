import { BookOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { Field, Initials, inputClass, selectClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useCreatePrompt, useEditPrompt, useSetHidden } from "./grow-queries";
import type { ForumAuthor } from "./grow-types";

/** Pieces shared by the forum screens (Figma 136:29952, 136:30735). */

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

/** Paragraphs on blank lines; a line starting with "> " is a Scripture passage. */
export function PostText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-3 text-[15px] leading-relaxed text-ink", className)}>
      {blocks.map((b, i) =>
        b.startsWith("> ") ? (
          <blockquote key={i} className="flex gap-2 rounded-xl bg-gold-100/60 px-4 py-3 text-sm text-ink/80 italic">
            <BookOpen className="mt-0.5 size-4 shrink-0 text-gold-800" aria-hidden />
            <span>{b.replace(/^> /gm, "")}</span>
          </blockquote>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {b}
          </p>
        ),
      )}
    </div>
  );
}

export function AuthorLine({ a, at, extra }: { a: ForumAuthor; at: string; extra?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Initials name={a.name} muted={!a.staff} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">{a.name}</span>
          {a.role ? <span className="rounded-full bg-gold-600 px-2 py-0.5 text-[11px] font-bold text-white">{a.role}</span> : null}
        </span>
        <span className="block text-xs text-muted">
          {ago(at)}
          {extra ? ` · ${extra}` : ""}
        </span>
      </span>
    </span>
  );
}

const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

/** Start or edit a staff reflection prompt (the Figma's pinned prompt and "Edit message"). */
export function PromptDialog({
  open,
  onClose,
  courseId,
  sessions,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  sessions: { number: number; title: string }[];
  editing?: { id: string; title: string; body: string } | null;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [session, setSession] = useState("");
  const [pin, setPin] = useState(true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState<string | null>(null);
  const create = useCreatePrompt();
  const edit = useEditPrompt();
  const toast = useToast();
  const key = open ? (editing?.id ?? "new") : null;
  if (key !== seen) {
    setSeen(key);
    setTitle(editing?.title ?? "");
    setBody(editing?.body ?? "");
    setSession("");
    setPin(true);
    setFields({});
  }
  const fail = (e: unknown) => setFields(e instanceof ApiError && e.fields ? Object.fromEntries(Object.entries(e.fields).map(([k, m]) => [k, m[0] ?? ""])) : { body: errText(e) });
  const submit = () => {
    if (editing)
      edit.mutate(
        { id: editing.id, title, body },
        {
          onSuccess: () => {
            toast.show("Prompt updated");
            onClose();
          },
          onError: fail,
        },
      );
    else
      create.mutate(
        { courseId, body: { title, body, session: session ? Number(session) : null, pin } },
        {
          onSuccess: () => {
            toast.show(pin ? "Prompt posted and pinned" : "Prompt posted");
            onClose();
          },
          onError: fail,
        },
      );
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      subtitle={editing ? "Edit message" : "New reflection prompt"}
      title={editing ? "Change the prompt" : "Ask the cohort"}
      className="max-w-xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending || edit.isPending}>
            {editing ? "Save changes" : "Post prompt"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="pr-title" error={fields.title}>
          <input id="pr-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass(!!fields.title)} placeholder="Session 6 reflection: what will you carry forward?" />
        </Field>
        <Field label="Message" htmlFor="pr-body" error={fields.body} hint="Start a line with “> ” to set it as a Scripture passage.">
          <textarea id="pr-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} className={cn(inputClass(!!fields.body), "h-auto py-2.5")} />
        </Field>
        {!editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Session" htmlFor="pr-session" error={fields.session}>
              <select id="pr-session" value={session} onChange={(e) => setSession(e.target.value)} className={selectClass(!!session)}>
                <option value="">Not about one session</option>
                {sessions.map((s) => (
                  <option key={s.number} value={s.number}>
                    Session {s.number}: {s.title}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-3 self-end rounded-2xl border border-line bg-white p-3 text-sm font-bold text-ink">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="size-4.5 accent-maroon-700" />
              Pin it to the top (replaces the pinned one)
            </label>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Hide a thread or reply with a reason. It stays visible to moderators and can be restored. */
export function HideDialog({ target, onClose }: { target: { kind: "threads" | "posts"; id: string; label: string } | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hide = useSetHidden();
  const toast = useToast();
  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };
  const submit = () => {
    if (!target) return;
    if (reason.trim().length < 5) return setError("Say why, so other moderators know");
    hide.mutate(
      { kind: target.kind, id: target.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.show("Hidden. Moderators can still see and restore it.");
          close();
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };
  return (
    <Dialog
      open={!!target}
      onClose={close}
      subtitle={target?.kind === "threads" ? "Hide conversation" : "Hide reply"}
      title={target?.label ?? ""}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={hide.isPending}>
            Hide it
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">
        The cohort won't see it any more. Its author isn't told. Moderators still see it, with your reason, and can restore it.
      </p>
      <Field label="Reason" htmlFor="hide-why" error={error ?? undefined} hint="Kept with the post and in the audit log.">
        <input id="hide-why" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass(!!error)} placeholder="Shared someone else's private story" />
      </Field>
    </Dialog>
  );
}
