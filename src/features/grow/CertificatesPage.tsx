import { Award, CircleCheck, Download, FileCheck2, Info, PenLine, RefreshCcw, RotateCcw, ShieldCheck, ShieldX } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { SignatureCapture } from "@/components/ui/SignatureCapture";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { Field, IconAction, inputClass, selectClass } from "@/features/admin/parts";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { useCertificates, useIssueCertificate, useReissueCertificate, useRevokeCertificate } from "./grow-queries";
import { downloadCertificatePdf, ScaledCertificate, type CertificateDraft } from "./certificate";
import { CERT_STATUS_LABEL, type Certificate, type ReadyRow } from "./grow-types";

/**
 * Certificates (Figma 136:28021 "Certificate Review"; PRD LMS-9): who is ready,
 * issued one at a time after reviewing the certificate, downloaded as a PDF,
 * and the permanent register.
 */

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");


export function CertificatesPage() {
  const q = useCertificates();
  const [course, setCourse] = useState("");
  const [open, setOpen] = useState<DialogState | null>(null);
  const [reissuing, setReissuing] = useState<Certificate | null>(null);
  const [revoking, setRevoking] = useState<Certificate | null>(null);
  const d = q.data;

  const courses = [...new Map((d?.ready ?? []).map((r) => [r.courseId, r.courseTitle])).entries()];
  const ready = (d?.ready ?? []).filter((r) => !course || r.courseId === course);

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-7">
      <PageHeader eyebrow="Grow" title="Certificates" tagline="Issued when the completion rules are met. Every issue is recorded." />
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}
      {!d ? (
        <Skeleton className="h-125 w-full rounded-3xl" />
      ) : (
        <>
          <section aria-labelledby="ready-h" className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="ready-h" className="flex items-center gap-2.5 font-display text-2xl font-semibold text-maroon-950">
                Ready to issue <Chip tone="gold">{d.ready.length}</Chip>
              </h2>
              <span className="flex flex-wrap items-center gap-3">
                {courses.length > 1 ? (
                  <label>
                    <span className="sr-only">Class</span>
                    <select value={course} onChange={(e) => setCourse(e.target.value)} className={cn(selectClass(!!course), "w-auto")}>
                      <option value="">Every class</option>
                      {courses.map(([id, t]) => (
                        <option key={id} value={id}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <span className="text-xs text-muted">Each one checked and issued on its own</span>
              </span>
            </header>
            {ready.length ? (
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-line/70">
                  {ready.map((r) => (
                    <li key={r.enrolmentId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink">{r.name}</span>
                          <Chip>{r.courseTitle}</Chip>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ok">
                          <span className="inline-flex items-center gap-1">
                            <CircleCheck className="size-4" aria-hidden />
                            Attended {r.attended} of {r.sessions}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileCheck2 className="size-4" aria-hidden />
                            {r.assessment}
                          </span>
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        {d.can.issue ? (
                          <Button size="sm" variant="dark" icon={<Award className="size-4" />} onClick={() => setOpen({ mode: "review", ready: r })}>
                            Issue certificate
                          </Button>
                        ) : (
                          <Button size="sm" variant="subtle" onClick={() => setOpen({ mode: "review", ready: r })}>
                            Preview
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card>
                <EmptyState icon={<Award />} title="Nobody is waiting for a certificate">
                  People show here once they meet their class's attendance and assessment rules.
                </EmptyState>
              </Card>
            )}
            {d.inProgress.length ? (
              <details className="rounded-3xl border border-white bg-white shadow-card">
                <summary className="cursor-pointer px-4 py-4 text-sm font-bold text-ink sm:px-6">
                  Still working towards it <span className="font-semibold text-muted">{d.inProgress.length}</span>
                </summary>
                <ul className="max-h-96 divide-y divide-line/70 overflow-y-auto border-t border-line/70">
                  {d.inProgress.map((r) => (
                    <li key={r.enrolmentId} className="px-4 py-3 text-sm sm:px-6">
                      <span className="font-bold text-ink">{r.name}</span> <span className="text-muted">· {r.courseTitle}</span>
                      <span className="block text-xs text-muted">{r.missing.join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          <section aria-labelledby="issued-h" className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="issued-h" className="font-display text-2xl font-semibold text-maroon-950">
                Issued <span className="text-sm font-semibold text-muted">Permanent register</span>
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-cream-200 px-3 py-1.5 text-xs text-muted">
                <Info className="size-3.5" aria-hidden />
                Reissue creates a new copy and keeps the old one. A reason is needed for the pastoral audit.
              </span>
            </header>
            <Card className="p-0 sm:p-0">
              {d.issued.length ? (
                <ul className="divide-y divide-line/70">
                  <li className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_8rem_8rem_9rem_6rem] gap-3 rounded-t-3xl bg-cream-100 px-6 py-3 text-xs font-extrabold tracking-[0.08em] text-muted uppercase lg:grid">
                    <span>Recipient</span>
                    <span>Pathway course</span>
                    <span>Issue date</span>
                    <span>Serial number</span>
                    <span>Status</span>
                    <span className="sr-only">Actions</span>
                  </li>
                  {d.issued.map((c) => (
                    <li key={c.id} className="grid gap-1 px-4 py-3.5 text-sm sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_8rem_8rem_9rem_6rem] lg:items-center lg:gap-3">
                      <span className="font-bold text-ink">{c.name}</span>
                      <span className="text-muted">{c.courseTitle}</span>
                      <span className="text-muted">{dayFmt.format(new Date(c.issuedAt))}</span>
                      <span className="font-mono text-xs text-ink">{c.serial}</span>
                      <span>
                        <Chip tone={c.status === "valid" ? "ok" : c.status === "revoked" ? "crit" : "neutral"}>{c.status === "replaced" ? `Replaced by ${c.replacedBy}` : CERT_STATUS_LABEL[c.status]}</Chip>
                      </span>
                      <span className="flex items-center gap-1 lg:justify-end">
                        <IconAction label={`View ${c.serial}`} icon={<Award />} onClick={() => setOpen({ mode: "view", cert: c })} />
                        {d.can.issue && c.status === "valid" ? (
                          <>
                            <IconAction label={`Reissue ${c.serial}`} icon={<RefreshCcw />} onClick={() => setReissuing(c)} />
                            <IconAction label={`Revoke ${c.serial}`} icon={<ShieldX />} tone="crit" onClick={() => setRevoking(c)} />
                          </>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Award />} title="No certificates issued yet" />
              )}
            </Card>
          </section>

          <Card className="flex items-start gap-4 bg-cream-100">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-100 text-gold-800" aria-hidden>
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold text-maroon-950">A permanent record</p>
              <p className="text-sm text-muted">
                Reissues and corrections are always logged, and nothing is deleted. A revoked certificate stays in the register, and its verify page says it was revoked.
              </p>
            </div>
          </Card>
        </>
      )}

      <CertificateDialog state={open} canIssue={!!d?.can.issue} onChange={setOpen} onClose={() => setOpen(null)} />
      <ReissueDialog cert={reissuing} onClose={() => setReissuing(null)} />
      <RevokeDialog cert={revoking} onClose={() => setRevoking(null)} />
    </motion.div>
  );
}

type DialogState = { mode: "review"; ready: ReadyRow } | { mode: "view"; cert: Certificate; justIssued?: boolean };
type Printed = { name: string; teacher: string; pastor: string };
type Signer = "teacher" | "pastor";
type Sigs = Record<Signer, string | null>;

/**
 * One dialog for the whole flow: review the certificate (correct how the
 * names print, add or change a signature for this one), issue it, then
 * download it as a PDF. Opened from the register,
 * it goes straight to the issued copy.
 */
function CertificateDialog({ state, canIssue, onChange, onClose }: { state: DialogState | null; canIssue: boolean; onChange: (s: DialogState) => void; onClose: () => void }) {
  const issue = useIssueCertificate();
  const toast = useToast();
  const page = useRef<HTMLDivElement>(null);
  const [printed, setPrinted] = useState<Printed>({ name: "", teacher: "", pastor: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Printed | "teacherSignature" | "pastorSignature", string>>>({});
  const [sigs, setSigs] = useState<Sigs>({ teacher: null, pastor: null });
  const [capturing, setCapturing] = useState<Signer | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Fresh fields each time someone new is opened for review.
  const ready = state?.mode === "review" ? state.ready : null;
  const original: Printed | null = ready ? { name: ready.name, teacher: ready.teacher ?? "", pastor: ready.pastor ?? "" } : null;
  const [seen, setSeen] = useState<string | null>(null);
  if (ready && original && seen !== ready.enrolmentId) {
    setSeen(ready.enrolmentId);
    setPrinted(original);
    setErrors({});
    setSigs({ teacher: ready.teacherSignature, pastor: ready.pastorSignature });
    setCapturing(null);
  }
  if (!state && seen) setSeen(null);

  const editable = !!ready && canIssue;
  const edited = !!original && (Object.keys(original) as (keyof Printed)[]).some((k) => printed[k].trim() !== original[k]);
  const cert = state?.mode === "view" ? state.cert : null;

  const draft: CertificateDraft | null = cert
    ? cert
    : ready
      ? {
          name: editable ? printed.name : ready.name,
          courseTitle: ready.courseTitle,
          step: ready.step,
          teacher: (editable ? printed.teacher : ready.teacher) || null,
          pastor: (editable ? printed.pastor : ready.pastor) || null,
          teacherSignature: editable ? sigs.teacher : ready.teacherSignature,
          pastorSignature: editable ? sigs.pastor : ready.pastorSignature,
          serial: null,
          issuedAt: null,
        }
      : null;

  const set = (k: keyof Printed) => (e: ChangeEvent<HTMLInputElement>) => {
    setPrinted((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submit = () => {
    if (!ready) return;
    const name = printed.name.trim();
    if (name.length < 2) return setErrors({ name: "Enter the name as it should print" });
    issue.mutate(
      {
        enrolmentId: ready.enrolmentId,
        name,
        teacher: printed.teacher.trim(),
        pastor: printed.pastor.trim(),
        // Only what differs from the saved signature is sent.
        ...(sigs.teacher !== ready.teacherSignature ? { teacherSignature: sigs.teacher } : {}),
        ...(sigs.pastor !== ready.pastorSignature ? { pastorSignature: sigs.pastor } : {}),
      },
      {
        onSuccess: (x) => {
          toast.show(`Issued ${x.certificate.serial} to ${x.certificate.name}`);
          onChange({ mode: "view", cert: x.certificate, justIssued: true });
        },
        onError: (e) =>
          e instanceof ApiError && e.fields
            ? setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, m]) => [k, m[0] ?? ""])))
            : toast.show(errText(e), { tone: "crit" }),
      },
    );
  };

  const download = async () => {
    if (!cert || !page.current) return;
    setDownloading(true);
    try {
      // Recorded before the file is made (audit: learn.certificate.export).
      await api.learn.logCertificatePrint(cert.id);
      await downloadCertificatePdf(page.current, `${cert.serial} ${cert.name}`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "The PDF couldn't be made. Please try again.", { tone: "crit" });
    } finally {
      setDownloading(false);
    }
  };

  const justIssued = state?.mode === "view" && !!state.justIssued;
  return (
    <Dialog
      open={!!state}
      onClose={onClose}
      subtitle={cert ? `${cert.serial} · ${CERT_STATUS_LABEL[cert.status]}` : editable ? "Review and issue" : "Preview"}
      title={draft?.name.trim() || ready?.name || ""}
      className="max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {editable ? <p className="text-xs text-muted sm:mr-auto">Issuing gives it a permanent ID. After that, a change needs a reissue.</p> : null}
          <Button variant="ghost" onClick={onClose} data-autofocus={justIssued ? undefined : true}>
            {cert ? "Close" : "Cancel"}
          </Button>
          {editable ? (
            <Button variant="dark" icon={<Award className="size-4" />} onClick={submit} loading={issue.isPending}>
              Issue certificate
            </Button>
          ) : null}
          {cert ? (
            <Button variant="dark" icon={<Download className="size-4" />} onClick={() => void download()} loading={downloading} data-autofocus={justIssued ? true : undefined}>
              Download PDF
            </Button>
          ) : null}
        </div>
      }
    >
      {draft ? (
        <div className="space-y-5">
          {justIssued && cert ? (
            <p className="flex items-center gap-2 rounded-xl bg-ok/10 px-4 py-3 text-sm font-semibold text-ok">
              <CircleCheck className="size-4 shrink-0" aria-hidden />
              Issued as {cert.serial}. It's in the register now, and its verify code works.
            </p>
          ) : null}
          {ready ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ok">
              <span className="inline-flex items-center gap-1">
                <CircleCheck className="size-4" aria-hidden />
                Attended {ready.attended} of {ready.sessions}
              </span>
              <span className="inline-flex items-center gap-1">
                <FileCheck2 className="size-4" aria-hidden />
                {ready.assessment}
              </span>
            </p>
          ) : null}
          {cert?.replaces ? (
            <p className="text-sm text-muted">
              Replaces {cert.replaces}: {cert.reason}
            </p>
          ) : null}
          {cert?.status === "revoked" ? <p className="text-sm font-bold text-crit">Revoked: {cert.reason}</p> : null}

          <ScaledCertificate c={draft} pageRef={page} />

          {editable && ready && original ? (
            <fieldset className="space-y-3">
              <legend className="mb-3 flex w-full items-center justify-between gap-3 text-sm font-bold text-ink">
                Check how it prints
                {edited ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPrinted(original);
                      setErrors({});
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-maroon-700 hover:underline"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    Use the names on record
                  </button>
                ) : null}
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Name" htmlFor="ci-name" error={errors.name} hint={printed.name.trim() !== ready.name ? `On record: ${ready.name}` : undefined}>
                  <input id="ci-name" value={printed.name} onChange={set("name")} maxLength={80} autoComplete="off" className={inputClass(!!errors.name)} />
                </Field>
                <Field label="Class teacher" htmlFor="ci-teacher" error={errors.teacher}>
                  <input id="ci-teacher" value={printed.teacher} onChange={set("teacher")} maxLength={80} autoComplete="off" placeholder="The class teacher" className={inputClass(!!errors.teacher)} />
                </Field>
                <Field label="Parish pastor" htmlFor="ci-pastor" error={errors.pastor}>
                  <input id="ci-pastor" value={printed.pastor} onChange={set("pastor")} maxLength={80} autoComplete="off" placeholder="The parish pastor" className={inputClass(!!errors.pastor)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <span className="hidden sm:block" aria-hidden />
                {(["teacher", "pastor"] as const).map((k) => (
                  <SignatureSlot
                    key={k}
                    label={k === "teacher" ? "Teacher's signature" : "Pastor's signature"}
                    value={sigs[k]}
                    saved={k === "teacher" ? ready.teacherSignature : ready.pastorSignature}
                    error={errors[k === "teacher" ? "teacherSignature" : "pastorSignature"]}
                    active={capturing === k}
                    onAdd={() => setCapturing(k)}
                    onChange={(v) => {
                      setSigs((x) => ({ ...x, [k]: v }));
                      setErrors((x) => ({ ...x, [k === "teacher" ? "teacherSignature" : "pastorSignature"]: undefined }));
                    }}
                  />
                ))}
              </div>
              {capturing ? (
                <SignatureCapture
                  key={capturing}
                  saveLabel={`Use on this certificate`}
                  onCancel={() => setCapturing(null)}
                  onSave={(png) => {
                    setSigs((x) => ({ ...x, [capturing]: png }));
                    setErrors((x) => ({ ...x, [capturing === "teacher" ? "teacherSignature" : "pastorSignature"]: undefined }));
                    setCapturing(null);
                  }}
                />
              ) : null}
              <p className="text-xs text-muted">
                The class and pathway step come from the class itself. A signature added here is for this certificate only; people save their own on My signature. Any change is kept in the audit log.
              </p>
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** One signer's signature on the review step: the saved one, one added for this certificate, or none. */
function SignatureSlot({
  label,
  value,
  saved,
  error,
  active,
  onAdd,
  onChange,
}: {
  label: string;
  value: string | null;
  saved: string | null;
  error?: string;
  active: boolean;
  onAdd: () => void;
  onChange: (v: string | null) => void;
}) {
  const state = !value ? "No signature" : value === saved ? "Their saved signature" : "Added for this certificate";
  const link = "text-xs font-bold text-maroon-700 hover:underline";
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-ink">{label}</p>
      <div className={cn("flex items-center gap-3 rounded-xl border bg-white p-2", error ? "border-crit" : active ? "border-gold-500" : "border-line")}>
        <span className="grid h-10 w-24 shrink-0 place-items-center rounded-lg bg-cream-50">
          {value ? <img src={value} alt="" className="max-h-9 max-w-22 object-contain" /> : <PenLine className="size-4 text-muted" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-muted">{state}</span>
          <span className="flex flex-wrap gap-x-3">
            <button type="button" onClick={onAdd} className={link}>
              {value ? "Change" : "Add"}
            </button>
            {value ? (
              <button type="button" onClick={() => onChange(null)} className={link}>
                Remove
              </button>
            ) : null}
            {saved && value !== saved ? (
              <button type="button" onClick={() => onChange(saved)} className={link}>
                Use saved
              </button>
            ) : null}
          </span>
        </span>
      </div>
      {error ? <p className="mt-1 text-xs font-semibold text-crit">{error}</p> : null}
    </div>
  );
}

function ReissueDialog({ cert, onClose }: { cert: Certificate | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const reissue = useReissueCertificate();
  const toast = useToast();
  const [seen, setSeen] = useState<string | null>(null);
  if (cert && seen !== cert.id) {
    setSeen(cert.id);
    setName(cert.name);
    setReason("");
    setFields({});
  }
  const submit = () => {
    if (!cert) return;
    if (reason.trim().length < 5) return setFields({ reason: "Say why, for the pastoral audit" });
    reissue.mutate(
      { id: cert.id, reason: reason.trim(), name: name.trim() },
      {
        onSuccess: (r) => {
          toast.show(`Reissued as ${r.certificate.serial}. ${cert.serial} is kept as replaced.`);
          onClose();
        },
        onError: (e) => setFields(e instanceof ApiError && e.fields ? Object.fromEntries(Object.entries(e.fields).map(([k, m]) => [k, m[0] ?? ""])) : { reason: errText(e) }),
      },
    );
  };
  return (
    <Dialog
      open={!!cert}
      onClose={onClose}
      subtitle="Reissue a certificate"
      title={cert ? `${cert.serial} · ${cert.courseTitle}` : ""}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button onClick={submit} loading={reissue.isPending}>
            Reissue with a new ID
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">A new copy gets a new ID. The old one stays in the register, marked as replaced.</p>
      <div className="space-y-4">
        <Field label="Name as it should print" htmlFor="ri-name" error={fields.name}>
          <input id="ri-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass(!!fields.name)} />
        </Field>
        <Field label="Reason" htmlFor="ri-reason" error={fields.reason} hint="Kept with the certificate and in the audit log.">
          <input id="ri-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Name was misspelled" className={inputClass(!!fields.reason)} />
        </Field>
      </div>
    </Dialog>
  );
}

function RevokeDialog({ cert, onClose }: { cert: Certificate | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const revoke = useRevokeCertificate();
  const toast = useToast();
  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };
  const submit = () => {
    if (!cert) return;
    if (reason.trim().length < 5) return setError("Say why, for the pastoral audit");
    revoke.mutate(
      { id: cert.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.show(`${cert.serial} revoked`);
          close();
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };
  return (
    <Dialog
      open={!!cert}
      onClose={close}
      subtitle="Revoke a certificate"
      title={cert ? `${cert.name} · ${cert.serial}` : ""}
      className="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={revoke.isPending}>
            Revoke certificate
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Anyone who checks {cert?.serial} will see it was revoked. {cert?.name} no longer counts as having finished {cert?.courseTitle}. The record stays in the register and can't be undone; issue a new one if it was a mistake.
      </p>
      <Field label="Reason" htmlFor="rv-why" error={error ?? undefined} hint="Kept with the certificate and in the audit log.">
        <input id="rv-why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Issued to the wrong person" className={inputClass(!!error)} />
      </Field>
    </Dialog>
  );
}

