import { Info, KeyRound } from "lucide-react";
import { motion } from "motion/react";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { fadeUp, stagger } from "@/lib/motion";
import { PERMISSION_LABEL, ROLES, ROLE_LABEL, ROLE_PERMISSIONS, ROLE_SUMMARY, SENSITIVE_ROLES, type Permission } from "@/lib/permissions";
import { useUsers } from "./queries";

/**
 * Admin › Roles (PRD A-3, SA-3): the role templates and what each opens.
 * Read-only: the templates live in one place in the app (TKP Connect AC-08),
 * so changing one is a developer change, reviewed like any other.
 */
const AREA_ORDER = ["Dashboard", "Welcome", "Connect", "Journey", "Member", "Admin"];

function grouped(perms: readonly Permission[]) {
  const out = new Map<string, string[]>();
  for (const p of perms) {
    const { area, label } = PERMISSION_LABEL[p];
    out.set(area, [...(out.get(area) ?? []), label]);
  }
  return AREA_ORDER.filter((a) => out.has(a)).map((a) => ({ area: a, labels: out.get(a)! }));
}

export function RolesPage() {
  const users = useUsers({ status: "all", pageSize: 100 });
  const holders = (r: (typeof ROLES)[number]) => users.data?.items.filter((u) => u.status !== "deactivated" && u.roles.includes(r)) ?? null;

  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader eyebrow="Admin" title="Roles" tagline="What each role opens. A person can hold several roles and picks one to act as." />

      <motion.p variants={fadeUp} className="flex items-start gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted">
        <Info className="mt-0.5 size-4.5 shrink-0 text-gold-600" aria-hidden />
        <span>
          Roles are fixed templates, so every access rule lives in one place. Give people roles from <b className="text-ink">Users</b>. To change what a
          role can open, ask the developers. The menu shows only what the active role may open, and direct links to anything else show “No access”.
        </span>
      </motion.p>

      <div className="grid gap-4 lg:grid-cols-2">
        {ROLES.map((r) => {
          const people = holders(r);
          const sensitive = SENSITIVE_ROLES.includes(r);
          return (
            <motion.article
              key={r}
              variants={fadeUp}
              className={cn("rounded-3xl border bg-white p-5 shadow-card", sensitive ? "border-maroon-200" : "border-white")}
            >
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-maroon-900">
                    {ROLE_LABEL[r]}
                    {sensitive ? <Chip tone="maroon" icon={<KeyRound className="size-3" aria-hidden />}>Full control</Chip> : null}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">{ROLE_SUMMARY[r]}</p>
                </div>
                <Chip tone={people?.length ? "gold" : "neutral"} className="shrink-0">
                  {people === null ? "…" : `${people.length} ${people.length === 1 ? "person" : "people"}`}
                </Chip>
              </header>
              <dl className="mt-4 space-y-2">
                {grouped(ROLE_PERMISSIONS[r]).map((g) => (
                  <div key={g.area} className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
                    <dt className="pt-1 text-[11px] font-extrabold tracking-[0.12em] text-gold-600 uppercase">{g.area}</dt>
                    <dd className="flex flex-wrap gap-1">
                      {g.labels.map((l) => (
                        <Chip key={l}>{l}</Chip>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
              {people?.length ? (
                <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                  <span className="font-bold text-ink">Held by:</span> {people.map((p) => p.fullName).join(", ")}
                </p>
              ) : null}
            </motion.article>
          );
        })}
      </div>
    </motion.div>
  );
}
