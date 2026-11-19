import type { GuestTrackStage } from "./types";

/**
 * The three Guest Track texts, word for word from TKP Connect's script library
 * (code/database/004-itg-scripts-seed.sql, keys gt-48h, gt-return2, gt-return3).
 * They are in the SOP library but not yet shown in the live app (Appendix A.5).
 */
export const GUEST_TRACK_SCRIPTS: Record<Exclude<GuestTrackStage, "awaiting">, { key: string; title: string; when: string; body: string }> = {
  "48h": {
    key: "gt-48h",
    title: "48-hour Sunday-evening text from the person who met them",
    when: "Sunday evening, from whoever met the guest at the visitor booth or sat with them",
    body: "Hi [Name], this is [Your Name] from The King’s Palace. I was so glad to meet you at the visitor booth this morning. Thank you for worshiping with us today. We’d love to see you again next Sunday, and I’ll look out for you. Is there anything we can pray with you about this week?",
  },
  invite2: {
    key: "gt-return2",
    title: "Guest Track · invitation to visit 2",
    when: "Wednesday or Thursday after the first visit",
    body: "Hi [Name], [Your Name] from The King’s Palace again. This Sunday, [Next Sunday], we’d love to have you back. Service starts at [Service Time] and I’ll meet you at the visitor booth so you won’t walk in alone. Would that work for you?",
  },
  invite3: {
    key: "gt-return3",
    title: "Guest Track · after visit 2 (invite to visit 3 / Newcomers’ Lunch)",
    when: "Within 48 hours of a confirmed second visit",
    body: "Hi [Name], it was a joy to see you again on Sunday! Once a month our pastors host a Newcomers’ Lunch so new friends can meet the leaders and each other. The next one is [Event Date] after 2nd service. May I save a seat for you (and your family)?",
  },
};

export const STAGES: { id: GuestTrackStage; label: string; hint: string }[] = [
  { id: "48h", label: "48-hour text", hint: "Inside 48 hours of the form" },
  { id: "invite2", label: "Invite to visit 2", hint: "Wednesday or Thursday after the first visit" },
  { id: "awaiting", label: "Awaiting 2nd visit", hint: "No return confirmed yet · up to 4 weeks" },
  { id: "invite3", label: "Invite to visit 3", hint: "Within 48 hours of a confirmed return" },
];
