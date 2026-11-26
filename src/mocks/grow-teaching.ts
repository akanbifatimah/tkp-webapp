import {
  GRACE_DAYS,
  hasMeetings,
  type Assessment,
  type AssessmentInput,
  type AssessmentStatus,
  type AttendanceInput,
  type AttendanceRow,
  type AttendanceSheet,
  type GrowOverview,
  type Mark,
  type Question,
  type Session,
  type SessionDetail,
} from "@/features/grow/grow-types";
import { formatTime, formatWhen } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { activeEnrolments, canAuthor, canManage, canSee, DAY, findCourse, findSession, FORBIDDEN, no, NOT_FOUND, ok, person, sessionsOf, staffPerson } from "./grow-core";
import { suggestFrom, type AssessmentRecord, type CourseRecord, type EnrolmentRecord, type JoinLog, type SessionRecord } from "./seed/grow";
import type { StaffRecord } from "./seed/staff";

/**
 * M8 step 2 (docs/API.md §14): attendance (Figma 135:24429 "Mark attendance"),
 * the session page (136:26483) and the assessment builder (135:23449).
 */

const NO_SESSION = "That session no longer exists.";
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });

/* ============================================================ attendance */

export const sessionEnd = (c: CourseRecord, s: SessionRecord) => (s.startsAt ? Date.parse(s.startsAt) + c.schedule.lengthMin * 60_000 : null);
export const graceEnd = (c: CourseRecord, s: SessionRecord) => {
  const end = sessionEnd(c, s);
  return end === null ? null : end + GRACE_DAYS * DAY;
};
const logOf = (sessionId: string, enrolmentId: string): JoinLog | undefined => {
  const all = db.learnLogs.filter((l) => l.sessionId === sessionId && l.enrolmentId === enrolmentId);
  return all.find((l) => l.kind === "live") ?? all.sort((a, b) => (b.kind === "recording" ? b.percent : 0) - (a.kind === "recording" ? a.percent : 0))[0];
};
const recordOf = (sessionId: string) => db.learnAttendance.find((r) => r.sessionId === sessionId);
/** Attendance can be taken for a live session once it has started. */
const takesAttendance = (c: CourseRecord, s: SessionRecord, now: number) => hasMeetings(c.format) && s.kind === "live" && !!s.startsAt && Date.parse(s.startsAt) <= now;
const roster = (c: CourseRecord) => activeEnrolments(c.id);

function describe(log: JoinLog | undefined, c: CourseRecord, s: SessionRecord): { log: string; flag: string | null } {
  if (!log) return { log: "No log detected", flag: null };
  if (log.kind === "recording") return { log: `Watched the recording ${dayFmt.format(new Date(log.at))} (${log.percent}% completed)`, flag: null };
  const late = Math.round((Date.parse(log.at) - Date.parse(s.startsAt!)) / 60_000);
  const len = c.schedule.lengthMin;
  if (log.minutes < len / 2) return { log: `Joined ${formatTime(log.at)} · ${log.minutes} min`, flag: `Joined for only ${log.minutes} of ${len} minutes. Connection problems, perhaps: check with them.` };
  if (late > 5) return { log: `Joined ${late} minutes late · ${log.minutes} min`, flag: null };
  return { log: `Joined ${formatTime(log.at)} · ${log.minutes >= len - 5 ? `full duration (${log.minutes} min)` : `${log.minutes} min`}`, flag: null };
}

/**
 * The mark that counts. Someone saved as Missed who watches at least 80% of the
 * recording within the grace period counts as Recording automatically.
 */
function effective(c: CourseRecord, s: SessionRecord, e: EnrolmentRecord): { mark: Mark | null; auto: boolean } {
  const saved = recordOf(s.id)?.marks[e.id] ?? null;
  if (saved !== "missed") return { mark: saved, auto: false };
  const log = logOf(s.id, e.id);
  const until = graceEnd(c, s);
  if (log?.kind === "recording" && log.percent >= 80 && until !== null && Date.parse(log.at) <= until) return { mark: "recording", auto: true };
  return { mark: "missed", auto: false };
}

/** For a session row and the dashboard. */
export function attendanceSummary(c: CourseRecord, s: SessionRecord, now = Date.now()): Session["attendance"] {
  if (!takesAttendance(c, s, now)) return null;
  const rec = recordOf(s.id);
  const people = roster(c);
  const marks = people.map((e) => effective(c, s, e).mark).filter((m): m is Mark => !!m);
  const rate = rec && marks.length ? Math.round((marks.filter((m) => m !== "missed").length / marks.length) * 100) : null;
  const ended = (sessionEnd(c, s) ?? 0) < now;
  return { state: rec?.state ?? "not_started", rate, due: ended && rec?.state !== "saved" && now < (graceEnd(c, s) ?? 0) };
}

/** Sessions someone is marked Joined or Recording for (the completion rule). */
export function attendedCount(e: EnrolmentRecord): number {
  const c = findCourse(e.courseId);
  if (!c) return 0;
  return sessionsOf(c.id).filter((s) => {
    const m = effective(c, s, e).mark;
    return m === "joined" || m === "recording";
  }).length;
}

export function getAttendance(u: StaffRecord, sessionId: string, now = Date.now()): Result<AttendanceSheet> {
  const s = findSession(sessionId);
  const c = s && findCourse(s.courseId);
  if (!s || !c || !canSee(u, c)) return no(404, "NOT_FOUND", NO_SESSION);
  if (!takesAttendance(c, s, now)) return no(422, "NOT_STARTED", "Attendance opens when the session starts.");
  const rec = recordOf(s.id);
  const grace = graceEnd(c, s)!;
  const locked = now > grace;
  const rows: AttendanceRow[] = roster(c)
    .map((e) => {
      const log = logOf(s.id, e.id);
      const { mark, auto } = effective(c, s, e);
      return { enrolmentId: e.id, name: person(e.personId)!.name, mark, suggested: suggestFrom(log), ...describe(log, c, s), auto };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return ok({
    sessionId: s.id,
    courseId: c.id,
    courseTitle: c.title,
    sessionTitle: s.title,
    number: s.number,
    startsAt: s.startsAt!,
    lengthMin: c.schedule.lengthMin,
    state: rec?.state ?? "not_started",
    savedAt: rec?.savedAt ?? null,
    savedBy: rec?.savedById ? staffPerson(rec.savedById).name : null,
    graceEndsAt: new Date(grace).toISOString(),
    locked,
    rows,
    can: { edit: canAuthor(u, c) && c.state !== "archived" && (!locked || canManage(u)), override: locked && canManage(u) },
    rowVer: rec?.rowVer ?? 0,
  });
}

export function saveAttendance(u: StaffRecord, sessionId: string, body: Partial<AttendanceInput>, now = Date.now()): Result<AttendanceSheet> {
  const s = findSession(sessionId);
  const c = s && findCourse(s.courseId);
  if (!s || !c || !canSee(u, c)) return no(404, "NOT_FOUND", NO_SESSION);
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  if (!takesAttendance(c, s, now)) return no(422, "NOT_STARTED", "Attendance opens when the session starts.");
  const rec = recordOf(s.id);
  if ((body.rowVer ?? -1) !== (rec?.rowVer ?? 0)) return no(409, "CONFLICT", "Someone else saved this attendance while you were working. Reload to see their marks, then try again.");
  const grace = graceEnd(c, s)!;
  const reason = String(body.reason ?? "").trim();
  if (now > grace) {
    if (!canManage(u)) return no(422, "LOCKED", `The grace period ended ${formatWhen(new Date(grace))}. Ask the Registrar to change a mark.`);
    if (reason.length < 5) return no(422, "VALIDATION_FAILED", "Say why the attendance is changing after the grace period.", { reason: ["Say why it's changing"] });
  }
  const people = roster(c);
  const ids = new Set(people.map((e) => e.id));
  const incoming = body.marks ?? {};
  const marks: Record<string, Mark> = {};
  for (const [id, m] of Object.entries(incoming)) {
    if (!ids.has(id)) return no(422, "VALIDATION_FAILED", "Someone on this sheet is no longer on the class. Reload and try again.");
    if (m === null) continue;
    if (m !== "joined" && m !== "recording" && m !== "missed") return no(422, "VALIDATION_FAILED", "Each mark is Joined, Recording or Missed.");
    marks[id] = m;
  }
  const missing = people.filter((e) => !marks[e.id]).length;
  if (body.final && missing)
    return no(422, "VALIDATION_FAILED", `${missing} ${missing === 1 ? "person isn't" : "people aren't"} marked yet. Mark everyone, or save and come back later.`, {
      marks: [`${missing} unmarked`],
    });

  const count = (m: Record<string, Mark>) => ({
    joined: Object.values(m).filter((x) => x === "joined").length,
    recording: Object.values(m).filter((x) => x === "recording").length,
    missed: Object.values(m).filter((x) => x === "missed").length,
  });
  const before = rec ? { ...count(rec.marks), state: rec.state } : undefined;
  const changed = rec ? Object.keys({ ...rec.marks, ...marks }).filter((k) => rec.marks[k] !== marks[k]).length : Object.keys(marks).length;
  const state = body.final ? "saved" : rec?.state === "saved" ? "saved" : "draft";
  if (rec) Object.assign(rec, { marks, state, savedById: u.id, savedAt: new Date(now).toISOString(), rowVer: rec.rowVer + 1 });
  else db.learnAttendance.push({ sessionId: s.id, marks, state, savedById: u.id, savedAt: new Date(now).toISOString(), rowVer: 1 });
  audit(u.id, state === "saved" ? "learn.attendance.save" : "learn.attendance.draft", c.id, {
    ...(before ? { before } : {}),
    after: { session: `${s.number}. ${s.title}`, ...count(marks), changed, ...(now > grace ? { reason } : {}) },
  });
  return getAttendance(u, s.id, now);
}

/* ============================================================ assessments */

export const opensAt = (c: CourseRecord, a: Pick<AssessmentRecord, "afterSession">) => {
  const s = sessionsOf(c.id).find((x) => x.number === a.afterSession);
  if (!hasMeetings(c.format) || !s?.startsAt) return null;
  return sessionEnd(c, s);
};

export function assessmentStatus(c: CourseRecord, a: AssessmentRecord, now = Date.now()): AssessmentStatus {
  if (a.state === "draft") return "draft";
  const open = opensAt(c, a);
  if (open === null) return hasMeetings(c.format) ? "scheduled" : "open";
  if (now < open) return "scheduled";
  return now < open + a.windowDays * DAY ? "open" : "closed";
}

/** What stops an assessment being published (the Figma builder's checks, plus ours). */
export function assessmentProblems(c: CourseRecord, a: AssessmentInput): string[] {
  const out: string[] = [];
  if (a.title.trim().length < 3) out.push("Give it a title.");
  if (!a.questions.length) out.push("Add at least one question.");
  a.questions.forEach((q, i) => {
    const n = i + 1;
    if (q.prompt.trim().length < 3) out.push(`Question ${n} needs a prompt.`);
    if (q.kind === "choice") {
      const opts = q.options.map((o) => o.trim());
      if (opts.filter(Boolean).length < 2) out.push(`Question ${n} needs at least two options.`);
      else if (opts.some((o) => !o)) out.push(`Question ${n} has an empty option.`);
      else if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) out.push(`Question ${n} has the same option twice.`);
    }
  });
  if (a.questions.length && !a.questions.some((q) => q.required)) out.push("Make at least one question required.");
  const s = sessionsOf(c.id).find((x) => x.number === a.afterSession);
  if (!s) out.push("Choose the session it opens after.");
  else if (hasMeetings(c.format) && !s.startsAt) out.push(`Session ${s.number} has no date yet, so it can't open.`);
  return out;
}

const submissionsFor = (id: string) => db.learnSubmissions.filter((s) => s.assessmentId === id).length;

export function toAssessment(u: StaffRecord, c: CourseRecord, a: AssessmentRecord, now = Date.now()): Assessment {
  const open = opensAt(c, a);
  const status = assessmentStatus(c, a, now);
  return {
    ...a,
    courseTitle: c.title,
    status,
    opensAt: open === null ? null : new Date(open).toISOString(),
    closesAt: open === null ? null : new Date(open + a.windowDays * DAY).toISOString(),
    createdBy: a.createdById ? staffPerson(a.createdById).name : null,
    submissions: submissionsFor(a.id),
    problems: assessmentProblems(c, a),
    questionsLocked: status === "open" || status === "closed",
    can: { edit: canAuthor(u, c) && c.state !== "archived" },
  };
}

export const assessmentsOf = (u: StaffRecord, c: CourseRecord, now = Date.now()) =>
  db.learnAssessments
    .filter((a) => a.courseId === c.id)
    .sort((a, b) => a.afterSession - b.afterSession || a.title.localeCompare(b.title))
    .map((a) => toAssessment(u, c, a, now));

const WINDOWS = [3, 7, 14, 21, 28];

function cleanQuestions(raw: unknown): { value?: Question[]; error?: string } {
  if (!Array.isArray(raw)) return { value: [] };
  if (raw.length > 20) return { error: "Up to 20 questions" };
  const out: Question[] = [];
  for (const [i, x] of (raw as Partial<Question>[]).entries()) {
    const kind = x.kind;
    if (kind !== "short" && kind !== "choice" && kind !== "scale") return { error: `Question ${i + 1}: choose a response type` };
    const prompt = String(x.prompt ?? "").slice(0, 300);
    const options = kind === "choice" ? (Array.isArray(x.options) ? x.options.map((o) => String(o).slice(0, 100)) : []) : [];
    if (options.length > 8) return { error: `Question ${i + 1}: up to 8 options` };
    out.push({ id: String(x.id || `q${i + 1}`).slice(0, 40), kind, prompt, required: x.required !== false, options });
  }
  return { value: out };
}

function validateAssessment(c: CourseRecord, input: Partial<AssessmentInput>): { value?: AssessmentInput; fields?: Record<string, string[]> } {
  const f: Record<string, string[]> = {};
  const title = String(input.title ?? "").trim();
  if (title.length < 3) f.title = ["Give it a title"];
  else if (title.length > 100) f.title = ["Keep the title under 100 characters"];
  const count = sessionsOf(c.id).length;
  const afterSession = Number(input.afterSession);
  if (!Number.isInteger(afterSession) || afterSession < 1 || afterSession > count) f.afterSession = ["Choose the session it opens after"];
  const windowDays = Number(input.windowDays);
  if (!WINDOWS.includes(windowDays)) f.windowDays = ["Choose how long it stays open"];
  const q = cleanQuestions(input.questions);
  if (q.error) f.questions = [q.error];
  if (Object.keys(f).length) return { fields: f };
  return { value: { title, afterSession, windowDays, final: !!input.final, questions: q.value! } };
}

/** One final assessment per class: marking another final moves the flag. */
function claimFinal(c: CourseRecord, a: AssessmentRecord): string | null {
  if (!a.final) return null;
  const other = db.learnAssessments.find((x) => x.courseId === c.id && x.id !== a.id && x.final);
  if (!other) return null;
  other.final = false;
  other.rowVer++;
  return other.title;
}

const findAssessment = (id: string) => db.learnAssessments.find((a) => a.id === id);

export function getAssessment(u: StaffRecord, id: string, now = Date.now()): Result<Assessment> {
  const a = findAssessment(id);
  const c = a && findCourse(a.courseId);
  if (!a || !c || !canSee(u, c)) return no(404, "NOT_FOUND", "That assessment no longer exists.");
  return ok(toAssessment(u, c, a, now));
}

export function createAssessment(u: StaffRecord, courseId: string, input: Partial<AssessmentInput>, now = Date.now()): Result<{ assessment: Assessment; movedFinal: string | null }> {
  const c = findCourse(courseId);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  const v = validateAssessment(c, input);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const a: AssessmentRecord = {
    ...v.value,
    id: `as-${crypto.randomUUID().slice(0, 8)}`,
    courseId: c.id,
    state: "draft",
    publishedAt: null,
    createdById: u.id,
    createdAt: new Date(now).toISOString(),
    rowVer: 1,
  };
  db.learnAssessments.push(a);
  const movedFinal = claimFinal(c, a);
  audit(u.id, "learn.assessment.create", c.id, { after: { assessment: a.title, questions: a.questions.length } });
  return ok({ assessment: toAssessment(u, c, a, now), movedFinal }, 201);
}

export function updateAssessment(
  u: StaffRecord,
  id: string,
  input: Partial<AssessmentInput> & { rowVer?: number },
  now = Date.now(),
): Result<{ assessment: Assessment; movedFinal: string | null }> {
  const a = findAssessment(id);
  const c = a && findCourse(a.courseId);
  if (!a || !c || !canSee(u, c)) return no(404, "NOT_FOUND", "That assessment no longer exists.");
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  if (input.rowVer !== a.rowVer) return no(409, "CONFLICT", "Someone else changed this assessment while you were working. Reload to see their changes, then try again.");
  const v = validateAssessment(c, input);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const status = assessmentStatus(c, a, now);
  if (status === "open" || status === "closed") {
    // Once people can answer, only the window (and the title) may change.
    if (JSON.stringify(v.value.questions) !== JSON.stringify(a.questions) || v.value.afterSession !== a.afterSession)
      return no(422, "QUESTIONS_LOCKED", "It has opened, so its questions and start can't change. You can still change how long it stays open.");
    const open = opensAt(c, a);
    if (open !== null && open + v.value.windowDays * DAY < now) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", { windowDays: ["That would close it in the past"] });
  }
  if (a.state === "published") {
    const problems = assessmentProblems(c, v.value);
    if (problems.length) return no(422, "PUBLISH_CHECKS", problems.join(" "));
  }
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of ["title", "afterSession", "windowDays", "final", "questions"] as const) {
    if (JSON.stringify(a[k]) !== JSON.stringify(v.value[k])) {
      before[k] = k === "questions" ? a.questions.length : a[k];
      after[k] = k === "questions" ? v.value.questions.length : v.value[k];
    }
  }
  Object.assign(a, v.value);
  a.rowVer++;
  const movedFinal = claimFinal(c, a);
  if (Object.keys(after).length) audit(u.id, "learn.assessment.update", c.id, { before, after: { ...after, assessment: a.title } });
  return ok({ assessment: toAssessment(u, c, a, now), movedFinal });
}

export function publishAssessment(u: StaffRecord, id: string, rowVer: number | undefined, publish = true, now = Date.now()): Result<{ assessment: Assessment }> {
  const a = findAssessment(id);
  const c = a && findCourse(a.courseId);
  if (!a || !c || !canSee(u, c)) return no(404, "NOT_FOUND", "That assessment no longer exists.");
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (rowVer !== a.rowVer) return no(409, "CONFLICT", "Someone else changed this assessment while you were working. Reload to see their changes, then try again.");
  if (publish) {
    if (a.state === "published") return no(422, "NOT_DRAFT", "It's already published.");
    const problems = assessmentProblems(c, a);
    if (problems.length) return no(422, "PUBLISH_CHECKS", problems.join(" "));
    a.state = "published";
    a.publishedAt = new Date(now).toISOString();
  } else {
    if (assessmentStatus(c, a, now) !== "scheduled") return no(422, "IN_USE", "It has already opened, so it stays published.");
    a.state = "draft";
    a.publishedAt = null;
  }
  a.rowVer++;
  audit(u.id, publish ? "learn.assessment.publish" : "learn.assessment.unpublish", c.id, { after: { assessment: a.title } });
  return ok({ assessment: toAssessment(u, c, a, now) });
}

export function deleteAssessment(u: StaffRecord, id: string): Result<{ deleted: true }> {
  const a = findAssessment(id);
  const c = a && findCourse(a.courseId);
  if (!a || !c || !canSee(u, c)) return no(404, "NOT_FOUND", "That assessment no longer exists.");
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (a.state !== "draft") return no(422, "IN_USE", "Only a draft can be deleted. Move a scheduled assessment back to draft first.");
  db.learnAssessments = db.learnAssessments.filter((x) => x.id !== id);
  audit(u.id, "learn.assessment.delete", c.id, { before: { assessment: a.title } });
  return ok({ deleted: true });
}

/* ============================================================ session page */

export function getSessionDetail(
  u: StaffRecord,
  sessionId: string,
  views: { toSession: (c: CourseRecord, s: SessionRecord) => Session; statusOf: (c: CourseRecord) => SessionDetail["course"]["status"] },
  now = Date.now(),
): Result<SessionDetail> {
  const s = findSession(sessionId);
  const c = s && findCourse(s.courseId);
  if (!s || !c || !canSee(u, c)) return no(404, "NOT_FOUND", NO_SESSION);
  const people = roster(c);
  const summary = attendanceSummary(c, s, now);
  const marks = people.map((e) => effective(c, s, e).mark);
  const attended = marks.filter((m) => m === "joined" || m === "recording").length;
  const watches = db.learnLogs.filter((l): l is Extract<JoinLog, { kind: "recording" }> => l.sessionId === s.id && l.kind === "recording");
  const rec = recordOf(s.id);
  const mine = db.learnAssessments.filter((a) => a.courseId === c.id && a.afterSession === s.number);
  return ok({
    session: views.toSession(c, s),
    course: { id: c.id, title: c.title, status: views.statusOf(c), teachers: c.teacherIds.map(staffPerson), enrolled: people.length, format: c.format, where: c.schedule.where, lengthMin: c.schedule.lengthMin },
    stats: {
      attendanceRate: summary?.rate ?? null,
      attended,
      marked: !!rec,
      submissions: mine.some((a) => a.state === "published") ? mine.reduce((n, a) => n + submissionsFor(a.id), 0) : null,
      expected: people.length,
      videoWatch: watches.length ? Math.round(watches.reduce((n, l) => n + l.percent, 0) / watches.length) : null,
    },
    attendance: summary ? { state: summary.state, savedAt: rec?.savedAt ?? null, savedBy: rec?.savedById ? staffPerson(rec.savedById).name : null, due: summary.due } : null,
    assessments: mine.map((a) => ({ id: a.id, title: a.title, status: assessmentStatus(c, a, now) })),
    can: { author: canAuthor(u, c) && c.state !== "archived", attendance: canAuthor(u, c) && c.state !== "archived" && takesAttendance(c, s, now) },
  });
}

/* ============================================================ dashboard */

export function teachingAttention(c: CourseRecord, now = Date.now()): GrowOverview["attention"] {
  const out: GrowOverview["attention"] = [];
  if (c.state !== "published") return out;
  for (const s of sessionsOf(c.id)) {
    const sum = attendanceSummary(c, s, now);
    if (!sum?.due) continue;
    const people = roster(c);
    const logs = people.map((e) => logOf(s.id, e.id));
    const live = logs.filter((l) => l?.kind === "live").length;
    const rec = logs.filter((l) => l?.kind === "recording").length;
    out.push({
      id: `att-${s.id}`,
      kind: "attendance",
      title: `${c.title}: “${s.title}” needs its attendance marked`,
      detail: `Met ${formatWhen(s.startsAt!)}. ${live} joined live, ${rec} watched the recording, ${people.length - live - rec} with no log.${sum.state === "draft" ? " Saved part-way." : ""}`,
      courseId: c.id,
      to: `/grow/classes/${c.id}/sessions/${s.id}/attendance`,
      action: "Mark attendance",
    });
  }
  const rule = c.completion.assessment;
  const status = sessionsOf(c.id).some((s) => s.startsAt && Date.parse(s.startsAt) < now) || !hasMeetings(c.format);
  if (rule !== "none" && status) {
    const live = db.learnAssessments.filter((a) => a.courseId === c.id && a.state === "published" && (rule === "every" || a.final));
    const ended = sessionsOf(c.id).every((s) => (sessionEnd(c, s) ?? Infinity) < now) && hasMeetings(c.format);
    if (!live.length && !ended)
      out.push({
        id: `assess-${c.id}`,
        kind: "assessment",
        title: rule === "final" ? `${c.title} has no final assessment yet` : `${c.title} has no assessment published yet`,
        detail: "Its completion rule needs one before anyone is ready for a certificate.",
        courseId: c.id,
        to: `/grow/classes/${c.id}/assessments/new`,
        action: "Build the assessment",
      });
  }
  return out;
}

/** Live joins in the last 7 days, for the dashboard tile (Figma "Joined live sessions this week"). */
export const joinedThisWeek = (courses: CourseRecord[], now = Date.now()) => {
  const ids = new Set(courses.flatMap((c) => sessionsOf(c.id).map((s) => s.id)));
  return db.learnLogs.filter((l) => l.kind === "live" && ids.has(l.sessionId) && Date.parse(l.at) > now - 7 * DAY && Date.parse(l.at) <= now).length;
};
