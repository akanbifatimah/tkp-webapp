import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ImportJob, ImportKind, ImportPatch } from "./import-types";

/** TanStack Query hooks for Welcome › Import (PRD W-16). */

export const importKeys = {
  all: ["imports"] as const,
  list: ["imports", "list"] as const,
  job: (id: string) => ["imports", "job", id] as const,
};

export const useImports = () => useQuery({ queryKey: importKeys.list, queryFn: ({ signal }) => api.imports.list(signal) });
export const useImportJob = (id: string | undefined) =>
  useQuery({ queryKey: importKeys.job(id ?? ""), queryFn: ({ signal }) => api.imports.get(id!, signal), enabled: !!id, retry: false });

/** After a commit or undo, guests changed everywhere: lookup, Connect, LCM, duplicates. */
function useImportMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: async () => {
      for (const k of [["admin", "audit"], ["welcome"], ["connect"], ["duplicates"]]) void qc.invalidateQueries({ queryKey: k });
      await qc.invalidateQueries({ queryKey: importKeys.all });
    },
  });
}

export const useUploadImport = () => useImportMutation((v: { kind: ImportKind; file: File }) => api.imports.upload(v.kind, v.file));
export const useCommitImport = () => useImportMutation((v: { id: string; mode: "add" | "update"; key: string }) => api.imports.commit(v.id, v.mode, v.key));
export const useUndoImport = () => useImportMutation((v: { id: string; force?: boolean }) => api.imports.undo(v.id, v.force));
export const useDiscardImport = () => useImportMutation((id: string) => api.imports.discard(id));

/** Column, setting and fix changes: the answer is the new preview, put straight into the cache. */
export function usePatchImport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportPatch) => api.imports.patch(id, body),
    onSuccess: (job: ImportJob) => qc.setQueryData(importKeys.job(id), job),
  });
}
