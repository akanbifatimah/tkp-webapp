import type { Answer, AssessmentInput, CourseInput, Mark, Outcome, SessionInput, Upload } from "@/features/grow/grow-types";
import { churchDate, fromChurchLocal } from "@/lib/time";

/**
 * Grow mock data (M8): seven classes on the pathway, their sessions, ~180
 * fictional people and their enrolments. Dates are relative to page load so the
 * dashboard always has a class in session, one about to start and one finished.
 * Names follow the Figma Grow screens; every person is fictional.
 */

export type CourseRecord = CourseInput & {
  id: string;
  state: "draft" | "published" | "archived";
  registration: "open" | "closed";
  resources: Upload[];
  createdById: string | null;
  createdAt: string;
  publishedAt: string | null;
  rowVer: number;
};

export type SessionRecord = SessionInput & {
  id: string;
  courseId: string;
  state: "draft" | "published";
  publishedAt: string | null;
  version: number;
  rowVer: number;
};

export type LearnPerson = {
  id: string;
  name: string;
  email: string;
  /** External Student (PRD U3): learns with TKP, not a member. */
  learner: boolean;
  /** Pathway steps finished before (prerequisite checks, LMS-3). */
  completedSteps: number[];
};

export type EnrolmentRecord = {
  id: string;
  courseId: string;
  personId: string;
  status: "enrolled" | "waitlisted" | "withdrawn" | "completed";
  enrolledAt: string;
  /** Waitlist order; renumbered when someone leaves the list. */
  position: number | null;
  /** How many of the published sessions, in order, they have opened. */
  opened: number;
  waived: string | null;
  withdrawnReason: string | null;
};

/** What the meeting platform and the video player recorded (M8 step 2). */
export type JoinLog =
  | { sessionId: string; enrolmentId: string; kind: "live"; at: string; minutes: number }
  | { sessionId: string; enrolmentId: string; kind: "recording"; at: string; percent: number };

export type AttendanceRecord = {
  sessionId: string;
  marks: Record<string, Mark>;
  state: "draft" | "saved";
  savedById: string | null;
  savedAt: string | null;
  rowVer: number;
};

export type AssessmentRecord = AssessmentInput & {
  id: string;
  courseId: string;
  state: "draft" | "published";
  publishedAt: string | null;
  createdById: string | null;
  createdAt: string;
  rowVer: number;
};

/** M8 step 3: answers and the pastor's review. */
export type SubmissionRecord = {
  id: string;
  assessmentId: string;
  enrolmentId: string;
  submittedAt: string;
  answers: Record<string, Answer>;
  state: "submitted" | "in_review" | "returned";
  outcome: Outcome | null;
  note: string;
  shareNote: boolean;
  reviewerId: string | null;
  returnedAt: string | null;
  history: { at: string; byId: string; outcome: Outcome | null; reason: string | null; kind: "saved" | "returned" | "changed" }[];
  rowVer: number;
};
export type ExcusalRecord = { assessmentId: string; enrolmentId: string; reason: string; byId: string; at: string };
export type ReminderRecord = { assessmentId: string; at: string; byId: string; count: number };

const DAY = 86_400_000;

/* ----------------------------------------------------------- dates */

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** The date of `day` (0 = Sunday) in the week that is `weeks` from this one; 0 = the last one on or before today. */
function dayIn(day: number, weeks: number, today = churchDate(new Date())) {
  const back = (weekday(today) - day + 7) % 7;
  return addDays(today, -back + weeks * 7);
}

/* ----------------------------------------------------------- people */

const FIRST = [
  "Adaeze", "Femi", "Chisom", "Babatunde", "Tolu", "Deborah", "Emeka", "Funke", "Grace", "Amaka", "Ngozi", "Ifeoma", "Chinwe", "Nneka", "Uchenna",
  "Samuel", "Oladipo", "Kunle", "Bisi", "Yemi", "Seun", "Kelechi", "Ruth", "Joseph", "Mary", "David", "Esther", "Daniel", "Sarah", "Michael",
];
const LAST = [
  "Okafor", "Olaleye", "Eze", "Lawal", "Awosika", "Adeleke", "Nnamdi", "Balogun", "Mensah", "Nwosu", "Obi", "Okeke", "Umeh", "Ezeani", "Peters",
  "Adeyemi", "Ogunbiyi", "Coker", "Ibrahim", "Johnson", "Williams", "Taiwo", "Akinola", "Daramola",
];

function seedPeople(): LearnPerson[] {
  const out: LearnPerson[] = [];
  for (let i = 0; i < 180; i++) {
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]!;
    const steps: number[] = [1, 2];
    if (i >= 54) steps.push(3);
    if (i >= 95) steps.push(4);
    if (i >= 148) steps.push(5);
    out.push({
      id: `p${String(i + 1).padStart(3, "0")}`,
      name: `${first} ${last}`,
      email: `${first}.${last}.${i + 1}`.toLowerCase() + "@example.com",
      // About one in seven learns with TKP without being a member.
      learner: i % 7 === 3,
      completedSteps: i < 30 ? [1] : steps,
    });
  }
  return out;
}

/* ------------------------------------------------------------ content */

const file = (id: string, name: string, size: number, type = "application/pdf"): Upload => ({ id, name, size, type });
const MB = 1024 * 1024;

type Plan = {
  id: string;
  input: Omit<CourseInput, "schedule"> & { schedule: Omit<CourseInput["schedule"], "startsOn"> };
  state: CourseRecord["state"];
  registration: CourseRecord["registration"];
  /** Week of the first session, relative to this week (null: self-paced, no dates). */
  firstWeek: number | null;
  titles: string[];
  /** Sessions 1..n published. */
  published: number;
  /** Sessions 1..n with content (the rest are empty drafts). */
  filled: number;
  people: [number, number];
  waitlist?: [number, number];
  /** Learners have opened sessions up to about this many behind the newest. */
  lag: number;
  resources?: Upload[];
  createdDaysAgo: number;
};

const base = (o: Partial<Omit<Plan["input"], "schedule">> & Pick<CourseInput, "title" | "description" | "step" | "teacherIds"> & { schedule?: Plan["input"]["schedule"] }): Plan["input"] => ({
  format: "live",
  audience: "everyone",
  prerequisiteSteps: [],
  graderIds: [],
  schedule: { day: 0, time: "11:45", where: "online", place: null, sessionCount: 6, lengthMin: 60 },
  seats: 50,
  waitlist: true,
  completion: { attendance: 5, assessment: "final" },
  welcomeNote: "",
  ...o,
});

const PLANS: Plan[] = [
  {
    id: "c-growth",
    input: base({
      title: "Growth Class (Cohort 2026-B)",
      description: "Six weeks on prayer, Scripture and the Spirit-filled life, for people settling into church life.",
      step: 4,
      teacherIds: ["u18"],
      graderIds: ["u24"],
      prerequisiteSteps: [3],
      schedule: { day: 0, time: "11:45", where: "online", place: null, sessionCount: 6, lengthMin: 60 },
      seats: 60,
      completion: { attendance: 5, assessment: "final" },
      welcomeNote: "Welcome to Growth Class! We're glad you're here. We'll meet online every Sunday after the 1st Service. — Pastor Doyin",
    }),
    state: "published",
    registration: "closed",
    firstWeek: -4,
    titles: [
      "The Heart of Salvation and Assurance",
      "Prayer and the Secret Place",
      "Hearing God's Voice in Scripture",
      "Spiritual Disciplines and Fasting",
      "The Ministry of the Holy Spirit",
      "Covenant Community and Commissioning",
    ],
    published: 5,
    filled: 5,
    people: [0, 56],
    lag: 1,
    resources: [file("r-g1", "Course syllabus.pdf", 1.4 * MB), file("r-g2", "Attendance sheet.xlsx", 0.1 * MB, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")],
    createdDaysAgo: 70,
  },
  {
    id: "c-nb",
    input: base({
      title: "New Believers Class",
      description: "The first steps after giving your life to Christ: assurance, prayer, the Bible and church family.",
      step: 2,
      teacherIds: ["u19"],
      prerequisiteSteps: [],
      schedule: { day: 0, time: "09:30", where: "online", place: null, sessionCount: 8, lengthMin: 50 },
      seats: 50,
      completion: { attendance: 6, assessment: "none" },
      welcomeNote: "Welcome to the family! This class walks you through your first steps with Jesus. — Pastor Folabi",
    }),
    state: "published",
    registration: "open",
    firstWeek: -3,
    titles: ["New Life in Christ", "Assurance of Salvation", "Talking with God", "The Word as Daily Bread", "Baptism and Communion", "The Holy Spirit, Our Helper", "Fellowship and Mutual Care", "Sharing Your Story"],
    published: 4,
    filled: 5,
    people: [54, 95],
    lag: 1,
    createdDaysAgo: 50,
  },
  {
    id: "c-doct",
    input: base({
      title: "Doctrinal Foundations",
      description: "Deepening our understanding of core biblical doctrines: grace, faith and the covenant walk.",
      step: 5,
      teacherIds: ["u20"],
      graderIds: ["u20"],
      prerequisiteSteps: [4],
      schedule: { day: 2, time: "19:00", where: "online", place: null, sessionCount: 12, lengthMin: 75 },
      seats: 50,
      completion: { attendance: 10, assessment: "every" },
      welcomeNote: "Welcome to Doctrinal Foundations! We'll walk through God's Word together over the next 12 weeks. — Pastor Ayo",
    }),
    state: "published",
    registration: "open",
    firstWeek: 2,
    titles: [
      "Why Doctrine Matters",
      "The Authority of Scripture",
      "Who God Is",
      "The Person of Christ",
      "The Work of the Cross",
      "Grace and Faith",
      "The Holy Spirit",
      "The Church",
      "Sanctification",
      "Prayer and Worship",
      "The Last Things",
      "Living the Covenant",
    ],
    published: 2,
    filled: 2,
    people: [95, 145],
    waitlist: [145, 148],
    lag: 2,
    createdDaysAgo: 30,
  },
  {
    id: "c-sod",
    input: base({
      title: "School of Disciples",
      description: "Twelve weeks of discipleship: character, calling and serving in the local church.",
      step: 6,
      teacherIds: ["u21"],
      graderIds: ["u24"],
      prerequisiteSteps: [5],
      schedule: { day: 4, time: "19:00", where: "online", place: null, sessionCount: 12, lengthMin: 90 },
      seats: 40,
      completion: { attendance: 10, assessment: "every" },
      welcomeNote: "Welcome to the School of Disciples. — Pastor Olusegun",
    }),
    state: "published",
    registration: "open",
    firstWeek: 1,
    titles: [
      "The Call to Follow",
      "Counting the Cost",
      "Character Before Gifting",
      "The Disciple's Prayer Life",
      "Stewardship",
      "Serving in the House",
      "Spiritual Gifts",
      "Making Disciples",
      "Integrity at Work",
      "Family and Faith",
      "Leading Others",
      "Commissioning",
    ],
    published: 0,
    filled: 1,
    people: [148, 177],
    lag: 0,
    createdDaysAgo: 24,
  },
  {
    id: "c-wb",
    input: base({
      title: "Water Baptism Class",
      description: "What baptism means and how to prepare. Two in-person sessions before the baptism service.",
      step: 3,
      teacherIds: ["u22"],
      prerequisiteSteps: [2],
      schedule: { day: 6, time: "10:00", where: "in_person", place: "Chapel", sessionCount: 2, lengthMin: 90 },
      seats: 20,
      waitlist: false,
      completion: { attendance: 2, assessment: "none" },
      welcomeNote: "We look forward to seeing you in the Chapel. — Deaconess Esther",
    }),
    state: "published",
    registration: "closed",
    firstWeek: -4,
    titles: ["What Baptism Means", "Preparing for the Day"],
    published: 2,
    filled: 2,
    people: [54, 70],
    lag: 0,
    createdDaysAgo: 60,
  },
  {
    id: "c-ministry",
    input: base({
      title: "School of Ministry",
      description: "For people preparing to lead: preaching, pastoral care and ministry ethics.",
      step: 7,
      teacherIds: ["u20"],
      prerequisiteSteps: [6],
      schedule: { day: 2, time: "19:00", where: "online", place: null, sessionCount: 10, lengthMin: 90 },
      seats: 30,
      completion: { attendance: 9, assessment: "every" },
      welcomeNote: "",
    }),
    state: "draft",
    registration: "closed",
    firstWeek: 7,
    titles: ["The Minister's Calling", "Preparing a Message", "Pastoral Care", "Ministry Ethics", "Leading Worship", "Counselling Basics", "Building Teams", "Church Administration", "Missions", "Commissioning"],
    published: 0,
    filled: 2,
    people: [0, 0],
    lag: 0,
    createdDaysAgo: 6,
  },
  {
    id: "c-prayer",
    input: base({
      title: "Foundations of Prayer (self-paced)",
      description: "Four short recorded sessions on prayer. Start any time.",
      step: null,
      format: "recorded",
      teacherIds: ["u18"],
      schedule: { day: null, time: null, where: "online", place: null, sessionCount: 4, lengthMin: 30 },
      seats: null,
      waitlist: false,
      completion: { attendance: 4, assessment: "none" },
      welcomeNote: "Take these at your own pace. — Pastor Doyin",
    }),
    state: "published",
    registration: "open",
    firstWeek: null,
    titles: ["Why We Pray", "The Lord's Prayer", "Praying the Scriptures", "A Rhythm of Prayer"],
    published: 4,
    filled: 4,
    people: [10, 33],
    lag: 2,
    createdDaysAgo: 120,
  },
];

const SCRIPTURE = ["John 3:16-17", "Matthew 6:5-13", "2 Timothy 3:16-17", "Isaiah 58:6-9", "Acts 2:1-4", "Acts 2:42-47", "Romans 6:3-4", "Psalm 119:105"];
const TAKEAWAYS = [
  "God isn't looking for eloquent speeches but an honest heart.",
  "Scripture is daily bread, not an occasional snack.",
  "Fellowship is a shared life in Christ, not casual socialising.",
];

function buildSessions(p: Plan, startsOn: string | null, now: number): SessionRecord[] {
  const n = p.input.schedule.sessionCount;
  return Array.from({ length: n }, (_, i) => {
    const num = i + 1;
    const filled = num <= p.filled;
    const published = num <= p.published;
    const live = p.input.format === "live" && startsOn && p.input.schedule.time;
    const startsAt = live ? fromChurchLocal(`${addDays(startsOn!, i * 7)}T${p.input.schedule.time}`) : null;
    const id = `${p.id}-s${num}`;
    const recorded = p.input.format === "recorded";
    return {
      id,
      courseId: p.id,
      title: p.titles[i] ?? `Session ${num}`,
      number: num,
      kind: recorded ? "recorded" : "live",
      startsAt,
      joinUrl: live && p.input.schedule.where === "online" ? `https://meet.example.org/tkp-${p.id.slice(2)}` : null,
      durationMin: filled ? p.input.schedule.lengthMin - 10 + (i % 3) * 3 : null,
      speaker: "",
      summary: filled ? `What “${p.titles[i]}” means for everyday faith, with time for questions.` : "",
      video: filled ? (recorded || (startsAt && Date.parse(startsAt) < now) ? { kind: "file", file: file(`${id}-v`, `${p.titles[i]}.mp4`, (180 + i * 37) * MB, "video/mp4") } : null) : null,
      scripture: filled ? SCRIPTURE[(i + p.id.length) % SCRIPTURE.length]! : "",
      handouts: filled && i % 2 === 1 ? [file(`${id}-h1`, `Session ${num} study notes.pdf`, (0.4 + i / 10) * MB)] : [],
      takeaways: filled ? TAKEAWAYS.slice(0, 2 + (i % 2)) : [],
      state: published ? "published" : "draft",
      publishedAt: published ? new Date((startsAt ? Date.parse(startsAt) : now - (40 - i) * DAY) - 3 * DAY).toISOString() : null,
      version: 1,
      rowVer: 1,
    };
  });
}

export function seedGrow(now = Date.now()) {
  const people = seedPeople();
  const courses: CourseRecord[] = [];
  const sessions: SessionRecord[] = [];
  const enrolments: EnrolmentRecord[] = [];
  let eid = 1;
  for (const p of PLANS) {
    const startsOn = p.firstWeek === null || p.input.schedule.day === null ? null : dayIn(p.input.schedule.day, p.firstWeek);
    const created = new Date(now - p.createdDaysAgo * DAY).toISOString();
    courses.push({
      ...p.input,
      schedule: { ...p.input.schedule, startsOn },
      id: p.id,
      state: p.state,
      registration: p.registration,
      resources: p.resources ?? [],
      createdById: "u23",
      createdAt: created,
      publishedAt: p.state === "published" ? new Date(now - (p.createdDaysAgo - 2) * DAY).toISOString() : null,
      rowVer: 1,
    });
    sessions.push(...buildSessions(p, startsOn, now));
    const add = (i: number, status: EnrolmentRecord["status"], position: number | null) => {
      const person = people[i]!;
      enrolments.push({
        id: `e${eid++}`,
        courseId: p.id,
        personId: person.id,
        status,
        enrolledAt: new Date(now - (p.createdDaysAgo - 3 - (i % 9)) * DAY).toISOString(),
        position,
        opened: status === "enrolled" ? Math.max(0, p.published - ((i * 5) % (p.lag + 1))) : 0,
        waived: null,
        withdrawnReason: null,
      });
    };
    for (let i = p.people[0]; i < p.people[1]; i++) add(i, "enrolled", null);
    if (p.waitlist) for (let i = p.waitlist[0], n = 1; i < p.waitlist[1]; i++, n++) add(i, "waitlisted", n);
  }
  // Two people left Growth Class (kept on the roster as withdrawn, RG-4).
  const g = enrolments.filter((e) => e.courseId === "c-growth");
  for (const [e, why] of [
    [g[54], "Moved to Dallas for work"],
    [g[55], "Joined the Saturday cohort instead"],
  ] as const) {
    if (!e) continue;
    e.status = "withdrawn";
    e.withdrawnReason = why;
    e.opened = 1;
  }
  const { logs, attendance } = seedAttendance(courses, sessions, enrolments, now);
  const assessments = seedAssessments(now);
  return { people, courses, sessions, enrolments, logs, attendance, assessments, ...seedSubmissions(enrolments, sessions, now) };
}

/* ------------------------------------------------------------ attendance */

/** Same rule the server uses to suggest a mark from the log. */
export function suggestFrom(log: JoinLog | undefined): Mark {
  if (!log) return "missed";
  if (log.kind === "live") return "joined";
  return log.percent >= 80 ? "recording" : "missed";
}

function seedAttendance(courses: CourseRecord[], sessions: SessionRecord[], enrolments: EnrolmentRecord[], now: number) {
  const logs: JoinLog[] = [];
  const attendance: AttendanceRecord[] = [];
  for (const c of courses) {
    if (c.state !== "published") continue;
    const met = sessions.filter((s) => s.courseId === c.id && s.startsAt && Date.parse(s.startsAt) + c.schedule.lengthMin * 60_000 < now).sort((a, b) => a.number - b.number);
    const people = enrolments.filter((e) => e.courseId === c.id && (e.status === "enrolled" || e.status === "withdrawn"));
    met.forEach((s, si) => {
      const start = Date.parse(s.startsAt!);
      for (const [pi, e] of people.entries()) {
        // Those who left stopped coming after the first session.
        if (e.status === "withdrawn" && si > 0) continue;
        const h = (pi * 7 + s.number * 13) % 20;
        if (h < 15) {
          const late = h === 4 ? 18 : (h % 5) - 2;
          const minutes = h === 3 ? 10 : c.schedule.lengthMin - Math.max(0, late) - (h % 3);
          logs.push({ sessionId: s.id, enrolmentId: e.id, kind: "live", at: new Date(start + late * 60_000).toISOString(), minutes });
        } else if (h < 18) {
          logs.push({ sessionId: s.id, enrolmentId: e.id, kind: "recording", at: new Date(start + (1 + (h % 3)) * DAY).toISOString(), percent: h === 17 ? 60 : 100 });
        }
      }
      // The newest session of a class still running waits for its attendance.
      const last = si === met.length - 1;
      const running = met.length < sessions.filter((x) => x.courseId === c.id).length;
      if (last && running) return;
      const marks: Record<string, Mark> = {};
      for (const e of people) {
        if (e.status === "withdrawn" && si > 0) continue;
        marks[e.id] = suggestFrom(logs.find((l) => l.sessionId === s.id && l.enrolmentId === e.id));
      }
      attendance.push({ sessionId: s.id, marks, state: "saved", savedById: c.teacherIds[0] ?? null, savedAt: new Date(start + DAY).toISOString(), rowVer: 1 });
    });
  }
  return { logs, attendance };
}

/* ----------------------------------------------------------- assessments */

const q = (id: string, kind: "short" | "choice" | "scale", prompt: string, options: string[] = []) => ({ id, kind, prompt, required: true, options });

function seedAssessments(now: number): AssessmentRecord[] {
  const at = (d: number) => new Date(now - d * DAY).toISOString();
  return [
    {
      id: "as-g5",
      courseId: "c-growth",
      title: "Session 5 reflection",
      afterSession: 5,
      windowDays: 7,
      final: false,
      questions: [
        q("q1", "short", "What did you notice about the Holy Spirit's work in you this week?"),
        q("q2", "scale", "How is your prayer life this month?"),
      ],
      state: "published",
      publishedAt: at(9),
      createdById: "u18",
      createdAt: at(12),
      rowVer: 1,
    },
    {
      id: "as-gfinal",
      courseId: "c-growth",
      title: "Class Reflection",
      afterSession: 6,
      windowDays: 14,
      final: true,
      questions: [
        q("q1", "short", "What's one thing from this class that stuck with you?"),
        q("q2", "choice", "Which session helped you most?", ["New Life in Christ", "Prayer and the Secret Place", "The Word as Daily Bread", "Fellowship and Mutual Care"]),
        q("q3", "scale", "How is your prayer life this month?"),
      ],
      state: "published",
      publishedAt: at(4),
      createdById: "u18",
      createdAt: at(6),
      rowVer: 1,
    },
    {
      id: "as-d1",
      courseId: "c-doct",
      title: "Why Doctrine Matters: check-in",
      afterSession: 1,
      windowDays: 7,
      final: false,
      questions: [q("q1", "short", "Why does what we believe shape how we live?"), q("q2", "choice", "", ["", ""])],
      state: "draft",
      publishedAt: null,
      createdById: "u20",
      createdAt: at(2),
      rowVer: 1,
    },
  ];
}

/* ----------------------------------------------------------- submissions */

const REFLECTIONS = [
  "I used to treat prayer as a duty. This week I noticed the Spirit nudging me to slow down and listen before I ask for anything.",
  "Reading Acts 2 with my family changed our evenings. My son asked to pray first for the first time.",
  "Honestly I've struggled. Work has been heavy and I missed two quiet times, but the reminder that He is a helper, not a taskmaster, was what I needed.",
  "The part about the fruit before the gifts stayed with me. I want my patience at home to be the evidence.",
  "I sensed peace in a hard conversation with my sister. I didn't plan the words; they came.",
  "I'm still not sure I hear God's voice. I'd love to talk to someone about it.",
  "Writing down what I sensed each morning helped. Small things, but real.",
  "Fasting one meal a week has made me more aware of how often I reach for comfort instead of God.",
];

/**
 * Growth Class's open "Session 5 reflection": most people have answered. Eight
 * wait for review, the rest are returned; a few haven't answered (one excused).
 */
function seedSubmissions(enrolments: EnrolmentRecord[], sessions: SessionRecord[], now: number) {
  const submissions: SubmissionRecord[] = [];
  const s5 = sessions.find((s) => s.id === "c-growth-s5");
  const opened = s5?.startsAt ? Date.parse(s5.startsAt) + 60 * 60_000 : now - 3 * DAY;
  const people = enrolments.filter((e) => e.courseId === "c-growth" && e.status === "enrolled");
  const span = Math.max(3_600_000, now - opened);
  people.forEach((e, i) => {
    if (i % 7 === 6 || i >= 52) return; // not submitted yet
    const at = opened + Math.round((span * ((i * 37) % 100)) / 110);
    if (at >= now) return;
    const review = i % 6 === 1 && submissions.filter((x) => x.state !== "returned").length < 8;
    const outcome: Outcome = i % 11 === 5 ? "follow_up" : "passed";
    const reviewed = new Date(Math.min(now - 3_600_000, at + DAY)).toISOString();
    submissions.push({
      id: `sub-${e.id}`,
      assessmentId: "as-g5",
      enrolmentId: e.id,
      submittedAt: new Date(at).toISOString(),
      answers: { q1: REFLECTIONS[i % REFLECTIONS.length]!, q2: 2 + (i % 4) },
      state: review ? "submitted" : "returned",
      outcome: review ? null : outcome,
      note: review ? "" : outcome === "passed" ? "Thank you for sharing this. Keep going. — Pastor Doyin" : "I'd love to sit with you after service and pray about this. — Pastor Doyin",
      shareNote: !review,
      reviewerId: review ? null : "u18",
      returnedAt: review ? null : reviewed,
      history: review ? [] : [{ at: reviewed, byId: "u18", outcome, reason: null, kind: "returned" }],
      rowVer: 1,
    });
  });
  const missing = people.filter((e) => !submissions.some((x) => x.enrolmentId === e.id));
  const excusals: ExcusalRecord[] = missing[0] ? [{ assessmentId: "as-g5", enrolmentId: missing[0].id, reason: "Out of state travel", byId: "u18", at: new Date(now - DAY).toISOString() }] : [];
  return { submissions, excusals, reminders: [] as ReminderRecord[] };
}
