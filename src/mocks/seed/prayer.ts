import type { PosterKind, PrayerCategory, PrayerSettings, PrivateStatus } from "@/features/care/prayer-types";

/**
 * Prayer Wall mock data (M9 step 1). Fictional requests in the voice of the
 * Figma member Prayer Wall (G4, 220:1441). Dated from page load.
 */

export type Poster = { kind: PosterKind; name: string | null; email: string | null; device: string };

export type PrayerRecord = {
  id: string;
  text: string;
  category: PrayerCategory;
  /** A first name, or null when anonymous. */
  name: string | null;
  poster: Poster;
  status: "pending" | "published" | "hidden" | "removed";
  createdAt: string;
  publishedAt: string | null;
  answered: boolean;
  /** "poster" when they marked it themselves (PR-8); otherwise the moderator's staff id. */
  answeredBy: { byId: string | "poster"; at: string } | null;
  /** Devices or people who pressed "Pray" (PR-6): counted, never shown. */
  prayedBy: string[];
  reports: { device: string; reason: string; at: string }[];
  distress: string[];
  notes: { byId: string; text: string; at: string }[];
  edited: { byId: string; at: string; reason: string; before: string } | null;
  moderatedById: string | null;
  moderatedAt: string | null;
  removedReason: string | null;
  purgeAt: string | null;
  rowVer: number;
};

export type PrivateRecord = {
  id: string;
  text: string;
  category: PrayerCategory;
  name: string | null;
  contact: string | null;
  poster: Poster;
  createdAt: string;
  status: PrivateStatus;
  distress: string[];
  prayedBy: { byId: string; at: string }[];
  notes: { byId: string; text: string; at: string }[];
  rowVer: number;
};

/** PR-9 starting list. Moderators change it in Settings; matching flags a post for a person, nothing more. */
export const DEFAULT_DISTRESS_WORDS = ["suicide", "kill myself", "end my life", "no reason to live", "hurt myself", "self-harm", "can't go on", "abuse", "unsafe at home"];

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  mode: "hold",
  reportThreshold: 3,
  distressWords: DEFAULT_DISTRESS_WORDS,
  retentionDays: 180,
  purgeDays: 30,
  /** Placeholders until TKP gives its own: the church line is fictional; 988 is the US Suicide and Crisis Lifeline. */
  careResources: [
    { label: "TKP pastoral care line", phone: "(281) 555-0100" },
    { label: "988 Suicide and Crisis Lifeline (call or text)", phone: "988" },
  ],
  rowVer: 1,
  updatedBy: null,
  updatedAt: null,
};

export const distressIn = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  return words.filter((w) => w.trim() && t.includes(w.trim().toLowerCase()));
};

const HOUR = 3_600_000;
const member = (name: string, n: number): Poster => ({ kind: "member", name, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, device: `dev-m${n}` });
const guest = (n: number): Poster => ({ kind: "guest", name: null, email: null, device: `dev-g${n}` });
const learner = (name: string, n: number): Poster => ({ kind: "learner", name, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, device: `dev-l${n}` });

type Row = [text: string, category: PrayerCategory, name: string | null, poster: Poster, hoursAgo: number, prayed: number, extra?: Partial<PrayerRecord>];

const WALL: Row[] = [
  ["Please pray for my mother recovering from surgery. Believing God for strength, steady vitals, and deep peace for the attending team.", "Healing", "Amara", member("Amara Okafor", 1), 2, 18],
  ["Seeking wisdom on a relocation decision for our family in Katy. That the Lord directs our path and opens the right doors.", "Guidance", "David", member("David Mensah", 2), 5, 12],
  ["Praying for my teenage son preparing for exams. Protection from stress, clarity of mind, and good restful sleep throughout the week.", "Family", "Chioma", member("Chioma Eze", 3), 26, 15],
  ["Trusting God for favour in a final interview this Friday in the Houston energy corridor. That God's grace shines in every conversation.", "Work", "Kola", member("Kola Adeyemi", 4), 30, 22],
  ["Praising God for permanent visa approval after 3 years of waiting! Our God is truly a covenant-keeping God.", "Thanksgiving", "Bose", member("Bose Lawal", 5), 50, 29, { answered: true }],
  ["Praying for quick recovery for our little niece admitted for asthma care. Believing God for ease in breathing and safe discharge home.", "Healing", "Folake", member("Folake Taiwo", 6), 74, 14],
  ["My husband starts a new job on Monday. Pray for favour with his manager and for peace at home as we adjust.", "Work", null, guest(1), 80, 9],
  ["For my father, who has not spoken to me in two years. That God softens both our hearts.", "Family", "Ruth", member("Ruth Coker", 7), 96, 31],
  ["Thank you, church family. The scan came back clear!", "Thanksgiving", "Grace", member("Grace Daramola", 8), 110, 40, { answered: true }],
  ["Pray for our small business through a slow season. Wisdom to keep our staff and serve our customers well.", "Work", "Emeka", member("Emeka Nnamdi", 9), 130, 11],
  ["First time visiting last Sunday. Please pray I find a church family here.", "Guidance", null, guest(2), 150, 26],
  ["Studying for nursing board exams next month. Focus and peace.", "Work", "Ifeoma", learner("Ifeoma Okeke", 1), 170, 17],
  ["Healing for my back pain so I can return to serving in the children's ministry.", "Healing", "Tolu", member("Tolu Awosika", 10), 200, 8],
  ["For the families affected by the flooding on the east side. Provision and safety.", "Other", "Seun", member("Seun Williams", 11), 240, 33],
  ["That my daughter settles well into her new school.", "Family", null, guest(3), 260, 6],
  ["Grateful for a safe delivery. Baby Ayomide arrived on Tuesday!", "Thanksgiving", "Bisi", member("Bisi Ogunbiyi", 12), 300, 45, { answered: true }],
];

const REVIEW: Row[] = [
  ["Please pray for my marriage. We are struggling to communicate and I feel very alone.", "Family", null, guest(4), 1.5, 0, { status: "pending", publishedAt: null }],
  ["Believing God for a breakthrough in my immigration case hearing next Thursday.", "Guidance", "Kunle", member("Kunle Durojaiye", 13), 3, 0, { status: "pending", publishedAt: null }],
  ["Some days I feel there is no reason to live. Please pray for me.", "Healing", null, guest(5), 4, 0, { status: "pending", publishedAt: null }],
  ["Thanksgiving for my mum's 70th birthday this weekend!", "Thanksgiving", "Ngozi", member("Ngozi Obi", 14), 6, 0, { status: "pending", publishedAt: null }],
  ["For a new job after six months of searching. Pray God opens a door.", "Work", "Daniel", learner("Daniel Taiwo", 2), 7, 0, { status: "pending", publishedAt: null }],
];

export function seedPrayer(now = Date.now()) {
  const at = (h: number) => new Date(now - h * HOUR).toISOString();
  let n = 1;
  const make = ([text, category, name, poster, h, prayed, extra]: Row): PrayerRecord => ({
    id: `pr-${n++}`,
    text,
    category,
    name,
    poster,
    status: "published",
    createdAt: at(h),
    publishedAt: at(Math.max(0, h - 0.5)),
    answered: false,
    answeredBy: null,
    prayedBy: Array.from({ length: prayed }, (_, i) => `dev-p${n}-${i}`),
    reports: [],
    distress: distressIn(text, DEFAULT_DISTRESS_WORDS),
    notes: [],
    edited: null,
    moderatedById: extra?.status === "pending" ? null : "u25",
    moderatedAt: extra?.status === "pending" ? null : at(Math.max(0, h - 0.5)),
    removedReason: null,
    purgeAt: null,
    rowVer: 1,
    ...extra,
    // Seeded answered requests were marked by the people who posted them (PR-8).
    ...(extra?.answered ? { answeredBy: { byId: "poster" as const, at: at(Math.max(0, h - 12)) } } : {}),
  });
  const posts = [...REVIEW.map(make), ...WALL.map(make)];

  // Taken off the wall by reports (PR-5), waiting for a moderator.
  posts.push(
    make([
      "Everyone should come to my prayer meeting on Saturday, call 832 for details and bring your friends",
      "Other",
      "Mark",
      guest(6),
      20,
      2,
      { status: "hidden", reports: [0, 1, 2].map((i) => ({ device: `dev-r${i}`, reason: i === 0 ? "Advertising" : "Spam", at: at(19 - i) })) },
    ]),
    make([
      "Pray that my neighbour finally stops being so rude and gets what they deserve.",
      "Other",
      null,
      guest(7),
      44,
      1,
      { status: "hidden", reports: [0, 1, 2].map((i) => ({ device: `dev-s${i}`, reason: "Unkind", at: at(40 - i) })) },
    ]),
  );
  // Removed by a moderator; deleted for good after 30 days (PR-11).
  posts.push(
    make([
      "Buy cheap gold at my store downtown, God bless.",
      "Other",
      null,
      guest(8),
      120,
      0,
      { status: "removed", removedReason: "Advertising", moderatedById: "u25", moderatedAt: at(118), purgeAt: new Date(now - 118 * HOUR + 30 * 24 * HOUR).toISOString() },
    ]),
  );
  // A post a moderator tidied up (PR-4: approve, edit, remove and leave notes).
  const edited = posts.find((p) => p.text.startsWith("For my father"))!;
  edited.edited = { byId: "u26", at: at(95), reason: "Took out a surname", before: "For my father Mr Coker, who has not spoken to me in two years. That God softens both our hearts." };
  edited.notes.push({ byId: "u26", text: "Asked Pastor to check in with Ruth after service.", at: at(94) });

  const privates: PrivateRecord[] = [
    { id: "pv-1", text: "My husband lost his job and we are behind on rent. We don't want everyone to know. Please pray.", category: "Family", name: "Funmi", contact: "funmi.adeleke@example.com", poster: member("Funmi Adeleke", 20), createdAt: at(3), status: "new", distress: [], prayedBy: [], notes: [], rowVer: 1 },
    { id: "pv-2", text: "I have been unsafe at home for a while. I don't know who to talk to.", category: "Family", name: null, contact: null, poster: guest(20), createdAt: at(8), status: "new", distress: ["unsafe at home"], prayedBy: [], notes: [], rowVer: 1 },
    { id: "pv-3", text: "Waiting on biopsy results next week. I'm scared.", category: "Healing", name: "Paul", contact: "(281) 555-0144", poster: member("Paul Johnson", 21), createdAt: at(30), status: "praying", distress: [], prayedBy: [{ byId: "u25", at: at(28) }, { byId: "u26", at: at(20) }], notes: [], rowVer: 1 },
    { id: "pv-4", text: "Struggling with addiction and want to be free. Please keep this private.", category: "Healing", name: "J.", contact: null, poster: guest(21), createdAt: at(60), status: "follow_up", distress: [], prayedBy: [{ byId: "u26", at: at(55) }], notes: [{ byId: "u26", text: "Left no contact. Pastor to mention the recovery group from the pulpit, without names.", at: at(54) }], rowVer: 1 },
    { id: "pv-5", text: "Thank you for praying. My visa came through.", category: "Thanksgiving", name: "Grace", contact: null, poster: member("Grace Mensah", 22), createdAt: at(200), status: "closed", distress: [], prayedBy: [{ byId: "u25", at: at(190) }], notes: [], rowVer: 1 },
    { id: "pv-6", text: "Pray for wisdom as I decide whether to go back to school.", category: "Guidance", name: "Tobi", contact: "tobi.k@example.com", poster: learner("Tobi Kehinde", 23), createdAt: at(14), status: "new", distress: [], prayedBy: [], notes: [], rowVer: 1 },
  ];
  return { posts, privates };
}
