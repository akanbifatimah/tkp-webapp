import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MergeInput } from "./duplicate-types";

/** TanStack Query hooks for Welcome › Duplicates (PRD W-14). */

export const dupKeys = { all: ["duplicates"] as const };

export const useDuplicates = () => useQuery({ queryKey: dupKeys.all, queryFn: ({ signal }) => api.duplicates.list(signal) });

function useDupMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // A merge changes guests everywhere: lookup, Connect, metrics. Wait for the fresh list (new rowVers).
    onSettled: async () => {
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      void qc.invalidateQueries({ queryKey: ["welcome"] });
      void qc.invalidateQueries({ queryKey: ["connect"] });
      await qc.invalidateQueries({ queryKey: dupKeys.all });
    },
  });
}

export const useMergeDuplicates = () => useDupMutation((v: MergeInput) => api.duplicates.merge(v));
export const useDismissDuplicates = () => useDupMutation((v: { ids: number[]; note: string | null }) => api.duplicates.dismiss(v.ids, v.note));
export const useUnmerge = () => useDupMutation((mergeId: string) => api.duplicates.unmerge(mergeId));
export const useRestoreDuplicate = () => useDupMutation((key: string) => api.duplicates.restore(key));
