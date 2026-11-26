import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/misc";
import { SignatureCapture } from "@/components/ui/SignatureCapture";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/auth";
import { api, ApiError } from "@/lib/api";
import { stagger } from "@/lib/motion";

export const signatureKey = ["me", "signature"] as const;

/**
 * My signature: drawn or uploaded once, then printed on every certificate the
 * person signs (as class teacher or parish pastor). Certificates already issued
 * keep the signature they were issued with.
 */
export function SignaturePage() {
  const { member } = useAuth();
  const q = useQuery({ queryKey: signatureKey, queryFn: ({ signal }) => api.signature.get(signal) });
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);

  const done = (signature: string | null) => {
    qc.setQueryData(signatureKey, { signature });
    // Ready-to-issue rows carry saved signatures.
    void qc.invalidateQueries({ queryKey: ["learn", "certificates"] });
    setEditing(false);
  };
  const save = useMutation({
    mutationFn: (png: string) => api.signature.save(png),
    onSuccess: (r) => (done(r.signature), toast.show("Signature saved")),
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "It couldn't be saved. Please try again.", { tone: "crit" }),
  });
  const remove = useMutation({
    mutationFn: () => api.signature.remove(),
    onSuccess: () => (done(null), toast.show("Signature removed")),
    onError: (e) => toast.show(e instanceof ApiError ? e.message : "It couldn't be removed. Please try again.", { tone: "crit" }),
  });

  const askRemove = async () => {
    const ok = await confirm({
      title: "Remove your signature?",
      body: "New certificates you're named on will print without it until you add one again. Certificates already issued keep theirs.",
      confirmLabel: "Remove signature",
    });
    if (ok) remove.mutate();
  };

  const signature = q.data?.signature ?? null;
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="max-w-3xl space-y-7">
      <PageHeader eyebrow="Account" title="My signature" tagline="Printed on certificates you sign as class teacher or parish pastor." />
      {q.isError ? <ErrorBanner>{q.error.message}</ErrorBanner> : null}
      {!q.data ? (
        <Skeleton className="h-64 w-full rounded-3xl" />
      ) : (
        <Card className="space-y-5">
          {signature && !editing ? (
            <>
              <div className="rounded-2xl border border-line bg-cream-50 px-6 pt-6 pb-4 text-center">
                <img src={signature} alt="Your saved signature" className="mx-auto h-24 max-w-full object-contain" />
                <div className="mx-auto mt-1 max-w-xs border-t border-maroon-900/40 pt-2 text-sm">
                  <span className="block font-display text-lg font-semibold text-ink">{member?.fullName}</span>
                  <span className="text-xs text-muted">How it looks on a certificate</span>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void askRemove()} loading={remove.isPending}>
                  Remove
                </Button>
                <Button variant="dark" icon={<PenLine className="size-4" />} onClick={() => setEditing(true)}>
                  Replace signature
                </Button>
              </div>
            </>
          ) : (
            <>
              {!signature ? <p className="text-sm text-muted">You haven't added a signature yet. Sign below, or upload a photo or scan of your signature.</p> : null}
              <SignatureCapture saveLabel="Save signature" busy={save.isPending} onSave={(png) => save.mutate(png)} onCancel={signature ? () => setEditing(false) : undefined} />
            </>
          )}
          <p className="text-xs text-muted">Only you can change your saved signature. Issued certificates keep the signature they were issued with, so changing it here never alters them.</p>
        </Card>
      )}
    </motion.div>
  );
}
