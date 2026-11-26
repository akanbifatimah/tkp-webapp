import { describe, expect, it } from "vitest";
import type { ProjectInput } from "@/features/serve/project-types";
import type { Result } from "./connect-api";
import { db } from "./db";
import {
  approveProject,
  assignLead,
  closeProject,
  createProject,
  declineProject,
  featureProject,
  getProject,
  listProjects,
  problemsOf,
  publicProjects,
  requestChanges,
  setPosition,
  submitProject,
  tapContact,
  updateProject,
} from "./project-api";

/** M9 step 2: Projects, following the Figma (PJ1, PJ3, PJ4, PJ5). docs/API.md §19. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const TECH_TEAM = "u02";
const PASTOR = "u03";
const CHURCH_ADMIN = "u04";
const EMMANUEL = "u27"; // Project Lead of the Livestream Upgrade
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const last = () => db.audit[0]!;
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};
const rec = (id: string) => db.projects.find((p) => p.id === id)!;
const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

const input = (o: Partial<ProjectInput> = {}): ProjectInput => ({
  name: "Hospitality Team Refresh",
  description: "New coffee station and welcome rota for the 1st and 2nd services.",
  ministry: "Hospitality",
  startDate: day(5),
  targetFinish: day(60),
  cover: null,
  contact: { coordinators: "Ngozi O.", role: "Hospitality Lead", phone: "(281) 555-0110", whatsapp: true, email: "", howToApply: "WhatsApp Ngozi." },
  positions: [{ title: "Barista", responsibilities: "Make coffee before service", skills: ["Coffee"], commitment: "Sundays (8 – 9 am)", format: "In person (Katy)", openings: 3, closingDate: day(14) }],
  ...o,
});

describe("Who sees and does what (TKP, 2026-11-26)", () => {
  it("the pastoral team reviews; Tech Team looks; a Project Lead sees their own projects", () => {
    for (const id of [PASTOR, CHURCH_ADMIN, "u01"]) expect(must(listProjects(user(id), {})).can.review).toBe(true);
    expect(must(listProjects(user(TECH_TEAM), {})).can).toEqual({ review: false, create: false });
    const mine = must(listProjects(user(EMMANUEL), {}));
    expect(mine.scope).toBe("mine");
    expect(mine.items.map((p) => p.id)).toEqual(["prj-livestream"]);
    expect(getProject(user(EMMANUEL), "prj-impact").status).toBe(404);
    for (const id of ["u11", "u13", "u23"]) expect(listProjects(user(id), {}).status).toBe(403);
  });
});

describe("The review queue (Figma PJ5: reviewed within 3 days)", () => {
  it("lists posts waiting first, oldest first, with overdue ones counted", () => {
    const r = must(listProjects(user(PASTOR), {}));
    expect(r.counts).toMatchObject({ submitted: 3, changes: 1, live: 5, declined: 1, closed: 1, overdue: 1 });
    expect(r.items.slice(0, 3).map((p) => p.status)).toEqual(["submitted", "submitted", "submitted"]);
    expect(r.items[0]).toMatchObject({ id: "prj-parking", overdue: true });
    expect(r.stats.openSpots).toBeGreaterThan(10);
  });

  it("won't publish an incomplete post, and says what's missing", () => {
    const d = must(getProject(user(PASTOR), "prj-parking"));
    expect(d.problems).toEqual([
      "Add a phone number or email so people can reach the coordinator.",
      "Position 1 (Parking Greeter) closes on a date that has passed.",
      "Position 2 (Sign Painter) needs its responsibilities.",
      "Position 2 (Sign Painter) needs at least one opening.",
    ]);
    expect(code(approveProject(user(PASTOR), "prj-parking", d.rowVer))).toBe("NOT_READY");
  });

  it("approves a complete post onto the app's Projects page", () => {
    const d = must(getProject(user(CHURCH_ADMIN), "prj-fooddrive"));
    expect(d.problems).toEqual([]);
    expect(code(approveProject(user(EMMANUEL), "prj-fooddrive", d.rowVer))).toBe("NOT_FOUND");
    const r = must(approveProject(user(CHURCH_ADMIN), "prj-fooddrive", d.rowVer));
    expect(r.status).toBe("live");
    expect(r.history.at(-1)).toMatchObject({ action: "Approved and published", by: "Esther Coleman" });
    expect(last()).toMatchObject({ action: "projects.approve", target: "prj-fooddrive" });
    expect(must(publicProjects({ member: true })).items.some((p) => p.id === "prj-fooddrive")).toBe(true);
  });

  it("sends a post back with a message, or declines it with a reason", () => {
    const robes = rec("prj-robes");
    expect(code(requestChanges(user(PASTOR), "prj-robes", { message: "fix", rowVer: robes.rowVer }))).toBe("VALIDATION_FAILED");
    const c = must(requestChanges(user(PASTOR), "prj-robes", { message: "Please add a closing date so people know when to reply.", rowVer: robes.rowVer }));
    expect(c).toMatchObject({ status: "changes", reviewMessage: "Please add a closing date so people know when to reply." });
    const parking = rec("prj-parking");
    const dcl = must(declineProject(user(PASTOR), "prj-parking", { reason: "This belongs with the existing parking team, not a new project.", rowVer: parking.rowVer }));
    expect(dcl.status).toBe("declined");
    expect(last().action).toBe("projects.decline");
    expect(code(updateProject(user(PASTOR), "prj-parking", { ...input(), rowVer: dcl.rowVer }))).toBe("DECLINED");
  });

  it("features one project at a time", () => {
    const ls = rec("prj-livestream");
    const r = must(featureProject(user(PASTOR), "prj-livestream", true, ls.rowVer));
    expect(r.featured).toBe(true);
    expect(rec("prj-impact").featured).toBe(false);
    expect(db.projects.filter((p) => p.featured).map((p) => p.id)).toEqual(["prj-livestream"]);
    expect(must(publicProjects({ member: true })).items[0]!.id).toBe("prj-livestream");
  });
});

describe("Positions and Project Leads", () => {
  it("a Project Lead marks their positions filled or closed, but can't review", () => {
    const ls = rec("prj-livestream");
    const pos = ls.positions[0]!;
    const r = must(setPosition(user(EMMANUEL), "prj-livestream", pos.id, "filled", ls.rowVer));
    expect(r.positions[0]!.state).toBe("filled");
    expect(last()).toMatchObject({ action: "projects.position", meta: { after: { state: "filled" } } });
    expect(code(featureProject(user(EMMANUEL), "prj-livestream", false, r.rowVer))).toBe("FORBIDDEN");
    must(setPosition(user(EMMANUEL), "prj-livestream", pos.id, "open", r.rowVer));
  });

  it("works out closing soon and closed from the closing date", () => {
    const d = must(getProject(user(PASTOR), "prj-livestream"));
    expect(d.positions[0]).toMatchObject({ closingSoon: true, daysLeft: 5 });
    const parking = must(getProject(user(PASTOR), "prj-parking"));
    expect(parking.positions[0]!.state).toBe("closed");
  });

  it("assigns a Project Lead, who then sees the project", () => {
    const k = rec("prj-kingstouch");
    expect(code(assignLead(user(PASTOR), "prj-kingstouch", "u04", k.rowVer))).toBe("VALIDATION_FAILED");
    must(assignLead(user(PASTOR), "prj-kingstouch", EMMANUEL, k.rowVer));
    expect(must(listProjects(user(EMMANUEL), {})).items.map((p) => p.id).sort()).toEqual(["prj-kingstouch", "prj-livestream"]);
  });

  it("closing a live project needs a reason; it can reopen", () => {
    const t = rec("prj-tutoring");
    expect(code(closeProject(user(PASTOR), "prj-tutoring", { reason: "", rowVer: t.rowVer }, false))).toBe("VALIDATION_FAILED");
    const c = must(closeProject(user(PASTOR), "prj-tutoring", { reason: "Term is over", rowVer: t.rowVer }, false));
    expect(c.status).toBe("closed");
    expect(must(closeProject(user(PASTOR), "prj-tutoring", { rowVer: c.rowVer }, true)).status).toBe("live");
  });
});

describe("Creating and editing", () => {
  it("the pastoral team's projects go live; a Project Lead's wait for review", () => {
    expect(must(createProject(user(CHURCH_ADMIN), input())).status).toBe("live");
    const mine = must(createProject(user(EMMANUEL), input({ name: "Camera Training Day" })));
    expect(mine).toMatchObject({ status: "submitted", lead: { id: EMMANUEL } });
    expect(code(createProject(user(TECH_TEAM), input()))).toBe("FORBIDDEN");
  });

  it("checks the form like the Figma's required fields", () => {
    const r = createProject(user(CHURCH_ADMIN), input({ name: "", contact: { coordinators: "", role: "", phone: "", whatsapp: false, email: "", howToApply: "" }, positions: [{ title: "", responsibilities: "", skills: [], commitment: "", format: "Remote", openings: 0, closingDate: day(-3) }] }));
    expect(!r.ok && Object.keys(r.fields ?? {}).sort()).toEqual([
      "contact.coordinators",
      "contact.phone",
      "name",
      "positions.0.closingDate",
      "positions.0.commitment",
      "positions.0.openings",
      "positions.0.responsibilities",
      "positions.0.title",
    ]);
  });

  it("edits keep each position's state and contact count", () => {
    const ls = rec("prj-livestream");
    const taps = ls.positions[1]!.contactTaps;
    const d = must(getProject(user(EMMANUEL), "prj-livestream"));
    const r = must(updateProject(user(EMMANUEL), "prj-livestream", { ...d, description: `${d.description} Training provided.`, rowVer: d.rowVer }));
    expect(r.positions[1]!.contactTaps).toBe(taps);
    expect(r.history.at(-1)).toMatchObject({ action: "Edited", note: "Changed: description" });
  });
});

describe("The member app's routes (P-5, Figma PJ1, PJ4, PJ5)", () => {
  it("members only", () => {
    expect(code(publicProjects({}))).toBe("MEMBERS_ONLY");
    expect(code(submitProject({ ...input(), confirmed: true }))).toBe("MEMBERS_ONLY");
  });

  it("a member's post waits for the pastoral team, due in 3 days", () => {
    expect(code(submitProject({ ...input(), member: true }))).toBe("VALIDATION_FAILED");
    const r = must(submitProject({ ...input({ name: "Prayer Walk Team" }), member: true, confirmed: true, submitter: { name: "Ada Obi", email: "ada@example.com" } }));
    expect(Date.parse(r.reviewBy) - Date.now()).toBeGreaterThan(2.9 * 86_400_000);
    expect(rec(r.id)).toMatchObject({ status: "submitted", postedBy: { name: "Ada Obi" } });
  });

  it("counts contact taps, never who", () => {
    const pos = rec("prj-impact").positions[0]!;
    const before = pos.contactTaps;
    must(tapContact(pos.id));
    expect(pos.contactTaps).toBe(before + 1);
    expect(publicProjects({ member: true }).ok && JSON.stringify(publicProjects({ member: true })).includes("contactTaps")).toBe(false);
  });

  it("problemsOf flags an empty contact", () => {
    expect(problemsOf(rec("prj-basketball"), Date.now())).toEqual(["Say who coordinates it.", "Add a phone number or email so people can reach the coordinator."]);
  });
});
