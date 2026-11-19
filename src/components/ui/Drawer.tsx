import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A panel that slides in from the right (TKP Connect's guest record drawer).
 * Esc closes it (unless a pop-up above it is open), focus returns to the opener.
 */
export function Drawer({
  open,
  onClose,
  label,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("button")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      // A pop-up opened from the drawer handles its own Esc first.
      if (e.key === "Escape" && !document.querySelector("[role=dialog][aria-modal=true]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-80" data-drawer-root>
          <motion.div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.aside
            ref={panel}
            role="complementary"
            aria-labelledby={id}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="absolute inset-y-0 right-0 flex w-[min(34rem,100vw)] flex-col bg-cream-100 shadow-panel sm:rounded-l-3xl"
          >
            <header className="flex items-center justify-between border-b border-line bg-white px-5 py-3 sm:rounded-tl-3xl">
              <span id={id} className="text-xs font-extrabold tracking-[0.14em] text-maroon-700 uppercase">
                {label}
              </span>
              <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-cream-200 hover:text-maroon-700">
                <X className="size-5" />
              </button>
            </header>
            <div className="scroll-warm flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer ? <footer className="border-t border-line bg-white px-5 py-3 sm:rounded-bl-3xl">{footer}</footer> : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
