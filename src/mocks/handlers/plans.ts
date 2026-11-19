import { http } from "msw";
import { guestTrack, journey, metrics } from "../connect-plans";
import { authenticate, latency, path } from "../http";
import { send } from "./connect";

/** The planned Connect tabs (docs/API.md §6, DRAFT). */
export const planHandlers = [
  http.get(path("/connect/guest-track"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(guestTrack(auth.user));
  }),
  http.get(path("/connect/journey/:id"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(journey(auth.user, Number(params.id)));
  }),
  http.get(path("/connect/metrics"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(metrics(auth.user, new URL(request.url).searchParams.get("period")));
  }),
];
