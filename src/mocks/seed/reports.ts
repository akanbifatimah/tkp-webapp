import type { Period, ReportId, ShareFormat } from "@/features/reports/report-types";
import { churchDate, fromChurchLocal } from "@/lib/time";

/** Scheduled report sharing (PRD W-9, PL-4): two schedules leadership would set up, with past runs. */

export type ScheduleRecord = {
  id: string;
  reportId: ReportId;
  name: string;
  period: Period;
  serviceType: string | null;
  frequency: "monthly" | "weekly";
  day: number;
  time: string;
  format: ShareFormat;
  recipientIds: string[];
  message: string | null;
  active: boolean;
  createdById: string;
  createdAt: string;
  rowVer: number;
};

export type RunRecord = {
  id: string;
  at: string;
  reportId: ReportId;
  scheduleId: string | null;
  period: string;
  format: ShareFormat;
  recipientIds: string[];
  byId: string | null;
  status: "sent" | "skipped";
  note: string | null;
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (k: string) => `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
const addMonths = (k: string, n: number) => {
  const m = +k.slice(0, 4) * 12 + (+k.slice(5, 7) - 1) + n;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};

export function seedReports(now = new Date()) {
  const today = churchDate(now);
  const thisMonth = today.slice(0, 7);
  const schedules: ScheduleRecord[] = [
    {
      id: "sch-1",
      reportId: "lcm-pack",
      name: "LCM pack for the leadership council",
      period: "last_full_month",
      serviceType: null,
      frequency: "monthly",
      day: 2,
      time: "08:00",
      format: "pdf",
      recipientIds: ["u03", "u04", "u11", "u08"],
      message: "The monthly pack for Thursday's meeting.",
      active: true,
      createdById: "u04",
      createdAt: new Date(now.getTime() - 120 * 86_400_000).toISOString(),
      rowVer: 1,
    },
    {
      id: "sch-2",
      reportId: "ratings-referrals",
      name: "Weekly ratings for the Welcome Lead",
      period: "last_full_month",
      serviceType: null,
      frequency: "weekly",
      day: 1,
      time: "07:30",
      format: "link",
      recipientIds: ["u11"],
      message: null,
      active: false,
      createdById: "u11",
      createdAt: new Date(now.getTime() - 40 * 86_400_000).toISOString(),
      rowVer: 2,
    },
  ];
  const runs: RunRecord[] = [];
  for (let i = 3; i >= 1; i--) {
    const m = addMonths(thisMonth, -i + 1);
    runs.push({
      id: `run-m${i}`,
      at: fromChurchLocal(`${m}-02T08:00`),
      reportId: "lcm-pack",
      scheduleId: "sch-1",
      period: ym(addMonths(m, -1)),
      format: "pdf",
      recipientIds: ["u03", "u04", "u11", "u08"],
      byId: null,
      status: "sent",
      note: null,
    });
  }
  runs.push({
    id: "run-w1",
    at: new Date(now.getTime() - 16 * 86_400_000).toISOString(),
    reportId: "ratings-referrals",
    scheduleId: "sch-2",
    period: ym(addMonths(thisMonth, -1)),
    format: "link",
    recipientIds: ["u11"],
    byId: null,
    status: "sent",
    note: null,
  });
  runs.push({
    id: "run-s1",
    at: new Date(now.getTime() - 6 * 86_400_000).toISOString(),
    reportId: "retention",
    scheduleId: null,
    period: `${MON[+addMonths(thisMonth, -6).slice(5, 7) - 1]} – ${ym(addMonths(thisMonth, -1))}`,
    format: "pdf",
    recipientIds: ["u03"],
    byId: "u11",
    status: "sent",
    note: "For the pastor's review of follow-up.",
  });
  return { schedules, runs: runs.filter((r) => r.at <= now.toISOString()).sort((a, b) => b.at.localeCompare(a.at)) };
}
