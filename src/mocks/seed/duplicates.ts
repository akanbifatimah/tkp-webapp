import { STEP_KEYS, MULTI_KEYS, type MultiKey, type StepKey } from "@/features/connect/model";
import type { ChecklistEntry, LogRow } from "@/features/connect/types";
import { churchDate } from "@/lib/time";
import { ALL_SERVICE_DATES, type ConnectRecord, type WelcomeEntry } from "./guests";
import { STAFF } from "./staff";

/**
 * The five fictional duplicate cases for Welcome › Duplicates (PRD W-14).
 * Every other seed guest has their own phone and email, so these are the only
 * groups the screen finds. Names, phones and emails are made up.
 *
 * 1. Marcus Adeleke filled in the form again weeks later and got a second journey.
 * 2. Funmilayo Okoro / "Funmi" Okoro: same email, phone written another way.
 * 3. Kunle and Bisi Durojaiye, a couple sharing one phone: not the same person.
 * 4. Gabriel Osei: same phone, two active journeys with different callers.
 * 5. Anita Cole-Mensah: three records, linked by email and phone.
 */

type Seed = { records: ConnectRecord[]; logs: LogRow[]; entries: WelcomeEntry[] };
const HOUR = 3_600_000;
const staffName = (id: string) => STAFF.find((s) => s.id === id)!.fullName;
const later = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * HOUR).toISOString();

export function addDuplicates(seed: Seed): Seed {
  const { records, logs, entries } = seed;
  const today = churchDate(new Date());
  const sundays = ALL_SERVICE_DATES.filter((d) => d < today && new Date(`${d}T12:00:00Z`).getUTCDay() === 0); // newest first
  let connectId = Math.max(...records.map((r) => r.connectId));
  let guestId = Math.max(...records.map((r) => r.guestId));
  let entryId = Math.max(...entries.map((e) => e.id));
  let logId = Math.max(...logs.map((l) => l.logId));

  // Bases: active first-time guests from 3 to 10 weeks ago who already have follow-up notes.
  const bases = records.filter(
    (r) => r.status === "Active" && r.entry.serviceDate >= sundays[10]! && r.entry.serviceDate <= sundays[3]! && logs.some((l) => l.connectId === r.connectId),
  );
  let next = 0;
  // Five different people, spread over the weeks.
  const step = Math.max(1, Math.floor(bases.length / 5));
  const base = () => bases[Math.min(next++ * step, bases.length - 1)]!;

  /** Give an existing record a case's identity, on every entry and log too. */
  const become = (r: ConnectRecord, who: Partial<WelcomeEntry>) => {
    Object.assign(r.entry, who);
    for (const e of entries) if (e.connectId === r.connectId) Object.assign(e, who);
    const name = `${r.entry.firstName} ${r.entry.lastName}`;
    for (const l of logs) if (l.connectId === r.connectId) l.guest = name;
    return r;
  };

  /** A second record for the same person: a new journey, one welcome call. */
  const another = (from: ConnectRecord, date: string, who: Partial<WelcomeEntry>, co: string, it: string | null) => {
    const submittedAt = `${date}T19:05:00Z`;
    const entry = {
      ...from.entry,
      id: ++entryId,
      serviceDate: date,
      serviceType: "Sunday 2nd Service",
      submittedAt,
      entriesThatDay: 1,
      visitNumber: 1,
      comments: null,
      prayerRequest: null,
      ...who,
    };
    const callAt = later(submittedAt, 22);
    const checklist = Object.fromEntries(STEP_KEYS.map((k) => [k, null])) as Record<StepKey, ChecklistEntry>;
    checklist.CoWelcomeCall = { at: callAt, byId: co, by: staffName(co) };
    const r: ConnectRecord = {
      connectId: ++connectId,
      guestId: ++guestId,
      entry,
      status: "Active",
      closedReason: null,
      phase: 1,
      clockStartAt: submittedAt,
      coMemberId: co,
      itMemberId: it,
      coAttempts: 1,
      coLastCallOutcome: "Reached",
      itContacted: false,
      state: {
        coWantsMembership: "Yes",
        coNoReason: null,
        coNoOtherDetails: null,
        coNextAction: "Proceed to Integration Team",
        itMembership: null,
        itWorkforce: null,
        itDepartmentId: null,
        itLifeGroup: null,
        multi: Object.fromEntries(MULTI_KEYS.map((k) => [k, false])) as Record<MultiKey, boolean>,
        returned2ndVisit: false,
        returnVisitDate: null,
      },
      checklist,
      legacyNotes: [],
      rowVer: 1,
    };
    records.push(r);
    entries.push({ ...entry, connectId: r.connectId, legacyNotes: [] });
    logs.push({
      logId: ++logId,
      connectId: r.connectId,
      team: "church_office",
      authorId: co,
      author: staffName(co),
      savedAt: callAt,
      guest: `${entry.firstName} ${entry.lastName}`,
      serviceDate: date,
      method: "Phone Call",
      callOutcome: "Reached",
      sopStep: "Initial welcome call / text",
      wantsMembership: "Yes",
      noReason: null,
      nextAction: "Proceed to Integration Team",
      phase: null,
      membership: null,
      workforce: null,
      department: null,
      lifeGroup: null,
      spiritual: [],
      other: [],
      note: "Said they had been before and filled in the card again.",
      returned2ndVisit: null,
      returnVisitDate: null,
      stepsTicked: ["CoWelcomeCall"],
      stepsUnticked: [],
    });
    return r;
  };

  // 1. The plain case: same name, phone and email; the second journey started from scratch.
  const marcus = { firstName: "Marcus", middleName: null, lastName: "Adeleke", phone: "(281) 555-0142", email: "marcus.adeleke@example.com" };
  another(become(base(), marcus), sundays[1]!, marcus, "u07", "u10");

  // 2. Same email; the phone is the same number written another way, and the first name is shortened.
  const funmi = become(base(), { firstName: "Funmilayo", middleName: null, lastName: "Okoro", phone: "(832) 555-0167", email: "funmi.okoro@example.com" });
  another(funmi, sundays[2]!, { firstName: "Funmi", lastName: "Okoro", phone: "+1 832-555-0167", email: "Funmi.Okoro@example.com", address: null, apt: null }, "u06", null);

  // 3. A couple sharing the home phone: not the same person. Staff mark it "not the same person".
  const kunle = become(base(), { firstName: "Kunle", middleName: null, lastName: "Durojaiye", phone: "(713) 555-0118", email: "kunle.durojaiye@example.com", gender: "Male", maritalStatus: "Married" });
  another(kunle, sundays[4]!, { firstName: "Bisi", lastName: "Durojaiye", phone: "(713) 555-0118", email: "bisi.d@example.com", gender: "Female", maritalStatus: "Married" }, "u05", "u09");

  // 4. Same phone, both journeys active, different callers on each.
  const gabriel = become(base(), { firstName: "Gabriel", middleName: null, lastName: "Osei", phone: "(281) 555-0193", email: null });
  another(gabriel, sundays[1]!, { firstName: "Gabriel", lastName: "Osei", phone: "281-555-0193", email: "gabe.osei@example.com" }, "u05", "u15");

  // 5. Three records: the first has a phone, the second shares its email, the third its phone.
  const anita = become(base(), { firstName: "Anita", middleName: null, lastName: "Cole-Mensah", phone: "(832) 555-0125", email: "anita.cm@example.com" });
  another(anita, sundays[2]!, { firstName: "Anita", lastName: "Cole-Mensah", phone: null, email: "anita.cm@example.com" }, "u06", "u09");
  another(anita, sundays[0]!, { firstName: "Anita", lastName: "Cole Mensah", phone: "832 555 0125", email: null }, "u07", null);

  return seed;
}
