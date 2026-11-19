/**
 * Password rules, copied from TKP Connect's shared/password-policy.js (API-A5).
 * The server is the rule; this live checklist is a courtesy so nobody plays
 * guess-the-rule. Keys match the server's `failed[].key`.
 */

/** Passwords that were issued to people, so they can't be chosen. Lowercase substrings on purpose. */
export const ISSUED_PASSWORDS = ["temppass123", "welcome2026", "tkpconnect"];

export const MIN_LENGTH = 8;

export type RuleKey = "len" | "case" | "num" | "sym" | "deny";
export type PasswordRule = { key: RuleKey; label: string; test: (pw: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { key: "len", label: `At least ${MIN_LENGTH} characters`, test: (pw) => pw.length >= MIN_LENGTH },
  { key: "case", label: "One uppercase and one lowercase letter", test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { key: "num", label: "One number", test: (pw) => /[0-9]/.test(pw) },
  { key: "sym", label: "One symbol (! ? # $ and so on)", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
  {
    key: "deny",
    label: "Not built on a password you were given",
    test: (pw) => !ISSUED_PASSWORDS.some((issued) => pw.toLowerCase().includes(issued)),
  },
];

export function checkPassword(pw: string): { ok: boolean; failed: { key: RuleKey; label: string }[] } {
  const failed = PASSWORD_RULES.filter((r) => !r.test(pw)).map(({ key, label }) => ({ key, label }));
  return { ok: failed.length === 0, failed };
}
