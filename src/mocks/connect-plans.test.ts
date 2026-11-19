import { beforeEach, describe, expect, it } from "vitest";
import { CONNECT_ACCESS_DENIED } from "@/lib/permissions";
import { guestTrack, journey, metrics } from "./connect-plans";
import { db } from "./db";
import type { ConnectRecord } from "./seed/guests";

/** The planned Connect tabs (DRAFT rules, TKP Connect UI-C4…C7, doc 09 Q10–Q13). */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const NOW = new Date("2026-11-19T18:00:00Z");

let r: ConnectRecord;
let n = 0;
beforeEach(() => {
  r = structuredClone(db.connect.find((x) => x.status === "Active")!);
  r.connectId = 95_000 + ++n;
  r.coMemberId = "u06";
  r.itMemberId = "u09";
  r.status = "Active";
  r.state.returned2ndVisit = false;
  r.state.returnVisitDate = null;
  for (const k of Object.keys(r.checklist) as (keyof typeof r.checklist)[]) r.checklist[k] = null;
  db.connect.push(r);
});
const at = (serviceDate: string, submittedAt: string) => {
  r.entry = { ...r.entry, serviceDate, submittedAt };
  r.clockStartAt = submittedAt;
};
const stageOf = () => {
  const res = guestTrack(user("u09"), NOW);
  return res.ok ? res.body.rows.find((x) => x.connectId === r.connectId)?.stage : "error";
};

describe("Guest Track stages (from the three scripts' timing)", () => {
  it("48-hour text while inside 48 hours of the form", () => {
    at("2026-11-18", "2026-11-18T20:00:00Z");
    expect(stageOf()).toBe("48h");
  });
  it("invitation to visit 2 later that week", () => {
    at("2026-11-15", "2026-11-15T17:00:00Z");
    expect(stageOf()).toBe("invite2");
  });
  it("awaiting a second visit up to 4 weeks", () => {
    at("2026-11-01", "2026-11-01T17:00:00Z");
    expect(stageOf()).toBe("awaiting");
  });
  it("invitation to visit 3 just after a confirmed return", () => {
    at("2026-11-01", "2026-11-01T17:00:00Z");
    r.state.returned2ndVisit = true;
    r.state.returnVisitDate = "2026-11-17";
    expect(stageOf()).toBe("invite3");
  });
  it("members see only their own guests", () => {
    at("2026-11-15", "2026-11-15T17:00:00Z");
    const res = guestTrack(user("u07"), NOW); // Church Office member, not assigned
    expect(res.ok && res.body.rows.some((x) => x.connectId === r.connectId)).toBe(false);
  });
});

describe("Guest journey", () => {
  it("the Welcome Team may view it; a TKP Member may not", () => {
    expect(journey(user("u12"), r.connectId, NOW)).toMatchObject({ ok: true });
    expect(journey(user("u13"), r.connectId, NOW)).toMatchObject({ ok: false, message: CONNECT_ACCESS_DENIED });
  });
  it("phase moves appear in the history", () => {
    r.checklist.P1Complete = { at: "2026-11-10T10:00:00Z", byId: "u09", by: "Tobi Martins" };
    const res = journey(user("u09"), r.connectId, NOW);
    expect(res.ok && res.body.events.some((e) => e.kind === "phase" && e.text === "Moved to Phase 2")).toBe(true);
  });
});

describe("Team metrics (draft definitions)", () => {
  it("counts a KPI only when ticked by its deadline", () => {
    at("2026-10-04", "2026-10-04T17:00:00Z");
    r.checklist.P1Welcome48h = { at: "2026-10-05T10:00:00Z", byId: "u09", by: "Tobi Martins" }; // within 48 h
    r.checklist.P1WelcomeCall = { at: "2026-10-20T10:00:00Z", byId: "u09", by: "Tobi Martins" }; // after day 3
    const before = metrics(user("u08"), "2026-10", NOW);
    if (!before.ok) throw new Error("expected ok");
    const k = (key: string) => before.body.kpis.find((x) => x.key === key)!.ratio;
    // The test guest is one of the cohort; compare with the cohort minus this guest.
    db.connect.pop();
    const without = metrics(user("u08"), "2026-10", NOW);
    db.connect.push(r);
    if (!without.ok) throw new Error("expected ok");
    const w = (key: string) => without.body.kpis.find((x) => x.key === key)!.ratio;
    expect(k("P1Welcome48h").done - w("P1Welcome48h").done).toBe(1);
    expect(k("P1WelcomeCall").done - w("P1WelcomeCall").done).toBe(0);
    expect(k("P1WelcomeCall").due - w("P1WelcomeCall").due).toBe(1);
  });
  it("is refused to roles without Connect", () => {
    expect(metrics(user("u12"), null, NOW)).toMatchObject({ ok: false, status: 403 });
  });
});
