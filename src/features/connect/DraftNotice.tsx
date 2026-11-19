import { FlaskConical } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp } from "@/lib/motion";

/**
 * Marks a PLANNED Connect tab (TKP Connect UI-C4…C7) as a draft built from what
 * the repo agrees so far, and names the open questions it depends on.
 */
export function DraftNotice({ questions, children }: { questions: string; children: ReactNode }) {
  return (
    <motion.div variants={fadeUp} className="flex items-start gap-3 rounded-2xl border border-dashed border-gold-400 bg-gold-100/50 px-4 py-3 text-sm" role="note">
      <FlaskConical className="mt-0.5 size-4.5 shrink-0 text-gold-800" aria-hidden />
      <p className="text-gold-800">
        <b>Draft for sign-off ({questions}).</b> {children}
      </p>
    </motion.div>
  );
}
