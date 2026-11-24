import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Centred pop-up over a dimmed page (TKP Connect "Pop-up" component).
 * UI-G9: traps focus, closes with Esc, and returns focus to whatever opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  leading,
  meta,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shown before the title (e.g. an avatar). */
  leading?: ReactNode;
  /** Shown under the title, outside the heading (chips, a meter). */
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers often pass a new onClose each render; keep the latest without
  // re-running the open effect (which would move focus while someone types).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // A marked control first (e.g. Done), else the first button.
    const t = window.setTimeout(() => {
      // Never pull focus out of a confirmation opened on top in the meantime.
      if (document.activeElement?.closest('[role="alertdialog"]')) return;
      (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex]:not([tabindex='-1'])")];
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-90 grid place-items-center p-3 sm:p-6" data-dialog-root>
          <motion.div
            className="absolute inset-0 bg-ink/55 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className={cn(
              "relative flex max-h-[min(92svh,56rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-cream-100 shadow-panel",
              className,
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line bg-white px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-4">
                {leading}
                <div className="min-w-0">
                  {subtitle ? <div className="mb-0.5 text-xs font-extrabold tracking-[0.12em] text-gold-600 uppercase">{subtitle}</div> : null}
                  <h2 id={titleId} className="font-display text-xl font-semibold text-maroon-900 sm:text-2xl">
                    {title}
                  </h2>
                  {meta}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                data-noprint
                className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-cream-200 hover:text-maroon-700"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="scroll-warm flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer ? (
              <footer className="border-t border-line bg-white px-5 py-3 sm:px-6" data-noprint>
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
