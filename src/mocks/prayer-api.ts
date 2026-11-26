import {
  PRAYER_CATEGORIES,
  type PosterIdentity,
  type PrayerCategory,
  type PrayerFilter,
  type PrayerListResponse,
  type PrayerPost,
  type PrayerSettings,
  type PrivateListResponse,
  type PrivateRequest,
  type PrivateStatus,
} from "@/features/care/prayer-types";
import { can, type Permission } from "@/lib/permissions";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { distressIn, type PrayerRecord, type PrivateRecord } from "./seed/prayer";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock Prayer Wall server (docs/API.md §18; PRD 5.4 PR-1 to PR-12, OS-1,
 * OS-2). Moderation for staff, plus the public routes the portal and app use.
 */

const ok = <T,>(body: T, status = 200): Result<T> => ({ ok: true, status, body });
const no = (status: number, code: string, message: string, fields?: Record<string, string[]>): Result<never> => ({ ok: false, status, code, message, ...(fields ? { fields } : {}) });
const allowed = (u: StaffRecord, p: Permission) => u.roles.some((r) => can(r, p));
const FORBIDDEN = "You don't have access to this.";
const GONE = "That request no longer exists.";
const STALE = "Someone else changed this request while you were looking. Reload to see it, then try again.";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const name = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? "Former staff") : null);
const findPost = (id: string) => db.prayerPosts.find((p) => p.id === id);

/* ======================================================= housekeeping */

/**
 * PR-11, run before every read (the real backend runs it as a nightly job):
 * posts past the retention period leave the wall; removed posts past their
 * purge date are deleted for good.
 */
export function sweep(now = Date.now()) {
  const s = db.prayerSettings;
  for (const p of db.prayerPosts) {
    if (p.status === "published" && Date.parse(p.createdAt) + s.retentionDays * DAY < now) {
      p.status = "removed";
      p.removedReason = `On the wall for ${s.retentionDays} days`;
      p.moderatedById = null;
      p.moderatedAt = new Date(now).toISOString();
      p.purgeAt = new Date(now + s.purgeDays * DAY).toISOString();
    }
  }
  db.prayerPosts = db.prayerPosts.filter((p) => !(p.status === "removed" && p.purgeAt && Date.parse(p.purgeAt) < now));
}

/* ======================================================= the staff view */

function toPost(p: PrayerRecord): PrayerPost {
  return {
    id: p.id,
    text: p.text,
    category: p.category,
    displayName: p.name ?? "Anonymous",
    anonymous: !p.name,
    posterKind: p.poster.kind,
    status: p.status,
    createdAt: p.createdAt,
    publishedAt: p.publishedAt,
    answered: p.answered,
    answeredBy: p.answeredBy ? { by: p.answeredBy.byId === "poster" ? "The person who posted it" : name(p.answeredBy.byId)!, at: p.answeredBy.at } : null,
    prayed: p.prayedBy.length,
    reports: p.reports.map((r) => ({ reason: r.reason, at: r.at })),
    distress: p.distress,
    notes: p.notes.map((x) => ({ by: name(x.byId)!, text: x.text, at: x.at })),
    edited: p.edited ? { by: name(p.edited.byId)!, at: p.edited.at, reason: p.edited.reason } : null,
    moderatedBy: name(p.moderatedById),
    moderatedAt: p.moderatedAt,
    removedReason: p.removedReason,
    purgeAt: p.purgeAt,
    rowVer: p.rowVer,
  };
}

/** Needs a person: waiting, hidden by reports, or carrying a distress flag while still on the wall unreviewed. */
const needsReview = (p: PrayerRecord) => p.status === "pending" || p.status === "hidden";

export function listPrayer(u: StaffRecord, q: { filter?: string; q?: string; category?: string }, now = Date.now()): Result<PrayerListResponse> {
  if (!allowed(u, "prayer.view")) return no(403, "FORBIDDEN", FORBIDDEN);
  sweep(now);
  const filter = (["review", "published", "removed", "all"].includes(q.filter ?? "") ? q.filter : "review") as PrayerFilter;
  const needle = (q.q ?? "").trim().toLowerCase();
  const cat = PRAYER_CATEGORIES.includes(q.category as PrayerCategory) ? q.category : null;
  const all = db.prayerPosts;
  const rank = (p: PrayerRecord) => (p.distress.length && needsReview(p) ? 0 : p.status === "hidden" ? 1 : p.status === "pending" ? 2 : 3);
  const items = all
    .filter((p) => (filter === "review" ? needsReview(p) : filter === "all" ? true : filter === "published" ? p.status === "published" : p.status === "removed"))
    .filter((p) => !cat || p.category === cat)
    .filter((p) => !needle || `${p.text} ${p.name ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => (filter === "review" ? rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)))
    .map(toPost);
  const weekAgo = now - 7 * DAY;
  return ok({
    items,
    counts: {
      review: all.filter(needsReview).length,
      pending: all.filter((p) => p.status === "pending").length,
      hidden: all.filter((p) => p.status === "hidden").length,
      distress: all.filter((p) => p.distress.length && needsReview(p)).length,
      published: all.filter((p) => p.status === "published").length,
      removed: all.filter((p) => p.status === "removed").length,
      all: all.length,
    },
    week: {
      posted: all.filter((p) => Date.parse(p.createdAt) > weekAgo).length,
      prayed: all.filter((p) => p.status === "published").reduce((n, p) => n + p.prayedBy.length, 0),
    },
    settings: settingsView(),
    can: { moderate: allowed(u, "prayer.moderate"), settings: allowed(u, "prayer.settings"), identity: allowed(u, "prayer.moderate") },
  });
}

/** PR-7: who posted, for moderators and system admins only, and every look is logged. */
export function posterIdentity(u: StaffRecord, id: string): Result<PosterIdentity> {
  if (!allowed(u, "prayer.moderate")) return no(403, "FORBIDDEN", FORBIDDEN);
  const p = findPost(id);
  if (!p) return no(404, "NOT_FOUND", GONE);
  const same = db.prayerPosts.filter((x) => x.poster.device === p.poster.device || (p.poster.email && x.poster.email === p.poster.email));
  audit(u.id, "prayer.identity.view", p.id, { after: { request: p.text.slice(0, 60) } });
  return ok({ kind: p.poster.kind, name: p.poster.name, email: p.poster.email, device: p.poster.device, posts: same.length, removed: same.filter((x) => x.status === "removed").length });
}

function guard(u: StaffRecord, id: string, rowVer: number | undefined): { p: PrayerRecord } | Result<never> {
  if (!allowed(u, "prayer.moderate")) return no(403, "FORBIDDEN", FORBIDDEN);
  const p = findPost(id);
  if (!p) return no(404, "NOT_FOUND", GONE);
  if (rowVer !== p.rowVer) return no(409, "CONFLICT", STALE);
  return { p };
}

const stamp = (u: StaffRecord, p: PrayerRecord, now: number) => {
  p.moderatedById = u.id;
  p.moderatedAt = new Date(now).toISOString();
  p.rowVer++;
};

/** Approve: put it on the wall. On a post hidden by reports, the reports are dismissed (and noted). */
export function approvePost(u: StaffRecord, id: string, rowVer: number | undefined, now = Date.now()): Result<{ post: PrayerPost }> {
  const g = guard(u, id, rowVer);
  if ("ok" in g) return g;
  const { p } = g;
  if (p.status === "published") return no(422, "ALREADY_PUBLISHED", "It's already on the wall.");
  if (p.status === "removed") return no(422, "REMOVED", "It was removed. Restore it instead.");
  const before = p.status;
  if (p.reports.length) {
    p.notes.push({ byId: u.id, text: `${p.reports.length} ${p.reports.length === 1 ? "report" : "reports"} reviewed and dismissed.`, at: new Date(now).toISOString() });
    p.reports = [];
  }
  p.status = "published";
  p.publishedAt ??= new Date(now).toISOString();
  stamp(u, p, now);
  audit(u.id, "prayer.approve", p.id, { before: { status: before }, after: { status: "published" } });
  return ok({ post: toPost(p) });
}

/** BLOCKED (PR-10): phone numbers, email addresses, street addresses and links. */
export function contactProblem(text: string): string | null {
  if (/\b[\w.+-]+@[\w-]+\.[\w.]+\b/.test(text)) return "Take out the email address. Requests can't carry contact details.";
  if (/(https?:\/\/|www\.)\S+|\b\S+\.(com|org|net|ng|co|io)\b/i.test(text)) return "Take out the link. Requests can't carry links.";
  if (/(\+?\d[\d\s().-]{6,}\d)/.test(text)) return "Take out the phone number. Requests can't carry contact details.";
  if (/\b\d{1,5}\s+\w+(\s\w+)?\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|boulevard|court|ct|way)\b/i.test(text)) return "Take out the street address. Requests can't carry addresses.";
  return null;
}

/** Moderators edit (PR-4) with a reason; the original stays in the record. */
export function editPost(u: StaffRecord, id: string, body: { text?: string; category?: string; reason?: string; rowVer?: number }, now = Date.now()): Result<{ post: PrayerPost }> {
  const g = guard(u, id, body.rowVer);
  if ("ok" in g) return g;
  const { p } = g;
  const text = String(body.text ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const f: Record<string, string[]> = {};
  if (text.length < 5 || text.length > 600) f.text = ["Between 5 and 600 characters"];
  else {
    const c = contactProblem(text);
    if (c) f.text = [c];
  }
  if (!PRAYER_CATEGORIES.includes(body.category as PrayerCategory)) f.category = ["Choose a category"];
  if (reason.length < 3) f.reason = ["Say what you changed and why"];
  if (Object.keys(f).length) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", f);
  const before = { text: p.text, category: p.category };
  p.edited = { byId: u.id, at: new Date(now).toISOString(), reason, before: p.edited?.before ?? p.text };
  p.text = text;
  p.category = body.category as PrayerCategory;
  stamp(u, p, now);
  audit(u.id, "prayer.edit", p.id, { before, after: { text, category: p.category, reason } });
  return ok({ post: toPost(p) });
}

/** Remove (soft): off the wall at once, deleted for good after the purge days (PR-11). */
export function removePost(u: StaffRecord, id: string, body: { reason?: string; rowVer?: number }, now = Date.now()): Result<{ post: PrayerPost }> {
  const g = guard(u, id, body.rowVer);
  if ("ok" in g) return g;
  const { p } = g;
  if (p.status === "removed") return no(422, "REMOVED", "It's already removed.");
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) return no(422, "VALIDATION_FAILED", "Say why it's being removed.", { reason: ["Say why it's being removed"] });
  const before = p.status;
  p.status = "removed";
  p.removedReason = reason.slice(0, 200);
  p.purgeAt = new Date(now + db.prayerSettings.purgeDays * DAY).toISOString();
  stamp(u, p, now);
  audit(u.id, "prayer.remove", p.id, { before: { status: before }, after: { status: "removed", reason: p.removedReason } });
  return ok({ post: toPost(p) });
}

/** Restore a removed post (before it is purged) or a hidden one: back on the wall. */
export function restorePost(u: StaffRecord, id: string, rowVer: number | undefined, now = Date.now()): Result<{ post: PrayerPost }> {
  const g = guard(u, id, rowVer);
  if ("ok" in g) return g;
  const { p } = g;
  if (p.status !== "removed") return no(422, "NOT_REMOVED", "Only a removed request can be restored.");
  p.status = "published";
  p.publishedAt ??= new Date(now).toISOString();
  p.removedReason = null;
  p.purgeAt = null;
  p.reports = [];
  stamp(u, p, now);
  audit(u.id, "prayer.restore", p.id, { before: { status: "removed" }, after: { status: "published" } });
  return ok({ post: toPost(p) });
}

/** Moderators can mark a request answered too, and it records who did (TKP, 2026-11-26). */
export function setAnswered(u: StaffRecord, id: string, answered: boolean, rowVer: number | undefined, now = Date.now()): Result<{ post: PrayerPost }> {
  const g = guard(u, id, rowVer);
  if ("ok" in g) return g;
  const { p } = g;
  if (p.answered === answered) return no(422, "UNCHANGED", answered ? "It's already marked answered." : "It isn't marked answered.");
  p.answered = answered;
  p.answeredBy = answered ? { byId: u.id, at: new Date(now).toISOString() } : null;
  p.rowVer++;
  audit(u.id, answered ? "prayer.answered" : "prayer.unanswered", p.id, { after: { answered } });
  return ok({ post: toPost(p) });
}

export function addNote(u: StaffRecord, id: string, text: string, now = Date.now()): Result<{ post: PrayerPost }> {
  if (!allowed(u, "prayer.moderate")) return no(403, "FORBIDDEN", FORBIDDEN);
  const p = findPost(id);
  if (!p) return no(404, "NOT_FOUND", GONE);
  const t = String(text ?? "").trim();
  if (t.length < 2 || t.length > 500) return no(422, "VALIDATION_FAILED", "Write the note first.", { text: ["Between 2 and 500 characters"] });
  p.notes.push({ byId: u.id, text: t, at: new Date(now).toISOString() });
  p.rowVer++;
  audit(u.id, "prayer.note", p.id);
  return ok({ post: toPost(p) });
}

/* ======================================================= settings */

const settingsView = (): PrayerSettings => ({ ...db.prayerSettings, updatedBy: db.prayerSettings.updatedBy ? name(db.prayerSettings.updatedBy) : null });

export function updateSettings(u: StaffRecord, body: Partial<PrayerSettings>, now = Date.now()): Result<{ settings: PrayerSettings }> {
  if (!allowed(u, "prayer.settings")) return no(403, "FORBIDDEN", FORBIDDEN);
  const s = db.prayerSettings;
  if (body.rowVer !== s.rowVer) return no(409, "CONFLICT", "Someone else changed the settings. Reload and try again.");
  const f: Record<string, string[]> = {};
  const mode = body.mode === "publish" ? "publish" : body.mode === "hold" ? "hold" : null;
  if (!mode) f.mode = ["Choose how new requests appear"];
  const threshold = Number(body.reportThreshold);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) f.reportThreshold = ["Between 1 and 20 reports"];
  const words = [...new Set((body.distressWords ?? []).map((w) => String(w).trim().toLowerCase()).filter(Boolean))];
  if (!words.length) f.distressWords = ["Keep at least one word or phrase"];
  else if (words.length > 60) f.distressWords = ["Up to 60 words or phrases"];
  const retention = Number(body.retentionDays);
  if (!Number.isInteger(retention) || retention < 7 || retention > 730) f.retentionDays = ["Between 7 and 730 days"];
  const purge = Number(body.purgeDays);
  if (!Number.isInteger(purge) || purge < 1 || purge > 90) f.purgeDays = ["Between 1 and 90 days"];
  const resources = (body.careResources ?? []).map((r) => ({ label: String(r.label ?? "").trim().slice(0, 80), phone: String(r.phone ?? "").trim().slice(0, 30) })).filter((r) => r.label || r.phone);
  if (!resources.length) f.careResources = ["Keep at least one number to call"];
  else if (resources.some((r) => !r.label || !/^[\d\s()+.-]{3,}$/.test(r.phone))) f.careResources = ["Each line needs a name and a phone number"];
  if (Object.keys(f).length) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", f);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const next = { mode: mode!, reportThreshold: threshold, distressWords: words, retentionDays: retention, purgeDays: purge, careResources: resources };
  for (const k of Object.keys(next) as (keyof typeof next)[]) {
    if (JSON.stringify(s[k]) !== JSON.stringify(next[k])) {
      before[k] = s[k];
      after[k] = next[k];
    }
  }
  Object.assign(s, next, { rowVer: s.rowVer + 1, updatedBy: u.id, updatedAt: new Date(now).toISOString() });
  if (Object.keys(after).length) audit(u.id, "prayer.settings.update", null, { before, after });
  return ok({ settings: settingsView() });
}

/* ======================================================= private requests (PR-3, OS-2) */

function toPrivate(r: PrivateRecord): PrivateRequest {
  return {
    id: r.id,
    text: r.text,
    category: r.category,
    name: r.name,
    contact: r.contact,
    posterKind: r.poster.kind,
    createdAt: r.createdAt,
    status: r.status,
    distress: r.distress,
    prayedBy: r.prayedBy.map((x) => ({ name: name(x.byId)!, at: x.at })),
    notes: r.notes.map((x) => ({ by: name(x.byId)!, text: x.text, at: x.at })),
    rowVer: r.rowVer,
  };
}

export function listPrivate(u: StaffRecord, q: { status?: string }): Result<PrivateListResponse> {
  if (!allowed(u, "prayer.private")) return no(403, "FORBIDDEN", FORBIDDEN);
  const order: Record<PrivateStatus, number> = { new: 0, follow_up: 1, praying: 2, closed: 3 };
  const status = (["new", "praying", "follow_up", "closed"].includes(q.status ?? "") ? q.status : null) as PrivateStatus | null;
  const all = db.prayerPrivate;
  const items = all
    .filter((r) => (status ? r.status === status : r.status !== "closed"))
    .sort((a, b) => Number(!!b.distress.length) - Number(!!a.distress.length) || order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt))
    .map(toPrivate);
  const counts = { all: all.filter((r) => r.status !== "closed").length, new: 0, praying: 0, follow_up: 0, closed: 0 } as Record<PrivateStatus | "all", number>;
  for (const r of all) counts[r.status]++;
  return ok({ items, counts });
}

const findPrivate = (id: string) => db.prayerPrivate.find((r) => r.id === id);

/** "I prayed over this": each team member once; a new request moves to "Being prayed for". */
export function prayOver(u: StaffRecord, id: string, now = Date.now()): Result<{ request: PrivateRequest }> {
  if (!allowed(u, "prayer.private")) return no(403, "FORBIDDEN", FORBIDDEN);
  const r = findPrivate(id);
  if (!r) return no(404, "NOT_FOUND", GONE);
  if (r.prayedBy.some((x) => x.byId === u.id)) return no(422, "ALREADY", "You've already marked this one.");
  r.prayedBy.push({ byId: u.id, at: new Date(now).toISOString() });
  if (r.status === "new") r.status = "praying";
  r.rowVer++;
  audit(u.id, "prayer.private.prayed", r.id);
  return ok({ request: toPrivate(r) });
}

export function setPrivateStatus(u: StaffRecord, id: string, body: { status?: string; rowVer?: number; note?: string }, now = Date.now()): Result<{ request: PrivateRequest }> {
  if (!allowed(u, "prayer.private")) return no(403, "FORBIDDEN", FORBIDDEN);
  const r = findPrivate(id);
  if (!r) return no(404, "NOT_FOUND", GONE);
  if (body.rowVer !== r.rowVer) return no(409, "CONFLICT", STALE);
  const status = body.status as PrivateStatus;
  if (!["new", "praying", "follow_up", "closed"].includes(status)) return no(422, "VALIDATION_FAILED", "Choose a status.");
  const note = String(body.note ?? "").trim();
  if (status === "follow_up" && note.length < 5) return no(422, "VALIDATION_FAILED", "Say what follow-up is needed.", { note: ["Say what follow-up is needed"] });
  const before = r.status;
  r.status = status;
  if (note) r.notes.push({ byId: u.id, text: note.slice(0, 500), at: new Date(now).toISOString() });
  r.rowVer++;
  audit(u.id, "prayer.private.status", r.id, { before: { status: before }, after: { status } });
  return ok({ request: toPrivate(r) });
}

export function addPrivateNote(u: StaffRecord, id: string, text: string, now = Date.now()): Result<{ request: PrivateRequest }> {
  if (!allowed(u, "prayer.private")) return no(403, "FORBIDDEN", FORBIDDEN);
  const r = findPrivate(id);
  if (!r) return no(404, "NOT_FOUND", GONE);
  const t = String(text ?? "").trim();
  if (t.length < 2 || t.length > 500) return no(422, "VALIDATION_FAILED", "Write the note first.", { text: ["Between 2 and 500 characters"] });
  r.notes.push({ byId: u.id, text: t, at: new Date(now).toISOString() });
  r.rowVer++;
  audit(u.id, "prayer.private.note", r.id);
  return ok({ request: toPrivate(r) });
}

/* ======================================================= public routes (portal and app) */

export type PublicPost = { id: string; name: string; category: PrayerCategory; text: string; createdAt: string; prayed: number; answered: boolean };

/** PR-1: no sign-in, newest first, a category filter; anonymous stays anonymous (PR-7). */
export function publicFeed(q: { category?: string; page?: number }, now = Date.now()): { items: PublicPost[]; page: number; total: number } {
  sweep(now);
  const cat = PRAYER_CATEGORIES.includes(q.category as PrayerCategory) ? q.category : null;
  const rows = db.prayerPosts
    .filter((p) => p.status === "published" && (!cat || p.category === cat))
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
  const page = Math.max(1, Number(q.page) || 1);
  return {
    items: rows.slice((page - 1) * 20, page * 20).map((p) => ({ id: p.id, name: p.name ?? "Anonymous", category: p.category, text: p.text, createdAt: p.createdAt, prayed: p.prayedBy.length, answered: p.answered })),
    page,
    total: rows.length,
  };
}

const recentByDevice = new Map<string, number[]>();
const RATE = 3;

export type PublicPostInput = { text?: string; category?: string; name?: string; anonymous?: boolean; private?: boolean; contact?: string; human?: string; device?: string; kind?: "guest" | "member" | "learner"; email?: string };

/**
 * PR-2, PR-3, PR-9, PR-10: post without an account. A human check and a limit
 * of 3 posts an hour per device. Contact details are refused. Distress words
 * show the care resources and hold the post for a person, whatever the mode.
 */
export function publicPost(body: PublicPostInput, now = Date.now()): Result<{ id: string; status: string; showCareResources: boolean; careResources?: { label: string; phone: string }[] }> {
  if (body.human !== "ok") return no(422, "HUMAN_CHECK", "Please complete the check that you're not a robot.");
  const device = String(body.device ?? "").trim();
  if (!device) return no(422, "VALIDATION_FAILED", "Missing device.");
  const recent = (recentByDevice.get(device) ?? []).filter((t) => t > now - HOUR);
  if (recent.length >= RATE) return no(429, "TOO_MANY", "You've shared several requests in the last hour. Please try again later.");
  const text = String(body.text ?? "").trim();
  if (text.length < 5 || text.length > 600) return no(422, "VALIDATION_FAILED", "Between 5 and 600 characters, please.", { text: ["Between 5 and 600 characters"] });
  const contact = contactProblem(text);
  if (contact) return no(422, "VALIDATION_FAILED", contact, { text: [contact] });
  const category = (PRAYER_CATEGORIES.includes(body.category as PrayerCategory) ? body.category : "Other") as PrayerCategory;
  const display = body.anonymous ? null : String(body.name ?? "").trim().split(/\s+/)[0]?.slice(0, 30) || null;
  const distress = distressIn(text, db.prayerSettings.distressWords);
  const poster = { kind: body.kind ?? "guest", name: body.name?.trim() || null, email: body.email ?? null, device };
  recentByDevice.set(device, [...recent, now]);
  const at = new Date(now).toISOString();
  if (body.private) {
    const r: PrivateRecord = { id: `pv-${crypto.randomUUID().slice(0, 8)}`, text, category, name: display, contact: String(body.contact ?? "").trim() || null, poster, createdAt: at, status: "new", distress, prayedBy: [], notes: [], rowVer: 1 };
    db.prayerPrivate.unshift(r);
    return ok({ id: r.id, status: "private", showCareResources: distress.length > 0, ...(distress.length ? { careResources: db.prayerSettings.careResources } : {}) }, 201);
  }
  const held = db.prayerSettings.mode === "hold" || distress.length > 0;
  const p: PrayerRecord = {
    id: `pr-${crypto.randomUUID().slice(0, 8)}`,
    text,
    category,
    name: display,
    poster,
    status: held ? "pending" : "published",
    createdAt: at,
    publishedAt: held ? null : at,
    answered: false,
    answeredBy: null,
    prayedBy: [],
    reports: [],
    distress,
    notes: [],
    edited: null,
    moderatedById: null,
    moderatedAt: null,
    removedReason: null,
    purgeAt: null,
    rowVer: 1,
  };
  db.prayerPosts.unshift(p);
  return ok({ id: p.id, status: p.status, showCareResources: distress.length > 0, ...(distress.length ? { careResources: db.prayerSettings.careResources } : {}) }, 201);
}

/** PR-6: one "I prayed" per person or device per post; who prayed is never shown. */
export function prayFor(id: string, device: string): Result<{ prayed: number }> {
  const p = findPost(id);
  if (!p || p.status !== "published") return no(404, "NOT_FOUND", GONE);
  if (!device) return no(422, "VALIDATION_FAILED", "Missing device.");
  if (!p.prayedBy.includes(device)) p.prayedBy.push(device);
  return ok({ prayed: p.prayedBy.length });
}

/** PR-5: one report per device; at the threshold the post leaves the wall until a moderator looks. */
export function reportPost(id: string, device: string, reason: string, now = Date.now()): Result<{ reported: true }> {
  const p = findPost(id);
  if (!p || p.status !== "published") return no(404, "NOT_FOUND", GONE);
  if (!device) return no(422, "VALIDATION_FAILED", "Missing device.");
  if (!p.reports.some((r) => r.device === device)) p.reports.push({ device, reason: String(reason ?? "").trim().slice(0, 80) || "No reason given", at: new Date(now).toISOString() });
  if (p.reports.length >= db.prayerSettings.reportThreshold) {
    p.status = "hidden";
    p.rowVer++;
    audit(null, "prayer.auto_hide", p.id, { after: { reports: p.reports.length } });
  }
  return ok({ reported: true });
}
