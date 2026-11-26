import { describe, expect, it } from "vitest";
import type { CourseInput } from "@/features/grow/grow-types";
import type { Result } from "./connect-api";
import { db } from "./db";
import {
  addResource,
  archiveCourse,
  createCourse,
  createSession,
  deleteCourse,
  deleteSession,
  enrol,
  getCourse,
  getRoster,
  listCourses,
  logRosterExport,
  overview,
  promote,
  publishCourse,
  publishSession,
  searchPeople,
  setRegistration,
  statusOf,
  updateCourse,
  updateSession,
  upload,
  withdraw,
} from "./grow-api";

/** M8 step 1: Grow classes, sessions and rosters (PRD LMS-1 to LMS-8, WEB-9 to WEB-11, WEB-17, RG-1, RG-4). docs/API.md §13. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const TECH = "u01";
const TECH_TEAM = "u02";
const CHURCH_ADMIN = "u04";
const REGISTRAR = "u23";
const DOYIN = "u18"; // teaches Growth Class and Foundations of Prayer
const FOLABI = "u19"; // teaches New Believers
const KEMI = "u24"; // grades Growth Class and School of Disciples
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const course = (id: string) => db.learnCourses.find((c) => c.id === id)!;
const last = () => db.audit[0]!;
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};

const input = (o: Partial<CourseInput> = {}): CourseInput => ({
  title: `Marriage Enrichment ${crypto.randomUUID().slice(0, 4)}`,
  description: "Six evenings for couples.",
  step: null,
  format: "live",
  audience: "everyone",
  prerequisiteSteps: [],
  teacherIds: [FOLABI],
  graderIds: [],
  schedule: { day: 5, time: "19:00", where: "in_person", place: "Room 2", startsOn: "2027-02-05", sessionCount: 3, lengthMin: 90 },
  seats: 2,
  waitlist: true,
  completion: { attendance: 2, assessment: "none" },
  welcomeNote: "",
  ...o,
});

describe("Grow: who sees and does what (PRD 2 rule 3, U11–U13)", () => {
  it("the Registrar and admins see every class; teachers and graders only theirs; others none", () => {
    const all = db.learnCourses.length;
    for (const id of [REGISTRAR, TECH, TECH_TEAM, CHURCH_ADMIN]) expect(must(listCourses(user(id))).items).toHaveLength(all);
    expect(must(listCourses(user(DOYIN))).items.map((c) => c.id).sort()).toEqual(["c-growth", "c-prayer"]);
    expect(must(listCourses(user(DOYIN))).scope).toBe("assigned");
    expect(must(listCourses(user(KEMI))).items.map((c) => c.id).sort()).toEqual(["c-growth", "c-sod"]);
    for (const id of ["u03", "u05", "u11", "u13"]) expect(listCourses(user(id)).status).toBe(403);
    // Someone else's class reads as "not found": hidden means hidden.
    expect(getCourse(user(DOYIN), "c-nb").status).toBe(404);
  });

  it("only the Registrar (and Tech Admin) manage; Church Admin views and exports, never edits", () => {
    expect(must(listCourses(user(REGISTRAR))).can.manage).toBe(true);
    expect(must(listCourses(user(TECH))).can.manage).toBe(true);
    const ca = must(getCourse(user(CHURCH_ADMIN), "c-growth"));
    expect(ca.can).toEqual({ manage: false, author: false, export: true });
    expect(code(createCourse(user(CHURCH_ADMIN), input()))).toBe("FORBIDDEN");
    expect(code(createCourse(user(DOYIN), input()))).toBe("FORBIDDEN");
    // A teacher authors their own class only; a grader doesn't author.
    expect(must(getCourse(user(DOYIN), "c-growth")).can).toEqual({ manage: false, author: true, export: false });
    expect(must(getCourse(user(KEMI), "c-growth")).can.author).toBe(false);
    const s = db.learnSessions.find((x) => x.courseId === "c-growth" && x.number === 6)!;
    expect(code(updateSession(user(KEMI), s.id, { ...s, title: "X" }))).toBe("FORBIDDEN");
    expect(code(logRosterExport(user(DOYIN), "c-growth"))).toBe("FORBIDDEN");
    expect(must(logRosterExport(user(CHURCH_ADMIN), "c-growth")).logged).toBe(true);
    expect(last().action).toBe("learn.roster.export");
  });
});

describe("Grow: the seeded term", () => {
  it("works the status out from the dates", () => {
    expect(statusOf(course("c-growth"))).toBe("in_session");
    expect(statusOf(course("c-doct"))).toBe("open");
    expect(statusOf(course("c-wb"))).toBe("completed");
    expect(statusOf(course("c-ministry"))).toBe("draft");
    expect(statusOf(course("c-prayer"))).toBe("open");
  });

  it("the dashboard lists this week's sessions and what needs attention", () => {
    const o = must(overview(user(REGISTRAR)));
    expect(o.tiles.running).toBeGreaterThanOrEqual(2);
    expect(o.tiles.waitlisted).toBe(3);
    expect(o.week.length).toBeGreaterThanOrEqual(2); // both Sunday classes always meet within 7 days
    const kinds = o.attention.map((a) => `${a.kind}:${a.courseId}`);
    expect(kinds).toContain("draft:c-ministry");
    expect(kinds).toContain("full:c-doct");
    expect(kinds).toContain("unpublished:c-growth");
    // A teacher sees only their classes' items.
    expect(must(overview(user(FOLABI))).attention.every((a) => a.courseId === "c-nb")).toBe(true);
  });
});

describe("Grow: classes (WEB-10, RG-1)", () => {
  it("checks the form and keeps names unique", () => {
    const r = createCourse(user(REGISTRAR), input({ title: "Growth Class (Cohort 2026-B)", teacherIds: [], schedule: { ...input().schedule, day: 2 }, completion: { attendance: 9, assessment: "none" } }));
    expect(code(r)).toBe("VALIDATION_FAILED");
    expect(!r.ok && Object.keys(r.fields ?? {}).sort()).toEqual(["completion.attendance", "schedule.startsOn", "teacherIds", "title"]);
    expect(code(createCourse(user(REGISTRAR), input({ step: 4, prerequisiteSteps: [5] })))).toBe("VALIDATION_FAILED");
    expect(code(createCourse(user(REGISTRAR), input({ teacherIds: [KEMI] })))).toBe("VALIDATION_FAILED");
  });

  it("creates a draft with blank sessions, and publishes only when the checks pass", () => {
    const c = must(createCourse(user(REGISTRAR), input())).course;
    expect(c.state).toBe("draft");
    expect(c.sessions.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(c.sessions[1]!.startsAt).toBe("2027-02-13T01:00:00.000Z"); // Feb 12, 7 pm Central
    expect(c.checks.find((x) => x.id === "first")!.ok).toBe(false);
    expect(code(publishCourse(user(REGISTRAR), c.id, c.rowVer))).toBe("PUBLISH_CHECKS");
    const s1 = c.sessions[0]!;
    must(updateSession(user(REGISTRAR), s1.id, { ...s1, summary: "We begin." }));
    const fresh = must(getCourse(user(REGISTRAR), c.id));
    expect(fresh.checks.every((x) => x.ok)).toBe(true);
    const pub = must(publishCourse(user(REGISTRAR), c.id, fresh.rowVer)).course;
    expect(pub).toMatchObject({ state: "published", registration: "open", status: "open" });
    expect(last().action).toBe("learn.course.publish");
    expect(code(publishCourse(user(REGISTRAR), c.id, pub.rowVer))).toBe("NOT_DRAFT");
  });

  it("refuses stale saves, moves future sessions with the schedule, and adds or trims sessions", () => {
    const c = must(createCourse(user(REGISTRAR), input())).course;
    expect(code(updateCourse(user(REGISTRAR), c.id, { ...input({ title: c.title }), rowVer: c.rowVer + 1 }))).toBe("CONFLICT");
    const r = must(updateCourse(user(REGISTRAR), c.id, { ...input({ title: c.title, schedule: { ...input().schedule, startsOn: "2027-02-12", sessionCount: 5 } }), rowVer: c.rowVer }));
    expect(r.moved).toBe(3);
    expect(r.course.sessions).toHaveLength(5);
    expect(r.course.sessions[4]!.startsAt).toBe("2027-03-13T01:00:00.000Z"); // Mar 12, 7 pm CST (daylight saving starts Mar 14)
    expect(last()).toMatchObject({ action: "learn.course.update" });
    // Trailing sessions with content can't be trimmed away.
    const s5 = r.course.sessions[4]!;
    must(updateSession(user(REGISTRAR), s5.id, { ...s5, summary: "Content" }));
    const now = must(getCourse(user(REGISTRAR), c.id));
    const cut = updateCourse(user(REGISTRAR), c.id, { ...input({ title: c.title, schedule: { ...input().schedule, startsOn: "2027-02-12", sessionCount: 3 } }), rowVer: now.rowVer });
    expect(!cut.ok && cut.fields?.["schedule.sessionCount"]).toBeTruthy();
  });

  it("seats can't drop below the people enrolled, and freed seats go to the waitlist in order", () => {
    const doct = course("c-doct");
    const r = updateCourse(user(REGISTRAR), "c-doct", { ...doct, seats: 10, rowVer: doct.rowVer });
    expect(!r.ok && r.fields?.seats?.[0]).toMatch(/50 people are already enrolled/);
    const up = must(updateCourse(user(REGISTRAR), "c-doct", { ...doct, seats: 52, rowVer: doct.rowVer }));
    expect(up.promoted).toHaveLength(2);
    expect(must(getRoster(user(REGISTRAR), "c-doct")).items.filter((e) => e.status === "waitlisted").map((e) => e.position)).toEqual([1]);
  });

  it("archives only finished or unused classes; deletes only unused drafts", () => {
    const g = course("c-growth");
    expect(code(archiveCourse(user(REGISTRAR), "c-growth", g.rowVer))).toBe("IN_USE");
    const wb = course("c-wb");
    expect(must(archiveCourse(user(REGISTRAR), "c-wb", wb.rowVer)).course.status).toBe("archived");
    expect(code(updateCourse(user(REGISTRAR), "c-wb", { ...wb, rowVer: wb.rowVer }))).toBe("ARCHIVED");
    expect(code(deleteCourse(user(REGISTRAR), "c-growth"))).toBe("IN_USE");
    const c = must(createCourse(user(REGISTRAR), input())).course;
    expect(must(deleteCourse(user(REGISTRAR), c.id)).deleted).toBe(true);
    expect(db.learnSessions.some((s) => s.courseId === c.id)).toBe(false);
  });

  it("opens and closes registration once published", () => {
    const nb = course("c-nb");
    const closed = must(setRegistration(user(REGISTRAR), "c-nb", false, nb.rowVer)).course;
    expect(closed.registration).toBe("closed");
    expect(last().action).toBe("learn.registration.close");
    const m = course("c-ministry");
    expect(code(setRegistration(user(REGISTRAR), "c-ministry", true, m.rowVer))).toBe("NOT_PUBLISHED");
  });
});

describe("Grow: sessions (WEB-10, RG-1)", () => {
  it("a teacher adds a session at a position, and the rest move along", () => {
    const before = course("c-prayer").schedule.sessionCount;
    const r = must(createSession(user(DOYIN), "c-prayer", { title: "Praying for Others", number: 2, kind: "recorded" }));
    expect(r.session.number).toBe(2);
    expect(r.course.sessions.map((s) => s.title).slice(0, 3)).toEqual(["Why We Pray", "Praying for Others", "The Lord's Prayer"]);
    expect(course("c-prayer").schedule.sessionCount).toBe(before + 1);
    expect(code(createSession(user(DOYIN), "c-prayer", { title: "Live one", number: 1, kind: "live" }))).toBe("VALIDATION_FAILED");
  });

  it("won't publish an empty session, or a live online one without its link", () => {
    const s6 = db.learnSessions.find((x) => x.courseId === "c-growth" && x.number === 6)!;
    expect(code(publishSession(user(DOYIN), s6.id, s6.rowVer))).toBe("PUBLISH_CHECKS");
    must(updateSession(user(DOYIN), s6.id, { ...s6, summary: "Our last session.", joinUrl: null }));
    const again = db.learnSessions.find((x) => x.id === s6.id)!;
    const r = publishSession(user(DOYIN), s6.id, again.rowVer);
    expect(!r.ok && r.message).toMatch(/link/);
    must(updateSession(user(DOYIN), s6.id, { ...again, joinUrl: "https://meet.example.org/tkp-growth" }));
    const ready = db.learnSessions.find((x) => x.id === s6.id)!;
    expect(must(publishSession(user(DOYIN), s6.id, ready.rowVer)).session.state).toBe("published");
  });

  it("asks who sees a change once people have opened a published session (RG-1)", () => {
    const s2 = db.learnSessions.find((x) => x.courseId === "c-growth" && x.number === 2)!;
    const r = updateSession(user(DOYIN), s2.id, { ...s2, summary: "Revised summary." });
    expect(code(r)).toBe("APPLY_TO_REQUIRED");
    expect(!r.ok && r.message).toMatch(/people have opened this session/);
    const done = must(updateSession(user(DOYIN), s2.id, { ...s2, summary: "Revised summary.", applyTo: "new" })).session;
    expect(done.version).toBe(2);
    expect(last()).toMatchObject({ action: "learn.session.update", meta: { after: { applyTo: "new", version: 2 } } });
    // Published sessions can't be emptied, unpublished once opened, or deleted.
    expect(code(updateSession(user(DOYIN), s2.id, { ...done, summary: "", video: null, handouts: [], takeaways: [], applyTo: "everyone" }))).toBe("VALIDATION_FAILED");
    expect(code(publishSession(user(DOYIN), s2.id, done.rowVer, false))).toBe("IN_USE");
    expect(code(deleteSession(user(DOYIN), s2.id))).toBe("IN_USE");
  });

  it("checks uploads by kind and size", () => {
    expect(must(upload(user(DOYIN), "video", { name: "Session 6.mp4", size: 500 * 1024 ** 2, type: "video/mp4" })).file.name).toBe("Session 6.mp4");
    expect(code(upload(user(DOYIN), "video", { name: "Session 6.avi", size: 1000, type: "video/x-msvideo" }))).toBe("VALIDATION_FAILED");
    expect(code(upload(user(DOYIN), "handout", { name: "notes.pdf", size: 30 * 1024 ** 2, type: "application/pdf" }))).toBe("VALIDATION_FAILED");
    expect(code(upload(user(KEMI), "handout", { name: "notes.pdf", size: 1000, type: "application/pdf" }))).toBe("FORBIDDEN");
    const f = must(upload(user(DOYIN), "resource", { name: "Reading list.docx", size: 2000, type: "" })).file;
    expect(must(addResource(user(DOYIN), "c-growth", f)).course.resources.some((r) => r.id === f.id)).toBe(true);
    expect(last().action).toBe("learn.resource.add");
  });
});

describe("Grow: rosters and registration controls (WEB-17, RG-4, LMS-3)", () => {
  it("finds people and says what prerequisites they are missing", () => {
    const hits = must(searchPeople(user(REGISTRAR), "c-sod", "okafor")).items;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.missing.includes("Doctrinal Foundations"))).toBe(true);
    expect(code(searchPeople(user(DOYIN), "c-growth", "okafor"))).toBe("FORBIDDEN");
  });

  it("needs a reason to waive a prerequisite, and records it", () => {
    const p = db.learnPeople.find((x) => !x.completedSteps.includes(5) && !db.learnEnrolments.some((e) => e.personId === x.id && e.courseId === "c-sod"))!;
    const r = enrol(user(REGISTRAR), "c-sod", { personId: p.id });
    expect(code(r)).toBe("PREREQUISITE");
    const ok = must(enrol(user(REGISTRAR), "c-sod", { personId: p.id, waive: "Finished Doctrinal Foundations at our Lagos branch" }));
    expect(ok.enrolment).toMatchObject({ status: "enrolled", waived: "Finished Doctrinal Foundations at our Lagos branch" });
    expect(code(enrol(user(REGISTRAR), "c-sod", { personId: p.id }))).toBe("ALREADY_ENROLLED");
  });

  it("keeps External Students out of members-only classes", () => {
    const c = must(createCourse(user(REGISTRAR), input({ audience: "members" }))).course;
    const learner = db.learnPeople.find((x) => x.learner)!;
    expect(code(enrol(user(REGISTRAR), c.id, { personId: learner.id }))).toBe("MEMBERS_ONLY");
  });

  it("waitlists when full, moves the next person up when someone leaves, and lets the Registrar seat someone early", () => {
    const c = must(createCourse(user(REGISTRAR), input({ seats: 1 }))).course;
    const [a, b, d] = db.learnPeople.slice(100, 103);
    const ea = must(enrol(user(REGISTRAR), c.id, { personId: a!.id })).enrolment;
    const eb = must(enrol(user(REGISTRAR), c.id, { personId: b!.id })).enrolment;
    const ed = must(enrol(user(REGISTRAR), c.id, { personId: d!.id })).enrolment;
    expect([ea.status, eb.status, eb.position, ed.position]).toEqual(["enrolled", "waitlisted", 1, 2]);
    expect(code(promote(user(REGISTRAR), ed.id))).toBe("FULL");
    expect(code(withdraw(user(REGISTRAR), ea.id, ""))).toBe("VALIDATION_FAILED");
    const w = must(withdraw(user(REGISTRAR), ea.id, "Can't make Fridays"));
    expect(w.promoted).toEqual([b!.name]);
    const roster = must(getRoster(user(REGISTRAR), c.id)).items;
    expect(roster.map((e) => [e.name, e.status, e.position])).toEqual([
      [b!.name, "enrolled", null],
      [d!.name, "waitlisted", 1],
      [a!.name, "withdrawn", null],
    ]);
    // Someone who left can be added back.
    expect(must(enrol(user(REGISTRAR), c.id, { personId: a!.id })).enrolment).toMatchObject({ status: "waitlisted", position: 2 });
  });

  it("nobody joins a finished class", () => {
    const p = db.learnPeople[5]!;
    expect(code(enrol(user(REGISTRAR), "c-wb", { personId: p.id }))).toMatch(/CLOSED/);
  });
});
