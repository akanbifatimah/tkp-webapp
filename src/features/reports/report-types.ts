import type { Permission } from "@/lib/permissions";

/**
 * Reports hub (PRD PL-2 to PL-5, W-9 to W-11, 8.3 "reports hub, share a
 * report"). One library of the reports leadership uses, each with export, a
 * share-now and scheduled sharing, replacing the manual PDF forwarding and
 * the Power BI pages. Totals only; groups under five are never shown alone.
 */

export type ReportId = "lcm-pack" | "ratings-referrals" | "ytd-service-location" | "retention" | "team-metrics" | "executive";
export type Period = "last_full_month" | "month_to_date" | "last_3_months" | "last_6_months" | "year_to_date";
export type ShareFormat = "link" | "pdf" | "csv";

export type ReportDef = {
  id: ReportId;
  title: string;
  summary: string;
  /** Where the numbers come from, in words. */
  source: string;
  /** PRD ids it covers. */
  covers: string;
  permission: Permission;
  /** A page elsewhere in TKP Hub (the hub links to it) or a page in the hub. */
  href: string;
  shareable: boolean;
  formats: ShareFormat[];
  periods: Period[];
};

export const PERIOD_LABEL: Record<Period, string> = {
  last_full_month: "Last full month",
  month_to_date: "This month so far",
  last_3_months: "Last 3 full months",
  last_6_months: "Last 6 full months",
  year_to_date: "Year to date",
};

export const REPORTS: ReportDef[] = [
  {
    id: "lcm-pack",
    title: "Leadership monthly pack",
    summary: "The Leadership Council Meeting report: guests month over month and year to date, who is visiting, where from, ratings, emerging ZIPs, follow-up and growth.",
    source: "Welcome form and Connect",
    covers: "W-8, PL-1",
    permission: "welcome.lcm.view",
    href: "/welcome/lcm",
    shareable: true,
    formats: ["link", "pdf"],
    periods: ["last_full_month", "month_to_date"],
  },
  {
    id: "ratings-referrals",
    title: "Ratings and referrals",
    summary: "Average rating per area with the low ratings, how guests heard of the church, who invited them, where they live and the cell group split.",
    source: "Welcome form",
    covers: "W-10, PL-2",
    permission: "reports.view",
    href: "/reports/ratings-referrals",
    shareable: true,
    formats: ["link", "pdf", "csv"],
    periods: ["last_full_month", "last_3_months", "last_6_months", "year_to_date"],
  },
  {
    id: "ytd-service-location",
    title: "Year to date by service and location",
    summary: "First-time guests this year against the same months last year, by month, by service, by cell group and by city.",
    source: "Welcome form",
    covers: "W-11, PL-2",
    permission: "reports.view",
    href: "/reports/ytd-service-location",
    shareable: true,
    formats: ["link", "pdf", "csv"],
    periods: ["year_to_date"],
  },
  {
    id: "retention",
    title: "Retention",
    summary: "First-time guests confirmed back within 30 days, by first-visit month, and where the signal came from: a second form or the follow-up team.",
    source: "Welcome form and Connect “Returned for 2nd visit”",
    covers: "PL-3, C-13",
    permission: "reports.view",
    href: "/reports/retention",
    shareable: true,
    formats: ["link", "pdf", "csv"],
    periods: ["last_3_months", "last_6_months", "year_to_date"],
  },
  {
    id: "team-metrics",
    title: "Follow-up team metrics",
    summary: "Each caller's and team's follow-up: on-time calls, outcomes, phase progress.",
    source: "Connect",
    covers: "C-9",
    permission: "connect.metrics.view",
    href: "/connect/metrics",
    shareable: false,
    formats: [],
    periods: [],
  },
  {
    id: "executive",
    title: "Executive snapshot",
    summary: "The church dashboard: this week's guests, follow-up health, cells and alerts at a glance.",
    source: "All modules",
    covers: "PL-5",
    permission: "dashboard.view",
    href: "/dashboard",
    shareable: false,
    formats: [],
    periods: [],
  },
];

export type ReportCard = ReportDef & { schedules: number; lastShared: string | null };
export type ReportsResponse = { reports: ReportCard[]; can: { share: boolean } };

/** The months a report covers, resolved from a period ("YYYY-MM", inclusive). */
export type ReportRange = { from: string; to: string; label: string; inProgress: boolean };

/** A row that may stand for several small groups ("Fewer than 5 each"). */
export type CountRow = { label: string; guests: number; share: number; prior?: number; grouped?: number };

export type RatingsReport = {
  range: ReportRange;
  serviceType: string | null;
  guests: number;
  rated: number;
  ratings: { area: string; average: number | null; rated: number; low: number; owner: string }[];
  howHeard: CountRow[];
  inviters: { name: string; guests: number }[];
  cities: CountRow[];
  cells: CountRow[];
};

export type YtdReport = {
  range: ReportRange;
  serviceType: string | null;
  year: number;
  thisYear: number;
  lastYear: number;
  byMonth: { month: string; thisYear: number; lastYear: number }[];
  byService: CountRow[];
  byCell: CountRow[];
  byCity: CountRow[];
};

export type RetentionReport = {
  range: ReportRange;
  serviceType: string | null;
  cohorts: {
    month: string;
    firstTime: number;
    back: number;
    rate: number | null;
    viaForm: number;
    viaConnect: number;
    viaBoth: number;
    /** Guests whose 30 days are not over yet. */
    open: number;
    /** Fewer than five first-time guests: the numbers are hidden. */
    hidden: boolean;
  }[];
  total: { firstTime: number; back: number; rate: number | null };
};

export type ReportData = { id: "ratings-referrals"; data: RatingsReport } | { id: "ytd-service-location"; data: YtdReport } | { id: "retention"; data: RetentionReport };

/* ----------------------------------------------------------------- sharing */

export type Recipient = { id: string; name: string; roles: string; eligible: boolean; reason: string | null };

export type ShareInput = {
  period: Period;
  serviceType: string | null;
  format: ShareFormat;
  recipients: string[];
  message: string | null;
};

export type ReportRun = {
  id: string;
  at: string;
  reportId: ReportId;
  reportTitle: string;
  scheduleId: string | null;
  scheduleName: string | null;
  period: string;
  format: ShareFormat;
  sentTo: string[];
  by: string;
  status: "sent" | "skipped";
  note: string | null;
};

export type Schedule = {
  id: string;
  reportId: ReportId;
  reportTitle: string;
  name: string;
  period: Period;
  serviceType: string | null;
  frequency: "monthly" | "weekly";
  /** Monthly: day of the month (1–28). Weekly: 0 = Sunday … 6 = Saturday. */
  day: number;
  /** "HH:MM", church time. */
  time: string;
  format: ShareFormat;
  recipients: { id: string; name: string }[];
  message: string | null;
  active: boolean;
  nextRunAt: string | null;
  lastRun: ReportRun | null;
  createdBy: string | null;
  createdAt: string;
  rowVer: number;
};

export type ScheduleInput = Omit<ShareInput, "recipients"> & {
  reportId: ReportId;
  name: string;
  frequency: "monthly" | "weekly";
  day: number;
  time: string;
  recipients: string[];
};

export type SchedulesResponse = { items: Schedule[]; runs: ReportRun[]; can: { share: boolean } };
