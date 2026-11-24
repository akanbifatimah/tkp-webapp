import { ChevronDown, FlaskConical, KeyRound, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { Logo } from "@/components/ui/Logo";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAuth, useConfirmedSignOut } from "@/features/auth/auth";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { visibleNav, type NavGroup } from "@/lib/nav";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { RailFlyout, RailTooltip } from "./rail";

/** Which group owns the current path. */
const groupOf = (groups: NavGroup[], pathname: string) =>
  groups.find((g) => pathname === g.to || pathname.startsWith(`/${g.id}`))?.id ?? null;

/**
 * Sidebar built from permissions. `collapsed` (desktop only) turns it into an
 * icon rail: labels move into tooltips and each module's pages into a flyout.
 */
export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const { has } = useAuth();
  const { pathname } = useLocation();
  const groups = visibleNav(has);
  const activeId = groupOf(groups, pathname);
  // Only the active module shows its pages (TKP Connect UI-G1); others can be peeked open.
  const [peek, setPeek] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 pt-6 pb-5", collapsed ? "flex-col gap-3 px-0" : "justify-between pr-2.5 pl-4")}>
        <Logo compact={collapsed} />
        {onToggleCollapsed ? (
          <RailTooltip label="Expand sidebar" enabled={collapsed}>
            <button
              type="button"
              onClick={(e) => {
                onToggleCollapsed();
                // Drop focus so a tooltip doesn't linger after the click.
                e.currentTarget.blur();
              }}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? undefined : "Collapse sidebar"}
              className="grid size-8 shrink-0 place-items-center rounded-xl text-cream-100/60 transition-colors hover:bg-white/10 hover:text-cream-50"
            >
              {collapsed ? <PanelLeftOpen className="size-4.5" /> : <PanelLeftClose className="size-4.5" />}
            </button>
          </RailTooltip>
        ) : null}
      </div>

      <nav aria-label="Main" className={cn("scroll-warm flex-1 overflow-x-hidden overflow-y-auto pb-4", collapsed ? "px-2.5" : "px-3")}>
        <ul className="space-y-1">
          {groups.map((g) => {
            const active = g.id === activeId;
            const open = !collapsed && (active || peek === g.id);
            const hasTabs = !!g.tabs && g.tabs.length > 1;
            const Icon = g.icon;

            const link = (
              <div className="relative">
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-2xl bg-cream-100 shadow-[0_8px_20px_-10px_rgb(0_0_0/0.6)]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                ) : null}
                <NavLink
                  to={g.to}
                  onClick={onNavigate}
                  aria-label={collapsed ? g.label : undefined}
                  className={cn(
                    "relative flex h-11 items-center rounded-2xl text-[14px] font-bold transition-colors",
                    collapsed ? "justify-center" : "gap-3 pr-10 pl-3.5",
                    active ? "text-maroon-800" : "text-cream-100/80 hover:bg-white/8 hover:text-cream-50",
                  )}
                >
                  <span className="relative">
                    <Icon className={cn("size-4.5 shrink-0", active ? "text-maroon-700" : "text-gold-300/80")} aria-hidden />
                    {collapsed && g.step ? (
                      <span
                        className={cn(
                          "absolute -top-2 -right-2.5 grid size-3.5 place-items-center rounded-full text-[8px] font-extrabold",
                          active ? "bg-maroon-700 text-cream-50" : "bg-white/15 text-cream-100/70",
                        )}
                        aria-hidden
                      >
                        {g.step}
                      </span>
                    ) : null}
                  </span>
                  {collapsed ? null : <span className="truncate">{g.label}</span>}
                  {!collapsed && g.step ? (
                    <span
                      className={cn(
                        "ml-auto grid size-5 place-items-center rounded-full text-[10px] font-extrabold tabular",
                        active ? "bg-maroon-700 text-cream-50" : "bg-white/10 text-cream-100/60",
                      )}
                      aria-label={`Journey step ${g.step}`}
                    >
                      {g.step}
                    </span>
                  ) : null}
                  {g.planned ? <span className="sr-only">(coming soon)</span> : null}
                </NavLink>
                {hasTabs && !active && !collapsed ? (
                  <button
                    type="button"
                    onClick={() => setPeek((p) => (p === g.id ? null : g.id))}
                    aria-expanded={open}
                    aria-label={`${open ? "Hide" : "Show"} ${g.label} pages`}
                    className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-xl text-cream-100/60 hover:bg-white/10 hover:text-cream-50"
                  >
                    <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
                  </button>
                ) : null}
              </div>
            );

            return (
              <li key={g.id}>
                {collapsed && hasTabs ? (
                  <RailFlyout enabled title={g.label} trigger={link}>
                    {(close) => (
                      <ul className="space-y-0.5">
                        {g.tabs?.map((t) => (
                          <li key={t.to}>
                            <NavLink
                              to={t.to}
                              end={t.end}
                              onClick={() => {
                                close();
                                onNavigate?.();
                              }}
                              className={({ isActive }) =>
                                cn(
                                  "flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold transition-colors",
                                  isActive ? "bg-white/12 text-cream-50" : "text-cream-100/70 hover:bg-white/8 hover:text-cream-50",
                                )
                              }
                            >
                              {t.label}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </RailFlyout>
                ) : (
                  <RailTooltip label={g.label} enabled={collapsed}>
                    {link}
                  </RailTooltip>
                )}

                <AnimatePresence initial={false}>
                  {hasTabs && open ? (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="ml-6 overflow-hidden border-l border-white/12 pl-3"
                    >
                      {g.tabs?.map((t) => (
                        <li key={t.to} className="first:pt-1.5 last:pb-1.5">
                          <NavLink
                            to={t.to}
                            end={t.end}
                            onClick={onNavigate}
                            className={({ isActive }) =>
                              cn(
                                "relative flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold transition-colors",
                                isActive ? "bg-white/12 text-cream-50" : "text-cream-100/65 hover:bg-white/6 hover:text-cream-50",
                              )
                            }
                          >
                            {({ isActive }) => (
                              <>
                                {isActive ? (
                                  <motion.span
                                    layoutId="tab-dot"
                                    className="absolute top-1/2 -left-4 size-2 -translate-y-1/2 rounded-full bg-gold-400 ring-4 ring-maroon-800"
                                  />
                                ) : null}
                                {t.label}
                              </>
                            )}
                          </NavLink>
                        </li>
                      ))}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>

        {env.showUiKit ? (
          <RailTooltip label="UI kit (mock mode)" enabled={collapsed}>
            <NavLink
              to="/dev/ui"
              onClick={onNavigate}
              aria-label={collapsed ? "UI kit (mock mode)" : undefined}
              className={({ isActive }) =>
                cn(
                  "mt-4 flex h-9 items-center gap-2 rounded-xl border border-dashed border-gold-400/40 text-xs font-bold transition-colors",
                  collapsed ? "justify-center" : "px-3.5",
                  isActive ? "bg-white/12 text-gold-300" : "text-gold-300/70 hover:bg-white/6 hover:text-gold-300",
                )
              }
            >
              <FlaskConical className="size-4" aria-hidden />
              {collapsed ? null : "UI kit (mock mode)"}
            </NavLink>
          </RailTooltip>
        ) : null}
      </nav>

      <UserCard collapsed={collapsed} onNavigate={onNavigate} />
    </div>
  );
}

function UserCard({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { member, activeRole, setActiveRole } = useAuth();
  const signOut = useConfirmedSignOut();
  if (!member || !activeRole) return null;
  const initials = member.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  const avatar = (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-gold-300 to-gold-600 font-display text-sm font-bold text-maroon-950">
      {initials}
    </span>
  );
  const iconButton = "grid size-8 shrink-0 place-items-center rounded-xl text-cream-100/70 hover:bg-white/10 hover:text-cream-50";

  if (collapsed) {
    return (
      <div className="m-2.5 flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-black/20 py-3">
        <RailTooltip label={`${member.fullName} · ${ROLE_LABEL[activeRole]}`} enabled>
          <span className="block" tabIndex={0}>
            {avatar}
          </span>
        </RailTooltip>
        <RailTooltip label="Change password" enabled>
          <NavLink to="/account/password" onClick={onNavigate} aria-label="Change password" className={iconButton}>
            <KeyRound className="size-4.5" />
          </NavLink>
        </RailTooltip>
        <RailTooltip label="Sign out" enabled>
          <button type="button" onClick={() => void signOut()} aria-label="Sign out" className={iconButton}>
            <LogOut className="size-4.5" />
          </button>
        </RailTooltip>
      </div>
    );
  }

  return (
    <div className="m-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2.5">
        {avatar}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-bold text-cream-50">{member.fullName}</span>
          <span className="block truncate text-xs text-cream-100/60">{ROLE_LABEL[activeRole]}</span>
        </span>
        <Tooltip label="Change password">
          <NavLink to="/account/password" onClick={onNavigate} aria-label="Change password" className={iconButton}>
            <KeyRound className="size-4.5" />
          </NavLink>
        </Tooltip>
        <Tooltip label="Sign out">
          <button type="button" onClick={() => void signOut()} aria-label="Sign out" className={iconButton}>
            <LogOut className="size-4.5" />
          </button>
        </Tooltip>
      </div>
      {member.roles.length > 1 ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-extrabold tracking-[0.16em] text-gold-300/70 uppercase">Acting as</span>
          <select
            value={activeRole}
            onChange={(e) => setActiveRole(e.target.value as Role)}
            className="h-9 w-full rounded-xl border border-white/15 bg-maroon-900 px-2.5 text-[13px] font-bold text-cream-50"
          >
            {member.roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
