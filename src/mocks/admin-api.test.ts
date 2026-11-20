import { beforeEach, describe, expect, it } from "vitest";
import { checkPassword } from "@/lib/password-policy";
import {
  createUser,
  dashboard,
  getSettings,
  grantsSensitive,
  listAudit,
  listUsers,
  resetPassword,
  revokeSessions,
  setActive,
  temporaryPassword,
  updateSettings,
  updateUser,
} from "./admin-api";
import { db } from "./db";
import { authenticate, issueToken } from "./http";

/** M6 Admin (docs/API.md §7; PRD SA-1, SA-3, F-5). */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const TECH = "u01";

const fresh = () => ({ fullName: "Ada Test", email: `ada.${crypto.randomUUID().slice(0, 8)}@example.com`, phone: null, roles: ["church_office" as const], connectTeam: "church_office" as const });

describe("users: who may manage them", () => {
  it("only Tech Admin lists, creates and changes users", () => {
    for (const id of ["u02", "u03", "u04", "u05", "u14"]) {
      expect(listUsers(user(id), {}).ok).toBe(false);
      expect(createUser(user(id), fresh()).ok).toBe(false);
    }
    expect(listUsers(user(TECH), {}).ok).toBe(true);
  });

  it("filters by name, role and status, and pages", () => {
    const r = listUsers(user(TECH), { q: "volunteer", status: "all" });
    expect(r.ok && r.body.items.map((u) => u.fullName).sort()).toEqual(["Former Volunteer", "New Volunteer"]);
    const deact = listUsers(user(TECH), { status: "deactivated" });
    expect(deact.ok && deact.body.items.every((u) => u.status === "deactivated")).toBe(true);
    const tmp = listUsers(user(TECH), { status: "temporary" });
    expect(tmp.ok && tmp.body.items.some((u) => u.id === "u17")).toBe(true);
    const role = listUsers(user(TECH), { role: "registrar" });
    expect(role.ok && role.body.items.map((u) => u.id)).toEqual(["u14"]);
    const page = listUsers(user(TECH), { pageSize: 5, page: 2 });
    expect(page.ok && page.body.items.length).toBe(5);
    expect(page.ok && page.body.page).toBe(2);
  });

  it("never returns passwords", () => {
    const r = listUsers(user(TECH), {});
    expect(r.ok && JSON.stringify(r.body)).not.toContain("Welcome1!");
  });
});

describe("users: create", () => {
  it("issues a temporary password that passes the rules, once, and must be changed", () => {
    const r = createUser(user(TECH), fresh());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe(201);
    expect(checkPassword(r.body.temporaryPassword).ok).toBe(true);
    expect(r.body.user.status).toBe("temporary");
    expect(user(r.body.user.id).password).toBe(r.body.temporaryPassword);
    expect(db.audit[0]).toMatchObject({ action: "user.create", actorId: TECH, target: r.body.user.id });
    expect(JSON.stringify(db.audit[0])).not.toContain(r.body.temporaryPassword);
  });

  it("refuses a taken email with 409 and a field error", () => {
    const r = createUser(user(TECH), { ...fresh(), email: "Grace.Adeyemi@example.com" });
    expect(r).toMatchObject({ ok: false, status: 409, code: "EMAIL_TAKEN" });
    expect(!r.ok && r.fields?.email).toBeTruthy();
  });

  it("validates name, email and roles", () => {
    const r = createUser(user(TECH), { fullName: "A", email: "nope", roles: [], connectTeam: null, phone: null });
    expect(r).toMatchObject({ ok: false, status: 422, code: "VALIDATION_FAILED" });
    expect(!r.ok && Object.keys(r.fields ?? {}).sort()).toEqual(["email", "fullName", "roles"]);
  });

  it("TKP Member cannot be combined with staff roles", () => {
    const r = createUser(user(TECH), { ...fresh(), roles: ["tkp_member", "church_office"] });
    expect(!r.ok && r.fields?.roles).toBeTruthy();
  });

  it("asks before granting full control (sensitive-grant guard)", () => {
    expect(grantsSensitive(["church_admin"], ["church_admin", "tech_admin"])).toBe(true);
    expect(grantsSensitive(["tech_admin"], ["tech_admin", "registrar"])).toBe(false);
  });
});

describe("users: edit", () => {
  it("saves changes with old and new values in the audit log", () => {
    const r = createUser(user(TECH), fresh());
    if (!r.ok) throw new Error();
    const u = r.body.user;
    const e = updateUser(user(TECH), u.id, { ...u, roles: ["integration_team"], connectTeam: "integration", rowVer: u.rowVer });
    expect(e.ok && e.body.user.roles).toEqual(["integration_team"]);
    expect(db.audit[0]).toMatchObject({
      action: "user.update",
      meta: { before: { roles: ["church_office"], connectTeam: "church_office" }, after: { roles: ["integration_team"], connectTeam: "integration" } },
    });
  });

  it("refuses a stale rowVer with 409", () => {
    const u = user("u12");
    const e = updateUser(user(TECH), u.id, { fullName: u.fullName, email: u.email, phone: null, roles: u.roles, connectTeam: null, rowVer: u.rowVer - 1 });
    expect(e).toMatchObject({ ok: false, status: 409, code: "CONFLICT" });
  });

  it("a Tech Admin cannot remove their own Tech Admin role", () => {
    const me = user(TECH);
    const e = updateUser(me, TECH, { fullName: me.fullName, email: me.email, phone: null, roles: ["tech_team"], connectTeam: me.connectTeam, rowVer: me.rowVer });
    expect(e).toMatchObject({ ok: false, code: "SELF_DEMOTE" });
  });
});

describe("users: deactivate, reset, sign out everywhere", () => {
  let id: string;
  beforeEach(() => {
    const r = createUser(user(TECH), fresh());
    if (!r.ok) throw new Error();
    id = r.body.user.id;
  });

  it("deactivating ends their sessions at the next request (API-A3); reactivating lets them back", () => {
    const { token } = issueToken(id, Date.now() - 1000);
    const req = () => new Request("http://x/me", { headers: { Authorization: `Bearer ${token}` } });
    user(id).mustChangePassword = false;
    expect(authenticate(req())).not.toBeInstanceOf(Response);
    expect(setActive(user(TECH), id, false).ok).toBe(true);
    expect(authenticate(req())).toBeInstanceOf(Response);
    expect(db.audit[0]).toMatchObject({ action: "user.deactivate", target: id });
    const back = setActive(user(TECH), id, true);
    expect(back.ok && back.body.user.status).toBe("active");
  });

  it("you cannot deactivate yourself, nor the last active Tech Admin", () => {
    expect(setActive(user(TECH), TECH, false)).toMatchObject({ ok: false, code: "SELF_DEACTIVATE" });
    // Promote someone, then let them try to remove the only other one after u01 is gone.
    const other = user(id);
    other.roles = ["tech_admin"];
    expect(setActive(other, TECH, false).ok).toBe(true);
    const third = user("u02");
    third.roles = ["tech_admin"];
    expect(setActive(third, id, false)).toMatchObject({ ok: true });
    expect(setActive(user(TECH), "u02", false)).toMatchObject({ ok: false, code: "LAST_TECH_ADMIN" });
    // Restore
    setActive(third, TECH, true);
    third.roles = ["tech_team"];
  });

  it("reset issues a new temporary password and ends their sessions; not for yourself", () => {
    const before = user(id).password;
    const r = resetPassword(user(TECH), id);
    expect(r.ok && r.body.temporaryPassword).not.toBe(before);
    expect(user(id).mustChangePassword).toBe(true);
    expect(user(id).sessionsRevokedAt).toBeGreaterThan(Date.now() - 1000);
    expect(resetPassword(user(TECH), TECH)).toMatchObject({ ok: false, code: "SELF_RESET" });
  });

  it("sign out everywhere ends sessions and is audited", () => {
    expect(revokeSessions(user(TECH), id).ok).toBe(true);
    expect(db.audit[0]).toMatchObject({ action: "user.sessions.revoke", target: id });
  });
});

describe("temporary passwords", () => {
  it("always pass the password rules", () => {
    for (let i = 0; i < 50; i++) expect(checkPassword(temporaryPassword()).ok).toBe(true);
  });
});

describe("audit log", () => {
  it("Tech Admin and Tech Team read it; nobody else", () => {
    expect(listAudit(user(TECH), {}).ok).toBe(true);
    expect(listAudit(user("u02"), {}).ok).toBe(true);
    for (const id of ["u03", "u04", "u05", "u11"]) expect(listAudit(user(id), {}).ok).toBe(false);
  });

  it("starts with seeded history, newest first", () => {
    const r = listAudit(user(TECH), { pageSize: 200 });
    if (!r.ok) throw new Error();
    expect(r.body.total).toBeGreaterThan(30);
    const ats = r.body.items.map((i) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);
  });

  it("filters by category, person and words, and names the target", () => {
    const users = listAudit(user(TECH), { category: "users" });
    expect(users.ok && users.body.items.every((i) => i.action.startsWith("user."))).toBe(true);
    const signIns = listAudit(user(TECH), { category: "sign-in" });
    expect(signIns.ok && signIns.body.items.every((i) => /^(sign_|password\.|mfa\.)/.test(i.action))).toBe(true);
    const byGrace = listAudit(user(TECH), { actorId: TECH });
    expect(byGrace.ok && byGrace.body.items.every((i) => i.actorId === TECH)).toBe(true);
    const named = listAudit(user(TECH), { q: "new volunteer", category: "users" });
    expect(named.ok && named.body.items.some((i) => i.targetLabel === "New Volunteer")).toBe(true);
  });

  it("filters by church-time date range", () => {
    const r = listAudit(user(TECH), { from: "2099-01-01" });
    expect(r.ok && r.body.total).toBe(0);
  });
});

describe("settings", () => {
  it("only Tech Admin reads and saves them", () => {
    expect(getSettings(user("u02")).ok).toBe(false);
    expect(getSettings(user(TECH)).ok).toBe(true);
  });

  it("saves, bumps rowVer, audits the change, and feeds the Forgot password panel", () => {
    const s = getSettings(user(TECH));
    if (!s.ok) throw new Error();
    const cur = s.body.settings;
    const r = updateSettings(user(TECH), { ...cur, resetRelay: "Ruth Mensah", idleMinutes: 15 });
    expect(r.ok && r.body.settings.rowVer).toBe(cur.rowVer + 1);
    expect(db.settings.resetRelay).toBe("Ruth Mensah");
    expect(db.audit[0]).toMatchObject({ action: "settings.update", meta: { before: { resetRelay: cur.resetRelay, idleMinutes: cur.idleMinutes }, after: { resetRelay: "Ruth Mensah", idleMinutes: 15 } } });
    // Stale save → 409
    expect(updateSettings(user(TECH), { ...cur })).toMatchObject({ ok: false, status: 409, code: "CONFLICT" });
  });

  it("validates choices", () => {
    const s = getSettings(user(TECH));
    if (!s.ok) throw new Error();
    const r = updateSettings(user(TECH), { ...s.body.settings, resetContact: "", idleMinutes: 7 });
    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(!r.ok && Object.keys(r.fields ?? {}).sort()).toEqual(["idleMinutes", "resetContact"]);
  });

  it("the temporary-password switch drives API-A7", () => {
    const s = getSettings(user(TECH));
    if (!s.ok) throw new Error();
    updateSettings(user(TECH), { ...s.body.settings, forcePasswordChange: false });
    expect(db.enforceTempPassword).toBe(false);
    const again = getSettings(user(TECH));
    if (!again.ok) throw new Error();
    updateSettings(user(TECH), { ...again.body.settings, forcePasswordChange: true });
    expect(db.enforceTempPassword).toBe(true);
  });
});

describe("dashboard", () => {
  it("Church Admin and Tech Admin only", () => {
    expect(dashboard(user(TECH)).ok).toBe(true);
    expect(dashboard(user("u04")).ok).toBe(true);
    for (const id of ["u02", "u03", "u05", "u11", "u13"]) expect(dashboard(user(id)).ok).toBe(false);
  });

  it("counts from Connect and Welcome data", () => {
    const r = dashboard(user(TECH));
    if (!r.ok) throw new Error();
    const d = r.body;
    expect(d.tiles.guestsOnRecord).toBe(db.connect.length);
    expect(d.trend).toHaveLength(12);
    expect(d.tiles.contacted48.done).toBeLessThanOrEqual(d.tiles.contacted48.of);
    expect(d.attention.length).toBeLessThanOrEqual(6);
    expect(d.attentionTotal).toBe(d.tiles.overdue48);
    expect(d.cells.map((c) => c.cell)).toEqual(["Red", "Yellow", "Blue", "Green", "N/A"]);
  });

  it("accounts and activity only for people who manage users and read the audit log", () => {
    const tech = dashboard(user(TECH));
    const church = dashboard(user("u04"));
    expect(tech.ok && tech.body.accounts).toBeTruthy();
    expect(tech.ok && tech.body.activity?.length).toBeGreaterThan(0);
    expect(church.ok && church.body.accounts).toBeNull();
    expect(church.ok && church.body.activity).toBeNull();
  });
});
