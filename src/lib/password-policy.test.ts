import { describe, expect, it } from "vitest";
import { checkPassword } from "./password-policy";

/** TKP Connect API-A5: the same five rules, with the same keys the server returns. */
describe("password rules", () => {
  it("accepts a password that meets every rule", () => {
    expect(checkPassword("Grace&Truth7")).toEqual({ ok: true, failed: [] });
  });

  it("names each rule that is missed", () => {
    expect(checkPassword("short").failed.map((f) => f.key)).toEqual(["len", "case", "num", "sym"]);
    expect(checkPassword("alllowercase1!").failed.map((f) => f.key)).toEqual(["case"]);
    expect(checkPassword("NoNumbers!!").failed.map((f) => f.key)).toEqual(["num"]);
    expect(checkPassword("NoSymbols123").failed.map((f) => f.key)).toEqual(["sym"]);
  });

  it("refuses passwords built on an issued one, as a substring, any case", () => {
    expect(checkPassword("Welcome2026!").failed.map((f) => f.key)).toEqual(["deny"]);
    expect(checkPassword("My-TKPConnect-9").failed.map((f) => f.key)).toEqual(["deny"]);
    expect(checkPassword("xTempPass123!Y").failed.map((f) => f.key)).toEqual(["deny"]);
  });
});
