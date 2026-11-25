import { describe, expect, it } from "vitest";
import type { Result } from "./connect-api";
import { db } from "./db";
import { checkQr, createQr, deleteQr, getQr, listQr, logPrint, resolveQr, setQrDates, setQrState, statusOf, updateQr, expiryProblem } from "./qr-api";

/** M7 step 2: QR codes (PRD 5.8, QR-1 to QR-10). docs/API.md §9. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const TECH = "u01";
const CHURCH_ADMIN = "u04";
const INTEGRATION_ADMIN = "u08";
const WELCOME_TEAM = "u12";
const PASTOR = "u03";
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const rec = (id: string) => db.qrCodes.find((c) => c.id === id)!;
const last = () => db.audit[0]!;
const H = 3_600_000;

describe("QR codes: who may do what (PRD 5.8)", () => {
  it("admins and the integration lead manage; the welcome team prints; the pastor reads counts", () => {
    for (const id of [TECH, CHURCH_ADMIN, INTEGRATION_ADMIN]) {
      const r = listQr(user(id));
      expect(r.ok && r.body.can).toEqual({ manage: true, print: true });
    }
    const team = listQr(user(WELCOME_TEAM));
    expect(team.ok && team.body.can).toEqual({ manage: false, print: true });
    const pastor = listQr(user(PASTOR));
    expect(pastor.ok && pastor.body.can).toEqual({ manage: false, print: false });
    expect(code(createQr(user(WELCOME_TEAM), { name: "X", destination: "guest_form" }))).toBe("FORBIDDEN");
    expect(code(logPrint(user(PASTOR), { ids: ["qr-2"], layout: "poster" }))).toBe("FORBIDDEN");
    for (const id of ["u05", "u06", "u09", "u13"]) expect(listQr(user(id)).status).toBe(403);
  });
});

describe("status from state and dates (QR-1, QR-10)", () => {
  const now = new Date("2026-11-23T18:00:00Z");
  it("works out Draft, Scheduled, Active, Paused and Expired at read time", () => {
    expect(statusOf({ state: "draft", activeFrom: null, expiresAt: null }, now)).toBe("draft");
    expect(statusOf({ state: "paused", activeFrom: null, expiresAt: null }, now)).toBe("paused");
    expect(statusOf({ state: "live", activeFrom: "2026-12-01T00:00:00Z", expiresAt: null }, now)).toBe("scheduled");
    expect(statusOf({ state: "live", activeFrom: "2026-11-01T00:00:00Z", expiresAt: "2026-11-23T18:00:00Z" }, now)).toBe("expired");
    expect(statusOf({ state: "live", activeFrom: "2026-11-01T00:00:00Z", expiresAt: "2026-11-23T18:01:00Z" }, now)).toBe("active");
  });

  it("the seeded list covers every status, with scan counts and the short address", () => {
    const r = listQr(user(CHURCH_ADMIN));
    if (!r.ok) throw new Error(r.message);
    const by = Object.fromEntries(r.body.items.map((c) => [c.id, c]));
    expect(by["qr-1"]!.legacy).toBe(true);
    expect(by["qr-1"]!.shortUrl).toBe("https://www.example.org/welcome-form");
    expect(by["qr-2"]!.shortUrl).toBe("https://go.tkp.example/HELLO7");
    expect(by["qr-5"]!.status).toBe("expired");
    expect(by["qr-6"]!.status).toBe("paused");
    expect(by["qr-7"]!.status).toBe("draft");
    expect(by["qr-1"]!.scans.total).toBeGreaterThan(by["qr-2"]!.scans.total);
    expect(r.body.targets.event.map((t) => t.name)).toContain("168 Hours of Praise");
  });
});

describe("create and validate", () => {
  it("needs a name, a destination and a target for events and courses; expiry after start (QR-4)", () => {
    const u = user(CHURCH_ADMIN);
    const bad = createQr(u, { name: "", destination: "event", targetId: null, expiresAt: "2026-01-01T00:00:00Z", activeFrom: "2026-02-01T00:00:00Z" });
    expect(!bad.ok && bad.fields).toMatchObject({ name: expect.any(Array), targetId: ["Choose the event"], expiresAt: ["The expiry must be after the start"] });
    expect(code(createQr(u, { name: "Welcome desk table card", destination: "guest_form" }))).toBe("NAME_TAKEN");
  });

  it("gives a new code a short permanent address, starts it now when no start is given, and audits it", () => {
    const now = new Date("2026-11-23T18:00:00Z");
    const r = createQr(user(CHURCH_ADMIN), { name: "Easter invite card", destination: "plan_visit" }, now);
    if (!r.ok) throw new Error(r.message);
    expect(r.status).toBe(201);
    expect(r.body.code.slug).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(r.body.code.activeFrom).toBe(now.toISOString());
    expect(r.body.code.caption).toBe("Plan your visit");
    expect(last().action).toBe("welcome.qr.create");
  });

  it("registers the printed code as a legacy code without a new address (QR-7)", () => {
    const u = user(INTEGRATION_ADMIN);
    expect(createQr(u, { name: "Old flyer", destination: "guest_form", legacyUrl: "not a url" }).ok).toBe(false);
    expect(code(createQr(u, { name: "Old flyer", destination: "guest_form", legacyUrl: "https://www.example.org/welcome-form" }))).toBe("VALIDATION_FAILED");
    const r = createQr(u, { name: "Old flyer", destination: "guest_form", legacyUrl: "https://www.example.org/old-flyer", draft: true });
    if (!r.ok) throw new Error(r.message);
    expect(r.body.code).toMatchObject({ legacy: true, slug: null, shortUrl: "https://www.example.org/old-flyer", status: "active" });
    expect(last().action).toBe("welcome.qr.legacy");
    expect(code(deleteQr(u, r.body.code.id))).toBe("LEGACY_CODE");
  });
});

describe("change, quick edit, renew (QR-4, QR-9)", () => {
  it("quick edit changes only the dates and logs old and new", () => {
    const c = rec("qr-2");
    const exp = new Date(Date.now() + 30 * 24 * H).toISOString();
    const r = setQrDates(user(CHURCH_ADMIN), "qr-2", { activeFrom: c.activeFrom, expiresAt: exp, rowVer: c.rowVer });
    expect(r.ok).toBe(true);
    expect(last()).toMatchObject({ action: "welcome.qr.dates", meta: { before: { expiresAt: null }, after: { expiresAt: exp } } });
    expect(code(setQrDates(user(CHURCH_ADMIN), "qr-2", { activeFrom: c.activeFrom, expiresAt: null, rowVer: 1 }))).toBe("CONFLICT");
    expect(code(setQrDates(user(CHURCH_ADMIN), "qr-2", { activeFrom: exp, expiresAt: c.activeFrom, rowVer: c.rowVer }))).toBe("VALIDATION_FAILED");
  });

  it("moving an expired code's expiry forward is allowed and logged as a renewal", () => {
    const c = rec("qr-5");
    expect(statusOf(c, new Date())).toBe("expired");
    const r = setQrDates(user(CHURCH_ADMIN), "qr-5", { activeFrom: c.activeFrom, expiresAt: null, rowVer: c.rowVer });
    expect(r.ok && r.body.code.status).toBe("active");
    expect(last().action).toBe("welcome.qr.renew");
  });

  it("a full edit keeps the printed address and logs what changed", () => {
    const c = rec("qr-6");
    const slug = c.slug;
    const r = updateQr(user(INTEGRATION_ADMIN), "qr-6", { name: c.name, destination: "course", targetId: "crs-2", serviceId: null, activeFrom: c.activeFrom, expiresAt: null, note: c.note, caption: c.caption, rowVer: c.rowVer });
    if (!r.ok) throw new Error(r.message);
    expect(r.body.code.slug).toBe(slug);
    expect(r.body.code.destinationLabel).toBe("Course · Baptism Class");
    expect(last()).toMatchObject({ action: "welcome.qr.update", meta: { before: { destination: "Course · Foundation Class" }, after: { destination: "Course · Baptism Class" } } });
  });

  it("pause, resume and turn on a draft", () => {
    const u = user(CHURCH_ADMIN);
    const live = rec("qr-2");
    expect(setQrState(u, "qr-2", "paused", live.rowVer).ok).toBe(true);
    expect(last().action).toBe("welcome.qr.pause");
    expect(setQrState(u, "qr-2", "live", live.rowVer).ok).toBe(true);
    expect(last().action).toBe("welcome.qr.resume");
    const draft = rec("qr-7");
    expect(code(setQrState(u, "qr-7", "paused", draft.rowVer))).toBe("NOT_LIVE");
    const r = setQrState(u, "qr-7", "live", draft.rowVer);
    expect(r.ok && r.body.code.status).toBe("active");
    expect(last().action).toBe("welcome.qr.publish");
  });
});

describe("QR-8 as TKP decided: errors that block saving, no warnings", () => {
  it("two codes for the same place are normal: no error, no warning", () => {
    const r = createQr(user(CHURCH_ADMIN), { name: "Second welcome card", destination: "guest_form" });
    expect(r.ok).toBe(true);
    const list = listQr(user(CHURCH_ADMIN));
    expect(list.ok && "warnings" in list.body.items[0]!).toBe(false);
  });

  it("an event code must run until the event ends", () => {
    const now = new Date("2026-11-23T18:00:00Z");
    expect(expiryProblem(rec("qr-3"), now)).toBeNull();
    expect(expiryProblem({ ...rec("qr-3"), expiresAt: "2027-01-09T04:00:00.000Z" }, now)).toMatch(/^It would stop before 168 Hours of Praise ends/);
    const c = rec("qr-3");
    const r = setQrDates(user(CHURCH_ADMIN), "qr-3", { activeFrom: c.activeFrom, expiresAt: "2027-01-09T04:00:00.000Z", rowVer: c.rowVer }, now);
    expect(code(r)).toBe("VALIDATION_FAILED");
    expect(!r.ok && r.fields?.expiresAt?.[0]).toMatch(/168 Hours of Praise/);
  });

  it("a code for a weekly service must not stop before or during the next one", () => {
    // Sunday 1st Service, 9:30 am Central = 15:30 UTC on Sun Nov 29, 2026.
    const now = new Date("2026-11-25T18:00:00Z");
    const base = { destination: "plan_visit" as const, targetId: null, serviceId: "svc-1", activeFrom: null };
    expect(expiryProblem({ ...base, expiresAt: "2026-11-28T18:00:00Z" }, now)).toMatch(/^It would stop before the next Sunday 1st Service/);
    expect(expiryProblem({ ...base, expiresAt: "2026-11-29T16:00:00Z" }, now)).toMatch(/^It would stop during Sunday 1st Service/);
    expect(expiryProblem({ ...base, expiresAt: "2026-11-29T18:00:00Z" }, now)).toBeNull();
    expect(expiryProblem({ ...base, expiresAt: null }, now)).toBeNull();
    const r = createQr(user(CHURCH_ADMIN), { name: "Too short", destination: "plan_visit", serviceId: "svc-1", expiresAt: "2026-11-28T18:00:00Z" }, now);
    expect(code(r)).toBe("VALIDATION_FAILED");
    expect(!r.ok && Object.keys(r.fields ?? {})).toEqual(["expiresAt"]);
  });

  it("the form checks before saving", () => {
    const now = new Date("2026-11-25T18:00:00Z");
    const bad = checkQr(user(CHURCH_ADMIN), { destination: "plan_visit", serviceId: "svc-1", expiresAt: "2026-11-28T18:00:00Z" }, now);
    expect(bad.ok && bad.body.fields.expiresAt).toMatch(/Sunday 1st Service/);
    const fine = checkQr(user(CHURCH_ADMIN), { destination: "guest_form" }, now);
    expect(fine.ok && fine.body.fields).toEqual({});
  });
});

describe("scans (QR-2, QR-3, QR-6)", () => {
  it("an active code redirects and counts the scan against the service running", () => {
    const sunday = new Date("2026-11-29T15:45:00Z"); // 9:45 am Central
    const c = rec("qr-2");
    c.state = "live";
    const before = db.qrScans.filter((s) => s.codeId === "qr-2" && !s.inactive).reduce((a, s) => a + s.n, 0);
    const r = resolveQr("hello7", sunday);
    expect(r).toEqual({ outcome: "redirect", url: "https://hub.tkp.example/welcome" });
    const row = db.qrScans.find((s) => s.codeId === "qr-2" && s.date === "2026-11-29")!;
    expect(row.serviceId).toBe("svc-1");
    expect(db.qrScans.filter((s) => s.codeId === "qr-2" && !s.inactive).reduce((a, s) => a + s.n, 0)).toBe(before + 1);
  });

  it("before the start, after expiry, paused or unknown: the inactive page with links, never a blank error", () => {
    const early = resolveQr("HOP168", new Date("2026-11-23T18:00:00Z"));
    expect(early).toMatchObject({ outcome: "inactive", reason: "not_started", startsAt: "2026-12-20T14:00:00.000Z" });
    expect(early.outcome === "inactive" && early.links.map((l) => l.label)).toEqual(["Fill in the guest form", "Plan a Visit"]);
    expect(resolveQr("NOPE00")).toMatchObject({ outcome: "inactive", reason: "unknown" });
    // Read at request time: a date change applies to the very next scan.
    const c = rec("qr-3");
    const from = c.activeFrom;
    c.activeFrom = "2026-11-01T00:00:00.000Z";
    expect(resolveQr("HOP168", new Date("2026-11-23T18:00:00Z")).outcome).toBe("redirect");
    c.activeFrom = from;
  });

  it("the detail has 60 days by day and counts by service, without personal data", () => {
    const r = getQr(user(PASTOR), "qr-1");
    if (!r.ok) throw new Error(r.message);
    expect(r.body.byDay).toHaveLength(60);
    expect(r.body.byService[0]!.service).toBe("Sunday 1st Service");
    expect(Object.keys(db.qrScans[0]!).sort()).toEqual(["codeId", "date", "inactive", "n", "serviceId"]);
  });
});

describe("delete and print", () => {
  it("deletes after the UI's confirmation and logs the old dates", () => {
    const c = rec("qr-4");
    expect(deleteQr(user(CHURCH_ADMIN), "qr-4").ok).toBe(true);
    expect(last()).toMatchObject({ action: "welcome.qr.delete", meta: { before: { name: c.name, expiresAt: c.expiresAt } } });
    expect(resolveQr("XOVER1")).toMatchObject({ outcome: "inactive", reason: "unknown" });
  });

  it("logs a print with its layout", () => {
    expect(logPrint(user(WELCOME_TEAM), { ids: ["qr-1", "qr-2"], layout: "table_card", copies: 2 }).ok).toBe(true);
    expect(last()).toMatchObject({ action: "welcome.qr.print", target: "2 codes", meta: { after: { layout: "table_card", copies: 2 } } });
    expect(code(logPrint(user(WELCOME_TEAM), { ids: [], layout: "poster" }))).toBe("VALIDATION_FAILED");
  });
});
