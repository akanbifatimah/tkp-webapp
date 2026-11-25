/** QR codes: print and manage (PRD 5.8, QR-1 to QR-10). docs/API.md §9. */

export const DESTINATIONS = ["guest_form", "short_form", "plan_visit", "event", "course", "prayer_wall"] as const;
export type DestinationType = (typeof DESTINATIONS)[number];

export const DESTINATION_LABEL: Record<DestinationType, string> = {
  guest_form: "Guest form",
  short_form: "Short guest form",
  plan_visit: "Plan a Visit",
  event: "Event",
  course: "Course",
  prayer_wall: "Prayer Wall",
};

/** Destinations that need a target picked (an event or a course). */
export const NEEDS_TARGET: readonly DestinationType[] = ["event", "course"];

/** Stored state. The status people see is worked out from it and the dates at read time (QR-10). */
export type QrState = "draft" | "live" | "paused";
export type QrStatus = "draft" | "scheduled" | "active" | "paused" | "expired";

export const STATUS_LABEL: Record<QrStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  paused: "Paused",
  expired: "Expired",
};

export type QrCode = {
  id: string;
  name: string;
  /** Short permanent address on the code (QR-2). Legacy codes keep the address already printed (QR-7). */
  shortUrl: string;
  slug: string | null;
  legacy: boolean;
  destination: DestinationType;
  targetId: string | null;
  /** "Event · Cross Over" */
  destinationLabel: string;
  /** Where a scan goes today. */
  destinationUrl: string;
  serviceId: string | null;
  serviceName: string | null;
  /** UTC instants; shown in the church's time zone. */
  activeFrom: string | null;
  expiresAt: string | null;
  timeZone: string;
  state: QrState;
  status: QrStatus;
  note: string;
  caption: string;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  rowVer: number;
  scans: { total: number; last30: number; lastAt: string | null };
};

export type QrTarget = { id: string; name: string; hint: string | null };

export type QrListResponse = {
  items: QrCode[];
  counts: Record<QrStatus, number>;
  /** Pick lists for the form: special events (from Services) and courses. */
  targets: { event: QrTarget[]; course: QrTarget[] };
  services: { id: string; name: string }[];
  /** What this person may do (PRD 5.8: manage, print, or see counts only). */
  can: { manage: boolean; print: boolean };
};

export type QrInput = {
  name: string;
  destination: DestinationType;
  targetId: string | null;
  serviceId: string | null;
  activeFrom: string | null;
  expiresAt: string | null;
  note: string;
  caption: string;
  /** Create only: save as a draft instead of switching it on. */
  draft?: boolean;
  /** Create only: register a code that is already printed (QR-7). */
  legacyUrl?: string | null;
};

export type QrDatesInput = { activeFrom: string | null; expiresAt: string | null; rowVer: number };

export type QrScanDay = { date: string; scans: number; inactive: number };
export type QrDetail = {
  code: QrCode;
  /** Last 60 church days, oldest first, zero days included (QR-6). */
  byDay: QrScanDay[];
  byService: { service: string; scans: number }[];
  /** Scans that met the inactive page. */
  inactiveTotal: number;
};

/** What the short address does at scan time (QR-3). */
export type QrResolve =
  | { outcome: "redirect"; url: string }
  | { outcome: "inactive"; reason: "not_started" | "expired" | "paused" | "draft" | "unknown"; startsAt: string | null; links: { label: string; url: string }[] };

export const PRINT_LAYOUTS = ["poster", "table_card", "bulletin", "sticker", "plain"] as const;
export type PrintLayout = (typeof PRINT_LAYOUTS)[number];
