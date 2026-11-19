import type { Transition, Variants } from "motion/react";

/**
 * Motion rules for a tool people use all day: fast (150–300 ms), purposeful,
 * never blocking. <MotionConfig reducedMotion="user"> in the providers turns
 * transforms off for people who ask for reduced motion.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DUR = { fast: 0.15, base: 0.22, slow: 0.3 } as const;

export const springSnappy: Transition = { type: "spring", stiffness: 520, damping: 40, mass: 0.8 };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE_OUT } },
};

export const stagger = (step = 0.04, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: DUR.fast, ease: "easeIn" } },
};
