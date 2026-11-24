import { describe, expect, it } from "vitest";
import { safeNext } from "@/features/auth/auth";
import { parseError } from "./api";
import { churchDate, formatDay, formatTime, fromChurchLocal, toChurchLocal } from "./time";

describe("API error envelope", () => {
  it("reads { error: { code, message, fields } }", async () => {
    const res = new Response(
      JSON.stringify({ error: { code: "VALIDATION_FAILED", message: "Check the form", fields: { "contact.phone": ["Too short"] } } }),
      { status: 422 },
    );
    const e = await parseError(res);
    expect(e.status).toBe(422);
    expect(e.code).toBe("VALIDATION_FAILED");
    expect(e.message).toBe("Check the form");
    expect(e.fields).toEqual({ "contact.phone": ["Too short"] });
  });

  it("tolerates TKP Connect's { error: 'message' }", async () => {
    const e = await parseError(new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401 }));
    expect(e.message).toBe("Invalid email or password");
    expect(e.isUnauthorized).toBe(true);
  });

  it("falls back to a friendly message for non-JSON bodies", async () => {
    const e = await parseError(new Response("<html>", { status: 500 }));
    expect(e.message).toMatch(/something went wrong/i);
  });
});

describe("church time (America/Chicago)", () => {
  it("FI-10: a log saved at 11:30 pm Central shows that day", () => {
    // 11:30 pm CST on Nov 15 = 05:30 UTC on Nov 16
    expect(churchDate("2026-11-16T05:30:00Z")).toBe("2026-11-15");
    expect(formatDay("2026-11-16T05:30:00Z")).toBe("Sun, Nov 15");
  });

  it("formats times like the live app", () => {
    expect(formatTime("2026-11-15T20:05:00Z")).toBe("2:05 pm");
  });
});

describe("return-to page after sign-in (UI-G6)", () => {
  it("accepts same-site paths only", () => {
    expect(safeNext("/connect/queue?date=2026-11-15")).toBe("/connect/queue?date=2026-11-15");
    expect(safeNext("https://evil.example.com")).toBeNull();
    expect(safeNext("//evil.example.com")).toBeNull();
    expect(safeNext("/\\evil.example.com")).toBeNull();
    expect(safeNext("/sign-in")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe("church wall clock (QR dates, PRD 8.3 edge cases)", () => {
  it("converts both ways, across daylight saving", () => {
    expect(fromChurchLocal("2026-12-20T18:00")).toBe("2026-12-21T00:00:00.000Z"); // CST, UTC−6
    expect(fromChurchLocal("2026-07-05T09:30")).toBe("2026-07-05T14:30:00.000Z"); // CDT, UTC−5
    expect(toChurchLocal("2026-12-21T00:00:00Z")).toBe("2026-12-20T18:00");
    // The night the clocks go back (Nov 1, 2026): 9 am is after the change.
    expect(fromChurchLocal("2026-11-01T09:00")).toBe("2026-11-01T15:00:00.000Z");
    expect(fromChurchLocal("2026-03-08T09:00")).toBe("2026-03-08T14:00:00.000Z");
    for (const iso of ["2026-03-08T14:00:00.000Z", "2026-11-01T15:00:00.000Z", "2027-01-01T05:59:00.000Z"]) expect(fromChurchLocal(toChurchLocal(iso))).toBe(iso);
  });
});
