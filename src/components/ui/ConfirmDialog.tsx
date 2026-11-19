import { TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, use, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Confirmation before anything dangerous (delete, sign out, closing a record).
 * - Names the thing and the consequence in plain words.
 * - The confirm button says what will happen and is red for destructive actions.
 * - Cancel has focus first; Esc or a click outside cancels.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Sign out?", body: "…", confirmLabel: "Sign out" })) signOut();
 */
export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button (default true). */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...o, resolve });
      }),
    [],
  );

  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending],
  );

  return (
    <ConfirmContext value={confirm}>
      {children}
      {createPortal(
        <AnimatePresence>{pending ? <ConfirmModal key="confirm" options={pending} onClose={close} /> : null}</AnimatePresence>,
        document.body,
      )}
    </ConfirmContext>
  );
}

export function useConfirm() {
  const ctx = use(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

function ConfirmModal({ options: o, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const destructive = o.destructive ?? true;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose(false);
      }
      if (e.key === "Tab") {
        // Keep focus on the two buttons.
        e.preventDefault();
        (document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current)?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-120 grid place-items-center p-4">
      <motion.div className="absolute inset-0 bg-ink/55 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onClose(false)} aria-hidden />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={o.body ? bodyId : undefined}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.12 } }}
        transition={{ type: "spring", stiffness: 480, damping: 34 }}
        className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-panel"
      >
        <div className="flex items-start gap-4">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", destructive ? "bg-crit-soft text-crit" : "bg-gold-100 text-gold-800")} aria-hidden>
            <TriangleAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl font-semibold text-maroon-900">
              {o.title}
            </h2>
            {o.body ? (
              <div id={bodyId} className="mt-1.5 text-[15px] text-muted">
                {o.body}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onClose(false)}
            className="h-11 rounded-xl border border-line bg-white px-5 text-sm font-bold text-ink hover:border-maroon-200 hover:bg-cream-50"
          >
            {o.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={cn(
              "h-11 rounded-xl px-5 text-sm font-bold text-white shadow-card transition-[filter]",
              destructive ? "bg-crit hover:brightness-110" : "bg-maroon-700 hover:bg-maroon-600",
            )}
          >
            {o.confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
