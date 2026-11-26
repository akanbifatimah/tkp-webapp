import type {
  ForumAuthor,
  ForumFilter,
  ForumPost,
  ForumResponse,
  ForumSort,
  GrowOverview,
  Hidden,
  NewPromptInput,
  ThreadDetail,
  ThreadSummary,
} from "@/features/grow/grow-types";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { activeEnrolments, canManage, canSee, DAY, findCourse, FORBIDDEN, no, NOT_FOUND, ok, person, sessionsOf, staffPerson } from "./grow-core";
import type { PostRecord, ThreadRecord } from "./seed/forum";
import type { CourseRecord } from "./seed/grow";
import type { StaffRecord } from "./seed/staff";

/**
 * M8 step 5 (docs/API.md §17): the cohort forum, staff side (Figma 136:29952
 * "Cohort Community & Forum", 136:30735 "Forum thread detail"). Learners post
 * from the member app; staff read, reply as pastors and moderate here.
 */

const GONE = "That conversation no longer exists.";
const PAGE_SIZE = 10;

/** Class teachers and the Registrar reply as pastors and moderate. Graders and Church Admin read. */
export const canModerate = (u: StaffRecord, c: CourseRecord) => canManage(u) || c.teacherIds.includes(u.id);

const author = (c: CourseRecord, x: { authorEnrolmentId: string | null; authorStaffId: string | null }): ForumAuthor => {
  if (x.authorStaffId) {
    const role = c.teacherIds.includes(x.authorStaffId) ? "Class teacher" : db.staff.find((s) => s.id === x.authorStaffId)?.roles.includes("registrar") ? "Registrar" : "Staff";
    return { name: staffPerson(x.authorStaffId).name, staff: true, role };
  }
  const e = db.learnEnrolments.find((y) => y.id === x.authorEnrolmentId);
  return { name: (e && person(e.personId)?.name) ?? "Former member", staff: false, role: null };
};
const hidden = (h: ThreadRecord["hidden"]): Hidden => (h ? { by: staffPerson(h.byId).name, reason: h.reason, at: h.at } : null);
const postsOf = (threadId: string) => db.forumPosts.filter((p) => p.threadId === threadId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** A question or prayer request waits for a pastor until one replies or marks it done. */
const needsPastor = (t: ThreadRecord) => !t.hidden && (t.kind === "question" || t.kind === "prayer") && !t.shepherdDone && !postsOf(t.id).some((p) => p.pastoral && !p.hidden);

function summary(c: CourseRecord, t: ThreadRecord): ThreadSummary {
  const posts = postsOf(t.id);
  const visible = posts.filter((p) => !p.hidden);
  const last = visible.at(-1);
  const pastoral = [...visible].reverse().find((p) => p.pastoral);
  const text = t.body.replace(/\s+/g, " ");
  return {
    id: t.id,
    kind: t.kind,
    session: t.session,
    title: t.title,
    excerpt: text.length > 260 ? `${text.slice(0, 257)}…` : text,
    body: t.body,
    author: author(c, t),
    createdAt: t.createdAt,
    lastActivityAt: last?.createdAt ?? t.createdAt,
    lastBy: last ? author(c, last).name : null,
    replies: visible.length,
    amens: t.amens,
    pinned: t.pinned,
    locked: t.locked,
    hidden: hidden(t.hidden),
    needsPastor: needsPastor(t),
    shepherdDone: t.shepherdDone ? { by: staffPerson(t.shepherdDone.byId).name, at: t.shepherdDone.at } : null,
    pastoral: pastoral ? { by: author(c, pastoral).name, body: pastoral.body } : null,
  };
}

const FILTERS: ForumFilter[] = ["all", "pastor", "reflection", "prayer", "question", "testimony"];
const matches = (f: ForumFilter, t: ThreadRecord) => (f === "all" ? true : f === "pastor" ? needsPastor(t) : t.kind === f);

export function listForum(u: StaffRecord, courseId: string, q: { filter?: string; q?: string; sort?: string; page?: number }, now = Date.now()): Result<ForumResponse> {
  const c = findCourse(courseId);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  const moderate = canModerate(u, c);
  // Hidden threads stay visible to moderators (marked), never to anyone else.
  const all = db.forumThreads.filter((t) => t.courseId === c.id && (moderate || !t.hidden));
  const filter = (FILTERS.includes(q.filter as ForumFilter) ? q.filter : "all") as ForumFilter;
  const sort = (["activity", "newest", "replies"].includes(q.sort ?? "") ? q.sort : "activity") as ForumSort;
  const needle = (q.q ?? "").trim().toLowerCase();
  const pinnedRec = all.find((t) => t.pinned && !t.hidden);
  const rows = all
    .filter((t) => t.id !== pinnedRec?.id || filter !== "all" || needle)
    .filter((t) => matches(filter, t))
    .map((t) => summary(c, t))
    .filter((t) => !needle || `${t.title} ${t.excerpt} ${t.author.name}`.toLowerCase().includes(needle))
    .sort((a, b) =>
      sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : sort === "replies" ? b.replies - a.replies : b.lastActivityAt.localeCompare(a.lastActivityAt),
    );
  const page = Math.max(1, Math.min(Number(q.page) || 1, Math.max(1, Math.ceil(rows.length / PAGE_SIZE))));
  const counts = Object.fromEntries(FILTERS.map((f) => [f, all.filter((t) => !t.hidden && matches(f, t)).length])) as Record<ForumFilter, number>;
  const people = activeEnrolments(c.id);
  const since = now - 30 * DAY;
  const active = new Set<string>();
  for (const t of all) if (t.authorEnrolmentId && Date.parse(t.createdAt) > since) active.add(t.authorEnrolmentId);
  for (const p of db.forumPosts) if (p.authorEnrolmentId && Date.parse(p.createdAt) > since && all.some((t) => t.id === p.threadId)) active.add(p.authorEnrolmentId);
  const participants = people.filter((e) => active.has(e.id)).length;
  return ok({
    course: { id: c.id, title: c.title, enrolled: people.length, moderators: c.teacherIds.map((id) => staffPerson(id).name) },
    stats: { threads: counts.all, needsPastor: counts.pastor, participation: people.length ? Math.round((participants / people.length) * 100) : 0, participants },
    counts,
    pinned: pinnedRec && filter === "all" && !needle ? summary(c, pinnedRec) : null,
    items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageSize: PAGE_SIZE,
    total: rows.length,
    can: { moderate, reply: moderate && c.state !== "archived" },
  });
}

function scope(u: StaffRecord, threadId: string): { t: ThreadRecord; c: CourseRecord } | Result<never> {
  const t = db.forumThreads.find((x) => x.id === threadId);
  const c = t && findCourse(t.courseId);
  if (!t || !c || !canSee(u, c) || (t.hidden && !canModerate(u, c))) return no(404, "NOT_FOUND", GONE);
  return { t, c };
}

export function getThread(u: StaffRecord, threadId: string): Result<ThreadDetail> {
  const r = scope(u, threadId);
  if ("ok" in r) return r;
  const { t, c } = r;
  const moderate = canModerate(u, c);
  const posts: ForumPost[] = postsOf(t.id)
    .filter((p) => moderate || !p.hidden)
    .map((p) => ({ id: p.id, author: author(c, p), body: p.body, createdAt: p.createdAt, pastoral: p.pastoral, amens: p.amens, hidden: hidden(p.hidden) }));
  return ok({
    ...summary(c, t),
    courseId: c.id,
    courseTitle: c.title,
    posts,
    can: { moderate, reply: moderate && c.state !== "archived" && !t.hidden, editPrompt: moderate && !!t.authorStaffId },
  });
}

const cleanBody = (raw: unknown) => String(raw ?? "").replace(/\r\n/g, "\n").trim();

/** "Post pastoral guidance" (Figma). Staff replies are always pastoral; they can reply on a locked thread. */
export function replyToThread(u: StaffRecord, threadId: string, body: { body?: string }, now = Date.now()): Result<ThreadDetail> {
  const r = scope(u, threadId);
  if ("ok" in r) return r;
  const { t, c } = r;
  if (!canModerate(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Its forum is read-only.");
  if (t.hidden) return no(422, "HIDDEN", "This conversation is hidden. Restore it before replying.");
  const text = cleanBody(body.body);
  if (text.length < 2) return no(422, "VALIDATION_FAILED", "Write your reply first.", { body: ["Write your reply first"] });
  if (text.length > 4000) return no(422, "VALIDATION_FAILED", "Keep it under 4,000 characters.", { body: ["Keep it under 4,000 characters"] });
  const p: PostRecord = { id: `fp-${crypto.randomUUID().slice(0, 8)}`, threadId: t.id, authorEnrolmentId: null, authorStaffId: u.id, body: text, createdAt: new Date(now).toISOString(), pastoral: true, amens: 0, hidden: null };
  db.forumPosts.push(p);
  audit(u.id, "learn.forum.reply", c.id, { after: { thread: t.title } });
  return getThread(u, t.id);
}

/** Staff start a reflection prompt (the Figma's pinned "Session 5 Reflection Prompt"). */
export function createPrompt(u: StaffRecord, courseId: string, input: Partial<NewPromptInput>, now = Date.now()): Result<ThreadDetail> {
  const c = findCourse(courseId);
  if (!c || !canSee(u, c)) return no(404, "NOT_FOUND", NOT_FOUND);
  if (!canModerate(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (c.state === "archived") return no(422, "ARCHIVED", "This class is archived. Its forum is read-only.");
  const f: Record<string, string[]> = {};
  const title = String(input.title ?? "").trim();
  const text = cleanBody(input.body);
  if (title.length < 5 || title.length > 160) f.title = ["Between 5 and 160 characters"];
  if (text.length < 10 || text.length > 4000) f.body = ["Between 10 and 4,000 characters"];
  const session = input.session === null || input.session === undefined ? null : Number(input.session);
  if (session !== null && !sessionsOf(c.id).some((s) => s.number === session)) f.session = ["Choose a session of this class"];
  if (Object.keys(f).length) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", f);
  if (input.pin) for (const t of db.forumThreads) if (t.courseId === c.id) t.pinned = false;
  const t: ThreadRecord = {
    id: `ft-${crypto.randomUUID().slice(0, 8)}`,
    courseId: c.id,
    kind: "reflection",
    session,
    title,
    body: text,
    authorEnrolmentId: null,
    authorStaffId: u.id,
    createdAt: new Date(now).toISOString(),
    pinned: !!input.pin,
    locked: false,
    hidden: null,
    shepherdDone: null,
    amens: 0,
  };
  db.forumThreads.push(t);
  audit(u.id, "learn.forum.prompt", c.id, { after: { thread: title, pinned: t.pinned } });
  return getThread(u, t.id);
}

/** "Edit message" on a staff prompt. Learners' words are never edited, only hidden. */
export function editPrompt(u: StaffRecord, threadId: string, input: { title?: string; body?: string }): Result<ThreadDetail> {
  const r = scope(u, threadId);
  if ("ok" in r) return r;
  const { t, c } = r;
  if (!canModerate(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (!t.authorStaffId) return no(422, "NOT_EDITABLE", "Members' posts can't be edited. Hide it instead, with a reason.");
  const title = String(input.title ?? "").trim();
  const text = cleanBody(input.body);
  const f: Record<string, string[]> = {};
  if (title.length < 5 || title.length > 160) f.title = ["Between 5 and 160 characters"];
  if (text.length < 10 || text.length > 4000) f.body = ["Between 10 and 4,000 characters"];
  if (Object.keys(f).length) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", f);
  const before = { title: t.title };
  t.title = title;
  t.body = text;
  audit(u.id, "learn.forum.edit", c.id, { before, after: { title } });
  return getThread(u, t.id);
}

type Flag = "pinned" | "locked" | "shepherdDone";
/** Pin (one per class), lock, and "Mark shepherd done". */
export function setThreadFlag(u: StaffRecord, threadId: string, flag: Flag, on: boolean, now = Date.now()): Result<ThreadDetail> {
  const r = scope(u, threadId);
  if ("ok" in r) return r;
  const { t, c } = r;
  if (!canModerate(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  if (t.hidden) return no(422, "HIDDEN", "Restore it first.");
  if (flag === "pinned") {
    if (on) for (const x of db.forumThreads) if (x.courseId === c.id) x.pinned = false;
    t.pinned = on;
  } else if (flag === "locked") t.locked = on;
  else t.shepherdDone = on ? { byId: u.id, at: new Date(now).toISOString() } : null;
  const action = flag === "pinned" ? (on ? "learn.forum.pin" : "learn.forum.unpin") : flag === "locked" ? (on ? "learn.forum.lock" : "learn.forum.unlock") : on ? "learn.forum.shepherd" : "learn.forum.unshepherd";
  audit(u.id, action, c.id, { after: { thread: t.title } });
  return getThread(u, t.id);
}

/** Hide a thread or a reply, with a reason. It stays for moderators and can be restored. */
export function setHidden(u: StaffRecord, kind: "thread" | "post", id: string, reason: string | null, now = Date.now()): Result<{ hidden: boolean }> {
  const post = kind === "post" ? db.forumPosts.find((p) => p.id === id) : undefined;
  const r = scope(u, kind === "thread" ? id : (post?.threadId ?? ""));
  if ("ok" in r) return kind === "post" && !post ? no(404, "NOT_FOUND", "That reply no longer exists.") : r;
  const { t, c } = r;
  if (!canModerate(u, c)) return no(403, "FORBIDDEN", FORBIDDEN);
  const target = kind === "thread" ? t : post!;
  if (reason === null) {
    target.hidden = null;
    audit(u.id, `learn.forum.restore`, c.id, { after: { thread: t.title, [kind]: kind === "post" ? post!.body.slice(0, 60) : t.title } });
    return ok({ hidden: false });
  }
  const why = reason.trim();
  if (why.length < 5) return no(422, "VALIDATION_FAILED", "Say why it's being hidden.", { reason: ["Say why, so other moderators know"] });
  target.hidden = { byId: u.id, reason: why.slice(0, 200), at: new Date(now).toISOString() };
  if (kind === "thread") t.pinned = false;
  audit(u.id, "learn.forum.hide", c.id, { after: { thread: t.title, reason: why, [kind]: kind === "post" ? post!.body.slice(0, 60) : t.title } });
  return ok({ hidden: true });
}

/** Dashboard: questions and prayer requests waiting for a pastor in the classes someone teaches. */
export function forumAttention(u: StaffRecord, c: CourseRecord): GrowOverview["attention"] {
  if (!canModerate(u, c)) return [];
  const waiting = db.forumThreads.filter((t) => t.courseId === c.id && needsPastor(t));
  if (!waiting.length) return [];
  return [
    {
      id: `forum-${c.id}`,
      kind: "forum",
      title: `${c.title}: ${waiting.length} ${waiting.length === 1 ? "question waits" : "questions and prayer requests wait"} for a pastor`,
      detail: `Latest: “${waiting.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!.title}”.`,
      courseId: c.id,
      to: `/grow/classes/${c.id}/forum?filter=pastor`,
      action: "Open the forum",
    },
  ];
}
