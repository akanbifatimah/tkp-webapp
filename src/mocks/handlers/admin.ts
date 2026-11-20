import { http } from "msw";
import type { AuditCategory, SettingsInput, UserInput, UserStatus } from "@/features/admin/types";
import type { Role } from "@/lib/permissions";
import { createUser, dashboard, getSettings, listAudit, listUsers, resetPassword, revokeSessions, setActive, updateSettings, updateUser } from "../admin-api";
import { authenticate, latency, path } from "../http";
import { send } from "./connect";

/** HTTP wrappers around the mock Admin server (docs/API.md §7). */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;

export const adminHandlers = [
  http.get(path("/dashboard"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(dashboard(auth.user));
  }),

  http.get(path("/admin/users"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    const q = new URL(request.url).searchParams;
    return send(
      listUsers(auth.user, {
        q: q.get("q") ?? undefined,
        role: (q.get("role") ?? "") as Role | "",
        status: (q.get("status") ?? "") as UserStatus | "all" | "",
        page: Number(q.get("page")) || 1,
        pageSize: Number(q.get("pageSize")) || 25,
      }),
    );
  }),

  http.post(path("/admin/users"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(createUser(auth.user, await body<Partial<UserInput>>(request)));
  }),

  http.put(path("/admin/users/:id"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(updateUser(auth.user, String(params.id), await body<Partial<UserInput> & { rowVer?: number }>(request)));
  }),

  http.post(path("/admin/users/:id/deactivate"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(setActive(auth.user, String(params.id), false));
  }),

  http.post(path("/admin/users/:id/reactivate"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(setActive(auth.user, String(params.id), true));
  }),

  http.post(path("/admin/users/:id/reset-password"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(resetPassword(auth.user, String(params.id)));
  }),

  http.post(path("/admin/users/:id/sign-out-everywhere"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(revokeSessions(auth.user, String(params.id)));
  }),

  http.get(path("/admin/audit"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    const q = new URL(request.url).searchParams;
    const get = (k: string) => q.get(k) ?? undefined;
    return send(
      listAudit(auth.user, {
        q: get("q"),
        actorId: get("actorId"),
        category: (get("category") ?? "") as AuditCategory | "",
        from: get("from"),
        to: get("to"),
        page: Number(get("page")) || 1,
        pageSize: Number(get("pageSize")) || 50,
      }),
    );
  }),

  http.get(path("/admin/settings"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(getSettings(auth.user));
  }),

  http.put(path("/admin/settings"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(updateSettings(auth.user, await body<Partial<SettingsInput>>(request)));
  }),
];
