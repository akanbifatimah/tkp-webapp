import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useAuth } from "@/features/auth/auth";
import { api } from "@/lib/api";

/**
 * PRD 4.3: a short idle timeout for the admin console. The time comes from
 * Settings. One minute before the end, a warning lets the person stay; at the
 * end the session closes and Sign in brings them back to the same page.
 */
const WARN_MS = 60_000;
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function IdleGuard() {
  const { endSession } = useAuth();
  const settings = useQuery({ queryKey: ["settings", "public"], queryFn: api.settings.public, staleTime: 5 * 60_000 });
  const limitMs = (settings.data?.idleMinutes ?? 30) * 60_000;
  const last = useRef(Date.now());
  const [warnLeft, setWarnLeft] = useState<number | null>(null);

  const stay = useCallback(() => {
    last.current = Date.now();
    setWarnLeft(null);
  }, []);

  const end = useCallback(async () => {
    await api.auth.signOut().catch(() => undefined);
    endSession("idle");
  }, [endSession]);

  useEffect(() => {
    const touch = () => {
      // Activity counts only while no warning is showing: the warning asks on purpose.
      if (warnLeft === null) last.current = Date.now();
    };
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true });
    const t = window.setInterval(() => {
      const left = limitMs - (Date.now() - last.current);
      if (left <= 0) {
        window.clearInterval(t);
        void end();
      } else if (left <= WARN_MS) setWarnLeft(Math.ceil(left / 1000));
      else if (warnLeft !== null) setWarnLeft(null);
    }, 1000);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, touch);
      window.clearInterval(t);
    };
  }, [limitMs, warnLeft, end]);

  return (
    <Dialog
      open={warnLeft !== null}
      onClose={stay}
      title="Are you still there?"
      subtitle="Idle sign-out"
      className="max-w-md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => void end()}>
            Sign out now
          </Button>
          <Button data-autofocus onClick={stay}>
            Stay signed in
          </Button>
        </div>
      }
    >
      <p className="flex items-start gap-3 text-[15px] text-muted">
        <Clock className="mt-0.5 size-5 shrink-0 text-gold-600" aria-hidden />
        <span>
          To keep guest details safe, TKP Hub signs out after {settings.data?.idleMinutes ?? 30} minutes without activity. You will be signed out in{" "}
          <b className="text-maroon-800 tabular" aria-live="polite">
            {warnLeft ?? 0} seconds
          </b>
          . Anything you have not saved on this page will be lost.
        </span>
      </p>
    </Dialog>
  );
}
