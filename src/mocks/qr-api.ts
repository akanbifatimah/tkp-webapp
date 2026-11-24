import {
  DESTINATION_LABEL,
  DESTINATIONS,
  NEEDS_TARGET,
  type DestinationType,
  type QrCode,
  type QrDatesInput,
  type QrDetail,
  type QrInput,
  type QrListResponse,
  type QrResolve,
  type QrStatus,
  type QrWarning,
  PRINT_LAYOUTS,
} from "@/features/welcome/qr-types";
import { can, type Permission } from "@/lib/permissions";
import { CHURCH_TZ, churchDate, formatWhen, fromChurchLocal, toChurchLocal } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { COURSES, type QrRecord } from "./seed/qr";
import type { ServiceRecord } from "./seed/services";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock QR code "server" (docs/API.md §9, PRD 5.8 QR-1 to QR-10).
 * Status is worked out from the stored state and the dates whenever a code is
 * read or scanned (QR-10), so a code never stays Active past its expiry.
 */

/** Placeholders until TKP confirms the domains (open question in API.md §9). */
export const SHORT_BASE = "https://go.tkp.example/";
export const PORTAL_BASE = "https://hub.tkp.example";

const ok = <T,>(body: T, status = 200): Result<T> => ({ ok: true, status, body });
const no = (status: number, code: string, message: string, fields?: Record<string, string[]>): Result<never> => ({
  ok: false,
  status,
  code,
  message,
  ...(fields ? { fields } : {}),
});
const allowed = (u: StaffRecord, p: Permission) => u.roles.some((r) => can(r, p));
const FORBIDDEN = "You don't have access to this.";
const nameOf = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? null) : null);
const findCode = (id: string) => db.qrCodes.find((c) => c.id === id);
const findService = (id: string | null) => (id ? db.services.find((s) => s.id === id) : undefined);

/* ================================================================= status */

export function statusOf(c: Pick<QrRecord, "state" | "activeFrom" | "expiresAt">, now: Date): QrStatus {
  if (c.state === "draft") return "draft";
  if (c.state === "paused") return "paused";
  const t = now.getTime();
  if (c.expiresAt && t >= Date.parse(c.expiresAt)) return "expired";
  if (c.activeFrom && t < Date.parse(c.activeFrom)) return "scheduled";
  return "active";
}

/* ============================================================ destinations */

const eventTargets = () =>
  db.services
    .filter((s) => s.kind === "special" && s.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({ id: s.id, name: s.name, hint: s.startsOn ? (s.startsOn === s.endsOn ? s.startsOn : `${s.startsOn} to ${s.endsOn}`) : null }));

function destinationOf(c: Pick<QrRecord, "destination" | "targetId" | "serviceId">) {
  const target =
    c.destination === "event" ? findService(c.targetId)?.name : c.destination === "course" ? COURSES.find((x) => x.id === c.targetId)?.name : null;
  const label = target ? `${DESTINATION_LABEL[c.destination]} · ${target}` : DESTINATION_LABEL[c.destination];
  const svc = c.serviceId ? `service=${c.serviceId}` : "";
  const url: Record<DestinationType, string> = {
    guest_form: `${PORTAL_BASE}/welcome${svc ? `?${svc}` : ""}`,
    short_form: `${PORTAL_BASE}/welcome?form=short${svc ? `&${svc}` : ""}`,
    plan_visit: `${PORTAL_BASE}/plan-a-visit`,
    event: `${PORTAL_BASE}/events/${c.targetId ?? ""}`,
    course: `${PORTAL_BASE}/learn/courses/${c.targetId ?? ""}`,
    prayer_wall: `${PORTAL_BASE}/prayer`,
  };
  return { label, url: url[c.destination] };
}

/* ================================================================= QR-8 */

const SERVICE_LENGTH_MIN = 120;
const DAY = 86_400_000;

/** The next start of a weekly service whose end is still ahead of `from`. */
function nextWeekly(s: ServiceRecord, from: number): { start: number; end: number } | null {
  if (s.day === null || !s.time) return null;
  for (let i = 0; i < 9; i++) {
    const date = churchDate(new Date(from + i * DAY));
    if (new Date(`${date}T12:00:00Z`).getUTCDay() !== s.day) continue;
    const start = Date.parse(fromChurchLocal(`${date}T${s.time}`));
    const end = start + SERVICE_LENGTH_MIN * 60_000;
    if (end > from) return { start, end };
  }
  return null;
}

type Window = Pick<QrRecord, "id" | "destination" | "targetId" | "serviceId" | "activeFrom" | "expiresAt">;

export function warningsFor(c: Window, now: Date): QrWarning[] {
  const out: QrWarning[] = [];
  const t = now.getTime();
  const from = c.activeFrom ? Date.parse(c.activeFrom) : t;
  const until = c.expiresAt ? Date.parse(c.expiresAt) : Infinity;
  if (until <= t) return out;

  // Another live code for the same place, at overlapping times (warn, do not block).
  for (const o of db.qrCodes) {
    if (o.id === c.id || o.destination !== c.destination || (o.targetId ?? null) !== (c.targetId ?? null)) continue;
    const st = statusOf(o, now);
    if (st !== "active" && st !== "scheduled") continue;
    const oFrom = o.activeFrom ? Date.parse(o.activeFrom) : t;
    const oUntil = o.expiresAt ? Date.parse(o.expiresAt) : Infinity;
    if (from < oUntil && oFrom < until)
      out.push({ kind: "overlap", otherId: o.id, otherName: o.name, message: `“${o.name}” also opens ${destinationOf(o).label} at the same time.` });
  }

  // The code stops before the service it is for (an event's own dates count).
  const svc = findService(c.serviceId ?? (c.destination === "event" ? c.targetId : null));
  if (svc && until !== Infinity) {
    const start = Math.max(from, t);
    if (svc.kind === "weekly") {
      const next = nextWeekly(svc, start);
      if (next && until < next.end)
        out.push({
          kind: "expires_before_service",
          serviceId: svc.id,
          message:
            until > next.start
              ? `Stops working during ${svc.name} (${formatWhen(new Date(next.start))}).`
              : `Stops working before the next ${svc.name} (${formatWhen(new Date(next.start))}).`,
        });
    } else if (svc.startsOn && svc.endsOn) {
      const end = Date.parse(fromChurchLocal(`${svc.endsOn}T23:59`));
      if (end > start && until < end)
        out.push({ kind: "expires_before_service", serviceId: svc.id, message: `Stops working before ${svc.name} ends (${svc.endsOn === svc.startsOn ? "on" : "last day"} ${formatWhen(new Date(end)).split(" · ")[0]}).` });
    }
  }
  return out;
}

/* ================================================================== read */

const scanSummary = (id: string, now: Date) => {
  const cutoff = churchDate(new Date(now.getTime() - 29 * DAY));
  let total = 0;
  let last30 = 0;
  let lastAt: string | null = null;
  for (const s of db.qrScans) {
    if (s.codeId !== id || s.inactive) continue;
    total += s.n;
    if (s.date >= cutoff) last30 += s.n;
    if (!lastAt || s.date > lastAt) lastAt = s.date;
  }
  return { total, last30, lastAt };
};

export function toCode(c: QrRecord, now = new Date()): QrCode {
  const d = destinationOf(c);
  const status = statusOf(c, now);
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    legacy: !!c.legacyUrl,
    shortUrl: c.legacyUrl ?? `${SHORT_BASE}${c.slug}`,
    destination: c.destination,
    targetId: c.targetId,
    destinationLabel: d.label,
    destinationUrl: d.url,
    serviceId: c.serviceId,
    serviceName: findService(c.serviceId)?.name ?? null,
    activeFrom: c.activeFrom,
    expiresAt: c.expiresAt,
    timeZone: CHURCH_TZ,
    state: c.state,
    status,
    note: c.note,
    caption: c.caption,
    createdAt: c.createdAt,
    createdBy: nameOf(c.createdById),
    updatedAt: c.updatedAt,
    updatedBy: nameOf(c.updatedById),
    rowVer: c.rowVer,
    scans: scanSummary(c.id, now),
    warnings: status === "active" || status === "scheduled" ? warningsFor(c, now) : [],
  };
}

const ORDER: Record<QrStatus, number> = { active: 0, scheduled: 1, paused: 2, draft: 3, expired: 4 };

export function listQr(u: StaffRecord, now = new Date()): Result<QrListResponse> {
  if (!allowed(u, "qr.view")) return no(403, "FORBIDDEN", FORBIDDEN);
  const items = db.qrCodes.map((c) => toCode(c, now)).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
  const counts: Record<QrStatus, number> = { active: 0, scheduled: 0, paused: 0, draft: 0, expired: 0 };
  for (const i of items) counts[i.status]++;
  return ok({
    items,
    counts,
    targets: { event: eventTargets(), course: COURSES },
    services: db.services.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder).map((s) => ({ id: s.id, name: s.name })),
    can: { manage: allowed(u, "qr.manage"), print: allowed(u, "qr.print") },
  });
}

export function getQr(u: StaffRecord, id: string, now = new Date()): Result<QrDetail> {
  if (!allowed(u, "qr.view")) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCode(id);
  if (!c) return no(404, "NOT_FOUND", "That QR code no longer exists.");
  const days: QrDetail["byDay"] = [];
  const index = new Map<string, QrDetail["byDay"][number]>();
  for (let i = 59; i >= 0; i--) {
    const date = churchDate(new Date(now.getTime() - i * DAY));
    const d = { date, scans: 0, inactive: 0 };
    days.push(d);
    index.set(date, d);
  }
  const byService = new Map<string, number>();
  let inactiveTotal = 0;
  for (const s of db.qrScans) {
    if (s.codeId !== id) continue;
    const d = index.get(s.date);
    if (s.inactive) {
      inactiveTotal += s.n;
      if (d) d.inactive += s.n;
      continue;
    }
    if (d) d.scans += s.n;
    const name = findService(s.serviceId)?.name ?? "Outside service times";
    byService.set(name, (byService.get(name) ?? 0) + s.n);
  }
  return ok({
    code: toCode(c, now),
    byDay: days,
    byService: [...byService].map(([service, scans]) => ({ service, scans })).sort((a, b) => b.scans - a.scans),
    inactiveTotal,
  });
}

/* ============================================================== validate */

const isInstant = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v);
const DEFAULT_CAPTION: Record<DestinationType, string> = {
  guest_form: "New here? Scan to say hello",
  short_form: "New here? Scan to say hello",
  plan_visit: "Plan your visit",
  event: "Scan for the programme",
  course: "Scan to sign up",
  prayer_wall: "Share a prayer request",
};

type Clean = Omit<QrInput, "draft" | "legacyUrl"> & { legacyUrl: string | null };

function validate(input: Partial<QrInput>, self: QrRecord | null, creating: boolean): Result<Clean> {
  const fields: Record<string, string[]> = {};
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) fields.name = ["Give the code a name"];
  else if (name.length > 60) fields.name = ["Keep the name under 60 characters"];
  else if (db.qrCodes.some((c) => c !== self && c.name.toLowerCase() === name.toLowerCase())) fields.name = ["Another code already has this name"];

  const destination = DESTINATIONS.includes(input.destination as DestinationType) ? (input.destination as DestinationType) : null;
  if (!destination) fields.destination = ["Choose where the code goes"];
  let targetId: string | null = null;
  if (destination === "event") {
    const s = findService(input.targetId ?? null);
    if (!s || s.kind !== "special") fields.targetId = ["Choose the event"];
    else targetId = s.id;
  } else if (destination === "course") {
    if (!COURSES.some((x) => x.id === input.targetId)) fields.targetId = ["Choose the course"];
    else targetId = input.targetId!;
  }
  const serviceId = input.serviceId ? (findService(input.serviceId)?.id ?? null) : null;
  if (input.serviceId && !serviceId) fields.serviceId = ["That service no longer exists"];

  const activeFrom = input.activeFrom ?? null;
  const expiresAt = input.expiresAt ?? null;
  if (activeFrom !== null && !isInstant(activeFrom)) fields.activeFrom = ["Enter a valid date and time"];
  if (expiresAt !== null && !isInstant(expiresAt)) fields.expiresAt = ["Enter a valid date and time"];
  if (!fields.activeFrom && !fields.expiresAt && activeFrom && expiresAt && Date.parse(expiresAt) <= Date.parse(activeFrom))
    fields.expiresAt = ["The expiry must be after the start"];

  const note = String(input.note ?? "").trim();
  if (note.length > 500) fields.note = ["Keep the note under 500 characters"];
  const caption = String(input.caption ?? "").trim().replace(/\s+/g, " ") || (destination ? DEFAULT_CAPTION[destination] : "");
  if (caption.length > 60) fields.caption = ["Keep the caption under 60 characters"];

  let legacyUrl: string | null = self?.legacyUrl ?? null;
  if (creating && input.legacyUrl != null && input.legacyUrl !== "") {
    const raw = String(input.legacyUrl).trim();
    let valid = false;
    try {
      valid = /^https?:$/.test(new URL(raw).protocol);
    } catch {
      valid = false;
    }
    if (!valid) fields.legacyUrl = ["Enter the full address on the printed code, starting with https://"];
    else if (db.qrCodes.some((c) => c.legacyUrl?.toLowerCase() === raw.toLowerCase())) fields.legacyUrl = ["This printed code is already registered"];
    else legacyUrl = raw;
  }

  if (Object.keys(fields).length) {
    const taken = Object.keys(fields).length === 1 && fields.name?.[0] === "Another code already has this name";
    return no(taken ? 409 : 422, taken ? "NAME_TAKEN" : "VALIDATION_FAILED", Object.values(fields)[0]![0]!, fields);
  }
  return ok({ name, destination: destination!, targetId, serviceId, activeFrom, expiresAt, note, caption, legacyUrl });
}

/** QR-8 for the form, before saving: the warnings this code would get. */
export function checkQr(u: StaffRecord, input: Partial<QrInput> & { id?: string }, now = new Date()): Result<{ warnings: QrWarning[] }> {
  if (!allowed(u, "qr.manage")) return no(403, "FORBIDDEN", FORBIDDEN);
  const destination = DESTINATIONS.includes(input.destination as DestinationType) ? (input.destination as DestinationType) : "guest_form";
  return ok({
    warnings: warningsFor(
      {
        id: input.id ?? "",
        destination,
        targetId: NEEDS_TARGET.includes(destination) ? (input.targetId ?? null) : null,
        serviceId: input.serviceId ?? null,
        activeFrom: isInstant(input.activeFrom) ? input.activeFrom : null,
        expiresAt: isInstant(input.expiresAt) ? input.expiresAt : null,
      },
      now,
    ),
  });
}

/* ================================================================ change */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newSlug() {
  for (;;) {
    let s = "";
    for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!db.qrCodes.some((c) => c.slug === s)) return s;
  }
}

const dates = (c: Pick<QrRecord, "activeFrom" | "expiresAt">) => ({ activeFrom: c.activeFrom, expiresAt: c.expiresAt });
const touch = (c: QrRecord, u: StaffRecord) => {
  c.rowVer++;
  c.updatedAt = new Date().toISOString();
  c.updatedById = u.id;
};

export function createQr(u: StaffRecord, input: Partial<QrInput>, now = new Date()): Result<{ code: QrCode }> {
  if (!allowed(u, "qr.manage")) return no(403, "FORBIDDEN", FORBIDDEN);
  const v = validate(input, null, true);
  if (!v.ok) return v;
  const draft = !!input.draft && !v.body.legacyUrl;
  const id = `qr-${Math.max(0, ...db.qrCodes.map((c) => Number(c.id.slice(3)) || 0)) + 1}`;
  const at = now.toISOString();
  const rec: QrRecord = {
    id,
    slug: v.body.legacyUrl ? null : newSlug(),
    ...v.body,
    // A live code with no start date starts now.
    activeFrom: v.body.activeFrom ?? (draft ? null : at),
    state: draft ? "draft" : "live",
    createdAt: at,
    createdById: u.id,
    updatedAt: at,
    updatedById: u.id,
    rowVer: 1,
  };
  db.qrCodes.push(rec);
  audit(u.id, v.body.legacyUrl ? "welcome.qr.legacy" : "welcome.qr.create", id, {
    after: { name: rec.name, destination: destinationOf(rec).label, ...dates(rec), state: rec.state, ...(rec.legacyUrl ? { legacyUrl: rec.legacyUrl } : {}) },
  });
  return ok({ code: toCode(rec, now) }, 201);
}

/** Dates moved so an expired code works again: logged as a renewal (QR-4). */
const renewing = (c: QrRecord, next: Pick<QrRecord, "activeFrom" | "expiresAt">, now: Date) =>
  statusOf(c, now) === "expired" && statusOf({ ...c, ...next }, now) !== "expired";

/**
 * Full edit. The printed image stays valid: the slug never changes, only where
 * it leads (PRD 8.3).
 */
export function updateQr(u: StaffRecord, id: string, input: Partial<QrInput> & { rowVer?: number }, now = new Date()): Result<{ code: QrCode }> {
  if (!allowed(u, "qr.manage")) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCode(id);
  if (!c) return no(404, "NOT_FOUND", "That QR code no longer exists.");
  if (input.rowVer !== c.rowVer) return no(409, "CONFLICT", `Someone else changed ${c.name} while you were editing. Reopen it to see their changes.`);
  const v = validate(input, c, false);
  if (!v.ok) return v;
  const next = { ...v.body, activeFrom: v.body.activeFrom ?? (c.state === "draft" ? null : c.activeFrom ?? now.toISOString()) };
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const view = (r: Pick<QrRecord, "name" | "destination" | "targetId" | "serviceId" | "activeFrom" | "expiresAt" | "note" | "caption">) => ({
    name: r.name,
    destination: destinationOf({ ...r, serviceId: null }).label,
    service: findService(r.serviceId)?.name ?? null,
    activeFrom: r.activeFrom,
    expiresAt: r.expiresAt,
    note: r.note,
    caption: r.caption,
  });
  const b = view(c);
  const a = view(next);
  for (const k of Object.keys(a) as (keyof typeof a)[])
    if (a[k] !== b[k]) {
      before[k] = b[k];
      after[k] = a[k];
    }
  if (!Object.keys(after).length) return ok({ code: toCode(c, now) });
  const renew = renewing(c, next, now);
  Object.assign(c, { name: next.name, destination: next.destination, targetId: next.targetId, serviceId: next.serviceId, activeFrom: next.activeFrom, expiresAt: next.expiresAt, note: next.note, caption: next.caption });
  touch(c, u);
  audit(u.id, renew ? "welcome.qr.renew" : "welcome.qr.update", id, { before, after });
  return ok({ code: toCode(c, now) });
}

/** Quick edit from the list: start and expiry only (QR-4). */
export function setQrDates(u: StaffRecord, id: string, input: Partial<QrDatesInput>, now = new Date()): Result<{ code: QrCode }> {
  if (!allowed(u, "qr.manage")) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCode(id);
  if (!c) return no(404, "NOT_FOUND", "That QR code no longer exists.");
  if (input.rowVer !== c.rowVer) return no(409, "CONFLICT", `Someone else changed ${c.name} while you were editing. Reopen it to see their changes.`);
  const fields: Record<string, string[]> = {};
  const activeFrom = input.activeFrom ?? null;
  const expiresAt = input.expiresAt ?? null;
  if (activeFrom !== null && !isInstant(activeFrom)) fields.activeFrom = ["Enter a valid date and time"];
  if (expiresAt !== null && !isInstant(expiresAt)) fields.expiresAt = ["Enter a valid date and time"];
  if (!Object.keys(fields).length && activeFrom && expiresAt && Date.parse(expiresAt) <= Date.parse(activeFrom))
    fields.expiresAt = ["The expiry must be after the start"];
  if (Object.keys(fields).length) return no(422, "VALIDATION_FAILED", Object.values(fields)[0]![0]!, fields);
  const next = { activeFrom: activeFrom ?? (c.state === "draft" ? null : (c.activeFrom ?? now.toISOString())), expiresAt };
  if (next.activeFrom === c.activeFrom && next.expiresAt === c.expiresAt) return ok({ code: toCode(c, now) });
  const renew = renewing(c, next, now);
  const before = dates(c);
  Object.assign(c, next);
  touch(c, u);
  audit(u.id, renew ? "welcome.qr.renew" : "welcome.qr.dates", id, { before, after: dates(c) });
  return ok({ code: toCode(c, now) });
}

/** Turn on a draft, pause a live code or resume a paused one. */
export function setQrState(u: StaffRecord, id: string, to: "live" | "paused", rowVer: unknown, now = new Date()): Result<{ code: QrCode }> {
  if (!allowed(u, "qr.manage")) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCode(id);
  if (!c) return no(404, "NOT_FOUND", "That QR code no longer exists.");
  if (rowVer !== c.rowVer) return no(409, "CONFLICT", `Someone else changed ${c.name} while you were working. Reload to see their changes.`);
  if (c.state === to) return ok({ code: toCode(c, now) });
  if (to === "paused" && c.state === "draft") return no(409, "NOT_LIVE", "A draft is not on yet, so there is nothing to pause.");
  const from = c.state;
  const action = to === "paused" ? "welcome.qr.pause" : from === "draft" ? "welcome.qr.publish" : "welcome.qr.resume";
  c.state = to;
  if (to === "live" && !c.activeFrom) c.activeFrom = now.toISOString();
  touch(c, u);
  audit(u.id, action, id, { before: { state: from }, after: { state: to, ...(action === "welcome.qr.publish" ? dates(c) : {}) } });
  return ok({ code: toCode(c, now) });
}

/** A deleted code's address shows the inactive page. The printed legacy code cannot be deleted. */
export function deleteQr(u: StaffRecord, id: string): Result<{ deleted: true }> {
  if (!allowed(u, "qr.manage")) return no(403, "FORBIDDEN", FORBIDDEN);
  const c = findCode(id);
  if (!c) return no(404, "NOT_FOUND", "That QR code no longer exists.");
  if (c.legacyUrl) return no(409, "LEGACY_CODE", "This is the code already printed around the church. Pause it instead, so it can be switched back on.");
  db.qrCodes.splice(db.qrCodes.indexOf(c), 1);
  audit(u.id, "welcome.qr.delete", id, { before: { name: c.name, destination: destinationOf(c).label, ...dates(c), state: c.state } });
  return ok({ deleted: true });
}

/** Printing is logged, like the other exports. The sheet itself is drawn in the browser as vector output. */
export function logPrint(u: StaffRecord, body: { ids?: unknown; layout?: unknown; copies?: unknown }): Result<{ logged: true }> {
  if (!allowed(u, "qr.print")) return no(403, "FORBIDDEN", FORBIDDEN);
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const codes = ids.map(findCode);
  if (!ids.length || codes.some((c) => !c)) return no(422, "VALIDATION_FAILED", "Choose at least one code to print.", { ids: ["Choose at least one code to print."] });
  if (!PRINT_LAYOUTS.includes(body.layout as (typeof PRINT_LAYOUTS)[number])) return no(422, "VALIDATION_FAILED", "Choose a layout.", { layout: ["Choose a layout."] });
  audit(u.id, "welcome.qr.print", ids.length === 1 ? ids[0]! : `${ids.length} codes`, {
    after: { codes: codes.map((c) => c!.name), layout: body.layout, copies: Number(body.copies) || 1 },
  });
  return ok({ logged: true });
}

/* ================================================================== scan */

/** The service running at a scan, for counting by service (no personal data). */
function serviceAt(now: Date) {
  const date = churchDate(now);
  const special = db.services.find((s) => s.active && s.kind === "special" && s.startsOn && s.endsOn && s.startsOn <= date && date <= s.endsOn);
  if (special) return special.id;
  const local = toChurchLocal(now);
  const mins = +local.slice(11, 13) * 60 + +local.slice(14, 16);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekly = db.services.find((s) => {
    if (!s.active || s.kind !== "weekly" || s.day !== weekday || !s.time) return false;
    const start = +s.time.slice(0, 2) * 60 + +s.time.slice(3, 5);
    return mins >= start - 60 && mins <= start + SERVICE_LENGTH_MIN + 30;
  });
  return weekly?.id ?? null;
}

const INACTIVE_LINKS = [
  { label: "Fill in the guest form", url: `${PORTAL_BASE}/welcome` },
  { label: "Plan a Visit", url: `${PORTAL_BASE}/plan-a-visit` },
];

/**
 * QR-2, QR-3: the short address, read at request time so a changed destination
 * or date takes effect at once. Never a blank error.
 */
export function resolveQr(slug: string, now = new Date()): QrResolve {
  const c = db.qrCodes.find((x) => x.slug === slug.toUpperCase());
  if (!c) return { outcome: "inactive", reason: "unknown", startsAt: null, links: INACTIVE_LINKS };
  const status = statusOf(c, now);
  const live = status === "active";
  const date = churchDate(now);
  const serviceId = serviceAt(now);
  const row = db.qrScans.find((s) => s.codeId === c.id && s.date === date && s.serviceId === serviceId && s.inactive === !live);
  if (row) row.n++;
  else db.qrScans.push({ codeId: c.id, date, serviceId, inactive: !live, n: 1 });
  if (live) return { outcome: "redirect", url: destinationOf(c).url };
  const reason = status === "scheduled" ? "not_started" : status === "draft" ? "draft" : status;
  return { outcome: "inactive", reason, startsAt: status === "scheduled" ? c.activeFrom : null, links: INACTIVE_LINKS };
}
