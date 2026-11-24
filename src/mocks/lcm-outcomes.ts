import type { LcmOutcome, LcmOutcomeKey, LcmRate } from "@/features/welcome/lcm-types";
import { db } from "./db";
import type { ConnectRecord, WelcomeEntry } from "./seed/guests";
import { membershipIntent } from "./welcome-api";

/**
 * LCM "Follow-up and growth": the measures that were only suggestions in TKP
 * Connect. Totals only. Each one measures a cohort of first-time guests
 * (visitNumber 1) and counts what happened to them inside a fixed window.
 *
 * A window that needs time to close (return within 90 days, say) measures an
 * earlier month's guests, so the report shows a settled number rather than one
 * that is still filling in. `open` says how many guests can still change it.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const d2 = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(d2(s) + n * DAY);
const addMonths = (ym: string, n: number) => {
  const m = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};
const monthEnd = (ym: string) => addDays(`${addMonths(ym, 1)}-01`, -1);
const rate = (count: number, of: number): LcmRate => ({ count, of, value: of ? Math.round((count * 1000) / of) / 10 : null });

/** Rating area → who gets the low-rating alert. Placeholder owners until TKP confirms them. */
export const RATING_OWNER: Record<string, string> = {
  Music: "Choir / Music Ministry",
  Preaching: "Lead Pastor's office",
  Comfort: "Ushering / Protocol",
  Hospitality: "Welcome Team",
  ChurchEnvironment: "Facilities",
  ThePeople: "Welcome Team",
  Parking: "Ushering / Protocol",
  Traffic: "Ushering / Protocol",
};
const RATING_NAME: Record<string, string> = { ChurchEnvironment: "Church environment", ThePeople: "The people" };
export const LOW_RATING = 5;

type Ctx = {
  /** Every entry, unfiltered: a guest who comes back to a different service still came back. */
  entries: WelcomeEntry[];
  /** Entries for the selection (service-type filter applied). */
  all: WelcomeEntry[];
  /** The report month's and prior month's entries (same-days rule already applied). */
  cur: WelcomeEntry[];
  pri: WelcomeEntry[];
  month: string;
  priorMonth: string;
  monthStart: string;
  asOf: string;
  priorStart: string;
  priorEnd: string;
  type: string | null;
  now: Date;
};

type Def = {
  key: LcmOutcomeKey;
  label: string;
  measures: string;
  source: string;
  unit?: LcmOutcome["unit"];
  higherIsBetter?: boolean;
  /** Months back from the report month to the cohort measured. */
  lag: number;
  /** Who is counted, out of the cohort. */
  of?: (e: WelcomeEntry, r: ConnectRecord | undefined) => boolean;
  /** Counted when this returns true. */
  hit: (e: WelcomeEntry, r: ConnectRecord | undefined) => boolean;
  /** When the window closes (ms), for `open`. */
  closes?: (e: WelcomeEntry) => number;
};

export function buildOutcomes(c: Ctx): LcmOutcome[] {
  const byId = new Map(db.connect.map((r) => [r.connectId, r]));
  const firstContact = new Map<number, number>();
  for (const l of db.connectLogs) {
    const t = Date.parse(l.savedAt);
    if (t < (firstContact.get(l.connectId) ?? Infinity)) firstContact.set(l.connectId, t);
  }
  for (const r of db.connect) {
    for (const s of [r.checklist.CoWelcomeCall, r.checklist.P1Welcome48h]) {
      if (s && Date.parse(s.at) < (firstContact.get(r.connectId) ?? Infinity)) firstContact.set(r.connectId, Date.parse(s.at));
    }
  }
  // Placed in a cell: the first integration log that recorded it, else the Phase 1 sign-off.
  const placed = new Map<number, number>();
  for (const l of db.connectLogs) {
    if (l.lifeGroup !== "Joined Cell Group") continue;
    const t = Date.parse(l.savedAt);
    if (t < (placed.get(l.connectId) ?? Infinity)) placed.set(l.connectId, t);
  }
  for (const r of db.connect) {
    if (!placed.has(r.connectId) && r.state.itLifeGroup === "Joined Cell Group" && r.checklist.P1Complete) placed.set(r.connectId, Date.parse(r.checklist.P1Complete.at));
  }
  // The person came back: a later form entry, or Connect's "Returned for 2nd visit".
  const returns = new Map<number, string[]>();
  for (const e of c.entries) if (e.visitNumber > 1) returns.set(e.connectId, [...(returns.get(e.connectId) ?? []), e.serviceDate]);
  for (const r of db.connect) if (r.state.returned2ndVisit && r.state.returnVisitDate) returns.set(r.connectId, [...(returns.get(r.connectId) ?? []), r.state.returnVisitDate]);
  const backWithin = (e: WelcomeEntry, days: number) => (returns.get(e.connectId) ?? []).some((d) => d > e.serviceDate && d <= addDays(e.serviceDate, days));
  const endOfDay = (date: string, days: number) => d2(addDays(date, days + 1)) + 5 * HOUR; // church midnight, roughly (UTC−5/−6)

  const defs: Def[] = [
    {
      key: "contact48h",
      label: "48-hour contact rate",
      measures: "First-time guests someone called or messaged within 48 hours of the form.",
      source: "Connect: first call, message or 48 Hr Welcome",
      lag: 0,
      hit: (e) => (firstContact.get(e.connectId) ?? Infinity) <= Date.parse(e.submittedAt) + 48 * HOUR,
      closes: (e) => Date.parse(e.submittedAt) + 48 * HOUR,
    },
    {
      key: "return30",
      label: "Came back within 30 days",
      measures: "First-time guests confirmed back at a service within 30 days.",
      source: "A later welcome form, or Connect “Returned for 2nd visit”",
      lag: 1,
      hit: (e) => backWithin(e, 30),
      closes: (e) => endOfDay(e.serviceDate, 30),
    },
    {
      key: "return90",
      label: "Came back within 90 days",
      measures: "First-time guests confirmed back at a service within 90 days.",
      source: "A later welcome form, or Connect “Returned for 2nd visit”",
      lag: 3,
      hit: (e) => backWithin(e, 90),
      closes: (e) => endOfDay(e.serviceDate, 90),
    },
    {
      key: "cellPlacement",
      label: "Placed in a cell within 4 weeks",
      measures: "First-time guests who joined a cell or life group within 28 days.",
      source: "Connect: Life Group outcome “Joined Cell Group”",
      lag: 1,
      hit: (e) => (placed.get(e.connectId) ?? Infinity) <= endOfDay(e.serviceDate, 28),
      closes: (e) => endOfDay(e.serviceDate, 28),
    },
    {
      key: "conversion",
      label: "Guest → member journey",
      measures: "First-time guests who finished the 12-week integration journey (all three phases).",
      source: "Connect journey status “Completed”",
      lag: 3,
      hit: (_e, r) => r?.status === "Completed",
      closes: (e) => endOfDay(e.serviceDate, 84),
    },
    {
      key: "undecided",
      label: "“Undecided” follow-through",
      measures: "First-time guests who were undecided about membership on the form and later said yes.",
      source: "Welcome form, then Connect: wants membership “Yes” or Integration “Interested”",
      lag: 1,
      of: (e) => membershipIntent(e) === "Undecided",
      hit: (_e, r) => r?.state.coWantsMembership === "Yes" || r?.state.itMembership === "Interested",
    },
  ];

  const firstTime = (list: WelcomeEntry[]) => list.filter((e) => e.visitNumber === 1);
  const cohortOf = (ym: string, lag: number, which: "cur" | "pri") => {
    if (lag === 0) return firstTime(which === "cur" ? c.cur : c.pri);
    const a = `${ym}-01`;
    const b = monthEnd(ym);
    return firstTime(c.all.filter((e) => e.serviceDate >= a && e.serviceDate <= b));
  };

  const out: LcmOutcome[] = defs.map((d) => {
    const cohort = addMonths(c.month, -d.lag);
    const priorCohort = addMonths(cohort, -1);
    const measure = (list: WelcomeEntry[]) => {
      const base = list.filter((e) => (d.of ? d.of(e, byId.get(e.connectId)) : true));
      return { base, r: rate(base.filter((e) => d.hit(e, byId.get(e.connectId))).length, base.length) };
    };
    const cur = measure(cohortOf(cohort, d.lag, "cur"));
    const pri = measure(cohortOf(priorCohort, d.lag, "pri"));
    const closes = d.closes;
    return {
      key: d.key,
      label: d.label,
      measures: d.measures,
      source: d.source,
      unit: d.unit ?? "%",
      higherIsBetter: d.higherIsBetter ?? true,
      cohort,
      current: cur.r,
      prior: { ...pri.r, cohort: priorCohort },
      open: closes ? cur.base.filter((e) => !d.hit(e, byId.get(e.connectId)) && closes(e) > c.now.getTime()).length : 0,
    };
  });

  // Guests per 100 attendees: first-time guests against the services' total headcount.
  const heads = (a: string, b: string) =>
    db.attendance.filter((x) => x.date >= a && x.date <= b && (!c.type || x.serviceType === c.type)).reduce((s, x) => s + x.headcount, 0);
  const g = (list: WelcomeEntry[]) => firstTime(list).length;
  const curHeads = heads(c.monthStart, c.asOf);
  const priHeads = heads(c.priorStart, c.priorEnd);
  out.push({
    key: "per100",
    label: "Guests per 100 attendees",
    measures: "First-time guests for every 100 people at the month’s services.",
    source: "Welcome form and service headcounts (a new table)",
    unit: "per 100",
    higherIsBetter: true,
    cohort: c.month,
    current: rate(g(c.cur), curHeads),
    prior: { ...rate(g(c.pri), priHeads), cohort: c.priorMonth },
    open: 0,
    breakdown: [
      { label: "First-time guests", count: g(c.cur), of: 0 },
      { label: "Total attendance", count: curHeads, of: 0, note: `${db.attendance.filter((x) => x.date >= c.monthStart && x.date <= c.asOf && (!c.type || x.serviceType === c.type)).length} services` },
    ],
  });

  // Data completeness: every form this month (returns included), phone, ZIP and age all filled in.
  const FIELDS = [
    ["Phone", (e: WelcomeEntry) => !!e.phone],
    ["ZIP", (e: WelcomeEntry) => !!e.zip],
    ["Age", (e: WelcomeEntry) => !!e.ageBracket],
  ] as const;
  const complete = (list: WelcomeEntry[]) => list.filter((e) => FIELDS.every(([, f]) => f(e))).length;
  out.push({
    key: "completeness",
    label: "Data completeness",
    measures: "Forms with phone, ZIP and age all filled in.",
    source: "Welcome form",
    unit: "%",
    higherIsBetter: true,
    cohort: c.month,
    current: rate(complete(c.cur), c.cur.length),
    prior: { ...rate(complete(c.pri), c.pri.length), cohort: c.priorMonth },
    open: 0,
    breakdown: FIELDS.map(([label, f]) => ({ label, count: c.cur.filter(f).length, of: c.cur.length })),
  });

  // Low ratings: guests who rated any area 5 or below, and who each area's alert goes to.
  const rated = (list: WelcomeEntry[]) => list.filter((e) => Object.values(e.ratings).some((v) => v !== null && v !== undefined));
  const low = (list: WelcomeEntry[]) => list.filter((e) => Object.values(e.ratings).some((v) => v !== null && v !== undefined && v <= LOW_RATING));
  out.push({
    key: "lowRatings",
    label: "Low-rating alerts",
    measures: `Guests who rated any area ${LOW_RATING} or below out of 10. Each one alerts that area’s department.`,
    source: "Welcome form ratings",
    unit: "%",
    higherIsBetter: false,
    cohort: c.month,
    current: rate(low(c.cur).length, rated(c.cur).length),
    prior: { ...rate(low(c.pri).length, rated(c.pri).length), cohort: c.priorMonth },
    open: 0,
    breakdown: Object.keys(RATING_OWNER)
      .map((k) => ({
        label: RATING_NAME[k] ?? k,
        count: c.cur.filter((e) => (e.ratings[k] ?? 11) <= LOW_RATING).length,
        of: c.cur.filter((e) => e.ratings[k] !== null && e.ratings[k] !== undefined).length,
        note: RATING_OWNER[k],
      }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count),
  });

  return out;
}
