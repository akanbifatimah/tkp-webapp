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
  s("u17", "New Volunteer", ["church_office"], "church_office", { mustChangePassword: true }),
  // Deactivated: cannot sign in (API-A1)
  s("u16", "Former Volunteer", ["church_office"], "church_office", { isActive: false }),
];
