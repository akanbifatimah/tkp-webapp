import { describe, expect, it } from "vitest";
import type { AssessmentInput, Question } from "@/features/grow/grow-types";
import type { Result } from "./connect-api";
import { db } from "./db";
import { getCourse, getRoster, overview, sessionDetail } from "./grow-api";
import {
  assessmentStatus,
  createAssessment,
  deleteAssessment,
  getAssessment,
  getAttendance,
  publishAssessment,
  saveAttendance,
  updateAssessment,
} from "./grow-teaching";

/** M8 step 2: attendance, the session page and assessments (Figma 135:24429, 136:26483, 135:23449). docs/API.md §14. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const CHURCH_ADMIN = "u04";
const REGISTRAR = "u23";
const DOYIN = "u18"; // teaches Growth Class
const KEMI = "u24"; // grades Growth Class
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const last = () => db.audit[0]!;
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};
const growth = () => db.learnCourses.find((c) => c.id === "c-growth")!;
const sessions = () => db.learnSessions.filter((s) => s.courseId === "c-growth").sort((a, b) => a.number - b.number);
/** The newest Growth session that has met and still waits for its attendance. */
const dueSession = () => must(getCourse(user(REGISTRAR), "c-growth")).sessions.find((s) => s.attendance?.due)!;

describe("Attendance (Figma Mark attendance)", () => {
  it("starts from the join log for the session that hasn't been marked", () => {
    const s = dueSession();
    expect(s).toBeTruthy();
    const sheet = must(getAttendance(user(DOYIN), s.id));
    expect(sheet.state).toBe("not_started");
    expect(sheet.rows).toHaveLength(54);
    expect(sheet.rows.every((r) => r.mark === null)).toBe(true);
    const kinds = new Set(sheet.rows.map((r) => r.suggested));
    expect([...kinds].sort()).toEqual(["joined", "missed", "recording"]);
    expect(sheet.rows.some((r) => r.log === "No log detected")).toBe(true);
    expect(sheet.rows.some((r) => r.flag?.startsWith("Joined for only"))).toBe(true);
    expect(sheet.can).toEqual({ edit: true, override: false });
    // The dashboard asks for it.
    expect(must(overview(user(DOYIN))).attention.some((a) => a.kind === "attendance" && a.to?.endsWith(`${s.id}/attendance`))).toBe(true);
  });

  it("saves part-way, needs everyone marked to finish, and logs it", () => {
    const s = dueSession();
    const sheet = must(getAttendance(user(DOYIN), s.id));
    const some = Object.fromEntries(sheet.rows.slice(0, 10).map((r) => [r.enrolmentId, r.suggested]));
    const draft = must(saveAttendance(user(DOYIN), s.id, { marks: some, final: false, rowVer: sheet.rowVer }));
    expect(draft.state).toBe("draft");
    expect(last()).toMatchObject({ action: "learn.attendance.draft" });
    const r = saveAttendance(user(DOYIN), s.id, { marks: some, final: true, rowVer: draft.rowVer });
    expect(code(r)).toBe("VALIDATION_FAILED");
    expect(!r.ok && r.message).toMatch(/44 people aren't marked yet/);
    expect(code(saveAttendance(user(DOYIN), s.id, { marks: some, final: true, rowVer: 0 }))).toBe("CONFLICT");
    const all = Object.fromEntries(draft.rows.map((x) => [x.enrolmentId, x.suggested]));
    const saved = must(saveAttendance(user(DOYIN), s.id, { marks: all, final: true, rowVer: draft.rowVer }));
    expect(saved).toMatchObject({ state: "saved", savedBy: "Doyin Olusanya" });
    expect(last()).toMatchObject({ action: "learn.attendance.save", meta: { after: { session: `${s.number}. ${s.title}` } } });
    expect(must(getCourse(user(DOYIN), "c-growth")).sessions.find((x) => x.id === s.id)!.attendance).toMatchObject({ state: "saved", due: false });
  });

  it("graders and Church Admin can look but not mark", () => {
    const s = sessions()[0]!;
    expect(must(getAttendance(user(KEMI), s.id)).can.edit).toBe(false);
    expect(must(getAttendance(user(CHURCH_ADMIN), s.id)).can.edit).toBe(false);
    expect(code(saveAttendance(user(KEMI), s.id, { marks: {}, final: false, rowVer: 1 }))).toBe("FORBIDDEN");
  });

  it("opens only once the session starts", () => {
    const s6 = sessions()[5]!;
    expect(code(getAttendance(user(DOYIN), s6.id))).toBe("NOT_STARTED");
  });

  it("after the grace period only the Registrar changes marks, with a reason", () => {
    const s1 = sessions()[0]!;
    const sheet = must(getAttendance(user(REGISTRAR), s1.id));
    expect(sheet.locked).toBe(true);
    expect(sheet.can).toEqual({ edit: true, override: true });
    expect(must(getAttendance(user(DOYIN), s1.id)).can.edit).toBe(false);
    const marks = Object.fromEntries(sheet.rows.map((r) => [r.enrolmentId, r.mark]));
    expect(code(saveAttendance(user(DOYIN), s1.id, { marks, final: true, rowVer: sheet.rowVer }))).toBe("LOCKED");
    expect(code(saveAttendance(user(REGISTRAR), s1.id, { marks, final: true, rowVer: sheet.rowVer }))).toBe("VALIDATION_FAILED");
    must(saveAttendance(user(REGISTRAR), s1.id, { marks, final: true, rowVer: sheet.rowVer, reason: "Chapel sign-in sheet arrived late" }));
    expect(last()).toMatchObject({ action: "learn.attendance.save", meta: { after: { reason: "Chapel sign-in sheet arrived late" } } });
  });

  it("someone saved as Missed who watches the recording in the grace period counts automatically", () => {
    const s = sessions().find((x) => db.learnAttendance.some((r) => r.sessionId === x.id) && Date.parse(x.startsAt!) > Date.now() - 6 * 86_400_000) ?? sessions()[3]!;
    const rec = db.learnAttendance.find((r) => r.sessionId === s.id)!;
    const watched = db.learnLogs.find((l) => l.sessionId === s.id && l.kind === "recording" && l.percent >= 80)!;
    rec.marks[watched.enrolmentId] = "missed";
    const row = must(getAttendance(user(DOYIN), s.id)).rows.find((r) => r.enrolmentId === watched.enrolmentId)!;
    const inGrace = Date.parse(watched.at) <= Date.parse(s.startsAt!) + (growth().schedule.lengthMin + 7 * 1440) * 60_000;
    expect(row).toMatchObject(inGrace ? { mark: "recording", auto: true } : { mark: "missed", auto: false });
  });

  it("counts attended sessions on the roster", () => {
    const r = must(getRoster(user(REGISTRAR), "c-growth"));
    const e = r.items.find((x) => x.status === "enrolled")!;
    expect(e.attended).toBeGreaterThan(0);
    expect(e.attended).toBeLessThanOrEqual(5);
  });

  it("the session page sums it up", () => {
    const s2 = sessions()[1]!;
    const d = must(sessionDetail(user(DOYIN), s2.id));
    expect(d.stats.attendanceRate).toBeGreaterThan(50);
    expect(d.stats.expected).toBe(54);
    expect(d.stats.videoWatch).toBeGreaterThan(0);
    expect(d.can).toEqual({ author: true, attendance: true });
    expect(must(sessionDetail(user(KEMI), s2.id)).can).toEqual({ author: false, attendance: false });
    expect(sessionDetail(user("u19"), s2.id).status).toBe(404);
  });
});

/* ------------------------------------------------------------ assessments */

const q = (kind: Question["kind"], prompt: string, options: string[] = []): Question => ({ id: crypto.randomUUID().slice(0, 6), kind, prompt, required: true, options });
const input = (o: Partial<AssessmentInput> = {}): AssessmentInput => ({
  title: "Session 3 reflection",
  afterSession: 3,
  windowDays: 28,
  final: false,
  questions: [q("short", "What stayed with you?"), q("choice", "Which part helped most?", ["Prayer", "Fasting"]), q("scale", "How is your prayer life?")],
  ...o,
});

describe("Assessments (Figma Assessment builder)", () => {
  it("works the status out from the session it follows", () => {
    const g = growth();
    expect(assessmentStatus(g, db.learnAssessments.find((a) => a.id === "as-gfinal")!)).toBe("scheduled");
    expect(assessmentStatus(g, db.learnAssessments.find((a) => a.id === "as-d1")!)).toBe("draft");
    const fin = must(getAssessment(user(KEMI), "as-gfinal"));
    expect(fin.opensAt).toBeTruthy();
    expect(Date.parse(fin.closesAt!) - Date.parse(fin.opensAt!)).toBe(14 * 86_400_000);
    expect(fin.can.edit).toBe(false);
  });

  it("only the class's teachers and the Registrar build them", () => {
    expect(code(createAssessment(user(KEMI), "c-growth", input()))).toBe("FORBIDDEN");
    expect(code(createAssessment(user(CHURCH_ADMIN), "c-growth", input()))).toBe("FORBIDDEN");
    expect(createAssessment(user("u19"), "c-growth", input()).status).toBe(404);
  });

  it("saves drafts with gaps, but publishes only a complete one", () => {
    const r = must(createAssessment(user(DOYIN), "c-growth", input({ questions: [q("short", ""), q("choice", "Pick one", ["Yes", "yes"])] })));
    expect(r.assessment.status).toBe("draft");
    expect(r.assessment.problems).toEqual(["Question 1 needs a prompt.", "Question 2 has the same option twice."]);
    expect(code(publishAssessment(user(DOYIN), r.assessment.id, r.assessment.rowVer))).toBe("PUBLISH_CHECKS");
    const fixed = must(updateAssessment(user(DOYIN), r.assessment.id, { ...input(), rowVer: r.assessment.rowVer })).assessment;
    expect(fixed.problems).toEqual([]);
    const pub = must(publishAssessment(user(DOYIN), fixed.id, fixed.rowVer)).assessment;
    expect(pub.status).toBe("open"); // session 3 met two weeks ago; open four weeks
    expect(last().action).toBe("learn.assessment.publish");
    // Once open, the questions are fixed; the window can still change.
    expect(pub.questionsLocked).toBe(true);
    expect(code(updateAssessment(user(DOYIN), pub.id, { ...input({ questions: [q("short", "Different?")] }), rowVer: pub.rowVer }))).toBe("QUESTIONS_LOCKED");
    const longer = must(updateAssessment(user(DOYIN), pub.id, { ...input(), questions: pub.questions, windowDays: 21, rowVer: pub.rowVer })).assessment;
    expect(longer.windowDays).toBe(21);
    expect(code(updateAssessment(user(DOYIN), pub.id, { ...input(), questions: pub.questions, windowDays: 3, rowVer: longer.rowVer }))).toBe("VALIDATION_FAILED");
    // Open ones can't go back to draft or be deleted.
    expect(code(publishAssessment(user(DOYIN), pub.id, longer.rowVer, false))).toBe("IN_USE");
    expect(code(deleteAssessment(user(DOYIN), pub.id))).toBe("IN_USE");
  });

  it("keeps one final assessment per class", () => {
    const r = must(createAssessment(user(DOYIN), "c-growth", input({ title: "Closing reflection", afterSession: 6, windowDays: 7, final: true })));
    expect(r.movedFinal).toBe("Class Reflection");
    expect(db.learnAssessments.filter((a) => a.courseId === "c-growth" && a.final).map((a) => a.title)).toEqual(["Closing reflection"]);
    expect(must(deleteAssessment(user(DOYIN), r.assessment.id)).deleted).toBe(true);
  });

  it("a scheduled one can go back to draft", () => {
    const a = db.learnAssessments.find((x) => x.id === "as-gfinal")!;
    const back = must(publishAssessment(user(DOYIN), a.id, a.rowVer, false)).assessment;
    expect(back.status).toBe("draft");
    expect(last().action).toBe("learn.assessment.unpublish");
    must(publishAssessment(user(DOYIN), a.id, back.rowVer));
  });

  it("checks the window and the session", () => {
    const r = createAssessment(user(DOYIN), "c-growth", input({ windowDays: 5, afterSession: 9 }));
    expect(!r.ok && Object.keys(r.fields ?? {}).sort()).toEqual(["afterSession", "windowDays"]);
  });
});
