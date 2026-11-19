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

  it("FI-07: a Welcome Team member sees only Overview and Guest lookup", () => {
    const perms = permissionsFor(["welcome_team"]);
    const nav = visibleNav((p) => perms.has(p));
    expect(nav.map((g) => g.id)).toEqual(["welcome"]);
    expect(nav[0]?.tabs?.map((t) => t.label)).toEqual(["Overview", "Guest lookup"]);
  });

  it("doc 02 §3: later modules shown only to the agreed roles", () => {
    expect(can("church_office", "belong.view")).toBe(true);
    expect(can("church_office", "grow.view")).toBe(false);
    expect(can("integration_admin", "belong.view")).toBe(false);
    expect(can("tkp_member", "transform.view")).toBe(true);
  });
});
