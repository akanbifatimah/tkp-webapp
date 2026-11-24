import { BookOpen, CalendarDays, Check, ClipboardList, Copy, HandHeart, MapPin, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";
import { formatWhen } from "@/lib/time";
import { STATUS_LABEL, type DestinationType, type QrCode, type QrStatus } from "./qr-types";

/** Small pieces shared by the QR code screens (PRD 5.8). */

export const STATUS_TONE: Record<QrStatus, ChipTone> = {
  active: "ok",
  scheduled: "gold",
  paused: "warn",
  draft: "neutral",
  expired: "crit",
};

export function QrStatusChip({ status }: { status: QrStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>;
}

export const DEST_ICON: Record<DestinationType, LucideIcon> = {
  guest_form: ClipboardList,
  short_form: Zap,
  plan_visit: MapPin,
  event: CalendarDays,
  course: BookOpen,
  prayer_wall: HandHeart,
};

/** "From Dec 20, 2026 · 9:00 am · until Jan 8, 2027 · 10:00 pm" in short pieces. */
export function datesText(c: Pick<QrCode, "activeFrom" | "expiresAt" | "status">) {
  const from = c.activeFrom ? formatWhen(c.activeFrom) : "When turned on";
  const until = c.expiresAt ? formatWhen(c.expiresAt) : "No expiry";
  return { from, until };
}

/** The address without the scheme, as printed under the code. */
export const shortText = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

export function CopyButton({ value, label = "Copy address" }: { value: string; label?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      toast.show("Could not copy. Select the address and copy it instead.", { tone: "crit" });
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-cream-200 hover:text-maroon-700 [&_svg]:size-4"
    >
      {done ? <Check className="text-ok" /> : <Copy />}
    </button>
  );
}
