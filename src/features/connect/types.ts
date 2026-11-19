import type { JourneyStatus, Method, MultiKey, Phase, StepKey, Team } from "./model";

/** Wire shapes for /connect/* (docs/API.md §3, after TKP Connect API-C1…C6). */

export type ConnectMember = { id: string; fullName: string; isTeamAdmin: boolean };

export type QueueRow = {
  connectId: number;
  guestId: number;
  serviceDate: string;
  serviceType: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  cellGroup: string;
  clockStartAt: string;
  status: JourneyStatus;
  phase: Phase;
  weekNo: number;
  coMemberId: string | null;
  coName: string | null;
  itMemberId: string | null;
  itName: string | null;
  coContacted: boolean;
  coAttempts: number;
  coLastCallOutcome: string | null;
  coNextAction: string | null;
  itContacted: boolean;
  done: { p1: number; p2: number; p3: number };
  overdue48: boolean;
  returned2ndVisit: boolean;
};

export type QueueResponse = {
  me: { id: string; fullName: string };
  team: Team;
  teams: Team[];
  /** "YYYY-MM-DD" or "all". */
  date: string;
  dates: string[];
  seesWholeTeam: boolean;
  canAssign: boolean;
  members: ConnectMember[];
  totalGuests: number;
  rows: QueueRow[];
  truncated: boolean;
};

export type AssignResponse = Pick<QueueRow, "connectId" | "coMemberId" | "coName" | "itMemberId" | "itName">;

export type ChecklistEntry = { at: string; byId: string; by: string } | null;

export type GuestState = {
  coWantsMembership: string | null;
  coNoReason: string | null;
  coNoOtherDetails: string | null;
  coNextAction: string | null;
  itMembership: string | null;
  itWorkforce: string | null;
  itDepartmentId: number | null;
  itLifeGroup: string | null;
  multi: Record<MultiKey, boolean>;
  returned2ndVisit: boolean;
  returnVisitDate: string | null;
};

export type ConnectGuest = Omit<QueueRow, "done"> & {
  closedReason: string | null;
  state: GuestState;
  checklist: Record<StepKey, ChecklistEntry>;
  coNote: { savedAt: string; by: string; method: string; outcome: string | null; note: string | null } | null;
  legacyNotes: { text: string; by: string | null }[];
  returnDates: string[];
  rowVer: string;
};

export type GuestResponse = {
  me: { id: string; fullName: string };
  team: Team;
  teams: Team[];
  canSave: boolean;
  guest: ConnectGuest;
  /** The caller's own Active guests on the same service date, in queue order (Previous / Next). */
  myList: number[];
};

export type SaveLogBody = {
  connectId: number;
  team: Team;
  clientRequestId: string;
  rowVer: string;
  method: Method;
  callOutcome: string | null;
  note: string | null;
  stepsTicked: StepKey[];
  stepsUnticked: StepKey[];
  // Church Office
  wantsMembership?: string | null;
  noReason?: string | null;
  noOtherDetails?: string | null;
  sopStep?: string | null;
  nextAction?: string | null;
  // Integration
  phase?: Phase;
  membership?: string | null;
  workforce?: string | null;
  departmentId?: number | null;
  lifeGroup?: string | null;
  multi?: Record<MultiKey, boolean>;
  returned2ndVisit?: boolean;
  returnVisitDate?: string | null;
};

export type SaveLogResponse = { logId: number; duplicate: boolean; status: JourneyStatus; phase: Phase; rowVer: string };

export type LogRow = {
  logId: number;
  connectId: number;
  team: Team;
  authorId: string;
  author: string;
  savedAt: string;
  guest: string;
  serviceDate: string;
  method: Method;
  callOutcome: string | null;
  sopStep: string | null;
  wantsMembership: string | null;
  noReason: string | null;
  nextAction: string | null;
  phase: Phase | null;
  membership: string | null;
  workforce: string | null;
  department: string | null;
  lifeGroup: string | null;
  spiritual: string[];
  other: string[];
  note: string | null;
  returned2ndVisit: boolean | null;
  returnVisitDate: string | null;
  stepsTicked: StepKey[];
  stepsUnticked: StepKey[];
};

export type LogsResponse = { team: Team; all: boolean; logs: LogRow[] };

export type Department = { id: number; name: string };

/** View entry (TKP Connect API-W4): the form exactly as submitted; blank = null. */
export type GuestEntry = {
  id: number;
  entriesThatDay: number;
  submittedAt: string;
  serviceDate: string;
  serviceType: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  gender: string | null;
  maritalStatus: string | null;
  dob: string | null;
  ageBracket: string | null;
  nationality: string | null;
  address: string | null;
  apt: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  bestTimeToVisit: string | null;
  howHeard: string | null;
  howHeardOther: string | null;
  whoInvitedYou: string | null;
  invitingCellGroup: string | null;
  willComeAgain: string | null;
  giveThoughtToMembership: string | null;
  likeToBecomeMember: string | null;
  likelyNeverComeAgain: string | null;
  ifYesWhy: string | null;
  prayerRequest: string | null;
  comments: string | null;
  ratings: Record<string, number | null>;
  cellGroup: string;
  visitNumber: number;
  membershipIntent?: string | null;
  /** The person's Connect journey, for ✎ Log follow-up. */
  connectId?: number | null;
};

/* ================================================================= planned tabs (M5 · draft) */

/** Guest Track: which of the three Guest Track texts is due (TKP Connect UI-C4, scripts gt-48h / gt-return2 / gt-return3). */
export type GuestTrackStage = "48h" | "invite2" | "awaiting" | "invite3";

export type GuestTrackRow = {
  connectId: number;
  guestId: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  serviceDate: string;
  serviceType: string;
  clockStartAt: string;
  daysSince: number;
  stage: GuestTrackStage;
  returnVisitDate: string | null;
  coMemberId: string | null;
  coName: string | null;
  itMemberId: string | null;
  itName: string | null;
};

export type GuestTrackResponse = { me: { id: string; fullName: string }; seesAll: boolean; rows: GuestTrackRow[] };

/** Guest journey (UI-C5): one guest's whole journey. */
export type JourneyEvent = { at: string; kind: "form" | "contact" | "tick" | "phase" | "return" | "closed" | "completed"; text: string; by: string | null };

export type JourneyResponse = {
  me: { id: string; fullName: string };
  guest: Omit<ConnectGuest, "rowVer" | "returnDates">;
  visits: { guestId: number; serviceDate: string; serviceType: string; visitNumber: number; submittedAt: string }[];
  department: string | null;
  howHeard: string | null;
  logs: LogRow[];
  events: JourneyEvent[];
};

/** Team metrics (UI-C7, doc 01 §8.2): DRAFT definitions, to confirm (TKP Connect Q10–Q12). */
export type Ratio = { done: number; due: number };
export type MetricsResponse = {
  period: { key: string; label: string; start: string; end: string };
  cohort: number;
  kpis: { key: string; label: string; deadline: string; ratio: Ratio }[];
  funnel: { label: string; n: number }[];
  contact48: Ratio;
  medianHoursToFirstContact: number | null;
  priorMedianHoursToFirstContact: number | null;
  return30: Ratio;
  cell60: Ratio;
  integration90: Ratio;
  completedThisYear: number;
  lossByStage: { stage: string; closed: number }[];
  retention: { month: string; guests: number; active: number; completed: number; closed: number }[];
  integrationByMonth: { month: string; total: number; interested: number; notInterested: number; undecided: number; notYetAsked: number }[];
  workload: { team: Team; memberId: string; name: string; open: number; overdue: number; contact48: Ratio; logged30: number }[];
};
