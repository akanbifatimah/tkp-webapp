import {
  MERGE_FIELDS,
  type DismissedPair,
  type DuplicateGroup,
  type DuplicatePerson,
  type DuplicatesResponse,
  type MatchReason,
  type MergeField,
  type MergeInput,
  type MergeResult,
} from "@/features/welcome/duplicate-types";
import { can, type Permission } from "@/lib/permissions";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import type { ConnectRecord } from "./seed/guests";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock duplicate review and merge (PRD W-14, A-1, WT-4; docs/API.md §10).
 * Two records are the same person only when they share a phone or an email,
 * once normalised. A name never links two records, on its own or with anything.
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
const nameOf = (id: string | null) => (id ? (db.staff.find((s) => s.id === id)?.fullName ?? null) : null);

/* ----------------------------------------------------------------- matching */

/** "+1 832-555-0167", "(832) 555-0167" and "832.555.0167" are one number: E.164. */
export function normalPhone(p: string | null | undefined): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d.length >= 8 ? `+${d}` : null;
}
export const normalEmail = (e: string | null | undefined) => {
  const v = (e ?? "").trim().toLowerCase();
  return v.includes("@") ? v : null;
};
const showPhone = (n: string) => (n.startsWith("+1") && n.length === 12 ? `(${n.slice(2, 5)}) ${n.slice(5, 8)}-${n.slice(8)}` : n);
const nameKey = (r: ConnectRecord) => `${r.entry.firstName ?? ""} ${r.entry.lastName ?? ""}`.toLowerCase().replace(/[^a-z]/g, "");
export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Every phone and email the person gave, on any of their forms. */
function contactsOf(r: ConnectRecord): string[] {
  const keys = new Set<string>();
  for (const e of [r.entry, ...db.entries.filter((x) => x.connectId === r.connectId)]) {
    const p = normalPhone(e.phone);
    const m = normalEmail(e.email);
    if (p) keys.add(`phone:${p}`);
    if (m) keys.add(`email:${m}`);
  }
  return [...keys];
}

/** Groups of records that share a phone or email, leaving out pairs marked "not the same person". */
export function findGroups(): ConnectRecord[][] {
  const dismissed = new Set(db.duplicateDismissals.map((d) => d.key));
  const byKey = new Map<string, ConnectRecord[]>();
  for (const r of db.connect) for (const k of contactsOf(r)) byKey.set(k, [...(byKey.get(k) ?? []), r]);
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const list of byKey.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!.connectId;
        const b = list[j]!.connectId;
        if (!dismissed.has(pairKey(a, b))) parent.set(find(a), find(b));
      }
  }
  const groups = new Map<number, ConnectRecord[]>();
  for (const r of db.connect) {
    const root = find(r.connectId);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function reasonsFor(list: ConnectRecord[]): MatchReason[] {
  const count = new Map<string, number>();
  for (const r of list) for (const k of contactsOf(r)) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.entries()]
    .filter(([, n]) => n > 1)
    .map(([k]) => {
      const [kind, value] = k.split(/:(.*)/s) as ["phone" | "email", string];
      return { kind, value: kind === "phone" ? showPhone(value) : value };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) * -1);
}

/* ----------------------------------------------------------------- shapes */

export function toPerson(r: ConnectRecord): DuplicatePerson {
  const visits = db.entries.filter((e) => e.connectId === r.connectId);
  const dates = [...new Set(visits.map((e) => e.serviceDate))].sort();
  return {
    connectId: r.connectId,
    name: `${r.entry.firstName ?? ""} ${r.entry.lastName ?? ""}`.trim(),
    fields: Object.fromEntries(MERGE_FIELDS.map((f) => [f, r.entry[f] ?? null])) as Record<MergeField, string | null>,
    firstVisit: dates[0] ?? r.entry.serviceDate,
    lastVisit: dates.at(-1) ?? r.entry.serviceDate,
    visits: dates.length,
    serviceTypes: [...new Set(visits.map((e) => e.serviceType))],
    journey: {
      status: r.status,
      closedReason: r.closedReason,
      phase: r.phase,
      churchOffice: nameOf(r.coMemberId),
      integration: nameOf(r.itMemberId),
      steps: Object.values(r.checklist).filter(Boolean).length,
    },
    logs: db.connectLogs.filter((l) => l.connectId === r.connectId).length,
    rowVer: r.rowVer,
  };
}

/** The journey furthest along: completed, then active, then closed; then phase, steps and notes. */
export function journeyScore(p: DuplicatePerson) {
  const s = p.journey.status === "Completed" ? 3000 : p.journey.status === "Active" ? 2000 : 0;
  return s + p.journey.phase * 100 + p.journey.steps * 5 + p.logs;
}

function toGroup(list: ConnectRecord[]): DuplicateGroup {
  const people = list.map(toPerson).sort((a, b) => a.firstVisit.localeCompare(b.firstVisit) || a.connectId - b.connectId);
  const best = [...people].sort((a, b) => journeyScore(b) - journeyScore(a) || a.connectId - b.connectId)[0]!;
  return {
    id: people.map((p) => p.connectId).sort((a, b) => a - b).join("-"),
    reasons: reasonsFor(list),
    namesDiffer: new Set(list.map(nameKey)).size > 1,
    people,
    suggestedJourney: best.connectId,
    newest: people.map((p) => p.firstVisit).sort().at(-1)!,
  };
}

/* ----------------------------------------------------------------- endpoints */

export function listDuplicates(u: StaffRecord): Result<DuplicatesResponse> {
  if (!allowed(u, "welcome.duplicates.view")) return no(403, "FORBIDDEN", "You don't have access to duplicates.");
  audit(u.id, "welcome.duplicates.view", null);
  const groups = findGroups()
    .map(toGroup)
    .sort((a, b) => b.newest.localeCompare(a.newest) || a.id.localeCompare(b.id));
  const byId = new Map(db.connect.map((r) => [r.connectId, r]));
  const dismissed: DismissedPair[] = db.duplicateDismissals
    .filter((d) => byId.has(d.ids[0]) && byId.has(d.ids[1]))
    .map((d) => {
      const pair = d.ids.map((id) => byId.get(id)!);
      return {
        key: d.key,
        ids: d.ids,
        names: pair.map((r) => `${r.entry.firstName ?? ""} ${r.entry.lastName ?? ""}`.trim()) as [string, string],
        reasons: reasonsFor(pair),
        by: nameOf(d.byId),
        at: d.at,
        note: d.note,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
  return ok({ groups, dismissed, can: { merge: allowed(u, "welcome.duplicates.merge") } });
}

export function mergeDuplicates(u: StaffRecord, b: Partial<MergeInput>): Result<MergeResult> {
  if (!allowed(u, "welcome.duplicates.merge")) return no(403, "FORBIDDEN", "Only Tech Admin, Church Admin and Integration Admin can merge records.");
  const keepId = Number(b.keepId);
  const mergeIds = [...new Set((b.mergeIds ?? []).map(Number))].filter((id) => id !== keepId);
  if (!keepId || !mergeIds.length) return no(422, "VALIDATION_FAILED", "Choose the record to keep and at least one to merge into it.", { mergeIds: ["Choose at least one record to merge"] });
  const ids = [keepId, ...mergeIds];
  const recs = ids.map((id) => db.connect.find((r) => r.connectId === id));
  if (recs.some((r) => !r)) return no(404, "NOT_FOUND", "One of these records no longer exists. It may have been merged already.");
  const list = recs as ConnectRecord[];
  for (const r of list) {
    if (b.rowVers?.[String(r.connectId)] !== r.rowVer) return no(409, "CONFLICT", "Someone changed one of these records while you were reviewing. Look again before merging.");
  }
  // A-1: only records the phone or email links, never a choice made on names.
  const group = findGroups().find((g) => g.some((r) => r.connectId === keepId));
  if (!group || !ids.every((id) => group.some((r) => r.connectId === id)))
    return no(409, "NOT_DUPLICATE", "These records no longer share a phone or email, so they can't be merged.");
  const journeyFrom = Number(b.journeyFrom ?? keepId);
  if (!ids.includes(journeyFrom)) return no(422, "VALIDATION_FAILED", "Choose one of these records' follow-up journeys.", { journeyFrom: ["Not one of these records"] });
  const fields = b.fields ?? {};
  for (const [f, src] of Object.entries(fields)) {
    if (!MERGE_FIELDS.includes(f as MergeField) || !ids.includes(Number(src)))
      return no(422, "VALIDATION_FAILED", "A chosen value isn't from one of these records.", { [f]: ["Not one of these records"] });
  }

  const keep = list[0]!;
  const others = list.slice(1);
  const before = list.map(toPerson);

  // The journey: copy the chosen one onto the record kept.
  const j = list.find((r) => r.connectId === journeyFrom)!;
  if (j !== keep) {
    Object.assign(keep, {
      status: j.status,
      closedReason: j.closedReason,
      phase: j.phase,
      clockStartAt: j.clockStartAt,
      coMemberId: j.coMemberId,
      itMemberId: j.itMemberId,
      coAttempts: j.coAttempts,
      coLastCallOutcome: j.coLastCallOutcome,
      itContacted: j.itContacted,
      state: structuredClone(j.state),
      checklist: structuredClone(j.checklist),
    });
  }
  // The values chosen where the records differ. Address and city carry their apartment and state.
  const chosen: Record<string, string | null> = {};
  for (const [f, src] of Object.entries(fields) as [MergeField, number][]) {
    const from = list.find((r) => r.connectId === Number(src))!;
    keep.entry[f] = from.entry[f];
    if (f === "address") keep.entry.apt = from.entry.apt;
    if (f === "city") keep.entry.state = from.entry.state;
    chosen[f] = from.entry[f] ?? null;
  }
  keep.legacyNotes = list.flatMap((r) => r.legacyNotes);

  // Every visit and note moves to the record kept; visit numbers are counted again.
  const merged = new Set(mergeIds);
  for (const e of db.entries) if (merged.has(e.connectId)) e.connectId = keep.connectId;
  const name = `${keep.entry.firstName ?? ""} ${keep.entry.lastName ?? ""}`.trim();
  for (const l of db.connectLogs) if (merged.has(l.connectId) || l.connectId === keep.connectId) Object.assign(l, { connectId: keep.connectId, guest: name });
  const visits = db.entries.filter((e) => e.connectId === keep.connectId).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.submittedAt.localeCompare(b.submittedAt));
  const dates = [...new Set(visits.map((e) => e.serviceDate))];
  for (const e of visits) e.visitNumber = dates.indexOf(e.serviceDate) + 1;
  // The earliest visit is the first one; a later date means they came back.
  const first = visits[0]!;
  keep.entry.serviceDate = first.serviceDate;
  keep.entry.serviceType = first.serviceType;
  if (dates.length > 1 && !keep.state.returned2ndVisit) {
    keep.state.returned2ndVisit = true;
    keep.state.returnVisitDate = dates[1]!;
  }
  keep.rowVer++;

  // The others leave every list; they are kept, marked, for the audit trail.
  const at = new Date().toISOString();
  for (const r of others) {
    db.connect.splice(db.connect.indexOf(r), 1);
    db.mergedRecords.push({ ...r, status: "Closed", closedReason: "Merged", mergedInto: keep.connectId, mergedAt: at, mergedById: u.id });
  }
  db.duplicateDismissals = db.duplicateDismissals.filter((d) => !d.ids.some((id) => merged.has(id)));

  audit(u.id, "welcome.duplicates.merge", String(keep.connectId), {
    before: { name: before[0]!.name, records: before.map((p) => ({ connectId: p.connectId, name: p.name, ...p.fields, visits: p.visits, journey: p.journey.status, phase: p.journey.phase })) },
    after: { name, kept: keep.connectId, merged: mergeIds, journeyFrom, ...chosen, visits: dates.length },
  });
  return ok({ kept: toPerson(keep), merged: mergeIds });
}

export function dismissDuplicates(u: StaffRecord, b: { ids?: number[]; note?: string | null }): Result<{ dismissed: string[] }> {
  if (!allowed(u, "welcome.duplicates.merge")) return no(403, "FORBIDDEN", "Only Tech Admin, Church Admin and Integration Admin can decide on duplicates.");
  const ids = [...new Set((b.ids ?? []).map(Number))];
  if (ids.length < 2 || ids.some((id) => !db.connect.some((r) => r.connectId === id)))
    return no(422, "VALIDATION_FAILED", "Choose two or more records that still exist.", { ids: ["Choose two or more records"] });
  const note = b.note?.trim() || null;
  if (note && note.length > 300) return no(422, "VALIDATION_FAILED", "The note can be up to 300 characters.", { note: ["Up to 300 characters"] });
  const at = new Date().toISOString();
  const keys: string[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i]!, ids[j]!);
      keys.push(key);
      if (!db.duplicateDismissals.some((d) => d.key === key)) {
        const [a, c] = key.split("-").map(Number) as [number, number];
        db.duplicateDismissals.push({ key, ids: [a, c], byId: u.id, at, note });
      }
    }
  const names = ids.map((id) => {
    const r = db.connect.find((x) => x.connectId === id)!;
    return `${r.entry.firstName ?? ""} ${r.entry.lastName ?? ""}`.trim();
  });
  audit(u.id, "welcome.duplicates.dismiss", ids.join("-"), { after: { name: names.join(" and "), records: ids, note } });
  return ok({ dismissed: keys });
}

export function restoreDuplicate(u: StaffRecord, key: string): Result<{ restored: true }> {
  if (!allowed(u, "welcome.duplicates.merge")) return no(403, "FORBIDDEN", "Only Tech Admin, Church Admin and Integration Admin can decide on duplicates.");
  const d = db.duplicateDismissals.find((x) => x.key === key);
  if (!d) return no(404, "NOT_FOUND", "That pair is already back in the review list.");
  db.duplicateDismissals = db.duplicateDismissals.filter((x) => x.key !== key);
  const names = d.ids.map((id) => {
    const r = db.connect.find((x) => x.connectId === id);
    return r ? `${r.entry.firstName ?? ""} ${r.entry.lastName ?? ""}`.trim() : `#${id}`;
  });
  audit(u.id, "welcome.duplicates.restore", key, { before: { name: names.join(" and "), note: d.note } });
  return ok({ restored: true });
}
