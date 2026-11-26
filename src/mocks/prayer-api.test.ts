import { describe, expect, it } from "vitest";
import type { Result } from "./connect-api";
import { db } from "./db";
import {
  addNote,
  approvePost,
  contactProblem,
  editPost,
  listPrayer,
  listPrivate,
  posterIdentity,
  prayFor,
  prayOver,
  publicFeed,
  publicPost,
  removePost,
  reportPost,
  restorePost,
  setAnswered,
  setPrivateStatus,
  sweep,
  updateSettings,
} from "./prayer-api";

/** M9 step 1: Prayer Wall moderation (PRD 5.4 PR-1 to PR-12, OS-1, OS-2). docs/API.md §18. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const TECH = "u01";
const TECH_TEAM = "u02";
const CHURCH_ADMIN = "u04";
const FOLASADE = "u25"; // Prayer Moderator
const TIWA = "u26";
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const last = () => db.audit[0]!;
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};
const post = (id: string) => db.prayerPosts.find((p) => p.id === id)!;
let dev = 0;
const device = () => `test-device-${dev++}`;

describe("Who moderates (TKP, 2026-11-26)", () => {
  it("Prayer Moderators, Church Admin and Tech Admin moderate; Tech Team looks; others can't", () => {
    for (const id of [FOLASADE, CHURCH_ADMIN, TECH]) expect(must(listPrayer(user(id), {})).can.moderate).toBe(true);
    expect(must(listPrayer(user(TECH_TEAM), {})).can).toEqual({ moderate: false, settings: false, identity: false });
    for (const id of ["u03", "u11", "u13", "u23"]) expect(listPrayer(user(id), {}).status).toBe(403);
    expect(must(listPrayer(user(CHURCH_ADMIN), {})).can.settings).toBe(true);
    expect(must(listPrayer(user(FOLASADE), {})).can.settings).toBe(false);
  });

  it("private requests are for the Prayer Moderators only", () => {
    expect(must(listPrivate(user(FOLASADE), {})).items.length).toBeGreaterThan(0);
    for (const id of [TECH, CHURCH_ADMIN, TECH_TEAM]) expect(listPrivate(user(id), {}).status).toBe(403);
  });
});

describe("The review queue (PR-4, PR-5, PR-9)", () => {
  it("starts with held, reported and distress-flagged requests, the distress ones first", () => {
    const r = must(listPrayer(user(FOLASADE), {}));
    expect(r.settings.mode).toBe("hold");
    expect(r.counts).toMatchObject({ pending: 5, hidden: 2, distress: 1 });
    expect(r.items[0]!.distress).toEqual(["no reason to live"]);
    expect(r.items.every((p) => p.status === "pending" || p.status === "hidden")).toBe(true);
    expect(must(listPrayer(user(FOLASADE), { filter: "published", category: "Healing" })).items.every((p) => p.category === "Healing" && p.status === "published")).toBe(true);
  });

  it("approves onto the wall, and dismisses the reports on a hidden one", () => {
    const pending = db.prayerPosts.find((p) => p.status === "pending" && !p.distress.length)!;
    expect(code(approvePost(user(TECH_TEAM), pending.id, pending.rowVer))).toBe("FORBIDDEN");
    expect(code(approvePost(user(FOLASADE), pending.id, 99))).toBe("CONFLICT");
    expect(must(approvePost(user(FOLASADE), pending.id, pending.rowVer)).post).toMatchObject({ status: "published", moderatedBy: "Folasade Ayeni" });
    expect(last()).toMatchObject({ action: "prayer.approve", meta: { before: { status: "pending" } } });
    const hidden = db.prayerPosts.find((p) => p.status === "hidden")!;
    const r = must(approvePost(user(TIWA), hidden.id, hidden.rowVer)).post;
    expect(r.reports).toEqual([]);
    expect(r.notes.at(-1)!.text).toMatch(/3 reports reviewed and dismissed/);
  });

  it("edits with a reason and keeps the original; refuses contact details", () => {
    const p = db.prayerPosts.find((x) => x.status === "published" && !x.edited)!;
    const bad = editPost(user(FOLASADE), p.id, { text: "Call me on 832-555-0192", category: p.category, reason: "x", rowVer: p.rowVer });
    expect(!bad.ok && Object.keys(bad.fields ?? {}).sort()).toEqual(["reason", "text"]);
    const original = p.text;
    const r = must(editPost(user(FOLASADE), p.id, { text: "Please pray for my mother's recovery.", category: "Healing", reason: "Shortened", rowVer: p.rowVer })).post;
    expect(r.edited).toMatchObject({ by: "Folasade Ayeni", reason: "Shortened" });
    expect(post(p.id).edited!.before).toBe(original);
    expect(last()).toMatchObject({ action: "prayer.edit", meta: { before: { text: original } } });
  });

  it("removes softly with a reason, and restores before the purge", () => {
    const p = db.prayerPosts.find((x) => x.status === "published")!;
    expect(code(removePost(user(FOLASADE), p.id, { reason: "", rowVer: p.rowVer }))).toBe("VALIDATION_FAILED");
    const r = must(removePost(user(FOLASADE), p.id, { reason: "Duplicate of an earlier request", rowVer: p.rowVer })).post;
    expect(r.status).toBe("removed");
    expect(Date.parse(r.purgeAt!) - Date.now()).toBeGreaterThan(29 * 86_400_000);
    expect(publicFeed({}).items.some((x) => x.id === p.id)).toBe(false);
    must(restorePost(user(TIWA), p.id, post(p.id).rowVer));
    expect(publicFeed({}).items.some((x) => x.id === p.id)).toBe(true);
    expect(last().action).toBe("prayer.restore");
  });

  it("shows who posted only to moderators, and logs the look (PR-7)", () => {
    const anon = db.prayerPosts.find((p) => !p.name)!;
    expect(code(posterIdentity(user(TECH_TEAM), anon.id))).toBe("FORBIDDEN");
    const who = must(posterIdentity(user(FOLASADE), anon.id));
    expect(who.kind).toBe("guest");
    expect(who.device).toMatch(/^dev-/);
    expect(last()).toMatchObject({ action: "prayer.identity.view", target: anon.id });
    expect(publicFeed({}).items.find((x) => x.id === anon.id)?.name ?? "Anonymous").toBe("Anonymous");
  });

  it("keeps moderator notes", () => {
    const p = db.prayerPosts[0]!;
    must(addNote(user(TIWA), p.id, "Pastor knows the family."));
    expect(post(p.id).notes.at(-1)!.text).toBe("Pastor knows the family.");
  });
});

describe("Public routes the portal and app use (PR-1 to PR-3, PR-5, PR-6, PR-9, PR-10)", () => {
  it("the feed shows published requests only, newest first, without who posted", () => {
    const f = publicFeed({});
    expect(f.items.length).toBeGreaterThan(5);
    expect(Object.keys(f.items[0]!).sort()).toEqual(["answered", "category", "createdAt", "id", "name", "prayed", "text"]);
    expect(f.items.every((x) => db.prayerPosts.find((p) => p.id === x.id)!.status === "published")).toBe(true);
  });

  it("posting is held for review in hold mode, needs the human check, and limits devices", () => {
    const d = device();
    expect(code(publicPost({ text: "Pray for me please", device: d }))).toBe("HUMAN_CHECK");
    const r = must(publicPost({ text: "Pray for my exams on Friday", category: "Work", name: "Ada Obi", human: "ok", device: d }));
    expect(r).toMatchObject({ status: "pending", showCareResources: false });
    expect(post(r.id).name).toBe("Ada");
    must(publicPost({ text: "Pray for my sister too", human: "ok", device: d }));
    must(publicPost({ text: "And for my mother", human: "ok", device: d }));
    expect(code(publicPost({ text: "One more request", human: "ok", device: d }))).toBe("TOO_MANY");
  });

  it("refuses phone numbers, emails, links and addresses", () => {
    expect(contactProblem("Call me on (281) 555 0192")).toMatch(/phone/);
    expect(contactProblem("email me at ada@example.com")).toMatch(/email/);
    expect(contactProblem("see www.example.org for more")).toMatch(/link/);
    expect(contactProblem("I live at 12 Oak Ridge Drive")).toMatch(/address/);
    expect(contactProblem("Praying for 3 years of waiting to end")).toBeNull();
    expect(code(publicPost({ text: "text me 832 555 0192", human: "ok", device: device() }))).toBe("VALIDATION_FAILED");
  });

  it("distress words show care resources and hold the post even in publish mode", () => {
    const s = db.prayerSettings;
    must(updateSettings(user(CHURCH_ADMIN), { ...s, mode: "publish" }));
    const plain = must(publicPost({ text: "Thank God for a good week", human: "ok", device: device() }));
    expect(plain.status).toBe("published");
    const worried = must(publicPost({ text: "I feel like I can't go on anymore", human: "ok", device: device() }));
    expect(worried).toMatchObject({ status: "pending", showCareResources: true });
    expect(post(worried.id).distress).toEqual(["can't go on"]);
    must(updateSettings(user(CHURCH_ADMIN), { ...db.prayerSettings, mode: "hold" }));
    expect(last()).toMatchObject({ action: "prayer.settings.update", meta: { before: { mode: "publish" }, after: { mode: "hold" } } });
  });

  it("private requests go to the prayer team, never the wall", () => {
    const r = must(publicPost({ text: "Please pray privately for my health", private: true, contact: "ada@example.com", human: "ok", device: device() }));
    expect(r.status).toBe("private");
    expect(publicFeed({}).items.some((x) => x.id === r.id)).toBe(false);
    expect(must(listPrivate(user(FOLASADE), {})).items.some((x) => x.id === r.id)).toBe(true);
  });

  it("one prayer per device; reports hide a post at the threshold", () => {
    const p = db.prayerPosts.find((x) => x.status === "published")!;
    const before = p.prayedBy.length;
    const d = device();
    expect(must(prayFor(p.id, d)).prayed).toBe(before + 1);
    expect(must(prayFor(p.id, d)).prayed).toBe(before + 1);
    const target = db.prayerPosts.find((x) => x.status === "published" && !x.reports.length)!;
    const r1 = device();
    reportPost(target.id, r1, "Spam");
    reportPost(target.id, r1, "Spam");
    expect(post(target.id).status).toBe("published");
    reportPost(target.id, device(), "Spam");
    reportPost(target.id, device(), "Spam");
    expect(post(target.id).status).toBe("hidden");
    expect(last()).toMatchObject({ action: "prayer.auto_hide" });
  });
});

describe("Settings and retention (PR-4, PR-11)", () => {
  it("only admins change settings, within limits", () => {
    expect(code(updateSettings(user(FOLASADE), { ...db.prayerSettings }))).toBe("FORBIDDEN");
    const r = updateSettings(user(TECH), { ...db.prayerSettings, reportThreshold: 0, distressWords: [], retentionDays: 1, purgeDays: 0 });
    expect(!r.ok && Object.keys(r.fields ?? {}).sort()).toEqual(["distressWords", "purgeDays", "reportThreshold", "retentionDays"]);
  });

  it("takes old posts off the wall and deletes removed posts after the purge date", () => {
    const old = db.prayerPosts.find((p) => p.status === "published")!;
    old.createdAt = new Date(Date.now() - 400 * 86_400_000).toISOString();
    sweep();
    expect(post(old.id)).toMatchObject({ status: "removed", removedReason: "On the wall for 180 days" });
    sweep(Date.now() + 31 * 86_400_000);
    expect(db.prayerPosts.some((p) => p.id === old.id)).toBe(false);
  });
});

describe("Private requests (OS-2)", () => {
  it("each team member marks once that they prayed; follow-up needs a note", () => {
    const r = db.prayerPrivate.find((x) => x.status === "new" && !x.prayedBy.length)!;
    const after = must(prayOver(user(FOLASADE), r.id)).request;
    expect(after).toMatchObject({ status: "praying", prayedBy: [{ name: "Folasade Ayeni" }] });
    expect(code(prayOver(user(FOLASADE), r.id))).toBe("ALREADY");
    expect(code(setPrivateStatus(user(TIWA), r.id, { status: "follow_up", rowVer: after.rowVer }))).toBe("VALIDATION_FAILED");
    const f = must(setPrivateStatus(user(TIWA), r.id, { status: "follow_up", rowVer: after.rowVer, note: "Pastor Bimbo to call her this week." })).request;
    expect(f.status).toBe("follow_up");
    expect(f.notes.at(-1)!.text).toMatch(/Pastor Bimbo/);
    expect(last()).toMatchObject({ action: "prayer.private.status" });
  });

  it("distress requests come first", () => {
    expect(must(listPrivate(user(TIWA), {})).items[0]!.distress.length).toBeGreaterThan(0);
  });
});

describe("TKP follow-ups (2026-11-26)", () => {
  it("moderators can mark a request answered, and it records who", () => {
    const p = db.prayerPosts.find((x) => x.status === "published" && !x.answered)!;
    const r = must(setAnswered(user(TIWA), p.id, true, p.rowVer)).post;
    expect(r.answeredBy).toMatchObject({ by: "Tiwa Bakare" });
    expect(last()).toMatchObject({ action: "prayer.answered", actorId: TIWA, target: p.id });
    expect(code(setAnswered(user(TECH_TEAM), p.id, false, r.rowVer))).toBe("FORBIDDEN");
    expect(must(setAnswered(user(FOLASADE), p.id, false, r.rowVer)).post.answeredBy).toBeNull();
    const byPoster = db.prayerPosts.find((x) => x.answered && x.answeredBy?.byId === "poster")!;
    expect(must(listPrayer(user(FOLASADE), { filter: "all" })).items.find((x) => x.id === byPoster.id)!.answeredBy!.by).toBe("The person who posted it");
  });

  it("the care check answers with the phone numbers to call", () => {
    const r = must(publicPost({ text: "Some days I feel I can't go on", human: "ok", device: device() }));
    expect(r.careResources?.map((x) => x.phone)).toEqual(["(281) 555-0100", "988"]);
    expect(must(publicPost({ text: "Pray for my exams", human: "ok", device: device() })).careResources).toBeUndefined();
    const bad = updateSettings(user(CHURCH_ADMIN), { ...db.prayerSettings, careResources: [{ label: "", phone: "abc" }] });
    expect(!bad.ok && bad.fields?.careResources).toBeTruthy();
  });
});
