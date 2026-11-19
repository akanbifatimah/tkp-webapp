import { KeyRound, Mail, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { Card, PageHeader } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/auth";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { ROLE_LABEL } from "@/lib/permissions";

/**
 * TKP Connect UI-S3 · Member home: the landing page for TKP Members, who have
 * no Welcome or Connect access. Today it holds the member's own account; the
 * profile itself arrives with the Belong stage (Part 2).
 */
const JOURNEY = ["Welcome", "Connect", "Belong", "Grow", "Care", "Serve", "Lead", "Go", "Transform"];

export function MemberHomePage() {
  const { member, activeRole } = useAuth();
  if (!member || !activeRole) return null;
  const first = member.fullName.split(" ")[0];

  return (
    <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="TKP Member" title={`Welcome home, ${first}`} tagline="“I was glad when they said to me, Let us go into the house of the Lord.”" />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <h2 className="font-display text-lg font-semibold text-maroon-900">Your account</h2>
          <dl className="mt-4 grid gap-3">
            <Detail icon={<UserRound />} label="Name" value={member.fullName} />
            <Detail icon={<Mail />} label="Email" value={member.email} />
            <Detail icon={<KeyRound />} label="Role" value={member.roles.map((r) => ROLE_LABEL[r]).join(", ")} />
          </dl>
          <Link
            to="/account/password"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold text-ink transition-colors hover:border-maroon-200 hover:bg-cream-50"
          >
            <KeyRound className="size-4" aria-hidden /> Change password
          </Link>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-maroon-900">Your journey at TKP</h2>
          <p className="mt-1 text-sm text-muted">Your profile, groups and classes will appear here as each stage opens.</p>
          <motion.ol variants={stagger(0.05, 0.2)} className="mt-5 grid grid-cols-3 gap-2">
            {JOURNEY.map((step, i) => (
              <motion.li
                key={step}
                variants={fadeUp}
                className={cn(
                  "rounded-xl border px-2 py-3 text-center",
                  i === 2 ? "border-gold-400 bg-gold-100 text-gold-800" : "border-line bg-cream-50 text-muted",
                )}
              >
                <span className="block font-display text-lg font-semibold tabular">{i + 1}</span>
                <span className="block text-xs font-bold">{step}</span>
              </motion.li>
            ))}
          </motion.ol>
          <p className="mt-4 text-xs font-semibold text-muted">
            <span className="text-gold-800">Belong</span> is the next stage to open for members.
          </p>
        </Card>
      </div>
    </motion.div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-cream-50 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-maroon-700 [&_svg]:size-4.5" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-bold text-muted">{label}</dt>
        <dd className="truncate text-[15px] font-semibold text-ink">{value}</dd>
      </div>
    </div>
  );
}
