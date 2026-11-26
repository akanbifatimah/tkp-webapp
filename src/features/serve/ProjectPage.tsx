import { ArrowLeft, CalendarDays, CheckCircle2, CircleSlash, Hourglass, Lock, Mail, MessageCircle, MessageSquareWarning, MousePointerClick, Pencil, Phone, RotateCcw, Star, UserCheck, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { Card, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, inputClass, selectClass } from "@/features/admin/parts";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { formatWhen } from "@/lib/time";
import { civil, Cover, DueChip, ProjectStatusChip } from "./project-parts";
import { useApproveProject, useCloseProject, useDeclineProject, useFeatureProject, usePositionState, useProject, useProjectLead, useReopenProject, useRequestChanges } from "./project-queries";
import type { Position, ProjectDetail } from "./project-types";

/**
 * One project (M9 step 2): the post as members will see it (Figma PJ3, PJ4)
 * beside the pastoral team's review panel.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

export function ProjectPage() {
  const { id = "" } = useParams();
  const q = useProject(id);
  const back = (
    <Link to="/serve" className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
      <ArrowLeft className="size-4" aria-hidden />
      All projects
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
  const p = q.data;
  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-5">
      {back}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Preview p={p} />
        <ReviewPanel p={p} />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ preview */

function Preview({ p }: { p: ProjectDetail }) {
  return (
    <motion.section variants={fadeUp} aria-label="As members see it" className="space-y-4">
      <p className="text-[11px] font-extrabold tracking-[0.14em] text-muted uppercase">As members will see it in the app</p>
      <div className="overflow-hidden rounded-3xl border border-white bg-white shadow-card">
        <Cover ministry={p.ministry} file={p.cover} featured={p.featured} className="h-48">
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/80 to-transparent px-5 pt-10 pb-4">
            <h1 className="font-display text-2xl font-semibold text-cream-50">{p.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gold-300">
              <CalendarDays className="size-4" aria-hidden />
              {civil(p.startDate)}
              {p.targetFinish ? ` – ${civil(p.targetFinish)}` : " onwards"}
            </p>
          </div>
        </Cover>
        <p className="px-5 py-4 text-[15px] leading-relaxed text-ink">{p.description}</p>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-maroon-950">Open positions ({p.positions.filter((x) => x.state === "open").length})</h2>
        <span className="text-xs text-muted">Updated {formatWhen(p.updatedAt)}</span>
      </div>
      <ul className="space-y-3">
        {p.positions.map((x) => (
          <PositionCard key={x.id} x={x} p={p} />
        ))}
      </ul>

      <Card className="p-5">
        <p className="font-bold text-ink">{p.contact.coordinators || <span className="text-crit">No coordinator named</span>}</p>
        <p className="text-sm text-muted">{p.contact.role}</p>
        {p.contact.howToApply ? <p className="mt-2 text-sm text-ink">{p.contact.howToApply}</p> : null}
        <p className="mt-3 flex flex-wrap gap-2">
          {p.contact.phone ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1.5 text-sm font-bold text-maroon-800">
                <Phone className="size-4" aria-hidden />
                Call {p.contact.phone}
              </span>
              {p.contact.whatsapp ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1.5 text-sm font-bold text-maroon-800">
                  <MessageCircle className="size-4" aria-hidden />
                  WhatsApp
                </span>
              ) : null}
            </>
          ) : null}
          {p.contact.email ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-3 py-1.5 text-sm font-bold text-maroon-800">
              <Mail className="size-4" aria-hidden />
              {p.contact.email}
            </span>
          ) : null}
          {!p.contact.phone && !p.contact.email ? <span className="text-sm font-bold text-crit">No phone number or email yet</span> : null}
        </p>
      </Card>
    </motion.section>
  );
}

function PositionCard({ x, p }: { x: Position; p: ProjectDetail }) {
  const setState = usePositionState();
  const toast = useToast();
  const set = (state: "open" | "filled" | "closed", msg: string) =>
    setState.mutate({ id: p.id, pid: x.id, state, rowVer: p.rowVer }, { onSuccess: () => toast.show(msg), onError: (e) => toast.show(errText(e), { tone: "crit" }) });
  const lines = x.responsibilities.split("\n").filter(Boolean);
  return (
    <li className={cn("rounded-3xl border border-white bg-white p-5 shadow-card", x.state !== "open" && "opacity-75")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-ink">{x.title || <span className="text-crit">No title</span>}</p>
          <p className="text-sm text-muted">
            {x.commitment || "No time commitment"} · {x.format}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {x.state === "filled" ? <Chip tone="ok">Filled</Chip> : x.state === "closed" ? <Chip>Closed</Chip> : x.closingSoon ? <Chip tone="crit" icon={<Hourglass className="size-3" aria-hidden />}>Closing soon ({x.daysLeft} {x.daysLeft === 1 ? "day" : "days"} left)</Chip> : null}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["Openings", `${x.openings} ${x.openings === 1 ? "spot" : "spots"}`],
            ["Closes", x.closingDate ? civil(x.closingDate) : "No date"],
            ["Contact taps", String(x.contactTaps)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line px-2 py-2">
            <dt className="text-[10.5px] font-extrabold tracking-[0.08em] text-muted uppercase">{k}</dt>
            <dd className={cn("text-sm font-bold text-ink", k === "Openings" && x.openings < 1 && "text-crit")}>{v}</dd>
          </div>
        ))}
      </dl>
      {lines.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink marker:text-maroon-700">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm font-bold text-crit">No responsibilities yet</p>
      )}
      {x.skills.length ? (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {x.skills.map((s) => (
            <span key={s} className="rounded-full bg-cream-100 px-2.5 py-1 text-xs text-ink">
              {s}
            </span>
          ))}
        </p>
      ) : null}
      {p.can.positions ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {x.state === "open" ? (
            <>
              <Button size="sm" variant="ghost" icon={<UserCheck className="size-4" />} onClick={() => set("filled", `${x.title} marked filled`)} loading={setState.isPending}>
                Mark filled
              </Button>
              <Button size="sm" variant="ghost" icon={<CircleSlash className="size-4" />} onClick={() => set("closed", `${x.title} closed`)} loading={setState.isPending}>
                Close position
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => set("open", `${x.title} reopened`)} loading={setState.isPending}>
              Reopen
            </Button>
          )}
          <span className="ml-auto inline-flex items-center gap-1 self-center text-xs text-muted">
            <MousePointerClick className="size-3.5" aria-hidden />
            Taps are counted, never who
          </span>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ review */

function ReviewPanel({ p }: { p: ProjectDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const approve = useApproveProject();
  const feature = useFeatureProject();
  const reopen = useReopenProject();
  const lead = useProjectLead();
  const [dialog, setDialog] = useState<"changes" | "decline" | "close" | null>(null);
  const waiting = p.status === "submitted" || p.status === "changes";
  const done = (msg: string) => ({ onSuccess: () => toast.show(msg), onError: (e: unknown) => toast.show(errText(e), { tone: "crit" }) });

  return (
    <motion.aside variants={fadeUp} className="space-y-4 xl:sticky xl:top-6">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ProjectStatusChip status={p.status} />
          {p.status === "submitted" ? <DueChip dueAt={p.reviewDueAt} overdue={p.overdue} /> : null}
        </div>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted">Posted by</dt>
          <dd className="font-bold text-ink">
            {p.postedBy.name}
            {p.postedBy.member ? (
              <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-bold text-ok">
                <CheckCircle2 className="size-3.5" aria-hidden />
                Member
              </span>
            ) : null}
          </dd>
          {p.postedBy.email ? (
            <>
              <dt className="text-muted">Email</dt>
              <dd className="truncate text-ink">{p.postedBy.email}</dd>
            </>
          ) : null}
          <dt className="text-muted">Submitted</dt>
          <dd className="text-ink">{formatWhen(p.submittedAt)}</dd>
        </dl>

        {p.reviewMessage && p.status === "changes" ? (
          <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-ink">
            <b className="text-warn">Changes requested:</b> {p.reviewMessage}
          </p>
        ) : null}
        {p.declineReason ? (
          <p className="rounded-xl bg-crit-soft px-3.5 py-2.5 text-sm text-ink">
            <b className="text-crit">Declined:</b> {p.declineReason}
          </p>
        ) : null}

        {waiting && p.problems.length ? (
          <div className="rounded-xl border border-crit/20 bg-crit-soft px-3.5 py-3 text-sm">
            <p className="font-bold text-crit">To fix before it can go live</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink">
              {p.problems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Ask the member to fix it, or edit it yourself.</p>
          </div>
        ) : null}

        {p.can.review && waiting ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="dark"
              icon={<CheckCircle2 className="size-4" />}
              onClick={() => approve.mutate({ id: p.id, rowVer: p.rowVer }, done(`${p.name} is live in the app`))}
              loading={approve.isPending}
              disabled={p.problems.length > 0}
              disabledReason={p.problems.length ? "Fix the list above first" : undefined}
            >
              Approve and publish
            </Button>
            <Button variant="ghost" icon={<MessageSquareWarning className="size-4" />} onClick={() => setDialog("changes")}>
              Ask for changes
            </Button>
            <Button variant="ghost" icon={<XCircle className="size-4" />} onClick={() => setDialog("decline")}>
              Decline
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {p.can.edit ? (
            <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => void navigate(`/serve/projects/${p.id}/edit`)}>
              Edit project
            </Button>
          ) : null}
          {p.can.review && p.status === "live" ? (
            <Button variant="ghost" icon={<Star className="size-4" />} onClick={() => feature.mutate({ id: p.id, on: !p.featured, rowVer: p.rowVer }, done(p.featured ? "No longer featured" : "Featured at the top of Projects"))} loading={feature.isPending}>
              {p.featured ? "Stop featuring" : "Feature at the top"}
            </Button>
          ) : null}
          {p.can.edit && p.status === "live" ? (
            <Button variant="ghost" icon={<Lock className="size-4" />} onClick={() => setDialog("close")}>
              Close project
            </Button>
          ) : null}
          {p.can.edit && p.status === "closed" ? (
            <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => reopen.mutate({ id: p.id, rowVer: p.rowVer }, done("Reopened. It's live again."))} loading={reopen.isPending}>
              Reopen project
            </Button>
          ) : null}
        </div>

        {p.can.review ? (
          <Field label="Project Lead" htmlFor="pj-lead" hint="They can edit it and mark positions filled, without reviewing.">
            <select id="pj-lead" value={p.lead?.id ?? ""} onChange={(e) => lead.mutate({ id: p.id, leadId: e.target.value || null, rowVer: p.rowVer }, done(e.target.value ? "Project Lead set" : "Project Lead removed"))} className={selectClass(!!p.lead)}>
              <option value="">No Project Lead</option>
              {p.options.leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        ) : p.lead ? (
          <p className="text-sm text-muted">
            Project Lead: <span className="font-bold text-ink">{p.lead.name}</span>
          </p>
        ) : null}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold text-muted">History</h2>
        <ol className="space-y-2.5">
          {[...p.history].reverse().map((h, i) => (
            <li key={i} className="text-sm">
              <span className="font-bold text-ink">{h.action}</span> <span className="text-muted">· {h.by} · {formatWhen(h.at)}</span>
              {h.note ? <span className="block text-xs text-muted">“{h.note}”</span> : null}
            </li>
          ))}
        </ol>
      </Card>

      <ReasonDialog p={p} kind={dialog} onClose={() => setDialog(null)} />
    </motion.aside>
  );
}

const DIALOG = {
  changes: { subtitle: "Ask for changes", button: "Send to the member", label: "What should they change?", hint: "The member sees this in the app.", placeholder: "Please add a phone number so people can reach you.", danger: false },
  decline: { subtitle: "Decline this post", button: "Decline post", label: "Why, kindly", hint: "The member sees this. It won't be published.", placeholder: "Projects are for church and community service…", danger: true },
  close: { subtitle: "Close this project", button: "Close project", label: "Why is it closing?", hint: "It leaves the app's Projects page. You can reopen it.", placeholder: "All positions are filled", danger: true },
} as const;

function ReasonDialog({ p, kind, onClose }: { p: ProjectDetail; kind: "changes" | "decline" | "close" | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const changes = useRequestChanges();
  const decline = useDeclineProject();
  const close = useCloseProject();
  const toast = useToast();
  const cfg = kind ? DIALOG[kind] : DIALOG.changes;
  const end = () => {
    setText("");
    setError(null);
    onClose();
  };
  const submit = () => {
    const v = text.trim();
    const opts = (msg: string) => ({
      onSuccess: () => {
        toast.show(msg);
        end();
      },
      onError: (e: unknown) => setError(e instanceof ApiError && e.fields ? (Object.values(e.fields)[0]?.[0] ?? e.message) : errText(e)),
    });
    if (kind === "changes") changes.mutate({ id: p.id, message: v, rowVer: p.rowVer }, opts("Sent back to the member"));
    if (kind === "decline") decline.mutate({ id: p.id, reason: v, rowVer: p.rowVer }, opts("Declined. The member sees your reason."));
    if (kind === "close") close.mutate({ id: p.id, reason: v, rowVer: p.rowVer }, opts("Closed"));
  };
  return (
    <Dialog
      open={!!kind}
      onClose={end}
      subtitle={cfg.subtitle}
      title={p.name}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={end} data-autofocus>
            Cancel
          </Button>
          <Button variant={cfg.danger ? "danger" : "primary"} onClick={submit} loading={changes.isPending || decline.isPending || close.isPending}>
            {cfg.button}
          </Button>
        </div>
      }
    >
      <Field label={cfg.label} htmlFor="pj-reason" error={error ?? undefined} hint={cfg.hint}>
        <textarea id="pj-reason" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={cfg.placeholder} className={cn(inputClass(!!error), "h-auto py-2.5")} />
      </Field>
    </Dialog>
  );
}
