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
const QrCodesPage = lazy(() => import("@/features/welcome/QrCodesPage").then((m) => ({ default: m.QrCodesPage })));
const DuplicatesPage = lazy(() => import("@/features/welcome/DuplicatesPage").then((m) => ({ default: m.DuplicatesPage })));
const ImportsPage = lazy(() => import("@/features/welcome/ImportsPage").then((m) => ({ default: m.ImportsPage })));
const ImportWizardPage = lazy(() => import("@/features/welcome/ImportWizardPage").then((m) => ({ default: m.ImportWizardPage })));
const ReportsPage = lazy(() => import("@/features/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const ReportPage = lazy(() => import("@/features/reports/ReportPage").then((m) => ({ default: m.ReportPage })));
const SchedulesPage = lazy(() => import("@/features/reports/SchedulesPage").then((m) => ({ default: m.SchedulesPage })));
const SignaturePage = lazy(() => import("@/features/account/SignaturePage").then((m) => ({ default: m.SignaturePage })));
const QrPrintPage = lazy(() => import("@/features/welcome/QrPrintPage").then((m) => ({ default: m.QrPrintPage })));
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
const CellsPage = lazy(() => import("@/features/admin/CellsPage").then((m) => ({ default: m.CellsPage })));
const ServicesPage = lazy(() => import("@/features/admin/ServicesPage").then((m) => ({ default: m.ServicesPage })));
const SettingsPage = lazy(() => import("@/features/admin/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const GrowDashboardPage = lazy(() => import("@/features/grow/GrowDashboardPage").then((m) => ({ default: m.GrowDashboardPage })));
const ClassesPage = lazy(() => import("@/features/grow/ClassesPage").then((m) => ({ default: m.ClassesPage })));
const ClassPage = lazy(() => import("@/features/grow/ClassPage").then((m) => ({ default: m.ClassPage })));
const ClassFormPage = lazy(() => import("@/features/grow/ClassFormPage").then((m) => ({ default: m.ClassFormPage })));
const SessionEditorPage = lazy(() => import("@/features/grow/SessionEditorPage").then((m) => ({ default: m.SessionEditorPage })));
const SessionDetailPage = lazy(() => import("@/features/grow/SessionDetailPage").then((m) => ({ default: m.SessionDetailPage })));
const AttendancePage = lazy(() => import("@/features/grow/AttendancePage").then((m) => ({ default: m.AttendancePage })));
const AssessmentBuilderPage = lazy(() => import("@/features/grow/AssessmentBuilderPage").then((m) => ({ default: m.AssessmentBuilderPage })));
const SubmissionsPage = lazy(() => import("@/features/grow/SubmissionsPage").then((m) => ({ default: m.SubmissionsPage })));
const ReviewPage = lazy(() => import("@/features/grow/ReviewPage").then((m) => ({ default: m.ReviewPage })));
const CertificatesPage = lazy(() => import("@/features/grow/CertificatesPage").then((m) => ({ default: m.CertificatesPage })));
const DropOffPage = lazy(() => import("@/features/grow/DropOffPage").then((m) => ({ default: m.DropOffPage })));
const ForumPage = lazy(() => import("@/features/grow/ForumPage").then((m) => ({ default: m.ForumPage })));
const ThreadPage = lazy(() => import("@/features/grow/ThreadPage").then((m) => ({ default: m.ThreadPage })));
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

/** Grow: staff with the Learn admin see the dashboard; members see what is coming for learners. */
function GrowIndex() {
  const { has } = useAuth();
  return has("learn.view") ? (
    <Suspense fallback={loading}>
      <GrowDashboardPage />
    </Suspense>
  ) : (
    <ModuleComing spec={COMING_LATER.grow!} />
  );
}

const page = (permission: Permission, element: React.ReactNode, kind: "connect" | "generic" = "generic") => (
  <RequirePermission permission={permission} kind={kind}>
    <Suspense fallback={loading}>{element}</Suspense>
  </RequirePermission>
);

const laterRoutes: RouteObject[] = (
  [
    ["belong", "belong.view"],
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
      // Any signed-in staff member: their own signature for certificates.
      { path: "account/signature", element: <Suspense fallback={loading}><SignaturePage /></Suspense> },
      { path: "dashboard", element: page("dashboard.view", <DashboardPage />) },
      {
        path: "admin",
        element: <Outlet />,
        children: [
          { index: true, element: <AdminIndex /> },
          { path: "users", element: page("admin.users", <UsersPage />) },
          { path: "roles", element: page("admin.users", <RolesPage />) },
          { path: "cells", element: page("config.cells", <CellsPage />) },
          { path: "services", element: page("config.services", <ServicesPage />) },
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
          { path: "qr", element: page("qr.view", <QrCodesPage />) },
          { path: "qr/print", element: page("qr.print", <QrPrintPage />) },
          { path: "duplicates", element: page("welcome.duplicates.view", <DuplicatesPage />) },
          { path: "import", element: page("welcome.import", <ImportsPage />) },
          { path: "import/:id", element: page("welcome.import", <ImportWizardPage />) },
        ],
      },
      {
        path: "reports",
        children: [
          { index: true, element: page("reports.view", <ReportsPage />) },
          { path: "schedules", element: page("reports.view", <SchedulesPage />) },
          { path: ":id", element: page("reports.view", <ReportPage />) },
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
      {
        path: "grow",
        children: [
          { index: true, element: page("grow.view", <GrowIndex />) },
          { path: "classes", element: page("learn.view", <ClassesPage />) },
          { path: "certificates", element: page("learn.view", <CertificatesPage />) },
          { path: "drop-off", element: page("learn.all", <DropOffPage />) },
          { path: "classes/new", element: page("learn.manage", <ClassFormPage />) },
          { path: "classes/:id", element: page("learn.view", <ClassPage />) },
          { path: "classes/:id/edit", element: page("learn.manage", <ClassFormPage />) },
          { path: "classes/:id/forum", element: page("learn.view", <ForumPage />) },
          { path: "classes/:id/forum/:tid", element: page("learn.view", <ThreadPage />) },
          { path: "classes/:id/sessions/new", element: page("learn.author", <SessionEditorPage />) },
          { path: "classes/:id/sessions/:sid", element: page("learn.view", <SessionDetailPage />) },
          { path: "classes/:id/sessions/:sid/edit", element: page("learn.view", <SessionEditorPage />) },
          { path: "classes/:id/sessions/:sid/attendance", element: page("learn.view", <AttendancePage />) },
          { path: "classes/:id/assessments/new", element: page("learn.author", <AssessmentBuilderPage />) },
          { path: "classes/:id/assessments/:aid", element: page("learn.view", <AssessmentBuilderPage />) },
          { path: "classes/:id/assessments/:aid/submissions", element: page("learn.view", <SubmissionsPage />) },
          { path: "classes/:id/assessments/:aid/submissions/:subId", element: page("learn.view", <ReviewPage />) },
        ],
      },
      ...laterRoutes,
      ...(env.showUiKit
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
