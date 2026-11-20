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
import type { LcmResponse } from "@/features/welcome/lcm-types";
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

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = session.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.clientRequestId) headers["Idempotency-Key"] = opts.clientRequestId;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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
    signIn: (email: string, password: string) => request<SignInStep>("/auth/sign-in", { body: { email, password } }),
    verifyMfa: (ticket: string, code: string) => request<SignInResponse>("/auth/mfa/verify", { body: { ticket, code } }),
    resendMfa: (ticket: string) => request<MfaChallenge>("/auth/mfa/resend", { body: { ticket } }),
    renew: () => request<SignInResponse>("/auth/token/renew", { method: "POST" }),
    signOut: () => request<void>("/auth/sign-out", { method: "POST" }),
    me: (signal?: AbortSignal) => request<{ member: Member }>("/me", { signal }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ signedOut: true }>("/auth/change-password", { body: { currentPassword, newPassword } }),
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
