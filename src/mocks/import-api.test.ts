import { describe, expect, it } from "vitest";
import type { Result } from "./connect-api";
import { db } from "./db";
import { analyseImport, commitImport, discardImport, getImport, listImports, parseDate, parseDateTime, patchImport, suggestMapping, undoImport } from "./import-api";
import { parseCsv, type Cell } from "./import-parse";
import { IMPORT_FIELDS } from "@/features/welcome/import-types";

/** M7 step 4: the import wizard engine (PRD W-16, WT-5; EV-26 to EV-28 for the shared rules). docs/API.md §11. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const CHURCH_ADMIN = "u04";
const INTEGRATION_ADMIN = "u08";
const WELCOME_LEAD = "u11";
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};
const upload = (kind: string, data: Cell[][], fileName = "guests.csv", as = CHURCH_ADMIN) =>
  analyseImport(user(as), { kind, fileName, fileSize: 2048, sheets: [{ name: "CSV", data }] });

describe("reading files", () => {
  it("CSV: byte order mark, semicolons, quotes and line breaks inside quotes", () => {
    expect(parseCsv('﻿Name;Note\r\n"Okoro; Funmi";"Said ""hi""\nthen left"\r\n\r\n')).toEqual([
      ["Name", "Note"],
      ["Okoro; Funmi", 'Said "hi"\nthen left'],
    ]);
  });

  it("dates as people type them, and Excel serials", () => {
    expect(parseDate("3/4/2025", "MDY")).toBe("2025-03-04");
    expect(parseDate("3/4/2025", "DMY")).toBe("2025-04-03");
    expect(parseDate("2025-11-02", "MDY")).toBe("2025-11-02");
    expect(parseDate("Nov 2, 2025", "MDY")).toBe("2025-11-02");
    expect(parseDate("2 November 2025", "MDY")).toBe("2025-11-02");
    expect(parseDate("45601", "MDY")).toBe("2024-11-05");
    expect(parseDate("31/02/2025", "DMY")).toBeNull();
    expect(parseDate("soon", "MDY")).toBeNull();
    // 6:30 pm church time on 2 Nov 2025 (after daylight saving ended) is 00:30 UTC the next day.
    expect(parseDateTime("11/2/2025 6:30 PM", "MDY")).toBe("2025-11-03T00:30:00.000Z");
    expect(parseDateTime("2025-07-06", "MDY")).toBe("2025-07-06T17:00:00.000Z");
  });

  it("suggests a field for each column, each field once", () => {
    const m = suggestMapping(["Date of Service", "First Name", "Surname", "Mobile", "E-mail", "Favourite colour", "Phone"], IMPORT_FIELDS.guests);
    expect(m.map((x) => x.field)).toEqual(["serviceDate", "firstName", "lastName", "phone", "email", null, null]);
    expect(m[0]!.confidence).toBe(1);
  });
});

describe("upload checks (EV-26)", () => {
  it("the admins and the Welcome Lead import; others can't", () => {
    expect(code(upload("guests", [["a", "b"]], "x.csv", "u12"))).toBe("FORBIDDEN");
    expect(code(listImports(user("u03")))).toBe("FORBIDDEN");
    expect(must(listImports(user(INTEGRATION_ADMIN))).can).toEqual({ import: true, followups: true });
  });

  it("refuses macros, old Excel, big files, empty files and too many rows", () => {
    expect(code(upload("guests", [["a"]], "guests.xlsm"))).toBe("UNSUPPORTED_FILE");
    expect(code(upload("guests", [["a"]], "guests.xls"))).toBe("UNSUPPORTED_FILE");
    expect(code(analyseImport(user(CHURCH_ADMIN), { kind: "guests", fileName: "a.csv", fileSize: 11 * 1024 * 1024, sheets: [] }))).toBe("FILE_TOO_LARGE");
    expect(code(upload("guests", []))).toBe("EMPTY_FILE");
    expect(code(upload("guests", Array.from({ length: 5002 }, (_, i) => [`r${i}`, "x"])))).toBe("TOO_MANY_ROWS");
    expect(code(upload("nope", [["a"]]))).toBe("VALIDATION_FAILED");
  });
});

describe("past guest entries", () => {
  const existing = db.connect.find((r) => r.entry.phone && r.status === "Active" && r.entry.serviceDate < "2026-10-01")!;
  const header = ["Date of Service", "Service", "First Name", "Surname", "Mobile", "E-mail", "Comments", "Favourite colour"];
  const file: Cell[][] = [
    ["Old welcome cards 2025"],
    header,
    ["3/2/2025", "Sunday 1st Service", "Tolu", "Bankole-Smith", "(832) 555-0901", "tolu.bs@example.com", "Loved the choir", "Green"],
    ["4/6/2025", "Sunday 2nd Service", "Tolu", "Bankole-Smith", "832.555.0901", "", "", ""],
    ["3/2/2025", "Sunday 1st Service", "Tolu", "B-S", "832 555 0901", "", "", ""],
    ["5/4/2025", "Sunday 1st Service", "Someone", "Else", existing.entry.phone, "", "", ""],
    ["", "Sunday 1st Service", "No", "Date", "(713) 555-0902", "", "", ""],
    ["5/11/2025", "Youth Night", "Ada", "Eze", "(713) 555-0903", "", "", ""],
    ["5/18/2025", "Sunday 1st Service", "", "", "", "", "Left the card blank", ""],
    [45601, "Sunday 2nd Service", "Seri", "Al", "(713) 555-0904", "", "", ""],
  ];

  it("finds the header row and the columns, and gives each row a status", () => {
    const job = must(upload("guests", file));
    expect(job.settings.headerRow).toBe(2);
    expect(job.columns.map((c) => c.field)).toEqual(["serviceDate", "serviceType", "firstName", "lastName", "phone", "email", "comments", null]);
    const byRow = Object.fromEntries(job.rows.map((r) => [r.rowNo, r]));
    expect(byRow[3]).toMatchObject({ status: "new", match: "New guest" });
    expect(byRow[3]!.values.comments).toBe("Loved the choir · Favourite colour: Green");
    expect(byRow[4]).toMatchObject({ status: "new", match: "Same new guest as row 3" });
    expect(byRow[5]!.status).toBe("error");
    expect(byRow[5]!.errors[0]!.message).toBe("Same guest and date as row 3");
    expect(byRow[6]!.match).toMatch(new RegExp(`^Existing guest #${existing.connectId} `));
    expect(byRow[6]!.warnings.join()).toMatch(/name differs/);
    expect(byRow[7]!.errors[0]).toMatchObject({ field: "serviceDate", message: "The service date is missing" });
    expect(byRow[8]!.errors[0]!.field).toBe("serviceType");
    expect(byRow[9]!.errors[0]!.message).toBe("Needs a name, a phone or an email");
    expect(byRow[10]!.values.serviceDate).toBe("2024-11-05");
    expect(job.counts).toMatchObject({ total: 8, new: 4, error: 4 });
  });

  it("fixes a row in place, imports the valid rows and undoes the batch", () => {
    const job = must(upload("guests", file));
    const fixed = must(patchImport(user(CHURCH_ADMIN), job.id, { fixes: [{ rowNo: 8, field: "serviceType", value: "Sunday 2nd Service" }] }));
    expect(fixed.rows.find((r) => r.rowNo === 8)).toMatchObject({ status: "new", fixed: ["serviceType"] });
    const before = { connect: db.connect.length, entries: db.entries.length };
    const visitsBefore = db.entries.filter((e) => e.connectId === existing.connectId).length;

    const done = must(commitImport(user(CHURCH_ADMIN), job.id, { mode: "add", idempotencyKey: "k1" }));
    expect(done.result).toEqual({ added: 5, updated: 0, unchanged: 0, failed: 3, newGuests: 3 });
    expect(db.connect.length).toBe(before.connect + 3);
    expect(db.entries.length).toBe(before.entries + 5);
    const tolu = db.connect.find((r) => r.entry.lastName === "Bankole-Smith")!;
    expect(tolu).toMatchObject({ status: "Closed", closedReason: "Imported history" });
    expect(db.entries.filter((e) => e.connectId === tolu.connectId).map((e) => e.visitNumber).sort()).toEqual([1, 2]);
    expect(db.entries.filter((e) => e.connectId === existing.connectId)).toHaveLength(visitsBefore + 1);
    expect(db.audit[0]).toMatchObject({ action: "welcome.import.commit", meta: { after: { added: 5, newGuests: 3 } } });
    // The same request again: the same answer, nothing added twice.
    expect(must(commitImport(user(CHURCH_ADMIN), job.id, { idempotencyKey: "k1" })).result!.added).toBe(5);
    expect(code(commitImport(user(CHURCH_ADMIN), job.id, { idempotencyKey: "k2" }))).toBe("NOT_DRAFT");

    // The same file again: nothing new.
    const again = must(upload("guests", file));
    expect(again.rows.filter((r) => r.status === "new")).toEqual([]); // row 8 still says Youth Night until fixed again
    expect(again.rows.find((r) => r.rowNo === 3)!.status).toBe("unchanged");
    must(discardImport(user(CHURCH_ADMIN), again.id));

    must(undoImport(user(CHURCH_ADMIN), job.id, {}));
    expect(db.connect.length).toBe(before.connect);
    expect(db.entries.length).toBe(before.entries);
    expect(db.audit[0]!.action).toBe("welcome.import.undo");
    expect(code(undoImport(user(CHURCH_ADMIN), job.id, {}))).toBe("ALREADY_UNDONE");
  });

  it("updates existing visits only when asked, and never wipes a value with a blank", () => {
    const e = db.entries.find((x) => x.connectId === existing.connectId)!;
    const data: Cell[][] = [header, [e.serviceDate, e.serviceType, e.firstName, e.lastName, e.phone, "", "Came with her sister", ""]];
    const job = must(upload("guests", data));
    expect(job.rows[0]).toMatchObject({ status: "update", changes: [{ field: "comments", from: e.comments, to: "Came with her sister" }] });
    const before = e.comments;
    const id2 = must(upload("guests", data)).id;
    expect(must(commitImport(user(CHURCH_ADMIN), job.id, { mode: "add" })).result).toMatchObject({ updated: 0, unchanged: 1 });
    expect(e.comments).toBe(before);
    expect(must(commitImport(user(CHURCH_ADMIN), id2, { mode: "update" })).result).toMatchObject({ updated: 1 });
    expect(db.entries.find((x) => x.id === e.id)!.comments).toBe("Came with her sister");
    must(undoImport(user(CHURCH_ADMIN), id2, {}));
    expect(db.entries.find((x) => x.id === e.id)!.comments).toBe(before);
  });

  it("warns before undoing what was worked on since, and undoes when told to", () => {
    const job = must(upload("guests", [header, ["6/1/2025", "Sunday 1st Service", "Ken", "Ade", "(281) 555-0911", "", "", ""]]));
    must(commitImport(user(CHURCH_ADMIN), job.id, {}));
    const rec = db.connect.find((r) => r.entry.lastName === "Ade" && r.entry.firstName === "Ken")!;
    rec.rowVer++; // someone saved follow-up on the new guest
    const r = undoImport(user(CHURCH_ADMIN), job.id, {});
    expect(code(r)).toBe("CHANGED_SINCE");
    expect(!r.ok && r.fields?.changed).toEqual([`Ken Ade (#${rec.connectId}) has follow-up saved since the import`]);
    expect(must(undoImport(user(CHURCH_ADMIN), job.id, { force: true })).status).toBe("undone");
    expect(db.connect.includes(rec)).toBe(false);
  });

  it("keeps a staged draft private to whoever uploaded it", () => {
    const job = must(upload("guests", file));
    expect(code(getImport(user(INTEGRATION_ADMIN), job.id))).toBe("NOT_FOUND");
    expect(must(listImports(user(INTEGRATION_ADMIN))).items.some((i) => i.id === job.id)).toBe(false);
    must(discardImport(user(CHURCH_ADMIN), job.id));
    expect(code(getImport(user(CHURCH_ADMIN), job.id))).toBe("NOT_FOUND");
    expect(db.audit[0]!.action).toBe("welcome.import.discard");
  });
});

describe("follow-up tracker records", () => {
  const guest = db.connect.find((r) => r.entry.phone && r.status === "Active" && r.entry.lastName !== "Osei")!;
  const lydia = db.staff.find((s) => s.fullName === "Lydia Fashola")!;

  it("finds the guest by phone or email, the caller by name, and adds the notes", () => {
    const data: Cell[][] = [
      ["Date of call", "Phone", "Guest", "Called by", "Team", "Method", "Outcome", "Notes"],
      ["10/5/2025 6:30 PM", guest.entry.phone, "Someone Else", "Lydia Fashola", "CO", "call", "Reached", "Lovely chat"],
      ["10/6/2025", "(999) 555-0000", "Nobody", "Lydia Fashola", "", "", "", ""],
      ["10/12/2025", guest.entry.phone, "", "Mrs Bello", "Integration", "WhatsApp", "Replied", "Asked about the youth"],
    ];
    const job = must(upload("followups", data, "tracker.xlsx"));
    expect(job.columns.map((c) => c.field)).toEqual(["date", "phone", "guestName", "caller", "team", "method", "callOutcome", "note"]);
    const [a, b, c] = job.rows;
    expect(a).toMatchObject({ status: "new", values: { team: "Church office", method: "Phone Call", date: "2025-10-05T23:30:00.000Z" } });
    expect(a!.warnings.join()).toMatch(/differs from the guest/);
    expect(b!.errors[0]!.message).toMatch(/No guest with this phone or email/);
    expect(c!.warnings).toContain("“Mrs Bello” isn't a TKP Hub user: saved by name only");
    const logs = db.connectLogs.length;
    expect(must(commitImport(user(CHURCH_ADMIN), job.id, {})).result).toMatchObject({ added: 2, failed: 1 });
    expect(db.connectLogs.length).toBe(logs + 2);
    const saved = db.connectLogs.find((l) => l.connectId === guest.connectId && l.note === "Lovely chat")!;
    expect(saved).toMatchObject({ authorId: lydia.id, team: "church_office", method: "Phone Call" });
    expect(db.connectLogs.find((l) => l.note === "Asked about the youth")).toMatchObject({ authorId: "", author: "Mrs Bello", team: "integration" });
    // Same file again: unchanged.
    const again = must(upload("followups", data, "tracker.xlsx"));
    expect(again.rows.map((r) => r.status)).toEqual(["unchanged", "error", "unchanged"]);
  });
});

describe("reading .xlsx", () => {
  it("reads every sheet, with dates as dates, and the import picks the first", async () => {
    const { makeXlsx } = await import("./xlsx-fixture");
    const { readUpload } = await import("./import-parse");
    const bytes = makeXlsx([
      { name: "Guests 2025", rows: [["Service date", "First name", "Phone"], [new Date(Date.UTC(2025, 2, 2)), "Tolu", "(832) 555-0921"]] },
      { name: "Notes", rows: [["Anything"], ["else"]] },
    ]);
    const sheets = await readUpload("old.xlsx", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(sheets.map((s) => s.name)).toEqual(["Guests 2025", "Notes"]);
    const job = must(analyseImport(user(CHURCH_ADMIN), { kind: "guests", fileName: "old.xlsx", fileSize: bytes.byteLength, sheets }));
    expect(job.sheets).toEqual([
      { name: "Guests 2025", rows: 1 },
      { name: "Notes", rows: 1 },
    ]);
    expect(job.rows[0]!.values).toMatchObject({ serviceDate: "2025-03-02", firstName: "Tolu", phone: "(832) 555-0921" });
    const other = must(patchImport(user(CHURCH_ADMIN), job.id, { sheet: "Notes" }));
    expect(other.sheet).toBe("Notes");
    must(discardImport(user(CHURCH_ADMIN), job.id));
  });
});

describe("the TKP Hub standard layout (the templates)", () => {
  it("every template column matches its field for sure", async () => {
    const { IMPORT_FIELDS } = await import("@/features/welcome/import-types");
    for (const kind of ["guests", "followups"] as const) {
      const fields = IMPORT_FIELDS[kind];
      const m = suggestMapping(fields.map((f) => f.header ?? f.label), fields);
      expect(m.map((x) => x.field)).toEqual(fields.map((f) => f.key));
      expect(m.every((x) => x.confidence === 1)).toBe(true);
    }
  });

  it("the Welcome Lead imports guest entries, not follow-up records", () => {
    expect(must(listImports(user(WELCOME_LEAD))).can).toEqual({ import: true, followups: false });
    expect(code(upload("followups", [["Date", "Phone"], ["1/1/2025", "(281) 555-0100"]], "t.csv", WELCOME_LEAD))).toBe("FORBIDDEN");
    const job = must(upload("guests", [["Service date", "First name"], ["1/5/2025", "Ann"]], "g.csv", WELCOME_LEAD));
    must(discardImport(user(WELCOME_LEAD), job.id));
  });
});
