import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, type SignInResponse } from "@/lib/api";
import { permissionsFor, type Permission, type Role } from "@/lib/permissions";
import { session } from "@/lib/session";
import type { Member } from "@/lib/types";

/**
 * Who is signed in, what they may do, and keeping the session alive.
 * - 1-hour token renewed silently before it expires (API-A2, UI-G6)
 * - any 401 ends the session and returns to Sign in, then back to the same page
 * - several roles → a role switcher picks the active one (PRD); TKP Connect people have one
 */

type AuthState = {
  status: "loading" | "signed-out" | "signed-in";
  member: Member | null;
  activeRole: Role | null;
  setActiveRole: (role: Role) => void;
  has: (p: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<Member>;
  signOut: () => Promise<void>;
  /** Forget the session locally (the server already ended it, e.g. after a password change). */
  endSession: (reason: EndReason) => void;
  /** Why the last session ended, so Sign in can say the right thing. */
  endReason: EndReason | null;
};

/**
 * expired = the server refused the session (401): come back to the same page after signing in (UI-G6).
 * signed-out = the person chose Sign out. password-changed = API-A6 ended every session.
 */
export type EndReason = "expired" | "signed-out" | "password-changed";

const AuthContext = createContext<AuthState | null>(null);

const ROLE_KEY = "tkp.activeRole";
const EXPIRES_KEY = "tkp.expiresAt";
/** Renew this long before expiry. */
const RENEW_LEAD_MS = 5 * 60 * 1000;

export const ME_KEY = ["me"] as const;

function readActiveRole(member: Member | null): Role | null {
  if (!member) return null;
  const saved = sessionStorage.getItem(ROLE_KEY) as Role | null;
  return saved && member.roles.includes(saved) ? saved : (member.roles[0] ?? null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState(() => !!session.get());
  const [expiresAt, setExpiresAt] = useState<number | null>(() => Number(sessionStorage.getItem(EXPIRES_KEY)) || null);
  const [roleChoice, setRoleChoice] = useState<Role | null>(null);
  const [endReason, setEndReason] = useState<EndReason | null>(null);

  useEffect(() => {
    const unsubscribe = session.subscribe(() => setHasToken(!!session.get()));
    return () => {
      unsubscribe();
    };
  }, []);

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: ({ signal }) => api.auth.me(signal).then((r) => r.member),
    enabled: hasToken,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const clear = useCallback((reason: EndReason = "expired") => {
    setEndReason(reason);
    session.set(null);
    sessionStorage.removeItem(EXPIRES_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    setExpiresAt(null);
    setRoleChoice(null);
    qc.clear();
  }, [qc]);

  // Any 401 on a signed-in call ends the session (API-A3: deactivated, revoked, expired).
  useEffect(() => {
    setUnauthorizedHandler(() => clear("expired"));
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const accept = useCallback(
    (res: SignInResponse) => {
      session.set(res.token);
      const exp = new Date(res.expiresAt).getTime();
      sessionStorage.setItem(EXPIRES_KEY, String(exp));
      setExpiresAt(exp);
      qc.setQueryData(ME_KEY, res.member);
    },
    [qc],
  );

  // Silent renewal (API-A2). The server enforces the 12-hour ceiling.
  useEffect(() => {
    if (!hasToken || !expiresAt) return;
    const wait = Math.max(5_000, expiresAt - Date.now() - RENEW_LEAD_MS);
    const t = window.setTimeout(() => {
      api.auth.renew().then(accept).catch(() => clear("expired"));
    }, wait);
    return () => window.clearTimeout(t);
  }, [hasToken, expiresAt, accept, clear]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.auth.signIn(email, password);
      sessionStorage.removeItem(ROLE_KEY);
      setRoleChoice(null);
      setEndReason(null);
      accept(res);
      return res.member;
    },
    [accept],
  );

  const signOut = useCallback(async () => {
    await api.auth.signOut().catch(() => undefined);
    clear("signed-out");
  }, [clear]);

  const member = hasToken ? (me.data ?? null) : null;
  const activeRole = roleChoice && member?.roles.includes(roleChoice) ? roleChoice : readActiveRole(member);

  const setActiveRole = useCallback((role: Role) => {
    sessionStorage.setItem(ROLE_KEY, role);
    setRoleChoice(role);
  }, []);

  const value = useMemo<AuthState>(() => {
    const perms = activeRole ? permissionsFor([activeRole]) : new Set<Permission>();
    return {
      status: !hasToken ? "signed-out" : member ? "signed-in" : me.isError ? "signed-out" : "loading",
      member,
      activeRole,
      setActiveRole,
      has: (p) => perms.has(p),
      signIn,
      signOut,
      endSession: clear,
      endReason,
    };
  }, [hasToken, member, me.isError, activeRole, setActiveRole, signIn, signOut, clear, endReason]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Only same-site paths may be returned to after sign-in (UI-G6). */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/sign-in")) return null;
  return next;
}
