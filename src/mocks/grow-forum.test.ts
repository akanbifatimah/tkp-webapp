import { describe, expect, it } from "vitest";
import type { Result } from "./connect-api";
import { db } from "./db";
import { overview, sessionDetail } from "./grow-api";
import { createPrompt, editPrompt, getThread, listForum, replyToThread, setHidden, setThreadFlag } from "./grow-forum";

/** M8 step 5: the cohort forum (Figma 136:29952, 136:30735). docs/API.md §17. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const CHURCH_ADMIN = "u04";
const REGISTRAR = "u23";
const DOYIN = "u18"; // teaches Growth Class
const KEMI = "u24"; // grades Growth Class
const FOLABI = "u19"; // teaches New Believers
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const last = () => db.audit[0]!;
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};
const list = (q: Parameters<typeof listForum>[2] = {}, who = DOYIN) => must(listForum(user(who), "c-growth", q));

describe("Forum list (Figma Cohort Community and Forum)", () => {
  it("shows the pinned prompt, stats, filters and pages", () => {
    const r = list();
    expect(r.pinned?.title).toMatch(/^Session 5 reflection prompt/);
    expect(r.pinned?.replies).toBe(18);
    expect(r.items.some((t) => t.id === r.pinned!.id)).toBe(false);
    expect(r.stats.needsPastor).toBe(3);
    expect(r.stats.participation).toBeGreaterThan(0);
    expect(r.counts.pastor).toBe(3);
    expect(r.counts.all).toBe(r.counts.reflection + r.counts.prayer + r.counts.question + r.counts.testimony);
    expect(r.items).toHaveLength(10);
    expect(r.total).toBeGreaterThan(10);
    expect(list({ page: 2 }).items.length).toBe(r.total - 10);
    expect(r.course.moderators).toEqual(["Doyin Olusanya"]);
    expect(r.can).toEqual({ moderate: true, reply: true });
  });

  it("filters, searches and sorts", () => {
    const p = list({ filter: "pastor" });
    expect(p.items.map((t) => t.title).sort()).toEqual(["How do I know it's the Spirit and not my own thoughts?", "How do I maintain stillness when morning family duties are hectic?", "Please pray for my mother's surgery on Thursday"]);
    expect(p.items.every((t) => t.needsPastor)).toBe(true);
    expect(list({ filter: "prayer" }).items.every((t) => t.kind === "prayer")).toBe(true);
    expect(list({ q: "toddlers" }).items.map((t) => t.id)).toEqual(["ft-g-stillness"]);
    const byReplies = list({ sort: "replies" }).items;
    expect(byReplies[0]!.replies).toBeGreaterThanOrEqual(byReplies[1]!.replies);
    // The pastor's reply shows under its thread.
    expect(list({ q: "secret-place" }).items[0]!.pastoral?.by).toBe("Doyin Olusanya");
  });

  it("hidden posts show to moderators only", () => {
    expect(list().items.concat(list({ page: 2 }).items).some((t) => t.id === "ft-g-hidden" && t.hidden?.reason)).toBe(true);
    const ro = must(listForum(user(KEMI), "c-growth", {}));
    expect(ro.can).toEqual({ moderate: false, reply: false });
    expect([...ro.items, ...must(listForum(user(KEMI), "c-growth", { page: 2 })).items].some((t) => t.id === "ft-g-hidden")).toBe(false);
    expect(getThread(user(KEMI), "ft-g-hidden").status).toBe(404);
    expect(listForum(user(FOLABI), "c-growth", {}).status).toBe(404);
  });

  it("asks the dashboard and the session page", () => {
    expect(must(overview(user(DOYIN))).attention.some((a) => a.kind === "forum" && a.to === "/grow/classes/c-growth/forum?filter=pastor")).toBe(true);
    expect(must(overview(user(KEMI))).attention.some((a) => a.kind === "forum")).toBe(false);
    expect(must(sessionDetail(user(DOYIN), "c-growth-s5")).stats.forumThreads).toBeGreaterThanOrEqual(3);
  });
});

describe("Thread (Figma Forum thread detail)", () => {
  it("shows the post and the replies in order", () => {
    const t = must(getThread(user(DOYIN), "ft-g-stillness"));
    expect(t.body).toMatch(/two toddlers/);
    expect(t.posts).toHaveLength(2);
    expect(t.posts[0]!.createdAt < t.posts[1]!.createdAt).toBe(true);
    expect(t.needsPastor).toBe(true);
    expect(t.can).toEqual({ moderate: true, reply: true, editPrompt: false });
  });

  it("a pastoral reply answers the question, and is logged", () => {
    expect(code(replyToThread(user(DOYIN), "ft-g-stillness", { body: " " }))).toBe("VALIDATION_FAILED");
    expect(code(replyToThread(user(KEMI), "ft-g-stillness", { body: "Hello" }))).toBe("FORBIDDEN");
    expect(code(replyToThread(user(CHURCH_ADMIN), "ft-g-stillness", { body: "Hello" }))).toBe("FORBIDDEN");
    const t = must(replyToThread(user(DOYIN), "ft-g-stillness", { body: "Dear Chisom, God measures devotion by the posture of our surrender.\n\n> He will gently lead those that have young. — Isaiah 40:11" }));
    expect(t.posts.at(-1)).toMatchObject({ pastoral: true, author: { name: "Doyin Olusanya", staff: true, role: "Class teacher" } });
    expect(t.needsPastor).toBe(false);
    expect(t.pastoral?.by).toBe("Doyin Olusanya");
    expect(last()).toMatchObject({ action: "learn.forum.reply" });
    expect(list().stats.needsPastor).toBe(2);
  });

  it("mark shepherd done takes it off the list, and can be undone", () => {
    const done = must(setThreadFlag(user(DOYIN), "ft-g-voice", "shepherdDone", true));
    expect(done).toMatchObject({ needsPastor: false, shepherdDone: { by: "Doyin Olusanya" } });
    expect(must(setThreadFlag(user(DOYIN), "ft-g-voice", "shepherdDone", false)).needsPastor).toBe(true);
    expect(last().action).toBe("learn.forum.unshepherd");
  });

  it("one pinned prompt per class; staff can start and edit prompts", () => {
    const t = must(createPrompt(user(REGISTRAR), "c-growth", { title: "Session 6 reflection prompt", body: "What will you carry from this class into the next season?", session: 6, pin: true }));
    expect(t).toMatchObject({ pinned: true, author: { role: "Registrar" }, can: { editPrompt: true } });
    expect(db.forumThreads.filter((x) => x.courseId === "c-growth" && x.pinned).map((x) => x.id)).toEqual([t.id]);
    expect(code(createPrompt(user(DOYIN), "c-growth", { title: "Hi", body: "Short", session: 99 }))).toBe("VALIDATION_FAILED");
    const edited = must(editPrompt(user(DOYIN), t.id, { title: "Session 6 reflection: carrying it forward", body: t.body }));
    expect(edited.title).toBe("Session 6 reflection: carrying it forward");
    expect(code(editPrompt(user(DOYIN), "ft-g-stillness", { title: "Changed title", body: "Changed body text" }))).toBe("NOT_EDITABLE");
    must(setThreadFlag(user(DOYIN), "ft-g-prompt", "pinned", true));
    expect(list().pinned?.id).toBe("ft-g-prompt");
  });

  it("locks, and still lets a pastor reply", () => {
    must(setThreadFlag(user(DOYIN), "ft-g-fasting", "locked", true));
    expect(must(replyToThread(user(DOYIN), "ft-g-fasting", { body: "Closing this one. Thank you all." })).locked).toBe(true);
    expect(last().action).toBe("learn.forum.reply");
  });

  it("hides a reply or a thread with a reason, and restores it", () => {
    const p = db.forumPosts.find((x) => x.threadId === "ft-g-plan" && !x.pastoral)!;
    expect(code(setHidden(user(DOYIN), "post", p.id, "no"))).toBe("VALIDATION_FAILED");
    must(setHidden(user(DOYIN), "post", p.id, "Shared a phone number publicly"));
    expect(must(getThread(user(DOYIN), "ft-g-plan")).posts.find((x) => x.id === p.id)?.hidden?.reason).toBe("Shared a phone number publicly");
    expect(must(getThread(user(KEMI), "ft-g-plan")).posts.some((x) => x.id === p.id)).toBe(false);
    expect(last().action).toBe("learn.forum.hide");
    must(setHidden(user(DOYIN), "post", p.id, null));
    expect(last().action).toBe("learn.forum.restore");
    expect(code(setHidden(user(KEMI), "thread", "ft-g-plan", "Off topic here"))).toBe("FORBIDDEN");
  });
});
