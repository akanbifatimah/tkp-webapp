import { Compass, LockKeyhole } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { useAuth } from "@/features/auth/auth";
import { EASE_OUT } from "@/lib/motion";
import { CONNECT_ACCESS_DENIED, landingPath } from "@/lib/permissions";

/**
 * UI-G5: the Access Denied message plus a link back to the landing page; never a blank page.
 * Connect uses the exact TKP Connect wording; other pages reveal nothing about what is there.
 */
export function AccessDenied({ kind = "generic" }: { kind?: "connect" | "generic" }) {
  const { activeRole } = useAuth();
  return (
    <Centered
      icon={<LockKeyhole />}
      title={kind === "connect" ? CONNECT_ACCESS_DENIED : "No access"}
      body={kind === "connect" ? null : "You don't have access to this page. If you think you should, ask the Tech Admin."}
      to={activeRole ? landingPath(activeRole) : "/"}
    />
  );
}

export function NotFound() {
  const { activeRole } = useAuth();
  return (
    <Centered
      icon={<Compass />}
      title="Page not found"
      body="That address doesn't match a page in TKP Hub."
      to={activeRole ? landingPath(activeRole) : "/"}
    />
  );
}

function Centered({ icon, title, body, to }: { icon: React.ReactNode; title: string; body: string | null; to: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="mx-auto mt-10 max-w-lg rounded-3xl border border-white bg-white p-8 text-center shadow-card sm:mt-20"
      role="alert"
    >
      <span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-maroon-100 text-maroon-700 [&_svg]:size-6" aria-hidden>
        {icon}
      </span>
      <h1 className="font-display text-2xl font-semibold text-balance text-maroon-900">{title}</h1>
      {body ? <p className="mt-2 text-[15px] text-muted">{body}</p> : null}
      <Link
        to={to}
        className="mt-6 inline-flex h-11 items-center rounded-xl bg-maroon-700 px-5 text-sm font-bold text-cream-50 transition-colors hover:bg-maroon-600"
      >
        Back to my start page
      </Link>
    </motion.div>
  );
}
