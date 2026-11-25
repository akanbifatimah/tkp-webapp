import { Mail, Phone } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import type { DuplicatePerson, MatchReason } from "./duplicate-types";

/** Small pieces shared by the duplicates list and the merge dialog. */

export function ReasonChips({ reasons }: { reasons: MatchReason[] }) {
  return (
    <>
      {reasons.map((r) => (
        <Chip key={r.kind + r.value} tone="maroon">
          {r.kind === "phone" ? <Phone className="size-3.5" aria-hidden /> : <Mail className="size-3.5" aria-hidden />}
          Same {r.kind}: {r.value}
        </Chip>
      ))}
    </>
  );
}

export function JourneyChip({ p }: { p: DuplicatePerson }) {
  const j = p.journey;
  if (j.status === "Completed") return <Chip tone="ok">Completed</Chip>;
  if (j.status === "Closed") return <Chip tone="neutral">Closed{j.closedReason ? ` · ${j.closedReason}` : ""}</Chip>;
  return <Chip tone="phase">Phase {j.phase}</Chip>;
}

export const callers = (p: DuplicatePerson) =>
  [p.journey.churchOffice && `Church office: ${p.journey.churchOffice}`, p.journey.integration && `Integration: ${p.journey.integration}`].filter(Boolean).join(" · ") ||
  "Not assigned yet";

