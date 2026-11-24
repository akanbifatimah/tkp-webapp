import { CO_CLOSING_ACTION, MULTI_KEYS, STEPS, STEP_KEYS, type JourneyStatus, type MultiKey, type Phase, type StepKey } from "@/features/connect/model";
import type { ChecklistEntry, GuestEntry, GuestState, LogRow } from "@/features/connect/types";
import { churchDate } from "@/lib/time";
import { STAFF } from "./staff";

/**
 * Fictional guests and their Connect journeys. Deterministic (seeded) so every
 * reload looks the same. Never real people: 555 numbers, example.com emails.
 */

/* ----------------------------------------------------------------- random */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261115);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
const chance = (p: number) => rnd() < p;

/* ----------------------------------------------------------------- reference */

/** TKP Connect doc 03 §8: the church's ZIP → cell list. */
export const CELL_ZIPS: Record<string, "Red" | "Yellow" | "Blue" | "Green"> = {
  "77433": "Blue", "77410": "Blue", "77429": "Blue", "77449": "Blue",
  "77469": "Green", "77406": "Green", "77407": "Green", "77471": "Green",
  "77493": "Red", "77423": "Red", "77450": "Red", "77084": "Red",
  "77441": "Yellow", "77494": "Yellow", "77485": "Yellow", "77435": "Yellow",
};
const OTHER_ZIPS = ["77082", "77079", "77077", "77064", "77573", "77095"];
const CITY: Record<string, string> = {
  "77433": "Cypress", "77410": "Cypress", "77429": "Cypress", "77449": "Katy", "77469": "Richmond", "77406": "Richmond",
  "77407": "Richmond", "77471": "Rosenberg", "77493": "Katy", "77423": "Brookshire", "77450": "Katy", "77084": "Houston",
  "77441": "Fulshear", "77494": "Katy", "77485": "Wallis", "77435": "East Bernard", "77082": "Houston", "77079": "Houston",
  "77077": "Houston", "77064": "Houston", "77573": "League City", "77095": "Houston",
};

/** Departments: placeholder until the church sends its list (TKP Connect Q14); taken from script A.3.1. */
export const DEPARTMENTS = [
  "Choir / Music Ministry",
  "Children’s Church",
  "Teen/Youth Ministry",
  "Ushering / Protocol",
  "Prayer / Intercession",
  "Media / Technical",
  "Evangelism / Outreach",
].map((name, i) => ({ id: i + 1, name }));

const FIRST = ["Adaeze", "Michael", "Funmi", "Daniel", "Grace", "Samuel", "Ruth", "Kelechi", "Sarah", "Emeka", "Joy", "David", "Esther", "Tunde", "Priscilla", "James", "Blessing", "Victor", "Hannah", "Chidi", "Naomi", "Joshua", "Ifeoma", "Caleb", "Mercy", "Paul", "Deborah", "Femi", "Abigail", "Isaac", "Zainab", "Peter", "Lois", "Seyi", "Miriam", "Andrew", "Temitope", "Ken", "Lydia", "Oluwaseun"];
const LAST = ["Adebayo", "Johnson", "Okonkwo", "Williams", "Mensah", "Brown", "Eze", "Davis", "Ogunleye", "Martin", "Nwachukwu", "Taylor", "Bello", "Thomas", "Owusu", "Harris", "Afolabi", "Clark", "Obi", "Lewis", "Ajayi", "Walker", "Danjuma", "Young", "Okafor", "King", "Balogun", "Green", "Uche", "Baker"];
const AGES = ["16-20", "21-25", "26-30", "31-35", "36-40", "41-45", "46-50", "51-65", "Above 65"];
const HOW = ["Invited By Someone", "Invited By Someone", "Social Media", "Google Search", "Drove by", "YouTube", "Other"];
const OTHER_ANSWERS = ["Saw the sign on the way to work", "Live stream", "Heard the choir at an event", "Church website"];
const INVITERS = ["Bola Adeyemi", "Chris Martin", "Funke Ola", "Sam Grant", "Ify Nnaji", "Lola Ayo"];

/** A few guests from outside Greater Houston (LCM Map 2). Points are city centres; abroad has no zip. */
export const OUT_OF_AREA = [
  { city: "Dallas", state: "TX", zip: "75201", country: "United States", lat: 32.787, lon: -96.799 },
  { city: "Austin", state: "TX", zip: "78701", country: "United States", lat: 30.271, lon: -97.742 },
  { city: "Atlanta", state: "GA", zip: "30303", country: "United States", lat: 33.753, lon: -84.39 },
  { city: "Chicago", state: "IL", zip: "60601", country: "United States", lat: 41.886, lon: -87.618 },
  { city: "Lagos", state: null, zip: null, country: "Nigeria", lat: null, lon: null },
  { city: "London", state: null, zip: null, country: "United Kingdom", lat: null, lon: null },
  { city: "Accra", state: null, zip: null, country: "Ghana", lat: null, lon: null },
] as const;

/* ----------------------------------------------------------------- service dates */

const HOUR = 3600_000;
const NOW = new Date();
const TODAY = churchDate(NOW);

/** Sundays (1st and 2nd service) back from the latest past Sunday, plus Tuesday Bible Study. */
function serviceDates(): { date: string; type: string; startUtc: string }[] {
  const out: { date: string; type: string; startUtc: string }[] = [];
  const d = new Date(`${TODAY}T12:00:00Z`);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1);
  for (let i = 0; i < 14; i++) {
    const sunday = new Date(d.getTime() - i * 7 * 24 * HOUR);
    const date = sunday.toISOString().slice(0, 10);
    out.push({ date, type: "Sunday 1st Service", startUtc: `${date}T15:30:00Z` });
    out.push({ date, type: "Sunday 2nd Service", startUtc: `${date}T17:45:00Z` });
    if (i % 2 === 1) {
      const tue = new Date(sunday.getTime() + 2 * 24 * HOUR).toISOString().slice(0, 10);
      if (tue < TODAY) out.push({ date: tue, type: "Tuesday Bible Study", startUtc: `${tue}T00:30:00Z` });
    }
  }
  // A small, still-open backlog from earlier years (the 2024 load is real data the teams close by hand).
  out.push({ date: "2025-03-09", type: "Sunday 1st Service", startUtc: "2025-03-09T15:30:00Z" });
  out.push({ date: "2024-06-16", type: "Sunday 2nd Service", startUtc: "2024-06-16T17:45:00Z" });
  return out;
}

type ServiceSlot = { date: string; type: string; startUtc: string; hist?: boolean };

/**
 * Older services back to January 2025, so year-to-date and same-period-last-year
 * comparisons have something to compare. Their journeys are finished (Completed or Closed).
 */
function historicalDates(): ServiceSlot[] {
  const out: ServiceSlot[] = [];
  const recentStart = serviceDates()
    .map((x) => x.date)
    .filter((x) => x >= "2026-01-01")
    .sort()[0]!;
  const d = new Date("2025-01-05T12:00:00Z");
  let i = 0;
  while (d.toISOString().slice(0, 10) < recentStart) {
    const date = d.toISOString().slice(0, 10);
    if (date !== "2025-03-09") {
      out.push({ date, type: "Sunday 1st Service", startUtc: `${date}T15:30:00Z`, hist: true });
      out.push({ date, type: "Sunday 2nd Service", startUtc: `${date}T17:45:00Z`, hist: true });
      if (i % 3 === 0) {
        const tue = new Date(d.getTime() + 2 * 24 * HOUR).toISOString().slice(0, 10);
        out.push({ date: tue, type: "Tuesday Bible Study", startUtc: `${tue}T00:30:00Z`, hist: true });
      }
    }
    d.setUTCDate(d.getUTCDate() + 7);
    i++;
  }
  return out;
}

const LATEST_SUNDAY = (() => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
})();

export const ALL_SERVICE_DATES = [...new Set([...serviceDates(), ...historicalDates()].map((s) => s.date))].sort().reverse();

/* ----------------------------------------------------------------- journeys */

export type ConnectRecord = {
  connectId: number;
  guestId: number;
  entry: GuestEntry;
  status: JourneyStatus;
  closedReason: string | null;
  phase: Phase;
  clockStartAt: string;
  coMemberId: string | null;
  itMemberId: string | null;
  coAttempts: number;
  coLastCallOutcome: string | null;
  itContacted: boolean;
  state: GuestState;
  checklist: Record<StepKey, ChecklistEntry>;
  legacyNotes: { text: string; by: string | null }[];
  rowVer: number;
};

const staff = (id: string) => STAFF.find((s) => s.id === id)!;
/** Assignable pools, by follow-up team (doc 02 AC-03). */
const CO_POOL = ["u06", "u07", "u05", "u03", "u10", "u17"];
const IT_POOL = ["u09", "u10", "u08", "u01", "u03"];
/** Latest Sunday (8 guests over both services): who gets them, in order. */
const LATEST_CO: (string | null)[] = ["u06", "u07", "u06", null, "u05", "u10", "u17", "u06"];
const LATEST_IT: (string | null)[] = ["u09", "u10", "u09", "u01", null, "u09", "u08", null];

const emptyChecklist = () => Object.fromEntries(STEP_KEYS.map((k) => [k, null])) as Record<StepKey, ChecklistEntry>;
const emptyMulti = () => Object.fromEntries(MULTI_KEYS.map((k) => [k, false])) as Record<MultiKey, boolean>;

export function seedConnect() {
  const records: ConnectRecord[] = [];
  const logs: LogRow[] = [];
  let connectId = 100;
  let guestId = 5000;
  let logId = 1;
  let latestIndex = 0;
  const usedNames = new Set<string>();

  const at = (base: number, hoursLater: number) => new Date(Math.min(base + hoursLater * HOUR, NOW.getTime() - HOUR)).toISOString();

  for (const svc of [...serviceDates(), ...historicalDates()] as ServiceSlot[]) {
    const latest = svc.date === LATEST_SUNDAY;
    const hist = !!svc.hist;
    const count = latest
      ? 4
      : hist
        ? (svc.type === "Tuesday Bible Study" ? 0 : 1) + Math.floor(rnd() * (svc.date >= "2026-01-01" ? 4 : 3))
        : svc.type === "Tuesday Bible Study"
          ? 1 + Math.floor(rnd() * 2)
          : svc.date < "2026-01-01"
            ? 1
            : 2 + Math.floor(rnd() * 3);
    const ageDays = (NOW.getTime() - new Date(svc.startUtc).getTime()) / (24 * HOUR);

    for (let n = 0; n < count; n++) {
      let first = pick(FIRST);
      let last = pick(LAST);
      while (usedNames.has(`${first} ${last}`)) {
        first = pick(FIRST);
        last = pick(LAST);
      }
      usedNames.add(`${first} ${last}`);
      const away = chance(0.06) ? pick(OUT_OF_AREA) : null;
      const zip: string | null = away ? away.zip : chance(0.75) ? pick(Object.keys(CELL_ZIPS)) : pick(OTHER_ZIPS);
      const phone = chance(0.95) ? `(${pick(["281", "832", "713"])}) 555-0${100 + Math.floor(rnd() * 99)}` : null;
      const submitted = new Date(new Date(svc.startUtc).getTime() + (60 + rnd() * 90) * 60_000);
      const id = ++guestId;
      const entry: GuestEntry = {
        id,
        entriesThatDay: chance(0.05) ? 2 : 1,
        submittedAt: submitted.toISOString(),
        serviceDate: svc.date,
        serviceType: svc.type,
        firstName: first,
        middleName: chance(0.2) ? pick(FIRST) : null,
        lastName: last,
        gender: chance(0.5) ? "Female" : "Male",
        maritalStatus: pick(["Single", "Married", "Married", null]),
        dob: chance(0.4) ? `${1960 + Math.floor(rnd() * 45)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}` : null,
        ageBracket: pick(AGES),
        nationality: pick(["Nigeria", "United States", "Ghana", "Kenya", null]),
        address: `${100 + Math.floor(rnd() * 9800)} ${pick(["Mason", "Fry", "Pin Oak", "Westheimer", "Clay", "Grand Pkwy"])} ${pick(["Rd", "St", "Dr"])}`,
        apt: chance(0.2) ? `${Math.floor(rnd() * 300)}` : null,
        city: away ? away.city : (CITY[zip!] ?? "Houston"),
        state: away ? away.state : "TX",
        zip,
        country: away ? away.country : "United States",
        phone,
        email: chance(0.8) ? `${first}.${last}`.toLowerCase() + "@example.com" : null,
        bestTimeToVisit: pick(["Weekday evenings", "Saturday afternoon", null]),
        howHeard: pick(HOW),
        howHeardOther: null,
        whoInvitedYou: null,
        invitingCellGroup: null,
        willComeAgain: pick(["Yes", "Yes", "Maybe", null]),
        giveThoughtToMembership: null,
        likeToBecomeMember: pick(["Yes", "Undecided", "No", null]),
        likelyNeverComeAgain: null,
        ifYesWhy: null,
        prayerRequest: chance(0.4) ? pick(["Pray for a new job for my husband.", "Healing for my mother.", "Guidance as we settle in Katy."]) : null,
        comments: chance(0.3) ? pick(["The choir was wonderful.", "Very welcoming ushers.", "Loved the message."]) : null,
        ratings: { Music: 7 + Math.floor(rnd() * 4), Preaching: 8 + Math.floor(rnd() * 3), Comfort: 5 + Math.floor(rnd() * 6), Hospitality: 8 + Math.floor(rnd() * 3), ChurchEnvironment: 7 + Math.floor(rnd() * 4), ThePeople: 8 + Math.floor(rnd() * 3), Traffic: chance(0.5) ? null : 4 + Math.floor(rnd() * 7), Parking: chance(0.3) ? null : 3 + Math.floor(rnd() * 8) },
        cellGroup: (zip && CELL_ZIPS[zip]) || "N/A",
        visitNumber: 1,
      };
      if (entry.howHeard === "Invited By Someone") entry.whoInvitedYou = chance(0.6) ? pick(INVITERS) : `${pick(FIRST)} ${pick(LAST)}`;
      if (entry.howHeard === "Other") entry.howHeardOther = pick(OTHER_ANSWERS);

      // An entry with no phone and no name cannot be followed up (BR-03); every seed guest has a name.
      const r: ConnectRecord = {
        connectId: ++connectId,
        guestId: id,
        entry,
        status: "Active",
        closedReason: null,
        phase: 1,
        clockStartAt: entry.submittedAt,
        coMemberId: null,
        itMemberId: null,
        coAttempts: 0,
        coLastCallOutcome: null,
        itContacted: false,
        state: {
          coWantsMembership: null,
          coNoReason: null,
          coNoOtherDetails: null,
          coNextAction: null,
          itMembership: null,
          itWorkforce: null,
          itDepartmentId: null,
          itLifeGroup: null,
          multi: emptyMulti(),
          returned2ndVisit: false,
          returnVisitDate: null,
        },
        checklist: emptyChecklist(),
        legacyNotes: [],
        rowVer: 1,
      };
      const start = new Date(r.clockStartAt).getTime();

      if (hist) {
        // A finished journey: the teams completed it or closed it.
        r.coMemberId = pick(CO_POOL);
        r.itMemberId = pick(IT_POOL);
        r.coAttempts = 1;
        r.coLastCallOutcome = "Reached";
        r.itContacted = true;
        // When the welcome call happened (LCM 48-hour contact rate). Worked out from the id, not
        // rnd(), so the rest of the seed stays the same: five in six within 48 hours, the rest up to 4 days.
        const coAuthor = staff(r.coMemberId);
        r.checklist.CoWelcomeCall = { at: at(start, id % 6 === 0 ? 50 + ((id * 37) % 46) : 6 + ((id * 37) % 40)), byId: coAuthor.id, by: coAuthor.fullName };
        if (chance(0.55)) {
          r.status = "Completed";
          r.phase = 3;
          r.state.itMembership = "Interested";
          // Two in three joined a cell group, recorded when Phase 1 finished (LCM cell placement rate).
          if (id % 3 !== 0) {
            const itAuthor = staff(r.itMemberId);
            r.state.itLifeGroup = "Joined Cell Group";
            r.checklist.P1Complete = { at: at(start, 24 * (9 + (id % 30))), byId: itAuthor.id, by: itAuthor.fullName };
          }
        } else {
          r.status = "Closed";
          r.closedReason = pick(["Not interested (Church office)", "Not interested (Integration)", "Moved", "Unreachable", "Other"]);
          if (r.closedReason === "Not interested (Integration)") r.state.itMembership = "Not Interested";
        }
        records.push(r);
        continue;
      }

      // Assignment: the newest service is only partly assigned.
      if (latest) {
        // The newest service: a fixed spread so every demo person has guests, and a few are still unassigned.
        r.coMemberId = LATEST_CO[latestIndex % LATEST_CO.length]!;
        r.itMemberId = LATEST_IT[latestIndex % LATEST_IT.length]!;
        latestIndex++;
      } else {
        const assignP = ageDays < 4 ? 0.6 : 0.95;
        if (chance(assignP)) r.coMemberId = pick(CO_POOL);
        if (chance(assignP)) r.itMemberId = pick(IT_POOL);
      }

      // Church Office: the one welcome call (up to 3 attempts).
      if (r.coMemberId && ageDays > 1 && chance(ageDays < 4 ? 0.45 : 0.9)) {
        const author = staff(r.coMemberId);
        const reached = chance(0.7);
        const tries = reached ? 1 : 1 + Math.floor(rnd() * 3);
        for (let t = 1; t <= tries; t++) {
          const last = t === tries;
          const method = last && reached ? "Phone Call" : t === 1 ? "Phone Call" : "SMS";
          const outcome = method === "Phone Call" ? (last && reached ? "Reached" : "No answer") : "Delivered";
          const wants = last && reached ? pick(["Yes", "Yes", "Undecided", "No"]) : null;
          const next = last && reached ? (wants === "No" && chance(0.5) ? CO_CLOSING_ACTION : "Proceed to Integration Team") : t === 1 ? "No response (retry 2 of 3)" : "No Response (retry 3 of 3)";
          // First attempt usually the evening after; retries 2–3 days apart.
          const savedAt = at(start, (t === 1 ? 6 + Math.floor(rnd() * 60) : 0) + (t - 1) * 60);
          logs.push(logRow(logId++, r, "church_office", author.id, author.fullName, savedAt, {
            method,
            callOutcome: outcome,
            wantsMembership: wants,
            noReason: wants === "No" ? "Visiting" : null,
            nextAction: next,
            sopStep: last && reached ? "Initial welcome call / text" : null,
            note: last && reached ? pick(["Lovely chat. Moved to Katy in the summer.", "Thanked us for the welcome; has two kids.", "Busy at work but keen to come back."]) : null,
            stepsTicked: last && reached ? ["CoWelcomeCall"] : [],
          }));
          r.coAttempts++;
          r.coLastCallOutcome = outcome;
          if (wants) r.state.coWantsMembership = wants;
          if (wants === "No") r.state.coNoReason = "Visiting";
          r.state.coNextAction = next;
          if (last && reached) r.checklist.CoWelcomeCall = { at: savedAt, byId: author.id, by: author.fullName };
          if (next === CO_CLOSING_ACTION) {
            r.status = "Closed";
            r.closedReason = "Not interested (Church office)";
          }
        }
      }

      // Integration: the 12-week journey, as far as the weeks allow.
      if (r.status === "Active" && r.itMemberId && ageDays > 1) {
        const author = staff(r.itMemberId);
        const weeks = Math.floor(ageDays / 7) + 1;
        const target: Phase = weeks >= 5 ? 3 : weeks >= 3 ? 2 : 1;
        const keepUp = chance(0.8);
        let hours = 30;
        for (const p of [1, 2, 3] as Phase[]) {
          if (p > target) break;
          const items = STEPS[p];
          const howMany = p < target ? items.length : Math.min(items.length - 1, Math.floor(rnd() * (keepUp ? items.length : 2)));
          const ticked: StepKey[] = [];
          for (let i = 0; i < howMany; i++) {
            const key = items[i]!.key;
            // A slow start leaves the 48 Hr Welcome undone (BR-13 overdue).
            if (key === "P1Welcome48h" && ageDays < 5 && !keepUp) continue;
            const savedAt = at(start, hours);
            r.checklist[key] = { at: savedAt, byId: author.id, by: author.fullName };
            ticked.push(key);
            // Some steps land after their KPI deadline, as in real life.
            hours += p === 1 ? 14 + Math.floor(rnd() * (keepUp ? 60 : 160)) : 90;
          }
          if (!ticked.length) continue;
          r.itContacted = true;
          if (p === 1) {
            r.state.itMembership = pick(["Interested", "Interested", "Undecided"]);
            r.state.itLifeGroup = pick(["Undecided", "Joined Cell Group"]);
          }
          if (p === 2) {
            r.state.itWorkforce = pick(["Interested", "Undecided"]);
            if (r.state.itWorkforce === "Interested") r.state.itDepartmentId = pick(DEPARTMENTS).id;
            r.state.multi.SpBelieversClass = chance(0.5);
            r.state.multi.SpWaterBaptism = !r.state.multi.SpBelieversClass && chance(0.4);
            r.state.multi.SpNotApplicable = !r.state.multi.SpBelieversClass && !r.state.multi.SpWaterBaptism;
            r.state.multi.OtNotApplicable = true;
          }
          logs.push(logRow(logId++, r, "integration", author.id, author.fullName, r.checklist[ticked[ticked.length - 1]!]!.at, {
            method: pick(["Phone Call", "WhatsApp Call", "WhatsApp Text"]),
            callOutcome: null,
            phase: p,
            membership: r.state.itMembership,
            workforce: r.state.itWorkforce,
            department: DEPARTMENTS.find((d) => d.id === r.state.itDepartmentId)?.name ?? null,
            lifeGroup: r.state.itLifeGroup,
            spiritual: [],
            other: [],
            note: pick(["Good conversation; prayed together.", "Asked about the youth programme.", "Will visit the cell group next week."]),
            stepsTicked: ticked,
          }));
        }
        r.phase = r.checklist.P2Complete ? 3 : r.checklist.P1Complete ? 2 : 1;
        if (r.checklist.P3Complete) r.status = "Completed";
        // Fix the method/outcome pairing on the logs we just wrote (BR-08).
        for (const l of logs) {
          if (l.connectId === r.connectId && l.team === "integration" && !l.callOutcome) {
            l.callOutcome = l.method === "WhatsApp Text" ? "Replied" : "Reached";
          }
        }
        // A few say "not interested" (BR-11).
        if (r.status === "Active" && weeks > 3 && chance(0.06)) {
          r.status = "Closed";
          r.closedReason = "Not interested (Integration)";
          r.state.itMembership = "Not Interested";
        }
      }

      if (svc.date < "2026-01-01") r.legacyNotes = [{ text: "Called after first visit, no answer. Left voicemail.", by: "Grace" }];
      records.push(r);
    }
  }

  // Repeat visits: a few people came back (visitNumber > 1 on later entries is Welcome's concern; here only the return flag).
  for (const r of records.filter((x) => x.phase >= 2 && x.status === "Active").slice(0, 4)) {
    const later = ALL_SERVICE_DATES.filter((d) => d > r.entry.serviceDate && d < TODAY).at(-1);
    if (later) {
      r.state.returned2ndVisit = true;
      r.state.returnVisitDate = later;
    }
  }

  // Repeat entries: some people filled in the form again on a later visit (BR-02/03:
  // same person by phone, no second journey; Welcome counts the visit number).
  const entries: WelcomeEntry[] = records.map((r) => ({ ...r.entry, connectId: r.connectId, legacyNotes: r.legacyNotes }));
  const returners = records.filter((r) => r.entry.phone && r.entry.serviceDate >= "2025-06-01").filter(() => chance(0.07));
  for (const r of returners) {
    const later = ALL_SERVICE_DATES.filter((d) => d > r.entry.serviceDate && d <= TODAY);
    if (!later.length) continue;
    const date = later[Math.floor(rnd() * Math.min(later.length, 6)) + Math.max(0, later.length - 6)] ?? later[0]!;
    const submitted = new Date(`${date}T17:20:00Z`);
    if (submitted.getTime() > NOW.getTime()) continue;
    entries.push({
      ...r.entry,
      id: ++guestId,
      serviceDate: date,
      serviceType: new Date(`${date}T12:00:00Z`).getUTCDay() === 2 ? "Tuesday Bible Study" : "Sunday 2nd Service",
      submittedAt: submitted.toISOString(),
      entriesThatDay: 1,
      visitNumber: 2,
      prayerRequest: null,
      comments: chance(0.5) ? "Glad to be back." : null,
      connectId: r.connectId,
      legacyNotes: [],
    });
  }

  return { records, logs: logs.sort((a, b) => b.savedAt.localeCompare(a.savedAt)), entries };
}

/** A welcome-form entry as Welcome sees it (TKP Connect vw_WelcomeGuest), linked to the person's journey. */
export type WelcomeEntry = GuestEntry & { connectId: number; legacyNotes: { text: string; by: string | null }[] };

function logRow(
  logId: number,
  r: ConnectRecord,
  team: "church_office" | "integration",
  authorId: string,
  author: string,
  savedAt: string,
  extra: Partial<LogRow>,
): LogRow {
  return {
    logId,
    connectId: r.connectId,
    team,
    authorId,
    author,
    savedAt,
    guest: `${r.entry.firstName} ${r.entry.lastName}`,
    serviceDate: r.entry.serviceDate,
    method: "Phone Call",
    callOutcome: null,
    sopStep: null,
    wantsMembership: null,
    noReason: null,
    nextAction: null,
    phase: null,
    membership: null,
    workforce: null,
    department: null,
    lifeGroup: null,
    spiritual: [],
    other: [],
    note: null,
    returned2ndVisit: null,
    returnVisitDate: null,
    stepsTicked: [],
    stepsUnticked: [],
    ...extra,
  };
}
