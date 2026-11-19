import type { LogRow } from "@/features/connect/types";
import { seedConnect, type ConnectRecord } from "./seed/guests";
import { STAFF, type StaffRecord } from "./seed/staff";

/**
 * In-memory mock database. It resets on every page load.
 */
export type AuditRow = { id: string; actorId: string | null; action: string; target: string | null; at: string };

const seeded = seedConnect();

export const db = {
  staff: STAFF.map((s) => ({ ...s })) as StaffRecord[],
  audit: [] as AuditRow[],
  settings: { resetContact: "Grace Adeyemi", resetRelay: "Joy Ibekwe" as string | null },
  /**
   * TKP Connect API-A7: the forced change was switched off until an in-app
   * Change password button existed (PL-06). TKP Hub has the button, so it is on.
   */
  enforceTempPassword: true,
  /** One Connect journey per person (TKP Connect itg.Connect). */
  connect: seeded.records as ConnectRecord[],
  /** Saved logs, newest first (itg.ConnectLog). */
  connectLogs: seeded.logs as LogRow[],
};

/** Every sign-in, search, guest view, assignment and save is audited (FI-09). */
export function audit(actorId: string | null, action: string, target: string | null = null) {
  db.audit.unshift({ id: crypto.randomUUID(), actorId, action, target, at: new Date().toISOString() });
}
