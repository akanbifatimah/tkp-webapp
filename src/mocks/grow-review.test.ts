import { describe, expect, it } from "vitest";
import type { Result } from "./connect-api";
import { db } from "./db";
import { overview } from "./grow-api";
import { getAssessment } from "./grow-teaching";
import { getSubmission, listSubmissions, remind, saveReview, setExcused } from "./grow-review";

/** M8 step 3: the pastor's review (Figma 135:25044, 136:27588). docs/API.md §15. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const CHURCH_ADMIN = "u04";
const DOYIN = "u18"; // teaches Growth Class
const KEMI = "u24"; // grades Growth Class
const FOLABI = "u19"; // teaches New Believers only
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const last = () => db.audit[0]!;
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};
const waiting = () => must(listSubmissions(user(DOYIN), "as-g5")).items.filter((x) => x.state !== "returned");

describe("Submissions list (Figma Assessment Submission)", () => {
  it("lists answers needing review first, then returned, and who hasn't answered", () => {
    const r = must(listSubmissions(user(DOYIN), "as-g5"));
    expect(r.counts.review).toBe(8);
    expect(r.counts.returned).toBeGreaterThan(20);
    expect(r.counts.all).toBe(r.counts.review + r.counts.returned);
    expect(r.counts.excused).toBe(1);
    expect(r.counts.all + r.counts.pending + r.counts.excused).toBe(54);
    expect(r.items.slice(0, 8).every((x) => x.state !== "returned")).toBe(true);
    expect(r.items[0]!.preview).toBeTruthy();
    expect(r.pending.at(-1)!.excused).toBe("Out of state travel");
    expect(r.can).toEqual({ review: true, remind: true, excuse: true });
    expect(must(getAssessment(user(DOYIN), "as-g5")).submissions).toBe(r.counts.all);
  });

  it("graders review; Church Admin only looks; other teachers can't see it", () => {
    expect(must(listSubmissions(user(KEMI), "as-g5")).can.review).toBe(true);
    expect(must(listSubmissions(user(CHURCH_ADMIN), "as-g5")).can).toEqual({ review: false, remind: false, excuse: false });
    expect(listSubmissions(user(FOLABI), "as-g5").status).toBe(404);
    const s = waiting()[0]!;
    expect(code(saveReview(user(CHURCH_ADMIN), s.id, { outcome: "passed", note: "", shareNote: true, release: true, rowVer: 1 }))).toBe("FORBIDDEN");
  });

  it("puts review on the dashboard", () => {
    expect(must(overview(user(KEMI))).attention.some((a) => a.kind === "review" && a.to?.endsWith("/assessments/as-g5/submissions"))).toBe(true);
  });
});

describe("Reviewing one (Figma Assessment Review)", () => {
  it("shows the answers, how they attended, and the queue", () => {
    const s = waiting()[0]!;
    const d = must(getSubmission(user(DOYIN), s.id));
    expect(d.assessment.questions).toHaveLength(2);
    expect(typeof d.answers.q1).toBe("string");
    expect(d.answers.q2).toBeGreaterThanOrEqual(1);
    expect(d.attended).toBeGreaterThan(0);
    expect(d.queue).toMatchObject({ prev: null, left: 7 });
    expect(d.queue.next).toBe(waiting()[1]!.id);
    expect(d.can).toEqual({ review: true, blocked: null });
  });

  it("saves for later, then returns with an outcome", () => {
    const s = waiting()[0]!;
    const d = must(getSubmission(user(DOYIN), s.id));
    const saved = must(saveReview(user(DOYIN), s.id, { outcome: "passed", note: "Thank you.", shareNote: true, release: false, rowVer: d.rowVer }));
    expect(saved.state).toBe("in_review");
    expect(last().action).toBe("learn.review.save");
    expect(code(saveReview(user(DOYIN), s.id, { outcome: "passed", note: "", shareNote: true, release: true, rowVer: d.rowVer }))).toBe("CONFLICT");
    const done = must(saveReview(user(DOYIN), s.id, { outcome: "passed", note: "Thank you. Keep going.", shareNote: true, release: true, rowVer: saved.rowVer }));
    expect(done).toMatchObject({ state: "returned", outcome: "passed", reviewer: "Doyin Olusanya" });
    expect(done.history.map((h) => h.kind)).toEqual(["saved", "returned"]);
    expect(last()).toMatchObject({ action: "learn.review.return", meta: { after: { outcome: "passed" } } });
    expect(must(listSubmissions(user(DOYIN), "as-g5")).counts.review).toBe(7);
  });

  it("needs a shared note for anything but Passed, and an outcome to return", () => {
    const s = waiting()[0]!;
    const d = must(getSubmission(user(KEMI), s.id));
    const none = saveReview(user(KEMI), s.id, { outcome: null, note: "", shareNote: false, release: true, rowVer: d.rowVer });
    expect(!none.ok && Object.keys(none.fields ?? {})).toEqual(["outcome"]);
    const talk = saveReview(user(KEMI), s.id, { outcome: "follow_up", note: "Hi", shareNote: false, release: true, rowVer: d.rowVer });
    expect(!talk.ok && Object.keys(talk.fields ?? {}).sort()).toEqual(["note", "shareNote"]);
    const ok = must(saveReview(user(KEMI), s.id, { outcome: "resubmit", note: "Could you say a little more about your prayer rhythm?", shareNote: true, release: true, rowVer: d.rowVer }));
    expect(ok.outcome).toBe("resubmit");
  });

  it("changing a returned review needs a reason and is logged (score change log)", () => {
    const s = must(listSubmissions(user(DOYIN), "as-g5")).items.find((x) => x.state === "returned" && x.outcome === "passed")!;
    const d = must(getSubmission(user(DOYIN), s.id));
    expect(code(saveReview(user(DOYIN), s.id, { outcome: "follow_up", note: d.note, shareNote: true, release: false, rowVer: d.rowVer }))).toBe("ALREADY_RETURNED");
    const noReason = saveReview(user(DOYIN), s.id, { outcome: "follow_up", note: "Let's pray together on Sunday.", shareNote: true, release: true, rowVer: d.rowVer });
    expect(!noReason.ok && noReason.fields?.reason).toBeTruthy();
    const changed = must(saveReview(user(DOYIN), s.id, { outcome: "follow_up", note: "Let's pray together on Sunday.", shareNote: true, release: true, rowVer: d.rowVer, reason: "Read it again after her cell leader called" }));
    expect(changed.history.at(-1)).toMatchObject({ kind: "changed", outcome: "follow_up", reason: "Read it again after her cell leader called" });
    expect(last().action).toBe("learn.review.change");
    expect(last().meta).toMatchObject({ before: { outcome: "passed" }, after: { outcome: "follow_up" } });
  });

  it("nobody reviews their own answers", () => {
    const s = waiting()[0]!;
    const e = db.learnEnrolments.find((x) => x.id === s.enrolmentId)!;
    const p = db.learnPeople.find((x) => x.id === e.personId)!;
    const keep = p.email;
    p.email = user(KEMI).email;
    try {
      const d = must(getSubmission(user(KEMI), s.id));
      expect(d.can.review).toBe(false);
      expect(d.can.blocked).toMatch(/your own submission/);
      expect(code(saveReview(user(KEMI), s.id, { outcome: "passed", note: "", shareNote: true, release: true, rowVer: d.rowVer }))).toBe("SELF_REVIEW");
    } finally {
      p.email = keep;
    }
  });
});

describe("Reminders and excusing", () => {
  it("sends a gentle reminder to those who haven't answered, once a day", () => {
    const before = must(listSubmissions(user(DOYIN), "as-g5")).counts.pending;
    expect(must(remind(user(DOYIN), "as-g5")).sent).toBe(before);
    expect(last()).toMatchObject({ action: "learn.review.remind", meta: { after: { people: before } } });
    expect(code(remind(user(DOYIN), "as-g5"))).toBe("TOO_SOON");
    expect(must(listSubmissions(user(DOYIN), "as-g5")).lastReminder).toMatchObject({ by: "Doyin Olusanya", count: before });
    expect(code(remind(user(DOYIN), "as-gfinal"))).toBe("NOT_OPEN");
  });

  it("excuses someone with a reason, and takes it back", () => {
    const p = must(listSubmissions(user(DOYIN), "as-g5")).pending.find((x) => !x.excused)!;
    expect(code(setExcused(user(DOYIN), "as-g5", p.enrolmentId, " "))).toBe("VALIDATION_FAILED");
    must(setExcused(user(DOYIN), "as-g5", p.enrolmentId, "In hospital this week"));
    expect(must(listSubmissions(user(DOYIN), "as-g5")).pending.find((x) => x.enrolmentId === p.enrolmentId)!.excused).toBe("In hospital this week");
    expect(last().action).toBe("learn.review.excuse");
    must(setExcused(user(DOYIN), "as-g5", p.enrolmentId, null));
    expect(last().action).toBe("learn.review.unexcuse");
    const answered = must(listSubmissions(user(DOYIN), "as-g5")).items[0]!;
    expect(code(setExcused(user(DOYIN), "as-g5", answered.enrolmentId, "Away"))).toBe("ANSWERED");
  });
});
