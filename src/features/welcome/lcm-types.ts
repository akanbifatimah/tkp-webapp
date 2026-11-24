import type { Geometry } from "geojson";
import type { WelcomeKpis } from "./types";

/** GET /welcome/lcm (TKP Connect API-W5): the monthly Leadership Council Meeting report. Totals only, no names. */

export type LcmPeriod = {
  comparison: "Month over month" | "Year to date" | "Week over week" | "Year over year (month)";
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
  current: number;
  prior: number;
  change: number;
  pctChange: number | null;
};

export type BreakdownRow = { value: string; month: number; priorMonth: number; ytd: number; priorYtd: number };
export type BreakdownDim =
  | "Gender"
  | "AgeGroup"
  | "AgeBracket"
  | "MaritalStatus"
  | "ServiceType"
  | "City"
  | "CellGroup"
  | "HowHeard"
  | "MembershipIntent"
  | "WillComeAgain"
  | "Zip5";

/** Map 1: every Greater Houston ZIP with guests this year (cell ZIPs included). */
export type EmergingZip = {
  zip: string;
  city: string | null;
  county: string | null;
  /** "N/A" when not a cell ZIP. */
  cellGroup: string;
  isEmerging: boolean;
  hasOutline: boolean;
  lat: number | null;
  lon: number | null;
  ytd: number;
  priorYtd: number;
  last90: number;
  prior90: number;
  firstSeen: string;
  lastSeen: string;
  /** Only for emerging ZIPs (BR-21). */
  signal: "Emerging" | "Growing" | "Watch" | null;
};

export type LcmRating = {
  dimension: string;
  sort: number;
  month: number | null;
  prior: number | null;
  twelveMonth: number | null;
  /** How many rated it 0–5 this month. */
  monthLow: number;
};

/** Map 2: where the month's visitors live, by city. lat/lon are null without a US ZIP. */
export type VisitorCity = { city: string; state: string | null; country: string; guests: number; lat: number | null; lon: number | null; zips: string[] };

/** One follow-up or growth measure (the former "Suggested metrics"). `value` is count / of × 100, null when `of` = 0. */
export type LcmRate = { count: number; of: number; value: number | null };
export type LcmOutcomeKey =
  | "contact48h"
  | "return30"
  | "return90"
  | "conversion"
  | "cellPlacement"
  | "undecided"
  | "per100"
  | "completeness"
  | "lowRatings";
export type LcmOutcome = {
  key: LcmOutcomeKey;
  label: string;
  /** What it counts, in plain words. */
  measures: string;
  source: string;
  /** "%" or "per 100" (attendees). */
  unit: "%" | "per 100";
  /** Up is good for every measure except low ratings. */
  higherIsBetter: boolean;
  /** The month whose first-time guests are measured ("YYYY-MM"). Earlier than the report month when the window needs time to close. */
  cohort: string;
  current: LcmRate;
  prior: LcmRate & { cohort: string };
  /** Guests in the cohort whose window has not closed yet, so the number can still rise. */
  open: number;
  breakdown?: { label: string; count: number; of: number; note?: string }[];
};

export type LcmResponse = {
  meta: { month: string; priorMonth: string; year: number; asOf: string; inProgress: boolean; serviceType: string | null };
  periods: LcmPeriod[];
  kpis: { current: WelcomeKpis; prior: WelcomeKpis };
  monthly: { year: number; month: number; guests: number }[];
  weekly: { weekStart: string; weekEnd: string; guests: number }[];
  breakdowns: Record<BreakdownDim, BreakdownRow[]>;
  emergingZips: EmergingZip[];
  ratings: LcmRating[];
  ratingTrend: { dimension: string; month: string; avg: number | null; count: number }[];
  topInviters: { name: string; guests: number }[];
  howByMonth: { month: string; source: string; guests: number }[];
  serviceByDate: { date: string; type: string; guests: number }[];
  otherAnswers: { text: string; guests: number }[];
  visitorCities: VisitorCity[];
  /** Follow-up and growth measures, in a fixed order. */
  outcomes: LcmOutcome[];
};

/** Public outline data for Map 1 (served as /geo/houston-zips.json by the front end's own host). */
export type ZipFeature = {
  type: "Feature";
  properties: { zip: string; lat: number; lon: number; county: string | null; city: string | null; cellGroup: string | null };
  geometry: Geometry;
};
