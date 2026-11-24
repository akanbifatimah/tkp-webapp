import type { LogRow } from "@/features/connect/types";
import { seedAttendance, type AttendanceRow } from "./seed/attendance";
import { seedAudit } from "./seed/audit";
import type { CellName } from "@/features/admin/config-types";
import { CELL_ZIPS, seedConnect, type ConnectRecord, type WelcomeEntry } from "./seed/guests";
import { seedQr, type QrRecord, type QrScanRow } from "./seed/qr";
import { seedServices, type ServiceRecord } from "./seed/services";
import { STAFF, type StaffRecord } from "./seed/staff";

/**
 * In-memory mock database. It resets on every page load.
 */
export type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  target: string | null;
  at: string;
  /** Old and new values for changes (PRD F-5: "audit log service with old and new values"). */
  meta?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
};

/** Settings the Tech Admin edits (PRD SA-1). */
export type SettingsRecord = {
  /** "Forgot password?" panel (UI-S1). */
  resetContact: string;
  resetRelay: string | null;
  /** Minutes without activity before the console signs out (PRD 4.3 "short idle timeout"). */
  idleMinutes: number;
  /** How long audit rows are kept (PRD 4.4 "retention periods set in Settings"). */
  auditRetentionDays: number;
  rowVer: number;
  updatedAt: string | null;
  updatedById: string | null;
};

const seeded = seedConnect();
const qr = seedQr();
const staff = STAFF.map((s) => ({ ...s, roles: [...s.roles] })) as StaffRecord[];

export const db = {
  staff,
  audit: seedAudit(staff, seeded.records) as AuditRow[],
  settings: {
    resetContact: "Grace Adeyemi",
    resetRelay: "Joy Ibekwe",
    idleMinutes: 30,
    auditRetentionDays: 730,
    rowVer: 1,
    updatedAt: null,
    updatedById: null,
  } as SettingsRecord,
  /**
   * TKP Connect API-A7: the forced change was switched off until an in-app
   * Change password button existed (PL-06). TKP Hub has the button, so it is on.
   * Editable in Settings.
   */
  enforceTempPassword: true,
  /** PRD §2 rule 6 / A-2: MFA is mandatory for staff. Not a setting. */
  mfaForStaff: true,
  /** One Connect journey per person (TKP Connect itg.Connect). */
  connect: seeded.records as ConnectRecord[],
  /** Saved logs, newest first (itg.ConnectLog). */
  connectLogs: seeded.logs as LogRow[],
  /** Every welcome-form entry (TKP Connect vw_WelcomeGuest), one per person per service date (BR-02). */
  entries: seeded.entries as WelcomeEntry[],
  /** ZIP → cell group (PRD W-12). Editable in Admin › Cells and ZIPs; one rowVer for the whole map. */
  cellMap: {
    zips: { ...CELL_ZIPS } as Record<string, CellName>,
    rowVer: 1,
    updatedAt: null as string | null,
    updatedById: null as string | null,
  },
  /** Services and special events (PRD W-13). */
  services: seedServices() as ServiceRecord[],
  /** QR codes (PRD 5.8) and their scan counts (QR-6, no personal data). */
  qrCodes: qr.codes as QrRecord[],
  qrScans: qr.scans as QrScanRow[],
  /** Service headcounts (LCM guests per 100 attendees). A new table: TKP does not collect these yet. */
  attendance: seedAttendance() as AttendanceRow[],
};

/** Every sign-in, search, guest view, assignment, save and admin change is audited (FI-09, PRD F-5). */
export function audit(actorId: string | null, action: string, target: string | null = null, meta?: AuditRow["meta"]) {
  db.audit.unshift({ id: crypto.randomUUID(), actorId, action, target, at: new Date().toISOString(), ...(meta ? { meta } : {}) });
}
