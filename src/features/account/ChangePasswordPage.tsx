import { ArrowLeft, Check, Circle, KeyRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { useAuth, useConfirmedSignOut } from "@/features/auth/auth";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { EASE_OUT } from "@/lib/motion";
import { PASSWORD_RULES, checkPassword, type RuleKey } from "@/lib/password-policy";
import { landingPath } from "@/lib/permissions";

/**
 * TKP Connect UI-S2 · Choose your own password.
 * Reached automatically after signing in with a temporary password (API-A7),
 * or from Change password in the sidebar. On success every session ends
 * (API-A6) and the person signs in again with the new password.
 */
export function ChangePasswordPage() {
  const { member, activeRole, endSession } = useAuth();
  const signOut = useConfirmedSignOut();
  const forced = !!member?.mustChangePassword;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverFailed, setServerFailed] = useState<RuleKey[]>([]);
  const [saving, setSaving] = useState(false);

  const ids = { current: useId(), next: useId(), confirm: useId(), rules: useId() };
  const type = show ? "text" : "password";
  const backTo = activeRole ? landingPath(activeRole) : "/";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Same checks and wording as TKP Connect's itg-password.js.
    if (!current) return setError("Enter your current password.");
    const { failed } = checkPassword(next);
    if (failed.length) return setError(`The new password still needs: ${failed.map((f) => f.label.toLowerCase()).join("; ")}.`);
    if (next !== confirm) return setError("The two new passwords do not match.");

    setSaving(true);
    try {
      await api.auth.changePassword(current, next);
      // Every session has ended on the server (API-A6). The guard sends us to
      // Sign in with the "Password changed" notice.
      endSession("password-changed");
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError) {
        const failedRules = (err.details.failed as { key: RuleKey }[] | undefined)?.map((f) => f.key) ?? [];
        setServerFailed(failedRules);
        setError(err.message);
      } else {
        setError("Could not change your password. Please try again.");
      }
    }
  };

  const matches = confirm.length > 0 && confirm === next;

  return (
    <div className="grain relative isolate min-h-svh bg-sanctuary px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          {forced ? null : (
            <Link
              to={backTo}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-cream-100/80 hover:bg-white/10 hover:text-cream-50"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back
            </Link>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="rounded-[28px] border border-white/60 bg-cream-100 p-6 shadow-panel sm:p-9"
        >
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-gold-100 text-gold-800" aria-hidden>
            <KeyRound className="size-5.5" />
          </span>
          <h1 className="font-display text-[28px] leading-tight font-semibold text-maroon-900 sm:text-[32px]">Choose your own password</h1>
          <p className="mt-1.5 text-[15px] text-muted">
            {forced
              ? "You signed in with a temporary password. Choose one only you know before you continue."
              : "Change the password you use to sign in to TKP Hub."}
          </p>

          <AnimatePresence initial={false}>
            {error ? (
              <motion.p
                key={error}
                role="alert"
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 20 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            <PasswordField
              id={ids.current}
              label={forced ? "Current (temporary) password" : "Current password"}
              value={current}
              onChange={setCurrent}
              type={type}
              autoComplete="current-password"
            />
            <div>
              <PasswordField
                id={ids.next}
                label="New password"
                value={next}
                onChange={(v) => {
                  setNext(v);
                  setServerFailed([]);
                }}
                type={type}
                autoComplete="new-password"
                describedBy={ids.rules}
              />
              <ul id={ids.rules} aria-live="polite" className="mt-3 grid gap-1.5 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2">
                {PASSWORD_RULES.map((r) => {
                  const ok = next.length > 0 && r.test(next) && !serverFailed.includes(r.key);
                  return (
                    <li key={r.key} className={cn("flex items-start gap-2 text-[13px] font-semibold transition-colors", ok ? "text-ok" : "text-muted")}>
                      <span className="relative mt-px grid size-4 shrink-0 place-items-center">
                        <AnimatePresence initial={false} mode="popLayout">
                          {ok ? (
                            <motion.span
                              key="ok"
                              initial={{ scale: 0.3, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.3, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 600, damping: 28 }}
                              className="grid size-4 place-items-center rounded-full bg-ok text-white"
                            >
                              <Check className="size-2.5" strokeWidth={4} aria-hidden />
                            </motion.span>
                          ) : (
                            <motion.span key="todo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                              <Circle className="size-4" aria-hidden />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      <span>
                        <span className="sr-only">{ok ? "Done: " : "Still needed: "}</span>
                        {r.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <PasswordField
                id={ids.confirm}
                label="Type the new password again"
                value={confirm}
                onChange={setConfirm}
                type={type}
                autoComplete="new-password"
              />
              {confirm ? (
                <p className={cn("mt-1.5 text-xs font-bold", matches ? "text-ok" : "text-crit")}>
                  {matches ? "✓ The two passwords match" : "The two passwords do not match yet"}
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-muted">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-4 accent-maroon-700" />
              Show passwords
            </label>

            <Button type="submit" variant="gold" size="lg" loading={saving} className="w-full">
              {saving ? "Saving…" : "Save new password"}
            </Button>
          </form>

          <p className="mt-5 text-sm text-muted">
            After saving you will be signed out and asked to sign in with the new password.{" "}
            <button type="button" onClick={() => void signOut()} className="font-bold text-maroon-700 underline-offset-4 hover:underline">
              Sign out instead
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  type,
  autoComplete,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete: string;
  describedBy?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        className="h-12 w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink transition-[border-color,box-shadow] outline-none focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10"
      />
    </div>
  );
}
