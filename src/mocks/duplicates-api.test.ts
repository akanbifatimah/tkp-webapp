import { describe, expect, it } from "vitest";
import type { DuplicateGroup } from "@/features/welcome/duplicate-types";
import type { Result } from "./connect-api";
import { db } from "./db";
import { dismissDuplicates, listDuplicates, mergeDuplicates, normalPhone, restoreDuplicate } from "./duplicates-api";

/** M7 step 3: duplicate review and merge (PRD W-14, A-1, 8.1). docs/API.md §10. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const CHURCH_ADMIN = "u04";
const TECH_TEAM = "u02";
const WELCOME_LEAD = "u11";
const WELCOME_TEAM = "u12";
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const groups = () => {
  const r = listDuplicates(user(CHURCH_ADMIN));
  if (!r.ok) throw new Error(r.message);
  return r.body;
};
const groupOf = (name: string) => groups().groups.find((g) => g.people.some((p) => p.name === name));
const rowVers = (g: DuplicateGroup) => Object.fromEntries(g.people.map((p) => [String(p.connectId), p.rowVer]));

describe("duplicates: who may do what", () => {
  it("the admins merge; the welcome lead and Tech Team only see; the welcome team has no access", () => {
    expect(groups().can.merge).toBe(true);
    for (const id of [WELCOME_LEAD, TECH_TEAM]) {
      const r = listDuplicates(user(id));
      expect(r.ok && r.body.can.merge).toBe(false);
    }
    expect(code(listDuplicates(user(WELCOME_TEAM)))).toBe("FORBIDDEN");
    const g = groupOf("Marcus Adeleke")!;
    expect(code(mergeDuplicates(user(WELCOME_LEAD), { keepId: g.people[0]!.connectId, mergeIds: [g.people[1]!.connectId], rowVers: rowVers(g) }))).toBe("FORBIDDEN");
    expect(code(dismissDuplicates(user(WELCOME_LEAD), { ids: g.people.map((p) => p.connectId) }))).toBe("FORBIDDEN");
  });
});

describe("duplicates: matching (A-1: phone or email, never the name)", () => {
  it("phones match whatever the format", () => {
    expect(normalPhone("(832) 555-0167")).toBe("+18325550167");
    expect(normalPhone("+1 832-555-0167")).toBe("+18325550167");
    expect(normalPhone("832.555.0167")).toBe("+18325550167");
    expect(normalPhone("12")).toBeNull();
  });

  it("finds exactly the five seeded cases", () => {
    const g = groups().groups;
    expect(g).toHaveLength(5);
    const anita = groupOf("Anita Cole-Mensah")!;
    expect(anita.people).toHaveLength(3);
    expect(anita.namesDiffer).toBe(false); // "Cole Mensah" is the same name
    expect(anita.reasons.map((r) => r.kind).sort()).toEqual(["email", "phone"]);
    const funmi = groupOf("Funmi Okoro")!;
    expect(funmi.namesDiffer).toBe(true);
    expect(funmi.reasons).toEqual([
      { kind: "phone", value: "(832) 555-0167" },
      { kind: "email", value: "funmi.okoro@example.com" },
    ]);
    expect(groupOf("Bisi Durojaiye")!.reasons).toEqual([{ kind: "phone", value: "(713) 555-0118" }]);
  });

  it("the same name alone never links two records", () => {
    const [a, b] = db.connect.filter((r) => !["Adeleke", "Okoro", "Durojaiye", "Osei", "Cole-Mensah", "Cole Mensah"].includes(r.entry.lastName ?? "")).slice(0, 2);
    const saved = { first: b!.entry.firstName, last: b!.entry.lastName };
    Object.assign(b!.entry, { firstName: a!.entry.firstName, lastName: a!.entry.lastName });
    try {
      expect(groups().groups).toHaveLength(5);
    } finally {
      Object.assign(b!.entry, { firstName: saved.first, lastName: saved.last });
    }
  });

  it("suggests the journey furthest along", () => {
    const g = groupOf("Marcus Adeleke")!;
    expect(g.suggestedJourney).toBe(g.people[0]!.connectId);
    expect(g.people[0]!.journey.phase).toBeGreaterThan(g.people[1]!.journey.phase);
  });
});

describe("duplicates: not the same person", () => {
  it("takes the pair off the list, keeps the note, and can put it back", () => {
    const g = groupOf("Bisi Durojaiye")!;
    const ids = g.people.map((p) => p.connectId);
    const r = dismissDuplicates(user(CHURCH_ADMIN), { ids, note: "Husband and wife share the home phone." });
    expect(r.ok).toBe(true);
    expect(db.audit[0]).toMatchObject({ action: "welcome.duplicates.dismiss", actorId: CHURCH_ADMIN });
    const after = groups();
    expect(after.groups).toHaveLength(4);
    expect(after.dismissed[0]).toMatchObject({ names: ["Kunle Durojaiye", "Bisi Durojaiye"], by: "Esther Coleman", note: "Husband and wife share the home phone." });

    expect(restoreDuplicate(user(CHURCH_ADMIN), after.dismissed[0]!.key).ok).toBe(true);
    expect(db.audit[0]!.action).toBe("welcome.duplicates.restore");
    expect(groups().groups).toHaveLength(5);
    expect(code(restoreDuplicate(user(CHURCH_ADMIN), after.dismissed[0]!.key))).toBe("NOT_FOUND");
    // Leave it dismissed for the rest of the run, as staff would.
    dismissDuplicates(user(CHURCH_ADMIN), { ids, note: null });
  });
});

describe("duplicates: merging", () => {
  it("refuses a stale record, records that don't match, and a journey from elsewhere", () => {
    const g = groupOf("Marcus Adeleke")!;
    const [a, b] = g.people;
    expect(code(mergeDuplicates(user(CHURCH_ADMIN), { keepId: a!.connectId, mergeIds: [b!.connectId], rowVers: { ...rowVers(g), [a!.connectId]: 99 } }))).toBe("CONFLICT");
    const other = groupOf("Gabriel Osei")!.people[0]!;
    expect(
      code(mergeDuplicates(user(CHURCH_ADMIN), { keepId: a!.connectId, mergeIds: [other.connectId], rowVers: { ...rowVers(g), [other.connectId]: other.rowVer } })),
    ).toBe("NOT_DUPLICATE");
    expect(code(mergeDuplicates(user(CHURCH_ADMIN), { keepId: a!.connectId, mergeIds: [b!.connectId], journeyFrom: other.connectId, rowVers: rowVers(g) }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(code(mergeDuplicates(user(CHURCH_ADMIN), { keepId: a!.connectId, mergeIds: [], rowVers: rowVers(g) }))).toBe("VALIDATION_FAILED");
  });

  it("moves every visit and note to the record kept, counts visits again, and closes the other journey", () => {
    const g = groupOf("Marcus Adeleke")!;
    const [keep, other] = g.people as [(typeof g.people)[0], (typeof g.people)[0]];
    const logsBefore = keep.logs + other.logs;
    const r = mergeDuplicates(user(CHURCH_ADMIN), { keepId: keep.connectId, mergeIds: [other.connectId], journeyFrom: keep.connectId, fields: {}, rowVers: rowVers(g) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.kept).toMatchObject({ connectId: keep.connectId, visits: 2, logs: logsBefore, rowVer: keep.rowVer + 1 });
    expect(db.connect.some((x) => x.connectId === other.connectId)).toBe(false);
    expect(db.mergedRecords.find((x) => x.connectId === other.connectId)).toMatchObject({ mergedInto: keep.connectId, closedReason: "Merged", mergedById: CHURCH_ADMIN });
    const visits = db.entries.filter((e) => e.connectId === keep.connectId).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
    expect(visits.map((e) => e.visitNumber)).toEqual([1, 2]);
    const rec = db.connect.find((x) => x.connectId === keep.connectId)!;
    expect(rec.state.returned2ndVisit).toBe(true);
    expect(rec.state.returnVisitDate).toBe(visits[1]!.serviceDate);
    expect(db.audit[0]).toMatchObject({ action: "welcome.duplicates.merge", target: String(keep.connectId), meta: { after: { kept: keep.connectId, merged: [other.connectId], visits: 2 } } });
    expect(groupOf("Marcus Adeleke")).toBeUndefined();
    // Merging again: the other record is gone.
    expect(code(mergeDuplicates(user(CHURCH_ADMIN), { keepId: keep.connectId, mergeIds: [other.connectId], rowVers: rowVers(g) }))).toBe("NOT_FOUND");
  });

  it("keeps the values and the journey chosen", () => {
    const g = groupOf("Funmi Okoro")!;
    const [older, newer] = g.people as [(typeof g.people)[0], (typeof g.people)[0]];
    const r = mergeDuplicates(user(CHURCH_ADMIN), {
      keepId: older.connectId,
      mergeIds: [newer.connectId],
      journeyFrom: newer.connectId,
      fields: { firstName: older.connectId, phone: newer.connectId, email: older.connectId },
      rowVers: rowVers(g),
    });
    expect(r.ok).toBe(true);
    const rec = db.connect.find((x) => x.connectId === older.connectId)!;
    expect(rec.entry).toMatchObject({ firstName: "Funmilayo", phone: "+1 832-555-0167", email: "funmi.okoro@example.com" });
    expect(rec.phase).toBe(newer.journey.phase);
    expect(rec.coMemberId).toBe(db.staff.find((s) => s.fullName === newer.journey.churchOffice)?.id);
    expect(db.connectLogs.filter((l) => l.connectId === older.connectId).every((l) => l.guest === "Funmilayo Okoro")).toBe(true);
  });

  it("merges three records at once", () => {
    const g = groupOf("Anita Cole-Mensah")!;
    const [keep, ...rest] = g.people;
    const r = mergeDuplicates(user(CHURCH_ADMIN), { keepId: keep!.connectId, mergeIds: rest.map((p) => p.connectId), journeyFrom: g.suggestedJourney, rowVers: rowVers(g) });
    expect(r.ok && r.body.kept.visits).toBe(3);
    expect(groups().groups.map((x) => x.people[0]!.name)).toEqual(["Gabriel Osei"]);
  });
});
