import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { CrownBackdrop } from "@/components/three/CrownBackdrop";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { ApiError, api, type MfaChallenge } from "@/lib/api";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { EASE_OUT } from "@/lib/motion";
import { landingPath } from "@/lib/permissions";
import { safeNext, useAuth } from "./auth";
import { DemoAccounts } from "./DemoAccounts";
import { MfaStep } from "./MfaStep";
import type { Member } from "@/lib/types";

/** TKP Connect UI-S1, in the TKP Hub look. */
const schema = z.object({
  email: z.email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

const JOURNEY = ["Welcome", "Connect", "Belong", "Grow", "Care", "Serve", "Lead", "Go", "Transform"];

const intro: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE_OUT } },
};

export function SignInPage() {
  const { status, activeRole } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  // After a password change the session is being ended: stay here and show the notice.
  const changed = params.get("changed") === "1";
  const idle = params.get("idle") === "1";
  if (status === "signed-in" && activeRole && !changed) return <Navigate to={next ?? landingPath(activeRole)} replace />;

  return (
    <div className="grain relative isolate min-h-svh overflow-hidden bg-sanctuary text-cream-100">
      <div className="mx-auto grid min-h-svh max-w-7xl lg:grid-cols-[1.1fr_1fr]">
        {/* Brand side */}
        <section className="relative flex flex-col px-6 pt-6 sm:px-10 lg:min-h-svh lg:pt-10 lg:pb-12">
          <Logo />
          <div className="relative mt-4 h-[34svh] min-h-60 lg:mt-0 lg:h-auto lg:flex-1">
            <CrownBackdrop />
          </div>
          <motion.div variants={intro} initial="hidden" animate="show" className="relative z-10 hidden lg:block">
            <motion.p variants={rise} className="text-xs font-extrabold tracking-[0.24em] text-gold-300/80 uppercase">
              RCCG The King's Palace · Katy, Texas
            </motion.p>
            <motion.h1 variants={rise} className="mt-3 font-display text-[56px] leading-[1.02] font-semibold tracking-tight">
              From first visit <span className="text-gold-shimmer italic">to family.</span>
            </motion.h1>
            <motion.ol variants={rise} className="mt-6 flex flex-wrap gap-x-2 gap-y-1 text-[13px] font-bold text-cream-100/60">
              {JOURNEY.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span className={cn(i < 2 && "text-gold-300")}>{step}</span>
                  {i < JOURNEY.length - 1 ? <span aria-hidden className="text-cream-100/25">·</span> : null}
                </li>
              ))}
            </motion.ol>
            <motion.blockquote variants={rise} className="mt-8 max-w-md border-l-2 border-gold-500/60 pl-4">
              <p className="font-display text-lg text-cream-100/90 italic">
                “I was glad when they said to me, Let us go into the house of the Lord.”
              </p>
              <footer className="mt-1 text-sm font-semibold text-gold-300/80">Psalm 122:1</footer>
            </motion.blockquote>
          </motion.div>
        </section>

        {/* Form side */}
        <section className="relative z-10 flex min-w-0 items-start justify-center px-4 pb-10 sm:px-8 lg:items-center lg:py-12">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 }}
            className="w-full max-w-110 min-w-0 rounded-[28px] border border-white/60 bg-cream-100 p-6 text-ink shadow-panel sm:p-9"
          >
            <SignInCard next={next} changed={changed} idle={idle} />
          </motion.div>
        </section>
      </div>
      <p className="relative z-10 px-6 pb-6 text-center font-display text-sm text-cream-100/70 italic lg:hidden">
        “I was glad when they said to me, Let us go into the house of the Lord.” · Psalm 122:1
      </p>
    </div>
  );
}

function SignInCard({ next, changed, idle }: { next: string | null; changed: boolean; idle: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "forgot" | "mfa">("sign-in");
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const navigate = useNavigate();
  const land = (member: Member) => {
    const role = member.roles[0];
    navigate(next ?? (role ? landingPath(role) : "/no-access"), { replace: true });
  };
  return (
    <AnimatePresence mode="wait" initial={false}>
      {mode === "sign-in" ? (
        <motion.div key="sign-in" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
          <SignInForm
            changed={changed}
            idle={idle}
            onForgot={() => setMode("forgot")}
            onSignedIn={land}
            onMfa={(c) => {
              setChallenge(c);
              setMode("mfa");
            }}
          />
        </motion.div>
      ) : mode === "mfa" && challenge ? (
        <motion.div key="mfa" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
          <MfaStep challenge={challenge} onDone={land} onBack={() => setMode("sign-in")} />
        </motion.div>
      ) : (
        <motion.div key="forgot" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
          <ForgotPanel onBack={() => setMode("sign-in")} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SignInForm({
  changed,
  idle,
  onForgot,
  onSignedIn,
  onMfa,
}: {
  changed: boolean;
  idle: boolean;
  onForgot: () => void;
  onSignedIn: (member: Member) => void;
  onMfa: (challenge: MfaChallenge) => void;
}) {
  const { signIn } = useAuth();
  const settings = useQuery({ queryKey: ["settings", "public"], queryFn: api.settings.public, staleTime: 60_000, enabled: idle });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      const step = await signIn(email, password);
      if (step.kind === "mfa") onMfa(step.challenge);
      else onSignedIn(step.member);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Invalid email or password");
    }
  });

  return (
    <>
      <h2 className="font-display text-[32px] leading-tight font-semibold text-maroon-900">Welcome back</h2>
      <p className="mt-1.5 text-[15px] text-muted">Sign in with the email address the team lead added for you.</p>

      {changed && !error ? (
        <p role="status" className="mt-5 flex items-center gap-2 rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm font-bold text-ok">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Password changed. Please sign in with your new password.
        </p>
      ) : null}
      {idle && !changed && !error ? (
        <p role="status" className="mt-5 flex items-center gap-2 rounded-xl border border-gold-300 bg-gold-100 px-4 py-3 text-sm font-bold text-gold-800">
          <LockKeyhole className="size-4 shrink-0" aria-hidden />
          You were signed out after {settings.data?.idleMinutes ?? "some"} minutes without activity, to keep guest details safe.
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            role="alert"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 20, x: [0, -6, 6, -3, 0] }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Field label="Email address" htmlFor="email" error={errors.email?.message}>
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            className={inputClass(!!errors.email)}
            {...register("email")}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={!!errors.password}
            className={cn(inputClass(!!errors.password), "pr-12")}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-cream-200 hover:text-maroon-700"
          >
            {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </button>
        </Field>

        <Button type="submit" variant="gold" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Sign in
        </Button>
        <p className="text-center">
          <button type="button" onClick={onForgot} className="text-sm font-bold text-maroon-700 underline-offset-4 hover:underline">
            Forgot password?
          </button>
        </p>
      </form>

      {env.useMocks ? (
        <DemoAccounts
          onPick={(email, password) => {
            setValue("email", email, { shouldValidate: true });
            setValue("password", password, { shouldValidate: true });
          }}
        />
      ) : null}

      <p className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-px size-4 shrink-0 text-gold-600" aria-hidden />
        Guest details are confidential. Use TKP Hub only for your church work.
      </p>
    </>
  );
}

function ForgotPanel({ onBack }: { onBack: () => void }) {
  const settings = useQuery({ queryKey: ["settings", "public"], queryFn: api.settings.public, staleTime: Infinity });
  const contact = settings.data?.resetContact;
  const relay = settings.data?.resetRelay;
  return (
    <>
      <h2 className="font-display text-[32px] leading-tight font-semibold text-maroon-900">Forgot your password?</h2>
      <div className="mt-5 rounded-2xl border border-line bg-white p-5 text-[15px] leading-relaxed">
        {settings.isPending ? (
          <span className="skeleton block h-5 w-3/4 rounded-md" aria-hidden />
        ) : (
          <>
            Ask <b className="text-maroon-800">{contact ?? "the Tech Admin"}</b> to reset it for you.
            {relay ? (
              <>
                {" "}
                If you cannot reach them, <b className="text-maroon-800">{relay}</b> will pass the message on.
              </>
            ) : null}
          </>
        )}
        <p className="mt-3 text-muted">You will be given a one-time password, and you will choose your own the next time you sign in.</p>
      </div>
      <Button variant="ghost" size="lg" onClick={onBack} icon={<ArrowLeft className="size-4" />} className="mt-5 w-full">
        Back to sign in
      </Button>
    </>
  );
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold text-ink">
        {label}
      </label>
      <div className="relative">{children}</div>
      {error ? <p className="mt-1.5 text-xs font-bold text-crit">{error}</p> : null}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  cn(
    "h-12 w-full rounded-xl border bg-white pr-4 pl-10.5 text-[15px] text-ink transition-[border-color,box-shadow] outline-none placeholder:text-muted/60",
    "focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10",
    invalid ? "border-crit" : "border-line",
  );
