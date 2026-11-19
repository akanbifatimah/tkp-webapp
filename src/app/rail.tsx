import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Pieces for the collapsed (icon-rail) sidebar, after the Colcare and KiaRelay pattern.
 * Both portal to <body> so the scrolling nav's overflow never clips them.
 */

/** Collapsed state for one sidebar, remembered per browser. */
export function useSidebarCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* the choice just won't survive a reload */
      }
      return next;
    });
  return { collapsed, toggle };
}

const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

/** Label to the right of a rail icon, on hover and keyboard focus. */
export function RailTooltip({ label, enabled, children }: { label: string; enabled: boolean; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    if (!enabled || !isDesktop()) return;
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top + r.height / 2, left: r.right + 12 });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!enabled) setPos(null);
  }, [enabled]);

  return (
    <span ref={ref} className="block" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={hide}>
      {children}
      {enabled && pos
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-100 -translate-y-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-bold whitespace-nowrap text-cream-50 shadow-lift"
              style={{ top: pos.top, left: pos.left }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

/**
 * A group's pages beside the rail. Opens on hover or focus, with a short close
 * delay so the pointer can cross the gap; kept inside the viewport.
 */
export function RailFlyout({
  enabled,
  title,
  trigger,
  children,
}: {
  enabled: boolean;
  title: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
  };
  const open = () => {
    if (!enabled || !isDesktop()) return;
    clear();
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top, left: r.right + 12 });
  };
  const scheduleClose = () => {
    clear();
    timer.current = window.setTimeout(() => setPos(null), 150);
  };
  const close = () => {
    clear();
    setPos(null);
  };

  useEffect(() => clear, []);
  useEffect(() => {
    if (!enabled) setPos(null);
  }, [enabled]);

  // Clamp inside the viewport once it can be measured (no re-render, no flash).
  useLayoutEffect(() => {
    const el = panel.current;
    if (!pos || !el) return;
    const maxTop = window.innerHeight - el.offsetHeight - 8;
    el.style.top = `${Math.max(8, Math.min(pos.top, maxTop))}px`;
  }, [pos]);

  return (
    <div
      ref={ref}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={(e) => {
        if (!panel.current?.contains(e.relatedTarget as Node)) scheduleClose();
      }}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      {trigger}
      {enabled && pos
        ? createPortal(
            <div
              ref={panel}
              onMouseEnter={open}
              onMouseLeave={scheduleClose}
              onBlur={(e) => {
                if (!panel.current?.contains(e.relatedTarget as Node)) scheduleClose();
              }}
              style={{ top: pos.top, left: pos.left }}
              className="bg-sidebar fixed z-100 min-w-48 rounded-2xl border border-white/10 p-2 shadow-panel"
            >
              <p className="px-3 pt-1 pb-2 text-[10px] font-extrabold tracking-[0.16em] text-gold-300/70 uppercase">{title}</p>
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
