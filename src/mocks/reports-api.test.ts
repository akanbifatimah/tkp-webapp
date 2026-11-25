import { describe, expect, it } from "vitest";
import type { Result } from "./connect-api";
import { db } from "./db";
import {
  createSchedule,
  deleteSchedule,
  getRecipients,
  getReport,
  listReports,
  listSchedules,
  logReportExport,
  nextRun,
  resolvePeriod,
  runSchedule,
  setScheduleActive,
  shareReport,
  updateSchedule,
} from "./reports-api";

/** M7 step 5: the Reports hub (PRD PL-2 to PL-5, W-9 to W-11). docs/API.md §12. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const CHURCH_ADMIN = "u04";
const PASTOR = "u03";
const WELCOME_LEAD = "u11";
const TECH_TEAM = "u02";
const WELCOME_TEAM = "u12";
const CO_ADMIN = "u05";
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};
const NOW = new Date("2026-11-19T18:00:00Z");

describe("reports: who sees and shares", () => {
  it("everyone who sees LCM sees the hub; leadership and the admins share", () => {
    expect(must(listReports(user(CHURCH_ADMIN))).can.share).toBe(true);
    expect(must(listReports(user(PASTOR))).can.share).toBe(true);
    expect(must(listReports(user(WELCOME_LEAD))).can.share).toBe(true);
    expect(must(listReports(user(TECH_TEAM))).can.share).toBe(false);
    expect(code(listReports(user(WELCOME_TEAM)))).toBe("FORBIDDEN");
  });

  it("the library only lists what the person may open", () => {
    const ids = (id: string) => must(listReports(user(id))).reports.map((r) => r.id);
    expect(ids(CHURCH_ADMIN)).toEqual(["lcm-pack", "ratings-referrals", "ytd-service-location", "retention", "team-metrics", "executive"]);
    expect(ids(WELCOME_LEAD)).toEqual(["lcm-pack", "ratings-referrals", "ytd-service-location", "retention"]);
    expect(must(listReports(user(CHURCH_ADMIN))).reports.find((r) => r.id === "lcm-pack")!.schedules).toBe(1);
  });
});

describe("reports: periods", () => {
  it("resolves each period in church time", () => {
    expect(resolvePeriod("last_full_month", NOW)).toMatchObject({ from: "2026-10", to: "2026-10", label: "Oct 2026", inProgress: false });
    expect(resolvePeriod("last_3_months", NOW)).toMatchObject({ from: "2026-08", to: "2026-10", label: "Aug – Oct 2026" });
    expect(resolvePeriod("last_6_months", NOW).label).toBe("May – Oct 2026");
    expect(resolvePeriod("year_to_date", NOW)).toMatchObject({ from: "2026-01", to: "2026-11", label: "Jan – Nov 2026 (to date)", inProgress: true });
    expect(resolvePeriod("month_to_date", NOW).label).toBe("Nov 2026 (to date)");
  });
});

describe("reports: the numbers (W-10, W-11, PL-2, PL-3)", () => {
  it("ratings and referrals: averages per area, low ratings, small places folded", () => {
    const r = must(getReport(user(CHURCH_ADMIN), "ratings-referrals", { period: "last_6_months" }, NOW));
    if (r.id !== "ratings-referrals") throw new Error("wrong report");
    const d = r.data;
    expect(d.guests).toBeGreaterThan(20);
    expect(d.ratings).toHaveLength(8);
    const parking = d.ratings.find((x) => x.area === "Parking")!;
    expect(parking.owner).toBe("Ushering / Protocol");
    expect(parking.average).toBeGreaterThan(0);
    // Every city on its own has 5 or more guests; the rest are one row.
    expect(d.cities.filter((c) => !c.grouped).every((c) => c.guests >= 5)).toBe(true);
    expect(d.cities.reduce((s, c) => s + c.guests, 0)).toBe(d.guests);
    expect(d.howHeard.reduce((s, c) => s + c.guests, 0)).toBe(d.guests);
    expect(d.inviters.every((i) => i.guests > 1)).toBe(true);
    expect(db.audit[0]).toMatchObject({ action: "reports.view", target: "ratings-referrals" });
  });

  it("year to date: first-time guests this year against the same days last year", () => {
    const r = must(getReport(user(CHURCH_ADMIN), "ytd-service-location", {}, NOW));
    if (r.id !== "ytd-service-location") throw new Error("wrong report");
    const d = r.data;
    expect(d.year).toBe(2026);
    expect(d.byMonth.map((m) => m.month)).toEqual(Array.from({ length: 11 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`));
    expect(d.byMonth.reduce((s, m) => s + m.thisYear, 0)).toBe(d.thisYear);
    expect(d.byService.reduce((s, m) => s + m.guests, 0)).toBe(d.thisYear);
    expect(d.byService.reduce((s, m) => s + (m.prior ?? 0), 0)).toBe(d.lastYear);
    expect(d.byCity.filter((c) => !c.grouped).every((c) => c.guests >= 5 || (c.prior ?? 0) >= 5)).toBe(true);
    const tue = must(getReport(user(CHURCH_ADMIN), "ytd-service-location", { type: "Tuesday Bible Study" }, NOW));
    if (tue.id !== "ytd-service-location") throw new Error("wrong report");
    expect(tue.data.byService.map((s) => s.label)).toEqual(["Tuesday Bible Study"]);
  });

  it("retention: back within 30 days by signal, small cohorts hidden", () => {
    const r = must(getReport(user(CHURCH_ADMIN), "retention", { period: "last_6_months" }, NOW));
    if (r.id !== "retention") throw new Error("wrong report");
    const d = r.data;
    expect(d.cohorts.map((c) => c.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    for (const c of d.cohorts) {
      if (c.hidden) expect(c).toMatchObject({ rate: null, back: 0 });
      else expect(c.back).toBe(c.viaForm + c.viaConnect + c.viaBoth);
    }
    expect(d.total.firstTime).toBe(d.cohorts.reduce((s, c) => s + c.firstTime, 0));
    const tue = must(getReport(user(CHURCH_ADMIN), "retention", { period: "last_3_months", type: "Tuesday Bible Study" }, NOW));
    if (tue.id !== "retention") throw new Error("wrong report");
    expect(tue.data.cohorts.every((c) => c.firstTime >= 5 || c.hidden)).toBe(true);
  });

  it("refuses an unknown report or service, and logs exports", () => {
    expect(code(getReport(user(CHURCH_ADMIN), "nope", {}))).toBe("NOT_FOUND");
    expect(code(getReport(user(CHURCH_ADMIN), "retention", { type: "Youth Night" }))).toBe("VALIDATION_FAILED");
    expect(code(getReport(user(WELCOME_TEAM), "retention", {}))).toBe("FORBIDDEN");
    must(logReportExport(user(PASTOR), "retention", { format: "csv", period: "last_6_months" }));
    expect(db.audit[0]).toMatchObject({ action: "reports.export", meta: { after: { format: "CSV", period: "Last 6 full months" } } });
    expect(code(logReportExport(user(PASTOR), "retention", { format: "xls" }))).toBe("VALIDATION_FAILED");
  });
});

describe("reports: sharing (W-9, PL-4)", () => {
  it("only people who may open the report can receive it", () => {
    const people = must(getRecipients(user(CHURCH_ADMIN), "ratings-referrals")).items;
    expect(people.find((p) => p.id === WELCOME_TEAM)).toMatchObject({ eligible: false, reason: "Can't open this report" });
    expect(people.find((p) => p.id === CO_ADMIN)!.eligible).toBe(true);
    expect(people.some((p) => p.id === "u16")).toBe(false); // deactivated
    expect(people.some((p) => p.id === "u13")).toBe(false); // member only
    const bad = shareReport(user(CHURCH_ADMIN), "ratings-referrals", { period: "last_full_month", format: "pdf", recipients: [PASTOR, WELCOME_TEAM], message: null, serviceType: null });
    expect(code(bad)).toBe("VALIDATION_FAILED");
    expect(!bad.ok && bad.fields?.recipients).toEqual(["Naomi Bello can't open this report"]);
  });

  it("share now records a run and audits it; tech team can't share", () => {
    const run = must(shareReport(user(WELCOME_LEAD), "retention", { period: "last_6_months", format: "csv", recipients: [PASTOR, CHURCH_ADMIN], message: "For Thursday", serviceType: null }, NOW));
    expect(run).toMatchObject({ reportTitle: "Retention", period: "May – Oct 2026", format: "csv", sentTo: ["Samuel Bankole", "Esther Coleman"], by: "Michael Otieno", status: "sent" });
    expect(db.audit[0]).toMatchObject({ action: "reports.share", target: "retention" });
    expect(code(shareReport(user(TECH_TEAM), "retention", { period: "last_6_months", format: "csv", recipients: [PASTOR], message: null, serviceType: null }))).toBe("FORBIDDEN");
    expect(code(shareReport(user(CHURCH_ADMIN), "team-metrics", { period: "last_full_month", format: "pdf", recipients: [PASTOR], message: null, serviceType: null }))).toBe("NOT_SHAREABLE");
    expect(code(shareReport(user(CHURCH_ADMIN), "lcm-pack", { period: "last_full_month", format: "csv", recipients: [PASTOR], message: null, serviceType: null }))).toBe("VALIDATION_FAILED");
  });
});

describe("reports: schedules", () => {
  const input = {
    reportId: "ytd-service-location" as const,
    name: "YTD for the pastor",
    period: "year_to_date" as const,
    serviceType: null,
    frequency: "monthly" as const,
    day: 3,
    time: "09:15",
    format: "pdf" as const,
    recipients: [PASTOR],
    message: null,
  };

  it("works out the next run in church time", () => {
    expect(nextRun({ frequency: "monthly", day: 2, time: "08:00" }, NOW)).toBe("2026-12-02T14:00:00.000Z");
    expect(nextRun({ frequency: "weekly", day: 1, time: "07:30" }, NOW)).toBe("2026-11-23T13:30:00.000Z");
    // Today's time not passed yet: today.
    expect(nextRun({ frequency: "weekly", day: 4, time: "18:00" }, NOW)).toBe("2026-11-20T00:00:00.000Z");
  });

  it("create, change, pause, send now, delete; every step audited", () => {
    const s = must(createSchedule(user(CHURCH_ADMIN), input));
    expect(s).toMatchObject({ reportTitle: "Year to date by service and location", active: true, recipients: [{ id: PASTOR, name: "Samuel Bankole" }], rowVer: 1 });
    expect(s.nextRunAt).not.toBeNull();
    expect(code(createSchedule(user(CHURCH_ADMIN), input))).toBe("NAME_TAKEN");
    expect(code(createSchedule(user(CHURCH_ADMIN), { ...input, name: "x2", frequency: "monthly", day: 31 }))).toBe("VALIDATION_FAILED");
    expect(code(createSchedule(user(CHURCH_ADMIN), { ...input, name: "x3", time: "25:00" }))).toBe("VALIDATION_FAILED");

    const u = must(updateSchedule(user(CHURCH_ADMIN), s.id, { ...input, time: "10:00", recipients: [PASTOR, WELCOME_LEAD], rowVer: 1 }));
    expect(u.rowVer).toBe(2);
    expect(db.audit[0]).toMatchObject({ action: "reports.schedule.update", meta: { before: { when: "Monthly on day 3 at 09:15" }, after: { when: "Monthly on day 3 at 10:00" } } });
    expect(code(updateSchedule(user(CHURCH_ADMIN), s.id, { ...input, rowVer: 1 }))).toBe("CONFLICT");

    const p = must(setScheduleActive(user(CHURCH_ADMIN), s.id, false, 2));
    expect(p).toMatchObject({ active: false, nextRunAt: null });
    const run = must(runSchedule(user(CHURCH_ADMIN), s.id, NOW));
    expect(run).toMatchObject({ scheduleName: "YTD for the pastor", sentTo: ["Samuel Bankole", "Michael Otieno"], status: "sent" });
    expect(must(listSchedules(user(PASTOR))).items.find((x) => x.id === s.id)!.lastRun!.id).toBe(run.id);

    must(deleteSchedule(user(CHURCH_ADMIN), s.id));
    expect(db.audit[0]).toMatchObject({ action: "reports.schedule.delete", meta: { before: { name: "YTD for the pastor" } } });
    expect(code(deleteSchedule(user(CHURCH_ADMIN), s.id))).toBe("NOT_FOUND");
    expect(code(createSchedule(user(TECH_TEAM), { ...input, name: "Tech" }))).toBe("FORBIDDEN");
  });

  it("skips people who can no longer open the report", () => {
    const s = must(createSchedule(user(CHURCH_ADMIN), { ...input, name: "Skip test", recipients: [WELCOME_LEAD] }));
    const lead = user(WELCOME_LEAD);
    const roles = lead.roles;
    lead.roles = ["welcome_team"];
    try {
      const run = must(runSchedule(user(CHURCH_ADMIN), s.id, NOW));
      expect(run).toMatchObject({ status: "skipped", sentTo: [] });
      expect(run.note).toMatch(/Not sent to Michael Otieno/);
    } finally {
      lead.roles = roles;
    }
  });
});
