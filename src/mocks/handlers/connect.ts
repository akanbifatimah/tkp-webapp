import { HttpResponse, http } from "msw";
import type { SaveLogBody } from "@/features/connect/types";
import { assign, getGuest, getLogs, getQueue, saveLog, type Result } from "../connect-api";
import { authenticate, fail, latency, path } from "../http";
import { DEPARTMENTS } from "../seed/guests";

/** HTTP wrappers around the mock Connect server (docs/API.md §3). */
export const send = <T,>(r: Result<T>) => (r.ok ? HttpResponse.json(r.body as object, { status: r.status }) : fail(r.status, r.code, r.message));

export const connectHandlers = [
  http.get(path("/connect/queue"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    const q = new URL(request.url).searchParams;
    return send(getQueue(auth.user, { team: q.get("team"), date: q.get("date") }));
  }),

  http.post(path("/connect/assign"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(assign(auth.user, (await request.json()) as Parameters<typeof assign>[1]));
  }),

  http.get(path("/connect/guests/:id"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(getGuest(auth.user, Number(params.id), new URL(request.url).searchParams.get("team")));
  }),

  http.post(path("/connect/log"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(saveLog(auth.user, (await request.json()) as SaveLogBody));
  }),

  http.get(path("/connect/logs"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    const q = new URL(request.url).searchParams;
    const id = q.get("connectId");
    return send(getLogs(auth.user, { team: q.get("team"), connectId: id ? Number(id) : null }));
  }),

  http.get(path("/connect/departments"), ({ request }) => {
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return HttpResponse.json({ departments: DEPARTMENTS });
  }),

];
