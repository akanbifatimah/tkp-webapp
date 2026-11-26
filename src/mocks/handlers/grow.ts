import { http } from "msw";
import type { AssessmentInput, AttendanceInput, CourseInput, ReviewInput, SessionInput, Upload } from "@/features/grow/grow-types";
import { authenticate, latency, path } from "../http";
import {
  addResource,
  archiveCourse,
  createCourse,
  createSession,
  deleteCourse,
  deleteSession,
  enrol,
  getCourse,
  getRoster,
  listCourses,
  logRosterExport,
  overview,
  promote,
  publishCourse,
  publishSession,
  removeResource,
  searchPeople,
  setRegistration,
  updateCourse,
  updateSession,
  upload,
  withdraw,
  sessionDetail,
  type SessionBody,
  type UploadPurpose,
} from "../grow-api";
import { createAssessment, deleteAssessment, getAssessment, getAttendance, publishAssessment, saveAttendance, updateAssessment } from "../grow-teaching";
import { getSubmission, listSubmissions, remind, saveReview, setExcused } from "../grow-review";
import { send } from "./connect";

/** HTTP wrappers around the mock Grow server (docs/API.md §13). */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;
const R = "/learn";
type P = { params: Record<string, string | readonly string[] | undefined> };
const id = ({ params }: P, k = "id") => String(params[k]);

/** Each route: authenticate, wait a little, answer. */
const route =
  <A,>(fn: (user: Parameters<typeof listCourses>[0], request: Request, ctx: P) => A | Promise<A>) =>
  async ({ request, params }: { request: Request } & P) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send((await fn(auth.user, request, { params })) as never);
  };

export const growHandlers = [
  http.get(path(`${R}/overview`), route((u) => overview(u))),
  http.get(path(`${R}/courses`), route((u) => listCourses(u))),
  http.post(path(`${R}/courses`), route(async (u, r) => createCourse(u, await body<Partial<CourseInput>>(r)))),
  http.get(path(`${R}/courses/:id`), route((u, _r, c) => getCourse(u, id(c)))),
  http.put(path(`${R}/courses/:id`), route(async (u, r, c) => updateCourse(u, id(c), await body<Partial<CourseInput> & { rowVer?: number }>(r)))),
  http.delete(path(`${R}/courses/:id`), route((u, _r, c) => deleteCourse(u, id(c)))),
  http.post(path(`${R}/courses/:id/publish`), route(async (u, r, c) => publishCourse(u, id(c), (await body<{ rowVer?: number }>(r)).rowVer))),
  http.post(
    path(`${R}/courses/:id/registration`),
    route(async (u, r, c) => {
      const b = await body<{ open?: boolean; rowVer?: number }>(r);
      return setRegistration(u, id(c), !!b.open, b.rowVer);
    }),
  ),
  http.post(path(`${R}/courses/:id/archive`), route(async (u, r, c) => archiveCourse(u, id(c), (await body<{ rowVer?: number }>(r)).rowVer))),

  http.post(path(`${R}/courses/:id/sessions`), route(async (u, r, c) => createSession(u, id(c), await body<Partial<SessionInput>>(r)))),
  http.get(path(`${R}/sessions/:id`), route((u, _r, c) => sessionDetail(u, id(c)))),
  http.get(path(`${R}/sessions/:id/attendance`), route((u, _r, c) => getAttendance(u, id(c)))),
  http.put(path(`${R}/sessions/:id/attendance`), route(async (u, r, c) => saveAttendance(u, id(c), await body<Partial<AttendanceInput>>(r)))),

  http.post(path(`${R}/courses/:id/assessments`), route(async (u, r, c) => createAssessment(u, id(c), await body<Partial<AssessmentInput>>(r)))),
  http.get(path(`${R}/assessments/:id`), route((u, _r, c) => getAssessment(u, id(c)))),
  http.put(path(`${R}/assessments/:id`), route(async (u, r, c) => updateAssessment(u, id(c), await body<Partial<AssessmentInput> & { rowVer?: number }>(r)))),
  http.post(path(`${R}/assessments/:id/publish`), route(async (u, r, c) => publishAssessment(u, id(c), (await body<{ rowVer?: number }>(r)).rowVer))),
  http.post(path(`${R}/assessments/:id/unpublish`), route(async (u, r, c) => publishAssessment(u, id(c), (await body<{ rowVer?: number }>(r)).rowVer, false))),
  http.get(path(`${R}/assessments/:id/submissions`), route((u, _r, c) => listSubmissions(u, id(c)))),
  http.post(path(`${R}/assessments/:id/remind`), route((u, _r, c) => remind(u, id(c)))),
  http.put(
    path(`${R}/assessments/:id/excused/:enrolmentId`),
    route(async (u, r, c) => setExcused(u, id(c), id(c, "enrolmentId"), String((await body<{ reason?: string }>(r)).reason ?? ""))),
  ),
  http.delete(path(`${R}/assessments/:id/excused/:enrolmentId`), route((u, _r, c) => setExcused(u, id(c), id(c, "enrolmentId"), null))),
  http.get(path(`${R}/submissions/:id`), route((u, _r, c) => getSubmission(u, id(c)))),
  http.put(path(`${R}/submissions/:id/review`), route(async (u, r, c) => saveReview(u, id(c), await body<Partial<ReviewInput>>(r)))),
  http.delete(path(`${R}/assessments/:id`), route((u, _r, c) => deleteAssessment(u, id(c)))),

  http.put(path(`${R}/sessions/:id`), route(async (u, r, c) => updateSession(u, id(c), await body<SessionBody>(r)))),
  http.post(path(`${R}/sessions/:id/publish`), route(async (u, r, c) => publishSession(u, id(c), (await body<{ rowVer?: number }>(r)).rowVer))),
  http.post(path(`${R}/sessions/:id/unpublish`), route(async (u, r, c) => publishSession(u, id(c), (await body<{ rowVer?: number }>(r)).rowVer, false))),
  http.delete(path(`${R}/sessions/:id`), route((u, _r, c) => deleteSession(u, id(c)))),

  // Multipart: purpose (video | handout | resource) and file. The mock keeps the name and size only.
  http.post(
    path(`${R}/uploads`),
    route(async (u, r) => {
      const form = await r.formData().catch(() => null);
      const file = form?.get("file");
      const purpose = String(form?.get("purpose") ?? "") as UploadPurpose;
      return upload(u, purpose, file instanceof File ? { name: file.name, size: file.size, type: file.type } : { name: "", size: 0, type: "" });
    }),
  ),
  http.post(path(`${R}/courses/:id/resources`), route(async (u, r, c) => addResource(u, id(c), (await body<{ file: Upload }>(r)).file))),
  http.delete(path(`${R}/courses/:id/resources/:fileId`), route((u, _r, c) => removeResource(u, id(c), id(c, "fileId")))),

  http.get(path(`${R}/courses/:id/roster`), route((u, _r, c) => getRoster(u, id(c)))),
  http.get(path(`${R}/courses/:id/people`), route((u, r, c) => searchPeople(u, id(c), new URL(r.url).searchParams.get("q") ?? ""))),
  http.post(path(`${R}/courses/:id/roster`), route(async (u, r, c) => enrol(u, id(c), await body<{ personId?: string; waive?: string }>(r)))),
  http.post(path(`${R}/courses/:id/roster/export`), route((u, _r, c) => logRosterExport(u, id(c)))),
  http.post(path(`${R}/enrolments/:id/withdraw`), route(async (u, r, c) => withdraw(u, id(c), (await body<{ reason?: string }>(r)).reason ?? ""))),
  http.post(path(`${R}/enrolments/:id/promote`), route((u, _r, c) => promote(u, id(c)))),
];
