import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const CrownScene = lazy(() => import("./CrownScene"));

function canUse3D() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * 3D crown when the device can handle it; a warm CSS glow otherwise.
 * Stops rendering when off-screen.
 */
export function CrownBackdrop({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ use3D, compact }] = useState(() => ({
    use3D: canUse3D(),
    compact: window.matchMedia("(max-width: 1023px)").matches || (navigator.hardwareConcurrency ?? 8) <= 4,
  }));
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!use3D) return;
    const t = window.setTimeout(() => setReady(true), 150);
    return () => window.clearTimeout(t);
  }, [use3D]);

  return (
    <div ref={ref} className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      <div className="absolute top-1/2 left-1/2 size-[60vmin] -translate-1/2 rounded-full bg-gold-500/20 blur-[90px]" />
      {use3D ? (
        <div className={cn("absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}>
          <Suspense fallback={null}>
            <CrownScene active={visible} compact={compact} />
          </Suspense>
        </div>
      ) : (
        <div className="absolute top-1/2 left-1/2 size-[36vmin] -translate-1/2 animate-float-slow rounded-full border border-gold-400/30">
          <div className="absolute inset-6 rounded-full border border-gold-400/20" />
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(212_175_55/0.35),transparent_65%)]" />
        </div>
      )}
    </div>
  );
}
