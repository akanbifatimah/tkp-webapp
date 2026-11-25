import type {
  AdminSettings,
  AdminUser,
  AuditCategory,
  AuditEntry,
  AuditQuery,
  AuditResponse,
  DashboardResponse,
  SettingsInput,
  TempPasswordResponse,
  UserInput,
  UserQuery,
  UserStatus,
  UsersResponse,
} from "@/features/admin/types";
import { isOverdue48 } from "@/features/connect/rules";
import { checkPassword } from "@/lib/password-policy";
import { CHURCH_TZ, churchDate } from "@/lib/time";
import { ROLES, SENSITIVE_ROLES, can, type ConnectTeam, type Permission, type Role } from "@/lib/permissions";
import type { Result } from "./connect-api";
import { audit, db, type AuditRow } from "./db";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock Admin "server" (docs/API.md §7): dashboard, users and roles, audit log,
 * settings. PRD SA-1, SA-3, CA-3, F-5. Every change is audited with old and new values.
 */

const ok = <T,>(body: T, status = 200): Result<T> => ({ ok: true, status, body });
const no = (status: number, code: string, message: string, fields?: Record<string, string[]>): Result<never> => ({
  ok: false,
  status,
  code,
  message,
  ...(fields ? { fields } : {}),
});
const allowed = (u: StaffRecord, p: Permission) => u.roles.some((r) => can(r, p));
const FORBIDDEN = "You don't have access to this.";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ================================================================= users */

export const statusOf = (s: StaffRecord): UserStatus => (!s.isActive ? "deactivated" : s.mustChangePassword ? "temporary" : "active");

export const toAdminUser = (s: StaffRecord): AdminUser => ({
  id: s.id,
  fullName: s.fullName,
  email: s.email,
  phone: s.phone || null,
  roles: [...s.roles],
  connectTeam: s.connectTeam,
  status: statusOf(s),
  createdAt: s.createdAt,
  lastSignInAt: s.lastSignInAt,
  rowVer: s.rowVer,
});

const byName = (a: StaffRecord, b: StaffRecord) => a.fullName.localeCompare(b.fullName);

export function listUsers(u: StaffRecord, q: UserQuery): Result<UsersResponse> {
  if (!allowed(u, "admin.users")) return no(403, "FORBIDDEN", FORBIDDEN);
  const term = (q.q ?? "").trim().toLowerCase();
  const status = q.status || "all";
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
  const counts: Record<UserStatus, number> = { active: 0, temporary: 0, deactivated: 0 };
  for (const s of db.staff) counts[statusOf(s)]++;
  const items = db.staff
    .filter((s) => !term || s.fullName.toLowerCase().includes(term) || s.email.includes(term))
    .filter((s) => !q.role || s.roles.includes(q.role))
    .filter((s) => status === "all" || statusOf(s) === status)
    .sort(byName);
  return ok({
    items: items.slice((page - 1) * pageSize, page * pageSize).map(toAdminUser),
    page,
    pageSize,
    total: items.length,
    counts,
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEAMS: (ConnectTeam | null)[] = ["church_office", "integration", "both", null];

function validate(input: Partial<UserInput>, selfId: string | null): Result<UserInput> {
  const fields: Record<string, string[]> = {};
  const fullName = (input.fullName ?? "").trim().replace(/\s+/g, " ");
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").trim() || null;
  const roles = [...new Set(input.roles ?? [])].filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  const connectTeam = input.connectTeam ?? null;
  if (fullName.length < 2) fields.fullName = ["Enter their full name"];
  if (fullName.length > 120) fields.fullName = ["That name is too long"];
  if (!EMAIL_RE.test(email)) fields.email = ["Enter a valid email address"];
  else if (db.staff.some((s) => s.email === email && s.id !== selfId)) fields.email = ["Someone already uses this email address"];
  if (!roles.length) fields.roles = ["Choose at least one role"];
  if (roles.includes("tkp_member") && roles.length > 1) fields.roles = ["TKP Member cannot be combined with staff roles"];
  if (!TEAMS.includes(connectTeam)) fields.connectTeam = ["Choose a follow-up team"];
  if (Object.keys(fields).length) {
    const conflict = fields.email?.[0] === "Someone already uses this email address" && Object.keys(fields).length === 1;
    return no(conflict ? 409 : 422, conflict ? "EMAIL_TAKEN" : "VALIDATION_FAILED", Object.values(fields)[0]![0]!, fields);
  }
  return ok({ fullName, email, phone, roles, connectTeam });
}

/** A temporary password that passes the password rules (API-A5); shown once. */
export function temporaryPassword(rand: () => number = Math.random) {
  const words = ["Cedar", "Harbor", "Meadow", "Lantern", "Willow", "Summit", "River", "Garden"];
  const syms = "!#$%?";
  for (;;) {
    const pw = `${words[Math.floor(rand() * words.length)]}-${Math.floor(1000 + rand() * 9000)}${syms[Math.floor(rand() * syms.length)]}k`;
    if (checkPassword(pw).ok) return pw;
  }
}

const activeTechAdmins = () => db.staff.filter((s) => s.isActive && s.roles.includes("tech_admin"));

export function createUser(u: StaffRecord, input: Partial<UserInput>): Result<TempPasswordResponse> {
  if (!allowed(u, "admin.users")) return no(403, "FORBIDDEN", FORBIDDEN);
  const v = validate(input, null);
  if (!v.ok) return v;
  const id = `u${String(Math.max(...db.staff.map((s) => Number(s.id.slice(1)))) + 1).padStart(2, "0")}`;
  const pw = temporaryPassword();
  const rec: StaffRecord = {
    id,
    ...v.body,
    phone: v.body.phone ?? "",
    isActive: true,
    mustChangePassword: true,
    password: pw,
    sessionsRevokedAt: 0,
    createdAt: new Date().toISOString(),
    lastSignInAt: null,
    rowVer: 1,
  };
  db.staff.push(rec);
  audit(u.id, "user.create", id, { after: { fullName: rec.fullName, email: rec.email, roles: rec.roles, connectTeam: rec.connectTeam } });
  return ok({ user: toAdminUser(rec), temporaryPassword: pw }, 201);
}

const pickChanged = (before: Record<string, unknown>, after: Record<string, unknown>) => {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
};

const find = (id: string) => db.staff.find((s) => s.id === id);

export function updateUser(u: StaffRecord, id: string, input: Partial<UserInput> & { rowVer?: number }): Result<{ user: AdminUser }> {
  if (!allowed(u, "admin.users")) return no(403, "FORBIDDEN", FORBIDDEN);
  const rec = find(id);
  if (!rec) return no(404, "NOT_FOUND", "That person no longer exists.");
  if (input.rowVer !== rec.rowVer) return no(409, "CONFLICT", `Someone else changed ${rec.fullName} while you were editing. Reopen to see their changes.`);
  const v = validate(input, id);
  if (!v.ok) return v;
  // Sensitive-grant guard (PRD SA-1): you cannot take away your own full control,
  // and the church must always keep one active Tech Admin.
  const losingAdmin = rec.roles.includes("tech_admin") && !v.body.roles.includes("tech_admin");
  if (losingAdmin && rec.id === u.id) return no(409, "SELF_DEMOTE", "You cannot remove your own Tech Admin role. Ask another Tech Admin.");
  if (losingAdmin && rec.isActive && activeTechAdmins().length <= 1)
    return no(409, "LAST_TECH_ADMIN", "TKP Hub must keep at least one active Tech Admin.");

  const before = { fullName: rec.fullName, email: rec.email, phone: rec.phone || null, roles: [...rec.roles], connectTeam: rec.connectTeam };
  const after = { ...v.body };
  const diff = pickChanged(before, after);
  if (!Object.keys(diff.after).length) return ok({ user: toAdminUser(rec) });
  Object.assign(rec, { ...v.body, phone: v.body.phone ?? "" });
  rec.rowVer++;
  // A change of roles takes effect at the next request (API-A3 re-reads the person); no sign-out needed.
  audit(u.id, "user.update", id, diff);
  return ok({ user: toAdminUser(rec) });
}

export function setActive(u: StaffRecord, id: string, active: boolean): Result<{ user: AdminUser }> {
  if (!allowed(u, "admin.users")) return no(403, "FORBIDDEN", FORBIDDEN);
  const rec = find(id);
  if (!rec) return no(404, "NOT_FOUND", "That person no longer exists.");
  if (rec.isActive === active) return ok({ user: toAdminUser(rec) });
  if (!active) {
    if (rec.id === u.id) return no(409, "SELF_DEACTIVATE", "You cannot deactivate your own account.");
    if (rec.roles.includes("tech_admin") && activeTechAdmins().length <= 1)
      return no(409, "LAST_TECH_ADMIN", "TKP Hub must keep at least one active Tech Admin.");
    // API-A3: a deactivated person's sessions stop at their next request.
    rec.sessionsRevokedAt = Date.now() + 1;
  }
  rec.isActive = active;
  rec.rowVer++;
  audit(u.id, active ? "user.reactivate" : "user.deactivate", id, { before: { isActive: !active }, after: { isActive: active } });
  return ok({ user: toAdminUser(rec) });
}

/** UI-S1: no self-service reset. The Tech Admin issues a one-time password and every session ends. */
export function resetPassword(u: StaffRecord, id: string): Result<TempPasswordResponse> {
  if (!allowed(u, "admin.users")) return no(403, "FORBIDDEN", FORBIDDEN);
  const rec = find(id);
  if (!rec) return no(404, "NOT_FOUND", "That person no longer exists.");
  if (rec.id === u.id) return no(409, "SELF_RESET", "Use Change password for your own account.");
  if (!rec.isActive) return no(409, "DEACTIVATED", "Reactivate this person before resetting their password.");
  const pw = temporaryPassword();
  rec.password = pw;
  rec.mustChangePassword = true;
  rec.sessionsRevokedAt = Date.now() + 1;
  rec.rowVer++;
  audit(u.id, "user.password.reset", id);
  return ok({ user: toAdminUser(rec), temporaryPassword: pw });
}

/** PRD A-5 "Sign out everywhere", done for someone (a lost phone, a shared computer). */
export function revokeSessions(u: StaffRecord, id: string): Result<{ user: AdminUser }> {
  if (!allowed(u, "admin.users")) return no(403, "FORBIDDEN", FORBIDDEN);
  const rec = find(id);
  if (!rec) return no(404, "NOT_FOUND", "That person no longer exists.");
  rec.sessionsRevokedAt = Date.now() + 1;
  audit(u.id, "user.sessions.revoke", id);
  return ok({ user: toAdminUser(rec) });
}

/** Whether a new role list needs the sensitive-grant confirmation (front end asks first). */
export const grantsSensitive = (before: readonly Role[], after: readonly Role[]) =>
  after.some((r) => SENSITIVE_ROLES.includes(r) && !before.includes(r));

/* ================================================================= audit */

/** Which actions fall under each filter on the Audit log. */
export const AUDIT_CATEGORY: Record<AuditCategory, (action: string) => boolean> = {
  "sign-in": (a) => a.startsWith("sign_") || a.startsWith("password.") || a.startsWith("mfa."),
  welcome: (a) => a.startsWith("welcome.") && !a.endsWith(".export"),
  connect: (a) => a.startsWith("connect."),
  users: (a) => a.startsWith("user."),
  settings: (a) => a.startsWith("settings."),
  exports: (a) => a.endsWith(".export") || a === "welcome.qr.print" || a === "reports.share" || a === "reports.schedule.run",
};

const nameOf = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? null) : null);

function targetLabel(r: AuditRow): string | null {
  if (!r.target) return null;
  if (r.action.startsWith("user.")) return nameOf(r.target) ?? r.target;
  if (r.action.startsWith("settings.")) return "Settings";
  if (r.action === "welcome.search") {
    try {
      const q = JSON.parse(r.target) as Record<string, string>;
      return Object.entries(q)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ") || "All guests";
    } catch {
      return r.target;
    }
  }
  if (r.action === "welcome.view" || r.action.startsWith("welcome.entry")) return `Guest #${r.target}`;
  if (r.action.startsWith("welcome.cellmap.")) return `ZIP ${r.target}`;
  if (r.action === "welcome.service.reorder") return "Guest form services";
  if (r.action.startsWith("welcome.service.")) {
    const name = db.services.find((s) => s.id === r.target)?.name ?? (r.meta?.before?.name as string | undefined) ?? (r.meta?.after?.name as string | undefined);
    return name ?? r.target;
  }
  if (r.action.startsWith("welcome.qr.")) {
    const name = db.qrCodes.find((c) => c.id === r.target)?.name ?? (r.meta?.before?.name as string | undefined) ?? (r.meta?.after?.name as string | undefined);
    return name ?? r.target;
  }
  if (r.action.startsWith("reports.")) return (r.meta?.after?.name as string | undefined) ?? (r.meta?.before?.name as string | undefined) ?? r.target;
  if (r.action.startsWith("welcome.import.")) return (r.meta?.after?.name as string | undefined) ?? (r.meta?.before?.name as string | undefined) ?? r.target;
  if (r.action.startsWith("welcome.duplicates.")) return (r.meta?.after?.name as string | undefined) ?? (r.meta?.before?.name as string | undefined) ?? r.target;
  if (r.action.startsWith("connect.") && /^\d+$/.test(r.target)) return `Connect #${r.target}`;
  return r.target;
}

export const toAuditEntry = (r: AuditRow): AuditEntry => ({
  id: r.id,
  at: r.at,
  actorId: r.actorId,
  actorName: nameOf(r.actorId),
  action: r.action,
  target: r.target,
  targetLabel: targetLabel(r),
  meta: r.meta ?? null,
});

export function listAudit(u: StaffRecord, q: AuditQuery): Result<AuditResponse> {
  if (!allowed(u, "admin.audit")) return no(403, "FORBIDDEN", FORBIDDEN);
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(q.pageSize) || 50));
  const term = (q.q ?? "").trim().toLowerCase();
  const cat = q.category ? AUDIT_CATEGORY[q.category] : null;
  const rows = db.audit.filter((r) => {
    if (q.actorId && r.actorId !== q.actorId) return false;
    if (cat && !cat(r.action)) return false;
    const day = churchDate(r.at);
    if (q.from && day < q.from) return false;
    if (q.to && day > q.to) return false;
    if (term) {
      const e = toAuditEntry(r);
      const hay = `${e.action} ${e.target ?? ""} ${e.targetLabel ?? ""} ${e.actorName ?? ""}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
  const actorIds = [...new Set(db.audit.map((r) => r.actorId).filter((x): x is string => !!x))];
  return ok({
    items: rows.slice((page - 1) * pageSize, page * pageSize).map(toAuditEntry),
    page,
    pageSize,
    total: rows.length,
    actors: actorIds
      .map((id) => ({ id, fullName: nameOf(id) ?? id }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    retentionDays: db.settings.auditRetentionDays,
  });
}

/* ================================================================= settings */

export function getSettings(u: StaffRecord): Result<{ settings: AdminSettings }> {
  if (!allowed(u, "admin.settings")) return no(403, "FORBIDDEN", FORBIDDEN);
  const s = db.settings;
  return ok({
    settings: {
      resetContact: s.resetContact,
      resetRelay: s.resetRelay,
      idleMinutes: s.idleMinutes,
      forcePasswordChange: db.enforceTempPassword,
      auditRetentionDays: s.auditRetentionDays,
      mfaForStaff: db.mfaForStaff,
      timeZone: CHURCH_TZ,
      rowVer: s.rowVer,
      updatedAt: s.updatedAt,
      updatedBy: nameOf(s.updatedById),
    },
  });
}

export const IDLE_CHOICES = [15, 30, 60] as const;
export const RETENTION_CHOICES = [365, 730, 1825, 2555] as const;

export function updateSettings(u: StaffRecord, input: Partial<SettingsInput>): Result<{ settings: AdminSettings }> {
  if (!allowed(u, "admin.settings")) return no(403, "FORBIDDEN", FORBIDDEN);
  const s = db.settings;
  if (input.rowVer !== s.rowVer) return no(409, "CONFLICT", "Someone else changed the settings while you were editing. Reload to see their changes.");
  const fields: Record<string, string[]> = {};
  const resetContact = (input.resetContact ?? "").trim();
  const resetRelay = (input.resetRelay ?? "").trim() || null;
  if (resetContact.length < 2) fields.resetContact = ["Enter the name people should ask"];
  if (resetContact.length > 80) fields.resetContact = ["That name is too long"];
  if (resetRelay && resetRelay.length > 80) fields.resetRelay = ["That name is too long"];
  if (!IDLE_CHOICES.includes(input.idleMinutes as (typeof IDLE_CHOICES)[number])) fields.idleMinutes = ["Choose 15, 30 or 60 minutes"];
  if (!RETENTION_CHOICES.includes(input.auditRetentionDays as (typeof RETENTION_CHOICES)[number])) fields.auditRetentionDays = ["Choose a retention period"];
  if (typeof input.forcePasswordChange !== "boolean") fields.forcePasswordChange = ["Choose on or off"];
  if (Object.keys(fields).length) return no(422, "VALIDATION_FAILED", Object.values(fields)[0]![0]!, fields);

  const before = {
    resetContact: s.resetContact,
    resetRelay: s.resetRelay,
    idleMinutes: s.idleMinutes,
    forcePasswordChange: db.enforceTempPassword,
    auditRetentionDays: s.auditRetentionDays,
  };
  const after = {
    resetContact,
    resetRelay,
    idleMinutes: input.idleMinutes!,
    forcePasswordChange: input.forcePasswordChange!,
    auditRetentionDays: input.auditRetentionDays!,
  };
  const diff = pickChanged(before, after);
  if (Object.keys(diff.after).length) {
    Object.assign(s, { resetContact, resetRelay, idleMinutes: after.idleMinutes, auditRetentionDays: after.auditRetentionDays });
    db.enforceTempPassword = after.forcePasswordChange;
    s.rowVer++;
    s.updatedAt = new Date().toISOString();
    s.updatedById = u.id;
    audit(u.id, "settings.update", "settings", diff);
  }
  return getSettings(u);
}

/* ================================================================= dashboard */

const monthKey = (iso: string) => iso.slice(0, 7);
function lastMonths(today: string, n: number) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * The Figma dashboard (node 125:4815) as the Church Admin / Tech Admin home,
 * filled with TKP Connect data. Definitions (to confirm with TKP):
 * - Contacted within 48h: of the guests whose 48 hours ended in the last 30 days,
 *   those with a saved log from either team or the 48 Hr Welcome tick before the 48 hours ran out.
 * - 48h overdue: TKP Connect BR-13, unchanged.
 */
export function dashboard(u: StaffRecord, now = new Date()): Result<DashboardResponse> {
  if (!allowed(u, "dashboard.view")) return no(403, "FORBIDDEN", FORBIDDEN);
  const today = churchDate(now);
  const t = now.getTime();
  const entries = db.entries;
  const dates = entries.map((e) => e.serviceDate).sort();

  const thisMonth = monthKey(today);
  const sameLastYear = `${Number(thisMonth.slice(0, 4)) - 1}${thisMonth.slice(4)}`;
  const firstVisits = entries.filter((e) => e.visitNumber === 1);

  const firstContact = new Map<number, number>();
  for (const l of db.connectLogs) {
    const at = new Date(l.savedAt).getTime();
    const prev = firstContact.get(l.connectId);
    if (prev === undefined || at < prev) firstContact.set(l.connectId, at);
  }
  const cohort = db.connect.filter((r) => {
    const due = new Date(r.clockStartAt).getTime() + 48 * HOUR;
    return due <= t && due > t - 30 * DAY;
  });
  const done = cohort.filter((r) => {
    const due = new Date(r.clockStartAt).getTime() + 48 * HOUR;
    const tick = r.checklist.P1Welcome48h ? new Date(r.checklist.P1Welcome48h.at).getTime() : Infinity;
    return Math.min(firstContact.get(r.connectId) ?? Infinity, tick) <= due;
  }).length;

  const overdue = db.connect
    .filter((r) => isOverdue48(r, now))
    .sort((a, b) => a.clockStartAt.localeCompare(b.clockStartAt));

  const months = lastMonths(today, 12);
  const trend = months.map((m) => {
    const inMonth = entries.filter((e) => monthKey(e.serviceDate) === m);
    return { month: m, firstVisits: inMonth.filter((e) => e.visitNumber === 1).length, returnVisits: inMonth.filter((e) => e.visitNumber > 1).length };
  });

  const year = today.slice(0, 4);
  const cellOf = (c: string) => (["Red", "Yellow", "Blue", "Green"].includes(c) ? c : "N/A") as DashboardResponse["cells"][number]["cell"];
  const cellRows = (["Red", "Yellow", "Blue", "Green", "N/A"] as const).map((cell) => ({
    cell,
    guests: entries.filter((e) => e.serviceDate.startsWith(year) && cellOf(e.cellGroup) === cell).length,
    active: db.connect.filter((r) => r.status === "Active" && cellOf(r.entry.cellGroup) === cell).length,
  }));

  const weekAgo = t - 7 * DAY;
  const accounts = allowed(u, "admin.users")
    ? {
        active: db.staff.filter((s) => statusOf(s) === "active").length,
        temporary: db.staff.filter((s) => statusOf(s) === "temporary").length,
        deactivated: db.staff.filter((s) => statusOf(s) === "deactivated").length,
        signedInThisWeek: db.staff.filter((s) => s.isActive && s.lastSignInAt && new Date(s.lastSignInAt).getTime() >= weekAgo).length,
      }
    : null;

  return ok({
    asOf: now.toISOString(),
    latestServiceDate: dates[dates.length - 1] ?? null,
    tiles: {
      guestsOnRecord: db.connect.length,
      firstSeen: dates[0] ?? null,
      newThisMonth: firstVisits.filter((e) => monthKey(e.serviceDate) === thisMonth).length,
      newSameMonthLastYear: firstVisits.filter((e) => monthKey(e.serviceDate) === sameLastYear).length,
      contacted48: { done, of: cohort.length },
      overdue48: overdue.length,
    },
    trend,
    cells: cellRows,
    attention: overdue.slice(0, 6).map((r) => ({
      connectId: r.connectId,
      name: `${r.entry.firstName ?? ""} ${r.entry.lastName ?? ""}`.trim(),
      serviceDate: r.entry.serviceDate,
      serviceType: r.entry.serviceType,
      hoursSince: Math.floor((t - new Date(r.clockStartAt).getTime()) / HOUR),
      coName: nameOf(r.coMemberId),
      itName: nameOf(r.itMemberId),
    })),
    attentionTotal: overdue.length,
    accounts,
    activity: allowed(u, "admin.audit") ? db.audit.slice(0, 6).map(toAuditEntry) : null,
  });
}
