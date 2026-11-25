import { MULTI_KEYS, STEP_KEYS, type MultiKey, type StepKey } from "@/features/connect/model";
import type { ChecklistEntry, LogRow } from "@/features/connect/types";
import {
  IMPORT_FIELDS,
  IMPORT_LIMITS,
  type ImportColumn,
  type ImportCounts,
  type ImportField,
  type ImportJob,
  type ImportKind,
  type ImportListResponse,
  type ImportPatch,
  type ImportPreviewRow,
  type ImportResult,
  type ImportSettings,
  type ImportStatus,
  type ImportSummary,
} from "@/features/welcome/import-types";
import { can } from "@/lib/permissions";
import { churchDate, fromChurchLocal } from "@/lib/time";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import { normalEmail, normalPhone } from "./duplicates-api";
import { extensionOf, type Cell, type RawSheet } from "./import-parse";
import type { ConnectRecord, WelcomeEntry } from "./seed/guests";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock import engine (PRD W-16, WT-5; docs/API.md §11). Past guest
 * entries and follow-up tracker records. Nothing here sends a message or
 * starts a follow-up clock on its own; an import is a batch that can be
 * undone for 30 days, and importing the same file again adds nothing twice.
 */

const ok = <T,>(body: T, status = 200): Result<T> => ({ ok: true, status, body });
const no = (status: number, code: string, message: string, fields?: Record<string, string[]>): Result<never> => ({
  ok: false,
  status,
  code,
  message,
  ...(fields ? { fields } : {}),
});
const allowed = (u: StaffRecord) => u.roles.some((r) => can(r, "welcome.import"));
/** Follow-up tracker records are Connect notes: only the admins import them (TKP, 2026-11-25). The Welcome Lead imports guest entries. */
const kindAllowed = (u: StaffRecord, kind: ImportKind) => kind === "guests" || u.roles.some((r) => can(r, "welcome.import.followups"));
const nameOf = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? null) : null);
const DAY = 86_400_000;

/* ----------------------------------------------------------------- the stored job */

type UndoInfo = {
  createdRecords: { connectId: number; rowVer: number }[];
  createdEntries: number[];
  createdLogs: number[];
  updatedEntries: { id: number; before: WelcomeEntry; after: WelcomeEntry }[];
  /** Existing people a new visit was added to: their journey flags before, and rowVer after. */
  touched: { connectId: number; before: Pick<ConnectRecord, "state">; rowVer: number }[];
  /** Visit numbers before, for every entry of a person the import touched. */
  visitNumbers: Record<number, number>;
};

export type ImportRecord = {
  id: string;
  kind: ImportKind;
  fileName: string;
  fileSize: number;
  createdAt: string;
  createdById: string;
  status: ImportStatus;
  expiresAt: string;
  /** The staged file. Private to whoever uploaded it; dropped on discard and after commit. */
  raw: RawSheet[] | null;
  sheets: { name: string; rows: number }[];
  sheet: string;
  mapping: Record<number, string | null>;
  confidence: Record<number, number>;
  settings: ImportSettings;
  fixes: Record<number, Record<string, string | null>>;
  /** The preview and column names at commit time, kept for the history and the error file. */
  frozen: ImportJob["rows"] | null;
  frozenHeaders: string[] | null;
  counts: ImportCounts;
  result: ImportResult | null;
  idempotencyKey: string | null;
  committedAt: string | null;
  committedById: string | null;
  undoneAt: string | null;
  undoneById: string | null;
  undoUntil: string | null;
  undo: UndoInfo | null;
};

/* ----------------------------------------------------------------- reading cells */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A cell as text. Excel dates arrive as Date objects (UTC midnight for a plain date). */
export function cellText(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) {
    const iso = c.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof c === "boolean") return c ? "Yes" : "No";
  return String(c).trim();
}

/** A date in any of the ways people type it, or an Excel serial number. Returns YYYY-MM-DD or null. */
export function parseDate(raw: string, order: "MDY" | "DMY"): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return ymd(+m[1]!, +m[2]!, +m[3]!);
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) {
    // Excel serial (days since 1899-12-30), as Excel writes dates into CSV.
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * DAY);
    return t.toISOString().slice(0, 10);
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T].*)?$/);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    const [a, b] = [+m[1]!, +m[2]!];
    return order === "MDY" ? ymd(y, a, b) : ymd(y, b, a);
  }
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})/);
  if (m && MONTHS.includes(m[1]!.slice(0, 3).toLowerCase())) return ymd(+m[3]!, MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1, +m[2]!);
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})/);
  if (m && MONTHS.includes(m[2]!.slice(0, 3).toLowerCase())) return ymd(+m[3]!, MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1, +m[1]!);
  return null;
}

/** A date with an optional time ("6:30 PM", "18:30"), in church time. No time = noon. Returns a UTC ISO instant. */
export function parseDateTime(raw: string, order: "MDY" | "DMY"): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s)) return new Date(s).toISOString();
  const date = parseDate(s, order);
  if (!date) return null;
  const t = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?\s*$/i);
  let h = 12;
  let min = 0;
  if (t) {
    h = +t[1]!;
    min = +t[2]!;
    const ap = t[3]?.toLowerCase().replace(/\./g, "");
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
  }
  return fromChurchLocal(`${date}T${pad(h)}:${pad(min)}`);
}

const ALIASES: Record<string, string> = { m: "Male", f: "Female", y: "Yes", n: "No", maybe: "Maybe", notsure: "Undecided", unsure: "Undecided", co: "Church office", churchoffice: "Church office", it: "Integration", integrationteam: "Integration", call: "Phone Call", phone: "Phone Call", text: "SMS", whatsapp: "WhatsApp Text", inperson: "In Person" };
const choose = (v: string, options: readonly string[]) => {
  const n = norm(v);
  return options.find((o) => norm(o) === n) ?? (ALIASES[n] && options.includes(ALIASES[n]!) ? ALIASES[n]! : null);
};

/* ----------------------------------------------------------------- columns */

/** Suggest a field for each column. 1 = the header is a known name; 0.6 = it contains one. Each field is used once. */
export function suggestMapping(headers: string[], fields: readonly ImportField[]): { field: string | null; confidence: number }[] {
  const scored: { col: number; field: string; score: number }[] = [];
  headers.forEach((h, col) => {
    const nh = norm(h);
    if (!nh) return;
    for (const f of fields) {
      const names = [f.label, ...f.synonyms].map(norm);
      const score = names.includes(nh) ? 1 : names.some((s) => s.length >= 4 && (nh.includes(s) || (nh.length >= 4 && s.includes(nh)))) ? 0.6 : 0;
      if (score) scored.push({ col, field: f.key, score });
    }
  });
  scored.sort((a, b) => b.score - a.score || a.col - b.col);
  const out = headers.map(() => ({ field: null as string | null, confidence: 0 }));
  const used = new Set<string>();
  for (const s of scored) {
    if (out[s.col]!.field || used.has(s.field)) continue;
    out[s.col] = { field: s.field, confidence: s.score };
    used.add(s.field);
  }
  return out;
}

/** The header row: the first of the first 10 with at least two text cells. */
const findHeaderRow = (data: Cell[][]) => {
  const i = data.slice(0, 10).findIndex((r) => r.filter((c) => typeof c === "string" && c.trim() && !/^\d+([./-]\d+)*$/.test(c.trim())).length >= 2);
  return i < 0 ? 1 : i + 1;
};

/* ----------------------------------------------------------------- matching people */

type Ctx = {
  byContact: Map<string, ConnectRecord[]>;
  entries: Map<string, WelcomeEntry>;
  logs: Map<string, LogRow>;
  services: string[];
  today: string;
};

function context(): Ctx {
  const byContact = new Map<string, ConnectRecord[]>();
  const add = (k: string | null, r: ConnectRecord) => {
    if (!k) return;
    const list = byContact.get(k) ?? [];
    if (!list.includes(r)) list.push(r);
    byContact.set(k, list);
  };
  const byId = new Map(db.connect.map((r) => [r.connectId, r]));
  for (const r of db.connect) {
    const p = normalPhone(r.entry.phone);
    const m = normalEmail(r.entry.email);
    add(p && `phone:${p}`, r);
    add(m && `email:${m}`, r);
  }
  for (const e of db.entries) {
    const r = byId.get(e.connectId);
    if (!r) continue;
    const p = normalPhone(e.phone);
    const m = normalEmail(e.email);
    add(p && `phone:${p}`, r);
    add(m && `email:${m}`, r);
  }
  return {
    byContact,
    entries: new Map(db.entries.map((e) => [`${e.connectId}|${e.serviceDate}`, e])),
    logs: new Map(db.connectLogs.map((l) => [`${l.connectId}|${l.savedAt.slice(0, 16)}|${l.team}`, l])),
    services: db.services.map((s) => s.name),
    today: churchDate(new Date()),
  };
}

/** A.1: phone or email, never the name. The oldest record wins when two share it. */
function findPerson(ctx: Ctx, phone: string | null, email: string | null) {
  for (const [kind, key] of [
    ["phone", phone && `phone:${phone}`],
    ["email", email && `email:${email}`],
  ] as const) {
    const list = key ? ctx.byContact.get(key) : undefined;
    if (list?.length) {
      const sorted = [...list].sort((a, b) => a.entry.serviceDate.localeCompare(b.entry.serviceDate) || a.connectId - b.connectId);
      return { record: sorted[0]!, by: kind, others: sorted.length - 1 };
    }
  }
  return null;
}
const nameOfRecord = (r: ConnectRecord) => `${r.entry.firstName ?? ""} ${r.entry.lastName ?? ""}`.trim();
const sameName = (a: string, b: string) => norm(a) === norm(b);

/* ----------------------------------------------------------------- the preview */

type Built = ImportPreviewRow & { personKey: string | null; target: ConnectRecord | null; existing: WelcomeEntry | LogRow | null; savedAt?: string; authorId?: string | null };

function rowsOf(job: ImportRecord) {
  const sheet = job.raw?.find((s) => s.name === job.sheet);
  if (!sheet) return { headers: [] as string[], body: [] as { rowNo: number; cells: Cell[] }[] };
  const headers = (sheet.data[job.settings.headerRow - 1] ?? []).map(cellText);
  const body = sheet.data
    .map((cells, i) => ({ rowNo: i + 1, cells }))
    .slice(job.settings.headerRow)
    .filter((r) => r.cells.some((c) => cellText(c) !== ""));
  return { headers, body };
}

export function buildPreview(job: ImportRecord): ImportPreviewRow[] {
  const ctx = context();
  const fields = IMPORT_FIELDS[job.kind];
  const { headers, body } = rowsOf(job);
  const seen = new Map<string, number>();
  const fileGuests = new Map<string, number>(); // contact key → first row of a new guest
  const out: Built[] = [];

  for (const { rowNo, cells } of body) {
    const fixes = job.fixes[rowNo] ?? {};
    const raw: Record<string, string> = {};
    const notes: string[] = [];
    cells.forEach((c, i) => {
      const f = job.mapping[i];
      const v = cellText(c);
      if (f) raw[f] = v;
      else if (v && job.settings.unmapped === "notes" && headers[i]) notes.push(`${headers[i]}: ${v}`);
    });
    for (const [k, v] of Object.entries(fixes)) raw[k] = v ?? "";
    const errors: ImportPreviewRow["errors"] = [];
    const warnings: string[] = [];
    const values: Record<string, string | null> = {};

    // Field by field, as the type says.
    for (const f of fields) {
      const v = (raw[f.key] ?? "").trim();
      if (!v) {
        values[f.key] = null;
        continue;
      }
      if (f.type === "phone") {
        const p = normalPhone(v);
        if (!p) warnings.push(`Phone “${v}” doesn't look right, so it was left out`);
        values[f.key] = p ? (p.startsWith("+1") && p.length === 12 ? `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}` : p) : null;
      } else if (f.type === "email") {
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        if (!ok) warnings.push(`Email “${v}” doesn't look right, so it was left out`);
        values[f.key] = ok ? v : null;
      } else if (f.type === "date") {
        const d = parseDate(v, job.settings.dateOrder);
        if (!d) errors.push({ field: f.key, message: `“${v}” isn't a date` });
        else if (d > ctx.today) errors.push({ field: f.key, message: "The date is in the future" });
        values[f.key] = d ?? v;
      } else if (f.type === "datetime") {
        const d = parseDateTime(v, job.settings.dateOrder);
        if (!d) errors.push({ field: f.key, message: `“${v}” isn't a date` });
        else if (d > new Date().toISOString()) errors.push({ field: f.key, message: "The date is in the future" });
        values[f.key] = d ?? v;
      } else if (f.type === "choice") {
        const c = choose(v, f.options ?? []);
        if (!c) warnings.push(`${f.label} “${v}” isn't one of ${(f.options ?? []).join(", ")}, so it was left out`);
        values[f.key] = c;
      } else if (f.type === "rating") {
        const n = Number(v);
        const ok = Number.isInteger(n) && n >= 0 && n <= 10;
        if (!ok) warnings.push(`${f.label} “${v}” isn't a number from 0 to 10, so it was left out`);
        values[f.key] = ok ? String(n) : null;
      } else values[f.key] = v;
    }
    const noteKey = job.kind === "guests" ? "comments" : "note";
    if (notes.length) values[noteKey] = [values[noteKey], ...notes].filter(Boolean).join(" · ");

    const row: Built = { rowNo, status: "new", values, cells: cells.map(cellText), errors, warnings, match: null, changes: [], fixed: Object.keys(fixes), personKey: null, target: null, existing: null };
    const phoneKey = normalPhone(values.phone);
    const emailKey = normalEmail(values.email);
    const found = findPerson(ctx, phoneKey, emailKey);
    if (found && found.others) warnings.push(`This phone or email belongs to ${found.others + 1} guests; linked to the oldest. Merge them in Duplicates.`);

    if (job.kind === "guests") {
      // The service: from the file, else the default.
      const svc = values.serviceType;
      const named = svc ? ctx.services.find((s) => norm(s) === norm(svc)) : null;
      if (svc && !named) errors.push({ field: "serviceType", message: `“${svc}” isn't a service. Choose one, or add it in Admin › Services.` });
      else if (!svc && !job.settings.defaultService) errors.push({ field: "serviceType", message: "No service. Choose one here, or set a default in the settings." });
      values.serviceType = named ?? (svc ? svc : job.settings.defaultService);
      if (!values.serviceDate && !errors.some((e) => e.field === "serviceDate")) errors.push({ field: "serviceDate", message: "The service date is missing" });
      const name = `${values.firstName ?? ""} ${values.lastName ?? ""}`.trim();
      if (!name && !phoneKey && !emailKey) errors.push({ field: null, message: "Needs a name, a phone or an email" });
      else if (!phoneKey && !emailKey) warnings.push("No phone or email: this guest can't be matched to anyone or followed up");

      if (found) {
        row.target = found.record;
        row.personKey = `rec:${found.record.connectId}`;
        row.match = `Existing guest #${found.record.connectId} ${nameOfRecord(found.record)} (same ${found.by})`;
        if (name && !sameName(name, nameOfRecord(found.record))) warnings.push(`The name differs from the guest it matches (${nameOfRecord(found.record)}). Matched by ${found.by}, never by name.`);
      } else {
        const key = (phoneKey && `phone:${phoneKey}`) || (emailKey && `email:${emailKey}`);
        const first = key ? fileGuests.get(key) : undefined;
        row.personKey = key ? `file:${key}` : `row:${rowNo}`;
        row.match = first ? `Same new guest as row ${first}` : "New guest";
        if (key && !first) fileGuests.set(key, rowNo);
      }
      if (row.personKey && values.serviceDate && !errors.some((e) => e.field === "serviceDate")) {
        const k = `${row.personKey}|${values.serviceDate}`;
        const dup = seen.get(k);
        if (dup) errors.push({ field: null, message: `Same guest and date as row ${dup}` });
        else seen.set(k, rowNo);
        if (row.target) {
          const ex = ctx.entries.get(`${row.target.connectId}|${values.serviceDate}`) ?? null;
          row.existing = ex;
          if (ex) row.changes = entryChanges(ex, values);
        }
      }
    } else {
      // Follow-up records belong to a guest who is already here.
      if (!phoneKey && !emailKey) errors.push({ field: "phone", message: "Needs the guest's phone or email to find them" });
      else if (!found) errors.push({ field: "phone", message: "No guest with this phone or email. Import their guest entry first." });
      else {
        row.target = found.record;
        row.match = `Guest #${found.record.connectId} ${nameOfRecord(found.record)} (same ${found.by})`;
        if (values.guestName && !sameName(values.guestName, nameOfRecord(found.record)))
          warnings.push(`The name in the file (${values.guestName}) differs from the guest (${nameOfRecord(found.record)}). Matched by ${found.by}, never by name.`);
      }
      if (!values.date && !errors.some((e) => e.field === "date")) errors.push({ field: "date", message: "The date is missing" });
      const team = values.team === "Integration" ? "integration" : values.team === "Church office" ? "church_office" : job.settings.defaultTeam;
      values.team = team === "integration" ? "Integration" : "Church office";
      if (!values.method) values.method = "Phone Call";
      const staff = values.caller ? db.staff.find((s) => sameName(s.fullName, values.caller!)) : null;
      row.authorId = staff?.id ?? null;
      if (values.caller && !staff) warnings.push(`“${values.caller}” isn't a TKP Hub user: saved by name only`);
      if (row.target && values.date && !errors.some((e) => e.field === "date")) {
        const k = `${row.target.connectId}|${values.date.slice(0, 16)}|${team}`;
        const dup = seen.get(k);
        if (dup) errors.push({ field: null, message: `Same guest, time and team as row ${dup}` });
        else seen.set(k, rowNo);
        const ex = ctx.logs.get(k) ?? null;
        row.existing = ex;
        if (ex) row.changes = logChanges(ex, values);
      }
    }
    row.status = row.errors.length ? "error" : row.existing ? (row.changes.length ? "update" : "unchanged") : "new";
    out.push(row);
  }
  return out.map((r) => ({
    rowNo: r.rowNo,
    status: r.status,
    values: r.values,
    cells: r.cells,
    errors: r.errors,
    warnings: r.warnings,
    match: r.match,
    changes: r.changes,
    fixed: r.fixed,
  }));
}

const ENTRY_FIELDS = ["serviceType", "firstName", "lastName", "phone", "email", "gender", "maritalStatus", "ageBracket", "address", "city", "state", "zip", "country", "howHeard", "whoInvitedYou", "willComeAgain", "likeToBecomeMember", "prayerRequest", "comments"] as const;
const ratingKey = (k: string) => k.slice("rating.".length);

function entryChanges(e: WelcomeEntry, v: Record<string, string | null>) {
  const out: ImportPreviewRow["changes"] = [];
  for (const f of ENTRY_FIELDS) {
    if (v[f] === null || v[f] === undefined) continue; // a blank cell never wipes a value
    const now = e[f] ?? null;
    const same = f === "phone" ? normalPhone(now) === normalPhone(v[f]) : f === "email" ? normalEmail(now) === normalEmail(v[f]) : (now ?? "") === v[f];
    if (!same) out.push({ field: f, from: now, to: v[f] });
  }
  for (const [k, val] of Object.entries(v)) {
    if (!k.startsWith("rating.") || val === null) continue;
    const now = e.ratings[ratingKey(k)];
    if (String(now ?? "") !== val) out.push({ field: k, from: now === null || now === undefined ? null : String(now), to: val });
  }
  return out;
}

function logChanges(l: LogRow, v: Record<string, string | null>) {
  const out: ImportPreviewRow["changes"] = [];
  for (const f of ["method", "callOutcome", "wantsMembership", "lifeGroup", "note"] as const) {
    if (v[f] === null || v[f] === undefined) continue;
    if ((l[f] ?? "") !== v[f]) out.push({ field: f, from: l[f] ?? null, to: v[f] });
  }
  return out;
}

const countOf = (rows: ImportPreviewRow[]): ImportCounts => ({
  total: rows.length,
  new: rows.filter((r) => r.status === "new").length,
  update: rows.filter((r) => r.status === "update").length,
  unchanged: rows.filter((r) => r.status === "unchanged").length,
  error: rows.filter((r) => r.status === "error").length,
  warnings: rows.filter((r) => r.warnings.length).length,
});

/* ----------------------------------------------------------------- shapes */

function summary(j: ImportRecord): ImportSummary {
  return {
    id: j.id,
    kind: j.kind,
    fileName: j.fileName,
    fileSize: j.fileSize,
    status: j.status,
    createdAt: j.createdAt,
    createdBy: nameOf(j.createdById),
    counts: j.counts,
    result: j.result,
    committedAt: j.committedAt,
    committedBy: nameOf(j.committedById),
    undoneAt: j.undoneAt,
    undoneBy: nameOf(j.undoneById),
    undoUntil: j.undoUntil,
    expiresAt: j.expiresAt,
  };
}

function toJob(j: ImportRecord, u: StaffRecord): ImportJob {
  const rows = j.status === "draft" ? buildPreview(j) : (j.frozen ?? []);
  if (j.status === "draft") j.counts = countOf(rows);
  const { headers, body } = j.status === "draft" ? rowsOf(j) : { headers: [] as string[], body: [] };
  const columns: ImportColumn[] = headers.map((h, i) => ({
    index: i,
    header: h || `Column ${i + 1}`,
    samples: body
      .map((r) => cellText(r.cells[i] ?? null))
      .filter(Boolean)
      .slice(0, 3),
    field: j.mapping[i] ?? null,
    confidence: j.confidence[i] ?? 0,
  }));
  return { ...summary(j), sheets: j.sheets, sheet: j.sheet, columns, fileHeaders: j.status === "draft" ? headers : (j.frozenHeaders ?? []), settings: j.settings, rows, services: db.services.map((s) => s.name), mine: j.createdById === u.id };
}

/** Staged drafts are private to their owner and expire (PRD: "staged data is private and expires"). */
function visible(u: StaffRecord, id: string) {
  const now = new Date().toISOString();
  for (const j of db.imports) if (j.status === "draft" && j.expiresAt < now) Object.assign(j, { status: "discarded", raw: null });
  const j = db.imports.find((x) => x.id === id);
  if (!j || j.status === "discarded" || (j.status === "draft" && j.createdById !== u.id) || !kindAllowed(u, j.kind)) return null;
  return j;
}

/* ----------------------------------------------------------------- endpoints */

export function listImports(u: StaffRecord): Result<ImportListResponse> {
  if (!allowed(u)) return no(403, "FORBIDDEN", "You don't have access to imports.");
  visible(u, "");
  const items = db.imports
    .filter((j) => kindAllowed(u, j.kind) && (j.status === "committed" || j.status === "undone" || (j.status === "draft" && j.createdById === u.id)))
    .map(summary)
    .sort((a, b) => (b.committedAt ?? b.createdAt).localeCompare(a.committedAt ?? a.createdAt));
  return ok({ items, can: { import: true, followups: kindAllowed(u, "followups") } });
}

/** Upload and analyse. The handler has read the file into sheets already (import-parse.ts). */
export function analyseImport(u: StaffRecord, b: { kind?: string; fileName?: string; fileSize?: number; sheets?: RawSheet[] | null; parseError?: string }): Result<ImportJob> {
  if (!allowed(u)) return no(403, "FORBIDDEN", "You don't have access to imports.");
  const kind = b.kind === "followups" ? "followups" : b.kind === "guests" ? "guests" : null;
  if (!kind) return no(422, "VALIDATION_FAILED", "Choose what you're importing.", { kind: ["Choose guest entries or follow-up records"] });
  if (!kindAllowed(u, kind)) return no(403, "FORBIDDEN", "Only Tech Admin, Church Admin and Integration Admin import follow-up tracker records.");
  const name = b.fileName ?? "";
  const ext = extensionOf(name);
  if (ext === "xlsm" || ext === "xls" || ext === "xlsb") return no(415, "UNSUPPORTED_FILE", "Only .xlsx and .csv files. Files with macros (.xlsm) and old .xls files are refused: save it as .xlsx first.");
  if (ext !== "xlsx" && ext !== "csv") return no(415, "UNSUPPORTED_FILE", "Only .xlsx and .csv files can be imported.");
  if ((b.fileSize ?? 0) > IMPORT_LIMITS.maxBytes) return no(413, "FILE_TOO_LARGE", "The file is over 10 MB. Split it into smaller files.");
  if (b.parseError || !b.sheets) return no(422, "UNREADABLE_FILE", "We couldn't read this file. Open it in Excel, save it as .xlsx or .csv, and try again.");
  const sheets = b.sheets.filter((s) => s.data.length);
  if (!sheets.length) return no(422, "EMPTY_FILE", "The file has no rows.");
  const big = sheets.find((s) => s.data.length - 1 > IMPORT_LIMITS.maxRows);
  if (big) return no(422, "TOO_MANY_ROWS", `“${big.name}” has more than ${IMPORT_LIMITS.maxRows.toLocaleString()} rows. Split it into smaller files.`);

  const sheet = sheets[0]!;
  const headerRow = findHeaderRow(sheet.data);
  const suggestion = suggestMapping((sheet.data[headerRow - 1] ?? []).map(cellText), IMPORT_FIELDS[kind]);
  const now = new Date();
  const job: ImportRecord = {
    id: crypto.randomUUID(),
    kind,
    fileName: name,
    fileSize: b.fileSize ?? 0,
    createdAt: now.toISOString(),
    createdById: u.id,
    status: "draft",
    expiresAt: new Date(now.getTime() + IMPORT_LIMITS.stagedHours * 3_600_000).toISOString(),
    raw: sheets,
    sheets: sheets.map((s) => ({ name: s.name, rows: Math.max(0, s.data.length - 1) })),
    sheet: sheet.name,
    mapping: Object.fromEntries(suggestion.map((s, i) => [i, s.field])),
    confidence: Object.fromEntries(suggestion.map((s, i) => [i, s.confidence])),
    settings: { headerRow, dateOrder: "MDY", unmapped: "notes", mode: "add", defaultService: null, followUp: "history", defaultTeam: "church_office" },
    fixes: {},
    frozen: null,
    frozenHeaders: null,
    counts: { total: 0, new: 0, update: 0, unchanged: 0, error: 0, warnings: 0 },
    result: null,
    idempotencyKey: null,
    committedAt: null,
    committedById: null,
    undoneAt: null,
    undoneById: null,
    undoUntil: null,
    undo: null,
  };
  db.imports.push(job);
  audit(u.id, "welcome.import.upload", job.id, { after: { name, kind, rows: job.sheets.reduce((n, s) => n + s.rows, 0) } });
  return ok(toJob(job, u), 201);
}

export function getImport(u: StaffRecord, id: string): Result<ImportJob> {
  if (!allowed(u)) return no(403, "FORBIDDEN", "You don't have access to imports.");
  const j = visible(u, id);
  if (!j) return no(404, "NOT_FOUND", "This import doesn't exist, or it expired.");
  return ok(toJob(j, u));
}

/** Change the sheet, the columns, the settings, or fix cells in place. */
export function patchImport(u: StaffRecord, id: string, b: ImportPatch): Result<ImportJob> {
  if (!allowed(u)) return no(403, "FORBIDDEN", "You don't have access to imports.");
  const j = visible(u, id);
  if (!j) return no(404, "NOT_FOUND", "This import doesn't exist, or it expired.");
  if (j.status !== "draft") return no(409, "NOT_DRAFT", "This import has been imported already.");
  if (b.sheet !== undefined && b.sheet !== j.sheet) {
    const s = j.raw?.find((x) => x.name === b.sheet);
    if (!s) return no(422, "VALIDATION_FAILED", "No such sheet.", { sheet: ["No such sheet"] });
    j.sheet = s.name;
    j.settings.headerRow = findHeaderRow(s.data);
    const sug = suggestMapping((s.data[j.settings.headerRow - 1] ?? []).map(cellText), IMPORT_FIELDS[j.kind]);
    j.mapping = Object.fromEntries(sug.map((x, i) => [i, x.field]));
    j.confidence = Object.fromEntries(sug.map((x, i) => [i, x.confidence]));
    j.fixes = {};
  }
  if (b.settings) {
    const s = b.settings;
    const rows = j.raw?.find((x) => x.name === j.sheet)?.data.length ?? 0;
    if (s.headerRow !== undefined && (!Number.isInteger(s.headerRow) || s.headerRow < 1 || s.headerRow > Math.min(rows, 20)))
      return no(422, "VALIDATION_FAILED", "The header row must be one of the first 20 rows.", { headerRow: ["One of the first 20 rows"] });
    if (s.defaultService && !db.services.some((x) => x.name === s.defaultService)) return no(422, "VALIDATION_FAILED", "No such service.", { defaultService: ["No such service"] });
    const headerChanged = s.headerRow !== undefined && s.headerRow !== j.settings.headerRow;
    Object.assign(j.settings, Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)));
    if (headerChanged) {
      const sheet = j.raw!.find((x) => x.name === j.sheet)!;
      const sug = suggestMapping((sheet.data[j.settings.headerRow - 1] ?? []).map(cellText), IMPORT_FIELDS[j.kind]);
      j.mapping = Object.fromEntries(sug.map((x, i) => [i, x.field]));
      j.confidence = Object.fromEntries(sug.map((x, i) => [i, x.confidence]));
    }
  }
  if (b.mapping) {
    const keys = new Set(IMPORT_FIELDS[j.kind].map((f) => f.key));
    for (const [col, field] of Object.entries(b.mapping)) {
      if (field !== null && !keys.has(field)) return no(422, "VALIDATION_FAILED", "Unknown field.", { mapping: [`Unknown field ${field}`] });
      // One column per field: choosing a field takes it off any other column.
      if (field) for (const [c, f] of Object.entries(j.mapping)) if (f === field && c !== col) j.mapping[+c] = null;
      j.mapping[+col] = field;
      j.confidence[+col] = 1;
    }
  }
  for (const f of b.fixes ?? []) {
    j.fixes[f.rowNo] = { ...(j.fixes[f.rowNo] ?? {}), [f.field]: f.value };
  }
  return ok(toJob(j, u));
}

export function discardImport(u: StaffRecord, id: string): Result<{ discarded: true }> {
  if (!allowed(u)) return no(403, "FORBIDDEN", "You don't have access to imports.");
  const j = visible(u, id);
  if (!j) return no(404, "NOT_FOUND", "This import doesn't exist, or it expired.");
  if (j.status !== "draft") return no(409, "NOT_DRAFT", "This import has been imported already. Undo it instead.");
  j.status = "discarded";
  j.raw = null;
  audit(u.id, "welcome.import.discard", j.id, { before: { name: j.fileName, kind: j.kind } });
  return ok({ discarded: true });
}

/* ----------------------------------------------------------------- commit */

const emptyChecklist = () => Object.fromEntries(STEP_KEYS.map((k) => [k, null])) as Record<StepKey, ChecklistEntry>;

function newRecord(entry: WelcomeEntry, startFollowUp: boolean): ConnectRecord {
  return {
    connectId: Math.max(...db.connect.map((r) => r.connectId), ...db.mergedRecords.map((r) => r.connectId)) + 1,
    guestId: Math.max(...db.connect.map((r) => r.guestId)) + 1,
    entry: { ...entry },
    status: startFollowUp ? "Active" : "Closed",
    closedReason: startFollowUp ? null : "Imported history",
    phase: 1,
    clockStartAt: startFollowUp ? new Date().toISOString() : entry.submittedAt,
    coMemberId: null,
    itMemberId: null,
    coAttempts: 0,
    coLastCallOutcome: null,
    itContacted: false,
    state: {
      coWantsMembership: null,
      coNoReason: null,
      coNoOtherDetails: null,
      coNextAction: null,
      itMembership: null,
      itWorkforce: null,
      itDepartmentId: null,
      itLifeGroup: null,
      multi: Object.fromEntries(MULTI_KEYS.map((k) => [k, false])) as Record<MultiKey, boolean>,
      returned2ndVisit: false,
      returnVisitDate: null,
    },
    checklist: emptyChecklist(),
    legacyNotes: [],
    rowVer: 1,
  };
}

function entryFrom(v: Record<string, string | null>, id: number, connectId: number): WelcomeEntry {
  const ratings: Record<string, number | null> = { Music: null, Preaching: null, Comfort: null, Hospitality: null, ChurchEnvironment: null, ThePeople: null, Parking: null, Traffic: null };
  for (const [k, val] of Object.entries(v)) if (k.startsWith("rating.") && val !== null) ratings[ratingKey(k)] = Number(val);
  const zip = v.zip ?? null;
  return {
    id,
    entriesThatDay: 1,
    submittedAt: fromChurchLocal(`${v.serviceDate}T12:00`),
    serviceDate: v.serviceDate!,
    serviceType: v.serviceType!,
    firstName: v.firstName ?? null,
    middleName: null,
    lastName: v.lastName ?? null,
    gender: v.gender ?? null,
    maritalStatus: v.maritalStatus ?? null,
    dob: null,
    ageBracket: v.ageBracket ?? null,
    nationality: null,
    address: v.address ?? null,
    apt: null,
    city: v.city ?? null,
    state: v.state ?? null,
    zip,
    country: v.country ?? null,
    phone: v.phone ?? null,
    email: v.email ?? null,
    bestTimeToVisit: null,
    howHeard: v.howHeard ?? null,
    howHeardOther: null,
    whoInvitedYou: v.whoInvitedYou ?? null,
    invitingCellGroup: null,
    willComeAgain: v.willComeAgain ?? null,
    giveThoughtToMembership: null,
    likeToBecomeMember: v.likeToBecomeMember ?? null,
    likelyNeverComeAgain: null,
    ifYesWhy: null,
    prayerRequest: v.prayerRequest ?? null,
    comments: v.comments ?? null,
    ratings,
    cellGroup: (zip && db.cellMap.zips[zip]) || "N/A",
    visitNumber: 1,
    connectId,
    legacyNotes: [],
  };
}

/** Visit numbers by date for one person; a second date means they came back. */
function recount(connectId: number) {
  const visits = db.entries.filter((e) => e.connectId === connectId).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
  const dates = [...new Set(visits.map((e) => e.serviceDate))];
  for (const e of visits) e.visitNumber = dates.indexOf(e.serviceDate) + 1;
  const r = db.connect.find((x) => x.connectId === connectId);
  if (r && dates.length > 1 && !r.state.returned2ndVisit) {
    r.state.returned2ndVisit = true;
    r.state.returnVisitDate = dates[1]!;
  }
}

export function commitImport(u: StaffRecord, id: string, b: { mode?: "add" | "update"; idempotencyKey?: string }): Result<ImportSummary> {
  if (!allowed(u)) return no(403, "FORBIDDEN", "You don't have access to imports.");
  const j = visible(u, id);
  if (!j) return no(404, "NOT_FOUND", "This import doesn't exist, or it expired.");
  // Idempotent: the same request twice returns the first result.
  if (j.status === "committed" && b.idempotencyKey && b.idempotencyKey === j.idempotencyKey) return ok(summary(j));
  if (j.status !== "draft") return no(409, "NOT_DRAFT", "This import has been imported already.");
  if (b.mode) j.settings.mode = b.mode;

  const rows = buildPreview(j);
  const ctxById = new Map(db.connect.map((r) => [r.connectId, r]));
  const undo: UndoInfo = { createdRecords: [], createdEntries: [], createdLogs: [], updatedEntries: [], touched: [], visitNumbers: {} };
  const result: ImportResult = { added: 0, updated: 0, unchanged: 0, failed: 0, newGuests: 0 };
  const newPeople = new Map<string, ConnectRecord>();
  const startCutoff = new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10);
  let entryId = Math.max(...db.entries.map((e) => e.id));
  let logId = Math.max(...db.connectLogs.map((l) => l.logId), 0);
  const touchedPeople = new Set<number>();
  const remember = (connectId: number) => {
    if (touchedPeople.has(connectId)) return;
    touchedPeople.add(connectId);
    for (const e of db.entries) if (e.connectId === connectId) undo.visitNumbers[e.id] = e.visitNumber;
    const r = ctxById.get(connectId);
    if (r) undo.touched.push({ connectId, before: { state: structuredClone(r.state) }, rowVer: r.rowVer });
  };

  for (const row of rows) {
    if (row.status === "error") {
      result.failed++;
      continue;
    }
    if (row.status === "unchanged" || (row.status === "update" && j.settings.mode === "add")) {
      result.unchanged++;
      continue;
    }
    const v = row.values;
    if (j.kind === "guests") {
      const phoneKey = normalPhone(v.phone);
      const emailKey = normalEmail(v.email);
      const match = row.match?.match(/^Existing guest #(\d+)/);
      if (row.status === "update" && match) {
        const e = db.entries.find((x) => x.connectId === +match[1]! && x.serviceDate === v.serviceDate)!;
        const before = structuredClone(e);
        for (const c of row.changes) {
          if (c.field.startsWith("rating.")) e.ratings[ratingKey(c.field)] = c.to === null ? null : Number(c.to);
          else (e as unknown as Record<string, string | null>)[c.field] = c.to;
        }
        undo.updatedEntries.push({ id: e.id, before, after: structuredClone(e) });
        result.updated++;
        continue;
      }
      // New visit: to an existing guest, to a guest new in this file, or a new guest.
      let rec: ConnectRecord | undefined = match ? ctxById.get(+match[1]!) : undefined;
      const fileKey = (phoneKey && `phone:${phoneKey}`) || (emailKey && `email:${emailKey}`) || `row:${row.rowNo}`;
      if (!rec) rec = newPeople.get(fileKey);
      const entry = entryFrom(v, ++entryId, rec?.connectId ?? 0);
      if (!rec) {
        rec = newRecord(entry, j.settings.followUp === "start" && entry.serviceDate >= startCutoff);
        entry.connectId = rec.connectId;
        rec.entry = { ...entry };
        db.connect.push(rec);
        ctxById.set(rec.connectId, rec);
        newPeople.set(fileKey, rec);
        if (phoneKey && emailKey) newPeople.set(`email:${emailKey}`, rec);
        undo.createdRecords.push({ connectId: rec.connectId, rowVer: rec.rowVer });
        touchedPeople.add(rec.connectId);
        result.newGuests++;
      } else remember(rec.connectId);
      db.entries.push(entry);
      undo.createdEntries.push(entry.id);
      recount(rec.connectId);
      result.added++;
    } else {
      const m = row.match?.match(/^Guest #(\d+)/);
      const rec = m ? ctxById.get(+m[1]!) : undefined;
      if (!rec) {
        result.failed++;
        continue;
      }
      const team = v.team === "Integration" ? "integration" : "church_office";
      if (row.status === "update") {
        const l = db.connectLogs.find((x) => x.connectId === rec.connectId && x.savedAt.slice(0, 16) === v.date!.slice(0, 16) && x.team === team)!;
        for (const c of row.changes) (l as unknown as Record<string, string | null>)[c.field] = c.to;
        result.updated++;
        continue;
      }
      const staff = v.caller ? db.staff.find((s) => sameName(s.fullName, v.caller!)) : null;
      const log: LogRow = {
        logId: ++logId,
        connectId: rec.connectId,
        team,
        authorId: staff?.id ?? "",
        author: staff?.fullName ?? v.caller ?? "Imported",
        savedAt: v.date!,
        guest: nameOfRecord(rec),
        serviceDate: rec.entry.serviceDate,
        method: (v.method as LogRow["method"]) ?? "Phone Call",
        callOutcome: v.callOutcome ?? null,
        sopStep: null,
        wantsMembership: v.wantsMembership ?? null,
        noReason: null,
        nextAction: null,
        phase: null,
        membership: null,
        workforce: null,
        department: null,
        lifeGroup: v.lifeGroup ?? null,
        spiritual: [],
        other: ["Imported from the follow-up tracker"],
        note: v.note ?? null,
        returned2ndVisit: null,
        returnVisitDate: null,
        stepsTicked: [],
        stepsUnticked: [],
      };
      db.connectLogs.unshift(log);
      undo.createdLogs.push(log.logId);
      result.added++;
    }
  }
  for (const r of undo.createdRecords) r.rowVer = ctxById.get(r.connectId)!.rowVer;
  for (const t of undo.touched) t.rowVer = ctxById.get(t.connectId)!.rowVer;
  db.connectLogs.sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  const now = new Date();
  Object.assign(j, {
    status: "committed",
    frozen: rows,
    frozenHeaders: rowsOf(j).headers,
    counts: countOf(rows),
    result,
    idempotencyKey: b.idempotencyKey ?? null,
    committedAt: now.toISOString(),
    committedById: u.id,
    undoUntil: new Date(now.getTime() + IMPORT_LIMITS.undoDays * DAY).toISOString(),
    undo,
    raw: null, // the staged copy is no longer needed; the backend keeps the file for 30 days in private storage
  } satisfies Partial<ImportRecord>);
  audit(u.id, "welcome.import.commit", j.id, { after: { name: j.fileName, kind: j.kind, added: result.added, updated: result.updated, failed: result.failed, newGuests: result.newGuests } });
  return ok(summary(j));
}

/* ----------------------------------------------------------------- undo */

/** What changed since the import, so undo can warn first (EV-28: "undo it only with a warning and a list"). */
function changedSince(j: ImportRecord): string[] {
  const u = j.undo!;
  const out: string[] = [];
  for (const c of u.createdRecords) {
    const r = db.connect.find((x) => x.connectId === c.connectId);
    if (!r) out.push(`Guest #${c.connectId} was merged into another record`);
    else {
      const foreign = db.connectLogs.filter((l) => l.connectId === c.connectId && !u.createdLogs.includes(l.logId));
      if (r.rowVer !== c.rowVer || foreign.length) out.push(`${nameOfRecord(r)} (#${r.connectId}) has follow-up saved since the import`);
    }
  }
  for (const e of u.updatedEntries) {
    const now = db.entries.find((x) => x.id === e.id);
    if (now && JSON.stringify(now) !== JSON.stringify(e.after)) out.push(`The ${e.after.serviceDate} visit of ${e.after.firstName ?? ""} ${e.after.lastName ?? ""} was changed again since`);
  }
  return out;
}

export function undoImport(u: StaffRecord, id: string, b: { force?: boolean }): Result<ImportSummary> {
  if (!allowed(u)) return no(403, "FORBIDDEN", "You don't have access to imports.");
  const j = visible(u, id);
  if (!j) return no(404, "NOT_FOUND", "This import doesn't exist.");
  if (j.status === "undone") return no(409, "ALREADY_UNDONE", "This import has been undone already.");
  if (j.status !== "committed" || !j.undo) return no(409, "NOT_COMMITTED", "Only an import that went through can be undone.");
  if (j.undoUntil && j.undoUntil < new Date().toISOString()) return no(409, "UNDO_EXPIRED", "Imports can be undone for 30 days. This one is older.");
  const changed = changedSince(j);
  if (changed.length && !b.force) return no(409, "CHANGED_SINCE", "Some of what this import added has been worked on since. Undo anyway?", { changed });

  const x = j.undo;
  const createdIds = new Set(x.createdRecords.map((r) => r.connectId));
  const logs = new Set(x.createdLogs);
  db.connectLogs = db.connectLogs.filter((l) => !logs.has(l.logId) && !createdIds.has(l.connectId));
  const entries = new Set(x.createdEntries);
  db.entries = db.entries.filter((e) => !entries.has(e.id));
  db.connect = db.connect.filter((r) => !createdIds.has(r.connectId));
  for (const e of x.updatedEntries) {
    const i = db.entries.findIndex((y) => y.id === e.id);
    if (i >= 0) db.entries[i] = structuredClone(e.before);
  }
  for (const e of db.entries) if (x.visitNumbers[e.id] !== undefined) e.visitNumber = x.visitNumbers[e.id]!;
  for (const t of x.touched) {
    const r = db.connect.find((y) => y.connectId === t.connectId);
    if (r && r.rowVer === t.rowVer) r.state = structuredClone(t.before.state);
  }
  Object.assign(j, { status: "undone", undoneAt: new Date().toISOString(), undoneById: u.id });
  audit(u.id, "welcome.import.undo", j.id, { before: { name: j.fileName, kind: j.kind, added: j.result?.added ?? 0, updated: j.result?.updated ?? 0 }, after: { changedSince: changed.length } });
  return ok(summary(j));
}
