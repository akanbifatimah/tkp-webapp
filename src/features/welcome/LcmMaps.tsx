import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { ErrorBanner, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { EmergingZip, VisitorCity } from "./lcm-types";
import { CELLS, CELL_COLOR } from "./model";
import { CellChip } from "./parts";
import { useOutlines, useZipGeo } from "./queries";

/**
 * LCM maps (TKP Connect FI-38 / FI-39). No street-map background (decided Nov 9):
 * only public outlines, so nothing is fetched from a map-tile service.
 * Emerging ZIPs use purple: a data colour chosen to stand apart from the four
 * cell colours (design guide §2.3), never a background.
 */

// Same scales and breaks as the live app.
const RAMP = ["#FDE7D3", "#F9C094", "#F09258", "#D9662A", "#A9420F", "#6E2A08"];
const PRAMP = ["#EBDDF7", "#D2B4EE", "#B585E0", "#9B5DD1", "#7B2CBF", "#5A189A"];
const BREAKS = [1, 5, 10, 20, 35, 55];
const EMERG = "#5A189A";
const EMFILL = "#9B5DD1";
const BG = {
  light: { sea: "#E9EEF2", land: "#FBFAF7", edge: "#C9C3B8", tint: 0.16 },
  dark: { sea: "#14171C", land: "#2A2F37", edge: "#4A515C", tint: 0.32 },
};
const DOT = { hou: "#9B2A31", us: "#2E6CA8", abroad: "#B8861B" };
const esc = (s: string | null | undefined) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rampColor = (n: number, ramp = RAMP) => {
  let c = ramp[0]!;
  BREAKS.forEach((b, i) => {
    if (n >= b) c = ramp[i]!;
  });
  return c;
};

function useLeaflet(center: L.LatLngExpression, zoom: number) {
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true }).setView(center, zoom);
    setMap(m);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { el, map };
}

function Seg<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      {label ? <span className="text-xs font-bold text-muted">{label}</span> : null}
      <span role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-white p-0.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn("h-8 rounded-lg px-3 text-xs font-bold transition-colors", value === o.id ? "bg-ink text-cream-50" : "text-muted hover:text-ink")}
          >
            {o.label}
          </button>
        ))}
      </span>
    </span>
  );
}

/* ================================================================= Map 1 */

export function Map1({ zips, year, title }: { zips: EmergingZip[]; year: number; title: React.ReactNode }) {
  const geo = useZipGeo();
  const [mode, setMode] = useState<"guests" | "cell">("guests");
  const [bgName, setBg] = useState<"light" | "dark">("light");
  const { el, map } = useLeaflet([29.76, -95.6], 9);

  useEffect(() => {
    if (!map || !geo.data) return;
    const bg = BG[bgName];
    const dark = bgName === "dark";
    const cellMode = mode === "cell";
    map.getContainer().style.background = bg.sea;
    const rows = new Map(zips.map((z) => [z.zip, z]));
    const layers: L.Layer[] = [];

    // Every Greater Houston ZIP; cell ZIPs tinted in their cell colour.
    const base = L.geoJSON(
      { type: "FeatureCollection", features: geo.data.map((f) => ({ type: "Feature", properties: f, geometry: f.geometry })) } as GeoJSON.FeatureCollection,
      {
        style: (f) => {
          const c = (f?.properties as { cellGroup: string | null }).cellGroup;
          return { color: c ? CELL_COLOR[c] : bg.edge, weight: c ? 1.2 : 0.6, opacity: c ? 0.9 : 1, fillColor: c ? CELL_COLOR[c] : bg.land, fillOpacity: c ? bg.tint : 1 };
        },
        onEachFeature: (f, layer) => {
          const p = f.properties as { zip: string; county: string | null; cellGroup: string | null };
          layer.bindTooltip(`<b>${p.zip}</b>${p.county ? ` · ${esc(p.county)} County` : ""}<br>${p.cellGroup ? `${p.cellGroup} cell zip` : "Not on the cell list"} · no guests this year`, { sticky: true });
        },
      },
    ).addTo(map);
    layers.push(base);

    // ZIPs with guests this year.
    const withGuests = geo.data.filter((f) => rows.get(f.zip)?.ytd);
    const shade = L.geoJSON(
      { type: "FeatureCollection", features: withGuests.map((f) => ({ type: "Feature", properties: { zip: f.zip }, geometry: f.geometry })) } as GeoJSON.FeatureCollection,
      {
        style: (f) => {
          const r = rows.get((f?.properties as { zip: string }).zip)!;
          const cell = r.cellGroup !== "N/A" ? r.cellGroup : null;
          const fill = cellMode ? (cell ? CELL_COLOR[cell] : EMFILL) : cell ? rampColor(r.ytd) : rampColor(r.ytd, PRAMP);
          return {
            color: cell ? (cellMode ? (dark ? "#14171C" : "#ffffff") : CELL_COLOR[cell]) : dark ? "#E0C3FC" : EMERG,
            weight: cell ? (cellMode ? 1 : 2) : 2.4,
            dashArray: cell ? undefined : "5 4",
            fillColor: fill,
            fillOpacity: cellMode ? 0.8 : 0.9,
          };
        },
        onEachFeature: (f, layer) => {
          const r = rows.get((f.properties as { zip: string }).zip)!;
          layer.bindTooltip(
            `<b>${r.zip}</b>${r.city ? ` ${esc(r.city)}` : ""}${r.county ? ` · ${esc(r.county)} County` : ""}<br>${r.ytd} guest${r.ytd === 1 ? "" : "s"} this year · ${r.priorYtd} same period last year<br>${r.cellGroup !== "N/A" ? `${r.cellGroup} cell zip` : `Emerging zip${r.signal ? ` · ${r.signal}` : ""}`}`,
            { sticky: true },
          );
          layer.on("mouseover", () => (layer as L.Path).setStyle({ weight: 3, color: dark ? "#ffffff" : "#1C1C1C" }));
          layer.on("mouseout", () => shade.resetStyle(layer as L.Path));
        },
      },
    ).addTo(map);
    layers.push(shade);

    // Numbers on the ZIPs, from zoom 8.75 up.
    const labels = L.layerGroup();
    for (const f of withGuests) {
      const r = rows.get(f.zip)!;
      const strong = cellMode || (r.cellGroup === "N/A" ? PRAMP.indexOf(rampColor(r.ytd, PRAMP)) >= 3 : RAMP.indexOf(rampColor(r.ytd)) >= 3);
      L.marker([f.lat, f.lon], {
        interactive: false,
        icon: L.divIcon({ className: cn("lcm-zlbl", strong && "dark"), html: `<b>${r.ytd}</b><span>${r.zip}</span>`, iconSize: [46, 28], iconAnchor: [23, 14] }),
      }).addTo(labels);
    }
    const sync = () => (map.getZoom() >= 8.75 ? labels.addTo(map) : map.removeLayer(labels));
    map.on("zoomend", sync);
    layers.push(labels);

    const legend = new L.Control({ position: "bottomright" });
    legend.onAdd = () => {
      const d = L.DomUtil.create("div", "lcm-legend");
      d.innerHTML = cellMode
        ? `<b>Zip with guests</b><br>${CELLS.map((c) => `<i style="background:${CELL_COLOR[c]}"></i>${c} cell`).join("<br>")}<br><i style="background:${EMFILL};border:2px dashed ${EMERG}"></i>Emerging`
        : `<b>Guests this year</b><table><tr><th></th><th>Cell</th><th>Emerg.</th></tr>${BREAKS.map((b, i) => {
            const hi = BREAKS[i + 1] ? BREAKS[i + 1]! - 1 : null;
            return `<tr><td>${hi && hi !== b ? `${b}–${hi}` : `${b}+`}</td><td><i style="background:${RAMP[i]}"></i></td><td><i style="background:${PRAMP[i]};border:1px dashed ${EMERG}"></i></td></tr>`;
          }).join("")}</table>`;
      return d;
    };
    legend.addTo(map);

    map.attributionControl.setPrefix(false).addAttribution("Zip areas: US Census ZCTA");
    const pts = withGuests.map((f) => [f.lat, f.lon] as [number, number]);
    map.invalidateSize();
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 11, animate: false });
    else map.fitBounds(base.getBounds(), { animate: false });
    sync();

    return () => {
      map.off("zoomend", sync);
      layers.forEach((l) => map.removeLayer(l));
      legend.remove();
    };
  }, [map, geo.data, zips, mode, bgName]);

  // Side panel: totals and the top 12 ZIPs.
  const sorted = [...zips].sort((a, b) => b.ytd - a.ytd);
  const tot = sorted.reduce((a, r) => a + r.ytd, 0);
  const inCell = sorted.filter((r) => r.cellGroup !== "N/A").reduce((a, r) => a + r.ytd, 0);
  const noOutline = sorted.filter((r) => !r.hasOutline).map((r) => r.zip);

  return (
    <div className="rounded-3xl border border-white bg-white p-5 shadow-card">
      <h3 className="font-display text-lg font-semibold text-maroon-900">{title}</h3>
      <div className="mt-3 flex flex-wrap items-center gap-3" data-noprint>
        <Seg label="Colour by" value={mode} onChange={setMode} options={[{ id: "guests", label: "Guests" }, { id: "cell", label: "Cell group" }]} />
        <Seg label="Background" value={bgName} onChange={setBg} options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} />
        <span className="text-xs text-muted">
          Tinted areas = cell-group zips · <b style={{ color: "#7B2CBF" }}>purple</b>, dashed = emerging (Greater Houston, not on the cell list) · number = guests this year
        </span>
      </div>
      {geo.isError ? <ErrorBanner>Map 1: {geo.error.message}</ErrorBanner> : null}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative">
          <div ref={el} className="h-105 overflow-hidden rounded-2xl border border-line" role="img" aria-label="Map 1: Greater Houston zip codes with guests this year" />
          {geo.isPending ? <Skeleton className="absolute inset-0 rounded-2xl" /> : null}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat n={tot} label="Greater Houston guests" />
            <MiniStat n={inCell} label="in cell-group zips" />
            <MiniStat n={tot - inCell} label="in emerging zips" />
          </div>
          <p className="text-xs font-extrabold tracking-wide text-muted uppercase">Top zip codes · year to date</p>
          <table className="w-full text-[13px] tabular">
            <thead>
              <tr className="text-[11px] font-extrabold text-muted uppercase">
                <th className="py-1 text-left">Zip</th>
                <th className="py-1 text-right">YTD</th>
                <th className="py-1 text-right">{year - 1}</th>
                <th className="py-1 pl-2 text-left">Cell list</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 12).map((r) => (
                <tr key={r.zip} className="border-t border-line">
                  <td className="py-1.5">
                    <b>{r.zip}</b>
                    <div className="text-xs text-muted">{[r.city, r.county].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="py-1.5 text-right font-bold">{r.ytd}</td>
                  <td className="py-1.5 text-right">{r.priorYtd}</td>
                  <td className="py-1.5 pl-2">{r.cellGroup !== "N/A" ? <CellChip cell={r.cellGroup} /> : <EmergingChip signal={r.signal} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > 12 ? <p className="text-xs text-muted">{sorted.length - 12} more zips on the map.</p> : null}
          {noOutline.length ? <p className="text-xs text-muted">No outline for {noOutline.join(", ")}, so {noOutline.length === 1 ? "it is" : "they are"} listed but not drawn.</p> : null}
          <p className="text-xs text-muted">Greater Houston = the 9-county metro plus 77435. Zip areas are US Census ZCTA boundaries, simplified.</p>
        </div>
      </div>
    </div>
  );
}

export function EmergingChip({ signal }: { signal: string | null }) {
  if (signal === "Emerging") return <span className="inline-flex rounded-full bg-[#EBDDF7] px-2.5 py-1 text-xs leading-none font-bold text-[#5A189A]">Emerging</span>;
  if (signal === "Growing") return <Chip tone="warn">Growing</Chip>;
  return <Chip>Watch</Chip>;
}

function MiniStat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl bg-cream-50 px-2 py-2">
      <b className="block font-display text-xl text-maroon-900 tabular">{n}</b>
      <span className="text-[11px] leading-tight font-semibold text-muted">{label}</span>
    </div>
  );
}

/* ================================================================= Map 2 */

const COUNTRY_ALIAS: Record<string, string> = {
  "united states": "United States of America",
  usa: "United States of America",
  uk: "United Kingdom",
  england: "United Kingdom",
  "great britain": "United Kingdom",
  drc: "Dem. Rep. Congo",
  "ivory coast": "Côte d'Ivoire",
  uae: "United Arab Emirates",
  korea: "South Korea",
};
const isUS = (c: VisitorCity) => /^united states$/i.test(c.country);

export function Map2({ cities, houstonZips, monthLabel, title }: { cities: VisitorCity[]; houstonZips: Set<string>; monthLabel: string; title: React.ReactNode }) {
  const world = useOutlines("world-countries");
  const states = useOutlines("us-states");
  const [view, setView] = useState<"us" | "world">("us");
  const { el, map } = useLeaflet([38, -96], 3.5);

  const isHou = (c: VisitorCity) => isUS(c) && c.zips.some((z) => houstonZips.has(z));
  const countryPoint = (name: string): [number, number] | null => {
    const want = (COUNTRY_ALIAS[name.trim().toLowerCase()] ?? name).toLowerCase();
    const f = world.data?.features.find((x) => x.properties.n.toLowerCase() === want);
    return f && f.properties.lat !== undefined && f.properties.lon !== undefined ? [f.properties.lat, f.properties.lon] : null;
  };
  const placed = cities.map((c) => {
    const pt: [number, number] | null = c.lat !== null && c.lon !== null ? [c.lat, c.lon] : !isUS(c) ? countryPoint(c.country) : null;
    return { c, pt, byCountry: c.lat === null && !!pt };
  });

  useEffect(() => {
    if (!map || !world.data) return;
    const layers: L.Layer[] = [];
    layers.push(
      L.geoJSON(world.data, {
        interactive: false,
        style: (f) => ({ color: "#C9C3B8", weight: 0.7, fillColor: (f?.properties as { n: string }).n === "United States of America" ? "#FBFAF7" : "#F1EEE8", fillOpacity: 1 }),
      }).addTo(map),
    );
    if (states.data) layers.push(L.geoJSON(states.data, { interactive: false, style: { color: "#C9C3B8", weight: 0.8, fill: false } }).addTo(map));
    map.getContainer().style.background = "#E9EEF2";

    // Greater Houston cities overlap at country scale: one combined circle below zoom 7.
    const P = placed.filter((p) => p.pt) as { c: VisitorCity; pt: [number, number]; byCountry: boolean }[];
    const hou = P.filter((p) => isHou(p.c));
    const rest = P.filter((p) => !isHou(p.c));
    const houTot = hou.reduce((a, p) => a + p.c.guests, 0);
    const houAll = houTot
      ? [
          {
            c: { city: "Greater Houston", state: "TX", country: "United States", guests: houTot, lat: null, lon: null, zips: [] } as VisitorCity,
            pt: [hou.reduce((a, p) => a + p.pt[0] * p.c.guests, 0) / houTot, hou.reduce((a, p) => a + p.pt[1] * p.c.guests, 0) / houTot] as [number, number],
            byCountry: false,
            n: hou.length,
            hou: true,
          },
        ]
      : [];
    const max = Math.max(1, ...[...P, ...houAll].map((p) => p.c.guests));
    const circles = (list: { c: VisitorCity; pt: [number, number]; byCountry: boolean; n?: number; hou?: boolean }[]) => {
      const g = L.layerGroup();
      [...list]
        .sort((a, b) => b.c.guests - a.c.guests)
        .forEach((p) => {
          const rad = 5 + 17 * Math.sqrt(p.c.guests / max);
          const inHou = p.hou || isHou(p.c);
          L.circleMarker(p.pt, { radius: rad, color: "#ffffff", weight: 1.5, fillColor: inHou ? DOT.hou : !isUS(p.c) ? DOT.abroad : DOT.us, fillOpacity: 0.85 })
            .bindTooltip(
              `<b>${esc(p.c.city)}</b>${p.c.state ? `, ${esc(p.c.state)}` : ""}${isUS(p.c) ? "" : ` · ${esc(p.c.country)}`}<br>${p.c.guests} guest${p.c.guests === 1 ? "" : "s"}${p.n ? ` from ${p.n} cit${p.n === 1 ? "y" : "ies"} · zoom in for each` : ""}${p.byCountry ? "<br>placed on the country (no zip)" : ""}${p.c.zips.length ? `<br>Zip ${p.c.zips.map(esc).join(", ")}` : ""}`,
              { sticky: true },
            )
            .addTo(g);
          if (rad >= 11) L.marker(p.pt, { interactive: false, icon: L.divIcon({ className: "lcm-dotlbl", html: String(p.c.guests), iconSize: [24, 16], iconAnchor: [12, 8] }) }).addTo(g);
        });
      return g;
    };
    const far = circles([...houAll, ...rest]);
    const near = circles(P);
    const sync = () => {
      if (map.getZoom() >= 7) {
        map.removeLayer(far);
        near.addTo(map);
      } else {
        map.removeLayer(near);
        far.addTo(map);
      }
    };
    map.on("zoomend", sync);
    sync();
    layers.push(far, near);

    const legend = new L.Control({ position: "bottomright" });
    legend.onAdd = () => {
      const d = L.DomUtil.create("div", "lcm-legend");
      d.innerHTML = `<b>Guests by city</b><br><i class="dot" style="background:${DOT.hou}"></i>Greater Houston<br><i class="dot" style="background:${DOT.us}"></i>Elsewhere in the US<br><i class="dot" style="background:${DOT.abroad}"></i>Outside the US`;
      return d;
    };
    legend.addTo(map);
    map.attributionControl.setPrefix(false).addAttribution("Outlines: Natural Earth · US Census");

    return () => {
      map.off("zoomend", sync);
      layers.forEach((l) => map.removeLayer(l));
      legend.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, world.data, states.data, cities, houstonZips]);

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
    if (view === "world") map.setView([22, 5], map.getSize().x < 600 ? 0.75 : 1.5, { animate: true });
    else map.fitBounds([[24.5, -124.8], [49.4, -66.9]], { animate: true });
  }, [map, view]);

  const tot = cities.reduce((a, c) => a + c.guests, 0);
  const hou = cities.filter(isHou).reduce((a, c) => a + c.guests, 0);
  const us = cities.filter((c) => isUS(c) && !isHou(c)).reduce((a, c) => a + c.guests, 0);
  const abroad = cities.filter((c) => !isUS(c) && c.country !== "Not given").reduce((a, c) => a + c.guests, 0);
  const unplaced = placed.filter((p) => !p.pt).map((p) => p.c);

  return (
    <div className="rounded-3xl border border-white bg-white p-5 shadow-card">
      <h3 className="font-display text-lg font-semibold text-maroon-900">{title}</h3>
      <div className="mt-3 flex flex-wrap items-center gap-3" data-noprint>
        <Seg value={view} onChange={setView} options={[{ id: "us", label: "United States" }, { id: "world", label: "World" }]} />
        <span className="text-xs text-muted">Circle size = guests from that city · visitors from abroad without a zip are placed on their country</span>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative">
          <div ref={el} className="h-105 overflow-hidden rounded-2xl border border-line" role="img" aria-label="Map 2: where this month’s visitors came from" />
          {world.isPending ? <Skeleton className="absolute inset-0 rounded-2xl" /> : null}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <MiniStat n={tot} label={`guests · ${monthLabel}`} />
            <MiniStat n={hou} label="Greater Houston" />
            <MiniStat n={us} label="elsewhere in the US" />
            <MiniStat n={abroad} label="outside the US" />
          </div>
          <p className="text-xs font-extrabold tracking-wide text-muted uppercase">Cities · {monthLabel}</p>
          {cities.length ? (
            <table className="w-full text-[13px] tabular">
              <tbody>
                {cities.slice(0, 12).map((c) => (
                  <tr key={`${c.city}-${c.state}-${c.country}`} className="border-t border-line">
                    <td className="py-1.5 font-bold">{c.city}</td>
                    <td className="py-1.5 text-muted">{isUS(c) ? (c.state ?? "US") : c.country}</td>
                    <td className="py-1.5 text-right font-bold">{c.guests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">No guests this month.</p>
          )}
          {cities.length > 12 ? <p className="text-xs text-muted">{cities.length - 12} more on the map.</p> : null}
          {unplaced.length ? <p className="text-xs text-muted">Not on the map (no zip or country we can place): {unplaced.map((c) => `${c.city} (${c.guests})`).join(", ")}.</p> : null}
        </div>
      </div>
    </div>
  );
}
