/**
 * The 15 approved SOP scripts, word for word (TKP Connect Appendix A).
 * GENERATED from integration-app/code/wp-content/plugins/tkp-integration-portal/assets/js/itg-connect-scripts.js.
 * Do not edit by hand: wording changes go through the Tech Admin (doc 09, Nov 16, 2026).
 */
import type { Phase, StepKey, Team } from "./model";

export type Script = {
  id: string;
  team: Team;
  phase: Phase | null;
  channel: string | null;
  /** The checklist item or SOP step it serves (Appendix A). */
  stepKey: StepKey | null;
  title: string;
  body: string;
};

export const SCRIPTS: Script[] = [
  {
    "id": "co-1",
    "team": "church_office",
    "phase": null,
    "channel": "Phone Call",
    "stepKey": "CoWelcomeCall",
    "title": "Initial welcome call · day 1–3 after visit",
    "body": "Hello [Name], this is [Your Name] from RCCG The King’s Palace in Katy.\n\nIt was a pleasure having you with us on [Day]. I just wanted to say thank you for worshiping with us and to check how you are doing.\n\nAt The King’s Palace, our desire is that no one just passes through—we want everyone to feel known, loved, and supported in their walk with God.\n\nIs this a good time to speak for a few minutes?\n\nIf yes, continue:\n“I’d love to know:\n• How did you find the service?\n• Was there anything that particularly blessed you or stood out to you?\n\nWe also have an integration process that gently helps new and returning members settle in, build relationships, and, if you’re willing, get involved in a department or life group over the next 3 months.\n\nWould you be open to us walking that journey with you?”\n\nIf they agree: proceed with culture explanation and relationship-building questions. If they are busy: ask for a better time to call back."
  },
  {
    "id": "co-2",
    "team": "church_office",
    "phase": null,
    "channel": "Voicemail",
    "stepKey": null,
    "title": "Non-response attempt 1 of 3 · call + voicemail",
    "body": "Hello [Name], this is [Your Name] from RCCG The King's Palace. Thank you for worshipping with us on [Day]. I'm calling just to say welcome and to see how you are doing. You can reach me on (Replace with your phone number). God bless you, and we hope to see you again soon."
  },
  {
    "id": "co-3",
    "team": "church_office",
    "phase": null,
    "channel": "SMS / WhatsApp",
    "stepKey": null,
    "title": "Non-response attempt 2 of 3",
    "body": "Hi [Name], it's [Your Name] from The King's Palace. We tried to call to thank you for visiting on [Day]. Hope your week is going well! Is there anything we can pray with you about? Reply anytime."
  },
  {
    "id": "co-4",
    "team": "church_office",
    "phase": null,
    "channel": "SMS / WhatsApp",
    "stepKey": null,
    "title": "Non-response attempt 3 of 3",
    "body": "Hi [Name], [Your Name] again from The King's Palace. We won't keep bothering you — just know you are always welcome. We worship Sundays at 9:00 am. If you ever need prayer or anything at all, reply to this message. God bless you!"
  },
  {
    "id": "p1-1",
    "team": "integration",
    "phase": 1,
    "channel": null,
    "stepKey": "P1WelcomeCall",
    "title": "Initial Welcome Call",
    "body": "Hello [Name], this is [Your Name] from RCCG The King’s Palace in Katy.\n\nIt was a pleasure having you with us on [Day]. I just wanted to say thank you for worshiping with us and to check how you are doing.\n\nAt The King’s Palace, our desire is that no one just passes through—we want everyone to feel known, loved, and supported in their walk with God.\n\nIs this a good time to speak for a few minutes?\n\nIf yes, continue:\n“I’d love to know:\n• How did you find the service?\n• Was there anything that particularly blessed you or stood out to you?\n\nWe also have an integration process that gently helps new and returning members settle in, build relationships, and, if you’re willing, get involved in a department or life group over the next 3 months.\n\nWould you be open to us walking that journey with you?”\n\nIf they agree: proceed with culture explanation and relationship-building questions. If they are busy: ask for a better time to call back."
  },
  {
    "id": "p1-2",
    "team": "integration",
    "phase": 1,
    "channel": null,
    "stepKey": "P1Culture",
    "title": "Discovering Church Culture",
    "body": "At The King’s Palace, our heart is to know Jesus, grow in Him, and make Him known.\n\nWe are part of the Redeemed Christian Church of God, and our culture is built around:\n• Strong teaching of the Word\n• Prayer and worship\n• Holiness and integrity\n• Love, community, and service\n\nWe meet on Sundays and during the week, and we have different departments and fellowships—like Men’s, Women’s, Youth, and Cell Groups—where people can grow and serve. (Use the pamphlet with listed resources and groups.)\n\nOur Pastors, Pastor Tunde and Pastor (Mrs.) Sade Badru, have a strong passion for seeing everyone rooted, growing, and fulfilled in Christ, not just attending."
  },
  {
    "id": "p1-3",
    "team": "integration",
    "phase": 1,
    "channel": null,
    "stepKey": "P1Relationship",
    "title": "Building Relationship & Identifying Interests",
    "body": "Just so we can better serve you and know how to support you:\n• Are you new to the Katy area, or have you been here for a while?\n• Have you been part of a church family before?\n• What kind of things do you naturally enjoy or feel drawn to—music, children, teaching, prayer, media, hospitality, organizing, etc.?\n\nAfter they answer:\n“Thank you for sharing that. It really helps us know how best to connect you. At The King’s Palace, we don’t want people to just sit on the sidelines. We believe everyone has a place and a role in God’s house. Over the next week or two, we’ll help you see where you might fit best, both in terms of spiritual growth and service.”\n\nAction: enter their background, interests, and preferences in the record."
  },
  {
    "id": "p2-1",
    "team": "integration",
    "phase": 2,
    "channel": null,
    "stepKey": "P2DeptIntro",
    "title": "Departmental Introduction",
    "body": "At The King’s Palace, we believe everyone has a place to serve. Some of our key departments include:\n• Choir / Music Ministry\n• Children’s Church\n• Teen/Youth Ministry\n• Ushering / Protocol\n• Prayer / Intercession\n• Media / Technical\n• Evangelism / Outreach\n\nFrom what I understand, you’re interested in [Interests]. Based on that, I think you might enjoy and thrive in [Department].\n\nWould you be open to me introducing you personally to the leader of [Department] so you can attend a meeting/rehearsal and see how it feels?\n\nAction: arrange the introduction · record department(s) introduced + department leader."
  },
  {
    "id": "p2-2",
    "team": "integration",
    "phase": 2,
    "channel": null,
    "stepKey": "P2Encourage",
    "title": "Follow-Up Conversation",
    "body": "I just wanted to check in on your experience with [Department].\n• How did the meeting/rehearsal go?\n• How did you feel being there?"
  },
  {
    "id": "p2-3",
    "team": "integration",
    "phase": 2,
    "channel": null,
    "stepKey": "P2Encourage",
    "title": "Encouraging Commitment to a Department",
    "body": "If you feel at peace and comfortable, I’d like to encourage you to take a step of commitment by letting the department leader know that you’d like to be part of the team.\n\nWe don’t rush people, but we do believe that serving helps you grow, connect, and feel truly at home.\n\nAction: note if they have committed. If undecided, suggest trying another suitable department."
  },
  {
    "id": "p2-4",
    "team": "integration",
    "phase": 2,
    "channel": null,
    "stepKey": "P2Spiritual",
    "title": "Spiritual Growth & Community Involvement",
    "body": "Alongside serving, we also want you to grow spiritually and relationally.\n\nHere are a few things that can really help:\n• Attending Sunday services consistently\n• Joining [Bible Study / Sunday School / Prayer Meetings]\n• Connecting with at least one fellowship or cell group:\n  – Men’s Fellowship / Women’s Fellowship\n  – Cell Groups (Green, Red, Yellow, Blue)\n\nBased on your zip code, I’d recommend [Cell Group]. Would you be open to visiting that group this week or next?\n\nAction: link them to the cell group leader or fellowship contact · record recommended group and status."
  },
  {
    "id": "p3-1",
    "team": "integration",
    "phase": 3,
    "channel": null,
    "stepKey": "P3Wellness",
    "title": "Follow-Up & Wellness Check",
    "body": "I just wanted to quickly check on you, [Name].\n• How are you doing?\n• How are you finding things in [Department / Fellowship]?\n• Are there any challenges or concerns you’d like to share—spiritually, emotionally, or practically?\n\nWe really don’t want anyone to feel alone. If there’s any way we can support you—through prayer, information, or connecting you with someone—please feel free to let me know.\n\nIf they share something: “Thank you for being open. We’ll keep that in prayer and see how best we can support you. You are very important to us and to God.”\n\nAction: note needs or prayer points · inform pastors or relevant leaders if support is required (with discretion) — use “Refer a care need”, not the notes field."
  },
  {
    "id": "p3-2",
    "team": "integration",
    "phase": 3,
    "channel": null,
    "stepKey": "P3Reflection",
    "title": "Reflection & Feedback",
    "body": "As we come towards the end of this 3-month integration journey, I’d love to hear from you:\n• How would you describe your experience at RCCG The King’s Palace so far?\n• What has helped you feel most welcomed and connected?\n• Is there anything you think we could do better for new or returning members?\n• Do you feel you’ve found your place in [Department / Fellowship / Cell Group]?\n\nOur heart is to keep improving and to serve you better, so your feedback is very valuable.\n\nAction: capture feedback · share themes at the monthly integration team review."
  },
  {
    "id": "p3-3",
    "team": "integration",
    "phase": 3,
    "channel": null,
    "stepKey": "P3PublicIntro",
    "title": "Preparing for Public Introduction & Church Welcome",
    "body": "As part of celebrating what God has done in your life and welcoming you fully into the TKP family, we usually give new and returning members an opportunity to briefly introduce themselves to the church during a service.\n\nIt’s very simple—just something like:\n‘My name is [Name]. I joined The King’s Palace about [X] months ago. I’m now part of [Department / Fellowship / Cell Group]. It has been a blessing being here and I thank God for this church family.’\n\nWould you be comfortable doing that when the time comes? We’ll let you know in advance which service it will be.\n\nAction: coordinate timing with pastors/service coordinators · record when the public welcome is done."
  },
  {
    "id": "p3-4",
    "team": "integration",
    "phase": 3,
    "channel": null,
    "stepKey": "P3Closure",
    "title": "Final Encouragement & Closure",
    "body": "[Name], it has been a joy walking with you over these past three months. We thank God that you are now settled into [Department / Fellowship / Cell Group] and are part of the RCCG The King’s Palace family.\n\nPlease know that this is not the end of the journey—it’s the beginning of deeper growth and service. You are always welcome to reach out to me or any member of the integration team if you need support, prayer, or guidance.\n\nWe are grateful that God led you here, and we look forward to seeing all He will do in and through you.\n\nWe will announce when the New Members Banquet will be soon. I hope to see you there."
  }
];
