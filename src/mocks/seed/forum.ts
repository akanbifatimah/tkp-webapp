import type { ThreadKind } from "@/features/grow/grow-types";
import type { EnrolmentRecord } from "./grow";

/**
 * The cohort forum (M8 step 5; Figma 136:29952 "Cohort Community & Forum",
 * 136:30735 "Forum thread detail"). Fictional posts, dated from page load.
 */

type HiddenRecord = { byId: string; reason: string; at: string } | null;

export type ThreadRecord = {
  id: string;
  courseId: string;
  kind: ThreadKind;
  session: number | null;
  title: string;
  body: string;
  authorEnrolmentId: string | null;
  authorStaffId: string | null;
  createdAt: string;
  pinned: boolean;
  locked: boolean;
  hidden: HiddenRecord;
  shepherdDone: { byId: string; at: string } | null;
  amens: number;
};

export type PostRecord = {
  id: string;
  threadId: string;
  authorEnrolmentId: string | null;
  authorStaffId: string | null;
  body: string;
  createdAt: string;
  pastoral: boolean;
  amens: number;
  hidden: HiddenRecord;
};

const HOUR = 3_600_000;
const SHORT_REPLIES = [
  "Amen. This is exactly where I am this week.",
  "Thank you for sharing this. Praying with you.",
  "I walked this with my twins. God meets us in our current season.",
  "Even Jesus withdrew to quiet places, but He also welcomed the children with open arms.",
  "Writing this down. So helpful.",
  "Same here. Ten minutes at the sink has become my prayer time.",
  "This encouraged me more than you know.",
  "Standing with you in prayer.",
];

const REFLECTIONS: [string, string][] = [
  ["My prayer corner", "I cleared a chair by the window. Small, but it reminds me to stop."],
  ["Scripture before my phone", "Week two of reading before scrolling. My mornings feel different."],
  ["Learning to listen", "I talked less and listened more in prayer this week."],
  ["Gratitude list", "Twenty things by Sunday. It changed how I saw a hard week."],
  ["Praying on the commute", "The bus is now my quiet place."],
  ["Fasting one meal", "More aware of how often I reach for comfort instead of God."],
  ["Psalm 23 slowly", "One line a day this week. 'He restores my soul' carried me."],
  ["Serving at the café", "Started helping after the 2nd service. Joy I didn't expect."],
  ["Family devotions", "Ten minutes after dinner. The kids pray first now."],
  ["Forgiving my manager", "Still working on it, but I prayed for him today."],
  ["Worship in the car", "Turned off the news, turned on worship."],
];

export function seedForum(enrolments: EnrolmentRecord[], now = Date.now()) {
  const threads: ThreadRecord[] = [];
  const posts: PostRecord[] = [];
  const at = (h: number) => new Date(now - h * HOUR).toISOString();
  let pid = 1;
  const reply = (threadId: string, by: { e?: string; s?: string }, body: string, hoursAgo: number, pastoral = false, amens = 0) =>
    posts.push({ id: `fp-${pid++}`, threadId, authorEnrolmentId: by.e ?? null, authorStaffId: by.s ?? null, body, createdAt: at(hoursAgo), pastoral, amens, hidden: null });
  const thread = (t: Partial<ThreadRecord> & Pick<ThreadRecord, "id" | "courseId" | "kind" | "title" | "body">, hoursAgo: number) =>
    threads.push({ session: null, authorEnrolmentId: null, authorStaffId: null, pinned: false, locked: false, hidden: null, shepherdDone: null, amens: 0, ...t, createdAt: at(hoursAgo) });

  const g = enrolments.filter((e) => e.courseId === "c-growth" && e.status === "enrolled").map((e) => e.id);
  const who = (i: number) => ({ e: g[i % g.length]! });

  thread(
    {
      id: "ft-g-prompt",
      courseId: "c-growth",
      kind: "reflection",
      session: 5,
      title: "Session 5 reflection prompt: What does abiding in communion look like in your busy week?",
      body: "Beloved cohort, as we reflect on prayer as intimacy rather than a transaction, share your practical rhythm below. Where have you found quiet amid work, parenting or study? If the devotional rhythm in Luke 5:16 has been a struggle, share freely with our church family.",
      authorStaffId: "u18",
      pinned: true,
    },
    72,
  );
  for (let i = 0; i < 18; i++) reply("ft-g-prompt", who(i + 3), SHORT_REPLIES[i % SHORT_REPLIES.length]!, 70 - i * 3.5, false, i % 4);

  thread(
    {
      id: "ft-g-stillness",
      courseId: "c-growth",
      kind: "question",
      session: 5,
      title: "How do I maintain stillness when morning family duties are hectic?",
      body: "Pastor Doyin mentioned starting the day in unhurried communion. With two toddlers, my mornings are often chaotic before 7 am.\n\nIs a fragmented 10-minute prayer scattered through the morning equally honouring to God, or am I shortchanging my spiritual growth? Looking for grace-filled practical guidance.",
      authorEnrolmentId: g[0]!,
      amens: 8,
    },
    3,
  );
  reply("ft-g-stillness", who(7), "I walked this with my twins. Susanna Wesley used to throw her apron over her head to pray in a kitchen full of kids. God meets us in our current season.", 1, false, 3);
  reply("ft-g-stillness", who(9), "Amen. Even Jesus retreated to solitary places when crowds pressed in, but He also welcomed the children with open arms.", 0.75);

  thread(
    {
      id: "ft-g-breakthrough",
      courseId: "c-growth",
      kind: "testimony",
      session: 3,
      title: "The breakthrough from transaction to secret-place communion",
      body: "Reading chapter 3 in the study notes untangled years of religious guilt for me. I used to feel prayer was an obligation to keep God happy; this past Tuesday I sat in the car park simply worshipping with no agenda. The peace carried into my whole workplace. Giving thanks for this cohort family!",
      authorEnrolmentId: g[1]!,
      amens: 12,
    },
    28,
  );
  for (let i = 0; i < 7; i++) reply("ft-g-breakthrough", who(i + 12), SHORT_REPLIES[(i + 2) % SHORT_REPLIES.length]!, 26 - i * 2);
  reply("ft-g-breakthrough", { s: "u18" }, "Amen! That is the very marrow of New Covenant communion. Let the joy of His presence remain your strength.", 20, true, 5);

  thread(
    { id: "ft-g-surgery", courseId: "c-growth", kind: "prayer", title: "Please pray for my mother's surgery on Thursday", body: "She goes in at 8 am. We're trusting God for the surgeons' hands and a quick recovery.", authorEnrolmentId: g[2]!, amens: 14 },
    9,
  );
  reply("ft-g-surgery", who(20), "Praying with you and your family.", 8);

  thread(
    { id: "ft-g-fasting", courseId: "c-growth", kind: "question", session: 4, title: "Is fasting still for today?", body: "Some friends say fasting was only for the Old Testament. How should I think about it?", authorEnrolmentId: g[3]!, amens: 2 },
    120,
  );
  reply("ft-g-fasting", { s: "u18" }, "Jesus said “when you fast”, not “if” (Matthew 6:16). Start small, with one meal, and let it make room for prayer.", 110, true, 6);
  reply("ft-g-fasting", who(25), "This helped me too. Thank you, Pastor.", 100);

  thread(
    { id: "ft-g-voice", courseId: "c-growth", kind: "question", session: 5, title: "How do I know it's the Spirit and not my own thoughts?", body: "I sensed I should call an old friend this week. How do I tell the difference?", authorEnrolmentId: g[5]!, amens: 4 },
    30,
  );
  reply("ft-g-voice", who(30), "Following. I've wondered the same.", 29);

  thread(
    { id: "ft-g-interview", courseId: "c-growth", kind: "prayer", title: "Job interview on Monday", body: "Would value your prayers. It's the role I've been hoping for.", authorEnrolmentId: g[6]!, amens: 9, shepherdDone: { byId: "u18", at: at(40) } },
    50,
  );

  thread({ id: "ft-g-brother", courseId: "c-growth", kind: "testimony", title: "Reconciled with my brother", body: "After two years we finally talked. Session 4 on forgiveness gave me the courage.", authorEnrolmentId: g[8]!, amens: 16 }, 60);
  reply("ft-g-brother", { s: "u18" }, "What a testimony. Thank you for being brave.", 58, true, 4);

  thread({ id: "ft-g-plan", courseId: "c-growth", kind: "question", session: 3, title: "Which Bible reading plan do you recommend?", body: "I keep starting and stopping. Something gentle for a beginner?", authorEnrolmentId: g[9]!, amens: 3 }, 200);
  reply("ft-g-plan", { s: "u18" }, "Start with Mark: one chapter a day, sixteen days. Then John.", 190, true, 7);
  for (let i = 0; i < 4; i++) reply("ft-g-plan", who(i + 33), SHORT_REPLIES[(i + 4) % SHORT_REPLIES.length]!, 180 - i * 5);

  thread(
    {
      id: "ft-g-hidden",
      courseId: "c-growth",
      kind: "reflection",
      session: 1,
      title: "A friend's story",
      body: "My friend told me about her marriage troubles and I think the group should pray. Here's what happened…",
      authorEnrolmentId: g[10]!,
      hidden: { byId: "u18", reason: "Shared someone else's private story", at: at(300) },
    },
    310,
  );

  REFLECTIONS.forEach(([title, body], i) => {
    const id = `ft-g-r${i}`;
    thread({ id, courseId: "c-growth", kind: "reflection", session: 1 + (i % 5), title, body, authorEnrolmentId: g[(i * 3 + 11) % g.length]!, amens: i % 6 }, 36 + i * 30);
    for (let k = 0; k < i % 4; k++) reply(id, who(i + k + 15), SHORT_REPLIES[(i + k) % SHORT_REPLIES.length]!, 34 + i * 30 - k * 3);
  });

  const nb = enrolments.filter((e) => e.courseId === "c-nb" && e.status === "enrolled").map((e) => e.id);
  thread(
    { id: "ft-nb-baptism", courseId: "c-nb", kind: "question", session: 4, title: "Do I need to be baptised again?", body: "I was sprinkled as a baby. Should I be baptised now that I've given my life to Christ?", authorEnrolmentId: nb[0]!, amens: 2 },
    20,
  );
  thread({ id: "ft-nb-first", courseId: "c-nb", kind: "testimony", title: "My first week as a believer", body: "I didn't expect so much peace. Thank you all for welcoming me.", authorEnrolmentId: nb[1]!, amens: 11 }, 140);
  reply("ft-nb-first", { s: "u19" }, "Welcome to the family! We're so glad you're here.", 130, true, 3);
  thread({ id: "ft-nb-pray", courseId: "c-nb", kind: "prayer", title: "Pray for my husband", body: "He isn't a believer yet. I'd love your prayers.", authorEnrolmentId: nb[2]!, amens: 7 }, 60);
  reply("ft-nb-pray", { e: nb[3]! }, "Praying with you.", 58);
  return { threads, posts };
}
