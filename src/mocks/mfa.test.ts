import { describe, expect, it } from "vitest";
import { db } from "./db";
import { mockInbox } from "./inbox";
import { MAX_ATTEMPTS, MAX_SENDS, RESEND_AFTER_MS, maskEmail, needsMfa, resendMfa, startMfa, verifyMfa } from "./mfa";

/** PRD §2 rule 6 / A-2: a one-time code for every staff sign-in. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const code = () => mockInbox.get()!.code;

describe("MFA for staff", () => {
  it("staff need it; TKP Members do not", () => {
    expect(needsMfa(user("u01"))).toBe(true);
    expect(needsMfa(user("u12"))).toBe(true);
    expect(needsMfa(user("u13"))).toBe(false);
  });

  it("masks the email address", () => {
    expect(maskEmail("grace.adeyemi@example.com")).toBe("g•••@example.com");
  });

  it("the right code completes the sign-in once", () => {
    const c = startMfa(user("u01"));
    expect(c.sentTo).toBe("g•••@example.com");
    expect(verifyMfa(c.ticket, code())).toMatchObject({ ok: true });
    expect(verifyMfa(c.ticket, code())).toMatchObject({ ok: false, code: "MFA_EXPIRED" });
  });

  it("a wrong code says how many tries are left, then locks", () => {
    const c = startMfa(user("u01"));
    const wrong = code() === "000000" ? "111111" : "000000";
    const first = verifyMfa(c.ticket, wrong);
    expect(first).toMatchObject({ ok: false, code: "MFA_INVALID", fields: { code: [`${MAX_ATTEMPTS - 1} tries left`] } });
    for (let i = 1; i < MAX_ATTEMPTS - 1; i++) verifyMfa(c.ticket, wrong);
    expect(verifyMfa(c.ticket, wrong)).toMatchObject({ ok: false, code: "MFA_LOCKED" });
    expect(verifyMfa(c.ticket, code())).toMatchObject({ ok: false, code: "MFA_EXPIRED" });
  });

  it("codes expire after 10 minutes", () => {
    const now = Date.now();
    const c = startMfa(user("u01"), now);
    expect(verifyMfa(c.ticket, code(), now + 10 * 60_000 + 1)).toMatchObject({ ok: false, code: "MFA_EXPIRED" });
  });

  it("resend waits 30 seconds, replaces the code, and is capped", () => {
    const now = Date.now();
    const c = startMfa(user("u01"), now);
    const firstCode = code();
    expect(resendMfa(c.ticket, now + 1000)).toMatchObject({ ok: false, status: 429, code: "TOO_SOON" });
    let t = now + RESEND_AFTER_MS + 1;
    expect(resendMfa(c.ticket, t)).toMatchObject({ ok: true });
    for (let i = 2; i < MAX_SENDS; i++) {
      t += RESEND_AFTER_MS + 1;
      expect(resendMfa(c.ticket, t).ok).toBe(true);
    }
    t += RESEND_AFTER_MS + 1;
    expect(resendMfa(c.ticket, t)).toMatchObject({ ok: false, code: "TOO_MANY_CODES" });
    if (code() !== firstCode) expect(verifyMfa(c.ticket, firstCode, t).ok).toBe(false);
    expect(verifyMfa(c.ticket, code(), t)).toMatchObject({ ok: true });
  });

  it("a deactivated person cannot finish", () => {
    const u = user("u12");
    const c = startMfa(u);
    u.isActive = false;
    expect(verifyMfa(c.ticket, code())).toMatchObject({ ok: false, code: "MFA_EXPIRED" });
    u.isActive = true;
  });
});
