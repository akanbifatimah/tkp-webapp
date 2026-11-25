import { http } from "msw";
import type { ScheduleInput, ShareInput } from "@/features/reports/report-types";
import { authenticate, latency, path } from "../http";
import {
  createSchedule,
  deleteSchedule,
  getRecipients,
  getReport,
  listReports,
  listSchedules,
  logReportExport,
  runSchedule,
  setScheduleActive,
  shareReport,
  updateSchedule,
} from "../reports-api";
import { send } from "./connect";

/** HTTP wrappers around the mock Reports hub (docs/API.md §12). Schedules first, so "schedules" is never read as a report id. */
const body = async <T,>(request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as T;
const R = "/reports";
const S = "/reports/schedules";

type Params = Readonly<Record<string, string | readonly string[] | undefined>>;
const guarded =
  (fn: (u: Parameters<typeof listReports>[0], request: Request, params: { id: string }) => Promise<Response> | Response) =>
  async ({ request, params }: { request: Request; params: Params }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    return fn(auth.user, request, { id: String(params.id ?? "") });
  };

export const reportHandlers = [
  http.get(path(S), guarded((u) => send(listSchedules(u)))),
  http.post(path(S), guarded(async (u, req) => send(createSchedule(u, await body<Partial<ScheduleInput>>(req))))),
  http.put(path(`${S}/:id`), guarded(async (u, req, p) => send(updateSchedule(u, p.id, await body(req))))),
  http.post(path(`${S}/:id/pause`), guarded(async (u, req, p) => send(setScheduleActive(u, p.id, false, (await body<{ rowVer?: number }>(req)).rowVer)))),
  http.post(path(`${S}/:id/resume`), guarded(async (u, req, p) => send(setScheduleActive(u, p.id, true, (await body<{ rowVer?: number }>(req)).rowVer)))),
  http.post(path(`${S}/:id/run`), guarded((u, _req, p) => send(runSchedule(u, p.id)))),
  http.delete(path(`${S}/:id`), guarded((u, _req, p) => send(deleteSchedule(u, p.id)))),

  http.get(path(R), guarded((u) => send(listReports(u)))),
  http.get(path(`${R}/:id/recipients`), guarded((u, _req, p) => send(getRecipients(u, p.id)))),
  http.post(path(`${R}/:id/export`), guarded(async (u, req, p) => send(logReportExport(u, p.id, await body(req))))),
  http.post(path(`${R}/:id/share`), guarded(async (u, req, p) => send(shareReport(u, p.id, await body<Partial<ShareInput>>(req))))),
  http.get(
    path(`${R}/:id`),
    guarded((u, req, p) => {
      const q = new URL(req.url).searchParams;
      return send(getReport(u, p.id, { period: q.get("period"), type: q.get("type") }));
    }),
  ),
];
