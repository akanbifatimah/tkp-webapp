import {
  FORMATS,
  MINISTRIES,
  type Position,
  type PositionFormat,
  type PositionInput,
  type ProjectDetail,
  type ProjectInput,
  type ProjectsResponse,
  type ProjectStatus,
  type ProjectSummary,
} from "@/features/serve/project-types";
import { can, type Permission } from "@/lib/permissions";
import { churchDate } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import type { PositionRecord, ProjectRecord } from "./seed/projects";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock Projects server (docs/API.md §19), following the Figma (TKP,
 * 2026-11-26): members post projects (PJ5), the pastoral team reviews them
 * within 3 days, and people contact the coordinator directly (PJ3, PJ4).
 */

const ok = <T,>(body: T, status = 200): Result<T> => ({ ok: true, status, body });
const no = (status: number, code: string, message: string, fields?: Record<string, string[]>): Result<never> => ({ ok: false, status, code, message, ...(fields ? { fields } : {}) });
const allowed = (u: StaffRecord, p: Permission) => u.roles.some((r) => can(r, p));
const FORBIDDEN = "You don't have access to this.";
const GONE = "That project no longer exists.";
const STALE = "Someone else changed this project while you were looking. Reload to see it, then try again.";
const DAY = 86_400_000;
export const REVIEW_DAYS = 3;
const name = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? "Former staff") : null);
const find = (id: string) => db.projects.find((p) => p.id === id);

/* ======================================================= access */

const sees = (u: StaffRecord, p: ProjectRecord) => allowed(u, "projects.view") && (allowed(u, "projects.all") || (allowed(u, "projects.lead") && p.leadId === u.id));
const reviewer = (u: StaffRecord) => allowed(u, "projects.review");
/** A Project Lead manages the projects they coordinate; reviewers manage all. */
const manages = (u: StaffRecord, p: ProjectRecord) => reviewer(u) || (allowed(u, "projects.lead") && p.leadId === u.id);

/* ======================================================= views */

const today = (now: number) => churchDate(new Date(now));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/** A position past its closing date is closed (P-11's closing job); within 7 days it is "closing soon" (Figma PJ4). */
function toPosition(r: PositionRecord, now: number): Position {
  const t = today(now);
  const left = r.closingDate ? daysBetween(t, r.closingDate) : null;
  const state = r.state === "open" && left !== null && left < 0 ? "closed" : r.state;
  return { ...r, state, daysLeft: left, closingSoon: state === "open" && left !== null && left <= 7 };
}

const dueAt = (p: ProjectRecord) => new Date(Date.parse(p.submittedAt) + REVIEW_DAYS * DAY).toISOString();
const overdue = (p: ProjectRecord, now: number) => p.status === "submitted" && Date.parse(dueAt(p)) < now;

function summary(p: ProjectRecord, now: number): ProjectSummary {
  const open = p.positions.map((x) => toPosition(x, now)).filter((x) => x.state === "open");
  return {
    id: p.id,
    name: p.name,
    ministry: p.ministry,
    status: p.status,
    featured: p.featured,
    postedBy: p.postedBy.name,
    submittedAt: p.submittedAt,
    reviewDueAt: dueAt(p),
    overdue: overdue(p, now),
    openPositions: open.length,
    openSpots: open.reduce((n, x) => n + x.openings, 0),
    contactTaps: p.positions.reduce((n, x) => n + x.contactTaps, 0),
    cover: p.cover,
    lead: name(p.leadId),
  };
}

const ORDER: Record<ProjectStatus, number> = { submitted: 0, changes: 1, live: 2, closed: 3, declined: 4 };

export function listProjects(u: StaffRecord, q: { status?: string; q?: string; ministry?: string }, now = Date.now()): Result<ProjectsResponse> {
  if (!allowed(u, "projects.view")) return no(403, "FORBIDDEN", FORBIDDEN);
  const mine = db.projects.filter((p) => sees(u, p));
  const status = (Object.keys(ORDER).includes(q.status ?? "") ? q.status : null) as ProjectStatus | null;
  const needle = (q.q ?? "").trim().toLowerCase();
  const items = mine
    .filter((p) => !status || p.status === status)
    .filter((p) => !q.ministry || p.ministry === q.ministry)
    .filter((p) => !needle || `${p.name} ${p.description} ${p.postedBy.name} ${p.positions.map((x) => x.title).join(" ")}`.toLowerCase().includes(needle))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.status === "submitted" ? a.submittedAt.localeCompare(b.submittedAt) : Number(b.featured) - Number(a.featured) || b.updatedAt.localeCompare(a.updatedAt)))
    .map((p) => summary(p, now));
  const counts = { submitted: 0, changes: 0, live: 0, declined: 0, closed: 0, overdue: 0 } as ProjectsResponse["counts"];
  for (const p of mine) {
    counts[p.status]++;
    if (overdue(p, now)) counts.overdue++;
  }
  const live = mine.filter((p) => p.status === "live").map((p) => summary(p, now));
  return ok({
    items,
    counts,
    stats: { openPositions: live.reduce((n, p) => n + p.openPositions, 0), openSpots: live.reduce((n, p) => n + p.openSpots, 0), contactTaps: live.reduce((n, p) => n + p.contactTaps, 0) },
    scope: allowed(u, "projects.all") ? "all" : "mine",
    can: { review: reviewer(u), create: reviewer(u) || allowed(u, "projects.lead") },
  });
}

/** What must be right before a post goes live (the Figma PJ5 required fields, plus dates that make sense). */
export function problemsOf(p: Pick<ProjectRecord, "name" | "description" | "startDate" | "targetFinish" | "contact" | "positions">, now: number): string[] {
  const out: string[] = [];
  const t = today(now);
  if (p.name.trim().length < 3) out.push("Give the project a name.");
  if (p.description.trim().length < 20) out.push("Add a short description (a sentence or two).");
  if (!p.startDate) out.push("Add a start date.");
  if (p.targetFinish && p.startDate && p.targetFinish < p.startDate) out.push("The target finish is before the start date.");
  if (!p.contact.coordinators.trim()) out.push("Say who coordinates it.");
  if (!p.contact.phone.trim() && !p.contact.email.trim()) out.push("Add a phone number or email so people can reach the coordinator.");
  if (!p.positions.length) out.push("Add at least one open position.");
  p.positions.forEach((x, i) => {
    const n = `Position ${i + 1}${x.title ? ` (${x.title})` : ""}`;
    if (!x.title.trim()) out.push(`Position ${i + 1} needs a title.`);
    if (!x.responsibilities.trim()) out.push(`${n} needs its responsibilities.`);
    if (!(x.openings >= 1)) out.push(`${n} needs at least one opening.`);
    if (!x.commitment.trim()) out.push(`${n} needs a time commitment.`);
    if (x.state === "open" && x.closingDate && x.closingDate < t) out.push(`${n} closes on a date that has passed.`);
  });
  return out;
}

function detail(u: StaffRecord, p: ProjectRecord, now: number): ProjectDetail {
  return {
    name: p.name,
    description: p.description,
    ministry: p.ministry,
    startDate: p.startDate,
    targetFinish: p.targetFinish,
    cover: p.cover,
    contact: p.contact,
    id: p.id,
    status: p.status,
    featured: p.featured,
    postedBy: { name: p.postedBy.name, email: p.postedBy.email, member: p.postedBy.member },
    submittedAt: p.submittedAt,
    reviewDueAt: dueAt(p),
    overdue: overdue(p, now),
    reviewMessage: p.reviewMessage,
    declineReason: p.declineReason,
    lead: p.leadId ? { id: p.leadId, name: name(p.leadId)! } : null,
    positions: p.positions.map((x) => toPosition(x, now)),
    problems: problemsOf(p, now),
    history: p.history.map((h) => ({ at: h.at, by: h.byId ? name(h.byId)! : p.postedBy.name, action: h.action, note: h.note })),
    updatedAt: p.updatedAt,
    rowVer: p.rowVer,
    can: { review: reviewer(u), edit: manages(u, p) && p.status !== "declined", positions: manages(u, p) && p.status === "live" },
    options: { leads: db.staff.filter((s) => s.isActive && s.roles.includes("project_lead")).map((s) => ({ id: s.id, name: s.fullName })) },
  };
}

export function getProject(u: StaffRecord, id: string, now = Date.now()): Result<ProjectDetail> {
  const p = find(id);
  if (!p || !sees(u, p)) return no(404, "NOT_FOUND", GONE);
  return ok(detail(u, p, now));
}

/* ======================================================= review (the pastoral team) */

function guard(u: StaffRecord, id: string, rowVer: number | undefined, need: "review" | "manage"): { p: ProjectRecord } | Result<never> {
  const p = find(id);
  if (!p || !sees(u, p)) return no(404, "NOT_FOUND", GONE);
  if (need === "review" ? !reviewer(u) : !manages(u, p)) return no(403, "FORBIDDEN", need === "review" ? "Only the pastoral team reviews project posts." : FORBIDDEN);
  if (rowVer !== p.rowVer) return no(409, "CONFLICT", STALE);
  return { p };
}

const log = (u: StaffRecord, p: ProjectRecord, action: string, note: string | null, now: number) => {
  p.history.push({ at: new Date(now).toISOString(), byId: u.id, action, note });
  p.updatedAt = new Date(now).toISOString();
  p.rowVer++;
};

export function approveProject(u: StaffRecord, id: string, rowVer: number | undefined, now = Date.now()): Result<ProjectDetail> {
  const g = guard(u, id, rowVer, "review");
  if ("ok" in g) return g;
  const { p } = g;
  if (p.status !== "submitted" && p.status !== "changes") return no(422, "NOT_WAITING", "Only a post waiting for review can be approved.");
  const problems = problemsOf(p, now);
  if (problems.length) return no(422, "NOT_READY", `Not ready to publish: ${problems.join(" ")}`);
  p.status = "live";
  p.reviewMessage = null;
  log(u, p, "Approved and published", null, now);
  audit(u.id, "projects.approve", p.id, { after: { status: "live" } });
  return ok(detail(u, p, now));
}

export function requestChanges(u: StaffRecord, id: string, body: { message?: string; rowVer?: number }, now = Date.now()): Result<ProjectDetail> {
  const g = guard(u, id, body.rowVer, "review");
  if ("ok" in g) return g;
  const { p } = g;
  if (p.status !== "submitted" && p.status !== "changes") return no(422, "NOT_WAITING", "Only a post waiting for review can be sent back.");
  const msg = String(body.message ?? "").trim();
  if (msg.length < 10) return no(422, "VALIDATION_FAILED", "Tell them what to change.", { message: ["Tell them what to change, in a sentence or two"] });
  p.status = "changes";
  p.reviewMessage = msg.slice(0, 1000);
  log(u, p, "Changes requested", p.reviewMessage, now);
  audit(u.id, "projects.changes", p.id, { after: { message: p.reviewMessage } });
  return ok(detail(u, p, now));
}

export function declineProject(u: StaffRecord, id: string, body: { reason?: string; rowVer?: number }, now = Date.now()): Result<ProjectDetail> {
  const g = guard(u, id, body.rowVer, "review");
  if ("ok" in g) return g;
  const { p } = g;
  if (p.status !== "submitted" && p.status !== "changes") return no(422, "NOT_WAITING", "Only a post waiting for review can be declined.");
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 10) return no(422, "VALIDATION_FAILED", "Say why, kindly. The member sees it.", { reason: ["Say why, kindly. The member sees it"] });
  p.status = "declined";
  p.declineReason = reason.slice(0, 1000);
  log(u, p, "Declined", p.declineReason, now);
  audit(u.id, "projects.decline", p.id, { after: { reason: p.declineReason } });
  return ok(detail(u, p, now));
}

/** One featured project at a time (Figma PJ1 "Featured project"). */
export function featureProject(u: StaffRecord, id: string, on: boolean, rowVer: number | undefined, now = Date.now()): Result<ProjectDetail> {
  const g = guard(u, id, rowVer, "review");
  if ("ok" in g) return g;
  const { p } = g;
  if (on && p.status !== "live") return no(422, "NOT_LIVE", "Only a live project can be featured.");
  const before = db.projects.find((x) => x.featured && x.id !== p.id);
  if (on && before) {
    before.featured = false;
    before.rowVer++;
  }
  p.featured = on;
  log(u, p, on ? "Featured" : "No longer featured", before && on ? `Replaces ${before.name}` : null, now);
  audit(u.id, on ? "projects.feature" : "projects.unfeature", p.id, before && on ? { before: { featured: before.name } } : undefined);
  return ok(detail(u, p, now));
}

export function closeProject(u: StaffRecord, id: string, body: { reason?: string; rowVer?: number }, open: boolean, now = Date.now()): Result<ProjectDetail> {
  const g = guard(u, id, body.rowVer, "manage");
  if ("ok" in g) return g;
  const { p } = g;
  if (open) {
    if (p.status !== "closed") return no(422, "NOT_CLOSED", "It isn't closed.");
    p.status = "live";
    log(u, p, "Reopened", null, now);
    audit(u.id, "projects.reopen", p.id);
    return ok(detail(u, p, now));
  }
  if (p.status !== "live") return no(422, "NOT_LIVE", "Only a live project can be closed.");
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) return no(422, "VALIDATION_FAILED", "Say why it's closing.", { reason: ["Say why it's closing"] });
  p.status = "closed";
  p.featured = false;
  log(u, p, "Closed", reason, now);
  audit(u.id, "projects.close", p.id, { after: { reason } });
  return ok(detail(u, p, now));
}

export function assignLead(u: StaffRecord, id: string, leadId: string | null, rowVer: number | undefined, now = Date.now()): Result<ProjectDetail> {
  const g = guard(u, id, rowVer, "review");
  if ("ok" in g) return g;
  const { p } = g;
  if (leadId && !db.staff.some((s) => s.id === leadId && s.isActive && s.roles.includes("project_lead"))) return no(422, "VALIDATION_FAILED", "Choose an active Project Lead.");
  const before = name(p.leadId);
  p.leadId = leadId;
  log(u, p, leadId ? `Project Lead: ${name(leadId)}` : "No Project Lead", null, now);
  audit(u.id, "projects.lead", p.id, { before: { lead: before }, after: { lead: name(leadId) } });
  return ok(detail(u, p, now));
}

/** Mark a position filled, close it, or reopen it (P-11 "Filled when accepted applicants equal openings", by hand here). */
export function setPosition(u: StaffRecord, id: string, positionId: string, state: "open" | "filled" | "closed", rowVer: number | undefined, now = Date.now()): Result<ProjectDetail> {
  const g = guard(u, id, rowVer, "manage");
  if ("ok" in g) return g;
  const { p } = g;
  if (p.status !== "live") return no(422, "NOT_LIVE", "Positions change only while the project is live.");
  const x = p.positions.find((y) => y.id === positionId);
  if (!x) return no(404, "NOT_FOUND", "That position no longer exists.");
  if (state === "open" && x.closingDate && x.closingDate < today(now)) return no(422, "VALIDATION_FAILED", "Its closing date has passed. Edit the project to set a new one.");
  const before = toPosition(x, now).state;
  x.state = state;
  log(u, p, `${x.title}: ${state === "filled" ? "filled" : state === "closed" ? "closed" : "reopened"}`, null, now);
  audit(u.id, "projects.position", p.id, { before: { position: x.title, state: before }, after: { state } });
  return ok(detail(u, p, now));
}

/* ======================================================= create and edit */

function cleanPosition(raw: Partial<PositionInput>): PositionInput {
  return {
    title: String(raw.title ?? "").trim().slice(0, 80),
    responsibilities: String(raw.responsibilities ?? "").trim().slice(0, 2000),
    skills: (raw.skills ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 12),
    commitment: String(raw.commitment ?? "").trim().slice(0, 60),
    format: (FORMATS.includes(raw.format as PositionFormat) ? raw.format : "In person (Katy)") as PositionFormat,
    openings: Math.max(0, Math.min(99, Number(raw.openings) || 0)),
    closingDate: raw.closingDate || null,
  };
}

function validate(input: Partial<ProjectInput>, now: number, keep?: ProjectRecord): { value?: ProjectInput; fields?: Record<string, string[]> } {
  const f: Record<string, string[]> = {};
  const nm = String(input.name ?? "").trim();
  if (nm.length < 3 || nm.length > 80) f.name = ["Between 3 and 80 characters"];
  const description = String(input.description ?? "").trim();
  if (description.length < 20 || description.length > 1500) f.description = ["Between 20 and 1,500 characters"];
  if (!MINISTRIES.includes(input.ministry as never)) f.ministry = ["Choose a ministry"];
  if (!input.startDate) f.startDate = ["Add a start date"];
  if (input.targetFinish && input.startDate && input.targetFinish < input.startDate) f.targetFinish = ["After the start date"];
  const c = input.contact ?? ({} as ProjectInput["contact"]);
  const contact = { coordinators: String(c.coordinators ?? "").trim().slice(0, 80), role: String(c.role ?? "").trim().slice(0, 80), phone: String(c.phone ?? "").trim().slice(0, 30), whatsapp: !!c.whatsapp, email: String(c.email ?? "").trim().slice(0, 120), howToApply: String(c.howToApply ?? "").trim().slice(0, 300) };
  if (!contact.coordinators) f["contact.coordinators"] = ["Say who coordinates it"];
  if (!contact.phone && !contact.email) f["contact.phone"] = ["Add a phone number or email"];
  if (contact.phone && !/^[\d\s()+.-]{7,}$/.test(contact.phone)) f["contact.phone"] = ["Enter a phone number"];
  if (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)) f["contact.email"] = ["Enter an email address"];
  const positions = (input.positions ?? []).map(cleanPosition);
  if (!positions.length) f.positions = ["Add at least one position"];
  if (positions.length > 12) f.positions = ["Up to 12 positions"];
  positions.forEach((x, i) => {
    if (!x.title) f[`positions.${i}.title`] = ["Add a title"];
    if (!x.responsibilities) f[`positions.${i}.responsibilities`] = ["Add the responsibilities"];
    if (!x.commitment) f[`positions.${i}.commitment`] = ["Add the time commitment"];
    if (x.openings < 1) f[`positions.${i}.openings`] = ["At least 1"];
    const was = keep?.positions[i];
    if (x.closingDate && x.closingDate < today(now) && x.closingDate !== was?.closingDate) f[`positions.${i}.closingDate`] = ["A date still to come"];
  });
  if (Object.keys(f).length) return { fields: f };
  return { value: { name: nm, description, ministry: input.ministry!, startDate: input.startDate!, targetFinish: input.targetFinish || null, cover: input.cover ?? null, positions, contact } };
}

const toRecords = (positions: PositionInput[], keep?: PositionRecord[]) =>
  positions.map((x, i): PositionRecord => ({ ...x, id: keep?.[i]?.id ?? `pos-${crypto.randomUUID().slice(0, 8)}`, state: keep?.[i]?.state ?? "open", contactTaps: keep?.[i]?.contactTaps ?? 0 }));

/** Staff projects: the pastoral team's go live at once; a Project Lead's wait for review like a member's. */
export function createProject(u: StaffRecord, input: Partial<ProjectInput>, now = Date.now()): Result<ProjectDetail> {
  if (!reviewer(u) && !allowed(u, "projects.lead")) return no(403, "FORBIDDEN", FORBIDDEN);
  const v = validate(input, now);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const at = new Date(now).toISOString();
  const live = reviewer(u);
  const p: ProjectRecord = {
    ...v.value,
    id: `prj-${crypto.randomUUID().slice(0, 8)}`,
    positions: toRecords(v.value.positions),
    status: live ? "live" : "submitted",
    featured: false,
    postedBy: { name: u.fullName, email: u.email, member: true, staffId: u.id },
    leadId: allowed(u, "projects.lead") && !live ? u.id : null,
    submittedAt: at,
    reviewMessage: null,
    declineReason: null,
    history: [{ at, byId: u.id, action: live ? "Created and published" : "Submitted", note: null }],
    updatedAt: at,
    rowVer: 1,
  };
  db.projects.unshift(p);
  audit(u.id, "projects.create", p.id, { after: { name: p.name, status: p.status, positions: p.positions.length } });
  return ok(detail(u, p, now), 201);
}

export function updateProject(u: StaffRecord, id: string, input: Partial<ProjectInput> & { rowVer?: number }, now = Date.now()): Result<ProjectDetail> {
  const g = guard(u, id, input.rowVer, "manage");
  if ("ok" in g) return g;
  const { p } = g;
  if (p.status === "declined") return no(422, "DECLINED", "A declined post can't be edited.");
  const v = validate(input, now, p);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const changed = (["name", "description", "ministry", "startDate", "targetFinish", "contact"] as const).filter((k) => JSON.stringify(p[k]) !== JSON.stringify(v.value![k]));
  const positionsChanged = JSON.stringify(p.positions.map(({ id: _i, state: _s, contactTaps: _c, ...rest }) => rest)) !== JSON.stringify(v.value.positions);
  Object.assign(p, { ...v.value, positions: toRecords(v.value.positions, p.positions) });
  const what = [...changed, ...(positionsChanged ? ["positions"] : [])];
  log(u, p, "Edited", what.length ? `Changed: ${what.join(", ")}` : null, now);
  audit(u.id, "projects.edit", p.id, { after: { changed: what } });
  return ok(detail(u, p, now));
}

/* ======================================================= public routes (member app) */

/** P-5: members only. The app sends the member's session; the mock takes `member: true`. */
export function publicProjects(q: { member?: boolean }, now = Date.now()) {
  if (!q.member) return no(403, "MEMBERS_ONLY", "Projects are for members of TKP.");
  const live = db.projects.filter((p) => p.status === "live").sort((a, b) => Number(b.featured) - Number(a.featured) || b.updatedAt.localeCompare(a.updatedAt));
  return ok({
    items: live.map((p) => ({
      id: p.id,
      name: p.name,
      ministry: p.ministry,
      description: p.description,
      featured: p.featured,
      postedBy: p.postedBy.name.split(" ")[0],
      cover: p.cover,
      startDate: p.startDate,
      targetFinish: p.targetFinish,
      contact: p.contact,
      positions: p.positions.map((x) => toPosition(x, now)).filter((x) => x.state === "open").map(({ contactTaps: _c, ...x }) => x),
    })),
  });
}

/** Figma PJ5 "Submit project". Goes to the pastoral team; "reviewed within 3 days". */
export function submitProject(body: Partial<ProjectInput> & { member?: boolean; confirmed?: boolean; submitter?: { name?: string; email?: string } }, now = Date.now()): Result<{ id: string; reviewBy: string }> {
  if (!body.member) return no(403, "MEMBERS_ONLY", "Only members of TKP can post a project.");
  if (!body.confirmed) return no(422, "VALIDATION_FAILED", "Confirm you're a TKP member and the details are accurate.", { confirmed: ["Tick to confirm"] });
  const v = validate(body, now);
  if (!v.value) return no(422, "VALIDATION_FAILED", "Check the highlighted fields.", v.fields);
  const at = new Date(now).toISOString();
  const p: ProjectRecord = {
    ...v.value,
    id: `prj-${crypto.randomUUID().slice(0, 8)}`,
    positions: toRecords(v.value.positions),
    status: "submitted",
    featured: false,
    postedBy: { name: String(body.submitter?.name ?? "A member").trim(), email: body.submitter?.email ?? null, member: true, staffId: null },
    leadId: null,
    submittedAt: at,
    reviewMessage: null,
    declineReason: null,
    history: [{ at, byId: null, action: "Submitted", note: null }],
    updatedAt: at,
    rowVer: 1,
  };
  db.projects.unshift(p);
  return ok({ id: p.id, reviewBy: dueAt(p) }, 201);
}

/** Figma PJ4 Call / WhatsApp / Email: counted per position, never who. */
export function tapContact(positionId: string): Result<{ counted: true }> {
  for (const p of db.projects) {
    const x = p.positions.find((y) => y.id === positionId);
    if (x && p.status === "live") {
      x.contactTaps++;
      return ok({ counted: true });
    }
  }
  return no(404, "NOT_FOUND", "That position no longer exists.");
}

/** For the Admin dashboard and anyone reviewing. */
export const reviewQueue = (now = Date.now()) => ({
  waiting: db.projects.filter((p) => p.status === "submitted").length,
  overdue: db.projects.filter((p) => overdue(p, now)).length,
});
