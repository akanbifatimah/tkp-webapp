import { Navigate, Outlet, createBrowserRouter, type RouteObject } from "react-router";
import { ChangePasswordPage } from "@/features/account/ChangePasswordPage";
import { LogPage } from "@/features/connect/LogPage";
import { QueuePage } from "@/features/connect/QueuePage";
import { ScriptsPage } from "@/features/connect/ScriptsPage";
import { useAuth } from "@/features/auth/auth";
import { SignInPage } from "@/features/auth/SignInPage";
import { UiKitPage } from "@/features/dev/UiKitPage";
import { MemberHomePage } from "@/features/member/MemberHomePage";
import { AccessDenied, NotFound } from "@/features/placeholder/AccessDenied";
import { COMING, COMING_LATER, ModuleComing } from "@/features/placeholder/ModuleComing";
import { env } from "@/lib/env";
import { landingPath, type Permission } from "@/lib/permissions";
import { AppShell } from "./AppShell";
import { CHANGE_PASSWORD_PATH, RequireAuth, RequirePermission } from "./guards";

/** Route names follow TKP Connect's pages so the backend developer and TKP can match them up. */

function Landing() {
  const { activeRole } = useAuth();
  return <Navigate to={activeRole ? landingPath(activeRole) : "/no-access"} replace />;
}

const page = (permission: Permission, element: React.ReactNode, kind: "connect" | "generic" = "generic") => (
  <RequirePermission permission={permission} kind={kind}>
    {element}
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
      {
        path: "welcome",
        element: <Outlet />,
        children: [
          { index: true, element: page("welcome.overview.view", <ModuleComing spec={COMING.welcomeOverview!} />) },
          { path: "lookup", element: page("welcome.lookup.view", <ModuleComing spec={COMING.welcomeLookup!} />) },
          { path: "lcm", element: page("welcome.lcm.view", <ModuleComing spec={COMING.welcomeLcm!} />) },
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
        ],
      },
      ...laterRoutes,
      ...(env.useMocks ? [{ path: "dev/ui", element: <UiKitPage /> }] : []),
      { path: "no-access", element: <AccessDenied /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
