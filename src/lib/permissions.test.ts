import { describe, expect, it } from "vitest";
import { visibleNav } from "./nav";
import {
  CONNECT_ACCESS_DENIED,
  CONNECT_POLICY,
  can,
  landingPath,
  permissionsFor,
  type Permission,
  type Role,
} from "./permissions";

/**
 * Every cell of TKP Connect's doc 02 §2 matrix (live tabs only).
 * V = can view; "—" = no access.
 */
const MATRIX: Record<string, { overview: boolean; lookup: boolean; lcm: boolean; queue: boolean; log: boolean; scripts: boolean }> = {
  tech_admin: { overview: true, lookup: true, lcm: true, queue: true, log: true, scripts: true },
  tech_team: { overview: true, lookup: true, lcm: true, queue: true, log: true, scripts: true },
  lead_pastor: { overview: true, lookup: true, lcm: true, queue: true, log: true, scripts: true },
  church_admin: { overview: true, lookup: true, lcm: true, queue: true, log: true, scripts: true },
  church_office_admin: { overview: true, lookup: true, lcm: true, queue: true, log: true, scripts: true },
  church_office: { overview: true, lookup: true, lcm: true, queue: true, log: true, scripts: true },
  integration_admin: { overview: true, lookup: true, lcm: true, queue: true, log: true, scripts: true },
  integration_team: { overview: true, lookup: true, lcm: false, queue: true, log: true, scripts: true },
  welcome_lead: { overview: true, lookup: true, lcm: true, queue: false, log: false, scripts: false },
  welcome_team: { overview: true, lookup: true, lcm: false, queue: false, log: false, scripts: false },
  tkp_member: { overview: false, lookup: false, lcm: false, queue: false, log: false, scripts: false },
};

const KEY: Record<keyof (typeof MATRIX)[string], Permission> = {
  overview: "welcome.overview.view",
  lookup: "welcome.lookup.view",
  lcm: "welcome.lcm.view",
  queue: "connect.queue.view",
  log: "connect.log.view",
  scripts: "connect.scripts.view",
};

describe("doc 02 access matrix", () => {
  for (const [role, row] of Object.entries(MATRIX)) {
    for (const [col, expected] of Object.entries(row)) {
      it(`${role} · ${col} → ${expected ? "V" : "—"}`, () => {
        expect(can(role as Role, KEY[col as keyof typeof KEY])).toBe(expected);
      });
    }
  }
});

describe("doc 02 Connect rules", () => {
  it("AC-01 scope: whole-team roles see all, team admins their team, others their own", () => {
    expect(CONNECT_POLICY.tech_admin?.scope).toBe("all");
    expect(CONNECT_POLICY.tech_team?.scope).toBe("all");
    expect(CONNECT_POLICY.lead_pastor?.scope).toBe("all");
    expect(CONNECT_POLICY.church_admin?.scope).toBe("all");
    expect(CONNECT_POLICY.church_office_admin?.scope).toBe("team");
    expect(CONNECT_POLICY.integration_admin?.scope).toBe("team");
    expect(CONNECT_POLICY.church_office?.scope).toBe("mine");
    expect(CONNECT_POLICY.integration_team?.scope).toBe("mine");
  });

  it("AC-02 assign: Tech Team never assigns; team admins only within their team", () => {
    expect(CONNECT_POLICY.tech_team?.assignTeams).toEqual([]);
    expect(CONNECT_POLICY.church_office_admin?.assignTeams).toEqual(["church_office"]);
    expect(CONNECT_POLICY.integration_admin?.assignTeams).toEqual(["integration"]);
    expect(CONNECT_POLICY.lead_pastor?.assignTeams).toHaveLength(2);
  });

  it("Tech Team and Church Admin read all but never save", () => {
    expect(CONNECT_POLICY.tech_team?.savesOwn).toBe(false);
    expect(CONNECT_POLICY.church_admin?.savesOwn).toBe(false);
    expect(CONNECT_POLICY.tech_admin?.savesOwn).toBe(true);
  });

  it("keeps the exact Access Denied wording", () => {
    expect(CONNECT_ACCESS_DENIED).toBe("Access Denied, restricted to the church office or integration team members only");
  });
});

describe("landing and navigation", () => {
  it("roles that see the Welcome Overview land there; TKP Member lands on Member home", () => {
    expect(landingPath("welcome_team")).toBe("/welcome");
    expect(landingPath("integration_team")).toBe("/welcome");
    expect(landingPath("tkp_member")).toBe("/home");
  });

  it("FI-07: a Welcome Team member sees Overview and Guest lookup (plus QR codes, PRD 5.8)", () => {
    const perms = permissionsFor(["welcome_team"]);
    const nav = visibleNav((p) => perms.has(p));
    expect(nav.map((g) => g.id)).toEqual(["welcome"]);
    expect(nav[0]?.tabs?.map((t) => t.label)).toEqual(["Overview", "Guest lookup", "QR codes"]);
  });

  it("M7 QR codes (PRD 5.8): admins and the integration lead manage, the welcome team prints, the pastor sees counts", () => {
    for (const r of ["tech_admin", "church_admin", "integration_admin"] as Role[]) expect(can(r, "qr.manage")).toBe(true);
    for (const r of ["welcome_lead", "welcome_team"] as Role[]) {
      expect(can(r, "qr.print")).toBe(true);
      expect(can(r, "qr.manage")).toBe(false);
    }
    for (const r of ["lead_pastor", "tech_team"] as Role[]) {
      expect(can(r, "qr.view")).toBe(true);
      expect(can(r, "qr.print")).toBe(false);
    }
    for (const r of ["church_office_admin", "church_office", "integration_team", "tkp_member"] as Role[]) expect(can(r, "qr.view")).toBe(false);
  });

  it("M7 duplicates (PRD W-14): the admins and the welcome lead merge; Tech Team only sees the list", () => {
    for (const r of ["tech_admin", "church_admin", "integration_admin", "welcome_lead"] as Role[]) expect(can(r, "welcome.duplicates.merge")).toBe(true);
    expect(can("tech_team", "welcome.duplicates.view")).toBe(true);
    expect(can("tech_team", "welcome.duplicates.merge")).toBe(false);
    for (const r of ["lead_pastor", "welcome_team", "church_office_admin", "integration_team", "tkp_member"] as Role[]) expect(can(r, "welcome.duplicates.view")).toBe(false);
  });

  it("M7 Reports hub (PRD PL-4, PL-5): everyone who sees LCM sees it; leadership and the admins share", () => {
    for (const r of ["tech_admin", "church_admin", "integration_admin", "welcome_lead", "lead_pastor"] as Role[]) expect(can(r, "reports.share")).toBe(true);
    for (const r of ["tech_team", "church_office_admin"] as Role[]) {
      expect(can(r, "reports.view")).toBe(true);
      expect(can(r, "reports.share")).toBe(false);
    }
    for (const r of ["welcome_team", "church_office", "integration_team", "tkp_member"] as Role[]) expect(can(r, "reports.view")).toBe(false);
  });

  it("M7 import wizard (PRD W-16): the admins import both kinds; the Welcome Lead imports guest entries", () => {
    for (const r of ["tech_admin", "church_admin", "integration_admin"] as Role[]) {
      expect(can(r, "welcome.import")).toBe(true);
      expect(can(r, "welcome.import.followups")).toBe(true);
    }
    expect(can("welcome_lead", "welcome.import")).toBe(true);
    expect(can("welcome_lead", "welcome.import.followups")).toBe(false);
    for (const r of ["tech_team", "lead_pastor", "welcome_team", "church_office_admin", "integration_team", "tkp_member"] as Role[]) expect(can(r, "welcome.import")).toBe(false);
  });

  it("M6: Tech Admin and Church Admin land on the dashboard", () => {
    expect(landingPath("tech_admin")).toBe("/dashboard");
    expect(landingPath("church_admin")).toBe("/dashboard");
    expect(landingPath("lead_pastor")).toBe("/welcome");
  });

  it("M6: the Admin group follows its tabs; Tech Team sees only the audit log", () => {
    const nav = (role: Role) => {
      const perms = permissionsFor([role]);
      return visibleNav((p) => perms.has(p)).find((g) => g.id === "admin");
    };
    expect(nav("tech_admin")?.tabs?.map((t) => t.label)).toEqual(["Users", "Roles", "Cells and ZIPs", "Services", "Audit log", "Settings"]);
    expect(nav("tech_team")?.tabs?.map((t) => t.label)).toEqual(["Audit log"]);
    expect(nav("tech_team")?.to).toBe("/admin/audit");
    expect(nav("lead_pastor")).toBeUndefined();
  });

  it("M7: Church Admin keeps services and the cell map; the integration lead keeps the cell map", () => {
    const nav = (role: Role) => {
      const perms = permissionsFor([role]);
      return visibleNav((p) => perms.has(p)).find((g) => g.id === "admin");
    };
    expect(nav("church_admin")?.tabs?.map((t) => t.label)).toEqual(["Cells and ZIPs", "Services"]);
    expect(nav("church_admin")?.to).toBe("/admin/cells");
    expect(nav("integration_admin")?.tabs?.map((t) => t.label)).toEqual(["Cells and ZIPs"]);
    for (const r of ["tech_team", "lead_pastor", "church_office_admin", "integration_team", "welcome_lead", "welcome_team"] as Role[]) {
      expect(can(r, "config.cells")).toBe(false);
      expect(can(r, "config.services")).toBe(false);
    }
    expect(can("integration_admin", "config.services")).toBe(false);
  });

  it("M6: only Tech Admin manages users and settings", () => {
    for (const r of ["tech_team", "lead_pastor", "church_admin", "church_office_admin", "integration_admin"] as Role[]) {
      expect(can(r, "admin.users")).toBe(false);
      expect(can(r, "admin.settings")).toBe(false);
    }
    expect(can("tech_admin", "admin.users")).toBe(true);
    expect(can("tech_admin", "admin.settings")).toBe(true);
  });

  it("doc 02 §3: later modules shown only to the agreed roles", () => {
    expect(can("church_office", "belong.view")).toBe(true);
    expect(can("church_office", "grow.view")).toBe(false);
    expect(can("integration_admin", "belong.view")).toBe(false);
    expect(can("tkp_member", "transform.view")).toBe(true);
  });
});
