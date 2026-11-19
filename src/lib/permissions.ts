/**
 * Roles and permissions: the one place access rules live (TKP Connect AC-08).
 *
 * The UI never checks role names. It checks permission keys, and roles are
 * templates that bundle keys. Welcome and Connect follow TKP Connect's
 * doc 02 matrix exactly (integration-app/harris-consult/02-roles-and-access.md).
 */

export const ROLES = [
  // The 11 TKP Connect roles (doc 02 §1)
  "tech_admin",
  "tech_team",
  "lead_pastor",
  "church_admin",
  "church_office_admin",
  "church_office",
  "integration_admin",
  "integration_team",
  "welcome_lead",
  "welcome_team",
  "tkp_member",
  // Added for the PRD modules (Part 2)
  "registrar",
  "course_author",
  "grader",
  "project_lead",
  "prayer_moderator",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  tech_admin: "Tech Admin",
  tech_team: "Tech Team",
  lead_pastor: "Lead Pastor",
  church_admin: "Church Admin",
  church_office_admin: "Church Office Admin",
  church_office: "Church Office",
  integration_admin: "Integration Admin",
  integration_team: "Integration Team",
  welcome_lead: "Welcome Lead",
  welcome_team: "Welcome Team",
  tkp_member: "TKP Member",
  registrar: "Registrar",
  course_author: "Course Author",
  grader: "Grader",
  project_lead: "Project Lead",
  prayer_moderator: "Prayer Moderator",
};

/** Follow-up team membership, separate from role (doc 02). */
export type ConnectTeam = "church_office" | "integration" | "both";
export type Team = "church_office" | "integration";

export const TEAM_LABEL: Record<Team, string> = {
  church_office: "Church Office",
  integration: "Integration Team",
};

/* ------------------------------------------------------------ permission keys */

export const PERMISSIONS = [
  "welcome.overview.view",
  "welcome.lookup.view",
  "welcome.lcm.view",
  "welcome.export",
  "connect.queue.view",
  "connect.log.view",
  "connect.scripts.view",
  "connect.guestTrack.view",
  "connect.journey.view",
  "connect.phaseBoard.view",
  "connect.metrics.view",
  "belong.view",
  "grow.view",
  "care.view",
  "serve.view",
  "lead.view",
  "go.view",
  "transform.view",
  "member.home",
  "admin.users",
  "admin.audit",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const WELCOME_ALL: Permission[] = ["welcome.overview.view", "welcome.lookup.view", "welcome.lcm.view"];
const CONNECT_TABS: Permission[] = [
  "connect.queue.view",
  "connect.log.view",
  "connect.scripts.view",
  "connect.guestTrack.view",
  "connect.journey.view",
  "connect.phaseBoard.view",
  "connect.metrics.view",
];
const LATER_ALL: Permission[] = ["grow.view", "care.view", "serve.view", "lead.view", "go.view", "transform.view"];

/**
 * Guest PDF export (D8: enabled, overriding TKP Connect FI-40).
 * Which roles may export is still to be confirmed with the product owner;
 * until then: the roles that lead a team or the church.
 */
const EXPORT: Permission[] = ["welcome.export"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  tech_admin: [...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "belong.view", ...LATER_ALL, "admin.users", "admin.audit"],
  tech_team: [...WELCOME_ALL, ...CONNECT_TABS, "belong.view", ...LATER_ALL, "admin.audit"],
  lead_pastor: [...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "belong.view", ...LATER_ALL],
  church_admin: [...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "belong.view", ...LATER_ALL],
  church_office_admin: [...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "belong.view"],
  church_office: [...WELCOME_ALL, ...CONNECT_TABS, "belong.view"],
  integration_admin: [...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS],
  integration_team: ["welcome.overview.view", "welcome.lookup.view", ...CONNECT_TABS],
  welcome_lead: [...WELCOME_ALL, ...EXPORT, "connect.journey.view"],
  welcome_team: ["welcome.overview.view", "welcome.lookup.view", "connect.journey.view"],
  tkp_member: ["member.home", "belong.view", ...LATER_ALL],
  // PRD roles: their module keys arrive with Part 2.
  registrar: ["grow.view"],
  course_author: ["grow.view"],
  grader: ["grow.view"],
  project_lead: ["serve.view"],
  prayer_moderator: ["care.view"],
};

/* ------------------------------------------------------------- Connect policy */

/** Whose guests a role sees in Connect (AC-01). */
export type Scope = "all" | "team" | "mine";

export type ConnectPolicy = {
  /** Work queue / log reading scope. */
  scope: Scope;
  /** Teams this role may assign within (AC-02). */
  assignTeams: readonly Team[];
  /** May save logs for guests assigned to them (AC-05). Never for anyone else's. */
  savesOwn: boolean;
  /** Can switch between both teams' queues (AC-04). */
  switchesTeams: boolean;
};

const BOTH: readonly Team[] = ["church_office", "integration"];

export const CONNECT_POLICY: Partial<Record<Role, ConnectPolicy>> = {
  tech_admin: { scope: "all", assignTeams: BOTH, savesOwn: true, switchesTeams: true },
  tech_team: { scope: "all", assignTeams: [], savesOwn: false, switchesTeams: true },
  lead_pastor: { scope: "all", assignTeams: BOTH, savesOwn: true, switchesTeams: true },
  church_admin: { scope: "all", assignTeams: BOTH, savesOwn: false, switchesTeams: true },
  church_office_admin: { scope: "team", assignTeams: ["church_office"], savesOwn: true, switchesTeams: false },
  church_office: { scope: "mine", assignTeams: [], savesOwn: true, switchesTeams: false },
  integration_admin: { scope: "team", assignTeams: ["integration"], savesOwn: true, switchesTeams: false },
  integration_team: { scope: "mine", assignTeams: [], savesOwn: true, switchesTeams: false },
};

/** Team roles open only their own team; they need a follow-up team set (AC-04). */
export const TEAM_OF_ROLE: Partial<Record<Role, Team>> = {
  church_office_admin: "church_office",
  church_office: "church_office",
  integration_admin: "integration",
  integration_team: "integration",
};

/* ----------------------------------------------------------------- checks */

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r]) set.add(p);
  return set;
}

export const can = (role: Role, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);

/** Exact wording, doc 02 §2. */
export const CONNECT_ACCESS_DENIED =
  "Access Denied, restricted to the church office or integration team members only";

/** Exact wording, doc 02 AC-04. */
export const NO_FOLLOW_UP_TEAM = "You are not on a follow-up team yet. Ask the team lead to add you.";

/** Where a role lands after sign-in (doc 02 §1). */
export function landingPath(role: Role): string {
  if (can(role, "welcome.overview.view")) return "/welcome";
  if (can(role, "member.home")) return "/home";
  if (can(role, "grow.view")) return "/grow";
  if (can(role, "serve.view")) return "/serve";
  if (can(role, "care.view")) return "/care";
  return "/no-access";
}
