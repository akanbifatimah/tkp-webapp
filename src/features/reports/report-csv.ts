import { toCsv } from "@/features/welcome/import-files";
import type { CountRow, RatingsReport, ReportData, RetentionReport, YtdReport } from "./report-types";

/** The CSV export of each hub report: the same numbers as the screen, with the period on top. Formula-safe (toCsv). */

const rows = (title: string, list: CountRow[], prior = false): string[][] => [
  [],
  [title],
  prior ? ["", "Guests", "Same days last year"] : ["", "Guests", "Share %"],
  ...list.map((r) => (prior ? [r.label, String(r.guests), String(r.prior ?? 0)] : [r.label, String(r.guests), String(r.share)])),
];

function ratings(d: RatingsReport): string[][] {
  return [
    ["Ratings and referrals", d.range.label, d.serviceType ?? "All services"],
    ["Guests", String(d.guests), "Rated at least one area", String(d.rated)],
    [],
    ["Rating by area", "Average (0–10)", "Rated", "Rated 5 or below", "Alerts go to"],
    ...d.ratings.map((r) => [r.area, r.average === null ? "" : r.average.toFixed(2), String(r.rated), String(r.low), r.owner]),
    ...rows("How they heard about us", d.howHeard),
    [],
    ["Who invited them (two or more guests)"],
    ...d.inviters.map((i) => [i.name, String(i.guests)]),
    ...rows("Where they live (places with fewer than 5 guests are grouped)", d.cities),
    ...rows("Cell group", d.cells),
  ];
}

function ytd(d: YtdReport): string[][] {
  return [
    ["Year to date by service and location", d.range.label, d.serviceType ?? "All services"],
    ["First-time guests this year", String(d.thisYear), "Same days last year", String(d.lastYear)],
    [],
    ["Month", String(d.year), String(d.year - 1)],
    ...d.byMonth.map((m) => [m.month, String(m.thisYear), String(m.lastYear)]),
    ...rows("By service", d.byService, true),
    ...rows("By cell group", d.byCell, true),
    ...rows("By city (places with fewer than 5 guests are grouped)", d.byCity, true),
  ];
}

function retention(d: RetentionReport): string[][] {
  return [
    ["Retention: first-time guests confirmed back within 30 days", d.range.label, d.serviceType ?? "All services"],
    [],
    ["First visit in", "First-time guests", "Back within 30 days", "Rate %", "A second form", "Follow-up team", "Both", "Still within 30 days"],
    ...d.cohorts.map((c) =>
      c.hidden
        ? [c.month, `Fewer than 5`, "", "", "", "", "", ""]
        : [c.month, String(c.firstTime), String(c.back), c.rate === null ? "" : String(c.rate), String(c.viaForm), String(c.viaConnect), String(c.viaBoth), String(c.open)],
    ),
    ["All", String(d.total.firstTime), String(d.total.back), d.total.rate === null ? "" : String(d.total.rate)],
  ];
}

export function reportCsv(r: ReportData) {
  return toCsv(r.id === "ratings-referrals" ? ratings(r.data) : r.id === "ytd-service-location" ? ytd(r.data) : retention(r.data));
}
