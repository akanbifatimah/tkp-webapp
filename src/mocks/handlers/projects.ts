import { HttpResponse, http } from "msw";
import type { ProjectInput } from "@/features/serve/project-types";
import { authenticate, latency, path } from "../http";
import {
  approveProject,
  assignLead,
  closeProject,
  createProject,
  declineProject,
  featureProject,
  getProject,
  listProjects,
  publicProjects,
  requestChanges,
  setPosition,
  submitProject,
  tapContact,
  updateProject,
} from "../project-api";
import { send } from "./connect";

/** HTTP wrappers around the mock Projects server (docs/API.md §19). */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;
const R = "/serve/projects";
type P = { params: Record<string, string | readonly string[] | undefined> };
const id = ({ params }: P, k = "id") => String(params[k]);
const route =
  <A,>(fn: (user: Parameters<typeof listProjects>[0], request: Request, ctx: P) => A | Promise<A>) =>
  async ({ request, params }: { request: Request } & P) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return send((await fn(auth.user, request, { params })) as never);
  };
type RowVer = { rowVer?: number };

export const projectHandlers = [
  http.get(
    path(R),
    route((u, r) => {
      const p = new URL(r.url).searchParams;
      return listProjects(u, { status: p.get("status") ?? undefined, q: p.get("q") ?? undefined, ministry: p.get("ministry") ?? undefined });
    }),
  ),
  http.post(path(R), route(async (u, r) => createProject(u, await body<Partial<ProjectInput>>(r)))),
  http.get(path(`${R}/:id`), route((u, _r, c) => getProject(u, id(c)))),
  http.put(path(`${R}/:id`), route(async (u, r, c) => updateProject(u, id(c), await body<Partial<ProjectInput> & RowVer>(r)))),
  http.post(path(`${R}/:id/approve`), route(async (u, r, c) => approveProject(u, id(c), (await body<RowVer>(r)).rowVer))),
  http.post(path(`${R}/:id/changes`), route(async (u, r, c) => requestChanges(u, id(c), await body(r)))),
  http.post(path(`${R}/:id/decline`), route(async (u, r, c) => declineProject(u, id(c), await body(r)))),
  http.put(
    path(`${R}/:id/featured`),
    route(async (u, r, c) => {
      const b = await body<{ on?: boolean } & RowVer>(r);
      return featureProject(u, id(c), !!b.on, b.rowVer);
    }),
  ),
  http.post(path(`${R}/:id/close`), route(async (u, r, c) => closeProject(u, id(c), await body(r), false))),
  http.post(path(`${R}/:id/reopen`), route(async (u, r, c) => closeProject(u, id(c), await body(r), true))),
  http.put(
    path(`${R}/:id/lead`),
    route(async (u, r, c) => {
      const b = await body<{ leadId?: string | null } & RowVer>(r);
      return assignLead(u, id(c), b.leadId ?? null, b.rowVer);
    }),
  ),
  http.put(
    path(`${R}/:id/positions/:pid`),
    route(async (u, r, c) => {
      const b = await body<{ state?: "open" | "filled" | "closed" } & RowVer>(r);
      return setPosition(u, id(c), id(c, "pid"), b.state ?? "open", b.rowVer);
    }),
  ),

  // The member app (P-5: members only; the real API reads the member's session).
  http.get(path("/public/projects"), async ({ request }) => {
    await latency();
    const r = publicProjects({ member: new URL(request.url).searchParams.get("member") === "1" });
    return r.ok ? HttpResponse.json(r.body) : send(r);
  }),
  http.post(path("/public/projects"), async ({ request }) => {
    await latency();
    return send(submitProject(await body(request)));
  }),
  http.post(path("/public/projects/positions/:pid/contact"), async ({ params }) => send(tapContact(String(params.pid)))),
];
