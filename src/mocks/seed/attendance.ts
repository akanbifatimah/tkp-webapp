import { ALL_SERVICE_DATES } from "./guests";

/**
 * Service headcounts (LCM "Guests per 100 attendees"). TKP does not collect
 * these yet: this is the small new table the metric needs, one row per
 * service held. Placeholder numbers, worked out from the date so they never
 * change between reloads.
 */
export type AttendanceRow = { date: string; serviceType: string; headcount: number };

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function seedAttendance(): AttendanceRow[] {
  const rows: AttendanceRow[] = [];
  for (const date of [...ALL_SERVICE_DATES].sort()) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const h = hash(date);
    if (day === 0) {
      rows.push({ date, serviceType: "Sunday 1st Service", headcount: 120 + (h % 50) });
      rows.push({ date, serviceType: "Sunday 2nd Service", headcount: 150 + ((h >>> 8) % 60) });
    } else if (day === 2) {
      rows.push({ date, serviceType: "Tuesday Bible Study", headcount: 40 + (h % 20) });
    }
  }
  return rows;
}
