import {
  hasMeetings,
  PATHWAY,
  type Certificate,
  type CertificateCheck,
  type CertificatesResponse,
  type DropOffPeriod,
  type DropOffReport,
  type GrowOverview,
  type InProgressRow,
  type ReadyRow,
} from "@/features/grow/grow-types";
import { churchDate } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { activeEnrolments, allowed, canManage, canSee, DAY, findCourse, FORBIDDEN, no, ok, person, seesAll, sessionsOf, staffPerson } from "./grow-core";
import { attendedCount } from "./grow-teaching";
import { checkSignature } from "./signatures";
import type { CertificateRecord, CourseRecord, EnrolmentRecord } from "./seed/grow";
import type { StaffRecord } from "./seed/staff";

/**
 * M8 step 4 (docs/API.md §16): certificates (Figma 136:28021 "Certificate
 * Review"; PRD LMS-9, G-12) and the drop-off report (Figma 136:28729).
 */

const VERIFY_BASE = "https://hub.tkp.example/verify/";
const PASTOR_ROLE = "lead_pastor";

/* ========================================================== completion */

/** What a person still needs for the class's certificate (Figma Create a class §4 "Completion rules"). */
export function readiness(c: CourseRecord, e: EnrolmentRecord): { ready: boolean; attended: number; missing: string[]; assessment: string } {
  const attended = attendedCount(e);
  const missing: string[] = [];
  const need = c.completion.attendance;
  if (attended < need) missing.push(`${hasMeetings(c.format) ? "Attend or watch" : "Open"} ${need - attended} more ${need - attended === 1 ? "session" : "sessions"}`);
  let assessment = "No assessment needed";
  const rule = c.completion.assessment;
  if (rule !== "none") {
    const all = db.learnAssessments.filter((a) => a.courseId === c.id && a.state === "published");
    const needed = rule === "final" ? all.filter((a) => a.final) : all;
    if (!needed.length) missing.push(rule === "final" ? "The class has no final assessment yet" : "The class has no assessment yet");
    const labels: string[] = [];
    for (const a of needed) {
      const sub = db.learnSubmissions.find((s) => s.assessmentId === a.id && s.enrolmentId === e.id);
      const excused = db.learnExcusals.find((x) => x.assessmentId === a.id && x.enrolmentId === e.id);
      if (excused) labels.push(`Excused from ${a.title}`);
      else if (sub?.state === "returned" && sub.outcome === "passed") labels.push(`${a.title} passed`);
      else if (sub?.state === "returned" && sub.outcome === "follow_up") missing.push(`${a.title}: a pastor is following up`);
      else if (sub) missing.push(`${a.title}: waiting for review`);
      else missing.push(`Answer ${a.title}`);
    }
    if (labels.length) assessment = needed.length > 1 && labels.every((l) => l.endsWith("passed")) ? "Assessments passed" : labels.join(" · ");
  }
  return { ready: !missing.length, attended, missing, assessment };
}

const validCert = (enrolmentId: string) => db.learnCertificates.find((x) => x.enrolmentId === enrolmentId && x.status === "valid");

function toCertificate(x: CertificateRecord): Certificate {
  return {
    id: x.id,
    serial: x.serial,
    name: x.name,
    courseId: x.courseId,
    courseTitle: x.courseTitle,
    step: x.step,
    teacher: x.teacher,
    pastor: x.pastor,
    teacherSignature: x.teacherSignature ?? null,
    pastorSignature: x.pastorSignature ?? null,
    issuedAt: x.issuedAt,
    issuedBy: x.issuedById ? staffPerson(x.issuedById).name : null,
    status: x.status,
    replaces: x.replaces,
    replacedBy: x.replacedBy,
    reason: x.reason,
    verifyUrl: VERIFY_BASE + x.serial,
  };
}

/** Classes whose certificates are being worked out: published, and either finished or meeting the rules mid-way. */
const certifiable = (u: StaffRecord) => db.learnCourses.filter((c) => c.state !== "draft" && canSee(u, c));

export function readyFor(u: StaffRecord) {
  const ready: ReadyRow[] = [];
  const inProgress: InProgressRow[] = [];
  for (const c of certifiable(u)) {
    const sessions = sessionsOf(c.id).length;
    for (const e of activeEnrolments(c.id)) {
      if (validCert(e.id)) continue;
      const r = readiness(c, e);
      const name = person(e.personId)!.name;
      if (r.ready)
        ready.push({
          enrolmentId: e.id,
          name,
          courseId: c.id,
          courseTitle: c.title,
          attended: r.attended,
          needed: c.completion.attendance,
          sessions,
          assessment: r.assessment,
          step: c.step,
          teacher: c.teacherIds.map((id) => staffPerson(id).name).join(", ") || null,
          pastor: pastorName(),
          teacherSignature: teacherSignature(c),
          pastorSignature: pastorSignature(),
        });
      else inProgress.push({ enrolmentId: e.id, name, courseId: c.id, courseTitle: c.title, missing: r.missing });
    }
  }
  return { ready: ready.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle) || a.name.localeCompare(b.name)), inProgress };
}

export function listCertificates(u: StaffRecord): Result<CertificatesResponse> {
  if (!allowed(u, "learn.view")) return no(403, "FORBIDDEN", FORBIDDEN);
  const { ready, inProgress } = readyFor(u);
  const issued = db.learnCertificates
    .filter((x) => {
      const c = x.courseId ? findCourse(x.courseId) : null;
      return c ? canSee(u, c) : seesAll(u);
    })
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.serial.localeCompare(a.serial))
    .map(toCertificate);
  return ok({ ready, inProgress, issued, can: { issue: canManage(u) } });
}

/** Serials run per year: TKP-2026-089 (Figma). */
function nextSerial(now: number) {
  const year = churchDate(new Date(now)).slice(0, 4);
  const used = db.learnCertificates.filter((x) => x.serial.startsWith(`TKP-${year}-`)).map((x) => Number(x.serial.slice(9)));
  return `TKP-${year}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}
const pastor = () => db.staff.find((s) => s.isActive && s.roles.includes(PASTOR_ROLE));
const pastorName = () => pastor()?.fullName ?? null;
const pastorSignature = () => pastor()?.signature ?? null;
/** With several teachers on a class, no one person's signature stands for them all. */
const teacherSignature = (c: CourseRecord) => (c.teacherIds.length === 1 ? (db.staff.find((s) => s.id === c.teacherIds[0])?.signature ?? null) : null);

function addStep(personId: string, step: number | null, at: string) {
  const p = person(personId);
  if (!p || step === null || p.completedSteps.includes(step)) return;
  p.completedSteps = [...p.completedSteps, step].sort((a, b) => a - b);
  if (!p.history.some((h) => h.step === step)) p.history.push({ step, at });
}

/** What the Registrar can correct on the preview before issuing: how the names print. Blank means the default. */
export type IssueEdits = {
  name?: string;
  teacher?: string;
  pastor?: string;
  /** Missing: the saved signature. null: none. An image: this one, for this certificate only. */
  teacherSignature?: string | null;
  pastorSignature?: string | null;
};

export function issueCertificate(u: StaffRecord, enrolmentId: string, body: IssueEdits = {}, now = Date.now()): Result<{ certificate: Certificate }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", "Only the Registrar issues certificates.");
  const e = db.learnEnrolments.find((x) => x.id === enrolmentId);
  const c = e && findCourse(e.courseId);
  if (!e || !c) return no(404, "NOT_FOUND", "They're no longer on this class.");
  if (validCert(e.id)) return no(422, "ALREADY_ISSUED", "Their certificate is already issued.");
  if (e.status !== "enrolled" && e.status !== "completed") return no(422, "NOT_READY", "They're not on this class any more.");
  const r = readiness(c, e);
  if (!r.ready) return no(422, "NOT_READY", `Not ready yet: ${r.missing.join("; ")}.`);
  const p = person(e.personId)!;
  const defaults = { name: p.name, teacher: c.teacherIds.map((id) => staffPerson(id).name).join(", ") || null, pastor: pastorName() };
  const pick = (v: string | undefined, fallback: string | null) => (v === undefined || !v.trim() ? fallback : v.trim().replace(/\s+/g, " "));
  const printed = { name: pick(body.name, defaults.name)!, teacher: pick(body.teacher, defaults.teacher), pastor: pick(body.pastor, defaults.pastor) };
  const bad: Record<string, string[]> = {};
  if (printed.name.length < 2 || printed.name.length > 80) bad.name = ["Enter the name as it should print"];
  if ((printed.teacher?.length ?? 0) > 80) bad.teacher = ["Keep it under 80 characters"];
  if ((printed.pastor?.length ?? 0) > 80) bad.pastor = ["Keep it under 80 characters"];
  const saved = { teacherSignature: teacherSignature(c), pastorSignature: pastorSignature() };
  const signatures = { teacherSignature: saved.teacherSignature, pastorSignature: saved.pastorSignature };
  const how: Record<string, "saved" | "added" | "none"> = {};
  for (const k of ["teacherSignature", "pastorSignature"] as const) {
    const v = body[k];
    if (v !== undefined && v !== saved[k]) {
      const problem = v === null ? null : checkSignature(v);
      if (problem) bad[k] = [problem];
      else signatures[k] = v;
    }
    how[k === "teacherSignature" ? "teacher" : "pastor"] = !signatures[k] ? "none" : signatures[k] === saved[k] ? "saved" : "added";
  }
  if (Object.keys(bad).length) return no(422, "VALIDATION_FAILED", "Check the certificate details.", bad);
  const at = new Date(now).toISOString();
  const x: CertificateRecord = {
    id: `cert-${crypto.randomUUID().slice(0, 8)}`,
    serial: nextSerial(now),
    personId: p.id,
    enrolmentId: e.id,
    name: printed.name,
    courseId: c.id,
    courseTitle: c.title,
    step: c.step,
    teacher: printed.teacher,
    pastor: printed.pastor,
    ...signatures,
    issuedAt: at,
    issuedById: u.id,
    status: "valid",
    replaces: null,
    replacedBy: null,
    reason: null,
  };
  db.learnCertificates.unshift(x);
  e.status = "completed";
  addStep(p.id, c.step, at);
  // Corrections made on the preview are kept in the audit, against the record's own values.
  const edited = (["name", "teacher", "pastor"] as const).filter((k) => printed[k] !== defaults[k]);
  audit(u.id, "learn.certificate.issue", c.id, {
    ...(edited.length ? { before: Object.fromEntries(edited.map((k) => [k, defaults[k]])) } : {}),
    after: { person: p.name, serial: x.serial, ...Object.fromEntries(edited.map((k) => [k, printed[k]])), signatures: how },
  });
  return ok({ certificate: toCertificate(x) }, 201);
}

const findCert = (id: string) => db.learnCertificates.find((x) => x.id === id);

/** Figma: "Reissue creates a new copy and keeps the old one. Reason required for pastoral audit." */
export function reissueCertificate(u: StaffRecord, id: string, body: { reason?: string; name?: string }, now = Date.now()): Result<{ certificate: Certificate }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", "Only the Registrar reissues certificates.");
  const old = findCert(id);
  if (!old) return no(404, "NOT_FOUND", "That certificate doesn't exist.");
  if (old.status !== "valid") return no(422, "NOT_VALID", old.status === "revoked" ? "It was revoked, so it can't be reissued." : "It was already replaced. Reissue the newer one.");
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 5) return no(422, "VALIDATION_FAILED", "Say why it's being reissued.", { reason: ["Say why, for the pastoral audit"] });
  const name = String(body.name ?? old.name).trim();
  if (name.length < 2 || name.length > 80) return no(422, "VALIDATION_FAILED", "Check the name.", { name: ["Enter the name as it should print"] });
  const x: CertificateRecord = { ...old, id: `cert-${crypto.randomUUID().slice(0, 8)}`, serial: nextSerial(now), name, issuedAt: new Date(now).toISOString(), issuedById: u.id, replaces: old.serial, replacedBy: null, reason };
  old.status = "replaced";
  old.replacedBy = x.serial;
  db.learnCertificates.unshift(x);
  audit(u.id, "learn.certificate.reissue", old.courseId, { before: { serial: old.serial, name: old.name }, after: { serial: x.serial, name, reason } });
  return ok({ certificate: toCertificate(x) }, 201);
}

/** PRD LMS-9: certificates can be revoked; the verify page then says so. The record stays. */
export function revokeCertificate(u: StaffRecord, id: string, body: { reason?: string }): Result<{ certificate: Certificate }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", "Only the Registrar revokes certificates.");
  const x = findCert(id);
  if (!x) return no(404, "NOT_FOUND", "That certificate doesn't exist.");
  if (x.status !== "valid") return no(422, "NOT_VALID", "Only a valid certificate can be revoked.");
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 5) return no(422, "VALIDATION_FAILED", "Say why it's being revoked.", { reason: ["Say why, for the pastoral audit"] });
  x.status = "revoked";
  x.reason = reason;
  const e = x.enrolmentId ? db.learnEnrolments.find((y) => y.id === x.enrolmentId) : undefined;
  if (e?.status === "completed") e.status = "enrolled";
  // The step stays finished only if another valid certificate covers it.
  const p = person(x.personId);
  if (p && x.step !== null && !db.learnCertificates.some((y) => y.personId === p.id && y.step === x.step && y.status === "valid")) p.completedSteps = p.completedSteps.filter((s) => s !== x.step);
  audit(u.id, "learn.certificate.revoke", x.courseId, { before: { serial: x.serial, status: "valid" }, after: { status: "revoked", reason } });
  return ok({ certificate: toCertificate(x) });
}

/** Public verify (PRD G-12): name, course, date and status only. No sign-in. */
export function verifyCertificate(serial: string): CertificateCheck {
  const x = db.learnCertificates.find((y) => y.serial.toUpperCase() === serial.trim().toUpperCase());
  if (!x) return { serial, status: "unknown" };
  return { serial: x.serial, name: x.name, course: x.courseTitle, issuedOn: churchDate(x.issuedAt), status: x.status };
}

export function logCertificatePrint(u: StaffRecord, id: string): Result<{ logged: true }> {
  const x = findCert(id);
  if (!x) return no(404, "NOT_FOUND", "That certificate doesn't exist.");
  const c = x.courseId ? findCourse(x.courseId) : null;
  if (c ? !canSee(u, c) : !seesAll(u)) return no(404, "NOT_FOUND", "That certificate doesn't exist.");
  audit(u.id, "learn.certificate.export", x.courseId, { after: { serial: x.serial, person: x.name } });
  return ok({ logged: true });
}

/* ========================================================== drop-off */

const STALL_DAYS = 21;
const stepAfter = (step: number) => PATHWAY.find((p) => p.step === step + 1)?.label ?? "the next step";

/** People in classes still running who haven't joined or watched anything in three weeks (Figma dashboard). */
export function stalled(u: StaffRecord, now = Date.now()) {
  const out: { courseId: string; courseTitle: string; names: string[] }[] = [];
  for (const c of db.learnCourses.filter((x) => x.state === "published" && canSee(u, x) && hasMeetings(x.format))) {
    const recent = sessionsOf(c.id).filter((s) => s.startsAt && Date.parse(s.startsAt) < now && Date.parse(s.startsAt) > now - STALL_DAYS * DAY);
    const older = sessionsOf(c.id).filter((s) => s.startsAt && Date.parse(s.startsAt) < now).length;
    if (recent.length < 2 || older === sessionsOf(c.id).length) continue; // too new, or finished
    const names = activeEnrolments(c.id)
      .filter((e) => recent.every((s) => !db.learnLogs.some((l) => l.sessionId === s.id && l.enrolmentId === e.id && (l.kind === "live" || (l.kind === "recording" && l.percent >= 80)))))
      .map((e) => person(e.personId)!.name);
    if (names.length) out.push({ courseId: c.id, courseTitle: c.title, names });
  }
  return out;
}

export function dropOff(u: StaffRecord, period: DropOffPeriod = "12m", now = Date.now()): Result<DropOffReport> {
  if (!allowed(u, "learn.all")) return no(403, "FORBIDDEN", FORBIDDEN);
  const p = (["12m", "year", "all"] as const).includes(period) ? period : "12m";
  const from = p === "12m" ? now - 365 * DAY : p === "year" ? Date.parse(`${churchDate(new Date(now)).slice(0, 4)}-01-01T06:00:00Z`) : null;
  const inPeriod = (at: string) => from === null || Date.parse(at) >= from;

  // Who started each step: finished steps (history) and current enrolments.
  const started = new Map<number, Set<string>>();
  const add = (step: number, id: string) => (started.get(step) ?? started.set(step, new Set()).get(step)!).add(id);
  const startedAny = new Map<number, Set<string>>();
  const addAny = (step: number, id: string) => (startedAny.get(step) ?? startedAny.set(step, new Set()).get(step)!).add(id);
  for (const person of db.learnPeople) {
    for (const h of person.history) {
      addAny(h.step, person.id);
      if (inPeriod(h.at)) add(h.step, person.id);
    }
  }
  for (const e of db.learnEnrolments) {
    const c = findCourse(e.courseId);
    if (!c?.step || e.status === "waitlisted") continue;
    addAny(c.step, e.personId);
    if (inPeriod(e.enrolledAt)) add(c.step, e.personId);
  }

  const steps = PATHWAY.map(({ step, label }) => {
    const s = started.get(step) ?? new Set<string>();
    const next = startedAny.get(step + 1);
    // A step whose next step nobody has ever started (not offered yet) has no drop to measure.
    const movedOn = step < PATHWAY.length && next?.size ? [...s].filter((id) => next.has(id)).length : null;
    // PL-1: groups under five are never shown alone.
    const hidden = s.size > 0 && s.size < 5;
    return {
      step,
      label,
      nextOffered: step < PATHWAY.length && !!next?.size,
      started: hidden ? 0 : s.size,
      movedOn: hidden ? null : movedOn,
      rate: hidden || movedOn === null || !s.size ? null : Math.round((movedOn / s.size) * 100),
      hidden,
    };
  });
  const tracked = new Set([...started.values()].flatMap((s) => [...s])).size;
  const worst = steps.filter((s) => s.rate !== null && s.started >= 5).sort((a, b) => a.rate! - b.rate!)[0];
  const insight = worst ? { from: worst.label, to: stepAfter(worst.step), movedOn: worst.movedOn!, started: worst.started } : null;

  // Recommended contact lists: finished a step lately and not started the next; and people who've gone quiet.
  const followUps: DropOffReport["followUps"] = [];
  const canCopy = allowed(u, "learn.export");
  for (const { step, label } of PATHWAY.slice(1, -1)) {
    const names = db.learnPeople
      .filter((person) => {
        const h = person.history.find((x) => x.step === step);
        return h && Date.parse(h.at) > now - 120 * DAY && !startedAny.get(step + 1)?.has(person.id);
      })
      .map((person) => person.name);
    if (names.length) followUps.push({ id: `finished-${step}`, title: `${names.length} ${names.length === 1 ? "person" : "people"} finished ${label} but haven't started ${stepAfter(step)}`, detail: "Finished in the last four months.", count: names.length, names: canCopy ? names : [] });
  }
  followUps.sort((a, b) => b.count - a.count).splice(2);
  for (const s of stalled(u, now))
    followUps.push({ id: `stalled-${s.courseId}`, title: `${s.names.length} ${s.names.length === 1 ? "person hasn't" : "people haven't"} joined ${s.courseTitle} in three weeks`, detail: "No live join or recording watched in the last 21 days.", count: s.names.length, names: canCopy ? s.names : [] });

  return ok({ period: p, from, tracked, steps, insight, followUps, can: { copy: canCopy } });
}

export function logDropOffCopy(u: StaffRecord, listId: string): Result<{ logged: true }> {
  if (!allowed(u, "learn.all") || !allowed(u, "learn.export")) return no(403, "FORBIDDEN", FORBIDDEN);
  audit(u.id, "learn.dropoff.export", null, { after: { list: listId } });
  return ok({ logged: true });
}

/* ========================================================== dashboard */

export function certificateAttention(u: StaffRecord, now = Date.now()): { items: GrowOverview["attention"]; awaiting: number } {
  const { ready } = readyFor(u);
  const items: GrowOverview["attention"] = [];
  const byCourse = new Map<string, ReadyRow[]>();
  for (const r of ready) byCourse.set(r.courseId, [...(byCourse.get(r.courseId) ?? []), r]);
  for (const [courseId, rows] of byCourse) {
    const c = findCourse(courseId)!;
    const r = rows[0]!;
    items.push({
      id: `cert-${courseId}`,
      kind: "certificates",
      title: `${rows.length} ${rows.length === 1 ? "person" : "people"} finished ${c.title}: certificates ready to issue`,
      detail: `Requirements met: ${r.needed} of ${r.sessions} sessions${c.completion.assessment !== "none" ? ` and ${c.completion.assessment === "final" ? "the final assessment" : "every assessment"}` : ""}.`,
      courseId,
      to: "/grow/certificates",
      action: canManage(u) ? "Review and issue" : "See who",
    });
  }
  if (allowed(u, "learn.all")) {
    const quiet = stalled(u, now);
    const n = quiet.reduce((k, s) => k + s.names.length, 0);
    if (n)
      items.push({
        id: "stalled",
        kind: "stalled",
        title: `${n} ${n === 1 ? "person hasn't" : "people haven't"} joined any session in 3 weeks`,
        detail: `A gentle pastoral check-in is recommended, across ${quiet.map((s) => s.courseTitle).join(" and ")}.`,
        courseId: quiet[0]!.courseId,
        to: "/grow/drop-off",
        action: "See the list",
      });
  }
  return { items, awaiting: ready.length };
}
