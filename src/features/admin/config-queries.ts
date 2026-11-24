import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { KNOWN_TYPES } from "@/features/welcome/model";
import { api } from "@/lib/api";
import type { CellName, Service, ServiceInput, ServicesResponse } from "./config-types";

/** TanStack Query hooks for the cell map and services managers (M7). */

export const configKeys = {
  cellMap: ["config", "cell-map"] as const,
  services: ["config", "services"] as const,
};

/** Cell groups and service names feed every Welcome view, Connect and the dashboard. */
const refreshEverything = (qc: QueryClient) => {
  for (const key of [["welcome"], ["connect"], ["dashboard"], ["admin", "audit"]]) void qc.invalidateQueries({ queryKey: key });
};

export function useCellMap() {
  return useQuery({ queryKey: configKeys.cellMap, queryFn: ({ signal }) => api.config.cellMap(signal) });
}

export function useSetZip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { zip: string; cell: CellName | null; rowVer: number }) =>
      v.cell ? api.config.setZip(v.zip, v.cell, v.rowVer) : api.config.removeZip(v.zip, v.rowVer),
    // Wait for the fresh map (new rowVer) before the save counts as done.
    onSettled: async () => {
      refreshEverything(qc);
      await qc.invalidateQueries({ queryKey: configKeys.cellMap });
    },
  });
}

/** The service list. Also read by Guest lookup and LCM Metrics for their service filter. */
export function useServices() {
  return useQuery({ queryKey: configKeys.services, queryFn: ({ signal }) => api.config.services(signal), staleTime: 5 * 60_000 });
}

/**
 * Service names for Welcome's filters: the ones on the form first, then retired
 * ones that still have entries. The built-in three while the list loads.
 */
export function useServiceOptions(): { name: string; retired: boolean }[] {
  const q = useServices();
  if (!q.data) return KNOWN_TYPES.map((name) => ({ name, retired: false }));
  return q.data.items.filter((s) => s.active || s.entries > 0).map((s) => ({ name: s.name, retired: !s.active }));
}

function useServiceMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Done only once the fresh list is in, so the next click works on current data.
    onSettled: async () => {
      refreshEverything(qc);
      await qc.invalidateQueries({ queryKey: configKeys.services });
    },
  });
}

export const useCreateService = () => useServiceMutation((v: ServiceInput) => api.config.createService(v));
export const useUpdateService = () =>
  useServiceMutation((v: { id: string; body: ServiceInput & { rowVer: number } }) => api.config.updateService(v.id, v.body));
export const useSetServiceActive = () =>
  useServiceMutation((v: { id: string; active: boolean }) => (v.active ? api.config.restoreService(v.id) : api.config.retireService(v.id)));
export const useDeleteService = () => useServiceMutation((id: string) => api.config.deleteService(id));

/** Moves at once on screen; the server's order replaces it, or the old order returns on error. */
export function useReorderServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.config.reorderServices(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: configKeys.services });
      const before = qc.getQueryData<ServicesResponse>(configKeys.services);
      if (before) {
        const active = ids.map((id) => before.items.find((s) => s.id === id)).filter((s): s is Service => !!s);
        const items = [...active, ...before.items.filter((s) => !ids.includes(s.id))];
        qc.setQueryData<ServicesResponse>(configKeys.services, { items, formToday: [...items.filter((s) => s.onForm).map((s) => s.name), "Other"] });
      }
      return { before };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.before) qc.setQueryData(configKeys.services, ctx.before);
    },
    onSuccess: (r) => qc.setQueryData(configKeys.services, r),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["admin", "audit"] }),
  });
}
