import type { LogRow } from "@/features/connect/types";
import { seedGrow, type AssessmentRecord, type AttendanceRecord, type CertificateRecord, type CourseRecord, type EnrolmentRecord, type ExcusalRecord, type JoinLog, type ReminderRecord, type SubmissionRecord, type LearnPerson, type SessionRecord } from "./seed/grow";
import { seedForum, type PostRecord, type ThreadRecord } from "./seed/forum";
import { seedAttendance, type AttendanceRow } from "./seed/attendance";
import { seedAudit } from "./seed/audit";
import { addDuplicates } from "./seed/duplicates";
import type { ImportRecord } from "./import-api";
import { seedReports, type RunRecord, type ScheduleRecord } from "./seed/reports";
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

/** A merge and the snapshot that undoes it (W-14 unmerge). */
export type MergeRecord = {
  id: string;
  at: string;
  byId: string;
  keepId: number;
  /** The kept record as it was, and its rowVer right after the merge. */
  keepBefore: ConnectRecord;
  keepRowVerAfter: number;
  /** The merged records as they were. */
  others: ConnectRecord[];
  /** Entry id → its owner and visit number before the merge (the kept record's too). */
  entries: Record<number, { connectId: number; visitNumber: number }>;
  /** Log id → its owner and guest name before the merge. */
  logs: Record<number, { connectId: number; guest: string }>;
  undoneAt: string | null;
  undoneById: string | null;
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

/**
 * Mock only: remembered devices survive a page reload (the rest of the mock data
 * resets), so "Remember this device" can be tried. A real backend keeps them in its database.
 */
export const TRUSTED_DEVICES_STORE = "tkp.mock.trustedDevices";
function loadTrustedDevices(): import("./mfa").TrustedDevice[] {
  try {
    return typeof localStorage === "undefined" ? [] : (JSON.parse(localStorage.getItem(TRUSTED_DEVICES_STORE) ?? "[]") as import("./mfa").TrustedDevice[]);
  } catch {
    return [];
  }
}

// The five fictional duplicate cases go in before anything reads the guests.
const seeded = addDuplicates(seedConnect());
const qr = seedQr();
const reports = seedReports();
const grow = seedGrow();
const forum = seedForum(grow.enrolments);
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
  /** Browsers that skip the sign-in code for 30 days ("Remember this device"). */
  trustedDevices: loadTrustedDevices(),
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
  /** Records merged into another (W-14): kept for the audit trail, out of every list. */
  mergedRecords: [] as (ConnectRecord & { mergedInto: number; mergedAt: string; mergedById: string })[],
  /** Pairs staff marked "not the same person": never suggested again. Key = the two connectIds, sorted, "a-b". */
  duplicateDismissals: [] as { key: string; ids: [number, number]; byId: string; at: string; note: string | null }[],
  /** Every merge, with what it changed, so it can be undone. */
  merges: [] as MergeRecord[],
  /** Import batches (W-16): staged drafts, committed and undone imports. */
  imports: [] as ImportRecord[],
  /** Scheduled report sharing (PL-4, W-9) and every share or scheduled send. */
  reportSchedules: reports.schedules as ScheduleRecord[],
  reportRuns: reports.runs as RunRecord[],
  /** Grow, the Learn admin (M8, §13): people who learn, classes, sessions and enrolments. */
  learnPeople: grow.people as LearnPerson[],
  learnCourses: grow.courses as CourseRecord[],
  learnSessions: grow.sessions as SessionRecord[],
  learnEnrolments: grow.enrolments as EnrolmentRecord[],
  /** Join and recording logs from the meeting platform and the player (M8 step 2). */
  learnLogs: grow.logs as JoinLog[],
  learnAttendance: grow.attendance as AttendanceRecord[],
  learnAssessments: grow.assessments as AssessmentRecord[],
  /** Answers and the pastor's review (M8 step 3), people excused, and reminder emails. */
  learnSubmissions: grow.submissions as SubmissionRecord[],
  learnExcusals: grow.excusals as ExcusalRecord[],
  learnReminders: grow.reminders as ReminderRecord[],
  /** Issued certificates: never deleted (PRD LMS-9). */
  learnCertificates: grow.certificates as CertificateRecord[],
  /** The cohort forum (M8 step 5). */
  forumThreads: forum.threads as ThreadRecord[],
  forumPosts: forum.posts as PostRecord[],
};

/** Every sign-in, search, guest view, assignment, save and admin change is audited (FI-09, PRD F-5). */
export function audit(actorId: string | null, action: string, target: string | null = null, meta?: AuditRow["meta"]) {
  db.audit.unshift({ id: crypto.randomUUID(), actorId, action, target, at: new Date().toISOString(), ...(meta ? { meta } : {}) });
}
