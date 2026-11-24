import { HttpResponse, http } from "msw";
import type { ZipFeature } from "@/features/welcome/lcm-types";
import { can } from "@/lib/permissions";
import { audit, db } from "../db";
import { authenticate, fail, latency, path } from "../http";
import { getLcm, type ZipPoint } from "../lcm-api";
import { send } from "./connect";

/**
 * GET /welcome/lcm and GET /welcome/zipgeo (docs/API.md §5).
 * The mock reads the public outlines the front end ships in /geo; the real
 * API reads them from its ZipGeo table.
 */
let outlines: Promise<ZipFeature[]> | null = null;
const loadOutlines = () =>
  (outlines ??= fetch("/geo/houston-zips.json")
    .then((r) => r.json() as Promise<{ features: ZipFeature[] }>)
    .then((j) => j.features));

/** Cell ZIPs without a usable outline are still Greater Houston (listed, not drawn). */
const NO_OUTLINE: Record<string, ZipPoint> = { "77410": { lat: 29.963, lon: -95.697, county: "Harris", city: "Cypress", hasOutline: false } };

export async function zipPoints() {
  const m = new Map<string, ZipPoint>(Object.entries(NO_OUTLINE));
  for (const f of await loadOutlines()) {
    m.set(f.properties.zip, { lat: f.properties.lat, lon: f.properties.lon, county: f.properties.county, city: f.properties.city, hasOutline: true });
  }
  return m;
}

export const lcmHandlers = [
  http.get(path("/welcome/lcm"), async ({ request }) => {
    await latency();
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    const q = new URL(request.url).searchParams;
    return send(getLcm(auth.user, { month: q.get("month"), type: q.get("type") }, await zipPoints()));
  }),

  /** The LCM report has totals only, so everyone who can open it may export it; every export is logged. */
  http.post(path("/welcome/lcm/export"), async ({ request }) => {
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    if (!auth.user.roles.some((r) => can(r, "welcome.lcm.view"))) return fail(403, "FORBIDDEN", "You don't have access to LCM Metrics.");
    const body = (await request.json().catch(() => ({}))) as { month?: string; type?: string | null };
    audit(auth.user.id, "welcome.lcm.export", `${body.month ?? ""}${body.type ? ` · ${body.type}` : ""}`);
    return HttpResponse.json({ logged: true });
  }),

  http.get(path("/welcome/zipgeo"), async ({ request }) => {
    const auth = authenticate(request);
    if (auth instanceof Response) return auth;
    if (!auth.user.roles.some((r) => can(r, "welcome.lcm.view"))) return fail(403, "FORBIDDEN", "You don't have access to LCM Metrics.");
    const features = (await loadOutlines()).map((f) => ({
      zip: f.properties.zip,
      state: "TX",
      county: f.properties.county,
      // The live cell map (Admin › Cells and ZIPs), not the outline file's copy.
      cellGroup: db.cellMap.zips[f.properties.zip] ?? null,
      lat: f.properties.lat,
      lon: f.properties.lon,
      geometry: f.geometry,
    }));
    return HttpResponse.json({ features, missing: [] });
  }),
];
