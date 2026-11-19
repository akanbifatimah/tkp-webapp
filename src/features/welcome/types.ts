/** Wire shapes for /welcome/* (docs/API.md §4, after TKP Connect API-W1…W4). */

export type Scope = "service" | "mtd" | "ytd";

/** KPI counts for one period (TKP Connect doc 01 §8.1). */
export type WelcomeKpis = {
  guests: number;
  female: number;
  male: number;
  youngAdults: number;
  adults: number;
  membershipYes: number;
  membershipUndecided: number;
  willComeAgainYes: number;
  referrals: number;
  notOnCellMap: number;
  repeatGuests: number;
  /** Mean of each guest's answered ratings (0–10); null when nobody rated. */
  avgRating: number | null;
};

export type CellCounts = Partial<Record<"Red" | "Yellow" | "Blue" | "Green" | "N/A", number>>;

export type OverviewResponse = {
  meta: {
    date: string;
    scope: Scope;
    currentStart: string;
    currentEnd: string;
    priorStart: string | null;
    priorEnd: string | null;
  };
  kpis: { current: WelcomeKpis; prior: WelcomeKpis };
  cells: { current: CellCounts; prior: CellCounts };
  /** service: last 16 service dates · mtd: this month's dates · ytd: one row per month (date = the 1st). */
  chart: { date: string; type: string; guests: number }[];
  /** Every service date with guests, newest first. */
  dates: string[];
};

export type GuestItem = {
  id: number;
  serviceDate: string;
  serviceType: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  gender: string | null;
  ageBracket: string | null;
  city: string | null;
  zip: string | null;
  cellGroup: string;
  howHeard: string | null;
  membershipIntent: string | null;
  visitNumber: number;
  connectId: number | null;
};

export type GuestSearch = { phone?: string; name?: string; date?: string; cell?: string; type?: string; member?: string };
export type GuestSearchResponse = { items: GuestItem[]; total: number; truncated: boolean };

/** The guest record drawer (API-W3). No prayer request, ever (BR-30). */
export type GuestRecord = GuestItem & {
  middleName: string | null;
  email: string | null;
  address: string | null;
  apt: string | null;
  state: string | null;
  maritalStatus: string | null;
  ageGroup: string | null;
  howHeardOther: string | null;
  invitedBy: string | null;
  invitingCellGroup: string | null;
  willComeAgain: string | null;
  bestTimeToVisit: string | null;
  comments: string | null;
  ratings: Record<string, number | null>;
  followUpNotes: { by: string | null; text: string }[];
  entriesWithPhone: number;
};
