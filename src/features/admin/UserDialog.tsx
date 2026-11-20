import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CONNECT_POLICY, NO_FOLLOW_UP_TEAM, ROLES, ROLE_LABEL, ROLE_SUMMARY, SENSITIVE_ROLES, type ConnectTeam, type Role } from "@/lib/permissions";
import { Field, Initials, inputClass, selectClass, TEAM_NAME } from "./parts";
import { useCreateUser, useUpdateUser } from "./queries";
import type { AdminUser, TempPasswordResponse } from "./types";

/**
 * Add or change a person (PRD SA-1). Accounts are created by the Tech Admin;
 * there is no self sign-up. A new person gets a one-time password (API-A7).
 */
const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter their full name").max(120, "That name is too long"),
    email: z.email("Enter a valid email address"),
    phone: z.string().trim().max(30, "That number is too long"),
    roles: z.array(z.enum(ROLES)).min(1, "Choose at least one role"),
    connectTeam: z.enum(["", "church_office", "integration", "both"]),
  })
  .refine((v) => !(v.roles.includes("tkp_member") && v.roles.length > 1), {
    path: ["roles"],
    message: "TKP Member cannot be combined with staff roles",
  });
type Values = z.infer<typeof schema>;

const CONNECT_ROLES = ROLES.slice(0, 11);
const OTHER_ROLES = ROLES.slice(11);
/** Roles whose Connect pages need a follow-up team (AC-04). */
const needsTeam = (roles: Role[]) => roles.some((r) => CONNECT_POLICY[r] && CONNECT_POLICY[r]!.scope !== "all");

export function UserDialog({
  open,
  user,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** null = add a new person. */
  user: AdminUser | null;
  onClose: () => void;
  onCreated: (r: TempPasswordResponse) => void;
}) {
  const create = useCreateUser();
  const update = useUpdateUser();
  const confirm = useConfirm();
  const [banner, setBanner] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", phone: "", roles: [], connectTeam: "" },
  });

  useEffect(() => {
    if (!open) return;
    setBanner(null);
    reset({
      fullName: user?.fullName ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      roles: user?.roles ?? [],
      connectTeam: user?.connectTeam ?? "",
    });
  }, [open, user, reset]);

  const roles = watch("roles") ?? [];
  const team = watch("connectTeam");

  const onSubmit = handleSubmit(async (v) => {
    setBanner(null);
    const body = { fullName: v.fullName, email: v.email, phone: v.phone || null, roles: v.roles, connectTeam: (v.connectTeam || null) as ConnectTeam | null };
    const granting = v.roles.filter((r) => SENSITIVE_ROLES.includes(r) && !user?.roles.includes(r));
    if (granting.length) {
      const ok = await confirm({
        title: `Give ${v.fullName} full control?`,
        body: `${granting.map((r) => ROLE_LABEL[r]).join(", ")} can add and deactivate users, reset passwords, change settings and read the audit log. Only give this to people who look after TKP Hub.`,
        confirmLabel: `Make ${ROLE_LABEL[granting[0]!]}`,
        destructive: false,
      });
      if (!ok) return;
    }
    try {
      if (user) {
        await update.mutateAsync({ id: user.id, body: { ...body, rowVer: user.rowVer } });
        onClose();
      } else {
        onCreated(await create.mutateAsync(body));
      }
    } catch (e) {
      if (!(e instanceof ApiError)) return setBanner("Something went wrong. Please try again.");
      let mapped = false;
      for (const [k, msgs] of Object.entries(e.fields ?? {})) {
        if (k in schema.shape || k === "roles") {
          setError(k as keyof Values, { message: msgs[0] });
          mapped = true;
        }
      }
      if (!mapped) setBanner(e.message);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      subtitle={user ? "Change user" : "Add user"}
      title={user ? user.fullName : "New person"}
      leading={user ? <Initials name={user.fullName} /> : undefined}
      className="max-w-3xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={isSubmitting}>
            {user ? "Save changes" : "Add user"}
          </Button>
        </div>
      }
    >
      <form id="user-form" onSubmit={onSubmit} noValidate className="space-y-5">
        {banner ? (
          <p role="alert" className="rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit">
            {banner}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="u-name" error={errors.fullName?.message}>
            <input id="u-name" data-autofocus autoComplete="off" className={inputClass(!!errors.fullName)} {...register("fullName")} />
          </Field>
          <Field label="Email address" htmlFor="u-email" error={errors.email?.message} hint="They sign in with this.">
            <input id="u-email" type="email" autoComplete="off" className={inputClass(!!errors.email)} {...register("email")} />
          </Field>
          <Field label={<>Phone <span className="font-semibold text-muted">(optional)</span></>} htmlFor="u-phone" error={errors.phone?.message}>
            <input id="u-phone" type="tel" autoComplete="off" className={inputClass(!!errors.phone)} {...register("phone")} />
          </Field>
          <Field
            label="Follow-up team"
            htmlFor="u-team"
            error={errors.connectTeam?.message}
            hint={needsTeam(roles) && !team ? <span className="font-bold text-warn">Without a team they will see: “{NO_FOLLOW_UP_TEAM}”</span> : "Which Connect queue they work in."}
          >
            <select id="u-team" className={selectClass(!!team)} {...register("connectTeam")}>
              <option value="">None</option>
              {(Object.keys(TEAM_NAME) as ConnectTeam[]).map((t) => (
                <option key={t} value={t}>
                  {TEAM_NAME[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Controller
          control={control}
          name="roles"
          render={({ field }) => {
            const value = field.value ?? [];
            const toggle = (r: Role) => field.onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
            return (
              <fieldset aria-describedby={errors.roles ? "roles-error" : undefined}>
                <legend className="text-sm font-bold text-ink">Roles</legend>
                <p className="text-xs text-muted">A person with several roles picks which one to act as from the sidebar.</p>
                {errors.roles ? (
                  <p id="roles-error" role="alert" className="mt-1.5 text-xs font-bold text-crit">
                    {errors.roles.message}
                  </p>
                ) : null}
                {[
                  { title: "TKP Connect roles", list: CONNECT_ROLES },
                  { title: "Other modules", list: OTHER_ROLES },
                ].map((g) => (
                  <div key={g.title} className="mt-3">
                    <p className="mb-2 text-[11px] font-extrabold tracking-[0.14em] text-gold-600 uppercase">{g.title}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.list.map((r) => {
                        const on = value.includes(r);
                        return (
                          <label
                            key={r}
                            className={cn(
                              "flex items-start gap-3 rounded-2xl border p-3 transition-colors",
                              on ? "border-maroon-600 bg-maroon-100/40" : "border-line bg-white hover:border-maroon-200",
                            )}
                          >
                            <input type="checkbox" checked={on} onChange={() => toggle(r)} className="mt-0.5 size-4.5 shrink-0 accent-maroon-700" />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                                {ROLE_LABEL[r]}
                                {SENSITIVE_ROLES.includes(r) ? <KeyRound className="size-3.5 text-maroon-600" aria-label="Full control" /> : null}
                              </span>
                              <span className="block text-xs text-muted">{ROLE_SUMMARY[r]}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>
            );
          }}
        />

        {!user ? (
          <p className="flex items-start gap-2 rounded-xl bg-cream-200 px-4 py-3 text-xs text-muted">
            <KeyRound className="mt-px size-4 shrink-0 text-gold-600" aria-hidden />
            TKP Hub will make a one-time password for them. You will see it once, on the next screen. They choose their own the first time they sign in.
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

/** Shows a temporary password once, after Add user or Reset password. */
export function TempPasswordDialog({ result, reason, onClose }: { result: TempPasswordResponse | null; reason: "created" | "reset"; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [result]);
  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog
      open={!!result}
      onClose={onClose}
      subtitle={reason === "created" ? "User added" : "Password reset"}
      title={result ? `One-time password for ${result.user.fullName}` : ""}
      className="max-w-lg"
      footer={
        <div className="flex justify-end">
          <Button data-autofocus onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-gold-300 bg-white p-4">
            <code className="min-w-0 flex-1 truncate font-mono text-xl font-bold tracking-wide text-maroon-900" aria-label="Temporary password">
              {result.temporaryPassword}
            </code>
            <Button size="sm" variant={copied ? "subtle" : "ghost"} onClick={() => void copy()} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              Give it to {result.user.fullName.split(" ")[0]} in person or by phone, never by group chat. They sign in with{" "}
              <b className="text-ink">{result.user.email}</b>.
            </li>
            <li>It works once: they choose their own password straight after signing in.</li>
            {reason === "reset" ? <li>Their old password no longer works, and they have been signed out everywhere.</li> : null}
          </ul>
          <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-xs font-bold text-warn">
            <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
            This is the only time TKP Hub shows this password. If it is lost, reset it again.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
