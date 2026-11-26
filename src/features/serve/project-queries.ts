import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectInput } from "./project-types";

/** TanStack Query hooks for Projects (docs/API.md §19). */

export const projectKeys = {
  all: ["projects"] as const,
  list: (q: object) => ["projects", "list", q] as const,
  one: (id: string) => ["projects", "one", id] as const,
};

export const useProjects = (q: { status: string; q: string; ministry: string }) =>
  useQuery({ queryKey: projectKeys.list(q), queryFn: ({ signal }) => api.projects.list(q, signal), placeholderData: (prev) => prev });
export const useProject = (id: string | undefined) => useQuery({ queryKey: projectKeys.one(id ?? ""), queryFn: ({ signal }) => api.projects.get(id!, signal), enabled: !!id });

function useProjectMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: async () => {
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      await qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export const useCreateProject = () => useProjectMutation((v: ProjectInput) => api.projects.create(v));
export const useUpdateProject = () => useProjectMutation((v: { id: string; body: ProjectInput & { rowVer: number } }) => api.projects.update(v.id, v.body));
export const useApproveProject = () => useProjectMutation((v: { id: string; rowVer: number }) => api.projects.approve(v.id, v.rowVer));
export const useRequestChanges = () => useProjectMutation((v: { id: string; message: string; rowVer: number }) => api.projects.changes(v.id, v.message, v.rowVer));
export const useDeclineProject = () => useProjectMutation((v: { id: string; reason: string; rowVer: number }) => api.projects.decline(v.id, v.reason, v.rowVer));
export const useFeatureProject = () => useProjectMutation((v: { id: string; on: boolean; rowVer: number }) => api.projects.feature(v.id, v.on, v.rowVer));
export const useCloseProject = () => useProjectMutation((v: { id: string; reason: string; rowVer: number }) => api.projects.close(v.id, v.reason, v.rowVer));
export const useReopenProject = () => useProjectMutation((v: { id: string; rowVer: number }) => api.projects.reopen(v.id, v.rowVer));
export const useProjectLead = () => useProjectMutation((v: { id: string; leadId: string | null; rowVer: number }) => api.projects.lead(v.id, v.leadId, v.rowVer));
export const usePositionState = () => useProjectMutation((v: { id: string; pid: string; state: "open" | "filled" | "closed"; rowVer: number }) => api.projects.position(v.id, v.pid, v.state, v.rowVer));
