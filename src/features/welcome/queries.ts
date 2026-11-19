import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GuestSearch, Scope } from "./types";

/** TanStack Query hooks for Welcome. All calls go through src/lib/api.ts. */

export function useOverview(date: string | undefined, scope: Scope) {
  return useQuery({
    queryKey: ["welcome", "overview", date ?? "latest", scope],
    queryFn: ({ signal }) => api.welcome.overview({ date, scope }, signal),
    placeholderData: keepPreviousData,
  });
}

/** Every service date (for the lookup's date filter). */
export function useServiceDates() {
  return useQuery({
    queryKey: ["welcome", "overview", "latest", "service"],
    queryFn: ({ signal }) => api.welcome.overview({ scope: "service" }, signal),
    select: (d) => d.dates,
    staleTime: 5 * 60_000,
  });
}

const hasSearch = (q: GuestSearch) => Object.values(q).some(Boolean);

export function useGuestSearch(q: GuestSearch) {
  const phoneTooShort = !!q.phone && q.phone.length < 3 && !q.name && !q.date && !q.cell && !q.type && !q.member;
  return useQuery({
    queryKey: ["welcome", "search", q],
    queryFn: ({ signal }) => api.welcome.search(q, signal),
    enabled: hasSearch(q) && !phoneTooShort,
    placeholderData: keepPreviousData,
  });
}

export function useGuestRecord(id: number | null) {
  return useQuery({
    queryKey: ["welcome", "guest", id],
    queryFn: ({ signal }) => api.welcome.guest(id!, signal).then((r) => r.guest),
    enabled: id !== null,
  });
}

export function useLcm(month: string | undefined, type: string | undefined) {
  return useQuery({
    queryKey: ["welcome", "lcm", month ?? "default", type ?? ""],
    queryFn: ({ signal }) => api.welcome.lcm({ month, type }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useZipGeo() {
  return useQuery({
    queryKey: ["welcome", "zipgeo"],
    queryFn: ({ signal }) => api.welcome.zipgeo(signal).then((r) => r.features),
    staleTime: Infinity,
  });
}

/** Outlines bundled with the front end (public data, no API needed). */
export function useOutlines(name: "us-states" | "world-countries") {
  return useQuery({
    queryKey: ["geo", name],
    queryFn: () => api.geo.outlines(name),
    staleTime: Infinity,
  });
}
