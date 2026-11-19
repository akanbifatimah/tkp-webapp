import { Eye, EyeOff, HandHeart } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ConfidentialChip, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useEntry } from "@/features/connect/queries";
import type { GuestEntry } from "@/features/connect/types";
import { cn } from "@/lib/cn";
import { formatDayTime, serviceDateLong } from "@/lib/time";

/**
 * TKP Connect UI-W3 · View entry: the guest's welcome form exactly as
 * submitted, as a sectioned card. The prayer request appears here and nowhere
 * else (BR-30). Blank answers are hidden by default.
 */
type Field = { key: keyof GuestEntry; label: string; format?: (v: string) => string };
const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "Their visit",
    fields: [
      { key: "serviceDate", label: "Service date", format: serviceDateLong },
      { key: "serviceType", label: "Service" },
      { key: "submittedAt", label: "Form sent", format: formatDayTime },
    ],
  },
  {
    title: "Name and profile",
    fields: [
      { key: "firstName", label: "First name" },
      { key: "middleName", label: "Middle name" },
      { key: "lastName", label: "Last name" },
      { key: "gender", label: "Gender" },
      { key: "maritalStatus", label: "Marital status" },
      { key: "dob", label: "Date of birth" },
      { key: "ageBracket", label: "Age bracket" },
      { key: "nationality", label: "Nationality" },
    ],
  },
  {
    title: "Address",
    fields: [
      { key: "address", label: "Address" },
      { key: "apt", label: "Apt" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "zip", label: "Zip" },
      { key: "country", label: "Country" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "bestTimeToVisit", label: "Best time to visit" },
    ],
  },
  {
    title: "How they found us",
    fields: [
      { key: "howHeard", label: "How did you hear about us" },
      { key: "howHeardOther", label: "Other" },
      { key: "whoInvitedYou", label: "Who invited you" },
      { key: "invitingCellGroup", label: "Cell group that invited you" },
    ],
  },
  {
    title: "Intent",
    fields: [
      { key: "willComeAgain", label: "Will you come again" },
      { key: "likeToBecomeMember", label: "Would like to become a member" },
      { key: "giveThoughtToMembership", label: "Give a thought to membership" },
      { key: "likelyNeverComeAgain", label: "Likely never to come again" },
      { key: "ifYesWhy", label: "If yes, why" },
    ],
  },
];

export function ViewEntryDialog({ guestId, onClose }: { guestId: number | null; onClose: () => void }) {
  const entry = useEntry(guestId);
  const [showBlank, setShowBlank] = useState(false);
  const e = entry.data;
  const name = e ? [e.firstName, e.lastName].filter(Boolean).join(" ") : "";

  return (
    <Dialog
      open={guestId !== null}
      onClose={onClose}
      title={name ? `${name} · welcome form` : "Welcome form"}
      subtitle="As submitted. Nothing here can be edited."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowBlank((s) => !s)}
            aria-pressed={showBlank}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold text-ink hover:bg-cream-50"
          >
            {showBlank ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {showBlank ? "Hide blank answers" : "Show blank answers"}
          </button>
          <span className="text-xs font-semibold text-muted">Esc closes</span>
        </div>
      }
    >
      {entry.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : entry.isError ? (
        <ErrorBanner>{entry.error.message}</ErrorBanner>
      ) : e ? (
        <div className="space-y-4">
          <ConfidentialChip />
          {e.entriesThatDay > 1 ? (
            <p className="rounded-xl bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-800">
              {e.entriesThatDay} entries that day. This is the latest.
            </p>
          ) : null}
          {SECTIONS.map((s) => {
            const rows = s.fields.filter((f) => showBlank || isAnswered(e[f.key]));
            if (!rows.length) return null;
            return (
              <Section key={s.title} title={s.title}>
                <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {rows.map((f) => {
                    const v = e[f.key];
                    const text = isAnswered(v) ? (f.format ? f.format(String(v)) : String(v)) : null;
                    return (
                      <div key={f.key} className="min-w-0">
                        <dt className="text-xs font-bold text-muted">{f.label}</dt>
                        <dd className={cn("text-[15px] wrap-break-word", text ? "text-ink" : "text-muted/60 italic")}>{text ?? "No answer"}</dd>
                      </div>
                    );
                  })}
                </dl>
              </Section>
            );
          })}

          <Section title="Ratings · 0 to 10">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(e.ratings)
                .filter(([, v]) => showBlank || v !== null)
                .map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-cream-50 px-3 py-2">
                    <dt className="text-xs font-bold text-muted">{k}</dt>
                    <dd className="font-display text-lg font-semibold text-maroon-900 tabular">{v ?? <span className="text-sm text-muted/60 italic">No answer</span>}</dd>
                  </div>
                ))}
            </dl>
          </Section>

          {showBlank || e.comments ? (
            <Section title="Comments">
              <p className={cn("text-[15px]", e.comments ? "text-ink" : "text-muted/60 italic")}>{e.comments ?? "No answer"}</p>
            </Section>
          ) : null}

          {showBlank || e.prayerRequest ? (
            <Section title="Prayer request" icon={<HandHeart className="size-4" aria-hidden />} tone="gold">
              <p className={cn("text-[15px]", e.prayerRequest ? "text-ink" : "text-muted/60 italic")}>{e.prayerRequest ?? "No answer"}</p>
              <p className="mt-2 text-xs font-semibold text-gold-800">Shown only here, never in lists, the Connect form or reports.</p>
            </Section>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

const isAnswered = (v: unknown) => v !== null && v !== undefined && v !== "";

function Section({ title, icon, tone, children }: { title: string; icon?: React.ReactNode; tone?: "gold"; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border p-4", tone === "gold" ? "border-gold-300 bg-gold-100/50" : "border-line bg-white")}>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-extrabold tracking-[0.14em] text-maroon-700 uppercase">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
