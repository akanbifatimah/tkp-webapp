import type {
  GrowOverview,
  Outcome,
  PendingRow,
  ReviewInput,
  SubmissionDetail,
  SubmissionRow,
  SubmissionsResponse,
} from "@/features/grow/grow-types";
import { formatWhen } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { activeEnrolments, allowed, canManage, canSee, DAY, findCourse, FORBIDDEN, no, ok, person, sessionsOf, staffPerson } from "./grow-core";
import { assessmentStatus, attendedCount, opensAt } from "./grow-teaching";
import type { AssessmentRecord, CourseRecord, SubmissionRecord } from "./seed/grow";
import type { StaffRecord } from "./seed/staff";

/**
 * M8 step 3 (docs/API.md §15): the pastor's review of assessment answers
 * (Figma 135:25044 "Assessment Submission", 136:27588 "Assessment Review").
 */

const GONE = "That assessment no longer exists.";
const OUTCOMES: Outcome[] = ["passed", "follow_up", "resubmit"];

/** Class teachers, the class's graders and the Registrar review (TKP: teachers mark their classes). */
export const canReview = (u: StaffRecord, c: CourseRecord) =>
  allowed(u, "learn.view") && (canManage(u) || c.teacherIds.includes(u.id) || (c.graderIds.includes(u.id) && u.roles.includes("grader")));

const findAssessment = (id: string) => db.learnAssessments.find((a) => a.id === id);
const subsOf = (aid: string) => db.learnSubmissions.filter((s) => s.assessmentId === aid);
export const submissionCount = (aid: string) => subsOf(aid).length;
const nameOf = (enrolmentId: string) => {
  const e = db.learnEnrolments.find((x) => x.id === enrolmentId);
  return (e && person(e.personId)?.name) ?? "Former learner";
};
const emailOf = (enrolmentId: string) => {
  const e = db.learnEnrolments.find((x) => x.id === enrolmentId);
  return (e && person(e.personId)?.email) ?? "";
};

/** PRD RG-2 "self-grading block": nobody reviews their own answers. */
const selfBlocked = (u: StaffRecord, s: SubmissionRecord) => (emailOf(s.enrolmentId).toLowerCase() === u.email.toLowerCase() ? "This is your own submission, so someone else reviews it." : null);

function scope(u: StaffRecord, aid: string): { a: AssessmentRecord; c: CourseRecord } | Result<never> {
  const a = findAssessment(aid);
  const c = a && findCourse(a.courseId);
  if (!a || !c || !canSee(u, c)) return no(404, "NOT_FOUND", GONE);
  return { a, c };
}

/** Rank for the list: needs review first, then saved for later, then returned. */
const RANK = { submitted: 0, in_review: 1, returned: 2 } as const;
const queueOf = (aid: string) => subsOf(aid).sort((x, y) => RANK[x.state] - RANK[y.state] || x.submittedAt.localeCompare(y.submittedAt));

export function listSubmissions(u: StaffRecord, aid: string, now = Date.now()): Result<SubmissionsResponse> {
  const r = scope(u, aid);
  if ("ok" in r) return r;
  const { a, c } = r;
  const firstShort = a.questions.find((q) => q.kind === "short")?.id;
  const items: SubmissionRow[] = queueOf(a.id).map((s) => {
    const text = firstShort ? s.answers[firstShort] : null;
    return {
      id: s.id,
      enrolmentId: s.enrolmentId,
      name: nameOf(s.enrolmentId),
      submittedAt: s.submittedAt,
      state: s.state,
      outcome: s.outcome,
      reviewer: s.reviewerId ? staffPerson(s.reviewerId).name : null,
      preview: typeof text === "string" ? (text.length > 110 ? `${text.slice(0, 107)}…` : text) : null,
    };
  });
  const answered = new Set(subsOf(a.id).map((s) => s.enrolmentId));
  const after = sessionsOf(c.id).find((s) => s.number === a.afterSession);
  const sessions = sessionsOf(c.id).filter((s) => s.startsAt && Date.parse(s.startsAt) < now).length;
  const pending: PendingRow[] = activeEnrolments(c.id)
    .filter((e) => !answered.has(e.id))
    .map((e) => {
      const watch = after ? db.learnLogs.filter((l) => l.sessionId === after.id && l.enrolmentId === e.id && l.kind === "recording") : [];
      return {
        enrolmentId: e.id,
        name: person(e.personId)!.name,
        attended: attendedCount(e),
        sessions,
        watched: watch.length ? Math.max(...watch.map((l) => (l.kind === "recording" ? l.percent : 0))) : null,
        excused: db.learnExcusals.find((x) => x.assessmentId === a.id && x.enrolmentId === e.id)?.reason ?? null,
      };
    })
    .sort((x, y) => Number(!!x.excused) - Number(!!y.excused) || x.name.localeCompare(y.name));
  const last = db.learnReminders.filter((x) => x.assessmentId === a.id).sort((x, y) => y.at.localeCompare(x.at))[0];
  const status = assessmentStatus(c, a, now);
  const review = canReview(u, c);
  const open = opensAt(c, a);
  return ok({
    assessment: { id: a.id, title: a.title, courseId: c.id, courseTitle: c.title, afterSession: a.afterSession, status, closesAt: open === null ? null : new Date(open + a.windowDays * DAY).toISOString(), final: a.final },
    counts: {
      all: items.length,
      review: items.filter((x) => x.state !== "returned").length,
      returned: items.filter((x) => x.state === "returned").length,
      pending: pending.filter((p) => !p.excused).length,
      excused: pending.filter((p) => p.excused).length,
    },
    items,
    pending,
    lastReminder: last ? { at: last.at, by: staffPerson(last.byId).name, count: last.count } : null,
    can: { review, remind: review && status === "open", excuse: review && c.state !== "archived" },
  });
}

export function getSubmission(u: StaffRecord, id: string): Result<SubmissionDetail> {
  const s = db.learnSubmissions.find((x) => x.id === id);
  const r = s ? scope(u, s.assessmentId) : no(404, "NOT_FOUND", "That submission no longer exists.");
  if ("ok" in r) return r;
  const { a, c } = r;
  const e = db.learnEnrolments.find((x) => x.id === s!.enrolmentId);
  const name = nameOf(s!.enrolmentId);
  const waiting = queueOf(a.id).filter((x) => x.state !== "returned");
  const i = waiting.findIndex((x) => x.id === s!.id);
  const order = i >= 0 ? waiting : [s!, ...waiting];
  const at = order.findIndex((x) => x.id === s!.id);
  const blocked = selfBlocked(u, s!);
  return ok({
    id: s!.id,
    assessment: { id: a.id, title: a.title, courseId: c.id, courseTitle: c.title, questions: a.questions },
    name,
    firstName: name.split(" ")[0]!,
    submittedAt: s!.submittedAt,
    attended: e ? attendedCount(e) : 0,
    sessions: sessionsOf(c.id).filter((x) => x.startsAt && Date.parse(x.startsAt) < Date.parse(s!.submittedAt) + DAY).length,
    answers: s!.answers,
    state: s!.state,
    outcome: s!.outcome,
    note: s!.note,
    shareNote: s!.shareNote,
    reviewer: s!.reviewerId ? staffPerson(s!.reviewerId).name : null,
    returnedAt: s!.returnedAt,
    history: s!.history.map((h) => ({ at: h.at, by: staffPerson(h.byId).name, outcome: h.outcome, reason: h.reason, kind: h.kind })),
    queue: { prev: at > 0 ? order[at - 1]!.id : null, next: order[at + 1]?.id ?? null, left: waiting.filter((x) => x.id !== s!.id).length },
    can: { review: canReview(u, c) && c.state !== "archived" && !blocked, blocked: canReview(u, c) ? blocked : null },
    rowVer: s!.rowVer,
  });
}

export function saveReview(u: StaffRecord, id: string, body: Partial<ReviewInput>, now = Date.now()): Result<SubmissionDetail> {
  const s = db.learnSubmissions.find((x) => x.id === id);
  const r = s ? scope(u, s.assessmentId) : no(404, "NOT_FOUND", "That submission no longer exists.");
  if ("ok" in r) return r;
  const { a, c } = r;
  if (!canReview(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  const blocked = selfBlocked(u, s!);
  if (blocked) return no(403, "SELF_REVIEW", blocked);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  if (body.rowVer !== s!.rowVer) return no(409, "CONFLICT", "Someone else reviewed this while you were working. Reload to see what they wrote.");
  const outcome = body.outcome ?? null;
  if (outcome !== null && !OUTCOMES.includes(outcome)) return no(422, "VALIDATION_FAILED", "Choose an outcome.", { outcome: ["Choose an outcome"] });
  const note = String(body.note ?? "").trim();
  if (note.length > 2000) return no(422, "VALIDATION_FAILED", "Keep the note under 2,000 characters.", { note: ["Keep it under 2,000 characters"] });
  const release = !!body.release;
  const f: Record<string, string[]> = {};
  if (release && !outcome) f.outcome = ["Choose an outcome before returning it"];
  if (release && outcome && outcome !== "passed" && note.length < 10) f.note = ["Tell them why, in a sentence or two"];
  if (release && outcome && outcome !== "passed" && !body.shareNote) f.shareNote = ["Share your note so they know what to do next"];
  if (Object.keys(f).length) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", f);

  // PRD RG-2 "score change log": changing a returned outcome needs a reason.
  const wasReturned = s!.state === "returned";
  const reason = String(body.reason ?? "").trim();
  const changing = wasReturned && (outcome !== s!.outcome || (release && note !== s!.note));
  if (wasReturned && !release) return no(422, "ALREADY_RETURNED", `It was returned to ${nameOf(s!.enrolmentId).split(" ")[0]} already. Return it again to change it.`);
  if (changing && reason.length < 5) return no(422, "VALIDATION_FAILED", "Say why you're changing a returned review.", { reason: ["Say why it's changing"] });

  const before = { state: s!.state, outcome: s!.outcome };
  const at = new Date(now).toISOString();
  Object.assign(s!, {
    outcome,
    note,
    shareNote: !!body.shareNote,
    reviewerId: u.id,
    state: release ? "returned" : "in_review",
    returnedAt: release ? at : s!.returnedAt,
  });
  s!.history.push({ at, byId: u.id, outcome, reason: changing ? reason : null, kind: changing ? "changed" : release ? "returned" : "saved" });
  s!.rowVer++;
  audit(u.id, changing ? "learn.review.change" : release ? "learn.review.return" : "learn.review.save", c.id, {
    before,
    after: { assessment: a.title, person: nameOf(s!.enrolmentId), outcome, shared: !!body.shareNote, ...(changing ? { reason } : {}) },
  });
  return getSubmission(u, s!.id);
}

/** "Send gentle reminder email" (Figma): to everyone not excused who hasn't answered, once a day. */
export function remind(u: StaffRecord, aid: string, now = Date.now()): Result<{ sent: number }> {
  const r = scope(u, aid);
  if ("ok" in r) return r;
  const { a, c } = r;
  if (!canReview(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (assessmentStatus(c, a, now) !== "open") return no(422, "NOT_OPEN", "Reminders go out only while it's open.");
  const last = db.learnReminders.filter((x) => x.assessmentId === a.id).sort((x, y) => y.at.localeCompare(x.at))[0];
  if (last && now - Date.parse(last.at) < DAY) return no(422, "TOO_SOON", `A reminder went out ${formatWhen(last.at)}. Send the next one after a day.`);
  const answered = new Set(subsOf(a.id).map((s) => s.enrolmentId));
  const excused = new Set(db.learnExcusals.filter((x) => x.assessmentId === a.id).map((x) => x.enrolmentId));
  const to = activeEnrolments(c.id).filter((e) => !answered.has(e.id) && !excused.has(e.id));
  if (!to.length) return no(422, "NOBODY", "Everyone has answered or is excused.");
  db.learnReminders.push({ assessmentId: a.id, at: new Date(now).toISOString(), byId: u.id, count: to.length });
  audit(u.id, "learn.review.remind", c.id, { after: { assessment: a.title, people: to.length } });
  return ok({ sent: to.length });
}

/** Excuse someone from an assessment (Figma: "Excused: Out of state travel"); it then doesn't block their certificate. */
export function setExcused(u: StaffRecord, aid: string, enrolmentId: string, reason: string | null): Result<{ excused: boolean }> {
  const r = scope(u, aid);
  if ("ok" in r) return r;
  const { a, c } = r;
  if (!canReview(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (!activeEnrolments(c.id).some((e) => e.id === enrolmentId)) return no(404, "NOT_FOUND", "They're no longer on this class.");
  if (subsOf(a.id).some((s) => s.enrolmentId === enrolmentId)) return no(422, "ANSWERED", "They have already answered, so they can't be excused.");
  const name = nameOf(enrolmentId);
  db.learnExcusals = db.learnExcusals.filter((x) => !(x.assessmentId === a.id && x.enrolmentId === enrolmentId));
  if (reason === null) {
    audit(u.id, "learn.review.unexcuse", c.id, { after: { assessment: a.title, person: name } });
    return ok({ excused: false });
  }
  const why = reason.trim();
  if (why.length < 3) return no(422, "VALIDATION_FAILED", "Say why they're excused.", { reason: ["Say why"] });
  db.learnExcusals.push({ assessmentId: a.id, enrolmentId, reason: why.slice(0, 120), byId: u.id, at: new Date().toISOString() });
  audit(u.id, "learn.review.excuse", c.id, { after: { assessment: a.title, person: name, reason: why } });
  return ok({ excused: true });
}

/** Dashboard: assessments with answers waiting for a pastor. */
export function reviewAttention(u: StaffRecord, c: CourseRecord): GrowOverview["attention"] {
  if (!canReview(u, c)) return [];
  return db.learnAssessments
    .filter((a) => a.courseId === c.id)
    .flatMap((a) => {
      const waiting = subsOf(a.id).filter((s) => s.state !== "returned").length;
      if (!waiting) return [];
      return [
        {
          id: `review-${a.id}`,
          kind: "review" as const,
          title: `${c.title}: ${waiting} ${waiting === 1 ? "answer needs" : "answers need"} your review`,
          detail: `“${a.title}”. People see your note and outcome once you return it.`,
          courseId: c.id,
          to: `/grow/classes/${c.id}/assessments/${a.id}/submissions`,
          action: "Review answers",
        },
      ];
    });
}
