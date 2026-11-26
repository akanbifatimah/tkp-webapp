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
  /** Their signature for certificates (PNG data URL in the mock; a file URL on a real backend). */
  signature: string | null;
};

/** A demo signature for the Lead Pastor, so certificates show one out of the box. */
const DEMO_SIGNATURE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90"><g fill="none" stroke="#1d2550" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 62C24 22 44 18 40 48S28 82 52 56C62 42 70 36 72 54C74 70 86 60 93 46C99 35 106 40 103 55C101 68 116 62 123 48C129 38 137 42 135 56C134 66 147 62 156 50C166 38 176 44 173 58C171 70 191 58 206 44"/>' +
    '<path d="M30 76C82 70 150 68 212 62"/></g></svg>',
)}`;

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
  signature: null,
  ...extra,
});

export const STAFF: StaffRecord[] = [
  s("u01", "Grace Adeyemi", ["tech_admin"], "integration"),
  s("u02", "Daniel Okafor", ["tech_team"], null),
  s("u03", "Samuel Bankole", ["lead_pastor"], "both", { signature: DEMO_SIGNATURE }),
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
  // Grow (M8): the Registrar, the class teachers (Course Authors) and a grader
  s("u23", "Tolu Ajayi", ["registrar"], null),
  s("u18", "Doyin Olusanya", ["course_author"], null),
  s("u19", "Folabi Adewale", ["course_author"], null),
  s("u20", "Ayo Oladipo", ["course_author", "grader"], null),
  s("u21", "Olusegun Ogunleye", ["course_author"], null),
  s("u22", "Esther Oyelaran", ["course_author"], null),
  s("u24", "Kemi Adebayo", ["grader"], null),
  // A team role without a follow-up team (AC-04 message)
  s("u15", "Isaac Ward", ["integration_team"], null),
  // Signed in with a temporary password: must choose their own first (API-A7)
  s("u17", "New Volunteer", ["church_office"], "church_office", { mustChangePassword: true, createdAt: daysAgo(1), lastSignInAt: null }),
  // Deactivated: cannot sign in (API-A1)
  s("u16", "Former Volunteer", ["church_office"], "church_office", { isActive: false, lastSignInAt: daysAgo(96) }),
];
