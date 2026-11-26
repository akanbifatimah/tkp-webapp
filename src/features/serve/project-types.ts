/**
 * Projects (M9 step 2), following the Figma member screens (TKP, 2026-11-26):
 * PJ1 Projects (241:5344), PJ3 Project Detail (241:5571), PJ4 Position Detail
 * (241:5692) and PJ5 Create a Project Post (245:7719). Members post projects;
 * the pastoral team reviews them within 3 days; people contact the coordinator.
 */

/** Figma PJ1 tags. */
export const MINISTRIES = ["Media", "Music", "Education", "Outreach", "Children", "Hospitality", "Prayer", "Facilities", "Other"] as const;
export type Ministry = (typeof MINISTRIES)[number];

/** Figma PJ5 "Format". */
export const FORMATS = ["In person (Katy)", "Remote", "Hybrid"] as const;
export type PositionFormat = (typeof FORMATS)[number];

/**
 * submitted = waiting for the pastoral team ("Reviewed by the pastoral team within 3 days")
 * changes   = sent back to the member with a message
 * live      = on the Projects page in the app
 * declined  = not published, with a reason
 * closed    = finished or taken down
 */
export type ProjectStatus = "submitted" | "changes" | "live" | "declined" | "closed";
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  submitted: "Waiting for review",
  changes: "Changes requested",
  live: "Live",
  declined: "Declined",
  closed: "Closed",
};

/** open → filled (the lead says so) or closed (by hand, or its closing date passed). */
export type PositionState = "open" | "filled" | "closed";

export type Upload = { id: string; name: string; size: number; type: string };

export type PositionInput = {
  title: string;
  /** One per line; the app shows them as bullets (Figma PJ4). */
  responsibilities: string;
  skills: string[];
  /** Free text, as in the Figma: "A few hours a week", "Sundays (8:30 am – 12:30 pm)". */
  commitment: string;
  format: PositionFormat;
  openings: number;
  closingDate: string | null;
};

export type Position = PositionInput & {
  id: string;
  state: PositionState;
  /** Closing within 7 days (Figma "Closing soon (5 days left)"). */
  closingSoon: boolean;
  daysLeft: number | null;
  /** Taps on Call, WhatsApp or Email in the app: counted, never who. */
  contactTaps: number;
};

export type ProjectContact = {
  /** Figma PJ3 "Grace & Emmanuel K. · Project Coordinators · Media Ministry". */
  coordinators: string;
  role: string;
  phone: string;
  whatsapp: boolean;
  email: string;
  howToApply: string;
};

export type ProjectInput = {
  name: string;
  description: string;
  ministry: Ministry;
  startDate: string;
  targetFinish: string | null;
  cover: Upload | null;
  positions: PositionInput[];
  contact: ProjectContact;
};

export type HistoryItem = { at: string; by: string; action: string; note: string | null };

export type ProjectSummary = {
  id: string;
  name: string;
  ministry: Ministry;
  status: ProjectStatus;
  featured: boolean;
  postedBy: string;
  submittedAt: string;
  /** Submitted + 3 days ("within 3 days"). */
  reviewDueAt: string;
  overdue: boolean;
  openPositions: number;
  openSpots: number;
  contactTaps: number;
  cover: Upload | null;
  lead: string | null;
};

export type ProjectsResponse = {
  items: ProjectSummary[];
  counts: Record<ProjectStatus, number> & { overdue: number };
  stats: { openPositions: number; openSpots: number; contactTaps: number };
  scope: "all" | "mine";
  can: { review: boolean; create: boolean };
};

export type ProjectDetail = Omit<ProjectInput, "positions"> & {
  id: string;
  status: ProjectStatus;
  featured: boolean;
  postedBy: { name: string; email: string | null; member: boolean };
  submittedAt: string;
  reviewDueAt: string;
  overdue: boolean;
  reviewMessage: string | null;
  declineReason: string | null;
  lead: { id: string; name: string } | null;
  positions: Position[];
  /** What must be fixed before it can go live. Approve stays off until this is empty. */
  problems: string[];
  history: HistoryItem[];
  updatedAt: string;
  rowVer: number;
  can: { review: boolean; edit: boolean; positions: boolean };
  options: { leads: { id: string; name: string }[] };
};
