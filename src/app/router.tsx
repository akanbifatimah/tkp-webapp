import { lazy, Suspense } from "react";
import { Navigate, Outlet, createBrowserRouter, type RouteObject } from "react-router";
import { Skeleton } from "@/components/ui/misc";
import { ChangePasswordPage } from "@/features/account/ChangePasswordPage";
import { useAuth } from "@/features/auth/auth";
import { SignInPage } from "@/features/auth/SignInPage";
import { MemberHomePage } from "@/features/member/MemberHomePage";
import { AccessDenied, NotFound } from "@/features/placeholder/AccessDenied";
import { COMING_LATER, ModuleComing } from "@/features/placeholder/ModuleComing";
import { env } from "@/lib/env";
import { visibleNav } from "@/lib/nav";
import { landingPath, type Permission } from "@/lib/permissions";
import { AppShell } from "./AppShell";
import { CHANGE_PASSWORD_PATH, RequireAuth, RequirePermission } from "./guards";

/**
 * Module pages load on first visit, so charts and maps only download where
 * they are used (LCM carries the map library).
 */
const OverviewPage = lazy(() => import("@/features/welcome/OverviewPage").then((m) => ({ default: m.OverviewPage })));
const LookupPage = lazy(() => import("@/features/welcome/LookupPage").then((m) => ({ default: m.LookupPage })));
const LcmPage = lazy(() => import("@/features/welcome/LcmPage").then((m) => ({ default: m.LcmPage })));
const QueuePage = lazy(() => import("@/features/connect/QueuePage").then((m) => ({ default: m.QueuePage })));
const LogPage = lazy(() => import("@/features/connect/LogPage").then((m) => ({ default: m.LogPage })));
const ScriptsPage = lazy(() => import("@/features/connect/ScriptsPage").then((m) => ({ default: m.ScriptsPage })));
const GuestTrackPage = lazy(() => import("@/features/connect/GuestTrackPage").then((m) => ({ default: m.GuestTrackPage })));
const JourneyPage = lazy(() => import("@/features/connect/JourneyPage").then((m) => ({ default: m.JourneyPage })));
const PhaseBoardPage = lazy(() => import("@/features/connect/PhaseBoardPage").then((m) => ({ default: m.PhaseBoardPage })));
const MetricsPage = lazy(() => import("@/features/connect/MetricsPage").then((m) => ({ default: m.MetricsPage })));
const DashboardPage = lazy(() => import("@/features/admin/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const UsersPage = lazy(() => import("@/features/admin/UsersPage").then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import("@/features/admin/RolesPage").then((m) => ({ default: m.RolesPage })));
const AuditPage = lazy(() => import("@/features/admin/AuditPage").then((m) => ({ default: m.AuditPage })));
const SettingsPage = lazy(() => import("@/features/admin/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const UiKitPage = lazy(() => import("@/features/dev/UiKitPage").then((m) => ({ default: m.UiKitPage })));

const loading = <Skeleton className="mt-6 h-96 w-full rounded-3xl" />;

/** Route names follow TKP Connect's pages so the backend developer and TKP can match them up. */

function Landing() {
  const { activeRole } = useAuth();
  return <Navigate to={activeRole ? landingPath(activeRole) : "/no-access"} replace />;
}

/** /admin opens the first Admin page this person may see (Tech Team: the audit log). */
function AdminIndex() {
  const { has } = useAuth();
  const admin = visibleNav(has).find((g) => g.id === "admin");
  return admin ? <Navigate to={admin.to} replace /> : <AccessDenied />;
}

const page = (permission: Permission, element: React.ReactNode, kind: "connect" | "generic" = "generic") => (
  <RequirePermission permission={permission} kind={kind}>
    <Suspense fallback={loading}>{element}</Suspense>
  </RequirePermission>
);

const laterRoutes: RouteObject[] = (
  [
    ["belong", "belong.view"],
    ["grow", "grow.view"],
    ["care", "care.view"],
    ["serve", "serve.view"],
    ["lead", "lead.view"],
    ["go", "go.view"],
    ["transform", "transform.view"],
  ] as const
).map(([id, perm]) => ({ path: id, element: page(perm, <ModuleComing spec={COMING_LATER[id]!} />) }));

export const router = createBrowserRouter([
  { path: "/sign-in", element: <SignInPage /> },
  {
    // Standalone (no sidebar): also the forced first-sign-in step (API-A7).
    path: CHANGE_PASSWORD_PATH,
    element: (
      <RequireAuth>
        <ChangePasswordPage />
      </RequireAuth>
    ),
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Landing /> },
      { path: "home", element: page("member.home", <MemberHomePage />) },
      { path: "dashboard", element: page("dashboard.view", <DashboardPage />) },
      {
        path: "admin",
        element: <Outlet />,
        children: [
          { index: true, element: <AdminIndex /> },
          { path: "users", element: page("admin.users", <UsersPage />) },
          { path: "roles", element: page("admin.users", <RolesPage />) },
          { path: "audit", element: page("admin.audit", <AuditPage />) },
          { path: "settings", element: page("admin.settings", <SettingsPage />) },
        ],
      },
      {
        path: "welcome",
        element: <Outlet />,
        children: [
          { index: true, element: page("welcome.overview.view", <OverviewPage />) },
          { path: "lookup", element: page("welcome.lookup.view", <LookupPage />) },
          { path: "lcm", element: page("welcome.lcm.view", <LcmPage />) },
        ],
      },
      {
        path: "connect",
        element: <Outlet />,
        children: [
          { index: true, element: <Navigate to="queue" replace /> },
          { path: "queue", element: page("connect.queue.view", <QueuePage />, "connect") },
          { path: "log/:journeyId?", element: page("connect.log.view", <LogPage />, "connect") },
          { path: "scripts", element: page("connect.scripts.view", <ScriptsPage />, "connect") },
          { path: "guest-track", element: page("connect.guestTrack.view", <GuestTrackPage />, "connect") },
          { path: "journey/:connectId?", element: page("connect.journey.view", <JourneyPage />, "connect") },
          { path: "board", element: page("connect.phaseBoard.view", <PhaseBoardPage />, "connect") },
          { path: "metrics", element: page("connect.metrics.view", <MetricsPage />, "connect") },
        ],
      },
      ...laterRoutes,
      ...(env.useMocks
        ? [
            {
              path: "dev/ui",
              element: (
                <Suspense fallback={loading}>
                  <UiKitPage />
                </Suspense>
              ),
            },
          ]
        : []),
      { path: "no-access", element: <AccessDenied /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
