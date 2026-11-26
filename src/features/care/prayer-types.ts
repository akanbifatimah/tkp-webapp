/**
 * Prayer Wall moderation types (M9 step 1; PRD 5.4 PR-1 to PR-12, OS-1, OS-2).
 * Categories follow the Figma member Prayer Wall (G4, 220:1441).
 */

export const PRAYER_CATEGORIES = ["Healing", "Family", "Work", "Guidance", "Thanksgiving", "Other"] as const;
export type PrayerCategory = (typeof PRAYER_CATEGORIES)[number];

/**
 * pending  = waiting for a moderator (hold-for-review mode, or flagged)
 * published = on the public wall
 * hidden   = taken off the wall automatically after enough reports (PR-5), waiting for review
 * removed  = taken down by a moderator; soft-deleted, purged after the set days (PR-11)
 */
export type PrayerStatus = "pending" | "published" | "hidden" | "removed";
export const PRAYER_STATUS_LABEL: Record<PrayerStatus, string> = {
  pending: "Waiting for review",
  published: "On the wall",
  hidden: "Hidden by reports",
  removed: "Removed",
};

/** Who posted, for abuse handling only (PR-7): never in a public answer. */
export type PosterKind = "member" | "guest" | "learner";

export type PrayerNote = { by: string; text: string; at: string };
export type PrayerReport = { reason: string; at: string };

export type PrayerPost = {
  id: string;
  text: string;
  category: PrayerCategory;
  /** What the wall shows: a first name, or "Anonymous". */
  displayName: string;
  anonymous: boolean;
  posterKind: PosterKind;
  status: PrayerStatus;
  createdAt: string;
  publishedAt: string | null;
  answered: boolean;
  /** Who marked it answered, for accountability (TKP, 2026-11-26): the poster, or a moderator by name. */
  answeredBy: { by: string; at: string } | null;
  prayed: number;
  reports: PrayerReport[];
  /** PR-9: words that may mean someone is in distress. The flag only; nothing else is stored. */
  distress: string[];
  notes: PrayerNote[];
  edited: { by: string; at: string; reason: string } | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  removedReason: string | null;
  /** Removed posts are deleted for good after this (PR-11). */
  purgeAt: string | null;
  rowVer: number;
};

export type CareResource = { label: string; phone: string };

export type PrayerFilter = "review" | "published" | "removed" | "all";

export type PrayerSettings = {
  /** PR-4. TKP chose "hold" (2026-11-26). */
  mode: "hold" | "publish";
  /** PR-5: reports that take a post off the wall until reviewed. */
  reportThreshold: number;
  /** PR-9: words and phrases that flag a post for a human. */
  distressWords: string[];
  /** PR-11: days a post stays on the wall; days a removed post is kept before it's deleted for good. */
  retentionDays: number;
  purgeDays: number;
  /** PR-9 care resources panel: phone numbers shown to someone whose request trips the care check (TKP, 2026-11-26). */
  careResources: CareResource[];
  rowVer: number;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type PrayerListResponse = {
  items: PrayerPost[];
  counts: { review: number; pending: number; hidden: number; distress: number; published: number; removed: number; all: number };
  /** posted = new requests in the last 7 days; prayed = "Pray" taps on everything now on the wall. */
  week: { posted: number; prayed: number };
  settings: PrayerSettings;
  can: { moderate: boolean; settings: boolean; identity: boolean };
};

/** PR-7: who posted, shown only to moderators and system admins, and logged when looked at. */
export type PosterIdentity = { kind: PosterKind; name: string | null; email: string | null; device: string; posts: number; removed: number };

/** Private requests to the prayer team (PR-3), never on the wall. */
export type PrivateStatus = "new" | "praying" | "follow_up" | "closed";
export const PRIVATE_STATUS_LABEL: Record<PrivateStatus, string> = {
  new: "New",
  praying: "Being prayed for",
  follow_up: "Needs a pastor's follow-up",
  closed: "Closed",
};

export type PrivateRequest = {
  id: string;
  text: string;
  category: PrayerCategory;
  name: string | null;
  /** Only if they chose to leave it, so someone can reach them. */
  contact: string | null;
  posterKind: PosterKind;
  createdAt: string;
  status: PrivateStatus;
  distress: string[];
  /** Team members who have prayed over it (Figma: lifted by the Pastor and the Intercessory Prayer Secretaries). */
  prayedBy: { name: string; at: string }[];
  notes: PrayerNote[];
  rowVer: number;
};

export type PrivateListResponse = {
  items: PrivateRequest[];
  counts: Record<PrivateStatus | "all", number>;
};
