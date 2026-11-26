import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PrayerFilter, PrayerSettings, PrivateStatus } from "./prayer-types";

/** TanStack Query hooks for the Prayer Wall (docs/API.md §18). */

export const prayerKeys = {
  all: ["prayer"] as const,
  list: (q: object) => ["prayer", "list", q] as const,
  private: (s: string) => ["prayer", "private", s] as const,
};

export const usePrayerList = (q: { filter: PrayerFilter; q: string; category: string }) =>
  useQuery({ queryKey: prayerKeys.list(q), queryFn: ({ signal }) => api.prayer.list(q, signal), placeholderData: (prev) => prev });
export const usePrivateRequests = (status: string) => useQuery({ queryKey: prayerKeys.private(status), queryFn: ({ signal }) => api.prayer.private(status, signal) });

function usePrayerMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: async () => {
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      await qc.invalidateQueries({ queryKey: prayerKeys.all });
    },
  });
}

export const useApprove = () => usePrayerMutation((v: { id: string; rowVer: number }) => api.prayer.approve(v.id, v.rowVer));
export const useEditPrayer = () => usePrayerMutation((v: { id: string; text: string; category: string; reason: string; rowVer: number }) => api.prayer.edit(v.id, v));
export const useRemovePrayer = () => usePrayerMutation((v: { id: string; reason: string; rowVer: number }) => api.prayer.remove(v.id, v.reason, v.rowVer));
export const useRestorePrayer = () => usePrayerMutation((v: { id: string; rowVer: number }) => api.prayer.restore(v.id, v.rowVer));
export const useAnswered = () => usePrayerMutation((v: { id: string; answered: boolean; rowVer: number }) => api.prayer.answered(v.id, v.answered, v.rowVer));
export const usePrayerNote = () => usePrayerMutation((v: { id: string; text: string }) => api.prayer.note(v.id, v.text));
export const usePrayerSettings = () => usePrayerMutation((v: PrayerSettings) => api.prayer.settings(v));
export const usePrayOver = () => usePrayerMutation((id: string) => api.prayer.prayOver(id));
export const usePrivateStatus = () => usePrayerMutation((v: { id: string; status: PrivateStatus; rowVer: number; note?: string }) => api.prayer.privateStatus(v.id, v));
export const usePrivateNote = () => usePrayerMutation((v: { id: string; text: string }) => api.prayer.privateNote(v.id, v.text));
