import { http } from "msw";
import { authenticate, latency, path } from "../http";
import { getEntry, getGuestRecord, getOverview, logExport, searchGuests } from "../welcome-api";
import { send } from "./connect";

/** HTTP wrappers around the mock Welcome server (docs/API.md §4). */
export const welcomeHandlers = [
  http.get(path("/welcome/overview"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    const q = new URL(request.url).searchParams;
    return send(getOverview(auth.user, { date: q.get("date"), scope: q.get("scope") }));
  }),

  http.get(path("/welcome/guests"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    const q = new URL(request.url).searchParams;
    const get = (k: string) => q.get(k) ?? undefined;
    return send(searchGuests(auth.user, { phone: get("phone"), name: get("name"), date: get("date"), cell: get("cell"), type: get("type"), member: get("member") }));
  }),

  http.get(path("/welcome/guests/:id/entry"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(getEntry(auth.user, Number(params.id)));
  }),

  http.post(path("/welcome/guests/:id/export"), ({ request, params }) => {
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(logExport(auth.user, Number(params.id)));
  }),

  http.get(path("/welcome/guests/:id"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(getGuestRecord(auth.user, Number(params.id)));
  }),
];
