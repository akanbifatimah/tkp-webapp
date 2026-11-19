import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/features/auth/auth";
import { AccessDenied } from "@/features/placeholder/AccessDenied";
import type { Permission } from "@/lib/permissions";

/** Signed-in pages: while checking, a calm splash; signed out → Sign in, then back here (UI-G6). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, member, endReason } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "signed-out") {
    if (endReason === "password-changed") return <Navigate to="/sign-in?changed=1" replace />;
    if (endReason === "signed-out") return <Navigate to="/sign-in" replace />;
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }
  // API-A7: a temporary password must be replaced before anything else.
  if (member?.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return <>{children}</>;
}

export const CHANGE_PASSWORD_PATH = "/account/password";

/**
 * Page-level permission check ("hidden means hidden": the page reveals nothing).
 * Connect pages use TKP Connect's exact Access Denied wording (UI-G5).
 */
export function RequirePermission({
  permission,
  kind = "generic",
  children,
}: {
  permission: Permission;
  kind?: "connect" | "generic";
  children: ReactNode;
}) {
  const { has } = useAuth();
  if (!has(permission)) return <AccessDenied kind={kind} />;
  return <>{children}</>;
}

export function Splash() {
  return (
    <div className="grid min-h-svh place-items-center bg-sanctuary" role="status" aria-label="Loading">
      <div className="relative grid size-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-gold-500/20" />
        <span className="grid size-16 place-items-center rounded-2xl bg-cream-50 shadow-glow">
          <img src="/tkp-logo.png" alt="" className="h-10 w-auto" />
        </span>
      </div>
    </div>
  );
}
