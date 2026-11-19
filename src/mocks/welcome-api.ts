import type {
  CellCounts,
  GuestItem,
  GuestRecord,
  GuestSearch,
  GuestSearchResponse,
  OverviewResponse,
  Scope,
  WelcomeKpis,
} from "@/features/welcome/types";
import { can, type Permission } from "@/lib/permissions";
import type { Result } from "./connect-api";
import { audit, db } from "./db";
import type { WelcomeEntry } from "./seed/guests";
import type { StaffRecord } from "./seed/staff";

/**
 * The mock Welcome "server": TKP Connect API-W1…W4. Counting rules follow doc 01
 * §5 and the metric definitions in §8.1, which the Integration Team owns.
 */

const ok = <T,>(body: T): Result<T> => ({ ok: true, status: 200, body });
const no = (status: number, code: string, message: string): Result<never> => ({ ok: false, status, code, message });
const allowed = (u: StaffRecord, p: Permission) => u.roles.some((r) => can(r, p));

/* ----------------------------------------------------------------- definitions (§8.1) */

/** "Would you like to become a member?", else "Will you give a thought…"; Maybe counts as Undecided. */
export function membershipIntent(e: WelcomeEntry): string | null {
  const v = e.likeToBecomeMember ?? e.giveThoughtToMembership;
  if (!v) return null;
  return v === "Maybe" ? "Undecided" : v;
}
const YOUNG = ["16-20", "21-25", "26-30", "31-35"];
const ADULT = ["36-40", "41-45", "46-50", "51-65", "Above 65"];
const ageGroup = (b: string | null) => (!b ? null : b === "Below 16" ? "Below 16" : YOUNG.includes(b) ? "Young Adults (16-35)" : ADULT.includes(b) ? "Adults" : null);

function guestRating(e: WelcomeEntry): number | null {
  const vals = Object.values(e.ratings).filter((v): v is number => v !== null); // blank = no answer, never 0 (BR-23)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function kpis(list: WelcomeEntry[]): WelcomeKpis {
  const rated = list.map(guestRating).filter((v): v is number => v !== null);
  return {
    guests: list.length,
    female: list.filter((e) => e.gender === "Female").length,
    male: list.filter((e) => e.gender === "Male").length,
    youngAdults: list.filter((e) => YOUNG.includes(e.ageBracket ?? "")).length,
    adults: list.filter((e) => ADULT.includes(e.ageBracket ?? "")).length,
    membershipYes: list.filter((e) => membershipIntent(e) === "Yes").length,
    membershipUndecided: list.filter((e) => membershipIntent(e) === "Undecided").length,
    willComeAgainYes: list.filter((e) => e.willComeAgain === "Yes").length,
    referrals: list.filter((e) => e.howHeard === "Invited By Someone").length,
    notOnCellMap: list.filter((e) => e.cellGroup === "N/A").length,
    repeatGuests: list.filter((e) => e.visitNumber > 1).length,
    avgRating: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
  };
}

function cells(list: WelcomeEntry[]): CellCounts {
  const out: CellCounts = {};
  for (const e of list) {
    const c = (["Red", "Yellow", "Blue", "Green"].includes(e.cellGroup) ? e.cellGroup : "N/A") as keyof CellCounts;
    out[c] = (out[c] ?? 0) + 1;
  }
  return out;
}

const minusYear = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const inRange = (e: WelcomeEntry, a: string, b: string) => e.serviceDate >= a && e.serviceDate <= b;

/* ----------------------------------------------------------------- API-W1 overview */

export function getOverview(u: StaffRecord, q: { date: string | null; scope: string | null }): Result<OverviewResponse> {
  if (!allowed(u, "welcome.overview.view")) return no(403, "FORBIDDEN", "You don't have access to the Welcome overview.");
  const entries = db.entries;
  const dates = [...new Set(entries.map((e) => e.serviceDate))].sort().reverse();
  const date = q.date && dates.includes(q.date) ? q.date : dates[0]!;
  const scope: Scope = q.scope === "mtd" || q.scope === "ytd" ? q.scope : "service";

  let currentStart = date;
  let priorStart: string | null = null;
  let priorEnd: string | null = null;
  if (scope === "service") {
    // The previous service date on the same weekday.
    priorStart = dates.find((d) => d < date && weekday(d) === weekday(date)) ?? null;
    priorEnd = priorStart;
  } else {
    currentStart = scope === "mtd" ? `${date.slice(0, 7)}-01` : `${date.slice(0, 4)}-01-01`;
    priorStart = minusYear(currentStart);
    priorEnd = minusYear(date);
  }

  const current = entries.filter((e) => inRange(e, currentStart, date));
  const prior = priorStart && priorEnd ? entries.filter((e) => inRange(e, priorStart, priorEnd)) : [];

  // The chart follows the scope.
  const chart: OverviewResponse["chart"] = [];
  const add = (key: string, type: string) => {
    const row = chart.find((c) => c.date === key && c.type === type);
    if (row) row.guests++;
    else chart.push({ date: key, type, guests: 1 });
  };
  if (scope === "ytd") {
    for (const e of current) add(`${e.serviceDate.slice(0, 7)}-01`, e.serviceType);
  } else {
    const shown = scope === "service" ? dates.filter((d) => d <= date).slice(0, 16) : dates.filter((d) => d >= currentStart && d <= date);
    for (const e of entries) if (shown.includes(e.serviceDate)) add(e.serviceDate, e.serviceType);
  }

  return ok({
    meta: { date, scope, currentStart, currentEnd: date, priorStart, priorEnd },
    kpis: { current: kpis(current), prior: kpis(prior) },
    cells: { current: cells(current), prior: cells(prior) },
    chart: chart.sort((a, b) => a.date.localeCompare(b.date)),
    dates,
  });
}

/* ----------------------------------------------------------------- API-W2 search */

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function toItem(e: WelcomeEntry): GuestItem {
  return {
    id: e.id,
    serviceDate: e.serviceDate,
    serviceType: e.serviceType,
    firstName: e.firstName,
    lastName: e.lastName,
    phone: e.phone,
    gender: e.gender,
    ageBracket: e.ageBracket,
    city: e.city,
    zip: e.zip,
    cellGroup: e.cellGroup,
    howHeard: e.howHeard,
    membershipIntent: membershipIntent(e),
    visitNumber: e.visitNumber,
    connectId: e.connectId,
  };
}

export function searchGuests(u: StaffRecord, q: GuestSearch): Result<GuestSearchResponse> {
  if (!allowed(u, "welcome.lookup.view")) return no(403, "FORBIDDEN", "You don't have access to Guest lookup.");
  const phone = digits(q.phone);
  const words = (q.name ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!phone && !words.length && !q.date && !q.cell && !q.type && !q.member) {
    return no(400, "VALIDATION_FAILED", "Type a phone number or a name, or pick a filter.");
  }
  if (phone && phone.length < 3) return no(400, "VALIDATION_FAILED", "Type at least 3 digits of the phone number.");

  const CAP = 1000;
  const found = db.entries
    .filter((e) => {
      if (phone && !digits(e.phone).includes(phone)) return false;
      // Every word must match the first or the last name, in any order ("mensah ruth").
      if (words.length) {
        const names = [e.firstName, e.lastName].map((n) => (n ?? "").toLowerCase());
        if (!words.every((w) => names.some((n) => n.startsWith(w)))) return false;
      }
      if (q.date && e.serviceDate !== q.date) return false;
      if (q.cell && (q.cell === "None" ? e.cellGroup !== "N/A" : e.cellGroup !== q.cell)) return false;
      if (q.type && e.serviceType !== q.type) return false;
      if (q.member && membershipIntent(e) !== q.member) return false;
      return true;
    })
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || b.submittedAt.localeCompare(a.submittedAt));

  audit(u.id, "welcome.search", JSON.stringify(q));
  return ok({ items: found.slice(0, CAP).map(toItem), total: found.length, truncated: found.length > CAP });
}

/* ----------------------------------------------------------------- API-W3 guest record */

export function getGuestRecord(u: StaffRecord, id: number): Result<{ guest: GuestRecord }> {
  if (!allowed(u, "welcome.lookup.view")) return no(403, "FORBIDDEN", "You don't have access to Guest lookup.");
  const e = db.entries.find((x) => x.id === id);
  if (!e) return no(404, "NOT_FOUND", "Guest not found.");
  const d = digits(e.phone);
  audit(u.id, "welcome.view", String(id));
  return ok({
    guest: {
      ...toItem(e),
      middleName: e.middleName,
      email: e.email,
      address: e.address,
      apt: e.apt,
      state: e.state,
      maritalStatus: e.maritalStatus,
      ageGroup: ageGroup(e.ageBracket),
      howHeardOther: e.howHeardOther,
      invitedBy: e.whoInvitedYou,
      invitingCellGroup: e.invitingCellGroup,
      willComeAgain: e.willComeAgain,
      bestTimeToVisit: e.bestTimeToVisit,
      comments: e.comments,
      ratings: e.ratings,
      followUpNotes: e.legacyNotes.map((n) => ({ by: n.by, text: n.text })),
      entriesWithPhone: d ? db.entries.filter((x) => digits(x.phone) === d).length : 1,
    },
  });
}

/* ----------------------------------------------------------------- API-W4 View entry */

export function getEntry(u: StaffRecord, id: number) {
  if (!allowed(u, "welcome.lookup.view")) return no(403, "FORBIDDEN", "You don't have access to guest details.");
  const e = db.entries.find((x) => x.id === id);
  if (!e) return no(404, "NOT_FOUND", "Guest not found.");
  audit(u.id, "welcome.entry.view", String(id));
  const { connectId: _c, legacyNotes: _l, ...entry } = e; // never the follow-up columns
  return ok({ entry: { ...entry, membershipIntent: membershipIntent(e), connectId: e.connectId } });
}

/** D8: guest PDF export is allowed for some roles, and every export is logged. */
export function logExport(u: StaffRecord, id: number): Result<{ logged: true }> {
  if (!allowed(u, "welcome.export")) return no(403, "FORBIDDEN", "Your role cannot export guest records.");
  if (!db.entries.some((x) => x.id === id)) return no(404, "NOT_FOUND", "Guest not found.");
  audit(u.id, "welcome.entry.export", String(id));
  return ok({ logged: true });
}
