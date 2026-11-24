import { http } from "msw";
import type { ServiceInput } from "@/features/admin/config-types";
import { createService, deleteService, getCellMap, listServices, removeZip, reorderServices, setServiceActive, setZip, updateService } from "../config-api";
import { authenticate, latency, path } from "../http";
import { send } from "./connect";
import { zipPoints } from "./lcm";

/** HTTP wrappers around the mock configuration server (docs/API.md §8). */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;

export const configHandlers = [
  http.get(path("/welcome/cell-map"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(getCellMap(auth.user, await zipPoints()));
  }),

  http.put(path("/welcome/cell-map/zips/:zip"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(setZip(auth.user, String(params.zip), await body(request)));
  }),

  http.delete(path("/welcome/cell-map/zips/:zip"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(removeZip(auth.user, String(params.zip), Number(new URL(request.url).searchParams.get("rowVer"))));
  }),

  http.get(path("/welcome/services"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(listServices(auth.user));
  }),

  http.post(path("/welcome/services"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(createService(auth.user, await body<Partial<ServiceInput>>(request)));
  }),

  // Before /:id, so "order" is not read as an id.
  http.put(path("/welcome/services/order"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(reorderServices(auth.user, (await body<{ ids?: unknown }>(request)).ids));
  }),

  http.put(path("/welcome/services/:id"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(updateService(auth.user, String(params.id), await body<Partial<ServiceInput> & { rowVer?: number }>(request)));
  }),

  http.post(path("/welcome/services/:id/retire"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(setServiceActive(auth.user, String(params.id), false));
  }),

  http.post(path("/welcome/services/:id/restore"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(setServiceActive(auth.user, String(params.id), true));
  }),

  http.delete(path("/welcome/services/:id"), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(deleteService(auth.user, String(params.id)));
  }),
];
