import { ArrowLeft, FlaskConical, MailCheck, RotateCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, api, type MfaChallenge } from "@/lib/api";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import type { Member } from "@/lib/types";
import { mockInbox } from "@/mocks/inbox";
import { useAuth } from "./auth";

/**
 * Second sign-in step for staff (PRD §2 rule 6, A-2, F-12): the 6-digit code
 * emailed after the password. Six digits submit on their own; paste works.
 */
const DEAD_ENDS = new Set(["MFA_EXPIRED", "MFA_LOCKED", "TOO_MANY_CODES"]);

export function MfaStep({
  challenge: initial,
  onDone,
  onBack,
}: {
  challenge: MfaChallenge;
  onDone: (member: Member) => void;
  onBack: () => void;
}) {
  const { verifyMfa } = useAuth();
  const [challenge, setChallenge] = useState(initial);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string; deadEnd: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const waitFor = useCountdown(challenge.resendAt);

  useEffect(() => input.current?.focus(), []);

  const submit = async (value: string) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      onDone(await verifyMfa(challenge.ticket, value, remember));
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError({
        message: err?.message ?? "Something went wrong. Please try again.",
        hint: err?.fields?.code?.[0],
        deadEnd: !!err && DEAD_ENDS.has(err.code),
      });
      setCode("");
      setBusy(false);
      window.setTimeout(() => input.current?.focus(), 0);
    }
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    try {
      const next = await api.auth.resendMfa(challenge.ticket);
      setChallenge(next);
      setCode("");
      setNotice(`New code sent to ${next.sentTo}.`);
      input.current?.focus();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError({ message: err?.message ?? "Could not send a new code.", deadEnd: !!err && DEAD_ENDS.has(err.code) });
    }
  };

  const dead = !!error?.deadEnd;

  return (
    <>
      <span className="grid size-12 place-items-center rounded-2xl bg-gold-100 text-gold-800" aria-hidden>
        <MailCheck className="size-6" />
      </span>
      <h2 className="mt-4 font-display text-[32px] leading-tight font-semibold text-maroon-900">Check your email</h2>
      <p className="mt-1.5 text-[15px] text-muted">
        We sent a 6-digit code to <b className="text-ink">{challenge.sentTo}</b>. It works for 10 minutes.
      </p>

      <AnimatePresence initial={false} mode="popLayout">
        {error ? (
          <motion.div
            key="error"
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-5 rounded-xl border border-crit/20 bg-crit-soft px-4 py-3 text-sm font-bold text-crit"
          >
            {error.message}
            {error.hint ? <span className="block text-xs font-semibold">{error.hint}</span> : null}
          </motion.div>
        ) : notice ? (
          <motion.p key="notice" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5 rounded-xl border border-ok/20 bg-ok-soft px-4 py-3 text-sm font-bold text-ok">
            {notice}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <form
        className="mt-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <label htmlFor="mfa-code" className="mb-1.5 block text-sm font-bold text-ink">
          6-digit code
        </label>
        <input
          ref={input}
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          disabled={dead || busy}
          value={code}
          aria-invalid={!!error && !dead}
          aria-describedby="mfa-help"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) void submit(v);
          }}
          placeholder="••••••"
          className={cn(
            "h-14 w-full rounded-xl border bg-white text-center font-display text-[28px] font-semibold tracking-[0.5em] text-maroon-900 tabular outline-none placeholder:text-muted/40",
            "focus:border-maroon-600 focus:ring-4 focus:ring-maroon-600/10 disabled:bg-cream-200",
            error && !dead ? "border-crit" : "border-line",
          )}
        />
        <p id="mfa-help" className="mt-1.5 text-xs text-muted">
          No email? Check spam, or ask for a new code.
        </p>

        {!dead ? (
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 size-4.5 shrink-0 accent-maroon-700" />
            <span>
              <span className="block text-sm font-bold text-ink">Remember this device for 30 days</span>
              <span className="block text-xs text-muted">You won't need a code here until then. Untick it on a shared or public computer.</span>
            </span>
          </label>
        ) : null}

        {dead ? (
          <Button variant="gold" size="lg" onClick={onBack} icon={<ArrowLeft className="size-4" />} className="mt-5 w-full">
            Back to sign in
          </Button>
        ) : (
          <>
            <Button type="submit" variant="gold" size="lg" loading={busy} disabled={code.length !== 6} disabledReason="Enter all 6 digits" className="mt-5 w-full">
              Verify and sign in
            </Button>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-maroon-700">
                <ArrowLeft className="size-4" aria-hidden />
                Use a different account
              </button>
              <button
                type="button"
                onClick={() => void resend()}
                disabled={waitFor > 0}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-maroon-700 underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
              >
                <RotateCw className="size-4" aria-hidden />
                {waitFor > 0 ? `Send a new code in ${waitFor}s` : "Send a new code"}
              </button>
            </div>
          </>
        )}
      </form>

      {env.useMocks && !dead ? (
        <DemoInbox
          onFill={(c) => {
            setCode(c);
            void submit(c);
          }}
        />
      ) : null}
    </>
  );
}

/** Seconds until an ISO time, ticking. */
const secondsUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

function useCountdown(iso: string) {
  const [left, setLeft] = useState(() => secondsUntil(iso));
  useEffect(() => {
    setLeft(secondsUntil(iso));
    const t = window.setInterval(() => setLeft(secondsUntil(iso)), 1000);
    return () => window.clearInterval(t);
  }, [iso]);
  return left;
}

/** Mock mode only: shows the code the mock server "emailed". Never against the real API. */
function DemoInbox({ onFill }: { onFill: (code: string) => void }) {
  const last = useSyncExternalStore(mockInbox.subscribe, mockInbox.get);
  if (!last) return null;
  return (
    <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-gold-400 bg-gold-100/50 px-4 py-3">
      <span className="min-w-0 text-[13px] text-gold-800">
        <span className="flex items-center gap-1.5 font-extrabold">
          <FlaskConical className="size-4" aria-hidden />
          Demo inbox (mock data)
        </span>
        <span className="block break-all">
          Code for {last.email}: <code className="font-bold tracking-widest">{last.code}</code>
        </span>
      </span>
      <Button size="sm" variant="ghost" onClick={() => onFill(last.code)}>
        Fill in
      </Button>
    </div>
  );
}
