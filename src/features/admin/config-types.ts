/** Wire shapes for the cell map and services managers (docs/API.md §8, PRD W-12, W-13). */

export const CELL_NAMES = ["Red", "Yellow", "Blue", "Green"] as const;
export type CellName = (typeof CELL_NAMES)[number];

/** One ZIP and how many form entries gave it. */
export type ZipRow = {
  zip: string;
  city: string | null;
  county: string | null;
  /** Every form entry with this ZIP. */
  entries: number;
  /** Entries this calendar year (church time). */
  thisYear: number;
  lastSeen: string | null;
};

export type CellMapResponse = {
  cells: { cell: CellName; zips: ZipRow[]; entries: number; thisYear: number }[];
  /** Greater Houston ZIPs that guests gave but no cell covers, most entries first (PRD W-11). */
  unmapped: ZipRow[];
  /** Entries with a ZIP outside Greater Houston, and entries with no ZIP at all. */
  outOfArea: number;
  noZip: number;
  rowVer: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type SetZipResponse = {
  zip: string;
  cell: CellName | null;
  from: CellName | null;
  /** Form entries whose cell group changed. */
  recalculated: number;
  rowVer: number;
};

export type ServiceKind = "weekly" | "special";

export type Service = {
  id: string;
  /** Shown on the guest form and stored on each entry. */
  name: string;
  /** Short label for charts. */
  shortName: string;
  kind: ServiceKind;
  /** Weekly: 0 = Sunday … 6 = Saturday, and the start time in church time ("09:30"). */
  day: number | null;
  time: string | null;
  /** Special events: the dates the form offers it (inclusive). Both null = offered until retired. */
  startsOn: string | null;
  endsOn: string | null;
  /** Uses the short guest form (PRD W-2). */
  shortForm: boolean;
  active: boolean;
  sortOrder: number;
  /** Form entries that name this service. A service with entries can be retired but not deleted. */
  entries: number;
  lastUsed: string | null;
  /** On the guest form today. */
  onForm: boolean;
  rowVer: number;
  updatedAt: string | null;
};

export type ServiceInput = {
  name: string;
  shortName: string;
  kind: ServiceKind;
  day: number | null;
  time: string | null;
  startsOn: string | null;
  endsOn: string | null;
  shortForm: boolean;
};

export type ServicesResponse = {
  items: Service[];
  /** What the guest form lists today, in order; the form always ends with "Other". */
  formToday: string[];
};
