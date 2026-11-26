import { ArrowLeft, ImageIcon, PlusCircle, Send, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, IconAction, inputClass, selectClass } from "@/features/admin/parts";
import { useAuth } from "@/features/auth/auth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { useCreateProject, useProject, useUpdateProject } from "./project-queries";
import { FORMATS, MINISTRIES, type PositionInput, type ProjectDetail, type ProjectInput } from "./project-types";

/**
 * New or edit project: the desktop version of the Figma "Create a Project Post"
 * (PJ5, 245:7719): 1. project details, 2. open positions, 3. contact and how to apply.
 */

const COMMITMENTS = ["A few hours a week", "1–2 hrs/wk", "2–3 hrs/wk", "Sundays", "Saturdays", "One-off"];
const blankPosition = (): PositionInput => ({ title: "", responsibilities: "", skills: [], commitment: "", format: "In person (Katy)", openings: 1, closingDate: null });
const blank = (): ProjectInput => ({
  name: "",
  description: "",
  ministry: "Outreach",
  startDate: "",
  targetFinish: null,
  cover: null,
  positions: [blankPosition()],
  contact: { coordinators: "", role: "", phone: "", whatsapp: true, email: "", howToApply: "" },
});

export function ProjectFormPage() {
  const { id } = useParams();
  const q = useProject(id);
  if (id && q.isError) return <ErrorBanner>{q.error.message}</ErrorBanner>;
  if (id && !q.data) return <Skeleton className="mt-6 h-150 w-full rounded-3xl" />;
  if (q.data && !q.data.can.edit) return <ErrorBanner>You can't edit this project.</ErrorBanner>;
  return <Form key={q.data?.rowVer ?? "new"} existing={q.data ?? null} />;
}

function Section({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <motion.section variants={fadeUp} className="rounded-3xl border border-white bg-white p-5 shadow-card sm:p-6">
      <header className="mb-5 border-b border-line pb-3">
        <h2 className="font-display text-xl font-semibold text-maroon-800">
          {n}. {title}
        </h2>
        <p className="text-sm text-muted">{hint}</p>
      </header>
      <div className="space-y-5">{children}</div>
    </motion.section>
  );
}

function Form({ existing }: { existing: ProjectDetail | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { has } = useAuth();
  const create = useCreateProject();
  const update = useUpdateProject();
  const cover = useRef<HTMLInputElement>(null);
  const start: ProjectInput = existing
    ? { name: existing.name, description: existing.description, ministry: existing.ministry, startDate: existing.startDate, targetFinish: existing.targetFinish, cover: existing.cover, contact: existing.contact, positions: existing.positions.map(({ title, responsibilities, skills, commitment, format, openings, closingDate }) => ({ title, responsibilities, skills, commitment, format, openings, closingDate })) }
    : blank();
  const [v, setV] = useState<ProjectInput>(start);
  const [skills, setSkills] = useState<string[]>(start.positions.map((x) => x.skills.join(", ")));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const reviewer = has("projects.review");
  const back = existing ? `/serve/projects/${existing.id}` : "/serve";
  const dirty = JSON.stringify(v) !== JSON.stringify(start) || skills.join("|") !== start.positions.map((x) => x.skills.join(", ")).join("|");

  const setP = (i: number, patch: Partial<PositionInput>) => setV((x) => ({ ...x, positions: x.positions.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
  const err = (k: string) => fields[k];

  const leave = async () => {
    if (dirty) {
      const ok = await confirm({ title: "Leave without saving?", body: "Your changes to this project will be lost.", confirmLabel: "Leave without saving", cancelLabel: "Keep editing" });
      if (!ok) return;
    }
    void navigate(back);
  };

  const removePosition = async (i: number) => {
    const x = v.positions[i]!;
    if (x.title.trim()) {
      const ok = await confirm({ title: `Remove “${x.title}”?`, body: "This position comes off the project. Its contact count goes with it.", confirmLabel: "Remove position" });
      if (!ok) return;
    }
    setV((y) => ({ ...y, positions: y.positions.filter((_, j) => j !== i) }));
    setSkills((s) => s.filter((_, j) => j !== i));
  };

  const submit = async () => {
    setFields({});
    setBanner(null);
    const body: ProjectInput = { ...v, positions: v.positions.map((x, i) => ({ ...x, skills: (skills[i] ?? "").split(",").map((s) => s.trim()).filter(Boolean) })) };
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, body: { ...body, rowVer: existing.rowVer } });
        toast.show("Project saved");
        void navigate(back);
      } else {
        const r = await create.mutateAsync(body);
        toast.show(r.status === "live" ? `${r.name} is live in the app` : `${r.name} sent to the pastoral team for review`);
        void navigate(`/serve/projects/${r.id}`);
      }
    } catch (e) {
      if (!(e instanceof ApiError)) return setBanner("Something went wrong. Please try again.");
      setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, m]) => [k, m[0] ?? ""])));
      setBanner(e.message);
    }
  };

  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="mx-auto max-w-3xl space-y-6 pb-4">
      <motion.div variants={fadeUp}>
        <button type="button" onClick={() => void leave()} className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 hover:text-maroon-900">
          <ArrowLeft className="size-4" aria-hidden />
          {existing ? `Back to ${existing.name}` : "Back to projects"}
        </button>
      </motion.div>
      <PageHeader eyebrow="6 · Serve" title={existing ? "Edit project" : "New project"} tagline={existing ? existing.name : reviewer ? "It goes live in the app when you publish." : "It goes to the pastoral team for review."} />
      {banner ? <ErrorBanner>{banner}</ErrorBanner> : null}

      <Section n={1} title="Project details" hint="Introduce the initiative to the church family.">
        <Field label="Project name" htmlFor="pf-name" error={err("name")}>
          <input id="pf-name" data-autofocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Livestream Multi-Cam Upgrade" className={inputClass(!!err("name"))} />
        </Field>
        <Field label="Short description" htmlFor="pf-desc" error={err("description")}>
          <textarea id="pf-desc" rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} className={cn(inputClass(!!err("description")), "h-auto py-2.5")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ministry" htmlFor="pf-min" error={err("ministry")}>
            <select id="pf-min" value={v.ministry} onChange={(e) => setV({ ...v, ministry: e.target.value as ProjectInput["ministry"] })} className={selectClass(false)}>
              {MINISTRIES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Start date" htmlFor="pf-start" error={err("startDate")}>
            <input id="pf-start" type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} className={inputClass(!!err("startDate"))} />
          </Field>
          <Field label={<>Target finish <span className="font-semibold text-muted">(optional)</span></>} htmlFor="pf-end" error={err("targetFinish")}>
            <input id="pf-end" type="date" value={v.targetFinish ?? ""} onChange={(e) => setV({ ...v, targetFinish: e.target.value || null })} className={inputClass(!!err("targetFinish"))} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink">Cover photo</p>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line bg-cream-50 px-4 py-3">
            <ImageIcon className="size-5 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{v.cover ? v.cover.name : "No photo yet. A wide photo of the team at work looks best."}</span>
            <input
              ref={cover}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 8 * 1024 * 1024) return toast.show("Use a photo under 8 MB.", { tone: "crit" });
                setV({ ...v, cover: { id: `cv-${Date.now()}`, name: f.name, size: f.size, type: f.type } });
              }}
            />
            {v.cover ? <IconAction label="Remove the photo" icon={<X />} onClick={() => setV({ ...v, cover: null })} /> : null}
            <Button size="sm" variant="ghost" onClick={() => cover.current?.click()}>
              {v.cover ? "Change photo" : "Choose a photo"}
            </Button>
          </div>
        </div>
      </Section>

      <Section n={2} title="Open positions" hint="Roles needed for this project.">
        {err("positions") ? <p className="text-sm font-bold text-crit">{err("positions")}</p> : null}
        {v.positions.map((x, i) => (
          <fieldset key={i} className="space-y-4 rounded-2xl border border-line p-4">
            <legend className="flex w-full items-center justify-between gap-2 px-1 text-sm font-bold text-maroon-800">
              Position {i + 1}
            </legend>
            <div className="flex items-start gap-2">
              <Field label="Position title" htmlFor={`pf-t${i}`} error={err(`positions.${i}.title`)} className="flex-1">
                <input id={`pf-t${i}`} value={x.title} onChange={(e) => setP(i, { title: e.target.value })} placeholder="Sound and Video Volunteer" className={inputClass(!!err(`positions.${i}.title`))} />
              </Field>
              {v.positions.length > 1 ? (
                <span className="mt-7">
                  <IconAction label={`Remove position ${i + 1}`} icon={<Trash2 />} tone="crit" onClick={() => void removePosition(i)} />
                </span>
              ) : null}
            </div>
            <Field label="Responsibilities" htmlFor={`pf-r${i}`} error={err(`positions.${i}.responsibilities`)} hint="One per line. The app shows them as bullet points.">
              <textarea id={`pf-r${i}`} rows={3} value={x.responsibilities} onChange={(e) => setP(i, { responsibilities: e.target.value })} className={cn(inputClass(!!err(`positions.${i}.responsibilities`)), "h-auto py-2.5")} />
            </Field>
            <Field label={<>Skills needed <span className="font-semibold text-muted">(comma separated)</span></>} htmlFor={`pf-s${i}`}>
              <input id={`pf-s${i}`} value={skills[i] ?? ""} onChange={(e) => setSkills((s) => s.map((y, j) => (j === i ? e.target.value : y)).concat(i >= s.length ? [e.target.value] : []))} placeholder="Audio mixing, XLR setup, Sunday punctuality" className={inputClass()} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Time commitment" htmlFor={`pf-c${i}`} error={err(`positions.${i}.commitment`)}>
                <input id={`pf-c${i}`} list="pf-commitments" value={x.commitment} onChange={(e) => setP(i, { commitment: e.target.value })} placeholder="A few hours a week" className={inputClass(!!err(`positions.${i}.commitment`))} />
              </Field>
              <Field label="Format" htmlFor={`pf-f${i}`}>
                <select id={`pf-f${i}`} value={x.format} onChange={(e) => setP(i, { format: e.target.value as PositionInput["format"] })} className={selectClass(false)}>
                  {FORMATS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Openings" htmlFor={`pf-o${i}`} error={err(`positions.${i}.openings`)}>
                <input id={`pf-o${i}`} inputMode="numeric" value={String(x.openings)} onChange={(e) => setP(i, { openings: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={inputClass(!!err(`positions.${i}.openings`))} />
              </Field>
              <Field label={<>Closing date <span className="font-semibold text-muted">(optional)</span></>} htmlFor={`pf-d${i}`} error={err(`positions.${i}.closingDate`)}>
                <input id={`pf-d${i}`} type="date" value={x.closingDate ?? ""} onChange={(e) => setP(i, { closingDate: e.target.value || null })} className={inputClass(!!err(`positions.${i}.closingDate`))} />
              </Field>
            </div>
          </fieldset>
        ))}
        <datalist id="pf-commitments">
          {COMMITMENTS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {v.positions.length < 12 ? (
          <button
            type="button"
            onClick={() => {
              setV((x) => ({ ...x, positions: [...x.positions, blankPosition()] }));
              setSkills((s) => [...s, ""]);
            }}
            className="mx-auto flex h-10 items-center gap-1.5 rounded-full border border-maroon-200 px-4 text-sm font-bold text-maroon-700 hover:bg-maroon-100/40"
          >
            <PlusCircle className="size-4" aria-hidden />
            Add another position
          </button>
        ) : null}
      </Section>

      <Section n={3} title="Contact and how to apply" hint="Who coordinates responses. Members contact them directly.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Coordinators" htmlFor="pf-co" error={err("contact.coordinators")}>
            <input id="pf-co" value={v.contact.coordinators} onChange={(e) => setV({ ...v, contact: { ...v.contact, coordinators: e.target.value } })} placeholder="Grace & Emmanuel K." className={inputClass(!!err("contact.coordinators"))} />
          </Field>
          <Field label={<>Their role <span className="font-semibold text-muted">(optional)</span></>} htmlFor="pf-role">
            <input id="pf-role" value={v.contact.role} onChange={(e) => setV({ ...v, contact: { ...v.contact, role: e.target.value } })} placeholder="Project Coordinators · Media Ministry" className={inputClass()} />
          </Field>
          <Field label="Phone" htmlFor="pf-phone" error={err("contact.phone")} hint="A phone number or an email is needed.">
            <input id="pf-phone" type="tel" value={v.contact.phone} onChange={(e) => setV({ ...v, contact: { ...v.contact, phone: e.target.value } })} placeholder="(832) 555-0192" className={inputClass(!!err("contact.phone"))} />
          </Field>
          <Field label="Ministry email" htmlFor="pf-email" error={err("contact.email")}>
            <input id="pf-email" type="email" value={v.contact.email} onChange={(e) => setV({ ...v, contact: { ...v.contact, email: e.target.value } })} placeholder="media@example.org" className={inputClass(!!err("contact.email"))} />
          </Field>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-bold text-ink">
          <input type="checkbox" checked={v.contact.whatsapp} onChange={(e) => setV({ ...v, contact: { ...v.contact, whatsapp: e.target.checked } })} className="size-4.5 accent-maroon-700" />
          This number takes WhatsApp messages
        </label>
        <Field label={<>How to apply <span className="font-semibold text-muted">(optional)</span></>} htmlFor="pf-how">
          <input id="pf-how" value={v.contact.howToApply} onChange={(e) => setV({ ...v, contact: { ...v.contact, howToApply: e.target.value } })} placeholder="Send your details to Emmanuel on WhatsApp" className={inputClass()} />
        </Field>
      </Section>

      <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-3xl border border-white bg-white/95 p-3 shadow-card backdrop-blur sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={() => void leave()}>
          Cancel
        </Button>
        <Button variant="dark" icon={<Send className="size-4" />} onClick={() => void submit()} loading={create.isPending || update.isPending}>
          {existing ? "Save changes" : reviewer ? "Publish project" : "Submit for review"}
        </Button>
      </div>
    </motion.div>
  );
}
