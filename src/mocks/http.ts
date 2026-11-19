import { HttpResponse, delay } from "msw";
import { env } from "@/lib/env";
import { db } from "./db";
import type { StaffRecord } from "./seed/staff";

/** Full URL pattern under the API base, e.g. path("/me"). */
export const path = (p: string) => `${env.apiBaseUrl}${p}`;

/** Error envelope (docs/API.md). */
export const fail = (status: number, code: string, message: string, fields?: Record<string, string[]>) =>
  HttpResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });

/** A little realistic latency so skeletons and transitions can be seen. */
export const latency = () => delay(180 + Math.random() * 220);

/* ------------------------------------------------------------- mock tokens */

const HOUR = 60 * 60 * 1000;
export const TOKEN_LIFETIME = HOUR; // API-A2: 1 hour
export const SESSION_CEILING = 12 * HOUR; // API-A2: 12-hour absolute ceiling

type Claims = { sub: string; iat: number; exp: number; sid: number };

export function issueToken(userId: string, sessionStart = Date.now()) {
  const now = Date.now();
  const claims: Claims = {
    sub: userId,
    iat: now,
    exp: Math.min(now + TOKEN_LIFETIME, sessionStart + SESSION_CEILING),
    sid: sessionStart,
  };
  return { token: `mock.${btoa(JSON.stringify(claims))}`, expiresAt: new Date(claims.exp).toISOString(), claims };
}

function readClaims(request: Request): Claims | null {
  const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/, "");
  if (!raw?.startsWith("mock.")) return null;
  try {
    return JSON.parse(atob(raw.slice(5))) as Claims;
  } catch {
    return null;
  }
}

const SESSION_ENDED = "Your session has ended. Please sign in again.";

/**
 * API-A3: every request re-reads the person.
 * API-A7: while a temporary password is in use, every route except
 * change-password, renew and /me answers 403 MUST_CHANGE_PASSWORD.
 */
export function authenticate(
  request: Request,
  { allowMustChange = false }: { allowMustChange?: boolean } = {},
): { user: StaffRecord; claims: Claims } | Response {
  const claims = readClaims(request);
  if (!claims || claims.exp < Date.now()) return fail(401, "UNAUTHENTICATED", SESSION_ENDED);
  const user = db.staff.find((u) => u.id === claims.sub);
  if (!user || !user.isActive || claims.iat < user.sessionsRevokedAt) return fail(401, "UNAUTHENTICATED", SESSION_ENDED);
  if (!allowMustChange && db.enforceTempPassword && user.mustChangePassword) {
    return fail(403, "MUST_CHANGE_PASSWORD", "Choose your own password before you continue.");
  }
  return { user, claims };
}

export const toMember = (u: StaffRecord) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  roles: u.roles,
  connectTeam: u.connectTeam,
  isTeamAdmin: u.roles.some((r) => r === "church_office_admin" || r === "integration_admin"),
  mustChangePassword: db.enforceTempPassword && u.mustChangePassword,
});
