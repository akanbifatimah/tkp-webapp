import { describe, expect, it } from "vitest";
import { addMonths, buildLcm, type ZipPoint } from "./lcm-api";
import { db } from "./db";
import type { WelcomeEntry } from "./seed/guests";

/** TKP Connect FI-37 / FI-38 / BR-21 against the mock LCM report. */
const geo = new Map<string, ZipPoint>([
  ["77494", { lat: 29.75, lon: -95.82, county: "Fort Bend", city: "Katy", hasOutline: true }],
  ["77082", { lat: 29.72, lon: -95.63, county: "Harris", city: "Houston", hasOutline: true }],
]);
const NOW = new Date("2026-11-19T18:00:00Z");

const entry = (serviceDate: string, zip: string, extra: Partial<WelcomeEntry> = {}): WelcomeEntry => ({
  ...db.entries[0]!,
  id: Math.floor(Math.random() * 1e9),
  serviceDate,
  serviceType: "Sunday 1st Service",
  zip,
  cellGroup: zip === "77494" ? "Yellow" : "N/A",
  city: zip === "77494" ? "Katy" : "Houston",
  ...extra,
});

describe("LCM report", () => {
  it("defaults to the last full month (church time)", () => {
    const r = buildLcm([], {}, geo, NOW);
    expect(r.meta.month).toBe("2026-10");
    expect(r.meta.asOf).toBe("2026-10-31");
    expect(r.meta.inProgress).toBe(false);
  });

  it("a month still in progress compares the same number of days", () => {
    const r = buildLcm([], { month: "2026-11" }, geo, NOW);
    expect(r.meta.inProgress).toBe(true);
    const mom = r.periods.find((p) => p.comparison === "Month over month")!;
    expect(mom.currentEnd).toBe("2026-11-19");
    expect(mom.priorEnd).toBe("2026-10-19");
  });

  it("counts month over month and year to date", () => {
    const list = [entry("2026-10-04", "77494"), entry("2026-10-11", "77494"), entry("2026-09-06", "77494"), entry("2025-10-05", "77494")];
    const r = buildLcm(list, { month: "2026-10" }, geo, NOW);
    const p = (n: string) => r.periods.find((x) => x.comparison === n)!;
    expect(p("Month over month")).toMatchObject({ current: 2, prior: 1, change: 1, pctChange: 100 });
    expect(p("Year to date")).toMatchObject({ current: 3, prior: 1 });
    expect(p("Year over year (month)")).toMatchObject({ current: 2, prior: 1 });
  });

  it("BR-21: Emerging needs YTD ≥ 10 and ≥ 3× last year; cell ZIPs carry no signal", () => {
    const list = [
      ...Array.from({ length: 10 }, (_, i) => entry(`2026-0${(i % 9) + 1}-07`, "77082")),
      entry("2025-03-02", "77082"),
      entry("2026-10-04", "77494"),
    ];
    const r = buildLcm(list, { month: "2026-10" }, geo, NOW);
    expect(r.emergingZips.find((z) => z.zip === "77082")).toMatchObject({ isEmerging: true, ytd: 10, priorYtd: 1, signal: "Emerging" });
    expect(r.emergingZips.find((z) => z.zip === "77494")).toMatchObject({ isEmerging: false, signal: null, cellGroup: "Yellow" });
  });

  it("an emerging ZIP below the threshold is Growing or Watch", () => {
    const r = buildLcm([entry("2026-10-04", "77082")], { month: "2026-10" }, geo, NOW);
    expect(["Growing", "Watch"]).toContain(r.emergingZips[0]!.signal);
  });

  it("a blank rating is no answer, never 0 (BR-23)", () => {
    const list = [entry("2026-10-04", "77494", { ratings: { Music: 10, Parking: null } }), entry("2026-10-11", "77494", { ratings: { Music: 6, Parking: 4 } })];
    const r = buildLcm(list, { month: "2026-10" }, geo, NOW);
    expect(r.ratings.find((x) => x.dimension === "Music")!.month).toBe(8);
    expect(r.ratings.find((x) => x.dimension === "Parking")).toMatchObject({ month: 4, monthLow: 1 });
  });

  it("filters by service type", () => {
    const list = [entry("2026-10-04", "77494"), entry("2026-10-06", "77494", { serviceType: "Tuesday Bible Study" })];
    expect(buildLcm(list, { month: "2026-10", type: "Tuesday Bible Study" }, geo, NOW).kpis.current.guests).toBe(1);
  });

  it("month arithmetic crosses years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
  });
});

describe("LCM follow-up and growth (former suggested metrics)", () => {
  const ratings = { Music: 9, Preaching: 9, Comfort: 8, Hospitality: 9, ChurchEnvironment: 9, ThePeople: 9, Parking: null, Traffic: null };
  const guest = (serviceDate: string, connectId: number, extra: Partial<WelcomeEntry> = {}) =>
    entry(serviceDate, "77494", { connectId, visitNumber: 1, submittedAt: `${serviceDate}T17:00:00Z`, phone: "(281) 555-0101", ageBracket: "26-30", ratings, ...extra });
  const out = (r: ReturnType<typeof buildLcm>, key: string) => r.outcomes.find((o) => o.key === key)!;

  it("48-hour contact counts the first call or message within 48 hours of the form", () => {
    const logs = db.connectLogs.length;
    const log = (connectId: number, savedAt: string) => db.connectLogs.push({ ...db.connectLogs[0]!, connectId, savedAt, lifeGroup: null });
    log(900001, "2026-10-05T13:00:00Z"); // 20 h
    log(900002, "2026-10-06T17:00:00Z"); // 48 h exactly: counts
    log(900003, "2026-10-07T05:00:00Z"); // 60 h
    try {
      const list = [guest("2026-10-04", 900001), guest("2026-10-04", 900002), guest("2026-10-04", 900003), guest("2026-10-04", 900004)];
      const o = out(buildLcm(list, { month: "2026-10" }, geo, NOW), "contact48h");
      expect(o.cohort).toBe("2026-10");
      expect(o.current).toEqual({ count: 2, of: 4, value: 50 });
      expect(o.open).toBe(0);
    } finally {
      db.connectLogs.splice(logs);
    }
  });

  it("a window still running is reported as open", () => {
    const o = out(buildLcm([guest("2026-11-18", 900010)], { month: "2026-11" }, geo, NOW), "contact48h");
    expect(o.current.count).toBe(0);
    expect(o.open).toBe(1);
  });

  it("return within 30 days measures the previous month's first-time guests, at any service", () => {
    const list = [
      guest("2026-09-06", 900020),
      guest("2026-09-27", 900020, { visitNumber: 2, serviceType: "Tuesday Bible Study" }),
      guest("2026-09-13", 900021),
      guest("2026-10-25", 900021, { visitNumber: 2 }), // 42 days later: not within 30
    ];
    const r = buildLcm(list, { month: "2026-10", type: "Sunday 1st Service" }, geo, NOW);
    expect(out(r, "return30")).toMatchObject({ cohort: "2026-09", current: { count: 1, of: 2, value: 50 }, prior: { cohort: "2026-08" } });
    expect(out(r, "return90")).toMatchObject({ cohort: "2026-07", current: { of: 0, value: null } });
  });

  it("guests per 100 attendees uses the month's service headcounts", () => {
    const heads = db.attendance.filter((a) => a.date >= "2026-10-01" && a.date <= "2026-10-31").reduce((s, a) => s + a.headcount, 0);
    const o = out(buildLcm([guest("2026-10-04", 900030), guest("2026-10-11", 900031), guest("2026-10-18", 900031, { visitNumber: 2 })], { month: "2026-10" }, geo, NOW), "per100");
    expect(heads).toBeGreaterThan(0);
    expect(o.unit).toBe("per 100");
    expect(o.current).toEqual({ count: 2, of: heads, value: Math.round(2000 / heads) / 10 });
  });

  it("data completeness needs phone, ZIP and age; low ratings are 5 or below and name the area's department", () => {
    const list = [
      guest("2026-10-04", 900040),
      guest("2026-10-04", 900041, { phone: null }),
      guest("2026-10-04", 900042, { ratings: { ...ratings, Parking: 3 } }),
      guest("2026-10-04", 900043, { ratings: { ...ratings, Parking: 5, Music: 4 } }),
    ];
    const r = buildLcm(list, { month: "2026-10" }, geo, NOW);
    expect(out(r, "completeness").current).toEqual({ count: 3, of: 4, value: 75 });
    expect(out(r, "completeness").breakdown).toContainEqual({ label: "Phone", count: 3, of: 4 });
    const low = out(r, "lowRatings");
    expect(low.higherIsBetter).toBe(false);
    expect(low.current).toEqual({ count: 2, of: 4, value: 50 });
    expect(low.breakdown![0]).toEqual({ label: "Parking", count: 2, of: 2, note: "Ushering / Protocol" });
    expect(low.breakdown).toContainEqual({ label: "Music", count: 1, of: 4, note: "Choir / Music Ministry" });
  });

  it("returns every measure in a fixed order", () => {
    expect(buildLcm([], {}, geo, NOW).outcomes.map((o) => o.key)).toEqual([
      "contact48h", "return30", "return90", "cellPlacement", "conversion", "undecided", "per100", "completeness", "lowRatings",
    ]);
  });
});
