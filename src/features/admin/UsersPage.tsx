import { KeyRound, LogOut, Pencil, Search, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/auth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stagger } from "@/lib/motion";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/permissions";
import { formatStamp } from "@/lib/time";
import { IconAction, Initials, Pager, RoleChips, STATUS, StatusChip, TEAM_NAME, selectClass } from "./parts";
import { useResetPassword, useSetActive, useSignOutEverywhere, useUsers } from "./queries";
import { TempPasswordDialog, UserDialog } from "./UserDialog";
import type { AdminUser, TempPasswordResponse, UserStatus } from "./types";

/**
 * Admin › Users (PRD SA-1, SA-3). The Tech Admin adds people, changes their
 * roles and follow-up team, deactivates them and resets passwords. Every
 * change is audited with old and new values.
 */
const PAGE_SIZE = 25;
type StatusFilter = UserStatus | "all";

export function UsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const users = useUsers({ q, role, status, page, pageSize: PAGE_SIZE });
  const d = users.data;

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [temp, setTemp] = useState<{ result: TempPasswordResponse; reason: "created" | "reset" } | null>(null);
  const actions = useUserActions((result) => setTemp({ result, reason: "reset" }));

  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        tagline="Accounts are added here by the Tech Admin. There is no self sign-up."
        actions={
          <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
            Add user
          </Button>
        }
      />

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
          <label className="relative block">
            <span className="sr-only">Search by name or email</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => filter(() => setQ(e.target.value))}
              placeholder="Search by name or email"
              className="h-11 w-full rounded-xl border border-line bg-white pr-4 pl-10.5 text-sm outline-none focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10"
            />
          </label>
          <label className="block">
            <span className="sr-only">Role</span>
            <select value={role} onChange={(e) => filter(() => setRole(e.target.value as Role | ""))} className={selectClass(!!role)}>
              <option value="">Every role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Status">
          {(["all", "active", "temporary", "deactivated"] as StatusFilter[]).map((s) => {
            const count = d ? (s === "all" ? d.counts.active + d.counts.temporary + d.counts.deactivated : d.counts[s]) : null;
            const on = status === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => filter(() => setStatus(s))}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-bold transition-colors",
                  on ? "border-maroon-700 bg-maroon-700 text-cream-50" : "border-line bg-white text-ink hover:border-maroon-200",
                )}
              >
                {s === "all" ? "Everyone" : STATUS[s].label}
                {count !== null ? <span className={cn("rounded-full px-1.5 text-xs tabular", on ? "bg-white/20" : "bg-cream-200 text-muted")}>{count}</span> : null}
              </button>
            );
          })}
        </div>
      </Card>

      {users.isError ? <ErrorBanner>{users.error.message}</ErrorBanner> : null}

      <Card className="p-0 sm:p-0">
        {!d ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : d.items.length ? (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left text-sm lg:table">
              <thead className="border-b border-line text-xs whitespace-nowrap text-muted">
                <tr>
                  <th className="py-3 pr-3 pl-6 font-bold">Person</th>
                  <th className="px-3 py-3 font-bold">Roles</th>
                  <th className="px-3 py-3 font-bold">Follow-up team</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Last sign-in</th>
                  <th className="py-3 pr-6 pl-3 text-right font-bold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <motion.tbody variants={stagger(0.02)} initial="hidden" animate="show">
                <AnimatePresence initial={false}>
                  {d.items.map((u) => (
                    <motion.tr
                      key={u.id}
                      layout
                      variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                      className={cn("border-b border-line last:border-0 hover:bg-cream-50", u.status === "deactivated" && "text-muted")}
                    >
                      <td className="py-3 pr-3 pl-6">
                        <span className="flex items-center gap-3">
                          <Initials name={u.fullName} muted={u.status === "deactivated"} />
                          <span className="min-w-0">
                            <span className="block font-bold text-ink">{u.fullName}</span>
                            <span className="block truncate text-xs text-muted">{u.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <RoleChips roles={u.roles} />
                      </td>
                      <td className="px-3 py-3 font-semibold">{u.connectTeam ? TEAM_NAME[u.connectTeam] : <span className="text-muted">None</span>}</td>
                      <td className="px-3 py-3">
                        <StatusChip status={u.status} />
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-muted tabular">{u.lastSignInAt ? formatStamp(u.lastSignInAt) : "Never"}</td>
                      <td className="py-3 pr-6 pl-3">
                        <RowActions u={u} onEdit={() => setEditing(u)} actions={actions} />
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </motion.tbody>
            </table>

            {/* Phone and tablet cards */}
            <ul className="divide-y divide-line lg:hidden">
              {d.items.map((u) => (
                <li key={u.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Initials name={u.fullName} muted={u.status === "deactivated"} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink">{u.fullName}</p>
                      <p className="truncate text-xs text-muted">{u.email}</p>
                    </div>
                    <StatusChip status={u.status} />
                  </div>
                  <RoleChips roles={u.roles} />
                  <p className="text-xs text-muted">
                    {u.connectTeam ? TEAM_NAME[u.connectTeam] : "No follow-up team"} · Last sign-in {u.lastSignInAt ? formatStamp(u.lastSignInAt) : "never"}
                  </p>
                  <RowActions u={u} onEdit={() => setEditing(u)} actions={actions} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState icon={<Users />} title="Nobody matches">
            Try another name, role or status.
          </EmptyState>
        )}
      </Card>
      {d ? <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} /> : null}

      <UserDialog
        open={adding || !!editing}
        user={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onCreated={(result) => {
          setAdding(false);
          setTemp({ result, reason: "created" });
        }}
      />
      <TempPasswordDialog result={temp?.result ?? null} reason={temp?.reason ?? "created"} onClose={() => setTemp(null)} />
    </motion.div>
  );
}

/* ----------------------------------------------------------------- row actions */

type Actions = ReturnType<typeof useUserActions>;

/** Each dangerous action asks first, in plain words (standing UI rule). */
function useUserActions(onReset: (r: TempPasswordResponse) => void) {
  const confirm = useConfirm();
  const toast = useToast();
  const setActive = useSetActive();
  const reset = useResetPassword();
  const signOut = useSignOutEverywhere();
  const fail = (e: unknown) => toast.show(e instanceof ApiError ? e.message : "Something went wrong. Please try again.", { tone: "crit", ms: 6000 });

  return {
    busy: setActive.isPending || reset.isPending || signOut.isPending,
    async deactivate(u: AdminUser) {
      const ok = await confirm({
        title: `Deactivate ${u.fullName}?`,
        body: (
          <>
            They are signed out straight away and cannot sign in until someone reactivates them. Their logs and guest assignments stay as they are, so
            reassign their guests in the work queue.
          </>
        ),
        confirmLabel: "Deactivate",
      });
      if (!ok) return;
      try {
        await setActive.mutateAsync({ id: u.id, active: false });
        toast.show(`${u.fullName} deactivated`);
      } catch (e) {
        fail(e);
      }
    },
    async reactivate(u: AdminUser) {
      try {
        await setActive.mutateAsync({ id: u.id, active: true });
        toast.show(`${u.fullName} can sign in again`);
      } catch (e) {
        fail(e);
      }
    },
    async resetPassword(u: AdminUser) {
      const ok = await confirm({
        title: `Reset ${u.fullName}'s password?`,
        body: "Their current password stops working at once and they are signed out everywhere. You will get a one-time password to give them.",
        confirmLabel: "Reset password",
      });
      if (!ok) return;
      try {
        onReset(await reset.mutateAsync(u.id));
      } catch (e) {
        fail(e);
      }
    },
    async signOutEverywhere(u: AdminUser) {
      const ok = await confirm({
        title: `Sign ${u.fullName} out everywhere?`,
        body: "Every browser and phone where they are signed in is signed out at its next step. Their password stays the same. Use this for a lost phone or a shared computer.",
        confirmLabel: "Sign out everywhere",
      });
      if (!ok) return;
      try {
        await signOut.mutateAsync(u.id);
        toast.show(`${u.fullName} signed out everywhere`);
      } catch (e) {
        fail(e);
      }
    },
  };
}

function RowActions({ u, onEdit, actions }: { u: AdminUser; onEdit: () => void; actions: Actions }) {
  const { member } = useAuth();
  const self = member?.id === u.id;
  const off = u.status === "deactivated";
  return (
    <span className="flex items-center justify-end gap-1">
      <IconAction label="Change" onClick={onEdit} icon={<Pencil />} />
      <IconAction
        label="Reset password"
        onClick={() => void actions.resetPassword(u)}
        icon={<KeyRound />}
        disabled={self || off || actions.busy}
        reason={self ? "Use Change password for your own account" : off ? "Reactivate them first" : undefined}
      />
      <IconAction
        label="Sign out everywhere"
        onClick={() => void actions.signOutEverywhere(u)}
        icon={<LogOut />}
        disabled={off || actions.busy}
        reason={off ? "Deactivated people are already signed out" : undefined}
      />
      {off ? (
        <IconAction label="Reactivate" onClick={() => void actions.reactivate(u)} icon={<UserCheck />} disabled={actions.busy} tone="ok" />
      ) : (
        <IconAction
          label="Deactivate"
          onClick={() => void actions.deactivate(u)}
          icon={<UserX />}
          disabled={self || actions.busy}
          reason={self ? "You cannot deactivate your own account" : undefined}
          tone="crit"
        />
      )}
    </span>
  );
}
