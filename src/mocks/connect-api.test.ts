import { beforeEach, describe, expect, it } from "vitest";
import type { SaveLogBody } from "@/features/connect/types";
import { CONNECT_ACCESS_DENIED, NO_FOLLOW_UP_TEAM } from "@/lib/permissions";
import { assign, getGuest, getLogs, getQueue, membersOf, saveLog } from "./connect-api";
import { db } from "./db";
import type { ConnectRecord } from "./seed/guests";

/**
 * TKP Connect's acceptance tests (doc 07 FI-50…FI-70) run against the mock
 * server, so the backend team can read them as the expected behaviour.
 */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const tobi = () => user("u09"); // Integration Team member
const lydia = () => user("u06"); // Church Office member
const joy = () => user("u08"); // Integration Admin
const ruth = () => user("u05"); // Church Office Admin

let r: ConnectRecord;
let n = 0;

/** A fresh Active guest assigned to Lydia (Church Office) and Tobi (Integration). */
beforeEach(() => {
  r = structuredClone(db.connect.find((x) => x.status === "Active" && x.phase === 1)!);
  r.connectId = 90_000 + ++n;
  r.coMemberId = "u06";
  r.itMemberId = "u09";
  r.rowVer = 1;
  for (const k of Object.keys(r.checklist) as (keyof typeof r.checklist)[]) r.checklist[k] = null;
  r.phase = 1;
  db.connect.push(r);
});

const itLog = (extra: Partial<SaveLogBody> = {}): SaveLogBody => ({
  connectId: r.connectId,
  team: "integration",
  clientRequestId: crypto.randomUUID(),
  rowVer: String(r.rowVer),
  method: "Phone Call",
  callOutcome: "Reached",
  note: "Test",
  stepsTicked: [],
  stepsUnticked: [],
  phase: 1,
  ...extra,
});

describe("access (doc 02)", () => {
  it("FI-08: Welcome roles get the exact Access Denied message", () => {
    const res = getQueue(user("u12"), { team: null, date: null });
    expect(res).toMatchObject({ ok: false, status: 403, message: CONNECT_ACCESS_DENIED });
  });

  it("AC-04: a team role without a follow-up team gets the exact message", () => {
    expect(getQueue(user("u15"), { team: null, date: null })).toMatchObject({ ok: false, message: NO_FOLLOW_UP_TEAM });
  });

  it("AC-01: members see only their own guests; admins their whole team", () => {
    const mine = getQueue(tobi(), { team: "integration", date: "all" });
    expect(mine.ok && mine.body.rows.every((x) => x.itMemberId === "u09")).toBe(true);
    expect(mine.ok && mine.body.seesWholeTeam).toBe(false);
    const team = getQueue(joy(), { team: "integration", date: "all" });
    expect(team.ok && team.body.seesWholeTeam && team.body.rows.length > (mine.ok ? mine.body.rows.length : 0)).toBe(true);
  });

  it("AC-04: team admins cannot open the other team", () => {
    expect(getQueue(joy(), { team: "church_office", date: null })).toMatchObject({ ok: false, status: 403 });
  });

  it("FI-51: opens on the latest service date with Active journeys", () => {
    const res = getQueue(joy(), { team: null, date: null });
    expect(res.ok && res.body.date).toBe(res.ok && res.body.dates[0]);
  });
});

describe("assignment (FI-54, AC-02/03)", () => {
  it("team admins assign only within their team, and only team members", () => {
    expect(assign(ruth(), { connectId: r.connectId, team: "church_office", memberId: "u07" })).toMatchObject({ ok: true });
    expect(assign(ruth(), { connectId: r.connectId, team: "integration", memberId: "u09" })).toMatchObject({ ok: false, status: 403 });
    expect(assign(ruth(), { connectId: r.connectId, team: "church_office", memberId: "u09" })).toMatchObject({
      ok: false,
      message: "That person is not on this team.",
    });
  });

  it("a person on Both appears in both teams' lists (FI-06)", () => {
    expect(membersOf("church_office").some((m) => m.id === "u10")).toBe(true);
    expect(membersOf("integration").some((m) => m.id === "u10")).toBe(true);
  });

  it("Tech Team never assigns", () => {
    expect(assign(user("u02"), { connectId: r.connectId, team: "integration", memberId: "u09" })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("save log (FI-57…FI-66)", () => {
  it("FI-65: only the assignee may save", () => {
    expect(saveLog(joy(), itLog())).toMatchObject({
      ok: false,
      status: 403,
      message: "Only the Integration Team person assigned to this guest can save a log.",
    });
  });

  it("FI-65: a double click makes one log (idempotent)", () => {
    const body = itLog();
    const before = db.connectLogs.length;
    const a = saveLog(tobi(), body);
    const b = saveLog(tobi(), body);
    expect(a.ok && b.ok && b.body.duplicate).toBe(true);
    expect(db.connectLogs.length).toBe(before + 1);
  });

  it("FI-65: a stale form gets 409", () => {
    saveLog(tobi(), itLog());
    expect(saveLog(tobi(), itLog({ rowVer: "1" }))).toMatchObject({
      ok: false,
      status: 409,
      message: "Someone else saved this guest a moment ago. Reload and try again.",
    });
  });

  it("BR-08: the outcome must match the method", () => {
    expect(saveLog(tobi(), itLog({ method: "SMS", callOutcome: "Reached" }))).toMatchObject({ ok: false, status: 400 });
  });

  it("BR-17: Not Applicable is exclusive", () => {
    const multi = Object.fromEntries(Object.keys(r.state.multi).map((k) => [k, false])) as SaveLogBody["multi"] & object;
    multi.SpNotApplicable = true;
    multi.SpWaterBaptism = true;
    expect(saveLog(tobi(), itLog({ multi }))).toMatchObject({
      ok: false,
      message: "Spiritual Outcome: Not Applicable cannot be combined with other options",
    });
  });

  it("BR-10: a team may tick only its own checklist items", () => {
    expect(saveLog(tobi(), itLog({ stepsTicked: ["CoWelcomeCall"] }))).toMatchObject({
      ok: false,
      message: "A checklist item does not belong to this team.",
    });
  });

  it("FI-60: ticking Phase 1 Complete moves the guest to Phase 2; P3 Complete completes", () => {
    const a = saveLog(tobi(), itLog({ stepsTicked: ["P1Welcome48h", "P1Complete"] }));
    expect(a.ok && a.body.phase).toBe(2);
    const b = saveLog(tobi(), itLog({ phase: 3, stepsTicked: ["P2Complete", "P3Complete"] }));
    expect(b.ok && b.body.status).toBe("Completed");
  });

  it("BR-10: the first tick keeps its time and author", () => {
    saveLog(tobi(), itLog({ stepsTicked: ["P1Welcome48h"] }), new Date("2026-11-16T10:00:00Z"));
    saveLog(tobi(), itLog({ stepsTicked: ["P1Welcome48h"] }), new Date("2026-11-17T10:00:00Z"));
    expect(r.checklist.P1Welcome48h?.at).toBe("2026-11-16T10:00:00.000Z");
  });

  it("FI-59: Membership Not Interested closes the journey; closed journeys refuse logs", () => {
    const a = saveLog(tobi(), itLog({ membership: "Not Interested" }));
    expect(a.ok && a.body.status).toBe("Closed");
    expect(r.closedReason).toBe("Not interested (Integration)");
    expect(saveLog(tobi(), itLog())).toMatchObject({ ok: false, status: 409, message: "This guest's journey is closed. Reopen it before logging." });
  });

  it("FI-59: Church Office “Not Interested in Becoming a Member” closes it too", () => {
    const a = saveLog(lydia(), {
      ...itLog({ team: "church_office", phase: undefined }),
      nextAction: "Not Interested in Becoming a Member",
    });
    expect(a.ok && a.body.status).toBe("Closed");
    expect(r.closedReason).toBe("Not interested (Church office)");
  });

  it("BR-16: department is kept only when Workforce = Interested", () => {
    saveLog(tobi(), itLog({ workforce: "Interested", departmentId: 2 }));
    expect(r.state.itDepartmentId).toBe(2);
    saveLog(tobi(), itLog({ workforce: "Undecided", departmentId: 2 }));
    expect(r.state.itDepartmentId).toBeNull();
  });

  it("FI-62: returned for a 2nd visit needs a date", () => {
    expect(saveLog(tobi(), itLog({ returned2ndVisit: true, returnVisitDate: null }))).toMatchObject({ message: "Choose the return visit date" });
  });

  it("FI-61 / FI-64: the guest view carries the Church Office note and my list", () => {
    saveLog(lydia(), { ...itLog({ team: "church_office", phase: undefined }), note: "Reached on Monday." });
    const g = getGuest(tobi(), r.connectId, "integration");
    expect(g.ok && g.body.guest.coNote?.note).toBe("Reached on Monday.");
    expect(g.ok && g.body.myList.includes(r.connectId)).toBe(true);
    expect(g.ok && g.body.canSave).toBe(true);
    const viewer = getGuest(joy(), r.connectId, "integration");
    expect(viewer.ok && viewer.body.canSave).toBe(false);
  });

  it("FI-67: members see their own logs; team admins see the team's", () => {
    saveLog(tobi(), itLog());
    const own = getLogs(tobi(), { team: "integration", connectId: null });
    expect(own.ok && own.body.all === false && own.body.logs.every((l) => l.authorId === "u09")).toBe(true);
    const team = getLogs(joy(), { team: "integration", connectId: null });
    expect(team.ok && team.body.all && team.body.logs.some((l) => l.authorId !== "u08")).toBe(true);
  });
});
