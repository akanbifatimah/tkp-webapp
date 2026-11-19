import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Short confirmations at the bottom ("Log saved", "Log saved · journey closed").
 * Optional Undo for actions that allow it.
 */
type Tone = "ok" | "info" | "crit";
type ToastItem = { id: number; message: string; tone: Tone; undo?: () => void };
type ToastApi = { show: (message: string, opts?: { tone?: Tone; undo?: () => void; ms?: number }) => void };

const ToastContext = createContext<ToastApi | null>(null);

const ICON: Record<Tone, ReactNode> = {
  ok: <CheckCircle2 className="size-5 text-gold-400" aria-hidden />,
  info: <Info className="size-5 text-cream-200" aria-hidden />,
  crit: <TriangleAlert className="size-5 text-[#ff9b8f]" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (message, opts) => {
      const id = ++seq.current;
      setItems((all) => [...all.slice(-2), { id, message, tone: opts?.tone ?? "ok", undo: opts?.undo }]);
      window.setTimeout(() => dismiss(id), opts?.ms ?? (opts?.undo ? 6000 : 3500));
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-100 flex flex-col items-center gap-2 px-4" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 500, damping: 36 }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink py-3 pr-3 pl-4 text-sm font-semibold text-cream-50 shadow-panel",
                t.tone === "crit" && "bg-maroon-800",
              )}
              role="status"
            >
              {ICON[t.tone]}
              <span>{t.message}</span>
              {t.undo ? (
                <button
                  type="button"
                  onClick={() => {
                    t.undo?.();
                    dismiss(t.id);
                  }}
                  className="rounded-lg px-2.5 py-1 font-extrabold text-gold-300 hover:bg-white/10"
                >
                  Undo
                </button>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
