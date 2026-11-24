import { HttpResponse, http } from "msw";
import type { QrDatesInput, QrInput } from "@/features/welcome/qr-types";
import { authenticate, latency, path } from "../http";
import { checkQr, createQr, deleteQr, getQr, listQr, logPrint, resolveQr, setQrDates, setQrState, updateQr } from "../qr-api";
import { send } from "./connect";

/** HTTP wrappers around the mock QR code server (docs/API.md §9). */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;
const R = "/welcome/qr-codes";

export const qrHandlers = [
  http.get(path(R), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(listQr(auth.user));
  }),

  http.post(path(R), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(createQr(auth.user, await body<Partial<QrInput>>(request)));
  }),

  // Before /:id, so "check" and "print" are not read as ids.
  http.post(path(`${R}/check`), async ({ request }) => {
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(checkQr(auth.user, await body<Partial<QrInput> & { id?: string }>(request)));
  }),

  http.post(path(`${R}/print`), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(logPrint(auth.user, await body(request)));
  }),

  http.get(path(`${R}/:id`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(getQr(auth.user, String(params.id)));
  }),

  http.put(path(`${R}/:id`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(updateQr(auth.user, String(params.id), await body<Partial<QrInput> & { rowVer?: number }>(request)));
  }),

  http.put(path(`${R}/:id/dates`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(setQrDates(auth.user, String(params.id), await body<Partial<QrDatesInput>>(request)));
  }),

  ...(["publish", "pause", "resume"] as const).map((verb) =>
    http.post(path(`${R}/:id/${verb}`), async ({ request, params }) => {
      await latency();
      const auth = authenticate(request);
      if (auth instanceof Response) return auth;
      return send(setQrState(auth.user, String(params.id), verb === "pause" ? "paused" : "live", (await body<{ rowVer?: number }>(request)).rowVer));
    }),
  ),

  http.delete(path(`${R}/:id`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(deleteQr(auth.user, String(params.id)));
  }),

  // Mock stand-in for the short address (the real one is a redirect on its own domain, §9).
  http.get(path("/public/qr/:slug"), async ({ params }) => {
    await latency();
    return HttpResponse.json(resolveQr(String(params.slug)), { headers: { "Cache-Control": "no-store" } });
  }),
];
