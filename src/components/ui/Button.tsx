import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

/**
 * Buttons. Meanings kept from TKP Connect: gold = Save log and ✎ Log follow-up;
 * disabled buttons say why in a tooltip.
 */
type Variant = "primary" | "gold" | "dark" | "ghost" | "subtle" | "danger" | "onDark";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-maroon-700 text-cream-50 shadow-card hover:bg-maroon-600",
  gold: "bg-linear-to-br from-gold-300 via-gold-500 to-gold-600 text-maroon-950 shadow-glow hover:brightness-105",
  dark: "bg-ink text-cream-50 hover:bg-maroon-900",
  ghost: "border border-line bg-white text-ink hover:border-maroon-200 hover:bg-cream-50",
  subtle: "bg-transparent text-maroon-700 hover:bg-maroon-100/60",
  danger: "bg-crit text-white hover:brightness-110",
  onDark: "border border-white/15 bg-white/10 text-cream-50 hover:bg-white/15",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-2xl px-6 text-[15px]",
};

export type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Shown as a tooltip when the button is disabled. */
  disabledReason?: string;
  icon?: ReactNode;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, disabledReason, icon, className, children, type = "button", ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  const button = (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center font-bold whitespace-nowrap transition-[background-color,border-color,filter,box-shadow,color] duration-150 select-none",
        "disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100",
        loading && "disabled:cursor-wait disabled:opacity-80",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </motion.button>
  );

  if (disabled && disabledReason) return <Tooltip label={disabledReason}>{button}</Tooltip>;
  return button;
});
