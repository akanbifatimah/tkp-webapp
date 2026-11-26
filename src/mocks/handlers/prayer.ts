import { HttpResponse, http } from "msw";
import type { PrayerSettings } from "@/features/care/prayer-types";
import { authenticate, latency, path } from "../http";
import {
  addNote,
  addPrivateNote,
  approvePost,
  editPost,
  listPrayer,
  listPrivate,
  posterIdentity,
  prayFor,
  prayOver,
  publicFeed,
  publicPost,
  removePost,
  setAnswered,
  reportPost,
  restorePost,
  setPrivateStatus,
  updateSettings,
  type PublicPostInput,
} from "../prayer-api";
import { send } from "./connect";

/** HTTP wrappers around the mock Prayer Wall server (docs/API.md §18). */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;
const R = "/care/prayer";
type P = { params: Record<string, string | readonly string[] | undefined> };
const id = ({ params }: P) => String(params.id);
const route =
  <A,>(fn: (user: Parameters<typeof listPrayer>[0], request: Request, ctx: P) => A | Promise<A>) =>
  async ({ request, params }: { request: Request } & P) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send((await fn(auth.user, request, { params })) as never);
  };

export const prayerHandlers = [
  http.get(
    path(R),
    route((u, r) => {
      const p = new URL(r.url).searchParams;
      return listPrayer(u, { filter: p.get("filter") ?? undefined, q: p.get("q") ?? undefined, category: p.get("category") ?? undefined });
    }),
  ),
  http.put(path(`${R}/settings`), route(async (u, r) => updateSettings(u, await body<Partial<PrayerSettings>>(r)))),
  http.get(path(`${R}/private`), route((u, r) => listPrivate(u, { status: new URL(r.url).searchParams.get("status") ?? undefined }))),
  http.post(path(`${R}/private/:id/prayed`), route((u, _r, c) => prayOver(u, id(c)))),
  http.put(path(`${R}/private/:id/status`), route(async (u, r, c) => setPrivateStatus(u, id(c), await body<{ status?: string; rowVer?: number; note?: string }>(r)))),
  http.post(path(`${R}/private/:id/notes`), route(async (u, r, c) => addPrivateNote(u, id(c), (await body<{ text?: string }>(r)).text ?? ""))),
  http.get(path(`${R}/:id/poster`), route((u, _r, c) => posterIdentity(u, id(c)))),
  http.post(path(`${R}/:id/approve`), route(async (u, r, c) => approvePost(u, id(c), (await body<{ rowVer?: number }>(r)).rowVer))),
  http.put(path(`${R}/:id`), route(async (u, r, c) => editPost(u, id(c), await body(r)))),
  http.post(path(`${R}/:id/remove`), route(async (u, r, c) => removePost(u, id(c), await body(r)))),
  http.post(path(`${R}/:id/restore`), route(async (u, r, c) => restorePost(u, id(c), (await body<{ rowVer?: number }>(r)).rowVer))),
  http.put(path(`${R}/:id/answered`), route(async (u, r, c) => {
    const b = await body<{ answered?: boolean; rowVer?: number }>(r);
    return setAnswered(u, id(c), !!b.answered, b.rowVer);
  })),
  http.post(path(`${R}/:id/notes`), route(async (u, r, c) => addNote(u, id(c), (await body<{ text?: string }>(r)).text ?? ""))),

  // PR-1 to PR-6: the public routes the portal and app call, with no sign-in.
  http.get(path("/public/prayer"), async ({ request }) => {
    await latency();
    const p = new URL(request.url).searchParams;
    return HttpResponse.json(publicFeed({ category: p.get("category") ?? undefined, page: Number(p.get("page")) || 1 }), { headers: { "Cache-Control": "public, max-age=30" } });
  }),
  http.post(path("/public/prayer"), async ({ request }) => {
    await latency();
    return send(publicPost(await body<PublicPostInput>(request)));
  }),
  http.post(path("/public/prayer/:id/prayed"), async ({ request, params }) => {
    await latency();
    return send(prayFor(String(params.id), (await body<{ device?: string }>(request)).device ?? ""));
  }),
  http.post(path("/public/prayer/:id/report"), async ({ request, params }) => {
    await latency();
    const b = await body<{ device?: string; reason?: string }>(request);
    return send(reportPost(String(params.id), b.device ?? "", b.reason ?? ""));
  }),
];
