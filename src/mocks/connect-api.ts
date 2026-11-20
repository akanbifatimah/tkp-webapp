import {
  CO_CLOSING_ACTION,
  IT_MULTI,
  MULTI_KEYS,
  NOT_APPLICABLE,
  STEPS,
  outcomesFor,
  stepLabel,
  teamOwnsStep,
  type Method,
  type StepKey,
  type Team,
} from "@/features/connect/model";
import { doneCounts, isOverdue48, phaseFromChecklist, weekNo } from "@/features/connect/rules";
import type {
  AssignResponse,
  ConnectGuest,
  ConnectMember,
  GuestResponse,
  LogRow,
  LogsResponse,
  QueueResponse,
  QueueRow,
  SaveLogBody,
  SaveLogResponse,
} from "@/features/connect/types";
import { CONNECT_ACCESS_DENIED, CONNECT_POLICY, NO_FOLLOW_UP_TEAM, TEAM_OF_ROLE, can, type Role } from "@/lib/permissions";
import { audit, db } from "./db";
import { ALL_SERVICE_DATES, DEPARTMENTS, type ConnectRecord } from "./seed/guests";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock Connect "server": TKP Connect API-C1…C6 and usp_ConnectSaveLog,
 * as plain functions so they can be tested without a browser.
 * Every refusal uses the live app's exact message (doc 04 §6).
 */

export type Result<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; code: string; message: string; fields?: Record<string, string[]> };
const ok = <T,>(body: T, status = 200): Result<T> => ({ ok: true, status, body });
const no = (status: number, code: string, message: string): Result<never> => ({ ok: false, status, code, message });

const TEAMS: Team[] = ["church_office", "integration"];
const TEAM_COL = { church_office: "coMemberId", integration: "itMemberId" } as const;

/* ----------------------------------------------------------------- who may do what (doc 02) */

const policies = (u: StaffRecord) => u.roles.map((r) => CONNECT_POLICY[r]).filter((p) => !!p);
const hasConnect = (u: StaffRecord) => u.roles.some((r) => can(r, "connect.queue.view"));

/** AC-04: whole-team roles switch teams; team roles open their own team (and the other one when they are on Both). */
export function teamsFor(u: StaffRecord): Team[] | "no-team" {
  if (policies(u).some((p) => p.switchesTeams)) return [...TEAMS];
  const roleTeams = u.roles.map((r: Role) => TEAM_OF_ROLE[r]).filter((t): t is Team => !!t);
  if (!roleTeams.length || !u.connectTeam) return "no-team";
  return u.connectTeam === "both" ? [...TEAMS] : [...new Set(roleTeams)];
}

/** AC-01: whole roles see both teams; a team admin sees all of their team. */
export function seesWholeTeam(u: StaffRecord, team: Team) {
  if (policies(u).some((p) => p.switchesTeams)) return true;
  return u.roles.some((r) => (r === "church_office_admin" && team === "church_office") || (r === "integration_admin" && team === "integration"));
}

/** AC-02. */
export const canAssign = (u: StaffRecord, team: Team) => policies(u).some((p) => p.assignTeams.includes(team));

/** AC-03: active people on that follow-up team or on Both. */
export function membersOf(team: Team): ConnectMember[] {
  return db.staff
    .filter((s) => s.isActive && (s.connectTeam === "both" || s.connectTeam === team))
    .map((s) => ({
      id: s.id,
      fullName: s.fullName,
      isTeamAdmin: s.roles.includes(team === "church_office" ? "church_office_admin" : "integration_admin"),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function gate(u: StaffRecord, wanted: string | null): Result<{ teams: Team[]; team: Team }> {
  if (!hasConnect(u)) return no(403, "FORBIDDEN", CONNECT_ACCESS_DENIED);
  const teams = teamsFor(u);
  if (teams === "no-team") return no(403, "NO_FOLLOW_UP_TEAM", NO_FOLLOW_UP_TEAM);
  const preferred =
    u.connectTeam === "church_office" || u.connectTeam === "integration" ? u.connectTeam : (teams[0] as Team);
  const team = wanted && teams.includes(wanted as Team) ? (wanted as Team) : teams.includes(preferred) ? preferred : teams[0]!;
  if (wanted && !teams.includes(wanted as Team)) return no(403, "FORBIDDEN", "You cannot open this team’s Work queue.");
  return ok({ teams, team });
}

/* ----------------------------------------------------------------- shapes */

const nameOf = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? null) : null);
const coContacted = (r: ConnectRecord) => db.connectLogs.some((l) => l.connectId === r.connectId && l.team === "church_office");

function toRow(r: ConnectRecord, now: Date): QueueRow {
  return {
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
    coContacted: coContacted(r),
    coAttempts: r.coAttempts,
    coLastCallOutcome: r.coLastCallOutcome,
    coNextAction: r.state.coNextAction,
    itContacted: r.itContacted,
    done: doneCounts(r.checklist),
    overdue48: isOverdue48(r, now),
    returned2ndVisit: r.state.returned2ndVisit,
  };
}

/** API order: service date (newest first), last name, first name. */
const queueOrder = (a: ConnectRecord, b: ConnectRecord) =>
  b.entry.serviceDate.localeCompare(a.entry.serviceDate) ||
  (a.entry.lastName ?? "").localeCompare(b.entry.lastName ?? "") ||
  (a.entry.firstName ?? "").localeCompare(b.entry.firstName ?? "");

/* ----------------------------------------------------------------- API-C1 queue */

export function getQueue(u: StaffRecord, q: { team: string | null; date: string | null }, now = new Date()): Result<QueueResponse> {
  const g = gate(u, q.team);
  if (!g.ok) return g;
  const { team, teams } = g.body;
  const active = db.connect.filter((r) => r.status === "Active");
  const dates = [...new Set(active.map((r) => r.entry.serviceDate))].sort().reverse().slice(0, 80);
  // Default = the latest service date that has Active journeys.
  const date = q.date === "all" ? "all" : q.date && dates.includes(q.date) ? q.date : (dates[0] ?? "all");
  const onDate = active.filter((r) => date === "all" || r.entry.serviceDate === date);
  const whole = seesWholeTeam(u, team);
  const col = TEAM_COL[team];
  const visible = onDate.filter((r) => whole || r[col] === u.id).sort(queueOrder);
  const CAP = 1500;
  return ok({
    me: { id: u.id, fullName: u.fullName },
    team,
    teams,
    date,
    dates,
    seesWholeTeam: whole,
    canAssign: canAssign(u, team),
    members: membersOf(team),
    totalGuests: onDate.length,
    rows: visible.slice(0, CAP).map((r) => toRow(r, now)),
    truncated: visible.length > CAP,
  });
}

/* ----------------------------------------------------------------- API-C2 assign */

export function assign(u: StaffRecord, body: { connectId: number; team: Team; memberId: string | null }): Result<AssignResponse> {
  const g = gate(u, body.team);
  if (!g.ok) return g;
  if (!canAssign(u, body.team)) return no(403, "FORBIDDEN", "Only the team admin can assign guests.");
  const r = db.connect.find((x) => x.connectId === body.connectId);
  if (!r) return no(404, "NOT_FOUND", "Guest not found in Connect.");
  if (body.memberId && !membersOf(body.team).some((m) => m.id === body.memberId)) {
    return no(400, "BAD_REQUEST", "That person is not on this team.");
  }
  r[TEAM_COL[body.team]] = body.memberId;
  audit(u.id, "connect.assign", `${r.connectId}:${body.team}:${body.memberId ?? "none"}`);
  return ok({ connectId: r.connectId, coMemberId: r.coMemberId, coName: nameOf(r.coMemberId), itMemberId: r.itMemberId, itName: nameOf(r.itMemberId) });
}

/* ----------------------------------------------------------------- API-C3 guest */

export function getGuest(u: StaffRecord, connectId: number, wantedTeam: string | null, now = new Date()): Result<GuestResponse> {
  const g = gate(u, wantedTeam);
  if (!g.ok) return g;
  const { team, teams } = g.body;
  const r = db.connect.find((x) => x.connectId === connectId);
  if (!r) return no(404, "NOT_FOUND", "Guest not found in Connect.");
  const col = TEAM_COL[team];
  const latestCo = db.connectLogs.find((l) => l.connectId === r.connectId && l.team === "church_office") ?? null;
  const myList = db.connect
    .filter((x) => x.status === "Active" && x.entry.serviceDate === r.entry.serviceDate && x[col] === u.id)
    .sort(queueOrder)
    .map((x) => x.connectId);
  const { done: _done, ...row } = toRow(r, now);
  const guest: ConnectGuest = {
    ...row,
    closedReason: r.closedReason,
    state: structuredClone(r.state),
    checklist: structuredClone(r.checklist),
    coNote: latestCo
      ? { savedAt: latestCo.savedAt, by: latestCo.author, method: latestCo.method, outcome: latestCo.callOutcome, note: latestCo.note }
      : null,
    legacyNotes: r.legacyNotes,
    returnDates: ALL_SERVICE_DATES.filter((d) => d > r.entry.serviceDate && d <= now.toISOString().slice(0, 10)).reverse().slice(0, 26),
    rowVer: String(r.rowVer),
  };
  audit(u.id, "connect.guest.view", String(r.connectId));
  return ok({ me: { id: u.id, fullName: u.fullName }, team, teams, canSave: r[col] === u.id && r.status === "Active", guest, myList });
}

/* ----------------------------------------------------------------- API-C4 save log */

const savedRequests = new Map<string, SaveLogResponse>();

export function saveLog(u: StaffRecord, b: SaveLogBody, now = new Date()): Result<SaveLogResponse> {
  // (0) BR-18: a repeated request returns the first result.
  const dup = savedRequests.get(b.clientRequestId);
  if (dup) return ok({ ...dup, duplicate: true });

  const g = gate(u, b.team);
  if (!g.ok) return g;
  const co = b.team === "church_office";

  // Input checks (400)
  if (!b.method) return no(400, "VALIDATION_FAILED", "How did you reach out? is required");
  if (b.callOutcome && !outcomesFor(b.method as Method).includes(b.callOutcome)) {
    return no(400, "VALIDATION_FAILED", "That outcome does not match how you reached out.");
  }
  if ((b.note ?? "").length > 4000) return no(400, "VALIDATION_FAILED", "The note is too long (4,000 characters at most).");
  if (!co && b.membership !== "Not Interested") {
    for (const group of IT_MULTI) {
      const keys = group.options.map((o) => o.key);
      const na = keys.find((k) => NOT_APPLICABLE.includes(k))!;
      if (b.multi?.[na] && keys.some((k) => k !== na && b.multi?.[k])) {
        return no(400, "VALIDATION_FAILED", `${group.label}: Not Applicable cannot be combined with other options`);
      }
    }
    if (b.returned2ndVisit && !b.returnVisitDate) return no(400, "VALIDATION_FAILED", "Choose the return visit date");
  }

  // (1) The procedure's checks, in order.
  const r = db.connect.find((x) => x.connectId === b.connectId);
  if (!r) return no(404, "NOT_FOUND", "Guest not found in Connect.");
  if (r.status !== "Active") return no(409, "JOURNEY_CLOSED", "This guest's journey is closed. Reopen it before logging.");
  if (String(r.rowVer) !== b.rowVer) return no(409, "CONFLICT", "Someone else saved this guest a moment ago. Reload and try again.");
  if (r[TEAM_COL[b.team]] !== u.id) {
    return no(403, "NOT_ASSIGNEE", `Only the ${co ? "Church office" : "Integration Team"} person assigned to this guest can save a log.`);
  }
  if ([...b.stepsTicked, ...b.stepsUnticked].some((k) => !teamOwnsStep(b.team, k))) {
    return no(400, "VALIDATION_FAILED", "A checklist item does not belong to this team.");
  }

  // (2)+(3) Update the journey.
  const at = now.toISOString();
  for (const k of b.stepsTicked) r.checklist[k] = r.checklist[k] ?? { at, byId: u.id, by: u.fullName }; // first tick keeps time and author
  for (const k of b.stepsUnticked) r.checklist[k] = null;
  const set = <K extends keyof typeof r.state>(k: K, v: (typeof r.state)[K] | null | undefined) => {
    if (v !== null && v !== undefined) r.state[k] = v; // BR-09: non-null inputs win
  };
  let department: string | null = null;
  const notInterested = !co && b.membership === "Not Interested";

  if (co) {
    r.coAttempts += 1;
    r.coLastCallOutcome = b.callOutcome ?? r.coLastCallOutcome;
    set("coWantsMembership", b.wantsMembership);
    if (r.state.coWantsMembership !== "No") {
      r.state.coNoReason = null;
      r.state.coNoOtherDetails = null;
    } else {
      set("coNoReason", b.noReason);
      if (r.state.coNoReason !== "Other") r.state.coNoOtherDetails = null;
      else set("coNoOtherDetails", b.noOtherDetails);
    }
    set("coNextAction", b.nextAction);
  } else {
    r.itContacted = true;
    set("itMembership", b.membership);
    if (!notInterested) {
      set("itWorkforce", b.workforce);
      set("itLifeGroup", b.lifeGroup);
      if (r.state.itWorkforce === "Interested") set("itDepartmentId", b.departmentId);
      else r.state.itDepartmentId = null;
      if (b.multi) for (const k of MULTI_KEYS) r.state.multi[k] = !!b.multi[k];
      if (b.returned2ndVisit !== undefined) {
        r.state.returned2ndVisit = !!b.returned2ndVisit;
        r.state.returnVisitDate = b.returned2ndVisit ? (b.returnVisitDate ?? null) : null;
      }
    }
    department = DEPARTMENTS.find((d) => d.id === r.state.itDepartmentId)?.name ?? null;
  }

  // (4) Phase and status (BR-11, BR-12).
  r.phase = phaseFromChecklist(r.checklist);
  if (co && b.nextAction === CO_CLOSING_ACTION) {
    r.status = "Closed";
    r.closedReason = "Not interested (Church office)";
  } else if (notInterested) {
    r.status = "Closed";
    r.closedReason = "Not interested (Integration)";
  } else if (r.checklist.P3Complete) {
    r.status = "Completed";
  }
  r.rowVer += 1;

  const multiLabels = (i: 0 | 1) =>
    notInterested || !b.multi ? [] : IT_MULTI[i].options.filter((o) => b.multi?.[o.key]).map((o) => o.label as string);
  const log: LogRow = {
    logId: Math.max(0, ...db.connectLogs.map((l) => l.logId)) + 1,
    connectId: r.connectId,
    team: b.team,
    authorId: u.id,
    author: u.fullName,
    savedAt: at,
    guest: `${r.entry.firstName} ${r.entry.lastName}`,
    serviceDate: r.entry.serviceDate,
    method: b.method,
    callOutcome: b.callOutcome,
    sopStep: co ? (b.sopStep ?? null) : null,
    wantsMembership: co ? (b.wantsMembership ?? null) : null,
    noReason: co && b.wantsMembership === "No" ? (b.noReason ?? null) : null,
    nextAction: co ? (b.nextAction ?? null) : null,
    phase: co ? null : (b.phase ?? null),
    membership: co ? null : (b.membership ?? null),
    workforce: co || notInterested ? null : (b.workforce ?? null),
    department: co || notInterested ? null : department,
    lifeGroup: co || notInterested ? null : (b.lifeGroup ?? null),
    spiritual: multiLabels(0),
    other: multiLabels(1),
    note: b.note,
    returned2ndVisit: co || notInterested ? null : (b.returned2ndVisit ?? null),
    returnVisitDate: co || notInterested ? null : (b.returnVisitDate ?? null),
    stepsTicked: b.stepsTicked,
    stepsUnticked: b.stepsUnticked,
  };
  db.connectLogs.unshift(log);
  audit(u.id, "connect.log.save", String(r.connectId));

  // (5)
  const res: SaveLogResponse = { logId: log.logId, duplicate: false, status: r.status, phase: r.phase, rowVer: String(r.rowVer) };
  savedRequests.set(b.clientRequestId, res);
  return ok(res);
}

/* ----------------------------------------------------------------- API-C5 logs */

export function getLogs(u: StaffRecord, q: { team: string | null; connectId: number | null }): Result<LogsResponse> {
  const g = gate(u, q.team);
  if (!g.ok) return g;
  const { team } = g.body;
  const all = seesWholeTeam(u, team);
  const logs = db.connectLogs.filter(
    (l) => l.team === team && (all || l.authorId === u.id) && (q.connectId === null || l.connectId === q.connectId),
  );
  return ok({ team, all, logs });
}

/** Labels for the checklist keys of a phase (used by tests). */
export const phaseKeys = (p: 1 | 2 | 3) => STEPS[p].map((s) => s.key as StepKey);
export { stepLabel };
