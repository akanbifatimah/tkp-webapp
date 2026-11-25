import {
  PERIOD_LABEL,
  REPORTS,
  type CountRow,
  type Period,
  type RatingsReport,
  type Recipient,
  type ReportData,
  type ReportDef,
  type ReportId,
  type ReportRange,
  type ReportRun,
  type ReportsResponse,
  type RetentionReport,
  type Schedule,
  type ScheduleInput,
  type SchedulesResponse,
  type ShareFormat,
  type ShareInput,
  type YtdReport,
} from "@/features/reports/report-types";
import { ROLE_LABEL, can } from "@/lib/permissions";
import { churchDate, fromChurchLocal } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { RATING_OWNER } from "./lcm-outcomes";
import type { WelcomeEntry } from "./seed/guests";
import type { RunRecord, ScheduleRecord } from "./seed/reports";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock Reports hub (PRD PL-2 to PL-5, W-9 to W-11; docs/API.md §12).
 * Totals only. Groups under five are never shown on their own (PL-1): small
 * cities fold into one row, a small cohort hides its rate.
 */

const ok = <T,>(body: T, status = 200): Result<T> => ({ ok: true, status, body });
const no = (status: number, code: string, message: string, fields?: Record<string, string[]>): Result<never> => ({
  ok: false,
  status,
  code,
  message,
  ...(fields ? { fields } : {}),
});
const has = (u: Pick<StaffRecord, "roles">, p: ReportDef["permission"]) => u.roles.some((r) => can(r, p));
const nameOf = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? null) : null);
const defOf = (id: string) => REPORTS.find((r) => r.id === id) ?? null;
export const SMALL = 5;

/* ----------------------------------------------------------------- periods */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (k: string) => `${MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
export const addMonths = (k: string, n: number) => {
  const m = +k.slice(0, 4) * 12 + (+k.slice(5, 7) - 1) + n;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};
const monthEnd = (k: string) => {
  const [y, m] = [+k.slice(0, 4), +k.slice(5, 7)];
  return `${k}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function resolvePeriod(p: Period, now = new Date()): ReportRange {
  const today = churchDate(now);
  const thisMonth = today.slice(0, 7);
  const last = addMonths(thisMonth, -1);
  const span = (from: string, to: string, inProgress = false): ReportRange => ({
    from,
    to,
    inProgress,
    label: (from === to ? ym(from) : from.slice(0, 4) === to.slice(0, 4) ? `${MON[+from.slice(5, 7) - 1]} – ${ym(to)}` : `${ym(from)} – ${ym(to)}`) + (inProgress ? " (to date)" : ""),
  });
  if (p === "month_to_date") return span(thisMonth, thisMonth, true);
  if (p === "last_3_months") return span(addMonths(last, -2), last);
  if (p === "last_6_months") return span(addMonths(last, -5), last);
  if (p === "year_to_date") return span(`${today.slice(0, 4)}-01`, thisMonth, true);
  return span(last, last);
}

const inRange = (list: WelcomeEntry[], r: ReportRange, type: string | null, today: string) => {
  const a = `${r.from}-01`;
  const b = r.inProgress ? today : monthEnd(r.to);
  return list.filter((e) => e.serviceDate >= a && e.serviceDate <= b && (!type || e.serviceType === type));
};

/** Count by a label, biggest first. Rows under five fold into one "Fewer than 5 each" row (PL-1). */
function countRows(list: WelcomeEntry[], label: (e: WelcomeEntry) => string, opts: { small?: boolean; prior?: WelcomeEntry[] } = {}): CountRow[] {
  const by = new Map<string, number>();
  for (const e of list) by.set(label(e), (by.get(label(e)) ?? 0) + 1);
  const prior = new Map<string, number>();
  for (const e of opts.prior ?? []) prior.set(label(e), (prior.get(label(e)) ?? 0) + 1);
  for (const k of prior.keys()) if (!by.has(k)) by.set(k, 0);
  const total = list.length || 1;
  let rows: CountRow[] = [...by.entries()].map(([k, n]) => ({ label: k, guests: n, share: Math.round((n * 1000) / total) / 10, ...(opts.prior ? { prior: prior.get(k) ?? 0 } : {}) }));
  if (opts.small) {
    const tiny = rows.filter((r) => r.guests < SMALL && (r.prior ?? 0) < SMALL);
    rows = rows.filter((r) => !tiny.includes(r));
    if (tiny.length) {
      const n = tiny.reduce((s, r) => s + r.guests, 0);
      rows.push({
        label: `Fewer than ${SMALL} each (${tiny.length} ${tiny.length === 1 ? "place" : "places"})`,
        guests: n,
        share: Math.round((n * 1000) / total) / 10,
        grouped: tiny.length,
        ...(opts.prior ? { prior: tiny.reduce((s, r) => s + (r.prior ?? 0), 0) } : {}),
      });
    }
  }
  return rows.sort((a, b) => (a.grouped ? 1 : 0) - (b.grouped ? 1 : 0) || b.guests - a.guests || (b.prior ?? 0) - (a.prior ?? 0) || a.label.localeCompare(b.label));
}

/* ----------------------------------------------------------------- the three reports */

const RATING_AREAS = [
  ["Music", "Music"],
  ["Preaching", "Preaching"],
  ["Comfort", "Comfort"],
  ["Hospitality", "Hospitality"],
  ["ChurchEnvironment", "Church environment"],
  ["ThePeople", "The people"],
  ["Parking", "Parking"],
  ["Traffic", "Traffic"],
] as const;
const ng = (v: string | null | undefined) => (v && v.trim() ? v : "Not given");

export function ratingsReport(range: ReportRange, type: string | null, now = new Date()): RatingsReport {
  const list = inRange(db.entries, range, type, churchDate(now));
  const rated = list.filter((e) => Object.values(e.ratings).some((v) => v !== null && v !== undefined));
  const inviters = new Map<string, number>();
  for (const e of list) if (e.howHeard === "Invited By Someone" && e.whoInvitedYou) inviters.set(e.whoInvitedYou, (inviters.get(e.whoInvitedYou) ?? 0) + 1);
  return {
    range,
    serviceType: type,
    guests: list.length,
    rated: rated.length,
    ratings: RATING_AREAS.map(([key, area]) => {
      const v = list.map((e) => e.ratings[key]).filter((x): x is number => x !== null && x !== undefined);
      return { area, average: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null, rated: v.length, low: v.filter((x) => x <= 5).length, owner: RATING_OWNER[key]! };
    }),
    howHeard: countRows(list, (e) => ng(e.howHeard)),
    // Inviters are members, named as in LCM; one guest alone is not shown.
    inviters: [...inviters.entries()].filter(([, n]) => n > 1).map(([name, guests]) => ({ name, guests })).sort((a, b) => b.guests - a.guests).slice(0, 10),
    cities: countRows(list, (e) => ng(e.city), { small: true }),
    cells: countRows(list, (e) => (e.cellGroup && e.cellGroup !== "N/A" ? `${e.cellGroup} cell` : "Outside the cell areas")),
  };
}

export function ytdReport(type: string | null, now = new Date()): YtdReport {
  const today = churchDate(now);
  const range = resolvePeriod("year_to_date", now);
  const year = +today.slice(0, 4);
  const first = db.entries.filter((e) => e.visitNumber === 1 && (!type || e.serviceType === type));
  const cur = first.filter((e) => e.serviceDate >= `${year}-01-01` && e.serviceDate <= today);
  const lastToday = `${year - 1}${today.slice(4)}`;
  const pri = first.filter((e) => e.serviceDate >= `${year - 1}-01-01` && e.serviceDate <= lastToday);
  const through = +today.slice(5, 7);
  return {
    range,
    serviceType: type,
    year,
    thisYear: cur.length,
    lastYear: pri.length,
    byMonth: Array.from({ length: through }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      return { month: `${year}-${m}`, thisYear: cur.filter((e) => e.serviceDate.slice(5, 7) === m).length, lastYear: pri.filter((e) => e.serviceDate.slice(5, 7) === m).length };
    }),
    byService: countRows(cur, (e) => e.serviceType, { prior: pri }),
    byCell: countRows(cur, (e) => (e.cellGroup && e.cellGroup !== "N/A" ? `${e.cellGroup} cell` : "Outside the cell areas"), { prior: pri }),
    byCity: countRows(cur, (e) => ng(e.city), { prior: pri, small: true }),
  };
}

export function retentionReport(range: ReportRange, type: string | null, now = new Date()): RetentionReport {
  const today = churchDate(now);
  const formBack = new Map<number, string[]>();
  for (const e of db.entries) if (e.visitNumber > 1) formBack.set(e.connectId, [...(formBack.get(e.connectId) ?? []), e.serviceDate]);
  const byId = new Map(db.connect.map((r) => [r.connectId, r]));
  const months: string[] = [];
  for (let m = range.from; m <= range.to; m = addMonths(m, 1)) months.push(m);
  const cohorts = months.map((month) => {
    const list = db.entries.filter((e) => e.visitNumber === 1 && e.serviceDate.startsWith(month) && e.serviceDate <= today && (!type || e.serviceType === type));
    let viaForm = 0;
    let viaConnect = 0;
    let viaBoth = 0;
    let open = 0;
    for (const e of list) {
      const end = addDays(e.serviceDate, 30);
      const f = (formBack.get(e.connectId) ?? []).some((d) => d > e.serviceDate && d <= end);
      const r = byId.get(e.connectId);
      const c = !!(r?.state.returned2ndVisit && r.state.returnVisitDate && r.state.returnVisitDate > e.serviceDate && r.state.returnVisitDate <= end);
      if (f && c) viaBoth++;
      else if (f) viaForm++;
      else if (c) viaConnect++;
      else if (end > today) open++;
    }
    const back = viaForm + viaConnect + viaBoth;
    const hidden = list.length < SMALL;
    return {
      month,
      firstTime: list.length,
      back: hidden ? 0 : back,
      rate: hidden || !list.length ? null : Math.round((back * 1000) / list.length) / 10,
      viaForm: hidden ? 0 : viaForm,
      viaConnect: hidden ? 0 : viaConnect,
      viaBoth: hidden ? 0 : viaBoth,
      open: hidden ? 0 : open,
      hidden,
      _back: back,
    };
  });
  const firstTime = cohorts.reduce((s, c) => s + c.firstTime, 0);
  const back = cohorts.reduce((s, c) => s + c._back, 0);
  return {
    range,
    serviceType: type,
    cohorts: cohorts.map(({ _back, ...c }) => (void _back, c)),
    total: { firstTime, back, rate: firstTime >= SMALL ? Math.round((back * 1000) / firstTime) / 10 : null },
  };
}

/* ----------------------------------------------------------------- endpoints: library and data */

const visibleReports = (u: StaffRecord) => REPORTS.filter((r) => has(u, r.permission));

export function listReports(u: StaffRecord): Result<ReportsResponse> {
  if (!has(u, "reports.view")) return no(403, "FORBIDDEN", "You don't have access to reports.");
  return ok({
    reports: visibleReports(u).map((r) => ({
      ...r,
      schedules: db.reportSchedules.filter((s) => s.reportId === r.id).length,
      lastShared: db.reportRuns.find((x) => x.reportId === r.id && x.status === "sent")?.at ?? null,
    })),
    can: { share: has(u, "reports.share") },
  });
}

export function getReport(u: StaffRecord, id: string, q: { period?: string | null; type?: string | null }, now = new Date()): Result<ReportData> {
  const def = defOf(id);
  if (!def || !["ratings-referrals", "ytd-service-location", "retention"].includes(id)) return no(404, "NOT_FOUND", "No such report.");
  if (!has(u, def.permission)) return no(403, "FORBIDDEN", "You don't have access to this report.");
  const period = (def.periods.includes(q.period as Period) ? q.period : def.periods[0]) as Period;
  const type = q.type || null;
  if (type && !db.services.some((s) => s.name === type)) return no(422, "VALIDATION_FAILED", "No such service.", { type: ["No such service"] });
  audit(u.id, "reports.view", id, { after: { name: def.title, period: PERIOD_LABEL[period] } });
  const range = resolvePeriod(period, now);
  if (id === "ratings-referrals") return ok({ id, data: ratingsReport(range, type, now) });
  if (id === "ytd-service-location") return ok({ id, data: ytdReport(type, now) });
  return ok({ id: "retention", data: retentionReport(range, type, now) });
}

/** Logged before the screen prints or downloads (exports are audited, PRD EV-31 / W-9). */
export function logReportExport(u: StaffRecord, id: string, b: { format?: string; period?: string; type?: string | null }): Result<{ logged: true }> {
  const def = defOf(id);
  if (!def) return no(404, "NOT_FOUND", "No such report.");
  if (!has(u, def.permission)) return no(403, "FORBIDDEN", "You don't have access to this report.");
  if (b.format !== "pdf" && b.format !== "csv") return no(422, "VALIDATION_FAILED", "Choose PDF or CSV.", { format: ["pdf or csv"] });
  audit(u.id, "reports.export", id, { after: { name: def.title, format: b.format.toUpperCase(), period: PERIOD_LABEL[b.period as Period] ?? b.period ?? null, serviceType: b.type ?? null } });
  return ok({ logged: true });
}

/* ----------------------------------------------------------------- sharing */

/** Staff who could receive a report: only people who may open it themselves get it. */
export function recipientsFor(reportId: string): Recipient[] {
  const def = defOf(reportId);
  return db.staff
    .filter((s) => s.isActive && !(s.roles.length === 1 && s.roles[0] === "tkp_member"))
    .map((s) => {
      const eligible = !!def && has(s, def.permission);
      return { id: s.id, name: s.fullName, roles: s.roles.map((r) => ROLE_LABEL[r]).join(", "), eligible, reason: eligible ? null : "Can't open this report" };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
}

export function getRecipients(u: StaffRecord, reportId: string): Result<{ items: Recipient[] }> {
  if (!has(u, "reports.share")) return no(403, "FORBIDDEN", "You can't share reports.");
  if (!defOf(reportId)) return no(404, "NOT_FOUND", "No such report.");
  return ok({ items: recipientsFor(reportId) });
}

function checkShare(def: ReportDef, b: Partial<ShareInput>): Result<{ period: Period; format: ShareFormat; recipients: string[]; message: string | null; serviceType: string | null }> {
  if (!def.shareable) return no(422, "NOT_SHAREABLE", "This report can't be shared from the hub.");
  const fields: Record<string, string[]> = {};
  const period = b.period as Period;
  if (!def.periods.includes(period)) fields.period = [`One of: ${def.periods.map((p) => PERIOD_LABEL[p]).join(", ")}`];
  const format = b.format as ShareFormat;
  if (!def.formats.includes(format)) fields.format = [`One of: ${def.formats.join(", ")}`];
  const ids = [...new Set(b.recipients ?? [])];
  const people = recipientsFor(def.id);
  if (!ids.length) fields.recipients = ["Choose at least one person"];
  const unknown = ids.filter((id) => !people.some((p) => p.id === id));
  const cant = people.filter((p) => ids.includes(p.id) && !p.eligible).map((p) => `${p.name} can't open this report`);
  if (unknown.length || cant.length) fields.recipients = [...cant, ...unknown.map((id) => `Unknown person ${id}`)];
  const message = b.message?.trim() || null;
  if (message && message.length > 500) fields.message = ["Up to 500 characters"];
  const serviceType = b.serviceType || null;
  if (serviceType && !db.services.some((s) => s.name === serviceType)) fields.serviceType = ["No such service"];
  if (Object.keys(fields).length) return no(422, "VALIDATION_FAILED", Object.values(fields)[0]![0]!, fields);
  return ok({ period, format, recipients: ids, message, serviceType });
}

const toRun = (r: RunRecord): ReportRun => ({
  id: r.id,
  at: r.at,
  reportId: r.reportId,
  reportTitle: defOf(r.reportId)?.title ?? r.reportId,
  scheduleId: r.scheduleId,
  scheduleName: db.reportSchedules.find((s) => s.id === r.scheduleId)?.name ?? null,
  period: r.period,
  format: r.format,
  sentTo: r.recipientIds.map((id) => nameOf(id) ?? id),
  by: r.byId ? (nameOf(r.byId) ?? "Someone") : "Schedule",
  status: r.status,
  note: r.note,
});

/** Share now. The backend emails each person a link (sign-in needed) or the file; nothing goes outside the staff list. */
export function shareReport(u: StaffRecord, id: string, b: Partial<ShareInput>, now = new Date()): Result<ReportRun> {
  const def = defOf(id);
  if (!def) return no(404, "NOT_FOUND", "No such report.");
  if (!has(u, "reports.share") || !has(u, def.permission)) return no(403, "FORBIDDEN", "You can't share this report.");
  const v = checkShare(def, b);
  if (!v.ok) return v;
  const run: RunRecord = {
    id: crypto.randomUUID(),
    at: now.toISOString(),
    reportId: def.id,
    scheduleId: null,
    period: resolvePeriod(v.body.period, now).label,
    format: v.body.format,
    recipientIds: v.body.recipients,
    byId: u.id,
    status: "sent",
    note: v.body.message,
  };
  db.reportRuns.unshift(run);
  audit(u.id, "reports.share", def.id, { after: { name: def.title, period: run.period, format: run.format.toUpperCase(), recipients: run.recipientIds.map((x) => nameOf(x) ?? x) } });
  return ok(toRun(run), 201);
}

/* ----------------------------------------------------------------- schedules */

/** The next time a schedule runs, in church time. Monthly days stop at 28 so every month has one. */
export function nextRun(s: Pick<ScheduleRecord, "frequency" | "day" | "time">, now = new Date()): string {
  const today = churchDate(now);
  for (let i = 0; i < 70; i++) {
    const d = addDays(today, i);
    const match = s.frequency === "monthly" ? +d.slice(8, 10) === s.day : new Date(`${d}T12:00:00Z`).getUTCDay() === s.day;
    if (!match) continue;
    const at = fromChurchLocal(`${d}T${s.time}`);
    if (at > now.toISOString()) return at;
  }
  return fromChurchLocal(`${addDays(today, 7)}T${s.time}`);
}

function toSchedule(s: ScheduleRecord, now = new Date()): Schedule {
  const last = db.reportRuns.find((r) => r.scheduleId === s.id);
  return {
    id: s.id,
    reportId: s.reportId,
    reportTitle: defOf(s.reportId)?.title ?? s.reportId,
    name: s.name,
    period: s.period,
    serviceType: s.serviceType,
    frequency: s.frequency,
    day: s.day,
    time: s.time,
    format: s.format,
    recipients: s.recipientIds.map((id) => ({ id, name: nameOf(id) ?? id })),
    message: s.message,
    active: s.active,
    nextRunAt: s.active ? nextRun(s, now) : null,
    lastRun: last ? toRun(last) : null,
    createdBy: nameOf(s.createdById),
    createdAt: s.createdAt,
    rowVer: s.rowVer,
  };
}

export function listSchedules(u: StaffRecord): Result<SchedulesResponse> {
  if (!has(u, "reports.view")) return no(403, "FORBIDDEN", "You don't have access to reports.");
  const mine = new Set(visibleReports(u).map((r) => r.id));
  return ok({
    items: db.reportSchedules.filter((s) => mine.has(s.reportId)).map((s) => toSchedule(s)),
    runs: db.reportRuns.filter((r) => mine.has(r.reportId)).slice(0, 30).map(toRun),
    can: { share: has(u, "reports.share") },
  });
}

function checkSchedule(u: StaffRecord, b: Partial<ScheduleInput>) {
  const def = defOf(b.reportId ?? "");
  if (!def) return no(422, "VALIDATION_FAILED", "Choose a report.", { reportId: ["Choose a report"] });
  if (!has(u, def.permission)) return no(403, "FORBIDDEN", "You can't share this report.");
  const v = checkShare(def, b);
  if (!v.ok) return v;
  const fields: Record<string, string[]> = {};
  const name = (b.name ?? "").trim();
  if (name.length < 2 || name.length > 80) fields.name = ["2 to 80 characters"];
  if (b.frequency !== "monthly" && b.frequency !== "weekly") fields.frequency = ["Monthly or weekly"];
  const day = Number(b.day);
  if (b.frequency === "monthly" && !(Number.isInteger(day) && day >= 1 && day <= 28)) fields.day = ["A day from 1 to 28"];
  if (b.frequency === "weekly" && !(Number.isInteger(day) && day >= 0 && day <= 6)) fields.day = ["A day of the week"];
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time ?? "")) fields.time = ["A time like 08:00"];
  if (db.reportSchedules.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== (b as { id?: string }).id))
    return no(409, "NAME_TAKEN", "Another schedule has this name.", { name: ["Another schedule has this name"] });
  if (Object.keys(fields).length) return no(422, "VALIDATION_FAILED", Object.values(fields)[0]![0]!, fields);
  return ok({ def, ...v.body, name, frequency: b.frequency as "monthly" | "weekly", day, time: b.time! });
}

const describe = (s: ScheduleRecord) => ({
  name: s.name,
  report: defOf(s.reportId)?.title ?? s.reportId,
  period: PERIOD_LABEL[s.period],
  when: s.frequency === "monthly" ? `Monthly on day ${s.day} at ${s.time}` : `Weekly on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][s.day]} at ${s.time}`,
  format: s.format.toUpperCase(),
  recipients: s.recipientIds.map((id) => nameOf(id) ?? id),
});

export function createSchedule(u: StaffRecord, b: Partial<ScheduleInput>): Result<Schedule> {
  if (!has(u, "reports.share")) return no(403, "FORBIDDEN", "You can't schedule reports.");
  const v = checkSchedule(u, b);
  if (!v.ok) return v;
  const x = v.body;
  const s: ScheduleRecord = {
    id: crypto.randomUUID(),
    reportId: x.def.id,
    name: x.name,
    period: x.period,
    serviceType: x.serviceType,
    frequency: x.frequency,
    day: x.day,
    time: x.time,
    format: x.format,
    recipientIds: x.recipients,
    message: x.message,
    active: true,
    createdById: u.id,
    createdAt: new Date().toISOString(),
    rowVer: 1,
  };
  db.reportSchedules.push(s);
  audit(u.id, "reports.schedule.create", s.id, { after: describe(s) });
  return ok(toSchedule(s), 201);
}

const findSchedule = (id: string) => db.reportSchedules.find((s) => s.id === id);

export function updateSchedule(u: StaffRecord, id: string, b: Partial<ScheduleInput> & { rowVer?: number }): Result<Schedule> {
  if (!has(u, "reports.share")) return no(403, "FORBIDDEN", "You can't schedule reports.");
  const s = findSchedule(id);
  if (!s) return no(404, "NOT_FOUND", "No such schedule.");
  if (b.rowVer !== s.rowVer) return no(409, "CONFLICT", "Someone changed this schedule. Look again before saving.");
  const v = checkSchedule(u, { ...b, id } as Partial<ScheduleInput>);
  if (!v.ok) return v;
  const before = describe(s);
  const x = v.body;
  Object.assign(s, { reportId: x.def.id, name: x.name, period: x.period, serviceType: x.serviceType, frequency: x.frequency, day: x.day, time: x.time, format: x.format, recipientIds: x.recipients, message: x.message, rowVer: s.rowVer + 1 });
  const after = describe(s);
  const changed = Object.keys(after).filter((k) => JSON.stringify(before[k as keyof typeof before]) !== JSON.stringify(after[k as keyof typeof after]));
  if (changed.length)
    audit(u.id, "reports.schedule.update", s.id, {
      before: Object.fromEntries([["name", before.name], ...changed.map((k) => [k, before[k as keyof typeof before]])]),
      after: Object.fromEntries([["name", after.name], ...changed.map((k) => [k, after[k as keyof typeof after]])]),
    });
  return ok(toSchedule(s));
}

export function setScheduleActive(u: StaffRecord, id: string, active: boolean, rowVer?: number): Result<Schedule> {
  if (!has(u, "reports.share")) return no(403, "FORBIDDEN", "You can't schedule reports.");
  const s = findSchedule(id);
  if (!s) return no(404, "NOT_FOUND", "No such schedule.");
  if (rowVer !== s.rowVer) return no(409, "CONFLICT", "Someone changed this schedule. Look again.");
  if (s.active === active) return ok(toSchedule(s));
  s.active = active;
  s.rowVer++;
  audit(u.id, active ? "reports.schedule.resume" : "reports.schedule.pause", s.id, { before: { name: s.name, active: !active }, after: { name: s.name, active } });
  return ok(toSchedule(s));
}

/** Run a schedule now (the "Send now" button). The backend job does the same at nextRunAt. */
export function runSchedule(u: StaffRecord, id: string, now = new Date()): Result<ReportRun> {
  if (!has(u, "reports.share")) return no(403, "FORBIDDEN", "You can't share reports.");
  const s = findSchedule(id);
  if (!s) return no(404, "NOT_FOUND", "No such schedule.");
  // People who lost access since the schedule was made are skipped, never sent to.
  const people = recipientsFor(s.reportId);
  const ok2 = s.recipientIds.filter((r) => people.some((p) => p.id === r && p.eligible));
  const skipped = s.recipientIds.filter((r) => !ok2.includes(r));
  const run: RunRecord = {
    id: crypto.randomUUID(),
    at: now.toISOString(),
    reportId: s.reportId,
    scheduleId: s.id,
    period: resolvePeriod(s.period, now).label,
    format: s.format,
    recipientIds: ok2,
    byId: u.id,
    status: ok2.length ? "sent" : "skipped",
    note: skipped.length ? `Not sent to ${skipped.map((r) => nameOf(r) ?? r).join(", ")}: no longer allowed to open it` : s.message,
  };
  db.reportRuns.unshift(run);
  audit(u.id, "reports.schedule.run", s.id, { after: { name: s.name, period: run.period, recipients: ok2.map((r) => nameOf(r) ?? r) } });
  return ok(toRun(run), 201);
}

export function deleteSchedule(u: StaffRecord, id: string): Result<{ deleted: true }> {
  if (!has(u, "reports.share")) return no(403, "FORBIDDEN", "You can't schedule reports.");
  const s = findSchedule(id);
  if (!s) return no(404, "NOT_FOUND", "No such schedule.");
  db.reportSchedules = db.reportSchedules.filter((x) => x !== s);
  audit(u.id, "reports.schedule.delete", s.id, { before: describe(s) });
  return ok({ deleted: true });
}

export type { ReportId };
