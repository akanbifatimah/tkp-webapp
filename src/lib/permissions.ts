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
  // M6 Admin (PRD SA-3, CA-3, F-12)
  "dashboard.view",
  "admin.users",
  "admin.audit",
  "admin.settings",
  // M7 configuration (PRD W-12, W-13, IL-5, CA-2)
  "config.cells",
  "config.services",
  // M7 QR codes (PRD 5.8): see and count, print, create and change
  "qr.view",
  "qr.print",
  "qr.manage",
  "welcome.duplicates.view",
  "welcome.duplicates.merge",
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
/**
 * PRD 5.8: church_admin and the integration lead create and edit; the welcome
 * team views and prints; the pastor sees scan counts only.
 */
const QR_MANAGE: Permission[] = ["qr.view", "qr.print", "qr.manage"];
const QR_PRINT: Permission[] = ["qr.view", "qr.print"];
/** PRD W-14: the admins merge; the welcome lead and Tech Team see the list. */
const DUP_MERGE: Permission[] = ["welcome.duplicates.view", "welcome.duplicates.merge"];
const LATER_ALL: Permission[] = ["grow.view", "care.view", "serve.view", "lead.view", "go.view", "transform.view"];

/**
 * Guest PDF export (D8: enabled, overriding TKP Connect FI-40).
 * Which roles may export is still to be confirmed with the product owner;
 * until then: the roles that lead a team or the church.
 */
const EXPORT: Permission[] = ["welcome.export"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  tech_admin: ["dashboard.view", ...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "belong.view", ...LATER_ALL, "admin.users", "admin.audit", "admin.settings", "config.cells", "config.services", ...QR_MANAGE, ...DUP_MERGE],
  tech_team: [...WELCOME_ALL, ...CONNECT_TABS, "belong.view", ...LATER_ALL, "admin.audit", "qr.view", "welcome.duplicates.view"],
  lead_pastor: [...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "belong.view", ...LATER_ALL, "qr.view"],
  church_admin: ["dashboard.view", ...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "belong.view", ...LATER_ALL, "config.cells", "config.services", ...QR_MANAGE, ...DUP_MERGE],
  church_office_admin: [...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "belong.view"],
  church_office: [...WELCOME_ALL, ...CONNECT_TABS, "belong.view"],
  // PRD IL-5 / IL-6: the integration lead keeps the cell and ZIP map.
  integration_admin: [...WELCOME_ALL, ...EXPORT, ...CONNECT_TABS, "config.cells", ...QR_MANAGE, ...DUP_MERGE],
  integration_team: ["welcome.overview.view", "welcome.lookup.view", ...CONNECT_TABS],
  welcome_lead: [...WELCOME_ALL, ...EXPORT, "connect.journey.view", ...QR_PRINT, "welcome.duplicates.view"],
  welcome_team: ["welcome.overview.view", "welcome.lookup.view", "connect.journey.view", ...QR_PRINT],
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

/** Where a role lands after sign-in (doc 02 §1). The Figma dashboard is the Church Admin / Tech Admin home (M6). */
export function landingPath(role: Role): string {
  if (can(role, "dashboard.view")) return "/dashboard";
  if (can(role, "welcome.overview.view")) return "/welcome";
  if (can(role, "member.home")) return "/home";
  if (can(role, "grow.view")) return "/grow";
  if (can(role, "serve.view")) return "/serve";
  if (can(role, "care.view")) return "/care";
  return "/no-access";
}

/* ------------------------------------------------------------------ M6 Admin */

/** PRD §2 rule 6: staff and admin accounts require MFA. Members do not (optional, PRD U4). */
export const isStaff = (roles: readonly Role[]) => roles.some((r) => r !== "tkp_member");

/** Roles that hand out full control. Granting one asks for a second confirmation (PRD SA-1 sensitive-grant guard). */
export const SENSITIVE_ROLES: readonly Role[] = ["tech_admin"];

/** Plain-words summary of each role template, for Users and roles. */
export const ROLE_SUMMARY: Record<Role, string> = {
  tech_admin: "Everything, including users, audit log and settings. Saves logs for guests assigned to them.",
  tech_team: "Sees every module to support and test it. Reads the audit log. Cannot save or assign.",
  lead_pastor: "Sees Welcome and both Connect teams; assigns guests and saves logs for guests assigned to them.",
  church_admin: "Church dashboard, Welcome and both Connect teams; assigns guests; keeps the services, cell map and QR codes; merges duplicate guests. Never saves logs.",
  church_office_admin: "Leads the Church Office team: sees and assigns the team's guests.",
  church_office: "Church Office caller: works the guests assigned to them.",
  integration_admin: "Leads the Integration Team: sees and assigns the team's guests; keeps the cell map and QR codes; merges duplicate guests.",
  integration_team: "Integration caller: works the guests assigned to them.",
  welcome_lead: "Welcome overview, guest lookup and LCM Metrics; exports guest PDFs; prints QR codes; sees duplicate guests.",
  welcome_team: "Welcome overview and guest lookup; prints QR codes.",
  tkp_member: "Member home only. No staff areas.",
  registrar: "Owns courses, exams, results and students (Grow, coming in M8).",
  course_author: "Builds the courses and exams the Registrar assigns (M8).",
  grader: "Marks the answers the Registrar assigns (M8).",
  project_lead: "Runs their own projects and applicants (M9).",
  prayer_moderator: "Moderates the Prayer Wall (M9).",
};

/** Where each permission key sits, for the read-only Roles page. */
export const PERMISSION_LABEL: Record<Permission, { area: string; label: string }> = {
  "dashboard.view": { area: "Dashboard", label: "Church dashboard" },
  "welcome.overview.view": { area: "Welcome", label: "Overview" },
  "welcome.lookup.view": { area: "Welcome", label: "Guest lookup" },
  "welcome.lcm.view": { area: "Welcome", label: "LCM Metrics" },
  "welcome.export": { area: "Welcome", label: "Export guest PDF" },
  "connect.queue.view": { area: "Connect", label: "Work queue" },
  "connect.log.view": { area: "Connect", label: "Log follow-up" },
  "connect.scripts.view": { area: "Connect", label: "Scripts" },
  "connect.guestTrack.view": { area: "Connect", label: "Guest Track" },
  "connect.journey.view": { area: "Connect", label: "Guest journey" },
  "connect.phaseBoard.view": { area: "Connect", label: "Phase board" },
  "connect.metrics.view": { area: "Connect", label: "Team metrics" },
  "belong.view": { area: "Journey", label: "Belong" },
  "grow.view": { area: "Journey", label: "Grow" },
  "care.view": { area: "Journey", label: "Care" },
  "serve.view": { area: "Journey", label: "Serve" },
  "lead.view": { area: "Journey", label: "Lead" },
  "go.view": { area: "Journey", label: "Go" },
  "transform.view": { area: "Journey", label: "Transform" },
  "member.home": { area: "Member", label: "Member home" },
  "admin.users": { area: "Admin", label: "Users and roles" },
  "admin.audit": { area: "Admin", label: "Audit log" },
  "admin.settings": { area: "Admin", label: "Settings" },
  "config.cells": { area: "Admin", label: "Cells and ZIPs" },
  "config.services": { area: "Admin", label: "Services" },
  "qr.view": { area: "Welcome", label: "QR codes and scan counts" },
  "qr.print": { area: "Welcome", label: "Print QR codes" },
  "qr.manage": { area: "Welcome", label: "Create and change QR codes" },
  "welcome.duplicates.view": { area: "Welcome", label: "Duplicate guests" },
  "welcome.duplicates.merge": { area: "Welcome", label: "Merge duplicate guests" },
};
