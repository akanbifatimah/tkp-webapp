import { describe, expect, it } from "vitest";
import type { Result } from "./connect-api";
import { db } from "./db";
import { enrol, overview } from "./grow-api";
import { mySignature, removeMySignature, saveMySignature, SIGNATURE_MAX_CHARS } from "./signatures";
import { dropOff, issueCertificate, listCertificates, logCertificatePrint, logDropOffCopy, readiness, reissueCertificate, revokeCertificate, verifyCertificate } from "./grow-certs";

/** M8 step 4: certificates and the drop-off report (Figma 136:28021, 136:28729; PRD LMS-9, G-12, PL-1). docs/API.md §16. */
const user = (id: string) => db.staff.find((s) => s.id === id)!;
const TECH_TEAM = "u02";
const CHURCH_ADMIN = "u04";
const REGISTRAR = "u23";
const DOYIN = "u18";
const ESTHER = "u22"; // teaches Water Baptism
const code = (r: Result<unknown>) => (r.ok ? null : r.code);
const last = () => db.audit[0]!;
const must = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.body;
};

describe("Certificates: who is ready (Figma Ready to issue)", () => {
  it("lists people who meet the completion rules and have no certificate", () => {
    const r = must(listCertificates(user(REGISTRAR)));
    expect(r.ready.length).toBeGreaterThan(3);
    const wb = r.ready.filter((x) => x.courseId === "c-wb");
    expect(wb.length).toBeGreaterThan(0);
    expect(wb[0]).toMatchObject({ attended: 2, needed: 2, assessment: "No assessment needed" });
    expect(r.ready.some((x) => x.courseId === "c-prayer")).toBe(true);
    // Growth Class needs its final reflection, which hasn't opened.
    expect(r.ready.some((x) => x.courseId === "c-growth")).toBe(false);
    const g = r.inProgress.find((x) => x.courseId === "c-growth")!;
    expect(g.missing).toContain("Answer Class Reflection");
    expect(r.issued.length).toBeGreaterThan(6);
    expect(r.issued[0]!.serial).toMatch(/^TKP-\d{4}-\d{3}$/);
    expect(r.can.issue).toBe(true);
  });

  it("works out each rule", () => {
    const g = db.learnCourses.find((c) => c.id === "c-growth")!;
    const e = db.learnEnrolments.find((x) => x.courseId === "c-growth" && x.status === "enrolled")!;
    const r = readiness(g, e);
    expect(r.ready).toBe(false);
    expect(r.missing.some((m) => m.includes("Class Reflection"))).toBe(true);
  });

  it("teachers see their classes; only the Registrar issues", () => {
    const t = must(listCertificates(user(ESTHER)));
    expect(t.ready.every((x) => x.courseId === "c-wb")).toBe(true);
    expect(t.can.issue).toBe(false);
    // Older cohorts (no class any more) are for those who see every class.
    expect(t.issued.every((x) => x.courseId === "c-wb")).toBe(true);
    expect(must(listCertificates(user(CHURCH_ADMIN))).issued.some((x) => x.courseId === null)).toBe(true);
    const r = must(listCertificates(user(REGISTRAR))).ready[0]!;
    expect(code(issueCertificate(user(ESTHER), r.enrolmentId))).toBe("FORBIDDEN");
    expect(code(issueCertificate(user(CHURCH_ADMIN), r.enrolmentId))).toBe("FORBIDDEN");
  });
});

describe("Certificates: issue, reissue, revoke (PRD LMS-9)", () => {
  it("issues with the next serial, completes the step, and refuses twice", () => {
    const r = must(listCertificates(user(REGISTRAR))).ready.find((x) => x.courseId === "c-wb")!;
    const e = db.learnEnrolments.find((x) => x.id === r.enrolmentId)!;
    const p = db.learnPeople.find((x) => x.id === e.personId)!;
    const year = new Date().getFullYear();
    const before = db.learnCertificates.filter((x) => x.serial.startsWith(`TKP-${year}-`)).map((x) => Number(x.serial.slice(9)));
    const c = must(issueCertificate(user(REGISTRAR), r.enrolmentId)).certificate;
    expect(c.serial).toBe(`TKP-${year}-${String(Math.max(...before) + 1).padStart(3, "0")}`);
    expect(c).toMatchObject({ name: p.name, courseTitle: "Water Baptism Class", teacher: "Esther Oyelaran", pastor: "Samuel Bankole", status: "valid" });
    expect(c.verifyUrl).toContain(c.serial);
    expect(e.status).toBe("completed");
    expect(p.completedSteps).toContain(3);
    expect(last()).toMatchObject({ action: "learn.certificate.issue", meta: { after: { serial: c.serial } } });
    expect(code(issueCertificate(user(REGISTRAR), r.enrolmentId))).toBe("ALREADY_ISSUED");
    expect(must(listCertificates(user(REGISTRAR))).ready.some((x) => x.enrolmentId === r.enrolmentId)).toBe(false);
  });

  it("prints the names corrected on the preview, and audits the change", () => {
    const r = must(listCertificates(user(REGISTRAR))).ready.find((x) => x.courseId === "c-wb")!;
    expect(code(issueCertificate(user(REGISTRAR), r.enrolmentId, { name: "X" }))).toBe("VALIDATION_FAILED");
    const fixed = `${r.name} Jr.`;
    const c = must(issueCertificate(user(REGISTRAR), r.enrolmentId, { name: `  ${fixed} `, teacher: "Pastor Esther Oyelaran", pastor: "" })).certificate;
    // Blank keeps the default; the record's own name is unchanged.
    expect(c).toMatchObject({ name: fixed, teacher: "Pastor Esther Oyelaran", pastor: "Samuel Bankole" });
    expect(db.learnPeople.some((p) => p.name === r.name)).toBe(true);
    expect(last()).toMatchObject({ action: "learn.certificate.issue", meta: { before: { name: r.name, teacher: "Esther Oyelaran" }, after: { name: fixed, teacher: "Pastor Esther Oyelaran" } } });
  });

  it("copies saved signatures onto the certificate, or the ones added on the preview", () => {
    const pastor = db.staff.find((s) => s.roles.includes("lead_pastor"))!;
    const teacher = db.staff.find((s) => s.fullName === "Esther Oyelaran")!;
    teacher.signature = "data:image/png;base64,AAAA";
    const [a, b] = must(listCertificates(user(REGISTRAR))).ready.filter((x) => x.courseId === "c-wb");
    expect(a).toMatchObject({ teacherSignature: teacher.signature, pastorSignature: pastor.signature });
    // Missing: the saved ones.
    const one = must(issueCertificate(user(REGISTRAR), a!.enrolmentId)).certificate;
    expect(one).toMatchObject({ teacherSignature: teacher.signature, pastorSignature: pastor.signature });
    expect(last().meta).toMatchObject({ after: { signatures: { teacher: "saved", pastor: "saved" } } });
    expect(code(issueCertificate(user(REGISTRAR), b!.enrolmentId, { teacherSignature: "javascript:alert(1)" }))).toBe("VALIDATION_FAILED");
    // null: none; an image: that one, this certificate only.
    const two = must(issueCertificate(user(REGISTRAR), b!.enrolmentId, { teacherSignature: null, pastorSignature: "data:image/png;base64,BBBB" })).certificate;
    expect(two).toMatchObject({ teacherSignature: null, pastorSignature: "data:image/png;base64,BBBB" });
    expect(last().meta).toMatchObject({ after: { signatures: { teacher: "none", pastor: "added" } } });
    expect(pastor.signature).not.toBe("data:image/png;base64,BBBB");
    // A later change never alters an issued certificate.
    teacher.signature = null;
    expect(must(listCertificates(user(REGISTRAR))).issued.find((x) => x.id === one.id)!.teacherSignature).toBe("data:image/png;base64,AAAA");
  });

  it("my signature: saved, replaced and removed by its owner, images only", () => {
    const me = user(ESTHER);
    expect(code(saveMySignature(me, { signature: "data:image/svg+xml,<svg/>" }))).toBe("VALIDATION_FAILED");
    expect(code(saveMySignature(me, { signature: `data:image/png;base64,${"A".repeat(SIGNATURE_MAX_CHARS)}` }))).toBe("VALIDATION_FAILED");
    expect(must(saveMySignature(me, { signature: "data:image/png;base64,CCCC" })).signature).toBe("data:image/png;base64,CCCC");
    expect(last()).toMatchObject({ action: "account.signature.save", meta: { after: { replaced: false } } });
    expect(must(mySignature(me)).signature).toBe("data:image/png;base64,CCCC");
    must(removeMySignature(me));
    expect(last().action).toBe("account.signature.remove");
    expect(must(mySignature(me)).signature).toBeNull();
  });

  it("won't issue to someone who isn't ready", () => {
    const e = db.learnEnrolments.find((x) => x.courseId === "c-growth" && x.status === "enrolled")!;
    const r = issueCertificate(user(REGISTRAR), e.id);
    expect(code(r)).toBe("NOT_READY");
    expect(!r.ok && r.message).toMatch(/Class Reflection/);
  });

  it("reissue makes a new copy, keeps the old one, and needs a reason", () => {
    const old = must(listCertificates(user(REGISTRAR))).issued.find((x) => x.status === "valid" && x.courseId === "c-wb")!;
    expect(code(reissueCertificate(user(REGISTRAR), old.id, { reason: "" }))).toBe("VALIDATION_FAILED");
    const fixed = `${old.name.split(" ")[0]} A. ${old.name.split(" ")[1]}`;
    const next = must(reissueCertificate(user(REGISTRAR), old.id, { reason: "Middle initial was missing", name: fixed })).certificate;
    expect(next).toMatchObject({ name: fixed, replaces: old.serial, status: "valid", reason: "Middle initial was missing" });
    const after = must(listCertificates(user(REGISTRAR))).issued;
    expect(after.find((x) => x.id === old.id)).toMatchObject({ status: "replaced", replacedBy: next.serial });
    expect(verifyCertificate(old.serial)).toMatchObject({ status: "replaced" });
    expect(code(reissueCertificate(user(REGISTRAR), old.id, { reason: "Again please" }))).toBe("NOT_VALID");
    expect(last().action).toBe("learn.certificate.reissue");
  });

  it("revoke keeps the record, says so on the verify page, and undoes the step", () => {
    const x = must(listCertificates(user(REGISTRAR))).issued.find((c) => c.status === "valid" && c.courseId === "c-wb")!;
    const rec = db.learnCertificates.find((c) => c.id === x.id)!;
    const p = db.learnPeople.find((y) => y.id === rec.personId)!;
    expect(code(revokeCertificate(user(REGISTRAR), x.id, { reason: "no" }))).toBe("VALIDATION_FAILED");
    must(revokeCertificate(user(REGISTRAR), x.id, { reason: "Issued to the wrong person" }));
    expect(verifyCertificate(x.serial)).toMatchObject({ status: "revoked", name: x.name });
    expect(db.learnCertificates.some((c) => c.id === x.id)).toBe(true);
    const otherWb = db.learnCertificates.some((c) => c.personId === p.id && c.step === 3 && c.status === "valid");
    expect(p.completedSteps.includes(3)).toBe(otherWb);
    expect(last()).toMatchObject({ action: "learn.certificate.revoke" });
  });

  it("the public check shows only name, course, date and status", () => {
    const x = db.learnCertificates.find((c) => c.status === "valid")!;
    const v = verifyCertificate(x.serial.toLowerCase());
    expect(Object.keys(v).sort()).toEqual(["course", "issuedOn", "name", "serial", "status"]);
    expect(verifyCertificate("TKP-1999-001")).toEqual({ serial: "TKP-1999-001", status: "unknown" });
  });

  it("logs printing", () => {
    const x = db.learnCertificates.find((c) => c.status === "valid")!;
    must(logCertificatePrint(user(REGISTRAR), x.id));
    expect(last()).toMatchObject({ action: "learn.certificate.export" });
  });

  it("issued steps open the next class's prerequisite", () => {
    const r = must(listCertificates(user(REGISTRAR))).ready.find((x) => x.courseId === "c-wb");
    if (!r) return;
    const e = db.learnEnrolments.find((x) => x.id === r.enrolmentId)!;
    const p = db.learnPeople.find((x) => x.id === e.personId)!;
    must(issueCertificate(user(REGISTRAR), r.enrolmentId));
    // Growth Class needs Water Baptism (step 3); they can now join without a waiver.
    if (!db.learnEnrolments.some((x) => x.courseId === "c-growth" && x.personId === p.id)) {
      const g = db.learnCourses.find((c) => c.id === "c-growth")!;
      const reg = g.registration;
      g.registration = "open";
      expect(code(enrol(user(REGISTRAR), "c-growth", { personId: p.id }))).not.toBe("PREREQUISITE");
      g.registration = reg;
    }
  });
});

describe("Drop-off report (Figma Drop-Off Reports)", () => {
  it("counts who started each step and who moved on, for the period", () => {
    const r = must(dropOff(user(REGISTRAR), "all"));
    expect(r.steps).toHaveLength(7);
    expect(r.steps[0]!.started).toBe(180);
    expect(r.steps[0]!.rate).toBeGreaterThan(50);
    expect(r.steps.at(-1)!.movedOn).toBeNull();
    // School of Ministry hasn't run, so School of Disciples has no drop to measure.
    expect(r.steps[5]).toMatchObject({ nextOffered: false, movedOn: null, rate: null });
    expect(r.insight?.from).not.toBe("School of Disciples");
    expect(r.insight).toBeTruthy();
    const year = must(dropOff(user(REGISTRAR), "12m"));
    expect(year.tracked).toBeLessThanOrEqual(r.tracked);
    expect(year.steps[0]!.started).toBeLessThanOrEqual(180);
  });

  it("hides groups under five (PL-1)", () => {
    const r = must(dropOff(user(REGISTRAR), "year"));
    for (const s of r.steps) if (s.hidden) expect([s.started, s.movedOn, s.rate]).toEqual([0, null, null]);
    for (const s of r.steps) if (!s.hidden && s.started) expect(s.started).toBeGreaterThanOrEqual(5);
  });

  it("gives follow-up lists, names only to those who may copy them", () => {
    const r = must(dropOff(user(REGISTRAR), "12m"));
    expect(r.followUps.length).toBeGreaterThan(0);
    expect(r.followUps[0]!.names).toHaveLength(r.followUps[0]!.count);
    const tt = must(dropOff(user(TECH_TEAM), "12m"));
    expect(tt.can.copy).toBe(false);
    expect(tt.followUps.every((f) => f.names.length === 0)).toBe(true);
    expect(dropOff(user(DOYIN)).status).toBe(403);
    must(logDropOffCopy(user(REGISTRAR), r.followUps[0]!.id));
    expect(last()).toMatchObject({ action: "learn.dropoff.export" });
    expect(code(logDropOffCopy(user(TECH_TEAM), "x"))).toBe("FORBIDDEN");
  });

  it("puts certificates on the dashboard", () => {
    const o = must(overview(user(REGISTRAR)));
    expect(o.tiles.awaitingCertificates).toBe(must(listCertificates(user(REGISTRAR))).ready.length);
    expect(o.attention.some((a) => a.kind === "certificates" && a.to === "/grow/certificates")).toBe(o.tiles.awaitingCertificates > 0);
  });
});
