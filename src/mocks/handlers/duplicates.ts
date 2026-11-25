import { http } from "msw";
import type { MergeInput } from "@/features/welcome/duplicate-types";
import { authenticate, latency, path } from "../http";
import { dismissDuplicates, listDuplicates, mergeDuplicates, restoreDuplicate } from "../duplicates-api";
import { send } from "./connect";

/** HTTP wrappers around the mock duplicate review (docs/API.md §10). */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;
const R = "/welcome/duplicates";

export const duplicateHandlers = [
  http.get(path(R), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(listDuplicates(auth.user));
  }),

  http.post(path(`${R}/merge`), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(mergeDuplicates(auth.user, await body<Partial<MergeInput>>(request)));
  }),

  http.post(path(`${R}/dismiss`), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(dismissDuplicates(auth.user, await body<{ ids?: number[]; note?: string | null }>(request)));
  }),

  http.delete(path(`${R}/dismissed/:key`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(restoreDuplicate(auth.user, String(params.key)));
  }),
];
