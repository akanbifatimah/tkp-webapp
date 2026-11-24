import { describe, expect, it } from "vitest";
import { listAudit } from "./admin-api";
import { createService, deleteService, getCellMap, listServices, removeZip, reorderServices, setServiceActive, setZip, updateService } from "./config-api";
import type { Result } from "./connect-api";
import { db } from "./db";
import { buildLcm } from "./lcm-api";

/** M7 step 1: cell and ZIP map (PRD W-12) and services manager (W-13). docs/API.md §8. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const TECH = "u01";
const CHURCH_ADMIN = "u04";
const INTEGRATION_ADMIN = "u08";
const ver = () => db.cellMap.rowVer;
const code = (r: Result<unknown>) => (r.ok ? null : r.code);

describe("cell map: who may change it", () => {
  it("Tech Admin, Church Admin and the integration lead; nobody else", () => {
    for (const id of [TECH, CHURCH_ADMIN, INTEGRATION_ADMIN]) expect(getCellMap(user(id)).ok).toBe(true);
    for (const id of ["u02", "u03", "u05", "u09", "u11", "u12", "u13"]) {
      expect(getCellMap(user(id)).status).toBe(403);
      expect(setZip(user(id), "77450", { cell: "Blue", rowVer: ver() }).status).toBe(403);
    }
  });
});

describe("cell map: reading", () => {
  it("lists each cell's ZIPs with entry counts, and the Houston-area ZIPs no cell covers", () => {
    const r = getCellMap(user(TECH));
    if (!r.ok) throw new Error(r.message);
    expect(r.body.cells.map((c) => c.cell)).toEqual(["Red", "Yellow", "Blue", "Green"]);
    const red = r.body.cells[0]!;
    expect(red.zips.map((z) => z.zip)).toEqual(["77084", "77423", "77450", "77493"]);
    expect(red.entries).toBe(db.entries.filter((e) => e.cellGroup === "Red").length);
    // 77082 etc. are seeded guest ZIPs on no cell.
    expect(r.body.unmapped.map((z) => z.zip)).toContain("77082");
    expect(r.body.unmapped.every((z) => !db.cellMap.zips[z.zip])).toBe(true);
    // Dallas, Austin… count as out of area; Lagos, London… have no ZIP.
    expect(r.body.outOfArea).toBe(db.entries.filter((e) => e.zip && !e.zip.startsWith("77")).length);
    expect(r.body.noZip).toBe(db.entries.filter((e) => !e.zip).length);
  });
});

describe("cell map: changing a mapping recalculates every affected entry (W-12)", () => {
  it("adds an unmapped ZIP to a cell", () => {
    const n = db.entries.filter((e) => e.zip === "77082").length;
    expect(n).toBeGreaterThan(0);
    const r = setZip(user(CHURCH_ADMIN), "77082", { cell: "Green", rowVer: ver() });
    expect(r.ok && r.body).toMatchObject({ zip: "77082", cell: "Green", from: null, recalculated: n });
    expect(db.entries.filter((e) => e.zip === "77082").every((e) => e.cellGroup === "Green")).toBe(true);
    expect(db.connect.filter((c) => c.entry.zip === "77082").every((c) => c.entry.cellGroup === "Green")).toBe(true);
    const a = db.audit[0]!;
    expect(a).toMatchObject({ actorId: CHURCH_ADMIN, action: "welcome.cellmap.set", target: "77082" });
    expect(a.meta).toEqual({ before: { cell: "N/A" }, after: { cell: "Green", recalculated: n } });
  });

  it("moves a ZIP between cells", () => {
    const r = setZip(user(INTEGRATION_ADMIN), "77082", { cell: "Yellow", rowVer: ver() });
    expect(r.ok && r.body.from).toBe("Green");
    expect(db.entries.filter((e) => e.zip === "77082").every((e) => e.cellGroup === "Yellow")).toBe(true);
  });

  it("taking a ZIP off the map turns its entries N/A", () => {
    const r = removeZip(user(TECH), "77082", ver());
    expect(r.ok && r.body).toMatchObject({ cell: null, from: "Yellow" });
    expect(db.entries.filter((e) => e.zip === "77082").every((e) => e.cellGroup === "N/A")).toBe(true);
    expect(db.audit[0]!.action).toBe("welcome.cellmap.remove");
    expect(removeZip(user(TECH), "77082", ver()).status).toBe(404);
  });

  it("the LCM report follows the new map", () => {
    setZip(user(TECH), "77079", { cell: "Blue", rowVer: ver() });
    const lcm = buildLcm(db.entries, { month: "2026-10" }, new Map());
    const row = lcm.emergingZips.find((z) => z.zip === "77079");
    if (row) expect(row).toMatchObject({ cellGroup: "Blue", isEmerging: false });
    expect(lcm.breakdowns.CellGroup.some((b) => b.value === "Blue")).toBe(true);
    removeZip(user(TECH), "77079", ver());
  });

  it("refuses a stale map version, a bad ZIP and an unknown cell", () => {
    expect(code(setZip(user(TECH), "77450", { cell: "Blue", rowVer: ver() - 1 }))).toBe("CONFLICT");
    const bad = setZip(user(TECH), "7745", { cell: "Blue", rowVer: ver() });
    expect(bad.status).toBe(422);
    expect(!bad.ok && bad.fields?.zip).toBeTruthy();
    expect(setZip(user(TECH), "77450", { cell: "Purple", rowVer: ver() }).status).toBe(422);
  });

  it("an unchanged mapping changes nothing and is not audited", () => {
    const before = db.audit.length;
    const v = ver();
    const r = setZip(user(TECH), "77450", { cell: "Red", rowVer: v });
    expect(r.ok && r.body.recalculated).toBe(0);
    expect(ver()).toBe(v);
    expect(db.audit.length).toBe(before);
  });
});

describe("services: reading", () => {
  it("anyone who filters Welcome by service may read the list; only Church Admin and Tech Admin change it", () => {
    for (const id of ["u12", "u09", "u11", CHURCH_ADMIN]) expect(listServices(user(id)).ok).toBe(true);
    expect(listServices(user("u13")).status).toBe(403);
    for (const id of [INTEGRATION_ADMIN, "u11", "u02"]) expect(createService(user(id), { name: "Test", kind: "special" }).status).toBe(403);
  });

  it("active services first in form order, with entry counts and what the form shows today", () => {
    const r = listServices(user(TECH), new Date("2026-11-20T15:00:00Z"));
    if (!r.ok) throw new Error(r.message);
    const names = r.body.items.map((s) => s.name);
    expect(names.slice(0, 3)).toEqual(["Sunday 1st Service", "Sunday 2nd Service", "Tuesday Bible Study"]);
    expect(names.at(-1)).toBe("Saturday Prayer Breakfast");
    const first = r.body.items[0]!;
    expect(first.entries).toBe(db.entries.filter((e) => e.serviceType === "Sunday 1st Service").length);
    // Cross Over (Dec 31) and 168 HOP (January) are not on the form yet; Power Night has no window.
    expect(r.body.formToday).toEqual(["Sunday 1st Service", "Sunday 2nd Service", "Tuesday Bible Study", "Power Night", "Other"]);
    const onNye = listServices(user(TECH), new Date("2026-12-31T18:00:00Z"));
    expect(onNye.ok && onNye.body.formToday).toContain("Cross Over");
  });
});

describe("services: changes", () => {
  it("adds a special event and validates it", () => {
    const bad = createService(user(CHURCH_ADMIN), { name: "Other", kind: "special", startsOn: "2027-02-10" });
    expect(bad.status).toBe(422);
    expect(!bad.ok && Object.keys(bad.fields ?? {}).sort()).toEqual(["endsOn", "name"]);
    expect(createService(user(CHURCH_ADMIN), { name: "Weekly thing", kind: "weekly" }).status).toBe(422);
    expect(code(createService(user(CHURCH_ADMIN), { name: "power night", kind: "special" }))).toBe("NAME_TAKEN");
    const r = createService(user(CHURCH_ADMIN), { name: "Easter Sunday", kind: "special", startsOn: "2027-03-28", endsOn: "2027-03-28", shortForm: true });
    expect(r.status).toBe(201);
    expect(r.ok && r.body.service).toMatchObject({ name: "Easter Sunday", shortName: "Easter Sunday", shortForm: true, active: true, entries: 0 });
    expect(db.audit[0]).toMatchObject({ action: "welcome.service.create", actorId: CHURCH_ADMIN });
  });

  it("renaming a service renames its past entries; stale versions are refused", () => {
    const svc = db.services.find((s) => s.name === "Tuesday Bible Study")!;
    const n = db.entries.filter((e) => e.serviceType === "Tuesday Bible Study").length;
    const body = { name: "Tuesday Bible Class", shortName: "Bible class", kind: "weekly" as const, day: 2, time: "19:00", startsOn: null, endsOn: null, shortForm: false };
    expect(code(updateService(user(TECH), svc.id, { ...body, rowVer: svc.rowVer + 5 }))).toBe("CONFLICT");
    const r = updateService(user(TECH), svc.id, { ...body, rowVer: svc.rowVer });
    expect(r.ok && r.body.renamedEntries).toBe(n);
    expect(db.entries.some((e) => e.serviceType === "Tuesday Bible Study")).toBe(false);
    expect(db.audit[0]!.meta).toMatchObject({ before: { name: "Tuesday Bible Study", shortName: "Bible study" }, after: { name: "Tuesday Bible Class", renamedEntries: n } });
  });

  it("a used service is retired, not deleted; an unused one can be deleted", () => {
    const used = db.services.find((s) => s.name === "Sunday 2nd Service")!;
    expect(code(deleteService(user(TECH), used.id))).toBe("IN_USE");
    const r = setServiceActive(user(TECH), used.id, false);
    expect(r.ok && r.body.service.onForm).toBe(false);
    expect(db.audit[0]!.action).toBe("welcome.service.retire");
    expect(setServiceActive(user(TECH), used.id, true).ok).toBe(true);
    const easter = db.services.find((s) => s.name === "Easter Sunday")!;
    expect(deleteService(user(TECH), easter.id).ok).toBe(true);
    expect(db.services.some((s) => s.id === easter.id)).toBe(false);
    expect(listAudit(user(TECH), { q: "Easter Sunday" }).ok).toBe(true);
  });

  it("the form keeps at least one service", () => {
    const active = db.services.filter((s) => s.active);
    for (const s of active.slice(1)) setServiceActive(user(TECH), s.id, false);
    expect(code(setServiceActive(user(TECH), active[0]!.id, false))).toBe("LAST_SERVICE");
    for (const s of active.slice(1)) setServiceActive(user(TECH), s.id, true);
  });

  it("reorders the active services; every active one exactly once", () => {
    const ids = db.services.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id);
    expect(reorderServices(user(TECH), ids.slice(1)).status).toBe(422);
    const r = reorderServices(user(TECH), [...ids].reverse());
    expect(r.ok && r.body.items.filter((s) => s.active).map((s) => s.id)).toEqual([...ids].reverse());
    expect(db.audit[0]!.action).toBe("welcome.service.reorder");
  });
});
