import { env } from "./env";
import { session } from "./session";
import type {
  AssignResponse,
  Department,
  GuestEntry,
  GuestResponse,
  GuestTrackResponse,
  JourneyResponse,
  MetricsResponse,
  LogsResponse,
  QueueResponse,
  SaveLogBody,
  SaveLogResponse,
} from "@/features/connect/types";
import type { FeatureCollection, Geometry } from "geojson";
import type { CellMapResponse, CellName, Service, ServiceInput, ServicesResponse, SetZipResponse } from "@/features/admin/config-types";
import type { DuplicatesResponse, MergeInput, MergeResult, UnmergeResult } from "@/features/welcome/duplicate-types";
import type { ImportJob, ImportKind, ImportListResponse, ImportPatch, ImportSummary } from "@/features/welcome/import-types";
import type { LcmResponse } from "@/features/welcome/lcm-types";
import type { Period, Recipient, ReportData, ReportId, ReportRun, ReportsResponse, Schedule, ScheduleInput, SchedulesResponse, ShareInput } from "@/features/reports/report-types";
import type {
  Assessment,
  AssessmentInput,
  AttendanceInput,
  AttendanceSheet,
  Certificate,
  CertificateCheck,
  CertificatesResponse,
  CourseDetail,
  CourseInput,
  DropOffPeriod,
  DropOffReport,
  ForumFilter,
  ForumResponse,
  ForumSort,
  NewPromptInput,
  ThreadDetail,
  ReviewInput,
  SubmissionDetail,
  SubmissionsResponse,
  CoursesResponse,
  Enrolment,
  GrowOverview,
  PersonHit,
  RosterResponse,
  Session,
  SessionDetail,
  SessionInput,
  Upload,
} from "@/features/grow/grow-types";
import type { PrintLayout, QrCode, QrDatesInput, QrDetail, QrInput, QrListResponse, QrResolve } from "@/features/welcome/qr-types";
import type { GuestRecord, GuestSearch, GuestSearchResponse, OverviewResponse, Scope } from "@/features/welcome/types";
import type {
  AdminSettings,
  AdminUser,
  AuditQuery,
  AuditResponse,
  DashboardResponse,
  SettingsInput,
  TempPasswordResponse,
  UserInput,
  UserQuery,
  UsersResponse,
} from "@/features/admin/types";
import type { Team } from "./permissions";
import type { Member, PublicSettings } from "./types";

/**
 * The ONLY module in the app that calls fetch.
 * Point VITE_API_BASE_URL at the real backend (and set VITE_USE_MOCKS=false) to leave the mocks.
 * Error envelope (docs/API.md): { "error": { "code", "message", "fields" } }
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
    /** Anything else the server put in the error object (e.g. the failed password rules). */
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isConflict() {
    return this.status === 409;
  }
}

/** Repo wording (UI-S1): say plainly when the server cannot be reached. */
export const NETWORK_MESSAGE = "TKP Hub cannot reach its server. Check your connection and try again.";
const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

type Query = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Idempotency key for writes (TKP Connect BR-18: a double click makes one log). */
  clientRequestId?: string;
};

let onUnauthorized: (() => void) | null = null;
/** The auth layer registers what to do when any call comes back 401. */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

function buildUrl(path: string, query?: Query) {
  const url = `${env.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function parseError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const e = body?.error;
  if (e && typeof e === "object") {
    const { code, message, fields, ...details } = e as {
      code?: string;
      message?: string;
      fields?: Record<string, string[]>;
    } & Record<string, unknown>;
    return new ApiError(res.status, code ?? "UNKNOWN", message ?? FALLBACK_MESSAGE, fields, details);
  }
  // Tolerate the TKP Connect style { "error": "message" } as well.
  if (typeof e === "string") return new ApiError(res.status, "UNKNOWN", e);
  return new ApiError(res.status, "UNKNOWN", FALLBACK_MESSAGE);
}

/** Corrections from the review step. Signatures: missing = the saved one, null = none, an image = this one. */
export type IssueCertificateBody = { name?: string; teacher?: string; pastor?: string; teacherSignature?: string | null; pastorSignature?: string | null };

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // A file upload goes as multipart; the browser sets the boundary.
  const form = typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (opts.body !== undefined && !form) headers["Content-Type"] = "application/json";
  const token = session.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.clientRequestId) headers["Idempotency-Key"] = opts.clientRequestId;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: form ? (opts.body as FormData) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: "include",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", NETWORK_MESSAGE);
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const error = await parseError(res);
    if (error.isUnauthorized && token) onUnauthorized?.();
    throw error;
  }
  return (await res.json()) as T;
}

/** A fresh idempotency key for one user action. */
export const newClientRequestId = () => crypto.randomUUID();

/* ---------------------------------------------------------------- endpoints */

export type SignInResponse = { token: string; expiresAt: string; member: Member };

/** Staff get a second step instead of a session (PRD A-2). docs/API.md §2. */
export type MfaChallenge = { ticket: string; method: "email"; sentTo: string; expiresAt: string; resendAt: string };
export type SignInStep = SignInResponse | { mfa: MfaChallenge };

/** Static public files shipped with the front end (not the API). */
async function staticJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError(0, "NETWORK", NETWORK_MESSAGE);
  }
  if (!res.ok) throw new ApiError(res.status, "NOT_FOUND", "A map file could not be loaded.");
  return (await res.json()) as T;
}

export const api = {
  geo: {
    /** US state or world country outlines for LCM Map 2 (public data in /geo). */
    outlines: (name: "us-states" | "world-countries") =>
      staticJson<FeatureCollection<Geometry, { n: string; lat?: number; lon?: number }>>(`/geo/${name}.json`),
  },
  auth: {
    signIn: (email: string, password: string, deviceToken?: string) => request<SignInStep>("/auth/sign-in", { body: { email, password, ...(deviceToken ? { deviceToken } : {}) } }),
    verifyMfa: (ticket: string, code: string, remember: boolean, deviceLabel: string) =>
      request<SignInResponse & { device?: { token: string; expiresAt: string } }>("/auth/mfa/verify", { body: { ticket, code, remember, deviceLabel } }),
    resendMfa: (ticket: string) => request<MfaChallenge>("/auth/mfa/resend", { body: { ticket } }),
    renew: () => request<SignInResponse>("/auth/token/renew", { method: "POST" }),
    signOut: () => request<void>("/auth/sign-out", { method: "POST" }),
    me: (signal?: AbortSignal) => request<{ member: Member }>("/me", { signal }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ signedOut: true }>("/auth/change-password", { body: { currentPassword, newPassword } }),
  },
  /** My signature, printed on certificates. */
  signature: {
    get: (signal?: AbortSignal) => request<{ signature: string | null }>("/me/signature", { signal }),
    save: (signature: string) => request<{ signature: string }>("/me/signature", { method: "PUT", body: { signature } }),
    remove: () => request<{ signature: null }>("/me/signature", { method: "DELETE" }),
  },
  settings: {
    public: () => request<PublicSettings>("/settings/public"),
  },
  dashboard: (signal?: AbortSignal) => request<DashboardResponse>("/dashboard", { signal }),
  admin: {
    users: (q: UserQuery, signal?: AbortSignal) => request<UsersResponse>("/admin/users", { query: q, signal }),
    createUser: (body: UserInput) => request<TempPasswordResponse>("/admin/users", { body }),
    updateUser: (id: string, body: UserInput & { rowVer: number }) => request<{ user: AdminUser }>(`/admin/users/${id}`, { method: "PUT", body }),
    deactivate: (id: string) => request<{ user: AdminUser }>(`/admin/users/${id}/deactivate`, { method: "POST" }),
    reactivate: (id: string) => request<{ user: AdminUser }>(`/admin/users/${id}/reactivate`, { method: "POST" }),
    resetPassword: (id: string) => request<TempPasswordResponse>(`/admin/users/${id}/reset-password`, { method: "POST" }),
    signOutEverywhere: (id: string) => request<{ user: AdminUser }>(`/admin/users/${id}/sign-out-everywhere`, { method: "POST" }),
    audit: (q: AuditQuery, signal?: AbortSignal) => request<AuditResponse>("/admin/audit", { query: q, signal }),
    settings: (signal?: AbortSignal) => request<{ settings: AdminSettings }>("/admin/settings", { signal }),
    saveSettings: (body: SettingsInput) => request<{ settings: AdminSettings }>("/admin/settings", { method: "PUT", body }),
  },
  /** M7 configuration: cell and ZIP map (PRD W-12), services and special events (W-13). docs/API.md §8. */
  config: {
    cellMap: (signal?: AbortSignal) => request<CellMapResponse>("/welcome/cell-map", { signal }),
    setZip: (zip: string, cell: CellName, rowVer: number) => request<SetZipResponse>(`/welcome/cell-map/zips/${zip}`, { method: "PUT", body: { cell, rowVer } }),
    removeZip: (zip: string, rowVer: number) => request<SetZipResponse>(`/welcome/cell-map/zips/${zip}`, { method: "DELETE", query: { rowVer } }),
    services: (signal?: AbortSignal) => request<ServicesResponse>("/welcome/services", { signal }),
    createService: (body: ServiceInput) => request<{ service: Service }>("/welcome/services", { body }),
    updateService: (id: string, body: ServiceInput & { rowVer: number }) =>
      request<{ service: Service; renamedEntries: number }>(`/welcome/services/${id}`, { method: "PUT", body }),
    retireService: (id: string) => request<{ service: Service }>(`/welcome/services/${id}/retire`, { method: "POST" }),
    restoreService: (id: string) => request<{ service: Service }>(`/welcome/services/${id}/restore`, { method: "POST" }),
    deleteService: (id: string) => request<{ deleted: true }>(`/welcome/services/${id}`, { method: "DELETE" }),
    reorderServices: (ids: string[]) => request<ServicesResponse>("/welcome/services/order", { method: "PUT", body: { ids } }),
  },
  /** QR codes (PRD 5.8), docs/API.md §9. */
  qr: {
    list: (signal?: AbortSignal) => request<QrListResponse>("/welcome/qr-codes", { signal }),
    get: (id: string, signal?: AbortSignal) => request<QrDetail>(`/welcome/qr-codes/${id}`, { signal }),
    create: (body: QrInput) => request<{ code: QrCode }>("/welcome/qr-codes", { body }),
    update: (id: string, body: QrInput & { rowVer: number }) => request<{ code: QrCode }>(`/welcome/qr-codes/${id}`, { method: "PUT", body }),
    setDates: (id: string, body: QrDatesInput) => request<{ code: QrCode }>(`/welcome/qr-codes/${id}/dates`, { method: "PUT", body }),
    setState: (id: string, verb: "publish" | "pause" | "resume", rowVer: number) =>
      request<{ code: QrCode }>(`/welcome/qr-codes/${id}/${verb}`, { method: "POST", body: { rowVer } }),
    remove: (id: string) => request<{ deleted: true }>(`/welcome/qr-codes/${id}`, { method: "DELETE" }),
    check: (body: Partial<QrInput> & { id?: string }, signal?: AbortSignal) =>
      request<{ fields: Record<string, string> }>("/welcome/qr-codes/check", { body, signal }),
    logPrint: (ids: string[], layout: PrintLayout, copies: number) => request<{ logged: true }>("/welcome/qr-codes/print", { body: { ids, layout, copies } }),
    /** Mock mode only: what the short address would do now. */
    resolve: (slug: string) => request<QrResolve>(`/public/qr/${slug}`),
  },
  reports: {
    list: (signal?: AbortSignal) => request<ReportsResponse>("/reports", { signal }),
    get: (id: ReportId, q: { period?: Period; type?: string }, signal?: AbortSignal) => request<ReportData>(`/reports/${id}`, { query: q, signal }),
    logExport: (id: ReportId, b: { format: "pdf" | "csv"; period?: Period; type?: string | null }) => request<{ logged: true }>(`/reports/${id}/export`, { body: b }),
    recipients: (id: ReportId, signal?: AbortSignal) => request<{ items: Recipient[] }>(`/reports/${id}/recipients`, { signal }),
    share: (id: ReportId, b: ShareInput) => request<ReportRun>(`/reports/${id}/share`, { body: b }),
    schedules: (signal?: AbortSignal) => request<SchedulesResponse>("/reports/schedules", { signal }),
    createSchedule: (b: ScheduleInput) => request<Schedule>("/reports/schedules", { body: b }),
    updateSchedule: (id: string, b: ScheduleInput & { rowVer: number }) => request<Schedule>(`/reports/schedules/${id}`, { method: "PUT", body: b }),
    setActive: (id: string, active: boolean, rowVer: number) => request<Schedule>(`/reports/schedules/${id}/${active ? "resume" : "pause"}`, { body: { rowVer } }),
    runNow: (id: string) => request<ReportRun>(`/reports/schedules/${id}/run`, { method: "POST" }),
    deleteSchedule: (id: string) => request<{ deleted: true }>(`/reports/schedules/${id}`, { method: "DELETE" }),
  },
  /** Grow, the Learn admin (docs/API.md §13). */
  learn: {
    overview: (signal?: AbortSignal) => request<GrowOverview>("/learn/overview", { signal }),
    courses: (signal?: AbortSignal) => request<CoursesResponse>("/learn/courses", { signal }),
    course: (id: string, signal?: AbortSignal) => request<CourseDetail>(`/learn/courses/${id}`, { signal }),
    create: (body: CourseInput) => request<{ course: CourseDetail }>("/learn/courses", { body }),
    update: (id: string, body: CourseInput & { rowVer: number }) =>
      request<{ course: CourseDetail; moved: number; promoted: string[] }>(`/learn/courses/${id}`, { method: "PUT", body }),
    publish: (id: string, rowVer: number) => request<{ course: CourseDetail }>(`/learn/courses/${id}/publish`, { body: { rowVer } }),
    registration: (id: string, open: boolean, rowVer: number) => request<{ course: CourseDetail }>(`/learn/courses/${id}/registration`, { body: { open, rowVer } }),
    archive: (id: string, rowVer: number) => request<{ course: CourseDetail }>(`/learn/courses/${id}/archive`, { body: { rowVer } }),
    remove: (id: string) => request<{ deleted: true }>(`/learn/courses/${id}`, { method: "DELETE" }),
    createSession: (courseId: string, body: Partial<SessionInput>) => request<{ session: Session; course: CourseDetail }>(`/learn/courses/${courseId}/sessions`, { body }),
    updateSession: (id: string, body: SessionInput & { rowVer: number; applyTo?: "new" | "everyone" }) =>
      request<{ session: Session }>(`/learn/sessions/${id}`, { method: "PUT", body }),
    publishSession: (id: string, rowVer: number, publish = true) => request<{ session: Session }>(`/learn/sessions/${id}/${publish ? "publish" : "unpublish"}`, { body: { rowVer } }),
    deleteSession: (id: string) => request<{ deleted: true }>(`/learn/sessions/${id}`, { method: "DELETE" }),
    upload: (purpose: "video" | "handout" | "resource", file: File) => {
      const body = new FormData();
      body.append("purpose", purpose);
      body.append("file", file);
      return request<{ file: Upload }>("/learn/uploads", { body });
    },
    addResource: (courseId: string, file: Upload) => request<{ course: CourseDetail }>(`/learn/courses/${courseId}/resources`, { body: { file } }),
    removeResource: (courseId: string, fileId: string) => request<{ course: CourseDetail }>(`/learn/courses/${courseId}/resources/${fileId}`, { method: "DELETE" }),
    roster: (courseId: string, signal?: AbortSignal) => request<RosterResponse>(`/learn/courses/${courseId}/roster`, { signal }),
    people: (courseId: string, q: string, signal?: AbortSignal) => request<{ items: PersonHit[] }>(`/learn/courses/${courseId}/people`, { query: { q }, signal }),
    enrol: (courseId: string, body: { personId: string; waive?: string }) => request<{ enrolment: Enrolment }>(`/learn/courses/${courseId}/roster`, { body }),
    withdraw: (enrolmentId: string, reason: string) => request<{ enrolment: Enrolment; promoted: string[] }>(`/learn/enrolments/${enrolmentId}/withdraw`, { body: { reason } }),
    promote: (enrolmentId: string) => request<{ enrolment: Enrolment }>(`/learn/enrolments/${enrolmentId}/promote`, { method: "POST" }),
    session: (id: string, signal?: AbortSignal) => request<SessionDetail>(`/learn/sessions/${id}`, { signal }),
    attendance: (sessionId: string, signal?: AbortSignal) => request<AttendanceSheet>(`/learn/sessions/${sessionId}/attendance`, { signal }),
    saveAttendance: (sessionId: string, body: AttendanceInput) => request<AttendanceSheet>(`/learn/sessions/${sessionId}/attendance`, { method: "PUT", body }),
    assessment: (id: string, signal?: AbortSignal) => request<Assessment>(`/learn/assessments/${id}`, { signal }),
    createAssessment: (courseId: string, body: AssessmentInput) => request<{ assessment: Assessment; movedFinal: string | null }>(`/learn/courses/${courseId}/assessments`, { body }),
    updateAssessment: (id: string, body: AssessmentInput & { rowVer: number }) =>
      request<{ assessment: Assessment; movedFinal: string | null }>(`/learn/assessments/${id}`, { method: "PUT", body }),
    publishAssessment: (id: string, rowVer: number, publish = true) => request<{ assessment: Assessment }>(`/learn/assessments/${id}/${publish ? "publish" : "unpublish"}`, { body: { rowVer } }),
    deleteAssessment: (id: string) => request<{ deleted: true }>(`/learn/assessments/${id}`, { method: "DELETE" }),
    submissions: (assessmentId: string, signal?: AbortSignal) => request<SubmissionsResponse>(`/learn/assessments/${assessmentId}/submissions`, { signal }),
    submission: (id: string, signal?: AbortSignal) => request<SubmissionDetail>(`/learn/submissions/${id}`, { signal }),
    review: (id: string, body: ReviewInput) => request<SubmissionDetail>(`/learn/submissions/${id}/review`, { method: "PUT", body }),
    remind: (assessmentId: string) => request<{ sent: number }>(`/learn/assessments/${assessmentId}/remind`, { method: "POST" }),
    excuse: (assessmentId: string, enrolmentId: string, reason: string | null) =>
      reason === null
        ? request<{ excused: boolean }>(`/learn/assessments/${assessmentId}/excused/${enrolmentId}`, { method: "DELETE" })
        : request<{ excused: boolean }>(`/learn/assessments/${assessmentId}/excused/${enrolmentId}`, { method: "PUT", body: { reason } }),
    certificates: (signal?: AbortSignal) => request<CertificatesResponse>("/learn/certificates", { signal }),
    issueCertificate: (enrolmentId: string, body: IssueCertificateBody = {}) =>
      request<{ certificate: Certificate }>(`/learn/enrolments/${enrolmentId}/certificate`, { method: "POST", body }),
    reissueCertificate: (id: string, body: { reason: string; name: string }) => request<{ certificate: Certificate }>(`/learn/certificates/${id}/reissue`, { body }),
    revokeCertificate: (id: string, reason: string) => request<{ certificate: Certificate }>(`/learn/certificates/${id}/revoke`, { body: { reason } }),
    logCertificatePrint: (id: string) => request<{ logged: true }>(`/learn/certificates/${id}/print`, { method: "POST" }),
    dropOff: (period: DropOffPeriod, signal?: AbortSignal) => request<DropOffReport>("/learn/reports/drop-off", { query: { period }, signal }),
    logDropOffCopy: (list: string) => request<{ logged: true }>("/learn/reports/drop-off/copy", { body: { list } }),
    /** Public, no sign-in (PRD G-12). */
    verifyCertificate: (serial: string) => request<CertificateCheck>(`/public/certificates/${encodeURIComponent(serial)}`),
    forum: (courseId: string, q: { filter: ForumFilter; q: string; sort: ForumSort; page: number }, signal?: AbortSignal) =>
      request<ForumResponse>(`/learn/courses/${courseId}/forum`, { query: q, signal }),
    thread: (id: string, signal?: AbortSignal) => request<ThreadDetail>(`/learn/forum/threads/${id}`, { signal }),
    replyToThread: (id: string, body: string) => request<ThreadDetail>(`/learn/forum/threads/${id}/replies`, { body: { body } }),
    createPrompt: (courseId: string, body: NewPromptInput) => request<ThreadDetail>(`/learn/courses/${courseId}/forum`, { body }),
    editPrompt: (id: string, body: { title: string; body: string }) => request<ThreadDetail>(`/learn/forum/threads/${id}`, { method: "PUT", body }),
    setThreadFlag: (id: string, flag: "pinned" | "locked" | "shepherdDone", on: boolean) => request<ThreadDetail>(`/learn/forum/threads/${id}/${flag}`, { method: "PUT", body: { on } }),
    setHidden: (kind: "threads" | "posts", id: string, reason: string | null) => request<{ hidden: boolean }>(`/learn/forum/${kind}/${id}/hidden`, { method: "PUT", body: { reason } }),
    logRosterExport: (courseId: string) => request<{ logged: true }>(`/learn/courses/${courseId}/roster/export`, { method: "POST" }),
  },
  imports: {
    list: (signal?: AbortSignal) => request<ImportListResponse>("/welcome/imports", { signal }),
    get: (id: string, signal?: AbortSignal) => request<ImportJob>(`/welcome/imports/${id}`, { signal }),
    upload: (kind: ImportKind, file: File) => {
      const body = new FormData();
      body.append("kind", kind);
      body.append("file", file);
      return request<ImportJob>("/welcome/imports", { body });
    },
    patch: (id: string, body: ImportPatch) => request<ImportJob>(`/welcome/imports/${id}`, { method: "PATCH", body }),
    commit: (id: string, mode: "add" | "update", idempotencyKey: string) =>
      request<ImportSummary>(`/welcome/imports/${id}/commit`, { body: { mode, idempotencyKey }, clientRequestId: idempotencyKey }),
    undo: (id: string, force = false) => request<ImportSummary>(`/welcome/imports/${id}/undo`, { body: { force } }),
    discard: (id: string) => request<{ discarded: true }>(`/welcome/imports/${id}`, { method: "DELETE" }),
  },
  duplicates: {
    list: (signal?: AbortSignal) => request<DuplicatesResponse>("/welcome/duplicates", { signal }),
    merge: (body: MergeInput) => request<MergeResult>("/welcome/duplicates/merge", { body }),
    unmerge: (mergeId: string) => request<UnmergeResult>(`/welcome/duplicates/merges/${mergeId}/undo`, { method: "POST" }),
    dismiss: (ids: number[], note: string | null) => request<{ dismissed: string[] }>("/welcome/duplicates/dismiss", { body: { ids, note } }),
    restore: (key: string) => request<{ restored: true }>(`/welcome/duplicates/dismissed/${key}`, { method: "DELETE" }),
  },
  connect: {
    queue: (q: { team?: Team; date?: string }, signal?: AbortSignal) =>
      request<QueueResponse>("/connect/queue", { query: q, signal }),
    assign: (connectId: number, team: Team, memberId: string | null) =>
      request<AssignResponse>("/connect/assign", { body: { connectId, team, memberId } }),
    guest: (connectId: number, team: Team | undefined, signal?: AbortSignal) =>
      request<GuestResponse>(`/connect/guests/${connectId}`, { query: { team }, signal }),
    saveLog: (body: SaveLogBody) =>
      request<SaveLogResponse>("/connect/log", { body, clientRequestId: body.clientRequestId }),
    logs: (q: { team?: Team; connectId?: number }, signal?: AbortSignal) =>
      request<LogsResponse>("/connect/logs", { query: q, signal }),
    departments: () => request<{ departments: Department[] }>("/connect/departments"),
    /** DRAFT · planned tabs (TKP Connect UI-C4, C5, C7). */
    guestTrack: (signal?: AbortSignal) => request<GuestTrackResponse>("/connect/guest-track", { signal }),
    journey: (connectId: number, signal?: AbortSignal) => request<JourneyResponse>(`/connect/journey/${connectId}`, { signal }),
    metrics: (period: string | undefined, signal?: AbortSignal) => request<MetricsResponse>("/connect/metrics", { query: { period }, signal }),
  },
  welcome: {
    overview: (q: { date?: string; scope?: Scope }, signal?: AbortSignal) =>
      request<OverviewResponse>("/welcome/overview", { query: q, signal }),
    search: (q: GuestSearch, signal?: AbortSignal) => request<GuestSearchResponse>("/welcome/guests", { query: q, signal }),
    guest: (id: number, signal?: AbortSignal) => request<{ guest: GuestRecord }>(`/welcome/guests/${id}`, { signal }),
    /** View entry: the guest's form exactly as submitted (TKP Connect API-W4). */
    entry: (guestId: number, signal?: AbortSignal) =>
      request<{ entry: GuestEntry }>(`/welcome/guests/${guestId}/entry`, { signal }),
    /** Logs an LCM report export before the browser prints it. */
    lcmExport: (month: string, type?: string) => request<{ logged: true }>("/welcome/lcm/export", { body: { month, type: type ?? null } }),
    /** LCM Metrics: the monthly leadership report (TKP Connect API-W5). */
    lcm: (q: { month?: string; type?: string }, signal?: AbortSignal) => request<LcmResponse>("/welcome/lcm", { query: q, signal }),
    /** Greater Houston ZIP outlines for LCM Map 1. */
    zipgeo: (signal?: AbortSignal) =>
      request<{ features: { zip: string; county: string | null; cellGroup: string | null; lat: number; lon: number; geometry: Geometry }[] }>("/welcome/zipgeo", {
        query: { all: 1 },
        signal,
      }),
    /** Logs a guest PDF export before the browser prints it (D8). */
    logExport: (guestId: number) => request<{ logged: true }>(`/welcome/guests/${guestId}/export`, { method: "POST" }),
  },
};
