import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Compass,
  Crown,
  HandHeart,
  HeartHandshake,
  Home,
  Link2,
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
  /** Group landing path. */
  to: string;
  permission: Permission;
  tabs?: NavTab[];
  /** Not built yet: opens the module's "coming" page. */
  planned?: boolean;
};

export const NAV: NavGroup[] = [
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
    ],
  },
  { id: "belong", step: 3, label: "Belong", icon: Users, to: "/belong", permission: "belong.view", planned: true },
  { id: "grow", step: 4, label: "Grow", icon: Sprout, to: "/grow", permission: "grow.view", planned: true },
  { id: "care", step: 5, label: "Care", icon: HeartHandshake, to: "/care", permission: "care.view", planned: true },
  { id: "serve", step: 6, label: "Serve", icon: Sparkles, to: "/serve", permission: "serve.view", planned: true },
  { id: "lead", step: 7, label: "Lead", icon: Crown, to: "/lead", permission: "lead.view", planned: true },
  { id: "go", step: 8, label: "Go", icon: Compass, to: "/go", permission: "go.view", planned: true },
  { id: "transform", step: 9, label: "Transform", icon: BookOpen, to: "/transform", permission: "transform.view", planned: true },
];

/** Groups and tabs this person may see. */
export function visibleNav(has: (p: Permission) => boolean): NavGroup[] {
  return NAV.filter((g) => has(g.permission)).map((g) => ({
    ...g,
    tabs: g.tabs?.filter((t) => has(t.permission)),
  }));
}
