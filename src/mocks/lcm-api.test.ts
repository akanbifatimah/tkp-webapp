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
