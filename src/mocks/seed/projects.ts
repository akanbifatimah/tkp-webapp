import type { Ministry, PositionFormat, ProjectContact, ProjectStatus, Upload } from "@/features/serve/project-types";

/**
 * Projects mock data (M9 step 2), drawn from the Figma member screens PJ1, PJ3,
 * PJ4 and PJ5. Fictional people; dates from page load.
 */

export type PositionRecord = {
  id: string;
  title: string;
  responsibilities: string;
  skills: string[];
  commitment: string;
  format: PositionFormat;
  openings: number;
  closingDate: string | null;
  /** Set by hand; "closed" also follows from the closing date. */
  state: "open" | "filled" | "closed";
  contactTaps: number;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  ministry: Ministry;
  startDate: string;
  targetFinish: string | null;
  cover: Upload | null;
  contact: ProjectContact;
  positions: PositionRecord[];
  status: ProjectStatus;
  featured: boolean;
  /** The member who posted it (from their app account), or a staff id for staff-made projects. */
  postedBy: { name: string; email: string | null; member: boolean; staffId: string | null };
  leadId: string | null;
  submittedAt: string;
  reviewMessage: string | null;
  declineReason: string | null;
  history: { at: string; byId: string | null; action: string; note: string | null }[];
  updatedAt: string;
  rowVer: number;
};

const DAY = 86_400_000;
const cover = (name: string): Upload => ({ id: `cv-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, name: `${name}.jpg`, size: 820_000, type: "image/jpeg" });

export function seedProjects(now = Date.now()) {
  const day = (d: number) => new Date(now + d * DAY).toISOString().slice(0, 10);
  const at = (d: number) => new Date(now - d * DAY).toISOString();
  let pn = 1;
  const pos = (title: string, responsibilities: string[], skills: string[], commitment: string, format: PositionFormat, openings: number, closeIn: number | null, extra: Partial<PositionRecord> = {}): PositionRecord => ({
    id: `pos-${pn++}`,
    title,
    responsibilities: responsibilities.join("\n"),
    skills,
    commitment,
    format,
    openings,
    closingDate: closeIn === null ? null : day(closeIn),
    state: "open",
    contactTaps: (pn * 7) % 23,
    ...extra,
  });
  const contact = (coordinators: string, role: string, phone: string, email: string, howToApply: string, whatsapp = true): ProjectContact => ({ coordinators, role, phone, whatsapp, email, howToApply });
  const live = (byId: string | null, d: number) => [
    { at: at(d), byId: null, action: "Submitted", note: null },
    { at: at(d - 1), byId, action: "Approved and published", note: null },
  ];

  const projects: ProjectRecord[] = [
    {
      id: "prj-impact",
      name: "Impact House Classroom Team",
      description: "Expanding age-graded discipleship classrooms for elementary and middle school students in Katy. We need teachers, curriculum writers and assistant coordinators.",
      ministry: "Education",
      startDate: day(-30),
      targetFinish: day(150),
      cover: cover("Impact House classroom"),
      contact: contact("Folake A.", "Initiative Lead · Children's Ministry", "(281) 555-0131", "children@example.org", "Message Folake on WhatsApp with the age group you'd like to teach."),
      positions: [
        pos("Sunday School Teacher", ["Teach a class of 8 to 12 children each Sunday", "Prepare from the lesson guide", "Pray with the children"], ["Patience", "Bible knowledge", "Background check"], "Sundays (9:00 – 11:00 am)", "In person (Katy)", 3, 21),
        pos("Curriculum Writer", ["Write weekly lesson guides for ages 6 to 11", "Work with the teachers to adapt lessons"], ["Writing", "Teaching experience"], "2–3 hrs/wk", "Remote", 1, 30),
        pos("Assistant Coordinator", ["Keep the rota", "Welcome parents at drop-off"], ["Organised", "Friendly"], "A few hours a week", "Hybrid", 1, null),
      ],
      status: "live",
      featured: true,
      postedBy: { name: "Folake Adeyemi", email: "folake.adeyemi@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(34),
      reviewMessage: null,
      declineReason: null,
      history: live("u03", 34),
      updatedAt: at(10),
      rowVer: 1,
    },
    {
      id: "prj-livestream",
      name: "Livestream Upgrade Initiative",
      description:
        "Upgrading our Katy sanctuary multi-camera broadcast workflow and high-fidelity YouTube audio chain. We are welcoming volunteer engineers, camera operators and video editors to join our weekend production family.",
      ministry: "Media",
      startDate: day(-6),
      targetFinish: day(94),
      cover: cover("Livestream booth"),
      contact: contact("Grace & Emmanuel K.", "Project Coordinators · Media Ministry", "(832) 555-0192", "media@example.org", "Reach out directly to Emmanuel or Grace to ask questions or express your interest. They will arrange a 15-minute sanctuary tour before service."),
      positions: [
        pos(
          "Sound and Video Volunteer",
          ["Set up wireless stage microphones, in-ear monitors and audio patch boxes before Sunday services", "Monitor YouTube and mobile app live audio levels during worship and sermon delivery", "Assist the technical lead with post-service audio archive recordings"],
          ["Basic sound mixing", "Audio cables and XLR setup", "Punctuality on Sundays", "Desire to learn"],
          "A few hours a week",
          "In person (Katy)",
          2,
          5,
          { contactTaps: 12 },
        ),
        pos("Broadcast Camera Operator", ["Run camera 2 during the 1st and 2nd services", "Follow the director's calls"], ["Steady hands", "Camera basics"], "Sundays (8:30 am – 12:30 pm)", "In person (Katy)", 2, 12, { contactTaps: 7 }),
        pos("Sermon Clips and Social Editor", ["Cut three 60-second clips from each sermon", "Add captions and upload to the church's social pages"], ["Video editing", "Captions"], "2–3 hrs/wk", "Remote", 1, 20, { contactTaps: 9 }),
      ],
      status: "live",
      featured: false,
      postedBy: { name: "Emmanuel Kalu", email: "emmanuel.kalu@example.com", member: true, staffId: null },
      leadId: "u27",
      submittedAt: at(8),
      reviewMessage: null,
      declineReason: null,
      history: live("u04", 8),
      updatedAt: at(2),
      rowVer: 1,
    },
    {
      id: "prj-168",
      name: "168 Hours of Praise",
      description: "A week of unbroken worship in January. We need musicians, singers and stage hands for the night watches.",
      ministry: "Music",
      startDate: day(38),
      targetFinish: day(45),
      cover: cover("168 Hours of Praise"),
      contact: contact("Pastor Paul", "Music Director", "(281) 555-0150", "music@example.org", "Tell Pastor Paul which watch you can cover."),
      positions: [
        pos("Night Watch Keyboardist", ["Play a 2-hour slot between midnight and 6 am"], ["Keyboard", "Worship songs"], "One 2-hour slot", "In person (Katy)", 2, 4),
        pos("Backing Vocalist", ["Sing with a worship team for one slot"], ["Singing"], "One 2-hour slot", "In person (Katy)", 1, 4),
        pos("Stage Hand", ["Reset the stage between bands"], ["Lifting", "Calm under pressure"], "A few hours during the week", "In person (Katy)", 1, 4),
      ],
      status: "live",
      featured: false,
      postedBy: { name: "Paul Ibekwe", email: "paul.ibekwe@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(20),
      reviewMessage: null,
      declineReason: null,
      history: live("u03", 20),
      updatedAt: at(6),
      rowVer: 1,
    },
    {
      id: "prj-tutoring",
      name: "Redeemer Tutoring",
      description: "Free after-school tutoring in maths and reading for children in our neighbourhood.",
      ministry: "Education",
      startDate: day(-60),
      targetFinish: null,
      cover: cover("Tutoring"),
      contact: contact("Amara O.", "Tutoring Coordinator", "(281) 555-0162", "tutoring@example.org", "Email Amara with the subjects you can tutor."),
      positions: [
        pos("Maths Tutor", ["Tutor two children on Wednesdays"], ["Maths", "Patience"], "Wednesdays (4 – 6 pm)", "In person (Katy)", 2, 40),
        pos("Reading Buddy", ["Read with one child each week"], ["Reading"], "1 hr/wk", "In person (Katy)", 1, 40, { state: "filled" }),
      ],
      status: "live",
      featured: false,
      postedBy: { name: "Amara Okafor", email: "amara.okafor@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(65),
      reviewMessage: null,
      declineReason: null,
      history: live("u04", 65),
      updatedAt: at(30),
      rowVer: 1,
    },
    {
      id: "prj-kingstouch",
      name: "King's Touch Outreach",
      description: "Monthly food and hygiene packs for families in Katy, packed after the 2nd service and delivered that afternoon.",
      ministry: "Outreach",
      startDate: day(-90),
      targetFinish: null,
      cover: cover("King's Touch"),
      contact: contact("Bro. David", "Outreach Lead", "(281) 555-0177", "outreach@example.org", "Come to the packing table after the 2nd service on the first Sunday."),
      positions: [
        pos("Packer", ["Pack food and hygiene bags"], ["Teamwork"], "First Sunday of the month", "In person (Katy)", 3, null),
        pos("Driver", ["Deliver packs to families"], ["Valid licence", "Own car"], "First Sunday afternoon", "In person (Katy)", 2, null),
      ],
      status: "live",
      featured: false,
      postedBy: { name: "David Mensah", email: "david.mensah@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(95),
      reviewMessage: null,
      declineReason: null,
      history: live("u04", 95),
      updatedAt: at(40),
      rowVer: 1,
    },
    {
      id: "prj-fooddrive",
      name: "Katy Community Food Drive and Care Packs",
      description: "A Thanksgiving-season food drive with the neighbouring schools. We'll collect, sort and deliver care packs to 200 families.",
      ministry: "Outreach",
      startDate: day(10),
      targetFinish: day(24),
      cover: cover("Food drive"),
      contact: contact("Bisi O.", "Food Drive Coordinator", "(281) 555-0188", "bisi.ogunbiyi@example.com", "WhatsApp Bisi with the days you can help."),
      positions: [
        pos("Collection Volunteer", ["Staff the collection table at the school gates", "Log donations"], ["Friendly", "Organised"], "Two Saturday mornings", "In person (Katy)", 6, 9),
        pos("Delivery Driver", ["Deliver care packs to families on the list"], ["Valid licence", "Own car"], "One Saturday afternoon", "In person (Katy)", 4, 9),
      ],
      status: "submitted",
      featured: false,
      postedBy: { name: "Bisi Ogunbiyi", email: "bisi.ogunbiyi@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(1),
      reviewMessage: null,
      declineReason: null,
      history: [{ at: at(1), byId: null, action: "Submitted", note: null }],
      updatedAt: at(1),
      rowVer: 1,
    },
    {
      id: "prj-parking",
      name: "Parking Ministry Refresh",
      description: "New signage and a rota for the parking team so first-time guests are greeted from the car park.",
      ministry: "Hospitality",
      startDate: day(3),
      targetFinish: day(60),
      cover: null,
      contact: contact("Tobi M.", "Parking Team", "", "", "Find Tobi in the car park."),
      positions: [
        pos("Parking Greeter", ["Wave cars in and point guests to the welcome desk"], ["Friendly"], "Sundays (8:30 – 10 am)", "In person (Katy)", 4, -2),
        pos("Sign Painter", [], ["Painting"], "One Saturday", "In person (Katy)", 0, 20),
      ],
      status: "submitted",
      featured: false,
      postedBy: { name: "Tobi Martins", email: "tobi.martins@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(4),
      reviewMessage: null,
      declineReason: null,
      history: [{ at: at(4), byId: null, action: "Submitted", note: null }],
      updatedAt: at(4),
      rowVer: 1,
    },
    {
      id: "prj-robes",
      name: "Choir Robes Sewing Circle",
      description: "Sewing new robes for the mass choir before Easter. All skill levels welcome; machines provided.",
      ministry: "Music",
      startDate: day(14),
      targetFinish: day(110),
      cover: cover("Sewing circle"),
      contact: contact("Mama Ruth", "Choir Wardrobe", "(281) 555-0119", "choir@example.org", "Call Mama Ruth."),
      positions: [pos("Sewer", ["Cut and sew robe panels on Saturdays"], ["Sewing"], "Saturdays (10 am – 1 pm)", "In person (Katy)", 6, 45)],
      status: "submitted",
      featured: false,
      postedBy: { name: "Ruth Coker", email: "ruth.coker@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: new Date(now - 2 * 3_600_000).toISOString(),
      reviewMessage: null,
      declineReason: null,
      history: [{ at: new Date(now - 2 * 3_600_000).toISOString(), byId: null, action: "Submitted", note: null }],
      updatedAt: new Date(now - 2 * 3_600_000).toISOString(),
      rowVer: 1,
    },
    {
      id: "prj-basketball",
      name: "Youth Basketball League",
      description: "A Friday-night league for teenagers in the neighbourhood, with a short devotion at half-time.",
      ministry: "Outreach",
      startDate: day(20),
      targetFinish: day(120),
      cover: cover("Basketball"),
      contact: contact("", "", "", "", ""),
      positions: [pos("Coach", ["Coach a team of 8 to 10 teens"], ["Basketball"], "Fridays (6 – 8 pm)", "In person (Katy)", 4, 18)],
      status: "changes",
      featured: false,
      postedBy: { name: "Kunle Durojaiye", email: "kunle.durojaiye@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(5),
      reviewMessage: "Please add who coordinates it and a phone number or email, so people can reach you.",
      declineReason: null,
      history: [
        { at: at(5), byId: null, action: "Submitted", note: null },
        { at: at(4), byId: "u03", action: "Changes requested", note: "Please add who coordinates it and a phone number or email, so people can reach you." },
      ],
      updatedAt: at(4),
      rowVer: 1,
    },
    {
      id: "prj-bakesale",
      name: "Bake Sale for My Business",
      description: "Selling cakes after service to raise money for my new bakery.",
      ministry: "Other",
      startDate: day(7),
      targetFinish: null,
      cover: null,
      contact: contact("Joy", "Owner", "(281) 555-0124", "", "Buy after service."),
      positions: [pos("Helper", ["Sell cakes"], [], "Sundays", "In person (Katy)", 2, 10)],
      status: "declined",
      featured: false,
      postedBy: { name: "Joy Williams", email: "joy.williams@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(12),
      reviewMessage: null,
      declineReason: "Projects are for church and community service, not personal fundraising. We'd love to talk about a church bake sale for the youth trip instead.",
      history: [
        { at: at(12), byId: null, action: "Submitted", note: null },
        { at: at(11), byId: "u04", action: "Declined", note: "Projects are for church and community service, not personal fundraising." },
      ],
      updatedAt: at(11),
      rowVer: 1,
    },
    {
      id: "prj-easter",
      name: "Easter Production Crew",
      description: "Stage, lights and drama crew for the Easter production.",
      ministry: "Media",
      startDate: day(-240),
      targetFinish: day(-200),
      cover: cover("Easter production"),
      contact: contact("Grace A.", "Production Lead", "(281) 555-0101", "media@example.org", "Closed."),
      positions: [pos("Lighting Operator", ["Run the lighting desk"], ["Lighting"], "Rehearsals and show week", "In person (Katy)", 2, -205, { state: "filled" })],
      status: "closed",
      featured: false,
      postedBy: { name: "Grace Adeyemi", email: "grace.adeyemi@example.com", member: true, staffId: null },
      leadId: null,
      submittedAt: at(260),
      reviewMessage: null,
      declineReason: null,
      history: [...live("u04", 260), { at: at(198), byId: "u04", action: "Closed", note: "Easter is over. Thank you, crew!" }],
      updatedAt: at(198),
      rowVer: 1,
    },
  ];
  return projects;
}
