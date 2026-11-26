/**
 * Grow (Learn admin) types, shared by the screens and the mock server
 * (docs/API.md §13; PRD LMS-1 to LMS-8, WEB-9 to WEB-11, WEB-13, WEB-17, RG-1, RG-4).
 * The admin screens say "class" (Figma); the PRD and the API say "course".
 */

/** The discipleship pathway (Figma Grow screens and the drop-off report). */
export const PATHWAY = [
  { step: 1, label: "Salvation and Welcome" },
  { step: 2, label: "New Believers" },
  { step: 3, label: "Water Baptism" },
  { step: 4, label: "Growth" },
  { step: 5, label: "Doctrinal Foundations" },
  { step: 6, label: "School of Disciples" },
  { step: 7, label: "School of Ministry" },
] as const;
export type PathwayStep = (typeof PATHWAY)[number]["step"];
export const stepLabel = (s: number | null) => (s ? (PATHWAY.find((p) => p.step === s)?.label ?? null) : null);

/** LMS-4. */
export type CourseFormat = "live" | "recorded" | "reading" | "mixed";
export const FORMAT_LABEL: Record<CourseFormat, string> = {
  live: "Live",
  recorded: "Recorded",
  reading: "Reading",
  mixed: "Mixed",
};
export const FORMAT_HINT: Record<CourseFormat, string> = {
  live: "Meets at a set day and time, online or in person.",
  recorded: "Self-paced videos. No meeting times.",
  reading: "Self-paced reading and handouts.",
  mixed: "Live meetings plus recorded or reading sessions.",
};
export const hasMeetings = (f: CourseFormat) => f === "live" || f === "mixed";

/** S-2: members-only courses are hidden from External Students. */
export type Audience = "everyone" | "members";

/** What a class needs to issue its certificate (Figma Create a class §4; LMS-8). */
export type AssessmentRule = "none" | "final" | "every";
export const ASSESSMENT_RULE_LABEL: Record<AssessmentRule, string> = {
  none: "No assessment",
  final: "Pass the final assessment",
  every: "Pass every session's assessment",
};

/**
 * Stored state, plus status worked out from the dates when read:
 * draft → open (published, before the first session) → in session → completed.
 */
export type CourseState = "draft" | "published" | "archived";
export type CourseStatus = "draft" | "open" | "in_session" | "completed" | "archived";
export const STATUS_LABEL: Record<CourseStatus, string> = {
  draft: "Draft",
  open: "Open",
  in_session: "In session",
  completed: "Completed",
  archived: "Archived",
};

export type Person = { id: string; name: string };

export type CourseSchedule = {
  /** 0 = Sunday … 6. Null for self-paced formats. */
  day: number | null;
  /** "HH:MM" church time. */
  time: string | null;
  where: "online" | "in_person";
  /** Room for in-person classes ("Chapel"). */
  place: string | null;
  /** First session date, church calendar. Null while the term isn't set. */
  startsOn: string | null;
  sessionCount: number;
  /** Minutes per meeting. */
  lengthMin: number;
};

export type CourseInput = {
  title: string;
  description: string;
  step: number | null;
  format: CourseFormat;
  audience: Audience;
  /**
   * Pathway steps a person must have finished first (LMS-3). A step, not one
   * class, because each class is a new cohort every term.
   */
  prerequisiteSteps: number[];
  /** Course authors who teach it (TKP: the teacher is an assigned Course Author). */
  teacherIds: string[];
  /** Graders assigned on top of the teachers. */
  graderIds: string[];
  schedule: CourseSchedule;
  /** Null: no limit. */
  seats: number | null;
  waitlist: boolean;
  completion: { attendance: number; assessment: AssessmentRule };
  welcomeNote: string;
};

export type PublishCheck = { id: string; label: string; ok: boolean };

export type CourseSummary = {
  id: string;
  title: string;
  step: number | null;
  format: CourseFormat;
  audience: Audience;
  status: CourseStatus;
  registration: "open" | "closed";
  teachers: Person[];
  /** "Sundays · 11:45 am · Online", "Self-paced". */
  scheduleLabel: string;
  term: string | null;
  enrolled: number;
  waitlisted: number;
  seats: number | null;
  sessions: { total: number; published: number };
  /** Next meeting still ahead, ISO. */
  nextSessionAt: string | null;
  rowVer: number;
};

export type CoursesResponse = {
  items: CourseSummary[];
  /** Only the classes this person may see (authors and graders: their own). */
  scope: "all" | "assigned";
  can: { manage: boolean };
  /** For the class form. */
  options: { teachers: Person[]; graders: Person[] };
};

export type Upload = { id: string; name: string; size: number; type: string };
export type SessionVideo = { kind: "file"; file: Upload } | { kind: "link"; url: string };

export type SessionInput = {
  title: string;
  /** Position in the class, 1-based. Others move to make room. */
  number: number;
  kind: "live" | "recorded" | "reading";
  /** Live sessions: when it meets (ISO). */
  startsAt: string | null;
  /** Live online sessions: the join link, shown 15 minutes before the start (LMS-6). */
  joinUrl: string | null;
  durationMin: number | null;
  speaker: string;
  summary: string;
  video: SessionVideo | null;
  scripture: string;
  handouts: Upload[];
  takeaways: string[];
};

export type Session = SessionInput & {
  id: string;
  courseId: string;
  state: "draft" | "published";
  publishedAt: string | null;
  /** Learners who opened it (RG-1: an edit to a live session asks who should see it). */
  opened: number;
  /** Raised each time a published session is changed. */
  version: number;
  /** Empty sessions can't be published (RG-1). */
  empty: boolean;
  /** Live sessions that have met: how attendance stands. */
  attendance: { state: "not_started" | "draft" | "saved"; rate: number | null; due: boolean } | null;
  rowVer: number;
};

export type CourseDetail = CourseInput & {
  id: string;
  state: CourseState;
  status: CourseStatus;
  registration: "open" | "closed";
  term: string | null;
  scheduleLabel: string;
  teachers: Person[];
  graders: Person[];
  sessions: Session[];
  enrolled: number;
  waitlisted: number;
  /** Average share of published sessions each enrolled learner has opened, 0–100. */
  progress: number;
  resources: Upload[];
  checks: PublishCheck[];
  assessments: Assessment[];
  createdBy: string | null;
  createdAt: string;
  publishedAt: string | null;
  rowVer: number;
  can: { manage: boolean; author: boolean; export: boolean };
  options: CoursesResponse["options"];
};

export type EnrolmentStatus = "enrolled" | "waitlisted" | "withdrawn" | "completed";
export type Enrolment = {
  id: string;
  personId: string;
  name: string;
  email: string;
  /** External Student: a learner who isn't a church member (PRD U3). */
  learner: boolean;
  status: EnrolmentStatus;
  enrolledAt: string;
  /** Waitlist order, 1 = next in line. */
  position: number | null;
  /** Published sessions opened. */
  opened: number;
  /** Sessions marked Joined or Recording. */
  attended: number;
  /** Prerequisite waived by the Registrar, with the reason. */
  waived: string | null;
  withdrawnReason: string | null;
};

export type RosterResponse = {
  courseId: string;
  title: string;
  seats: number | null;
  publishedSessions: number;
  items: Enrolment[];
  can: { manage: boolean; export: boolean };
};

export type PersonHit = { id: string; name: string; email: string; learner: boolean; enrolled: boolean; missing: string[] };

export type GrowOverview = {
  term: { label: string; week: number };
  tiles: { enrolled: number; waitlisted: number; running: number; sessionsThisWeek: number; joinedThisWeek: number };
  attention: { id: string; kind: "unpublished" | "seats" | "draft" | "full" | "attendance" | "assessment" | "review"; title: string; detail: string; courseId: string; action: string; to?: string }[];
  week: { courseId: string; sessionId: string; title: string; sessionTitle: string; at: string; where: string; enrolled: number; teachers: string[] }[];
  can: { manage: boolean };
};

/* ======================================================= M8 step 2: attendance */

/** Figma 135:24429 "Mark attendance". Joined and Recording both count as attended. */
export type Mark = "joined" | "recording" | "missed";
export const MARK_LABEL: Record<Mark, string> = { joined: "Joined", recording: "Recording", missed: "Missed" };
/** Days a person marked Missed has to watch the recording (Figma "Pastoral Discipleship Grace Period"). */
export const GRACE_DAYS = 7;

export type AttendanceRow = {
  enrolmentId: string;
  name: string;
  /** What is saved (or, before any save, null). */
  mark: Mark | null;
  /** What the join log suggests. */
  suggested: Mark;
  /** "Joined 9:28 am · Full duration (58 min)", "No log detected". */
  log: string;
  /** Joined but only briefly, or similar: worth a second look. */
  flag: string | null;
  /** Saved as Missed, then watched the recording within the grace period: counted automatically. */
  auto: boolean;
};

export type AttendanceSheet = {
  sessionId: string;
  courseId: string;
  courseTitle: string;
  sessionTitle: string;
  number: number;
  startsAt: string;
  lengthMin: number;
  state: "not_started" | "draft" | "saved";
  savedAt: string | null;
  savedBy: string | null;
  /** Session end + GRACE_DAYS. After it, only the Registrar can change marks, with a reason. */
  graceEndsAt: string;
  locked: boolean;
  rows: AttendanceRow[];
  can: { edit: boolean; override: boolean };
  rowVer: number;
};

export type AttendanceInput = { marks: Record<string, Mark | null>; final: boolean; rowVer: number; reason?: string };

/* ====================================================== M8 step 2: assessments */

/** Figma 135:23449 "Assessment Builder": the three response types. */
export type QuestionKind = "short" | "choice" | "scale";
export const QUESTION_LABEL: Record<QuestionKind, string> = { short: "Short reflection", choice: "Multiple choice", scale: "Spiritual check-in" };
export const RESPONSE_LABEL: Record<QuestionKind, string> = { short: "Short answer", choice: "Multiple choice", scale: "Check-in scale" };
export const SCALE = ["Struggling", "Okay", "Steady", "Growing", "Thriving"] as const;

export type Question = { id: string; kind: QuestionKind; prompt: string; required: boolean; options: string[] };

export type AssessmentInput = {
  title: string;
  /** Opens when this session ends (1-based). Self-paced: when each person finishes it. */
  afterSession: number;
  /** Days it stays open after it opens. */
  windowDays: number;
  /** Counts for the certificate when the class needs "the final assessment". */
  final: boolean;
  questions: Question[];
};

export type AssessmentStatus = "draft" | "scheduled" | "open" | "closed";
export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = { draft: "Draft", scheduled: "Scheduled", open: "Open", closed: "Closed" };

export type Assessment = AssessmentInput & {
  id: string;
  courseId: string;
  courseTitle: string;
  status: AssessmentStatus;
  /** Null for self-paced classes (it opens per person). */
  opensAt: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  createdBy: string | null;
  /** Submissions so far (reviewed in step 3). */
  submissions: number;
  /** What still stops publishing. */
  problems: string[];
  /** Once it has opened, only the closing date can change. */
  questionsLocked: boolean;
  can: { edit: boolean };
  rowVer: number;
};

export type SessionDetail = {
  session: Session;
  course: { id: string; title: string; status: CourseStatus; teachers: Person[]; enrolled: number; format: CourseFormat; where: "online" | "in_person"; lengthMin: number };
  stats: { attendanceRate: number | null; attended: number; marked: boolean; submissions: number | null; expected: number; videoWatch: number | null };
  attendance: { state: AttendanceSheet["state"]; savedAt: string | null; savedBy: string | null; due: boolean } | null;
  assessments: { id: string; title: string; status: AssessmentStatus }[];
  can: { author: boolean; attendance: boolean };
};

/* ========================================================== M8 step 3: review */

/** What the pastor decides (Figma 136:27588 "Outcome"). */
export type Outcome = "passed" | "follow_up" | "resubmit";
export const OUTCOME_LABEL: Record<Outcome, string> = {
  passed: "Passed: well done",
  follow_up: "Let's talk: a pastor will follow up",
  resubmit: "Try again: reopen it for them",
};
/** Figma 135:25044 filters: Needs pastoral review, Approved and released. */
export type SubmissionState = "submitted" | "in_review" | "returned";

export type Answer = string | number | null;

export type SubmissionRow = {
  id: string;
  enrolmentId: string;
  name: string;
  submittedAt: string;
  state: SubmissionState;
  outcome: Outcome | null;
  reviewer: string | null;
  /** Answer to the first short reflection, cut short, for the list. */
  preview: string | null;
};

export type PendingRow = {
  enrolmentId: string;
  name: string;
  attended: number;
  sessions: number;
  /** Best share of a recording watched for the session the assessment follows. */
  watched: number | null;
  excused: string | null;
};

export type SubmissionsResponse = {
  assessment: { id: string; title: string; courseId: string; courseTitle: string; afterSession: number; status: AssessmentStatus; closesAt: string | null; final: boolean };
  counts: { all: number; review: number; returned: number; pending: number; excused: number };
  items: SubmissionRow[];
  pending: PendingRow[];
  lastReminder: { at: string; by: string; count: number } | null;
  can: { review: boolean; remind: boolean; excuse: boolean };
};

export type ReviewChange = { at: string; by: string; outcome: Outcome | null; reason: string | null; kind: "saved" | "returned" | "changed" };

export type SubmissionDetail = {
  id: string;
  assessment: { id: string; title: string; courseId: string; courseTitle: string; questions: Question[] };
  name: string;
  firstName: string;
  submittedAt: string;
  attended: number;
  sessions: number;
  answers: Record<string, Answer>;
  state: SubmissionState;
  outcome: Outcome | null;
  note: string;
  shareNote: boolean;
  reviewer: string | null;
  returnedAt: string | null;
  history: ReviewChange[];
  /** Next and previous submission still needing review, in list order. */
  queue: { prev: string | null; next: string | null; left: number };
  can: { review: boolean; blocked: string | null };
  rowVer: number;
};

export type ReviewInput = { outcome: Outcome | null; note: string; shareNote: boolean; release: boolean; rowVer: number; reason?: string };
