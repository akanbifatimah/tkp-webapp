/**
 * Welcome › Duplicates (PRD W-14, A-1, 8.1). One person can end up with two
 * records when they fill in the form again and the match was missed. Records
 * are matched by phone or email only, never by name.
 */

export type MatchReason = { kind: "phone" | "email"; value: string };

/** The contact and address fields staff choose between when merging. */
export const MERGE_FIELDS = ["firstName", "lastName", "phone", "email", "address", "city", "zip"] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export const MERGE_FIELD_LABEL: Record<MergeField, string> = {
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  city: "City",
  zip: "ZIP",
};

/** One record in a group: a person with their own visits and follow-up journey. */
export type DuplicatePerson = {
  connectId: number;
  name: string;
  fields: Record<MergeField, string | null>;
  firstVisit: string;
  lastVisit: string;
  visits: number;
  serviceTypes: string[];
  journey: {
    status: "Active" | "Completed" | "Closed";
    closedReason: string | null;
    phase: 1 | 2 | 3;
    churchOffice: string | null;
    integration: string | null;
    /** Steps ticked on the 12-week checklist. */
    steps: number;
  };
  logs: number;
  rowVer: number;
};

export type DuplicateGroup = {
  /** The connectIds, sorted and joined with "-". */
  id: string;
  reasons: MatchReason[];
  /** True when the names are not the same: check before merging. */
  namesDiffer: boolean;
  people: DuplicatePerson[];
  /** The journey the screen suggests keeping: the one furthest along. */
  suggestedJourney: number;
  /** The newest record's first visit, for sorting. */
  newest: string;
};

export type DismissedPair = {
  key: string;
  ids: [number, number];
  names: [string, string];
  reasons: MatchReason[];
  by: string | null;
  at: string;
  note: string | null;
};

/** A merge, newest first. Undo puts every record back as it was (TKP, 2026-11-25). */
export type MergeHistory = {
  id: string;
  at: string;
  by: string | null;
  keptId: number;
  keptName: string;
  merged: { connectId: number; name: string }[];
  undoneAt: string | null;
  undoneBy: string | null;
  /** Why undo is not possible now, e.g. the kept record was merged again since. */
  blocked: string | null;
};

export type DuplicatesResponse = {
  groups: DuplicateGroup[];
  dismissed: DismissedPair[];
  merges: MergeHistory[];
  can: { merge: boolean };
};

export type MergeInput = {
  keepId: number;
  mergeIds: number[];
  /** Whose follow-up journey to keep. */
  journeyFrom: number;
  /** For each field that differs, whose value to keep (a connectId). */
  fields: Partial<Record<MergeField, number>>;
  /** connectId → rowVer, as the screen saw them. */
  rowVers: Record<string, number>;
};

export type MergeResult = { mergeId: string; kept: DuplicatePerson; merged: number[] };

export type UnmergeResult = {
  restored: number[];
  /** True when follow-up was saved on the kept record after the merge: it keeps its current journey. */
  journeyKept: boolean;
};
