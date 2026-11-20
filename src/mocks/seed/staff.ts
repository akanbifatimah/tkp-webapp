import type { ConnectTeam, Role } from "@/lib/permissions";

/**
 * Fictional staff, one or more per role. Never real people: example.com emails,
 * 555 phone numbers. Every mock account uses the same demo password.
 */
export const DEMO_PASSWORD = "Welcome1!";

export type StaffRecord = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  roles: Role[];
  connectTeam: ConnectTeam | null;
  isActive: boolean;
  mustChangePassword: boolean;
  /** Mock only: plain text. A real backend stores a bcrypt hash (API-A1). */
  password: string;
  /** Sessions issued before this are refused (API-A3). */
  sessionsRevokedAt: number;
  createdAt: string;
  lastSignInAt: string | null;
  /** Concurrency check for edits (docs/API.md §1). */
  rowVer: number;
};

const DAY = 86_400_000;
/** Deterministic dates relative to page load, so the lists look lived-in. */
const daysAgo = (n: number, hour = 15) => {
  const d = new Date(Date.now() - n * DAY);
  d.setUTCHours(hour, (n * 7) % 60, 0, 0);
  return d.toISOString();
};

const s = (
  id: string,
  fullName: string,
  roles: Role[],
  connectTeam: ConnectTeam | null,
  extra: Partial<StaffRecord> = {},
): StaffRecord => ({
  id,
  fullName,
  email: `${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
  phone: `(281) 555-01${id.slice(-2)}`,
  roles,
  connectTeam,
  isActive: true,
  mustChangePassword: false,
  password: DEMO_PASSWORD,
  sessionsRevokedAt: 0,
  createdAt: daysAgo(300 - Number(id.slice(1)) * 11),
  lastSignInAt: daysAgo(Number(id.slice(1)) % 6, 14 + (Number(id.slice(1)) % 5)),
  rowVer: 1,
  ...extra,
});

export const STAFF: StaffRecord[] = [
  s("u01", "Grace Adeyemi", ["tech_admin"], "integration"),
  s("u02", "Daniel Okafor", ["tech_team"], null),
  s("u03", "Samuel Bankole", ["lead_pastor"], "both"),
  s("u04", "Esther Coleman", ["church_admin"], null),
  s("u05", "Ruth Mensah", ["church_office_admin"], "church_office"),
  s("u06", "Lydia Fashola", ["church_office"], "church_office"),
  s("u07", "Peter Nwosu", ["church_office"], "church_office"),
  s("u08", "Joy Ibekwe", ["integration_admin"], "integration"),
  s("u09", "Tobi Martins", ["integration_team"], "integration"),
  s("u10", "Hannah Greene", ["integration_team"], "both"),
  s("u11", "Michael Otieno", ["welcome_lead"], null),
  s("u12", "Naomi Bello", ["welcome_team"], null),
  s("u13", "Caleb Johnson", ["tkp_member"], null),
  s("u14", "Deborah Alade", ["church_admin", "registrar"], null),
  // A team role without a follow-up team (AC-04 message)
  s("u15", "Isaac Ward", ["integration_team"], null),
  // Signed in with a temporary password: must choose their own first (API-A7)
  s("u17", "New Volunteer", ["church_office"], "church_office", { mustChangePassword: true, createdAt: daysAgo(1), lastSignInAt: null }),
  // Deactivated: cannot sign in (API-A1)
  s("u16", "Former Volunteer", ["church_office"], "church_office", { isActive: false, lastSignInAt: daysAgo(96) }),
];
