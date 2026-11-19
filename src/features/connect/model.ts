/**
 * Connect's fixed lists and labels, copied from TKP Connect
 * (assets/js/itg-connect.js and doc 01 §4.4–4.5). Wording is exact: these are
 * labels volunteers know, and the API validates against the same lists.
 */
import type { Team } from "@/lib/permissions";

export type { Team };

/* ------------------------------------------------------------ how they reached out */

export const METHODS = ["Phone Call", "SMS", "WhatsApp Text", "WhatsApp Call", "In Person"] as const;
export type Method = (typeof METHODS)[number];

/** BR-08: the outcome follows the method. */
const METHOD_GROUP: Record<Method, "call" | "text" | "person"> = {
  "Phone Call": "call",
  "WhatsApp Call": "call",
  SMS: "text",
  "WhatsApp Text": "text",
  "In Person": "person",
};
export const OUTCOMES_BY_GROUP = {
  call: ["Reached", "No answer", "Wrong Number", "Not Reachable"],
  text: ["Delivered", "Replied", "Not Delivered"],
  person: ["Met in person"],
} as const;
export const outcomesFor = (m: Method | ""): readonly string[] => (m ? OUTCOMES_BY_GROUP[METHOD_GROUP[m]] : []);
/** Outcomes shown in green in the logs table. */
export const GOOD_OUTCOMES = ["Reached", "Replied", "Delivered", "Met in person"];

/* ------------------------------------------------------------ Church Office */

export const SOP_STEP = "Initial welcome call / text";
export const WANTS_MEMBERSHIP = ["Yes", "No", "Undecided"] as const;
export const NO_REASONS = ["Visiting", "Other"] as const;
export const NEXT_ACTIONS = [
  "Proceed to Integration Team",
  "Not Interested in Becoming a Member",
  "No response (retry 2 of 3)",
  "No Response (retry 3 of 3)",
  "Refer to Pastor (Prayer / Counseling)",
] as const;
/** BR-11: this next action closes the journey. */
export const CO_CLOSING_ACTION = "Not Interested in Becoming a Member";

/* ------------------------------------------------------------ Integration outcomes */

export const IT_SINGLE = [
  { key: "membership", label: "Membership Outcome", options: ["Interested", "Not Interested", "Undecided"] },
  { key: "workforce", label: "Workforce or Volunteer Outcome", options: ["Interested", "Not Interested", "Undecided"] },
  { key: "lifeGroup", label: "Life Group Outcome", options: ["Joined Cell Group", "Undecided", "Not Interested"] },
] as const;
export type SingleKey = (typeof IT_SINGLE)[number]["key"];

export const IT_MULTI = [
  {
    label: "Spiritual Outcome",
    options: [
      { key: "SpBelieversClass", label: "Interested in Believer’s Class" },
      { key: "SpWaterBaptism", label: "Interested in Water Baptism" },
      { key: "SpMatureChristian", label: "Mature Christian" },
      { key: "SpNotApplicable", label: "Not Applicable" },
    ],
  },
  {
    label: "Other Outcome",
    options: [
      { key: "OtCounseling", label: "Needs Counseling" },
      { key: "OtPastoralContact", label: "Needs Pastoral Contact" },
      { key: "OtFinancialCare", label: "Needs Financial Care" },
      { key: "OtFollowUp", label: "Needs Follow up" },
      { key: "OtNotApplicable", label: "Not Applicable" },
    ],
  },
] as const;
export type MultiKey = (typeof IT_MULTI)[number]["options"][number]["key"];
export const MULTI_KEYS = IT_MULTI.flatMap((g) => g.options.map((o) => o.key)) as MultiKey[];
/** BR-17: Not Applicable is exclusive within its group. */
export const NOT_APPLICABLE: MultiKey[] = ["SpNotApplicable", "OtNotApplicable"];

/* ------------------------------------------------------------ phases and checklist */

export const PHASES = [
  { phase: 1, label: "Phase 1", weeks: "weeks 1–2" },
  { phase: 2, label: "Phase 2", weeks: "weeks 3–4" },
  { phase: 3, label: "Phase 3", weeks: "weeks 5–12" },
] as const;
export type Phase = 1 | 2 | 3;

export const STEPS: Record<Phase, { key: StepKey; label: string }[]> = {
  1: [
    { key: "P1Welcome48h", label: "48 Hr Welcome" },
    { key: "P1WelcomeCall", label: "Initial Welcome Call" },
    { key: "P1Culture", label: "Discovering Church Culture" },
    { key: "P1Relationship", label: "Building Relationship & Interests" },
    { key: "P1Complete", label: "Phase 1 Complete" },
  ],
  2: [
    { key: "P2DeptIntro", label: "Department Introduction" },
    { key: "P2Spiritual", label: "Spiritual Growth" },
    { key: "P2Encourage", label: "Encouragement & Follow Up" },
    { key: "P2Complete", label: "Phase 2 Complete" },
  ],
  3: [
    { key: "P3Wellness", label: "Follow up & Wellness Check" },
    { key: "P3Reflection", label: "Reflection & Feedback" },
    { key: "P3PublicIntro", label: "Preparing for Public Introduction & Church Welcome" },
    { key: "P3Closure", label: "Final Encouragement & Closure" },
    { key: "P3Complete", label: "Phase 3 Complete" },
  ],
};

export const STEP_KEYS = [
  "CoWelcomeCall",
  "P1Welcome48h",
  "P1WelcomeCall",
  "P1Culture",
  "P1Relationship",
  "P1Complete",
  "P2DeptIntro",
  "P2Spiritual",
  "P2Encourage",
  "P2Complete",
  "P3Wellness",
  "P3Reflection",
  "P3PublicIntro",
  "P3Closure",
  "P3Complete",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const stepLabel = (k: StepKey) =>
  k === "CoWelcomeCall" ? SOP_STEP : (Object.values(STEPS).flat().find((s) => s.key === k)?.label ?? k);

/** BR-10: which checklist keys each team may tick. */
export const teamOwnsStep = (team: Team, key: StepKey) => (team === "church_office" ? key === "CoWelcomeCall" : key !== "CoWelcomeCall");

/* ------------------------------------------------------------ journey states */

export type JourneyStatus = "Active" | "Completed" | "Closed";
export const CLOSED_REASONS = [
  "Not interested (Church office)",
  "Not interested (Integration)",
  "Moved",
  "Unreachable",
  "Other",
] as const;

export const TEAM_SHORT: Record<Team, string> = { church_office: "Church office", integration: "Integration Team" };

/* ------------------------------------------------------------ copy */

/** Exact wording, doc 01 §5.1 / doc 06 §5. */
export const CONNECT_TAGLINE = "“Walking with you for the first 12 weeks.”";
