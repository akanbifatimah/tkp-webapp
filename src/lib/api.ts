import { env } from "./env";
import { session } from "./session";
import type {
  AssignResponse,
  Department,
  GuestEntry,
  GuestResponse,
  LogsResponse,
  QueueResponse,
  SaveLogBody,
  SaveLogResponse,
} from "@/features/connect/types";
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

export const api = {
  auth: {
    signIn: (email: string, password: string) =>
      request<SignInResponse>("/auth/sign-in", { body: { email, password } }),
    renew: () => request<SignInResponse>("/auth/token/renew", { method: "POST" }),
    signOut: () => request<void>("/auth/sign-out", { method: "POST" }),
    me: (signal?: AbortSignal) => request<{ member: Member }>("/me", { signal }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ signedOut: true }>("/auth/change-password", { body: { currentPassword, newPassword } }),
  },
  settings: {
    public: () => request<PublicSettings>("/settings/public"),
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
  },
  welcome: {
    /** View entry: the guest's form exactly as submitted (TKP Connect API-W4). */
    entry: (guestId: number, signal?: AbortSignal) =>
      request<{ entry: GuestEntry }>(`/welcome/guests/${guestId}/entry`, { signal }),
  },
};
