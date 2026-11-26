import type { ConnectTeam, Role } from "@/lib/permissions";
import type { Paged } from "@/lib/types";

/** M6 Admin: the shapes in docs/API.md §7. */

/* ----------------------------------------------------------------- users */

export type UserStatus = "active" | "temporary" | "deactivated";

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roles: Role[];
  connectTeam: ConnectTeam | null;
  /** active · temporary (must choose a password at next sign-in) · deactivated */
  status: UserStatus;
  createdAt: string;
  lastSignInAt: string | null;
  rowVer: number;
};

export type UserQuery = {
  q?: string;
  role?: Role | "";
  status?: UserStatus | "all" | "";
  page?: number;
  pageSize?: number;
};

export type UsersResponse = Paged<AdminUser> & {
  /** Counts over every user, for the filter chips. */
  counts: Record<UserStatus, number>;
};

export type UserInput = {
  fullName: string;
  email: string;
  phone: string | null;
  roles: Role[];
  connectTeam: ConnectTeam | null;
};

/** Create and reset return the temporary password ONCE; it is never readable again. */
export type TempPasswordResponse = { user: AdminUser; temporaryPassword: string };

/* ----------------------------------------------------------------- audit */

export type AuditEntry = {
  id: string;
  at: string;
  actorId: string | null;
  /** Null for failed sign-ins and system jobs. */
  actorName: string | null;
  action: string;
  target: string | null;
  /** The server's readable name for the target (a person, a guest number, "Settings"). */
  targetLabel: string | null;
  meta: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
};

export type AuditCategory = "sign-in" | "welcome" | "connect" | "grow" | "care" | "serve" | "users" | "settings" | "exports";

export type AuditQuery = {
  q?: string;
  actorId?: string;
  category?: AuditCategory | "";
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type AuditResponse = Paged<AuditEntry> & {
  /** People who appear in the log, for the "Who" filter. */
  actors: { id: string; fullName: string }[];
  retentionDays: number;
};

/* ----------------------------------------------------------------- settings */

export type AdminSettings = {
  resetContact: string;
  resetRelay: string | null;
  idleMinutes: number;
  /** TKP Connect API-A7: temporary passwords must be replaced at first sign-in. */
  forcePasswordChange: boolean;
  auditRetentionDays: number;
  /** Read-only facts shown on the page. */
  mfaForStaff: boolean;
  timeZone: string;
  rowVer: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type SettingsInput = Pick<AdminSettings, "resetContact" | "resetRelay" | "idleMinutes" | "forcePasswordChange" | "auditRetentionDays" | "rowVer">;

/* ----------------------------------------------------------------- dashboard */

export type DashboardResponse = {
  asOf: string;
  latestServiceDate: string | null;
  tiles: {
    /** One Connect journey per person: everyone who has filled in the form. */
    guestsOnRecord: number;
    firstSeen: string | null;
    /** First-time guests this calendar month, and in the same month last year. */
    newThisMonth: number;
    newSameMonthLastYear: number;
    /** Guests whose 48 hours ran out in the last 30 days, and how many got a first contact in time. */
    contacted48: { done: number; of: number };
    overdue48: number;
  };
  /** Last 12 months, oldest first. month = YYYY-MM. */
  trend: { month: string; firstVisits: number; returnVisits: number }[];
  /** Guests this year by home cell (ZIP map). */
  cells: { cell: "Red" | "Yellow" | "Blue" | "Green" | "N/A"; guests: number; active: number }[];
  /** 48h-overdue guests, oldest clock first (at most 6). */
  attention: {
    connectId: number;
    name: string;
    serviceDate: string;
    serviceType: string;
    hoursSince: number;
    coName: string | null;
    itName: string | null;
  }[];
  attentionTotal: number;
  /** Only for people with admin.users. */
  accounts: { active: number; temporary: number; deactivated: number; signedInThisWeek: number } | null;
  /** Only for people with admin.audit: the latest entries. */
  activity: AuditEntry[] | null;
};
