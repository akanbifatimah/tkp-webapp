import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Compass,
  Crown,
  HandHeart,
  HeartHandshake,
  Home,
  LayoutDashboard,
  Link2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
} from "lucide-react";
import type { Permission } from "./permissions";

/**
 * The sidebar, built from permissions ("hidden means hidden").
 * Groups follow TKP Connect's journey (1 Welcome … 9 Transform); inside Welcome
 * and Connect the tabs are the live app's tabs (FI-07). Planned tabs stay hidden
 * until they are built.
 */
export type NavTab = { label: string; to: string; permission: Permission; end?: boolean };
export type NavGroup = {
  id: string;
  step?: number;
  label: string;
  icon: LucideIcon;
  /** Group landing path. For groups with `anyTab`, the first visible tab. */
  to: string;
  permission: Permission;
  /** Show the group when any of its tabs is allowed (Admin: Tech Team sees only the audit log). */
  anyTab?: boolean;
  tabs?: NavTab[];
  /** Not built yet: opens the module's "coming" page. */
  planned?: boolean;
};

export const NAV: NavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    to: "/dashboard",
    permission: "dashboard.view",
  },
  {
    id: "home",
    label: "Member home",
    icon: Home,
    to: "/home",
    permission: "member.home",
  },
  {
    id: "welcome",
    step: 1,
    label: "Welcome",
    icon: HandHeart,
    to: "/welcome",
    permission: "welcome.overview.view",
    tabs: [
      { label: "Overview", to: "/welcome", permission: "welcome.overview.view", end: true },
      { label: "Guest lookup", to: "/welcome/lookup", permission: "welcome.lookup.view" },
      { label: "LCM Metrics", to: "/welcome/lcm", permission: "welcome.lcm.view" },
      // PRD 5.8: QR codes sit under Welcome (the welcome team prints them).
      { label: "QR codes", to: "/welcome/qr", permission: "qr.view" },
      // PRD W-14 / WT-7: duplicate review and merge.
      { label: "Duplicates", to: "/welcome/duplicates", permission: "welcome.duplicates.view" },
    ],
  },
  {
    id: "connect",
    step: 2,
    label: "Connect",
    icon: Link2,
    to: "/connect/queue",
    permission: "connect.queue.view",
    tabs: [
      { label: "Work queue", to: "/connect/queue", permission: "connect.queue.view" },
      { label: "Log follow-up", to: "/connect/log", permission: "connect.log.view" },
      { label: "Scripts", to: "/connect/scripts", permission: "connect.scripts.view" },
      // PLANNED tabs (TKP Connect UI-C4…C7), drafts awaiting sign-off.
      { label: "Guest Track", to: "/connect/guest-track", permission: "connect.guestTrack.view" },
      { label: "Guest journey", to: "/connect/journey", permission: "connect.journey.view" },
      { label: "Phase board", to: "/connect/board", permission: "connect.phaseBoard.view" },
      { label: "Team metrics", to: "/connect/metrics", permission: "connect.metrics.view" },
    ],
  },
  { id: "belong", step: 3, label: "Belong", icon: Users, to: "/belong", permission: "belong.view", planned: true },
  { id: "grow", step: 4, label: "Grow", icon: Sprout, to: "/grow", permission: "grow.view", planned: true },
  { id: "care", step: 5, label: "Care", icon: HeartHandshake, to: "/care", permission: "care.view", planned: true },
  { id: "serve", step: 6, label: "Serve", icon: Sparkles, to: "/serve", permission: "serve.view", planned: true },
  { id: "lead", step: 7, label: "Lead", icon: Crown, to: "/lead", permission: "lead.view", planned: true },
  { id: "go", step: 8, label: "Go", icon: Compass, to: "/go", permission: "go.view", planned: true },
  { id: "transform", step: 9, label: "Transform", icon: BookOpen, to: "/transform", permission: "transform.view", planned: true },
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    to: "/admin/users",
    permission: "admin.users",
    anyTab: true,
    tabs: [
      { label: "Users", to: "/admin/users", permission: "admin.users" },
      { label: "Roles", to: "/admin/roles", permission: "admin.users" },
      { label: "Cells and ZIPs", to: "/admin/cells", permission: "config.cells" },
      { label: "Services", to: "/admin/services", permission: "config.services" },
      { label: "Audit log", to: "/admin/audit", permission: "admin.audit" },
      { label: "Settings", to: "/admin/settings", permission: "admin.settings" },
    ],
  },
];

/** Groups and tabs this person may see. */
export function visibleNav(has: (p: Permission) => boolean): NavGroup[] {
  const out: NavGroup[] = [];
  for (const g of NAV) {
    const tabs = g.tabs?.filter((t) => has(t.permission));
    if (has(g.permission)) out.push({ ...g, tabs });
    else if (g.anyTab && tabs?.length) out.push({ ...g, to: tabs[0]!.to, tabs });
  }
  return out;
}
