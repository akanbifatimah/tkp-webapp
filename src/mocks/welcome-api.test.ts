import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import type { WelcomeEntry } from "./seed/guests";
import { getEntry, getGuestRecord, getOverview, kpis, logExport, membershipIntent, searchGuests } from "./welcome-api";

/** TKP Connect's Welcome acceptance tests (doc 07 FI-30…FI-36) against the mock server. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const naomi = () => user("u12"); // Welcome Team
const grace = () => user("u01"); // Tech Admin

let ruth: WelcomeEntry;
beforeAll(() => {
  const base = db.entries[0]!;
  ruth = {
    ...base,
    id: 999_001,
    firstName: "Ruth",
    lastName: "Mensah",
    middleName: null,
    phone: "(832) 555-0177",
    prayerRequest: "Pray for my family.",
    legacyNotes: [],
  };
  db.entries.push(ruth);
});

describe("Guest lookup (FI-34)", () => {
  it("finds “ruth mensah” and “mensah ruth” alike", () => {
    for (const name of ["ruth mensah", "mensah ruth", "RUTH"]) {
      const r = searchGuests(naomi(), { name });
      expect(r.ok && r.body.items.some((i) => i.id === ruth.id)).toBe(true);
    }
  });

  it("finds a guest by any 3+ digits of the phone, in any format", () => {
    for (const phone of ["0177", "555-0177", "(832)"]) {
      const r = searchGuests(naomi(), { phone });
      expect(r.ok && r.body.items.some((i) => i.id === ruth.id)).toBe(true);
    }
    expect(searchGuests(naomi(), { phone: "83" })).toMatchObject({ ok: false, message: "Type at least 3 digits of the phone number." });
  });

  it("asks for something to search with", () => {
    expect(searchGuests(naomi(), {})).toMatchObject({ ok: false, message: "Type a phone number or a name, or pick a filter." });
  });

  it("filters by cell, including No cell", () => {
    const r = searchGuests(naomi(), { cell: "None" });
    expect(r.ok && r.body.items.every((i) => i.cellGroup === "N/A")).toBe(true);
  });

  it("lists newest first", () => {
    const r = searchGuests(naomi(), { name: "a" });
    const dates = r.ok ? r.body.items.map((i) => i.serviceDate) : [];
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("prayer request (BR-30)", () => {
  it("FI-35: is never in the guest record drawer's response", () => {
    const r = getGuestRecord(naomi(), ruth.id);
    expect(r.ok && JSON.stringify(r.body)).not.toContain("Pray for my family");
  });
  it("is in View entry only", () => {
    const r = getEntry(naomi(), ruth.id);
    expect(r.ok && r.body.entry.prayerRequest).toBe("Pray for my family.");
  });
});

describe("Overview (FI-30…FI-33)", () => {
  it("opens on the latest service date and compares with the previous one on the same weekday", () => {
    const r = getOverview(naomi(), { date: null, scope: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.meta.date).toBe(r.body.dates[0]);
    const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
    expect(wd(r.body.meta.priorStart!)).toBe(wd(r.body.meta.date));
  });

  it("year to date compares the same span last year, with one chart column per month", () => {
    const r = getOverview(naomi(), { date: null, scope: "ytd" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.body.meta.currentStart.endsWith("-01-01")).toBe(true);
    expect(r.body.meta.priorEnd!.slice(0, 4)).toBe(String(Number(r.body.meta.date.slice(0, 4)) - 1));
    expect(r.body.chart.every((c) => c.date.endsWith("-01"))).toBe(true);
  });

  it("cell shares add up to all guests (FI-32)", () => {
    const r = getOverview(naomi(), { date: null, scope: "mtd" });
    if (!r.ok) throw new Error("expected ok");
    const sum = Object.values(r.body.cells.current).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBe(r.body.kpis.current.guests);
  });

  it("“Maybe” counts as Undecided; a blank rating is not 0 (BR-23)", () => {
    expect(membershipIntent({ ...ruth, likeToBecomeMember: "Maybe" })).toBe("Undecided");
    const k = kpis([{ ...ruth, ratings: { Music: 10, Parking: null } }]);
    expect(k.avgRating).toBe(10);
  });
});

describe("guest PDF export (D8)", () => {
  it("is allowed for the export roles and logged; refused for the Welcome Team", () => {
    expect(logExport(grace(), ruth.id)).toMatchObject({ ok: true });
    expect(db.audit[0]).toMatchObject({ action: "welcome.entry.export", actorId: "u01" });
    expect(logExport(naomi(), ruth.id)).toMatchObject({ ok: false, status: 403 });
  });
});
