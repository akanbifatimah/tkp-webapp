import type { BreakdownDim, BreakdownRow, EmergingZip, LcmPeriod, LcmResponse, LcmRating, VisitorCity } from "@/features/welcome/lcm-types";
import { RATINGS } from "@/features/welcome/model";
import { can } from "@/lib/permissions";
import { churchDate } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { buildOutcomes } from "./lcm-outcomes";
import { OUT_OF_AREA, type WelcomeEntry } from "./seed/guests";
import type { StaffRecord } from "./seed/staff";
import { kpis, membershipIntent } from "./welcome-api";

/**
 * The mock LCM report (TKP Connect API-W5, itg.usp_WelcomeLcmMetrics).
 * Totals only. Definitions: doc 01 §8.1; emerging ZIPs: BR-21.
 */

export type ZipPoint = { lat: number; lon: number; county: string | null; city: string | null; hasOutline: boolean };

/* ----------------------------------------------------------------- dates */

const DAY = 86_400_000;
const d2 = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(d2(s) + n * DAY);
export const addMonths = (ym: string, n: number) => {
  const m = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};
const monthEnd = (ym: string) => addDays(`${addMonths(ym, 1)}-01`, -1);
const minusYear = (s: string) => `${+s.slice(0, 4) - 1}${s.slice(4)}`;
const pctChange = (c: number, p: number) => (!p ? (c ? null : 0) : ((c - p) * 100) / p);

/* ----------------------------------------------------------------- report */

const RATING_DIMS = [
  ["Music", "Music"],
  ["Preaching", "Preaching"],
  ["Comfort", "Comfort"],
  ["Hospitality", "Hospitality"],
  ["ChurchEnvironment", "Church environment"],
  ["ThePeople", "The people"],
  ["Parking", "Parking"],
  ["Traffic", "Traffic"],
] as const;

const YOUNG = ["16-20", "21-25", "26-30", "31-35"];
const ADULT = ["36-40", "41-45", "46-50", "51-65", "Above 65"];
const ng = (v: string | null | undefined) => (v && v.trim() ? v : "Not given");
const DIM: Record<BreakdownDim, (e: WelcomeEntry) => string> = {
  Gender: (e) => ng(e.gender),
  AgeGroup: (e) => (!e.ageBracket ? "Not given" : e.ageBracket === "Below 16" ? "Below 16" : YOUNG.includes(e.ageBracket) ? "Young Adults (16-35)" : ADULT.includes(e.ageBracket) ? "Adults" : "Not given"),
  AgeBracket: (e) => ng(e.ageBracket),
  MaritalStatus: (e) => ng(e.maritalStatus),
  ServiceType: (e) => ng(e.serviceType),
  City: (e) => ng(e.city),
  CellGroup: (e) => (db.cellMap.zips[e.zip ?? ""] ? e.cellGroup : "N/A"),
  HowHeard: (e) => ng(e.howHeard),
  MembershipIntent: (e) => ng(membershipIntent(e)),
  WillComeAgain: (e) => (e.willComeAgain === "Maybe" ? "Maybe" : ng(e.willComeAgain)),
  Zip5: (e) => ng(e.zip),
};

export function buildLcm(
  entries: WelcomeEntry[],
  q: { month?: string | null; type?: string | null },
  geo: Map<string, ZipPoint>,
  now = new Date(),
): LcmResponse {
  const today = churchDate(now);
  const thisMonth = today.slice(0, 7);
  // Default = the last full month (church time).
  const month = q.month && /^\d{4}-\d{2}$/.test(q.month) && q.month <= thisMonth ? q.month : addMonths(thisMonth, -1);
  const inProgress = month === thisMonth;
  const asOf = inProgress ? today : monthEnd(month);
  const priorMonth = addMonths(month, -1);
  const year = +month.slice(0, 4);
  const all = entries.filter((e) => !q.type || e.serviceType === q.type);
  const between = (a: string, b: string) => all.filter((e) => e.serviceDate >= a && e.serviceDate <= b);

  // A month still in progress compares the same number of days.
  const monthStart = `${month}-01`;
  const days = d2(asOf) - d2(monthStart);
  const priorStart = `${priorMonth}-01`;
  const priorEnd = iso(Math.min(d2(priorStart) + days, d2(monthEnd(priorMonth))));
  const cur = between(monthStart, asOf);
  const pri = between(priorStart, priorEnd);
  const ytdCur = between(`${year}-01-01`, asOf);
  const ytdPri = between(`${year - 1}-01-01`, minusYear(asOf));

  const period = (comparison: LcmPeriod["comparison"], cs: string, ce: string, ps: string, pe: string): LcmPeriod => {
    const current = between(cs, ce).length;
    const prior = between(ps, pe).length;
    return { comparison, currentStart: cs, currentEnd: ce, priorStart: ps, priorEnd: pe, current, prior, change: current - prior, pctChange: pctChange(current, prior) };
  };
  const periods = [
    period("Month over month", monthStart, asOf, priorStart, priorEnd),
    period("Year to date", `${year}-01-01`, asOf, `${year - 1}-01-01`, minusYear(asOf)),
    period("Week over week", addDays(asOf, -6), asOf, addDays(asOf, -13), addDays(asOf, -7)),
    period("Year over year (month)", monthStart, asOf, minusYear(monthStart), minusYear(asOf)),
  ];

  const mon = +month.slice(5, 7);
  const monthly = [year, year - 1].flatMap((y) =>
    Array.from({ length: mon }, (_, i) => {
      const ym = `${y}-${String(i + 1).padStart(2, "0")}`;
      const end = y === year && i + 1 === mon ? asOf : monthEnd(ym);
      return { year: y, month: i + 1, guests: between(`${ym}-01`, end).length };
    }),
  );
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const weekEnd = addDays(asOf, -7 * (11 - i));
    const weekStart = addDays(weekEnd, -6);
    return { weekStart, weekEnd, guests: between(weekStart, weekEnd).length };
  });

  const breakdowns = Object.fromEntries(
    (Object.keys(DIM) as BreakdownDim[]).map((dim) => {
      const rows = new Map<string, BreakdownRow>();
      const bump = (list: WelcomeEntry[], field: keyof Omit<BreakdownRow, "value">) => {
        for (const e of list) {
          const v = DIM[dim](e);
          const r = rows.get(v) ?? { value: v, month: 0, priorMonth: 0, ytd: 0, priorYtd: 0 };
          r[field]++;
          rows.set(v, r);
        }
      };
      bump(cur, "month");
      bump(pri, "priorMonth");
      bump(ytdCur, "ytd");
      bump(ytdPri, "priorYtd");
      return [dim, [...rows.values()].sort((a, b) => b.month - a.month || b.ytd - a.ytd)];
    }),
  ) as Record<BreakdownDim, BreakdownRow[]>;

  // Map 1: Greater Houston ZIPs with guests this year (the outline list plus every cell ZIP).
  const zipRows = new Map<string, EmergingZip>();
  const last90Start = addDays(asOf, -89);
  const prior90Start = addDays(asOf, -179);
  const cellZips = db.cellMap.zips;
  for (const e of all) {
    const z = e.zip;
    if (!z || (!geo.has(z) && !cellZips[z])) continue;
    if (e.serviceDate > asOf) continue;
    const pt = geo.get(z);
    const r =
      zipRows.get(z) ??
      ({
        zip: z,
        city: pt?.city ?? e.city,
        county: pt?.county ?? null,
        cellGroup: cellZips[z] ?? "N/A",
        isEmerging: !cellZips[z],
        hasOutline: !!pt?.hasOutline,
        lat: pt?.lat ?? null,
        lon: pt?.lon ?? null,
        ytd: 0,
        priorYtd: 0,
        last90: 0,
        prior90: 0,
        firstSeen: e.serviceDate,
        lastSeen: e.serviceDate,
        signal: null,
      } satisfies EmergingZip);
    if (e.serviceDate >= `${year}-01-01`) r.ytd++;
    if (e.serviceDate >= `${year - 1}-01-01` && e.serviceDate <= minusYear(asOf)) r.priorYtd++;
    if (e.serviceDate >= last90Start) r.last90++;
    else if (e.serviceDate >= prior90Start) r.prior90++;
    if (e.serviceDate < r.firstSeen) r.firstSeen = e.serviceDate;
    if (e.serviceDate > r.lastSeen) r.lastSeen = e.serviceDate;
    zipRows.set(z, r);
  }
  const emergingZips = [...zipRows.values()]
    .filter((r) => r.ytd > 0)
    .map((r) => ({
      ...r,
      // BR-21: Emerging when YTD ≥ 10 and ≥ 3× last year; Growing when the last 90 days beat the previous 90; else Watch.
      signal: r.isEmerging ? (r.ytd >= 10 && r.ytd >= 3 * r.priorYtd ? "Emerging" : r.last90 > r.prior90 ? "Growing" : "Watch") : null,
    }))
    .sort((a, b) => b.ytd - a.ytd) as EmergingZip[];

  // Ratings: each area's average over the guests who rated it; blank = no answer (BR-23).
  const avgOf = (list: WelcomeEntry[], key: string) => {
    const v = list.map((e) => e.ratings[key]).filter((x): x is number => x !== null && x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const last12 = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11));
  const twelve = between(`${last12[0]}-01`, asOf);
  const ratings: LcmRating[] = RATING_DIMS.map(([key, dimension], sort) => ({
    dimension,
    sort,
    month: avgOf(cur, key),
    prior: avgOf(pri, key),
    twelveMonth: avgOf(twelve, key),
    monthLow: cur.filter((e) => (e.ratings[key] ?? 11) <= 5).length,
  }));
  const ratingTrend = last12.flatMap((ym) => {
    const list = between(`${ym}-01`, ym === month ? asOf : monthEnd(ym));
    return RATING_DIMS.map(([key, dimension]) => ({
      dimension,
      month: ym,
      avg: avgOf(list, key),
      count: list.filter((e) => e.ratings[key] !== null && e.ratings[key] !== undefined).length,
    }));
  });

  const inviters = new Map<string, number>();
  for (const e of ytdCur) if (e.howHeard === "Invited By Someone" && e.whoInvitedYou) inviters.set(e.whoInvitedYou, (inviters.get(e.whoInvitedYou) ?? 0) + 1);
  const topInviters = [...inviters.entries()]
    .filter(([, n]) => n > 1)
    .map(([name, guests]) => ({ name, guests }))
    .sort((a, b) => b.guests - a.guests)
    .slice(0, 10);

  const howByMonth = last12.flatMap((ym) => {
    const list = between(`${ym}-01`, ym === month ? asOf : monthEnd(ym));
    const by = new Map<string, number>();
    for (const e of list) by.set(ng(e.howHeard), (by.get(ng(e.howHeard)) ?? 0) + 1);
    return [...by.entries()].map(([source, guests]) => ({ month: ym, source, guests }));
  });

  const serviceByDate: LcmResponse["serviceByDate"] = [];
  for (const e of cur) {
    const r = serviceByDate.find((x) => x.date === e.serviceDate && x.type === e.serviceType);
    if (r) r.guests++;
    else serviceByDate.push({ date: e.serviceDate, type: e.serviceType, guests: 1 });
  }

  const others = new Map<string, number>();
  for (const e of cur) if (e.howHeardOther) others.set(e.howHeardOther, (others.get(e.howHeardOther) ?? 0) + 1);

  // Map 2: by city. US ZIPs get a point; guests abroad without a ZIP are placed on their country by the page.
  const cities = new Map<string, VisitorCity>();
  for (const e of cur) {
    const key = `${e.city ?? "Not given"}|${e.state ?? ""}|${e.country ?? ""}`;
    const c = cities.get(key) ?? { city: e.city ?? "Not given", state: e.state, country: e.country ?? "Not given", guests: 0, lat: null, lon: null, zips: [] };
    c.guests++;
    if (e.zip && !c.zips.includes(e.zip)) c.zips.push(e.zip);
    cities.set(key, c);
  }
  for (const c of cities.values()) {
    const pts: { lat: number; lon: number }[] = [];
    for (const z of c.zips) {
      const p = geo.get(z) ?? OUT_OF_AREA.find((o) => o.zip === z);
      if (p && p.lat !== null && p.lon !== null) pts.push({ lat: p.lat, lon: p.lon });
    }
    if (pts.length) {
      c.lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
      c.lon = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
    }
  }

  return {
    meta: { month, priorMonth, year, asOf, inProgress, serviceType: q.type || null },
    periods,
    kpis: { current: kpis(cur), prior: kpis(pri) },
    monthly,
    weekly,
    breakdowns,
    emergingZips,
    ratings,
    ratingTrend,
    topInviters,
    howByMonth,
    serviceByDate: serviceByDate.sort((a, b) => a.date.localeCompare(b.date)),
    otherAnswers: [...others.entries()].map(([text, guests]) => ({ text, guests })).sort((a, b) => b.guests - a.guests),
    visitorCities: [...cities.values()].sort((a, b) => b.guests - a.guests),
    outcomes: buildOutcomes({ entries, all, cur, pri, month, priorMonth, monthStart, asOf, priorStart, priorEnd, type: q.type || null, now }),
  };
}

export function getLcm(u: StaffRecord, q: { month: string | null; type: string | null }, geo: Map<string, ZipPoint>): Result<LcmResponse> {
  if (!u.roles.some((r) => can(r, "welcome.lcm.view"))) return { ok: false, status: 403, code: "FORBIDDEN", message: "You don't have access to LCM Metrics." };
  audit(u.id, "welcome.lcm.view", q.month);
  return { ok: true, status: 200, body: buildLcm(db.entries, q, geo) };
}

export { RATINGS };
