import {
  ASSESSMENT_RULE_LABEL,
  hasMeetings,
  PATHWAY,
  type CourseDetail,
  type CourseInput,
  type CoursesResponse,
  type CourseStatus,
  type CourseSummary,
  type Enrolment,
  type GrowOverview,
  type PersonHit,
  type PublishCheck,
  type RosterResponse,
  type Session,
  type SessionInput,
  type Upload,
} from "@/features/grow/grow-types";
import { churchDate, formatWhen, fromChurchLocal } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import {
  activeEnrolments,
  allowed,
  canAuthor,
  canManage,
  canSee,
  DAY,
  enrolmentsOf,
  findCourse,
  findSession,
  FORBIDDEN,
  no,
  NOT_FOUND,
  ok,
  person,
  seesAll,
  sessionsOf,
  staffPerson,
} from "./grow-core";
import { certificateAttention } from "./grow-certs";
import { forumAttention } from "./grow-forum";
import { reviewAttention } from "./grow-review";
import { assessmentsOf, attendanceSummary, attendedCount, getSessionDetail, joinedThisWeek, teachingAttention } from "./grow-teaching";
import type { CourseRecord, EnrolmentRecord, SessionRecord } from "./seed/grow";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock Grow "server" (docs/API.md §13): classes, sessions, uploads and
 * rosters for the Learn admin (PRD LMS-1 to LMS-8, WEB-9 to WEB-11, WEB-13,
 * WEB-17, RG-1, RG-4). Status is worked out from the dates when read.
 */

const STALE = "Someone else changed this class while you were working. Reload to see their changes, then try again.";
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/* ================================================================ status */

const sessionEnd = (c: CourseRecord, s: SessionRecord) => (s.startsAt ? Date.parse(s.startsAt) + c.schedule.lengthMin * 60_000 : null);

export function statusOf(c: CourseRecord, now = Date.now()): CourseStatus {
  if (c.state === "draft") return "draft";
  if (c.state === "archived") return "archived";
  const dated = sessionsOf(c.id).filter((s) => s.startsAt);
  if (!hasMeetings(c.format) || !dated.length) return "open";
  const first = Date.parse(dated[0]!.startsAt!);
  const last = sessionEnd(c, dated.at(-1)!)!;
  if (now < first) return "open";
  if (now > last) return "completed";
  return "in_session";
}

function clock(t: string) {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function scheduleLabel(c: Pick<CourseInput, "format" | "schedule">) {
  if (!hasMeetings(c.format)) return "Self-paced";
  const { day, time, where, place } = c.schedule;
  if (day === null || !time) return "Meeting time not set";
  return `${DAYS[day]} · ${clock(time)} · ${where === "online" ? "Online" : `In person${place ? `, ${place}` : ""}`}`;
}

/** Terms run Jan–Apr (Spring), May–Aug (Summer) and Sep–Dec (Autumn). */
export function termOf(date: string) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const [name, startMonth] = m <= 4 ? ["Spring", 1] : m <= 8 ? ["Summer", 5] : ["Autumn", 9];
  return { label: `${name} ${y}`, start: `${y}-${String(startMonth).padStart(2, "0")}-01` };
}

/* ============================================================== content */

/** RG-1: "no empty lessons". A session with nothing for learners to see or read is empty. */
export const isEmpty = (s: Pick<SessionInput, "video" | "handouts" | "summary" | "takeaways">) =>
  !s.video && !s.handouts.length && !s.summary.trim() && !s.takeaways.some((t) => t.trim());

export function sessionProblems(c: CourseRecord, s: SessionInput): string[] {
  const out: string[] = [];
  if (isEmpty(s)) out.push("Add something for learners: a video, a handout, a summary or takeaways.");
  if (s.kind === "live" && !s.startsAt) out.push("Set when this session meets.");
  if (s.kind === "live" && c.schedule.where === "online" && !s.joinUrl) out.push("Add the link people use to join.");
  return out;
}

export function publishChecks(c: CourseRecord): PublishCheck[] {
  const sessions = sessionsOf(c.id);
  const meets = hasMeetings(c.format);
  const sched = c.schedule;
  const checks: PublishCheck[] = [
    { id: "teacher", label: "A teacher is assigned", ok: c.teacherIds.length > 0 },
    {
      id: "schedule",
      label: meets ? "Day, time, start date and place are set" : "Self-paced: no meeting times needed",
      ok: !meets || (sched.day !== null && !!sched.time && !!sched.startsOn && (sched.where === "online" || !!sched.place?.trim())),
    },
    { id: "sessions", label: "It has at least one session", ok: sessions.length > 0 },
    { id: "first", label: "Session 1 has content", ok: !!sessions[0] && !isEmpty(sessions[0]) },
    {
      id: "completion",
      label: `Completion rule fits: ${c.completion.attendance} of ${sessions.length} sessions`,
      ok: c.completion.attendance <= sessions.length,
    },
  ];
  return checks;
}

/* ================================================================= views */


function summary(c: CourseRecord, now: number): CourseSummary {
  const sessions = sessionsOf(c.id);
  const next = sessions.find((s) => s.startsAt && Date.parse(s.startsAt) > now);
  return {
    id: c.id,
    title: c.title,
    step: c.step,
    format: c.format,
    audience: c.audience,
    status: statusOf(c, now),
    registration: c.registration,
    teachers: c.teacherIds.map(staffPerson),
    scheduleLabel: scheduleLabel(c),
    term: c.schedule.startsOn ? termOf(c.schedule.startsOn).label : null,
    enrolled: activeEnrolments(c.id).length,
    waitlisted: enrolmentsOf(c.id).filter((e) => e.status === "waitlisted").length,
    seats: c.seats,
    sessions: { total: sessions.length, published: sessions.filter((s) => s.state === "published").length },
    nextSessionAt: next?.startsAt ?? null,
    rowVer: c.rowVer,
  };
}

const options = (): CoursesResponse["options"] => {
  const active = db.staff.filter((s) => s.isActive);
  return {
    teachers: active.filter((s) => s.roles.includes("course_author")).map((s) => ({ id: s.id, name: s.fullName })),
    graders: active.filter((s) => s.roles.includes("grader") || s.roles.includes("course_author")).map((s) => ({ id: s.id, name: s.fullName })),
  };
};

const ORDER: Record<CourseStatus, number> = { in_session: 0, open: 1, draft: 2, completed: 3, archived: 4 };

export function listCourses(u: StaffRecord, now = Date.now()): Result<CoursesResponse> {
  if (!allowed(u, "learn.view")) return no(403, "FORBIDDEN", FORBIDDEN);
  const items = db.learnCourses
    .filter((c) => canSee(u, c))
    .map((c) => summary(c, now))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.step ?? 99) - (b.step ?? 99) || a.title.localeCompare(b.title));
  return ok({ items, scope: seesAll(u) ? "all" : "assigned", can: { manage: canManage(u) }, options: options() });
}

function toSession(c: CourseRecord, s: SessionRecord): Session {
  const order = sessionsOf(c.id).filter((x) => x.state === "published");
  const idx = order.findIndex((x) => x.id === s.id);
  // People still on the class; those who left no longer see it.
  const opened = idx < 0 ? 0 : activeEnrolments(c.id).filter((e) => e.opened > idx).length;
  return { ...s, opened, empty: isEmpty(s), attendance: attendanceSummary(c, s) };
}

export function detail(c: CourseRecord, u: StaffRecord, now = Date.now()): CourseDetail {
  const sessions = sessionsOf(c.id).map((s) => toSession(c, s));
  const published = sessions.filter((s) => s.state === "published").length;
  const active = activeEnrolments(c.id);
  const progress = active.length && published ? Math.round((active.reduce((n, e) => n + Math.min(e.opened, published), 0) / (active.length * published)) * 100) : 0;
  return {
    ...c,
    status: statusOf(c, now),
    term: c.schedule.startsOn ? termOf(c.schedule.startsOn).label : null,
    scheduleLabel: scheduleLabel(c),
    teachers: c.teacherIds.map(staffPerson),
    graders: c.graderIds.map(staffPerson),
    sessions,
    enrolled: active.length,
    waitlisted: enrolmentsOf(c.id).filter((e) => e.status === "waitlisted").length,
    progress,
    checks: publishChecks(c),
    assessments: assessmentsOf(u, c, now),
    createdBy: c.createdById ? staffPerson(c.createdById).name : null,
    can: { manage: canManage(u), author: canAuthor(u, c), export: allowed(u, "learn.export") },
    options: options(),
  };
}

export function getCourse(u: StaffRecord, id: string, now = Date.now()): Result<CourseDetail> {
  const c = findCourse(id);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  return ok(detail(c, u, now));
}

/* ============================================================ validation */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https:\/\/\S+\.\S+/;

export function validateCourse(input: Partial<CourseInput>, current?: CourseRecord): { value?: CourseInput; fields?: Record<string, string[]> } {
  const f: Record<string, string[]> = {};
  const set = (k: string, m: string) => (f[k] ??= []).push(m);
  const title = String(input.title ?? "").trim();
  if (title.length < 3) set("title", "Enter the class name");
  else if (title.length > 80) set("title", "Keep the name under 80 characters");
  else if (db.learnCourses.some((c) => c.id !== current?.id && c.state !== "archived" && c.title.toLowerCase() === title.toLowerCase()))
    set("title", "Another class already has this name. Add the cohort or term, for example “(Cohort 2027-A)”.");
  const description = String(input.description ?? "").trim();
  if (description.length > 500) set("description", "Keep the description under 500 characters");
  const step = input.step ?? null;
  if (step !== null && !PATHWAY.some((p) => p.step === step)) set("step", "Choose a pathway step");
  const format = input.format ?? "live";
  if (!["live", "recorded", "reading", "mixed"].includes(format)) set("format", "Choose a format");
  const audience = input.audience === "members" ? "members" : "everyone";
  const prereq = [...new Set(input.prerequisiteSteps ?? [])].sort();
  if (prereq.some((p) => !PATHWAY.some((x) => x.step === p))) set("prerequisiteSteps", "Choose pathway steps");
  else if (step !== null && prereq.some((p) => p >= step)) set("prerequisiteSteps", "A prerequisite must come earlier on the pathway than this class");
  const teacherIds = [...new Set(input.teacherIds ?? [])];
  const teachers = options().teachers.map((t) => t.id);
  if (!teacherIds.length) set("teacherIds", "Choose who teaches it");
  else if (teacherIds.some((t) => !teachers.includes(t))) set("teacherIds", "Teachers must be active Course Authors");
  const graderIds = [...new Set(input.graderIds ?? [])];
  const graders = options().graders.map((t) => t.id);
  if (graderIds.some((t) => !graders.includes(t))) set("graderIds", "Graders must be active Graders or Course Authors");

  const s = input.schedule ?? ({} as Partial<CourseInput["schedule"]>);
  const meets = hasMeetings(format);
  const sessionCount = Number(s.sessionCount);
  if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 52) set("schedule.sessionCount", "Between 1 and 52 sessions");
  const lengthMin = Number(s.lengthMin ?? 60);
  if (!Number.isInteger(lengthMin) || lengthMin < 15 || lengthMin > 480) set("schedule.lengthMin", "Between 15 minutes and 8 hours");
  const day = meets ? (s.day ?? null) : null;
  const time = meets ? (s.time ?? null) : null;
  const where = s.where === "in_person" ? "in_person" : "online";
  const place = where === "in_person" ? String(s.place ?? "").trim() || null : null;
  const startsOn = meets ? (s.startsOn ?? null) : null;
  if (meets) {
    if (day === null || day < 0 || day > 6) set("schedule.day", "Choose the day");
    if (!time || !TIME.test(time)) set("schedule.time", "Enter the start time");
    if (startsOn && !DATE.test(startsOn)) set("schedule.startsOn", "Enter a date");
    else if (startsOn && day !== null && new Date(`${startsOn}T12:00:00Z`).getUTCDay() !== day)
      set("schedule.startsOn", `The first session must fall on a ${DAYS[day]!.slice(0, -1)}`);
    if (where === "in_person" && !place) set("schedule.place", "Say where it meets");
  }

  const seats = input.seats === null || input.seats === undefined ? null : Number(input.seats);
  const enrolled = current ? activeEnrolments(current.id).length : 0;
  if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > 1000)) set("seats", "Between 1 and 1,000 seats, or no limit");
  else if (seats !== null && seats < enrolled) set("seats", `${enrolled} people are already enrolled. Seats can't go below that.`);

  const attendance = Number(input.completion?.attendance ?? 0);
  const assessment = input.completion?.assessment ?? "none";
  if (!(assessment in ASSESSMENT_RULE_LABEL)) set("completion.assessment", "Choose what they must pass");
  if (!Number.isInteger(attendance) || attendance < 0) set("completion.attendance", "Enter a number of sessions");
  else if (Number.isInteger(sessionCount) && attendance > sessionCount) set("completion.attendance", `It has ${sessionCount} sessions, so at most ${sessionCount}`);
  const welcomeNote = String(input.welcomeNote ?? "").trim();
  if (welcomeNote.length > 1000) set("welcomeNote", "Keep the welcome note under 1,000 characters");

  if (Object.keys(f).length) return { fields: f };
  return {
    value: {
      title,
      description,
      step,
      format,
      audience,
      prerequisiteSteps: prereq,
      teacherIds,
      graderIds,
      schedule: { day, time, where, place, startsOn, sessionCount, lengthMin },
      seats,
      waitlist: !!input.waitlist,
      completion: { attendance, assessment },
      welcomeNote,
    },
  };
}

/* ============================================================== classes */

const civilAdd = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Meeting time of session `i` (0-based) for a weekly class. */
const meetingAt = (c: CourseInput, i: number) =>
  hasMeetings(c.format) && c.schedule.startsOn && c.schedule.time ? fromChurchLocal(`${civilAdd(c.schedule.startsOn, i * 7)}T${c.schedule.time}`) : null;

function blankSession(c: CourseRecord, number: number): SessionRecord {
  const live = hasMeetings(c.format);
  return {
    id: `${c.id}-s${crypto.randomUUID().slice(0, 6)}`,
    courseId: c.id,
    title: `Session ${number}`,
    number,
    kind: live ? "live" : c.format === "reading" ? "reading" : "recorded",
    startsAt: meetingAt(c, number - 1),
    joinUrl: null,
    durationMin: null,
    speaker: "",
    summary: "",
    video: null,
    scripture: "",
    handouts: [],
    takeaways: [],
    state: "draft",
    publishedAt: null,
    version: 1,
    rowVer: 1,
  };
}

let nextId = 1;
export function createCourse(u: StaffRecord, input: Partial<CourseInput>): Result<{ course: CourseDetail }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const v = validateCourse(input);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const c: CourseRecord = {
    ...v.value,
    id: `c-new-${nextId++}`,
    state: "draft",
    registration: "closed",
    resources: [],
    createdById: u.id,
    createdAt: new Date().toISOString(),
    publishedAt: null,
    rowVer: 1,
  };
  db.learnCourses.push(c);
  for (let i = 1; i <= c.schedule.sessionCount; i++) db.learnSessions.push(blankSession(c, i));
  audit(u.id, "learn.course.create", c.id, { after: { title: c.title, sessions: c.schedule.sessionCount } });
  return ok({ course: detail(c, u) }, 201);
}

const CHANGE_KEYS = ["title", "description", "step", "format", "audience", "prerequisiteSteps", "teacherIds", "graderIds", "schedule", "seats", "waitlist", "completion", "welcomeNote"] as const;

export function updateCourse(u: StaffRecord, id: string, input: Partial<CourseInput> & { rowVer?: number }): Result<{ course: CourseDetail; moved: number; promoted: string[] }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCourse(id);
  if (!c) return no(404, "NOT_FOUND", NOT_FOUND);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  if (input.rowVer !== c.rowVer) return no(409, "CONFLICT", STALE);
  const v = validateCourse(input, c);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const next = v.value;
  const status = statusOf(c);
  if (c.state === "published" && next.format !== c.format && (hasMeetings(next.format) !== hasMeetings(c.format)))
    return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", { format: ["Once a class is published it can't switch between meeting and self-paced"] });

  // Session count: add blank drafts at the end, or remove trailing empty drafts.
  const sessions = sessionsOf(c.id);
  if (next.schedule.sessionCount < sessions.length) {
    const cut = sessions.slice(next.schedule.sessionCount);
    if (cut.some((s) => s.state === "published" || !isEmpty(s)))
      return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", {
        "schedule.sessionCount": [`Sessions ${next.schedule.sessionCount + 1}–${sessions.length} have content or are published. Delete them on the class page first.`],
      });
  }
  if (status !== "draft" && status !== "open" && next.schedule.startsOn !== c.schedule.startsOn)
    return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", { "schedule.startsOn": ["The class has started, so its start date can't move"] });

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of CHANGE_KEYS) {
    if (JSON.stringify(c[k]) !== JSON.stringify(next[k])) {
      before[k] = c[k];
      after[k] = next[k];
    }
  }
  const oldSched = c.schedule;
  Object.assign(c, next);
  c.rowVer++;

  const now = Date.now();
  if (next.schedule.sessionCount < sessions.length) {
    const drop = new Set(sessions.slice(next.schedule.sessionCount).map((s) => s.id));
    db.learnSessions = db.learnSessions.filter((s) => !drop.has(s.id));
  } else for (let i = sessions.length + 1; i <= next.schedule.sessionCount; i++) db.learnSessions.push(blankSession(c, i));

  // A new day, time or start date moves the sessions that haven't met yet.
  let moved = 0;
  if (hasMeetings(c.format) && (oldSched.day !== next.schedule.day || oldSched.time !== next.schedule.time || oldSched.startsOn !== next.schedule.startsOn)) {
    for (const s of sessionsOf(c.id)) {
      if (s.startsAt && Date.parse(s.startsAt) < now) continue;
      const at = meetingAt(c, s.number - 1);
      if (at !== s.startsAt) {
        s.startsAt = at;
        s.rowVer++;
        moved++;
      }
    }
  }
  const promoted = fillSeats(c, u);
  if (Object.keys(after).length) audit(u.id, "learn.course.update", c.id, { before, after: { ...after, ...(moved ? { movedSessions: moved } : {}) } });
  return ok({ course: detail(c, u), moved, promoted });
}

export function publishCourse(u: StaffRecord, id: string, rowVer: number | undefined): Result<{ course: CourseDetail }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCourse(id);
  if (!c) return no(404, "NOT_FOUND", NOT_FOUND);
  if (rowVer !== c.rowVer) return no(409, "CONFLICT", STALE);
  if (c.state !== "draft") return no(422, "NOT_DRAFT", "This class is already published.");
  const failing = publishChecks(c).filter((x) => !x.ok);
  if (failing.length) return no(422, "PUBLISH_CHECKS", `Before publishing: ${failing.map((x) => x.label.toLowerCase()).join("; ")}.`);
  c.state = "published";
  c.registration = "open";
  c.publishedAt = new Date().toISOString();
  c.rowVer++;
  audit(u.id, "learn.course.publish", c.id, { after: { state: "published", registration: "open" } });
  return ok({ course: detail(c, u) });
}

export function setRegistration(u: StaffRecord, id: string, open: boolean, rowVer: number | undefined): Result<{ course: CourseDetail }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCourse(id);
  if (!c) return no(404, "NOT_FOUND", NOT_FOUND);
  if (rowVer !== c.rowVer) return no(409, "CONFLICT", STALE);
  if (c.state !== "published") return no(422, "NOT_PUBLISHED", "Publish the class first.");
  if (open && statusOf(c) === "completed") return no(422, "COMPLETED", "This class has finished. Create a new cohort instead.");
  c.registration = open ? "open" : "closed";
  c.rowVer++;
  audit(u.id, open ? "learn.registration.open" : "learn.registration.close", c.id, { after: { registration: c.registration } });
  return ok({ course: detail(c, u) });
}

export function archiveCourse(u: StaffRecord, id: string, rowVer: number | undefined): Result<{ course: CourseDetail }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCourse(id);
  if (!c) return no(404, "NOT_FOUND", NOT_FOUND);
  if (rowVer !== c.rowVer) return no(409, "CONFLICT", STALE);
  const status = statusOf(c);
  if (status === "in_session" || (status === "open" && activeEnrolments(c.id).length))
    return no(422, "IN_USE", "People are enrolled and the class hasn't finished. Close registration and archive it once it's over.");
  c.state = "archived";
  c.registration = "closed";
  c.rowVer++;
  audit(u.id, "learn.course.archive", c.id, { before: { state: status } });
  return ok({ course: detail(c, u) });
}

export function deleteCourse(u: StaffRecord, id: string): Result<{ deleted: true }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCourse(id);
  if (!c) return no(404, "NOT_FOUND", NOT_FOUND);
  if (c.state !== "draft" || enrolmentsOf(c.id).length) return no(422, "IN_USE", "Only a draft class nobody has joined can be deleted. Archive it instead.");
  db.learnCourses = db.learnCourses.filter((x) => x.id !== id);
  db.learnSessions = db.learnSessions.filter((s) => s.courseId !== id);
  audit(u.id, "learn.course.delete", id, { before: { title: c.title } });
  return ok({ deleted: true });
}

/* ============================================================== sessions */

export type SessionBody = Partial<SessionInput> & { rowVer?: number; applyTo?: "new" | "everyone" };

function validateSession(c: CourseRecord, input: Partial<SessionInput>, count: number): { value?: SessionInput; fields?: Record<string, string[]> } {
  const f: Record<string, string[]> = {};
  const set = (k: string, m: string) => (f[k] ??= []).push(m);
  const title = String(input.title ?? "").trim();
  if (title.length < 2) set("title", "Enter the session title");
  else if (title.length > 100) set("title", "Keep the title under 100 characters");
  const number = Number(input.number);
  if (!Number.isInteger(number) || number < 1 || number > count) set("number", `Choose a position from 1 to ${count}`);
  const kind = input.kind ?? "live";
  if (!["live", "recorded", "reading"].includes(kind)) set("kind", "Choose the kind of session");
  if (kind === "live" && !hasMeetings(c.format)) set("kind", "This class is self-paced, so its sessions can't meet live");
  const startsAt = kind === "live" ? (input.startsAt ?? null) : null;
  if (startsAt && Number.isNaN(Date.parse(startsAt))) set("startsAt", "Enter a date and time");
  const joinUrl = kind === "live" && c.schedule.where === "online" ? String(input.joinUrl ?? "").trim() || null : null;
  if (joinUrl && !URL_RE.test(joinUrl)) set("joinUrl", "Enter the full link, starting with https://");
  const duration = input.durationMin === null || input.durationMin === undefined || (input.durationMin as unknown) === "" ? null : Number(input.durationMin);
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 600)) set("durationMin", "Between 1 and 600 minutes");
  const summary = String(input.summary ?? "").trim();
  if (summary.length > 1000) set("summary", "Keep the summary under 1,000 characters");
  const video = input.video ?? null;
  if (video?.kind === "link") {
    if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\/\S+/.test(video.url)) set("video", "Use a YouTube or Vimeo link, starting with https://");
  }
  const handouts = input.handouts ?? [];
  if (handouts.length > 10) set("handouts", "Up to 10 handouts");
  const takeaways = (input.takeaways ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (takeaways.length > 5) set("takeaways", "Up to 5 takeaways");
  if (takeaways.some((t) => t.length > 200)) set("takeaways", "Keep each takeaway under 200 characters");
  if (Object.keys(f).length) return { fields: f };
  return {
    value: {
      title,
      number,
      kind,
      startsAt,
      joinUrl,
      durationMin: duration,
      speaker: String(input.speaker ?? "").trim().slice(0, 80),
      summary,
      video,
      scripture: String(input.scripture ?? "").trim().slice(0, 120),
      handouts,
      takeaways,
    },
  };
}

/** Move a session to `to` (1-based) and renumber the rest. */
function placeAt(courseId: string, s: SessionRecord, to: number) {
  const rest = sessionsOf(courseId).filter((x) => x.id !== s.id);
  rest.splice(to - 1, 0, s);
  rest.forEach((x, i) => {
    if (x.number !== i + 1) {
      x.number = i + 1;
      x.rowVer++;
    }
  });
}

const syncCount = (c: CourseRecord) => {
  c.schedule.sessionCount = sessionsOf(c.id).length;
};

export function createSession(u: StaffRecord, courseId: string, input: Partial<SessionInput>): Result<{ session: Session; course: CourseDetail }> {
  const c = findCourse(courseId);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  const count = sessionsOf(c.id).length + 1;
  const v = validateSession(c, { number: count, ...input }, count);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const s: SessionRecord = { ...blankSession(c, count), ...v.value, number: count };
  db.learnSessions.push(s);
  placeAt(c.id, s, v.value.number);
  syncCount(c);
  c.rowVer++;
  audit(u.id, "learn.session.create", c.id, { after: { session: s.title, number: s.number } });
  return ok({ session: toSession(c, s), course: detail(c, u) }, 201);
}

const CONTENT_KEYS = ["title", "summary", "video", "scripture", "handouts", "takeaways", "speaker", "durationMin"] as const;

export function updateSession(u: StaffRecord, id: string, body: SessionBody): Result<{ session: Session }> {
  const s = findSession(id);
  const c = s && findCourse(s.courseId);
  if (!s || !c || !canSee(u, c)) return no(404, "NOT_FOUND", "That session no longer exists.");
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  if (body.rowVer !== s.rowVer) return no(409, "CONFLICT", "Someone else changed this session while you were working. Reload to see their changes, then try again.");
  const v = validateSession(c, body, sessionsOf(c.id).length);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const next = v.value;
  if (s.state === "published" && isEmpty(next)) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", { summary: ["A published session can't be left empty. Keep a video, handout, summary or takeaway."] });

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of [...CONTENT_KEYS, "startsAt", "joinUrl", "number", "kind"] as const) {
    if (JSON.stringify(s[k]) !== JSON.stringify(next[k])) {
      before[k] = s[k];
      after[k] = next[k];
    }
  }
  // RG-1: a change to a published session people have opened says who sees it.
  const contentChanged = CONTENT_KEYS.some((k) => k in after);
  const opened = toSession(c, s).opened;
  if (s.state === "published" && contentChanged && opened > 0 && body.applyTo !== "new" && body.applyTo !== "everyone")
    return no(422, "APPLY_TO_REQUIRED", `${opened} ${opened === 1 ? "person has" : "people have"} opened this session. Choose who sees the change.`, undefined);

  const to = next.number;
  Object.assign(s, { ...next, number: s.number });
  if (to !== s.number) placeAt(c.id, s, to);
  if (s.state === "published" && contentChanged) s.version++;
  s.rowVer++;
  if (Object.keys(after).length)
    audit(u.id, "learn.session.update", c.id, { before, after: { ...after, session: s.title, ...(s.state === "published" && contentChanged ? { applyTo: opened ? body.applyTo : "everyone", version: s.version } : {}) } });
  return ok({ session: toSession(c, s) });
}

export function publishSession(u: StaffRecord, id: string, rowVer: number | undefined, publish = true): Result<{ session: Session }> {
  const s = findSession(id);
  const c = s && findCourse(s.courseId);
  if (!s || !c || !canSee(u, c)) return no(404, "NOT_FOUND", "That session no longer exists.");
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  if (rowVer !== s.rowVer) return no(409, "CONFLICT", "Someone else changed this session while you were working. Reload to see their changes, then try again.");
  if (publish) {
    const problems = sessionProblems(c, s);
    if (problems.length) return no(422, "PUBLISH_CHECKS", problems.join(" "));
    s.state = "published";
    s.publishedAt = new Date().toISOString();
  } else {
    if (toSession(c, s).opened > 0) return no(422, "IN_USE", "People have already opened this session, so it stays published. Change it instead.");
    s.state = "draft";
    s.publishedAt = null;
  }
  s.rowVer++;
  audit(u.id, publish ? "learn.session.publish" : "learn.session.unpublish", c.id, { after: { session: s.title, number: s.number } });
  return ok({ session: toSession(c, s) });
}

export function deleteSession(u: StaffRecord, id: string): Result<{ deleted: true }> {
  const s = findSession(id);
  const c = s && findCourse(s.courseId);
  if (!s || !c || !canSee(u, c)) return no(404, "NOT_FOUND", "That session no longer exists.");
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (s.state === "published") return no(422, "IN_USE", "A published session can't be deleted. Move it back to draft first, if nobody has opened it.");
  if (sessionsOf(c.id).length === 1) return no(422, "LAST_SESSION", "A class needs at least one session.");
  db.learnSessions = db.learnSessions.filter((x) => x.id !== id);
  sessionsOf(c.id).forEach((x, i) => {
    x.number = i + 1;
  });
  syncCount(c);
  c.completion.attendance = Math.min(c.completion.attendance, c.schedule.sessionCount);
  c.rowVer++;
  audit(u.id, "learn.session.delete", c.id, { before: { session: s.title, number: s.number } });
  return ok({ deleted: true });
}

/* =============================================================== uploads */

export type UploadPurpose = "video" | "handout" | "resource";
const GB = 1024 ** 3;
const MB = 1024 ** 2;
export const UPLOAD_RULES: Record<UploadPurpose, { ext: string[]; max: number; label: string }> = {
  video: { ext: ["mp4", "mov", "m4v"], max: 2 * GB, label: "MP4, MOV or M4V up to 2 GB" },
  handout: { ext: ["pdf"], max: 25 * MB, label: "PDF up to 25 MB" },
  resource: { ext: ["pdf", "docx", "xlsx", "pptx"], max: 25 * MB, label: "PDF, Word, Excel or PowerPoint up to 25 MB" },
};

/**
 * Mock: keeps the name and size only. The real service stores the file and
 * scans it for viruses before it can be published (PRD 4.4, "virus scan on upload").
 */
export function upload(u: StaffRecord, purpose: UploadPurpose, file: { name: string; size: number; type: string }): Result<{ file: Upload }> {
  if (!allowed(u, "learn.author") && !canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const rule = UPLOAD_RULES[purpose];
  if (!rule) return no(422, "VALIDATION_FAILED", "Unknown upload.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!rule.ext.includes(ext)) return no(422, "VALIDATION_FAILED", `That file type isn't allowed here. Use ${rule.label}.`, { file: [`Use ${rule.label}`] });
  if (file.size > rule.max) return no(422, "VALIDATION_FAILED", `That file is too big. Use ${rule.label}.`, { file: [`Use ${rule.label}`] });
  if (file.size === 0) return no(422, "VALIDATION_FAILED", "That file is empty.", { file: ["That file is empty"] });
  return ok({ file: { id: `up-${crypto.randomUUID().slice(0, 8)}`, name: file.name.slice(0, 120), size: file.size, type: file.type || "application/octet-stream" } }, 201);
}

export function addResource(u: StaffRecord, courseId: string, file: Upload): Result<{ course: CourseDetail }> {
  const c = findCourse(courseId);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Nothing on it can change.");
  if (c.resources.length >= 20) return no(422, "VALIDATION_FAILED", "A class can keep up to 20 resources. Remove one first.");
  c.resources.push(file);
  audit(u.id, "learn.resource.add", c.id, { after: { file: file.name } });
  return ok({ course: detail(c, u) }, 201);
}

export function removeResource(u: StaffRecord, courseId: string, fileId: string): Result<{ course: CourseDetail }> {
  const c = findCourse(courseId);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  if (!canAuthor(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  const f = c.resources.find((r) => r.id === fileId);
  if (!f) return no(404, "NOT_FOUND", "That file is already gone.");
  c.resources = c.resources.filter((r) => r.id !== fileId);
  audit(u.id, "learn.resource.remove", c.id, { before: { file: f.name } });
  return ok({ course: detail(c, u) });
}

/* ================================================================ roster */

function toEnrolment(e: EnrolmentRecord): Enrolment {
  const p = person(e.personId)!;
  return {
    id: e.id,
    personId: e.personId,
    name: p.name,
    email: p.email,
    learner: p.learner,
    status: e.status,
    enrolledAt: e.enrolledAt,
    position: e.position,
    opened: e.opened,
    attended: attendedCount(e),
    waived: e.waived,
    withdrawnReason: e.withdrawnReason,
  };
}

export function getRoster(u: StaffRecord, courseId: string): Result<RosterResponse> {
  const c = findCourse(courseId);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  const rank = { enrolled: 0, completed: 1, waitlisted: 2, withdrawn: 3 };
  const items = enrolmentsOf(c.id)
    .map(toEnrolment)
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
  return ok({
    courseId: c.id,
    title: c.title,
    seats: c.seats,
    publishedSessions: sessionsOf(c.id).filter((s) => s.state === "published").length,
    items,
    can: { manage: canManage(u), export: allowed(u, "learn.export") },
  });
}

const missingSteps = (c: CourseRecord, personId: string) => {
  const done = person(personId)?.completedSteps ?? [];
  return c.prerequisiteSteps.filter((s) => !done.includes(s)).map((s) => PATHWAY.find((p) => p.step === s)!.label);
};
const holding = (c: CourseRecord, personId: string) => enrolmentsOf(c.id).find((e) => e.personId === personId && (e.status === "enrolled" || e.status === "waitlisted" || e.status === "completed"));

export function searchPeople(u: StaffRecord, courseId: string, q: string): Result<{ items: PersonHit[] }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCourse(courseId);
  if (!c) return no(404, "NOT_FOUND", NOT_FOUND);
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return ok({ items: [] });
  const items = db.learnPeople
    .filter((p) => p.name.toLowerCase().includes(needle) || p.email.includes(needle))
    .slice(0, 12)
    .map((p) => ({ id: p.id, name: p.name, email: p.email, learner: p.learner, enrolled: !!holding(c, p.id), missing: missingSteps(c, p.id) }));
  return ok({ items });
}

const seatsTaken = (c: CourseRecord) => activeEnrolments(c.id).filter((e) => e.status === "enrolled").length;
const renumberWaitlist = (c: CourseRecord) =>
  enrolmentsOf(c.id)
    .filter((e) => e.status === "waitlisted")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .forEach((e, i) => {
      e.position = i + 1;
    });

/** Automatic waitlist (Figma Create a class §3): free seats go to the people waiting, in order. */
function fillSeats(c: CourseRecord, u: StaffRecord): string[] {
  if (!c.waitlist) return [];
  const out: string[] = [];
  const waiting = enrolmentsOf(c.id)
    .filter((e) => e.status === "waitlisted")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  for (const e of waiting) {
    if (c.seats !== null && seatsTaken(c) >= c.seats) break;
    e.status = "enrolled";
    e.position = null;
    out.push(person(e.personId)!.name);
    audit(u.id, "learn.enrol.promote", c.id, { after: { person: person(e.personId)!.name, automatic: true } });
  }
  renumberWaitlist(c);
  return out;
}

export function enrol(u: StaffRecord, courseId: string, body: { personId?: string; waive?: string }): Result<{ enrolment: Enrolment }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCourse(courseId);
  if (!c) return no(404, "NOT_FOUND", NOT_FOUND);
  const status = statusOf(c);
  if (status === "archived" || status === "completed") return no(422, "CLOSED", "This class has finished, so nobody new can join it.");
  const p = body.personId ? person(body.personId) : undefined;
  if (!p) return no(422, "VALIDATION_FAILED", "Choose a person.", { personId: ["Choose a person"] });
  if (holding(c, p.id)) return no(422, "ALREADY_ENROLLED", `${p.name} is already on this class.`, { personId: ["Already on this class"] });
  if (c.audience === "members" && p.learner) return no(422, "MEMBERS_ONLY", `${p.name} is an External Student and this class is for members only.`, { personId: ["Members only"] });
  const missing = missingSteps(c, p.id);
  const waive = String(body.waive ?? "").trim();
  if (missing.length && waive.length < 5)
    return no(422, "PREREQUISITE", `${p.name} hasn't finished ${missing.join(" and ")} yet. Give a reason to let them join anyway.`, { waive: ["Say why they can join without it"] });
  const full = c.seats !== null && seatsTaken(c) >= c.seats;
  if (full && !c.waitlist) return no(422, "FULL", "The class is full and has no waitlist. Raise the seats first.");
  const previous = enrolmentsOf(c.id).find((e) => e.personId === p.id && e.status === "withdrawn");
  const e: EnrolmentRecord = previous ?? { id: `e-new-${crypto.randomUUID().slice(0, 6)}`, courseId: c.id, personId: p.id, status: "enrolled", enrolledAt: "", position: null, opened: 0, waived: null, withdrawnReason: null };
  e.position = full ? enrolmentsOf(c.id).filter((x) => x.status === "waitlisted").length + 1 : null;
  e.status = full ? "waitlisted" : "enrolled";
  e.enrolledAt = new Date().toISOString();
  e.waived = missing.length ? waive : null;
  e.withdrawnReason = null;
  if (!previous) db.learnEnrolments.push(e);
  audit(u.id, full ? "learn.enrol.waitlist" : "learn.enrol.add", c.id, { after: { person: p.name, ...(missing.length ? { waived: `${missing.join(", ")}: ${waive}` } : {}) } });
  return ok({ enrolment: toEnrolment(e) }, 201);
}

export function withdraw(u: StaffRecord, enrolmentId: string, reason: string): Result<{ enrolment: Enrolment; promoted: string[] }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const e = db.learnEnrolments.find((x) => x.id === enrolmentId);
  const c = e && findCourse(e.courseId);
  if (!e || !c) return no(404, "NOT_FOUND", "That person is no longer on this class.");
  if (e.status === "withdrawn") return no(422, "ALREADY_WITHDRAWN", "They have already left this class.");
  if (e.status === "completed") return no(422, "COMPLETED", "They finished this class. Their record stays.");
  const why = String(reason ?? "").trim();
  if (why.length < 3) return no(422, "VALIDATION_FAILED", "Say why they are leaving.", { reason: ["Say why they are leaving"] });
  const wasSeat = e.status === "enrolled";
  e.status = "withdrawn";
  e.position = null;
  e.withdrawnReason = why.slice(0, 200);
  renumberWaitlist(c);
  audit(u.id, "learn.enrol.withdraw", c.id, { after: { person: person(e.personId)!.name, reason: e.withdrawnReason } });
  const promoted = wasSeat ? fillSeats(c, u) : [];
  return ok({ enrolment: toEnrolment(e), promoted });
}

/** Give a waiting person a seat now, out of turn if need be. */
export function promote(u: StaffRecord, enrolmentId: string): Result<{ enrolment: Enrolment }> {
  if (!canManage(u)) return no(403, "FORBIDDEN", FORBIDDEN);
  const e = db.learnEnrolments.find((x) => x.id === enrolmentId);
  const c = e && findCourse(e.courseId);
  if (!e || !c) return no(404, "NOT_FOUND", "That person is no longer on this class.");
  if (e.status !== "waitlisted") return no(422, "NOT_WAITING", "They aren't on the waitlist.");
  if (c.seats !== null && seatsTaken(c) >= c.seats) return no(422, "FULL", "Every seat is taken. Raise the seats in Edit class, or wait for someone to leave.");
  e.status = "enrolled";
  e.position = null;
  renumberWaitlist(c);
  audit(u.id, "learn.enrol.promote", c.id, { after: { person: person(e.personId)!.name, automatic: false } });
  return ok({ enrolment: toEnrolment(e) });
}

export function logRosterExport(u: StaffRecord, courseId: string): Result<{ logged: true }> {
  const c = findCourse(courseId);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  if (!allowed(u, "learn.export")) return no(403, "FORBIDDEN", FORBIDDEN);
  audit(u.id, "learn.roster.export", c.id, { after: { people: enrolmentsOf(c.id).length } });
  return ok({ logged: true });
}

/* =============================================================== overview */

export function overview(u: StaffRecord, now = Date.now()): Result<GrowOverview> {
  if (!allowed(u, "learn.view")) return no(403, "FORBIDDEN", FORBIDDEN);
  const today = churchDate(new Date(now));
  const term = termOf(today);
  const week = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${term.start}T12:00:00Z`)) / (7 * DAY)) + 1;
  const mine = db.learnCourses.filter((c) => canSee(u, c) && c.state !== "archived");
  const live = mine.filter((c) => c.state === "published" && statusOf(c, now) !== "completed");
  const people = new Set(live.flatMap((c) => enrolmentsOf(c.id).filter((e) => e.status === "enrolled").map((e) => e.personId)));
  const waiting = live.reduce((n, c) => n + enrolmentsOf(c.id).filter((e) => e.status === "waitlisted").length, 0);
  const horizon = now + 7 * DAY;

  const weekRows: GrowOverview["week"] = [];
  for (const c of live) {
    for (const s of sessionsOf(c.id)) {
      if (!s.startsAt) continue;
      const t = Date.parse(s.startsAt);
      if (t < now - 2 * 3600_000 || t > horizon) continue;
      weekRows.push({
        courseId: c.id,
        sessionId: s.id,
        title: c.title,
        sessionTitle: `${s.number}. ${s.title}`,
        at: s.startsAt,
        where: c.schedule.where === "online" ? "Live online" : `In person${c.schedule.place ? ` (${c.schedule.place})` : ""}`,
        enrolled: seatsTaken(c),
        teachers: c.teacherIds.map((id) => staffPerson(id).name),
      });
    }
  }
  weekRows.sort((a, b) => a.at.localeCompare(b.at));

  const attention: GrowOverview["attention"] = [];
  for (const c of mine) {
    const status = statusOf(c, now);
    if (c.state === "draft") {
      const first = sessionsOf(c.id)[0]?.startsAt;
      const failing = publishChecks(c).filter((x) => !x.ok).length;
      attention.push({
        id: `draft-${c.id}`,
        kind: "draft",
        title: `${c.title} is still a draft`,
        detail: `${first ? `First session ${formatWhen(first)}. ` : ""}${failing ? `${failing} thing${failing === 1 ? "" : "s"} to finish before it can be published.` : "Ready to publish."}`,
        courseId: c.id,
        action: failing ? "Finish the class" : "Review and publish",
      });
      continue;
    }
    attention.push(...teachingAttention(c, now), ...reviewAttention(u, c), ...forumAttention(u, c));
    if (status === "completed") continue;
    for (const s of sessionsOf(c.id)) {
      if (s.state !== "draft" || !s.startsAt) continue;
      const t = Date.parse(s.startsAt);
      if (t < now || t > horizon) continue;
      attention.push({
        id: `unpub-${s.id}`,
        kind: "unpublished",
        title: `${c.title}: session ${s.number} isn't published`,
        detail: `“${s.title}” meets ${formatWhen(s.startsAt)}. ${isEmpty(s) ? "It has no content yet." : "Its content is ready to publish."}`,
        courseId: c.id,
        action: isEmpty(s) ? "Add content" : "Publish session",
      });
    }
    const waitingHere = enrolmentsOf(c.id).filter((e) => e.status === "waitlisted").length;
    if (waitingHere && c.seats !== null && seatsTaken(c) >= c.seats)
      attention.push({
        id: `full-${c.id}`,
        kind: "full",
        title: `${c.title} is full`,
        detail: `${waitingHere} ${waitingHere === 1 ? "person is" : "people are"} on the waitlist for ${c.seats} seats.`,
        courseId: c.id,
        action: "Open the roster",
      });
  }

  const certs = certificateAttention(u, now);
  attention.push(...certs.items);
  return ok({
    term: { label: `${term.label} term`, week },
    tiles: { enrolled: people.size, waitlisted: waiting, running: live.filter((c) => statusOf(c, now) === "in_session").length, sessionsThisWeek: weekRows.length, joinedThisWeek: joinedThisWeek(mine, now), awaitingCertificates: certs.awaiting },
    attention,
    week: weekRows,
    can: { manage: canManage(u) },
  });
}

/** QR codes that open a course (PRD 5.8) list the published classes. */
export const qrCourseTargets = () =>
  db.learnCourses
    .filter((c) => c.state === "published")
    .map((c) => ({ id: c.id, name: c.title, hint: scheduleLabel(c) }));

/** The session page (Figma 136:26483). */
export const sessionDetail = (u: StaffRecord, id: string, now = Date.now()) => getSessionDetail(u, id, { toSession: (c, s) => toSession(c, s), statusOf: (c) => statusOf(c, now) }, now);
