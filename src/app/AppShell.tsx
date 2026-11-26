import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useLocation, useOutlet } from "react-router";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { useAuth } from "@/features/auth/auth";
import { pageTransition } from "@/lib/motion";
import { ROLE_LABEL } from "@/lib/permissions";
import { formatLongDay, greeting } from "@/lib/time";
import { IdleGuard } from "./IdleGuard";
import { useSidebarCollapsed } from "./rail";
import { Sidebar } from "./Sidebar";

/**
 * Figma "TKP Hub" layout: full-height maroon sidebar flush against the cream
 * work panel, so the two read as one surface. On desktop the sidebar collapses to an icon rail
 * (remembered per browser); below 1024 px it becomes a drawer.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const [drawer, setDrawer] = useState(false);
  // Desktop only: phones and tablets always get the full drawer.
  const { collapsed, toggle } = useSidebarCollapsed("tkp-hub-sidebar-collapsed");

  // Close the drawer on navigation and with Esc.
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="min-h-svh bg-maroon-950 lg:flex">
      <a
        href="#main"
        className="sr-only z-200 rounded-lg bg-gold-400 px-4 py-2 font-bold text-maroon-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <IdleGuard />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "bg-sidebar grain sticky top-0 hidden h-svh shrink-0 overflow-hidden transition-[width] duration-250 ease-out lg:block",
          collapsed ? "w-20" : "w-72",
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggle} />
      </aside>

      {/* Phone / tablet top bar */}
      <header className="bg-sidebar sticky top-0 z-40 flex h-16 items-center justify-between px-4 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          aria-expanded={drawer}
          className="grid size-11 place-items-center rounded-xl text-cream-50 hover:bg-white/10"
        >
          <Menu className="size-6" />
        </button>
      </header>

      <AnimatePresence>
        {drawer ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <motion.button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
              onClick={() => setDrawer(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="bg-sidebar absolute inset-y-0 left-0 w-[min(20rem,86vw)] shadow-panel"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
            >
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="absolute top-6 right-3 z-10 grid size-10 place-items-center rounded-xl text-cream-50 hover:bg-white/10"
              >
                <X className="size-5" />
              </button>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      <main
        id="main"
        className="min-h-[calc(100svh-4rem)] min-w-0 flex-1 bg-cream-100 lg:min-h-svh"
      >
        <TopStrip />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            variants={pageTransition}
            initial="initial"
            animate="enter"
            exit="exit"
            className="px-4 pt-2 pb-12 sm:px-6 lg:px-10"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/** Greeting, church-time date and who is signed in. */
function TopStrip() {
  const { member, activeRole } = useAuth();
  const first = member?.fullName.split(" ")[0];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-6 lg:px-10 lg:pt-7">
      <p className="text-sm font-semibold text-muted">
        {greeting()}
        {first ? `, ${first}` : ""} · <span className="text-maroon-700">{formatLongDay(new Date())}</span>
      </p>
      {activeRole ? (
        <span className="hidden items-center gap-2 rounded-full border border-line bg-white py-1 pr-3 pl-1 text-xs font-bold text-maroon-800 sm:inline-flex">
          <span className="rounded-full bg-maroon-100 px-2 py-0.5 text-maroon-700">{ROLE_LABEL[activeRole]}</span>
          {member?.fullName}
        </span>
      ) : null}
    </div>
  );
}
