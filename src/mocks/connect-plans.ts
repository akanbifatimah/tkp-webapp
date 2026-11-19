import { stepLabel, type Phase, type StepKey, type Team } from "@/features/connect/model";
import { isOverdue48, weekNo } from "@/features/connect/rules";
import type { GuestTrackResponse, GuestTrackRow, JourneyEvent, JourneyResponse, MetricsResponse, Ratio } from "@/features/connect/types";
import { CONNECT_ACCESS_DENIED, can } from "@/lib/permissions";
import { churchDate } from "@/lib/time";
import { membersOf, seesWholeTeam, teamsFor, type Result } from "./connect-api";
import { audit, db } from "./db";
import { DEPARTMENTS, type ConnectRecord } from "./seed/guests";
import type { StaffRecord } from "./seed/staff";

/**
 * The four PLANNED Connect tabs (TKP Connect UI-C4…C7), drafted from what the
 * repo agrees so far. Rules marked DRAFT are not signed off (doc 09 Q10–Q13).
 */

const ok = <T,>(body: T): Result<T> => ({ ok: true, status: 200, body });
const no = (status: number, code: string, message: string): Result<never> => ({ ok: false, status, code, message });
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const d2 = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const days = (a: string, b: string) => Math.round((d2(b) - d2(a)) / DAY);
const nameOf = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? null) : null);
const hasConnect = (u: StaffRecord) => u.roles.some((r) => can(r, "connect.queue.view"));
const wholeAny = (u: StaffRecord) => seesWholeTeam(u, "church_office") || seesWholeTeam(u, "integration");

/* ================================================================= Guest Track (UI-C4) */

/**
 * DRAFT stage rules, from the three Guest Track scripts' "when" notes:
 * - 48h: the Sunday-evening text, within 48 hours of the form (gt-48h);
 * - invite2: Wednesday or Thursday after the first visit (gt-return2);
 * - awaiting: no confirmed second visit yet, up to 4 weeks after the first;
 * - invite3: within 48 hours of a confirmed second visit (gt-return3).
 */
export function guestTrack(u: StaffRecord, now = new Date()): Result<GuestTrackResponse> {
  if (!hasConnect(u)) return no(403, "FORBIDDEN", CONNECT_ACCESS_DENIED);
  const today = churchDate(now);
  const seesAll = wholeAny(u);
  const rows: GuestTrackRow[] = [];
  for (const r of db.connect) {
    if (r.status !== "Active") continue;
    if (!seesAll && r.coMemberId !== u.id && r.itMemberId !== u.id) continue;
    const since = days(r.entry.serviceDate, today);
    let stage: GuestTrackRow["stage"] | null = null;
    if (r.state.returned2ndVisit && r.state.returnVisitDate && days(r.state.returnVisitDate, today) <= 3) stage = "invite3";
    else if (!r.state.returned2ndVisit) {
      if (now.getTime() - new Date(r.clockStartAt).getTime() <= 48 * HOUR) stage = "48h";
      else if (since <= 6) stage = "invite2";
      else if (since <= 27) stage = "awaiting";
    }
    if (!stage) continue;
    rows.push({
      connectId: r.connectId,
      guestId: r.guestId,
      firstName: r.entry.firstName ?? "",
      lastName: r.entry.lastName ?? "",
      phone: r.entry.phone,
      serviceDate: r.entry.serviceDate,
      serviceType: r.entry.serviceType,
      clockStartAt: r.clockStartAt,
      daysSince: since,
      stage,
      returnVisitDate: r.state.returnVisitDate,
      coMemberId: r.coMemberId,
      coName: nameOf(r.coMemberId),
      itMemberId: r.itMemberId,
      itName: nameOf(r.itMemberId),
    });
  }
  rows.sort((a, b) => a.daysSince - b.daysSince || a.lastName.localeCompare(b.lastName));
  return ok({ me: { id: u.id, fullName: u.fullName }, seesAll, rows });
}

/* ================================================================= Guest journey (UI-C5) */

/** Connect roles, and the Welcome Lead and Welcome Team view only (doc 02 matrix). */
export function journey(u: StaffRecord, connectId: number, now = new Date()): Result<JourneyResponse> {
  if (!u.roles.some((r) => can(r, "connect.journey.view"))) return no(403, "FORBIDDEN", CONNECT_ACCESS_DENIED);
  const r = db.connect.find((x) => x.connectId === connectId);
  if (!r) return no(404, "NOT_FOUND", "Guest not found in Connect.");
  const logs = db.connectLogs.filter((l) => l.connectId === connectId);
  const visits = db.entries
    .filter((e) => e.connectId === connectId)
    .map((e) => ({ guestId: e.id, serviceDate: e.serviceDate, serviceType: e.serviceType, visitNumber: e.visitNumber, submittedAt: e.submittedAt }))
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));

  const events: JourneyEvent[] = [];
  for (const v of visits) events.push({ at: v.submittedAt, kind: "form", text: v.visitNumber > 1 ? `Welcome form again · visit ${v.visitNumber}` : "Welcome form submitted · journey started in Phase 1", by: null });
  const first = [...logs].sort((a, b) => a.savedAt.localeCompare(b.savedAt))[0];
  if (first) {
    const hours = Math.round((new Date(first.savedAt).getTime() - new Date(r.clockStartAt).getTime()) / HOUR);
    events.push({ at: first.savedAt, kind: "contact", text: `First contact · ${first.method}${first.callOutcome ? ` · ${first.callOutcome}` : ""} · ${hours} h after the form`, by: first.author });
  }
  for (const [k, v] of Object.entries(r.checklist) as [StepKey, (typeof r.checklist)[StepKey]][]) {
    if (!v) continue;
    if (k === "P1Complete" || k === "P2Complete") events.push({ at: v.at, kind: "phase", text: `Moved to Phase ${k === "P1Complete" ? 2 : 3}`, by: v.by });
    else if (k === "P3Complete") events.push({ at: v.at, kind: "completed", text: "12-week journey completed", by: v.by });
    else events.push({ at: v.at, kind: "tick", text: `${stepLabel(k)} ticked`, by: v.by });
  }
  if (r.state.returned2ndVisit && r.state.returnVisitDate) events.push({ at: `${r.state.returnVisitDate}T18:00:00Z`, kind: "return", text: "Returned for 2nd visit (confirmed by phone)", by: null });
  if (r.status === "Closed") {
    const last = logs[0];
    events.push({ at: last?.savedAt ?? r.clockStartAt, kind: "closed", text: `Journey closed · ${r.closedReason ?? "closed"}`, by: last?.author ?? null });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));

  audit(u.id, "connect.journey.view", String(connectId));
  return ok({
    me: { id: u.id, fullName: u.fullName },
    guest: {
      connectId: r.connectId,
      guestId: r.guestId,
      serviceDate: r.entry.serviceDate,
      serviceType: r.entry.serviceType,
      firstName: r.entry.firstName ?? "",
      lastName: r.entry.lastName ?? "",
      phone: r.entry.phone,
      cellGroup: r.entry.cellGroup,
      clockStartAt: r.clockStartAt,
      status: r.status,
      phase: r.phase,
      weekNo: weekNo(r.entry.serviceDate, now),
      coMemberId: r.coMemberId,
      coName: nameOf(r.coMemberId),
      itMemberId: r.itMemberId,
      itName: nameOf(r.itMemberId),
      coContacted: logs.some((l) => l.team === "church_office"),
      coAttempts: r.coAttempts,
      coLastCallOutcome: r.coLastCallOutcome,
      coNextAction: r.state.coNextAction,
      itContacted: r.itContacted,
      overdue48: isOverdue48(r, now),
      returned2ndVisit: r.state.returned2ndVisit,
      closedReason: r.closedReason,
      state: structuredClone(r.state),
      checklist: structuredClone(r.checklist),
      coNote: null,
      legacyNotes: r.legacyNotes,
    },
    visits,
    department: DEPARTMENTS.find((d) => d.id === r.state.itDepartmentId)?.name ?? null,
    howHeard: r.entry.howHeard,
    logs,
    events,
  });
}

/* ================================================================= Team metrics (UI-C7) */

/**
 * DRAFT definitions (doc 01 §8.2, doc 09 Q10–Q11). The cohort is the guests whose
 * first visit falls in the period. A guest is "due" for a step once its deadline
 * has passed; "done" when the step was ticked by the deadline.
 * KPI deadlines (Q10's proposal): 48 Hr Welcome within 48 hours of the form;
 * Initial Welcome Call by day 3; culture, relationship and Phase 1 Complete by the end of week 2.
 */
const KPI: { key: StepKey; label: string; deadline: string; byMs: (r: ConnectRecord) => number }[] = [
  { key: "P1Welcome48h", label: "48-hour welcome", deadline: "within 48 hours of the form", byMs: (r) => new Date(r.clockStartAt).getTime() + 48 * HOUR },
  { key: "P1WelcomeCall", label: "Initial welcome call", deadline: "by day 3", byMs: (r) => d2(r.entry.serviceDate) + 4 * DAY },
  { key: "P1Culture", label: "Church culture", deadline: "by the end of week 2", byMs: (r) => d2(r.entry.serviceDate) + 15 * DAY },
  { key: "P1Relationship", label: "Relationship & interests", deadline: "by the end of week 2", byMs: (r) => d2(r.entry.serviceDate) + 15 * DAY },
  { key: "P1Complete", label: "Phase 1 complete", deadline: "by the end of week 2", byMs: (r) => d2(r.entry.serviceDate) + 15 * DAY },
];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const addMonths = (ym: string, n: number) => {
  const m = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
};
const monthEnd = (ym: string) => new Date(d2(`${addMonths(ym, 1)}-01`) - DAY).toISOString().slice(0, 10);
const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function metrics(u: StaffRecord, periodKey: string | null, now = new Date()): Result<MetricsResponse> {
  // Q12 is open; until it is answered, every Connect role sees Team metrics (doc 02 matrix).
  if (!hasConnect(u)) return no(403, "FORBIDDEN", CONNECT_ACCESS_DENIED);
  const t = teamsFor(u);
  if (t === "no-team") return no(403, "NO_FOLLOW_UP_TEAM", "You are not on a follow-up team yet. Ask the team lead to add you.");
  const nowMs = now.getTime();
  const today = churchDate(now);
  const thisMonth = today.slice(0, 7);
  const key = periodKey === "ytd" || (periodKey && /^\d{4}-\d{2}$/.test(periodKey)) ? periodKey : addMonths(thisMonth, -1);
  const start = key === "ytd" ? `${today.slice(0, 4)}-01-01` : `${key}-01`;
  const end = key === "ytd" ? today : key === thisMonth ? today : monthEnd(key);
  const label = key === "ytd" ? `Year to date ${today.slice(0, 4)}` : `${MON[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
  const inCohort = (r: ConnectRecord, a: string, b: string) => r.entry.serviceDate >= a && r.entry.serviceDate <= b;
  const cohort = db.connect.filter((r) => inCohort(r, start, end));
  const logsOf = (r: ConnectRecord) => db.connectLogs.filter((l) => l.connectId === r.connectId);
  const firstContactMs = (r: ConnectRecord) => {
    const ls = logsOf(r);
    return ls.length ? Math.min(...ls.map((l) => new Date(l.savedAt).getTime())) : null;
  };

  const ratio = (list: ConnectRecord[], dueAt: (r: ConnectRecord) => number, doneBy: (r: ConnectRecord, by: number) => boolean): Ratio => {
    const due = list.filter((r) => dueAt(r) <= nowMs);
    return { due: due.length, done: due.filter((r) => doneBy(r, dueAt(r))).length };
  };
  const tickedBy = (k: StepKey) => (r: ConnectRecord, by: number) => {
    const c = r.checklist[k];
    return !!c && new Date(c.at).getTime() <= by;
  };

  const kpis = KPI.map((k) => ({ key: k.key, label: k.label, deadline: k.deadline, ratio: ratio(cohort, k.byMs, tickedBy(k.key)) }));
  const funnel = [{ label: "First visit", n: cohort.length }, ...KPI.map((k) => ({ label: k.label, n: cohort.filter((r) => r.checklist[k.key]).length }))];

  const contactHours = (list: ConnectRecord[]) =>
    list.map((r) => [r, firstContactMs(r)] as const).filter(([, f]) => f !== null).map(([r, f]) => (f! - new Date(r.clockStartAt).getTime()) / HOUR);
  const priorStart = key === "ytd" ? `${+today.slice(0, 4) - 1}-01-01` : `${addMonths(key, -1)}-01`;
  const priorEnd = key === "ytd" ? `${+today.slice(0, 4) - 1}${today.slice(4)}` : monthEnd(addMonths(key, -1));
  const priorCohort = db.connect.filter((r) => inCohort(r, priorStart, priorEnd));

  const firstLogWith = (r: ConnectRecord, test: (l: (typeof db.connectLogs)[number]) => boolean) => {
    const ls = logsOf(r).filter(test);
    return ls.length ? Math.min(...ls.map((l) => new Date(l.savedAt).getTime())) : null;
  };

  // Loss by stage: closed journeys by the phase they were in (cohort).
  const closed = cohort.filter((r) => r.status === "Closed");
  const lossByStage = [
    { stage: "Church office call", closed: closed.filter((r) => r.closedReason === "Not interested (Church office)").length },
    ...([1, 2, 3] as Phase[]).map((p) => ({ stage: `Phase ${p}`, closed: closed.filter((r) => r.closedReason !== "Not interested (Church office)" && r.phase === p).length })),
  ];

  // Cohort retention by month of first visit: the last 6 months.
  const retention = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, i - 5)).map((ym) => {
    const list = db.connect.filter((r) => r.entry.serviceDate.startsWith(ym));
    return {
      month: ym,
      guests: list.length,
      active: list.filter((r) => r.status === "Active").length,
      completed: list.filter((r) => r.status === "Completed").length,
      closed: list.filter((r) => r.status === "Closed").length,
    };
  });

  // FI-70 (live): Integration % by service month = Interested ÷ all guests in Connect.
  const integrationByMonth = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11)).map((ym) => {
    const list = db.connect.filter((r) => r.entry.serviceDate.startsWith(ym));
    const ni = (r: ConnectRecord) => r.state.itMembership === "Not Interested" || r.closedReason === "Not interested (Church office)";
    return {
      month: ym,
      total: list.length,
      interested: list.filter((r) => r.state.itMembership === "Interested").length,
      notInterested: list.filter(ni).length,
      undecided: list.filter((r) => r.state.itMembership === "Undecided" && !ni(r)).length,
      notYetAsked: list.filter((r) => !r.state.itMembership && !ni(r)).length,
    };
  });

  // Workload: open guests per team member, for the teams this person can open.
  const workload = t.flatMap((team: Team) =>
    membersOf(team).map((m) => {
      const col = team === "church_office" ? "coMemberId" : "itMemberId";
      const open = db.connect.filter((r) => r.status === "Active" && r[col] === m.id);
      const overdue = team === "integration" ? open.filter((r) => isOverdue48(r, now)).length : open.filter((r) => !db.connectLogs.some((l) => l.connectId === r.connectId && l.team === "church_office")).length;
      const recent = open.filter((r) => d2(r.entry.serviceDate) >= nowMs - 90 * DAY);
      return {
        team,
        memberId: m.id,
        name: m.fullName,
        open: open.length,
        overdue,
        // Church office: first contact within 48 hours. Integration: the 48 Hr Welcome tick within 48 hours (its KPI).
        contact48: ratio(recent, (r) => new Date(r.clockStartAt).getTime() + 48 * HOUR, (r, by) => {
          if (team === "integration") return tickedBy("P1Welcome48h")(r, by);
          const f = firstLogWith(r, (l) => l.team === team);
          return f !== null && f <= by;
        }),
        logged30: db.connectLogs.filter((l) => l.authorId === m.id && l.team === team && new Date(l.savedAt).getTime() >= nowMs - 30 * DAY).length,
      };
    }),
  );

  audit(u.id, "connect.metrics.view", key);
  return ok({
    period: { key, label, start, end },
    cohort: cohort.length,
    kpis,
    funnel,
    contact48: ratio(cohort, (r) => new Date(r.clockStartAt).getTime() + 48 * HOUR, (r, by) => {
      const f = firstContactMs(r);
      return f !== null && f <= by;
    }),
    medianHoursToFirstContact: median(contactHours(cohort)),
    priorMedianHoursToFirstContact: median(contactHours(priorCohort)),
    return30: ratio(cohort, (r) => d2(r.entry.serviceDate) + 30 * DAY, (r) => !!r.state.returnVisitDate && days(r.entry.serviceDate, r.state.returnVisitDate) <= 30),
    cell60: ratio(cohort, (r) => d2(r.entry.serviceDate) + 60 * DAY, (r, by) => {
      const f = firstLogWith(r, (l) => l.lifeGroup === "Joined Cell Group");
      return (f !== null && f <= by) || (r.state.itLifeGroup === "Joined Cell Group" && !logsOf(r).length);
    }),
    integration90: ratio(cohort, (r) => d2(r.entry.serviceDate) + 90 * DAY, (r, by) => {
      const f = firstLogWith(r, (l) => l.membership === "Interested");
      return (f !== null && f <= by) || (r.state.itMembership === "Interested" && !logsOf(r).length);
    }),
    completedThisYear: db.connect.filter((r) => r.status === "Completed" && r.entry.serviceDate >= `${today.slice(0, 4)}-01-01`).length,
    lossByStage,
    retention,
    integrationByMonth,
    workload,
  });
}

