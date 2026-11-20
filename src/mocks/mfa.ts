import type { Result } from "./connect-api";
import { audit, db } from "./db";
import type { StaffRecord } from "./seed/staff";
import { isStaff } from "@/lib/permissions";
import { mockInbox } from "./inbox";

/**
 * Second sign-in step for staff (PRD §2 rule 6, A-2, F-12): after the password,
 * a 6-digit code sent to the person's email. Method to confirm with TKP; the
 * contract (ticket + code) stays the same if it becomes an authenticator app.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 30 * 1000;
export const MAX_ATTEMPTS = 5;
/** Resends per sign-in, so resending cannot be used to get unlimited guesses. */
export const MAX_SENDS = 3;

export type MfaChallenge = {
  ticket: string;
  method: "email";
  /** Masked, e.g. g•••@example.com: never the full address. */
  sentTo: string;
  expiresAt: string;
  resendAt: string;
};

type Pending = { userId: string; code: string; expiresAt: number; resendAt: number; attempts: number; sends: number };
const pending = new Map<string, Pending>();

export const needsMfa = (u: StaffRecord) => db.mfaForStaff && isStaff(u.roles);

export const maskEmail = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
};

const newCode = () => String(Math.floor(100_000 + Math.random() * 900_000));

function send(u: StaffRecord, ticket: string, now: number, sends = 1): MfaChallenge {
  const code = newCode();
  pending.set(ticket, { userId: u.id, code, expiresAt: now + CODE_TTL_MS, resendAt: now + RESEND_AFTER_MS, attempts: 0, sends });
  mockInbox.deliver(u.email, code);
  return {
    ticket,
    method: "email",
    sentTo: maskEmail(u.email),
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
    resendAt: new Date(now + RESEND_AFTER_MS).toISOString(),
  };
}

export function startMfa(u: StaffRecord, now = Date.now()): MfaChallenge {
  audit(u.id, "mfa.code_sent");
  return send(u, crypto.randomUUID(), now);
}

/** Same message for a wrong, expired or unknown ticket's code, apart from the counts. */
const WRONG = "That code is not right. Check the latest email and try again.";
const EXPIRED = "That code has expired. Sign in again to get a new one.";
const LOCKED = "Too many wrong codes. Sign in again to get a new code.";

export function verifyMfa(ticket: string, code: string, now = Date.now()): Result<{ user: StaffRecord }> {
  const p = pending.get(ticket);
  if (!p) return { ok: false, status: 401, code: "MFA_EXPIRED", message: EXPIRED };
  const user = db.staff.find((s) => s.id === p.userId);
  if (!user || !user.isActive) {
    pending.delete(ticket);
    return { ok: false, status: 401, code: "MFA_EXPIRED", message: EXPIRED };
  }
  if (now > p.expiresAt) {
    pending.delete(ticket);
    return { ok: false, status: 401, code: "MFA_EXPIRED", message: EXPIRED };
  }
  if (code.replace(/\s/g, "") !== p.code) {
    p.attempts++;
    audit(user.id, "mfa.failed");
    if (p.attempts >= MAX_ATTEMPTS) {
      pending.delete(ticket);
      return { ok: false, status: 401, code: "MFA_LOCKED", message: LOCKED };
    }
    return {
      ok: false,
      status: 401,
      code: "MFA_INVALID",
      message: WRONG,
      fields: { code: [`${MAX_ATTEMPTS - p.attempts} ${MAX_ATTEMPTS - p.attempts === 1 ? "try" : "tries"} left`] },
    };
  }
  pending.delete(ticket);
  return { ok: true, status: 200, body: { user } };
}

export function resendMfa(ticket: string, now = Date.now()): Result<MfaChallenge> {
  const p = pending.get(ticket);
  const user = p && db.staff.find((s) => s.id === p.userId);
  if (!p || !user || now > p.expiresAt) return { ok: false, status: 401, code: "MFA_EXPIRED", message: EXPIRED };
  if (now < p.resendAt) {
    return { ok: false, status: 429, code: "TOO_SOON", message: `Wait ${Math.ceil((p.resendAt - now) / 1000)} seconds before asking for another code.` };
  }
  if (p.sends >= MAX_SENDS) {
    return { ok: false, status: 429, code: "TOO_MANY_CODES", message: "No more codes for this sign-in. Sign in again to start over." };
  }
  audit(user.id, "mfa.code_sent");
  return { ok: true, status: 200, body: send(user, ticket, now, p.sends + 1) };
}
