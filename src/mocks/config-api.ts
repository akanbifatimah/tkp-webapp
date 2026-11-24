import { CELL_NAMES, type CellMapResponse, type CellName, type Service, type ServiceInput, type ServicesResponse, type SetZipResponse, type ZipRow } from "@/features/admin/config-types";
import { can, type Permission } from "@/lib/permissions";
import { churchDate } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import type { ServiceRecord } from "./seed/services";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock configuration "server" (docs/API.md §8): the cell group and ZIP map
 * (PRD W-12, IL-5) and the services and special events manager (W-13, CA-2).
 * Every change is audited with old and new values.
 */

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

/** Where a ZIP sits, from the ZIP outlines (the real API reads its ZipGeo table). */
export type ZipPlace = { city: string | null; county: string | null };

/* ================================================================= cell map */

/** Greater Houston: on the outline list, or a 77xxx ZIP. */
const isHouston = (zip: string, geo: Map<string, ZipPlace>) => geo.has(zip) || zip.startsWith("77");

export function getCellMap(u: StaffRecord, geo: Map<string, ZipPlace> = new Map(), now = new Date()): Result<CellMapResponse> {
  if (!allowed(u, "config.cells")) return no(403, "FORBIDDEN", FORBIDDEN);
  const year = churchDate(now).slice(0, 4);
  const rows = new Map<string, ZipRow & { cities: Map<string, number> }>();
  const row = (zip: string) => {
    let r = rows.get(zip);
    if (!r) {
      r = { zip, city: geo.get(zip)?.city ?? null, county: geo.get(zip)?.county ?? null, entries: 0, thisYear: 0, lastSeen: null, cities: new Map() };
      rows.set(zip, r);
    }
    return r;
  };
  let noZip = 0;
  for (const e of db.entries) {
    if (!e.zip) {
      noZip++;
      continue;
    }
    const r = row(e.zip);
    r.entries++;
    if (e.serviceDate.startsWith(year)) r.thisYear++;
    if (!r.lastSeen || e.serviceDate > r.lastSeen) r.lastSeen = e.serviceDate;
    if (e.city) r.cities.set(e.city, (r.cities.get(e.city) ?? 0) + 1);
  }
  for (const zip of Object.keys(db.cellMap.zips)) row(zip);
  const out = (r: ZipRow & { cities: Map<string, number> }): ZipRow => ({
    zip: r.zip,
    // The outline's city first; otherwise what most guests wrote.
    city: r.city ?? ([...r.cities].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null),
    county: r.county,
    entries: r.entries,
    thisYear: r.thisYear,
    lastSeen: r.lastSeen,
  });

  const cells = CELL_NAMES.map((cell) => {
    const zips = [...rows.values()].filter((r) => db.cellMap.zips[r.zip] === cell).map(out).sort((a, b) => a.zip.localeCompare(b.zip));
    return { cell, zips, entries: zips.reduce((a, z) => a + z.entries, 0), thisYear: zips.reduce((a, z) => a + z.thisYear, 0) };
  });
  const loose = [...rows.values()].filter((r) => !db.cellMap.zips[r.zip]);
  return ok({
    cells,
    unmapped: loose
      .filter((r) => isHouston(r.zip, geo))
      .map(out)
      .sort((a, b) => b.thisYear - a.thisYear || b.entries - a.entries || a.zip.localeCompare(b.zip)),
    outOfArea: loose.filter((r) => !isHouston(r.zip, geo)).reduce((a, r) => a + r.entries, 0),
    noZip,
    rowVer: db.cellMap.rowVer,
    updatedAt: db.cellMap.updatedAt,
    updatedBy: nameOf(db.cellMap.updatedById),
  });
}

/** W-12: a changed mapping recalculates the cell group of every entry with that ZIP. */
function recalculate(zip: string, cell: CellName | null) {
  const value = cell ?? "N/A";
  let n = 0;
  for (const e of db.entries) {
    if (e.zip === zip && e.cellGroup !== value) {
      e.cellGroup = value;
      n++;
    }
  }
  for (const r of db.connect) if (r.entry.zip === zip) r.entry.cellGroup = value;
  return n;
}

function changeZip(u: StaffRecord, rawZip: string, cell: CellName | null, rowVer: unknown): Result<SetZipResponse> {
  if (!allowed(u, "config.cells")) return no(403, "FORBIDDEN", FORBIDDEN);
  const zip = String(rawZip ?? "").trim();
  if (!/^\d{5}$/.test(zip)) return no(422, "VALIDATION_FAILED", "Enter a 5-digit ZIP code", { zip: ["Enter a 5-digit ZIP code"] });
  if (cell !== null && !CELL_NAMES.includes(cell)) return no(422, "VALIDATION_FAILED", "Choose a cell group", { cell: ["Choose a cell group"] });
  if (rowVer !== db.cellMap.rowVer)
    return no(409, "CONFLICT", "Someone else changed the cell map while you were working. Reload to see their changes.");
  const from = db.cellMap.zips[zip] ?? null;
  if (from === cell) return ok({ zip, cell, from, recalculated: 0, rowVer: db.cellMap.rowVer });
  if (cell === null) delete db.cellMap.zips[zip];
  else db.cellMap.zips[zip] = cell;
  const recalculated = recalculate(zip, cell);
  db.cellMap.rowVer++;
  db.cellMap.updatedAt = new Date().toISOString();
  db.cellMap.updatedById = u.id;
  audit(u.id, cell === null ? "welcome.cellmap.remove" : "welcome.cellmap.set", zip, {
    before: { cell: from ?? "N/A" },
    after: { cell: cell ?? "N/A", recalculated },
  });
  return ok({ zip, cell, from, recalculated, rowVer: db.cellMap.rowVer });
}

/** Adds a ZIP to a cell, or moves it from another cell. */
export const setZip = (u: StaffRecord, zip: string, body: { cell?: unknown; rowVer?: unknown }) =>
  changeZip(u, zip, (body.cell ?? "") as CellName, body.rowVer);

/** Takes a ZIP off the map: its entries become N/A. */
export function removeZip(u: StaffRecord, zip: string, rowVer: unknown): Result<SetZipResponse> {
  if (allowed(u, "config.cells") && !db.cellMap.zips[String(zip)]) return no(404, "NOT_FOUND", `${zip} is not on the cell map.`);
  return changeZip(u, zip, null, rowVer);
}

/* ================================================================= services */

/** Anyone who filters Welcome by service may read the list (the guest form reads it too, PRD G-4). */
const READ_SERVICES: Permission[] = ["config.services", "welcome.overview.view", "welcome.lookup.view", "welcome.lcm.view"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayName = (d: number) => DAYS[d] ?? "";

const onForm = (s: ServiceRecord, today: string) =>
  s.active && (s.kind === "weekly" || !s.startsOn || !s.endsOn || (s.startsOn <= today && today <= s.endsOn));

const usage = () => {
  const m = new Map<string, { entries: number; lastUsed: string | null }>();
  for (const e of db.entries) {
    const u = m.get(e.serviceType) ?? { entries: 0, lastUsed: null };
    u.entries++;
    if (!u.lastUsed || e.serviceDate > u.lastUsed) u.lastUsed = e.serviceDate;
    m.set(e.serviceType, u);
  }
  return m;
};

const sorted = () => [...db.services].sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder);

function toService(s: ServiceRecord, used = usage(), today = churchDate(new Date())): Service {
  const u = used.get(s.name);
  return { ...s, entries: u?.entries ?? 0, lastUsed: u?.lastUsed ?? null, onForm: onForm(s, today) };
}

export function listServices(u: StaffRecord, now = new Date()): Result<ServicesResponse> {
  if (!READ_SERVICES.some((p) => allowed(u, p))) return no(403, "FORBIDDEN", FORBIDDEN);
  const today = churchDate(now);
  const used = usage();
  const items = sorted().map((s) => toService(s, used, today));
  return ok({ items, formToday: [...items.filter((s) => s.onForm).map((s) => s.name), "Other"] });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateService(input: Partial<ServiceInput>, selfId: string | null): Result<ServiceInput> {
  const fields: Record<string, string[]> = {};
  const name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  const shortName = String(input.shortName ?? "").trim().replace(/\s+/g, " ") || name.slice(0, 20);
  const kind = input.kind === "special" ? "special" : input.kind === "weekly" ? "weekly" : null;
  if (name.length < 2) fields.name = ["Enter the service name"];
  else if (name.length > 60) fields.name = ["Keep the name under 60 characters"];
  else if (name.toLowerCase() === "other") fields.name = ["“Other” is always on the form; choose another name"];
  else if (db.services.some((s) => s.id !== selfId && s.name.toLowerCase() === name.toLowerCase()))
    fields.name = ["There is already a service with this name"];
  if (shortName.length > 20) fields.shortName = ["Keep the chart label under 20 characters"];
  if (!kind) fields.kind = ["Choose weekly or special event"];
  let day: number | null = null;
  let time: string | null = null;
  let startsOn: string | null = null;
  let endsOn: string | null = null;
  if (kind === "weekly") {
    day = Number.isInteger(input.day) && input.day! >= 0 && input.day! <= 6 ? input.day! : null;
    time = typeof input.time === "string" && TIME_RE.test(input.time) ? input.time : null;
    if (day === null) fields.day = ["Choose the day"];
    if (time === null) fields.time = ["Enter the start time"];
  }
  if (kind === "special") {
    startsOn = input.startsOn && DATE_RE.test(input.startsOn) ? input.startsOn : null;
    endsOn = input.endsOn && DATE_RE.test(input.endsOn) ? input.endsOn : null;
    if (input.startsOn && !startsOn) fields.startsOn = ["Enter a valid date"];
    if (input.endsOn && !endsOn) fields.endsOn = ["Enter a valid date"];
    if (!fields.startsOn && !fields.endsOn) {
      if (!!startsOn !== !!endsOn) fields[startsOn ? "endsOn" : "startsOn"] = ["Give both dates, or neither"];
      else if (startsOn && endsOn && endsOn < startsOn) fields.endsOn = ["The last day is before the first day"];
    }
  }
  if (Object.keys(fields).length) {
    const taken = fields.name?.[0] === "There is already a service with this name" && Object.keys(fields).length === 1;
    return no(taken ? 409 : 422, taken ? "NAME_TAKEN" : "VALIDATION_FAILED", Object.values(fields)[0]![0]!, fields);
  }
  return ok({ name, shortName, kind: kind!, day, time, startsOn, endsOn, shortForm: !!input.shortForm });
}

const pickChanged = (before: Record<string, unknown>, after: Record<string, unknown>) => {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after))
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  return { before: b, after: a };
};
const inputOf = (s: ServiceRecord): ServiceInput => ({
  name: s.name,
  shortName: s.shortName,
  kind: s.kind,
  day: s.day,
  time: s.time,
  startsOn: s.startsOn,
  endsOn: s.endsOn,
  shortForm: s.shortForm,
});

export function createService(u: StaffRecord, input: Partial<ServiceInput>): Result<{ service: Service }> {
  if (!allowed(u, "config.services")) return no(403, "FORBIDDEN", FORBIDDEN);
  const v = validateService(input, null);
  if (!v.ok) return v;
  const id = `svc-${Math.max(0, ...db.services.map((s) => Number(s.id.slice(4)) || 0)) + 1}`;
  const rec: ServiceRecord = {
    id,
    ...v.body,
    active: true,
    sortOrder: Math.max(0, ...db.services.filter((s) => s.active).map((s) => s.sortOrder)) + 1,
    rowVer: 1,
    updatedAt: new Date().toISOString(),
  };
  // Keep retired services after the active ones.
  for (const s of db.services) if (!s.active && s.sortOrder >= rec.sortOrder) s.sortOrder++;
  db.services.push(rec);
  audit(u.id, "welcome.service.create", id, { after: { ...v.body } });
  return ok({ service: toService(rec) }, 201);
}

const findService = (id: string) => db.services.find((s) => s.id === id);

/**
 * A new name applies to past entries too: in TKP Hub an entry points at the
 * service, so its name follows (the mock rewrites the stored text).
 */
export function updateService(u: StaffRecord, id: string, input: Partial<ServiceInput> & { rowVer?: number }): Result<{ service: Service; renamedEntries: number }> {
  if (!allowed(u, "config.services")) return no(403, "FORBIDDEN", FORBIDDEN);
  const rec = findService(id);
  if (!rec) return no(404, "NOT_FOUND", "That service no longer exists.");
  if (input.rowVer !== rec.rowVer) return no(409, "CONFLICT", `Someone else changed ${rec.name} while you were editing. Reopen to see their changes.`);
  const v = validateService(input, id);
  if (!v.ok) return v;
  const diff = pickChanged(inputOf(rec), v.body);
  if (!Object.keys(diff.after).length) return ok({ service: toService(rec), renamedEntries: 0 });
  let renamedEntries = 0;
  if (v.body.name !== rec.name) {
    for (const e of db.entries)
      if (e.serviceType === rec.name) {
        e.serviceType = v.body.name;
        renamedEntries++;
      }
    for (const r of db.connect) if (r.entry.serviceType === rec.name) r.entry.serviceType = v.body.name;
  }
  Object.assign(rec, v.body);
  rec.rowVer++;
  rec.updatedAt = new Date().toISOString();
  audit(u.id, "welcome.service.update", id, renamedEntries ? { before: diff.before, after: { ...diff.after, renamedEntries } } : diff);
  return ok({ service: toService(rec), renamedEntries });
}

/** Retired services leave the guest form; their past entries stay and still count. */
export function setServiceActive(u: StaffRecord, id: string, active: boolean): Result<{ service: Service }> {
  if (!allowed(u, "config.services")) return no(403, "FORBIDDEN", FORBIDDEN);
  const rec = findService(id);
  if (!rec) return no(404, "NOT_FOUND", "That service no longer exists.");
  if (rec.active === active) return ok({ service: toService(rec) });
  if (!active && db.services.filter((s) => s.active).length <= 1)
    return no(409, "LAST_SERVICE", "The guest form needs at least one service. Add another before retiring this one.");
  rec.active = active;
  // Restored services go to the end of the active list.
  if (active) rec.sortOrder = Math.max(0, ...db.services.filter((s) => s.active && s !== rec).map((s) => s.sortOrder)) + 1;
  rec.rowVer++;
  rec.updatedAt = new Date().toISOString();
  audit(u.id, active ? "welcome.service.restore" : "welcome.service.retire", id, { before: { active: !active }, after: { active } });
  return ok({ service: toService(rec) });
}

/** Only a service nobody has chosen yet can be deleted (a typo); anything else is retired. */
export function deleteService(u: StaffRecord, id: string): Result<{ deleted: true }> {
  if (!allowed(u, "config.services")) return no(403, "FORBIDDEN", FORBIDDEN);
  const rec = findService(id);
  if (!rec) return no(404, "NOT_FOUND", "That service no longer exists.");
  const n = usage().get(rec.name)?.entries ?? 0;
  if (n) return no(409, "IN_USE", `${n.toLocaleString()} form ${n === 1 ? "entry names" : "entries name"} ${rec.name}. Retire it instead, so those entries keep their service.`);
  if (rec.active && db.services.filter((s) => s.active).length <= 1)
    return no(409, "LAST_SERVICE", "The guest form needs at least one service. Add another before deleting this one.");
  db.services.splice(db.services.indexOf(rec), 1);
  audit(u.id, "welcome.service.delete", id, { before: { name: rec.name } });
  return ok({ deleted: true });
}

/** The order of the active services on the guest form. */
export function reorderServices(u: StaffRecord, ids: unknown): Result<ServicesResponse> {
  if (!allowed(u, "config.services")) return no(403, "FORBIDDEN", FORBIDDEN);
  const active = db.services.filter((s) => s.active);
  const list = Array.isArray(ids) ? ids.map(String) : [];
  if (list.length !== active.length || new Set(list).size !== list.length || !active.every((s) => list.includes(s.id)))
    return no(422, "VALIDATION_FAILED", "Send every active service exactly once.", { ids: ["Send every active service exactly once."] });
  const before = sorted()
    .filter((s) => s.active)
    .map((s) => s.name);
  list.forEach((sid, i) => (findService(sid)!.sortOrder = i + 1));
  let next = list.length;
  for (const s of db.services.filter((x) => !x.active).sort((a, b) => a.sortOrder - b.sortOrder)) s.sortOrder = ++next;
  const after = list.map((sid) => findService(sid)!.name);
  if (JSON.stringify(before) !== JSON.stringify(after)) audit(u.id, "welcome.service.reorder", "services", { before: { order: before }, after: { order: after } });
  return listServices(u);
}
