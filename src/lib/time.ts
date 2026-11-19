/**
 * Church time: everything is stored in UTC and shown in America/Chicago (TKP Connect BR-25, UI-G3).
 * Formats follow the live app: "Sun, Nov 15" and "2:05 pm".
 */
export const CHURCH_TZ = "America/Chicago";

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: CHURCH_TZ, weekday: "short", month: "short", day: "numeric" });
const longDayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CHURCH_TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: CHURCH_TZ, hour: "numeric", minute: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: CHURCH_TZ, hour: "numeric", hourCycle: "h23" });

const toDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

/** "Sun, Nov 15" */
export const formatDay = (d: Date | string) => dayFmt.format(toDate(d));
/** "Sunday, November 15, 2026" */
export const formatLongDay = (d: Date | string) => longDayFmt.format(toDate(d));
/** "2:05 pm" */
export const formatTime = (d: Date | string) => timeFmt.format(toDate(d)).replace("AM", "am").replace("PM", "pm");
/** "Sun, Nov 15 · 2:05 pm" */
export const formatDayTime = (d: Date | string) => `${formatDay(d)} · ${formatTime(d)}`;

/** The church-time calendar date, "2026-11-15", for a UTC instant. */
export const churchDate = (d: Date | string) => partsFmt.format(toDate(d));

/** "Good morning" / "Good afternoon" / "Good evening" in church time. */
export function greeting(now: Date = new Date()) {
  const h = Number(hourFmt.format(now));
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------ service dates */

/**
 * Service dates are calendar dates ("2026-11-15"), not instants: format them
 * as written, never through a time zone (midnight UTC would show the 14th in Chicago).
 */
const civil = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12));
const civilLong = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const civilShort = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const civilWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });

/** "Sun, Nov 15, 2026" */
export const serviceDateLong = (iso: string) => civilLong.format(civil(iso));
/** "Nov 15" */
export const serviceDateShort = (iso: string) => civilShort.format(civil(iso));
/** "Sunday" (the scripts' [Day]) */
export const serviceWeekday = (iso: string) => civilWeekday.format(civil(iso));

/** "Nov 16 · 2:05 pm" in church time: when a log was saved or a box ticked. */
export const formatStamp = (d: Date | string) => `${new Intl.DateTimeFormat("en-US", { timeZone: CHURCH_TZ, month: "short", day: "numeric" }).format(toDate(d))} · ${formatTime(d)}`;
