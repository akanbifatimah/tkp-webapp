import { describe, expect, it } from "vitest";
import { SCRIPTS } from "./scripts";
import { fillScript, isOverdue48, nextStepLabel, phaseFromChecklist, scriptLines, waNumber, weekNo } from "./rules";

describe("BR-15 week number (church time)", () => {
  it("week 1 is days 0–6 after the service date", () => {
    expect(weekNo("2026-11-15", new Date("2026-11-15T20:00:00Z"))).toBe(1);
    expect(weekNo("2026-11-15", new Date("2026-11-21T20:00:00Z"))).toBe(1);
    expect(weekNo("2026-11-15", new Date("2026-11-22T20:00:00Z"))).toBe(2);
  });
  it("counts in Chicago time: 11 pm Saturday Central is still week 1", () => {
    // Sat Nov 21, 11:00 pm CST = Sun Nov 22 05:00 UTC
    expect(weekNo("2026-11-15", new Date("2026-11-22T05:00:00Z"))).toBe(1);
  });
});

describe("BR-13 48 hours overdue", () => {
  const base = { status: "Active" as const, phase: 1 as const, clockStartAt: "2026-11-15T16:00:00Z", checklist: {} };
  const later = new Date("2026-11-17T16:00:01Z");
  it("is overdue after 48 h in Phase 1 without the 48 Hr Welcome tick", () => {
    expect(isOverdue48(base, later)).toBe(true);
    expect(isOverdue48(base, new Date("2026-11-17T15:59:00Z"))).toBe(false);
  });
  it("is not overdue once ticked, outside Phase 1, or when not Active", () => {
    expect(isOverdue48({ ...base, checklist: { P1Welcome48h: { at: "x" } } }, later)).toBe(false);
    expect(isOverdue48({ ...base, phase: 2 }, later)).toBe(false);
    expect(isOverdue48({ ...base, status: "Closed" }, later)).toBe(false);
  });
});

describe("BR-12 phase moves", () => {
  it("follows the Complete ticks", () => {
    expect(phaseFromChecklist({})).toBe(1);
    expect(phaseFromChecklist({ P1Complete: 1 })).toBe(2);
    expect(phaseFromChecklist({ P1Complete: 1, P2Complete: 1 })).toBe(3);
  });
  it("names the next checklist item", () => {
    expect(nextStepLabel(1, 0)).toBe("48 Hr Welcome");
    expect(nextStepLabel(2, 4)).toBe("Phase 2 complete");
  });
});

describe("Appendix A scripts", () => {
  it("has all 15 approved scripts: 4 Church Office, 3 + 4 + 4 Integration", () => {
    expect(SCRIPTS).toHaveLength(15);
    expect(SCRIPTS.filter((s) => s.team === "church_office")).toHaveLength(4);
    expect(SCRIPTS.filter((s) => s.phase === 1)).toHaveLength(3);
    expect(SCRIPTS.filter((s) => s.phase === 2)).toHaveLength(4);
    expect(SCRIPTS.filter((s) => s.phase === 3)).toHaveLength(4);
  });

  it("FI-68: fills [Name], [Your Name] and [Day]; leaves the others for the caller", () => {
    const body = SCRIPTS.find((s) => s.id === "co-3")!.body;
    expect(fillScript(body, { Name: "Ada", "Your Name": "Tobi Martins", Day: "Sunday" })).toBe(
      "Hi Ada, it's Tobi Martins from The King's Palace. We tried to call to thank you for visiting on Sunday. Hope your week is going well! Is there anything we can pray with you about? Reply anytime.",
    );
    expect(fillScript("[Department] for [Name]", { Name: "Ada" })).toBe("[Department] for Ada");
  });

  it("marks caller instructions and placeholders", () => {
    const lines = scriptLines("Action: call [Name]\nYou can reach me on (Replace with your phone number).", { Name: "Ada" });
    expect(lines[0]!.direction).toBe(true);
    expect(lines[0]!.pieces).toEqual([{ text: "Action: call " }, { text: "Ada", token: "filled" }]);
    expect(lines[1]!.pieces[1]).toEqual({ text: "(Replace with your phone number)", token: "open" });
  });

  it("builds WhatsApp numbers in international format", () => {
    expect(waNumber("(281) 555-0187")).toBe("12815550187");
    expect(waNumber("+44 20 7946 0958")).toBe("442079460958");
  });
});
