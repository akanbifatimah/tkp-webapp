import { http } from "msw";
import type { ImportPatch } from "@/features/welcome/import-types";
import { authenticate, latency, path } from "../http";
import { analyseImport, commitImport, discardImport, getImport, listImports, patchImport, undoImport } from "../import-api";
import { extensionOf, readUpload, type RawSheet } from "../import-parse";
import { send } from "./connect";

/** HTTP wrappers around the mock import engine (docs/API.md §11). */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;
const R = "/welcome/imports";

export const importHandlers = [
  http.get(path(R), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(listImports(auth.user));
  }),

  // Upload (multipart: kind, file). The real backend parses in a background job; here it is immediate.
  http.post(path(R), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const kind = String(form?.get("kind") ?? "");
    if (!(file instanceof File)) return send(analyseImport(auth.user, { kind, fileName: "", fileSize: 0, sheets: null, parseError: "No file" }));
    let sheets: RawSheet[] | null = null;
    let parseError: string | undefined;
    const ext = extensionOf(file.name);
    if ((ext === "csv" || ext === "xlsx") && file.size <= 10 * 1024 * 1024) {
      try {
        sheets = await readUpload(file.name, await file.arrayBuffer());
      } catch (e) {
        parseError = e instanceof Error ? e.message : "Unreadable";
      }
    }
    return send(analyseImport(auth.user, { kind, fileName: file.name, fileSize: file.size, sheets, parseError }));
  }),

  http.get(path(`${R}/:id`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(getImport(auth.user, String(params.id)));
  }),

  http.patch(path(`${R}/:id`), async ({ request, params }) => {
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(patchImport(auth.user, String(params.id), await body<ImportPatch>(request)));
  }),

  http.post(path(`${R}/:id/commit`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(commitImport(auth.user, String(params.id), await body(request)));
  }),

  http.post(path(`${R}/:id/undo`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(undoImport(auth.user, String(params.id), await body(request)));
  }),

  http.delete(path(`${R}/:id`), async ({ request, params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send(discardImport(auth.user, String(params.id)));
  }),
];
