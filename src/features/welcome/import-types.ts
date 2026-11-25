/**
 * Welcome › Import (PRD W-16, WT-5, WT-7; the shared import engine also used by
 * EV-23 and P-4). Past guest entries and follow-up tracker records come in
 * from .xlsx or .csv: upload, columns and settings, preview and fix, confirm.
 * An import is a batch: it can be undone for 30 days.
 */

export type ImportKind = "guests" | "followups";
export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  guests: "Past guest entries",
  followups: "Follow-up tracker records",
};

export type FieldType = "text" | "date" | "datetime" | "phone" | "email" | "choice" | "rating";
export type ImportField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** The column name in the TKP Hub standard layout (the template), when it differs from the label. */
  header?: string;
  options?: readonly string[];
  /** Header names that map to this field, compared without case, spaces or punctuation. */
  synonyms: readonly string[];
};

export const AGE_BRACKETS = ["Below 16", "16-20", "21-25", "26-30", "31-35", "36-40", "41-45", "46-50", "51-65", "Above 65"] as const;
const RATING = (key: string, label: string, ...more: string[]): ImportField => ({
  key: `rating.${key}`,
  label: `Rating: ${label}`,
  type: "rating",
  synonyms: [label, `${label} rating`, `rate ${label}`, `rating ${label}`, ...more],
});

export const IMPORT_FIELDS: Record<ImportKind, readonly ImportField[]> = {
  guests: [
    { key: "serviceDate", label: "Service date", type: "date", required: true, synonyms: ["service date", "date of service", "date", "visit date", "date attended", "sunday date"] },
    { key: "serviceType", label: "Service", type: "text", synonyms: ["service", "service type", "which service", "service attended", "meeting"] },
    { key: "firstName", label: "First name", type: "text", synonyms: ["first name", "firstname", "given name", "first", "forename"] },
    { key: "lastName", label: "Last name", type: "text", synonyms: ["last name", "lastname", "surname", "family name", "last"] },
    { key: "phone", label: "Phone", type: "phone", synonyms: ["phone", "phone number", "mobile", "cell", "cell phone", "telephone", "tel", "mobile number"] },
    { key: "email", label: "Email", type: "email", synonyms: ["email", "e-mail", "email address", "mail"] },
    { key: "gender", label: "Gender", type: "choice", options: ["Male", "Female"], synonyms: ["gender", "sex"] },
    { key: "maritalStatus", label: "Marital status", type: "choice", options: ["Single", "Married", "Divorced", "Widowed"], synonyms: ["marital status", "marital", "married"] },
    { key: "ageBracket", label: "Age range", type: "choice", options: AGE_BRACKETS, synonyms: ["age", "age range", "age bracket", "age group"] },
    { key: "address", label: "Address", type: "text", synonyms: ["address", "street", "street address", "address line 1"] },
    { key: "city", label: "City", type: "text", synonyms: ["city", "town"] },
    { key: "state", label: "State", type: "text", synonyms: ["state", "province", "region"] },
    { key: "zip", label: "ZIP", type: "text", synonyms: ["zip", "zip code", "zipcode", "postal code", "postcode"] },
    { key: "country", label: "Country", type: "text", synonyms: ["country"] },
    { key: "howHeard", label: "How they heard about us", type: "text", synonyms: ["how did you hear about us", "how heard", "heard about us", "source", "how did you hear"] },
    { key: "whoInvitedYou", label: "Who invited them", type: "text", synonyms: ["who invited you", "invited by", "inviter"] },
    { key: "willComeAgain", label: "Will come again", type: "choice", options: ["Yes", "No", "Maybe"], synonyms: ["will you come again", "will come again", "come again", "return"] },
    { key: "likeToBecomeMember", label: "Membership", header: "Would like to become a member", type: "choice", options: ["Yes", "No", "Undecided"], synonyms: ["would like to become a member", "would you like to become a member", "become a member", "membership", "member"] },
    { key: "prayerRequest", label: "Prayer request", type: "text", synonyms: ["prayer request", "prayer", "prayer requests"] },
    { key: "comments", label: "Comments", type: "text", synonyms: ["comments", "comment", "notes", "feedback"] },
    RATING("Music", "Music"),
    RATING("Preaching", "Preaching", "sermon"),
    RATING("Comfort", "Comfort", "seating"),
    RATING("Hospitality", "Hospitality", "ushers"),
    RATING("ChurchEnvironment", "Church environment", "environment"),
    RATING("ThePeople", "The people", "people"),
    RATING("Parking", "Parking"),
    RATING("Traffic", "Traffic"),
  ],
  followups: [
    { key: "date", label: "Date and time", type: "datetime", required: true, synonyms: ["date", "date of call", "call date", "contact date", "date contacted", "timestamp", "when"] },
    { key: "phone", label: "Guest phone", type: "phone", synonyms: ["phone", "guest phone", "mobile", "phone number", "cell"] },
    { key: "email", label: "Guest email", type: "email", synonyms: ["email", "guest email", "e-mail"] },
    { key: "guestName", label: "Guest name (shown, never matched)", header: "Guest name", type: "text", synonyms: ["guest", "guest name", "name", "full name"] },
    { key: "team", label: "Team", type: "choice", options: ["Church office", "Integration"], synonyms: ["team", "department", "unit"] },
    { key: "caller", label: "Caller", type: "text", synonyms: ["caller", "called by", "staff", "volunteer", "follow up by", "contacted by"] },
    { key: "method", label: "Method", type: "choice", options: ["Phone Call", "SMS", "WhatsApp Text", "WhatsApp Call", "In Person"], synonyms: ["method", "contact method", "how contacted", "channel"] },
    { key: "callOutcome", label: "Outcome", type: "text", synonyms: ["outcome", "result", "call outcome", "status"] },
    { key: "wantsMembership", label: "Wants membership", type: "choice", options: ["Yes", "No", "Undecided"], synonyms: ["wants membership", "membership", "interested in membership"] },
    { key: "lifeGroup", label: "Life group", type: "text", synonyms: ["life group", "cell group", "cell"] },
    { key: "note", label: "Note", type: "text", synonyms: ["note", "notes", "comment", "comments", "call notes", "summary"] },
  ],
};

export const IMPORT_LIMITS = { maxBytes: 10 * 1024 * 1024, maxRows: 5000, undoDays: 30, stagedHours: 24 } as const;

export type ImportSettings = {
  /** 1-based row that holds the column names. */
  headerRow: number;
  /** How to read 3/4/2025: March 4 (MDY, US) or 3 April (DMY). */
  dateOrder: "MDY" | "DMY";
  /** Columns that match no field: add them to the comments or note, or leave them out. */
  unmapped: "notes" | "ignore";
  /** add: new rows only. update: new rows, and change the ones that already exist. */
  mode: "add" | "update";
  /** Guests: the service when the file has none (or none that matches). */
  defaultService: string | null;
  /** Guests: new people from the file. history = closed as imported; start = follow-up starts for visits in the last 14 days. */
  followUp: "history" | "start";
  /** Follow-up records: the team when the file has none. */
  defaultTeam: "church_office" | "integration";
};

export type ImportColumn = { index: number; header: string; samples: string[]; field: string | null; confidence: number };
export type RowStatus = "new" | "update" | "unchanged" | "error";
export type ImportRowIssue = { field: string | null; message: string };
export type ImportPreviewRow = {
  /** The row number in the file (1-based, as Excel shows it). */
  rowNo: number;
  status: RowStatus;
  /** The values as they will be saved, by field key. */
  values: Record<string, string | null>;
  /** The cells exactly as in the file, for the error file. */
  cells: string[];
  errors: ImportRowIssue[];
  warnings: string[];
  /** Who or what it matched, in words. */
  match: string | null;
  changes: { field: string; from: string | null; to: string | null }[];
  /** Fields fixed by hand on the preview. */
  fixed: string[];
};

export type ImportStatus = "draft" | "committed" | "undone" | "discarded";
export type ImportCounts = { total: number; new: number; update: number; unchanged: number; error: number; warnings: number };
export type ImportResult = { added: number; updated: number; unchanged: number; failed: number; newGuests: number };

export type ImportSummary = {
  id: string;
  kind: ImportKind;
  fileName: string;
  fileSize: number;
  status: ImportStatus;
  createdAt: string;
  createdBy: string | null;
  counts: ImportCounts;
  result: ImportResult | null;
  committedAt: string | null;
  committedBy: string | null;
  undoneAt: string | null;
  undoneBy: string | null;
  /** Undo is possible until then (30 days after commit). */
  undoUntil: string | null;
  /** A staged draft is deleted after this. */
  expiresAt: string;
};

export type ImportJob = ImportSummary & {
  sheets: { name: string; rows: number }[];
  sheet: string;
  columns: ImportColumn[];
  /** The file's column names, for the error file. */
  fileHeaders: string[];
  settings: ImportSettings;
  rows: ImportPreviewRow[];
  /** Service names for the settings and for fixing rows. */
  services: string[];
  mine: boolean;
};

export type ImportListResponse = { items: ImportSummary[]; can: { import: boolean; followups: boolean } };

export type ImportPatch = {
  sheet?: string;
  mapping?: Record<string, string | null>;
  settings?: Partial<ImportSettings>;
  fixes?: { rowNo: number; field: string; value: string | null }[];
};
