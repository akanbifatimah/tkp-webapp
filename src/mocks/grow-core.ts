import type { Person } from "@/features/grow/grow-types";
import { can, type Permission } from "@/lib/permissions";
import type { Result } from "./connect-api";
import { db } from "./db";
import type { CourseRecord } from "./seed/grow";
import type { StaffRecord } from "./seed/staff";

/** Helpers shared by the Grow mock server modules (docs/API.md §13, §14). */

export const ok = <T,>(body: T, status = 200): Result<T> => ({ ok: true, status, body });
export const no = (status: number, code: string, message: string, fields?: Record<string, string[]>): Result<never> => ({
  ok: false,
  status,
  code,
  message,
  ...(fields ? { fields } : {}),
});
export const allowed = (u: StaffRecord, p: Permission) => u.roles.some((r) => can(r, p));
export const FORBIDDEN = "You don't have access to this.";
export const NOT_FOUND = "That class no longer exists.";
export const DAY = 86_400_000;

export const findCourse = (id: string) => db.learnCourses.find((c) => c.id === id);
export const findSession = (id: string) => db.learnSessions.find((s) => s.id === id);
export const sessionsOf = (courseId: string) => db.learnSessions.filter((s) => s.courseId === courseId).sort((a, b) => a.number - b.number);
export const enrolmentsOf = (courseId: string) => db.learnEnrolments.filter((e) => e.courseId === courseId);
export const activeEnrolments = (courseId: string) => enrolmentsOf(courseId).filter((e) => e.status === "enrolled" || e.status === "completed");
export const person = (id: string) => db.learnPeople.find((p) => p.id === id);
export const staffPerson = (id: string): Person => ({ id, name: db.staff.find((s) => s.id === id)?.fullName ?? "Former staff" });

/** Course authors and graders see only their own classes (PRD U12). */
export const seesAll = (u: StaffRecord) => allowed(u, "learn.all");
export const assigned = (u: StaffRecord, c: Pick<CourseRecord, "teacherIds" | "graderIds">) => c.teacherIds.includes(u.id) || c.graderIds.includes(u.id);
export const canSee = (u: StaffRecord, c: CourseRecord) => allowed(u, "learn.view") && (seesAll(u) || assigned(u, c));
export const canManage = (u: StaffRecord) => allowed(u, "learn.manage");
/** The Registrar edits any class's content; a Course Author only the classes they teach. */
export const canAuthor = (u: StaffRecord, c: CourseRecord) => canManage(u) || (allowed(u, "learn.author") && c.teacherIds.includes(u.id));
