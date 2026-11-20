import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuditQuery, SettingsInput, UserInput, UserQuery } from "./types";

/** TanStack Query hooks for M6 Admin. All calls go through src/lib/api.ts. */

export const adminKeys = {
  dashboard: ["dashboard"] as const,
  users: (q: UserQuery) => ["admin", "users", q] as const,
  allUsers: ["admin", "users"] as const,
  audit: (q: AuditQuery) => ["admin", "audit", q] as const,
  settings: ["admin", "settings"] as const,
};

export function useDashboard() {
  return useQuery({ queryKey: adminKeys.dashboard, queryFn: ({ signal }) => api.dashboard(signal), staleTime: 60_000 });
}

export function useUsers(q: UserQuery) {
  return useQuery({ queryKey: adminKeys.users(q), queryFn: ({ signal }) => api.admin.users(q, signal), placeholderData: keepPreviousData });
}

/** Any change to a person refreshes the lists, the dashboard and the audit log. */
function useUserMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.allUsers });
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      void qc.invalidateQueries({ queryKey: adminKeys.dashboard });
    },
  });
}

export const useCreateUser = () => useUserMutation((v: UserInput) => api.admin.createUser(v));
export const useUpdateUser = () => useUserMutation((v: { id: string; body: UserInput & { rowVer: number } }) => api.admin.updateUser(v.id, v.body));
export const useSetActive = () => useUserMutation((v: { id: string; active: boolean }) => (v.active ? api.admin.reactivate(v.id) : api.admin.deactivate(v.id)));
export const useResetPassword = () => useUserMutation((id: string) => api.admin.resetPassword(id));
export const useSignOutEverywhere = () => useUserMutation((id: string) => api.admin.signOutEverywhere(id));

export function useAudit(q: AuditQuery) {
  return useQuery({ queryKey: adminKeys.audit(q), queryFn: ({ signal }) => api.admin.audit(q, signal), placeholderData: keepPreviousData });
}

export function useSettings() {
  return useQuery({ queryKey: adminKeys.settings, queryFn: ({ signal }) => api.admin.settings(signal).then((r) => r.settings) });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: SettingsInput) => api.admin.saveSettings(v).then((r) => r.settings),
    onSuccess: (s) => {
      qc.setQueryData(adminKeys.settings, s);
      void qc.invalidateQueries({ queryKey: ["settings", "public"] });
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });
}
