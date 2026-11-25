import type { DestinationType, QrState } from "@/features/welcome/qr-types";
import { churchDate, fromChurchLocal } from "@/lib/time";

/**
 * QR codes (PRD 5.8). Fictional names, addresses and counts.
 * One legacy code stands for the code printed today (QR-7); its address is a
 * placeholder until TKP gives the real one.
 */
export type QrRecord = {
  id: string;
  /** Short address code: go.tkp.example/<slug>. Null for a legacy code. */
  slug: string | null;
  /** The address already printed on a legacy code (QR-7). */
  legacyUrl: string | null;
  name: string;
  destination: DestinationType;
  targetId: string | null;
  serviceId: string | null;
  activeFrom: string | null;
  expiresAt: string | null;
  state: QrState;
  note: string;
  caption: string;
  createdAt: string;
  createdById: string | null;
  updatedAt: string;
  updatedById: string | null;
  rowVer: number;
};

/** Aggregated scans: a count per code, church day, service and outcome. No personal data (QR-6). */
export type QrScanRow = { codeId: string; date: string; serviceId: string | null; inactive: boolean; n: number };

/** Courses a code can open. Placeholders until Grow (M8) brings the real catalogue. */
export const COURSES = [
  { id: "crs-1", name: "Foundation Class", hint: "4 weeks" },
  { id: "crs-2", name: "Baptism Class", hint: "1 session" },
  { id: "crs-3", name: "School of Ministry", hint: "12 weeks" },
];

const DAY = 86_400_000;
const ago = (days: number, now: number) => new Date(now - days * DAY).toISOString();
/** Church wall-clock time, days from today: at(-50, "09:00"). */
const at = (days: number, hhmm: string, now: number) => fromChurchLocal(`${churchDate(new Date(now + days * DAY))}T${hhmm}`);

export function seedQr(now = Date.now()) {
  const base = { legacyUrl: null, targetId: null, serviceId: null, note: "", createdById: "u04", updatedById: null, rowVer: 1 };
  const codes: QrRecord[] = [
    {
      ...base,
      id: "qr-1",
      slug: null,
      legacyUrl: "https://www.example.org/welcome-form",
      name: "Printed welcome code (church website)",
      destination: "guest_form",
      activeFrom: "2024-01-07T15:00:00.000Z",
      expiresAt: null,
      state: "live",
      note: "The code on the seat cards today. Keeps working through cutover; the old address will redirect to the TKP Hub guest form. Replace the address with the real one.",
      caption: "New here? Scan to say hello",
      createdAt: ago(20, now),
      createdById: "u01",
      updatedAt: ago(20, now),
    },
    {
      ...base,
      id: "qr-2",
      slug: "HELLO7",
      name: "Welcome desk table card",
      destination: "guest_form",
      activeFrom: at(-50, "08:00", now),
      expiresAt: null,
      state: "live",
      note: "Two cards on each welcome desk.",
      caption: "New here? Scan to say hello",
      createdAt: ago(52, now),
      updatedAt: ago(52, now),
    },
    {
      ...base,
      id: "qr-3",
      slug: "HOP168",
      name: "168 Hours of Praise programme",
      destination: "event",
      targetId: "svc-5",
      activeFrom: "2026-12-20T14:00:00.000Z",
      // Runs to the morning after the last night of the event.
      expiresAt: "2027-01-10T12:00:00.000Z",
      state: "live",
      caption: "Scan for the full programme",
      createdAt: ago(6, now),
      createdById: "u08",
      updatedAt: ago(6, now),
    },
    {
      ...base,
      id: "qr-4",
      slug: "XOVER1",
      name: "Cross Over short form",
      destination: "short_form",
      serviceId: "svc-6",
      activeFrom: "2026-12-31T23:00:00.000Z",
      expiresAt: "2027-01-02T06:00:00.000Z",
      state: "live",
      caption: "First time at Cross Over? Scan here",
      createdAt: ago(3, now),
      updatedAt: ago(3, now),
    },
    {
      ...base,
      id: "qr-5",
      slug: "PRAY24",
      name: "Prayer Wall bulletin insert",
      destination: "prayer_wall",
      activeFrom: at(-80, "08:00", now),
      expiresAt: at(-8, "23:59", now),
      state: "live",
      caption: "Share a prayer request",
      createdAt: ago(82, now),
      updatedAt: ago(30, now),
      updatedById: "u04",
    },
    {
      ...base,
      id: "qr-6",
      slug: "FNDCLS",
      name: "Foundation Class sign-up",
      destination: "course",
      targetId: "crs-1",
      activeFrom: at(-35, "08:00", now),
      expiresAt: null,
      state: "paused",
      note: "Paused while the next class date is fixed.",
      caption: "Scan to join the Foundation Class",
      createdAt: ago(36, now),
      updatedAt: ago(4, now),
      updatedById: "u08",
    },
    {
      ...base,
      id: "qr-7",
      slug: "VISIT3",
      name: "Plan a Visit door hanger",
      destination: "plan_visit",
      activeFrom: null,
      expiresAt: null,
      state: "draft",
      caption: "Plan your visit",
      createdAt: ago(1, now),
      updatedAt: ago(1, now),
    },
  ];
  return { codes, scans: seedScans(codes, now) };
}

/** Deterministic counts: busy on Sundays, a few at Bible study, the odd one in the week. */
function seedScans(codes: QrRecord[], now: number): QrScanRow[] {
  let seed = 7;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % (n + 1);
  };
  const weight: Record<string, number> = { "qr-1": 10, "qr-2": 4, "qr-5": 2, "qr-6": 2 };
  const rows: QrScanRow[] = [];
  for (const c of codes) {
    const w = weight[c.id];
    if (!w || !c.activeFrom) continue;
    const pausedFrom = c.state === "paused" ? now - 4 * DAY : Infinity;
    for (let t = Math.max(Date.parse(c.activeFrom), now - 120 * DAY); t <= now; t += DAY) {
      const date = churchDate(new Date(t));
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const off = (c.expiresAt && t > Date.parse(c.expiresAt)) || t > pausedFrom;
      const push = (serviceId: string | null, n: number) => n > 0 && rows.push({ codeId: c.id, date, serviceId, inactive: !!off, n });
      if (off) {
        if (weekday === 0) push("svc-1", rnd(2));
        continue;
      }
      if (weekday === 0) {
        push("svc-1", rnd(w) + Math.ceil(w / 2));
        push("svc-2", rnd(w));
      } else if (weekday === 2) push("svc-3", rnd(Math.ceil(w / 3)));
      else push(null, rnd(4) === 0 ? 1 : 0);
    }
  }
  return rows;
}
