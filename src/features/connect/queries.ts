import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Team } from "@/lib/permissions";
import type { QueueResponse, SaveLogBody } from "./types";

/** TanStack Query hooks for Connect. All calls go through src/lib/api.ts. */

export const connectKeys = {
  all: ["connect"] as const,
  queue: (team?: Team, date?: string) => ["connect", "queue", team ?? "", date ?? ""] as const,
  guest: (id: number, team?: Team) => ["connect", "guest", id, team ?? ""] as const,
  logs: (team?: Team) => ["connect", "logs", team ?? ""] as const,
};

export function useQueue(team?: Team, date?: string) {
  return useQuery({
    queryKey: connectKeys.queue(team, date),
    queryFn: ({ signal }) => api.connect.queue({ team, date }, signal),
    placeholderData: keepPreviousData,
  });
}

/** Assign / un-assign: saves straight away; on error it reverts (UI-C1). */
export function useAssign(queueKey: readonly unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { connectId: number; team: Team; memberId: string | null }) => api.connect.assign(v.connectId, v.team, v.memberId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: queueKey });
      const before = qc.getQueryData<QueueResponse>(queueKey);
      if (before) {
        const name = before.members.find((m) => m.id === v.memberId)?.fullName ?? null;
        qc.setQueryData<QueueResponse>(queueKey, {
          ...before,
          rows: before.rows.map((r) =>
            r.connectId !== v.connectId
              ? r
              : v.team === "church_office"
                ? { ...r, coMemberId: v.memberId, coName: name }
                : { ...r, itMemberId: v.memberId, itName: name },
          ),
        });
      }
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(queueKey, ctx.before);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["connect", "guest"] });
    },
  });
}

export function useGuest(connectId: number | null, team?: Team) {
  return useQuery({
    queryKey: connectKeys.guest(connectId ?? 0, team),
    queryFn: ({ signal }) => api.connect.guest(connectId!, team, signal),
    enabled: connectId !== null,
    // A form in progress must not be replaced under the person typing (UI-G4).
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useSaveLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveLogBody) => api.connect.saveLog(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: connectKeys.all });
    },
  });
}

export function useLogs(team?: Team) {
  return useQuery({
    queryKey: connectKeys.logs(team),
    queryFn: ({ signal }) => api.connect.logs({ team }, signal),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["connect", "departments"],
    queryFn: async () => (await api.connect.departments()).departments,
    staleTime: Infinity,
  });
}

export function useEntry(guestId: number | null) {
  return useQuery({
    queryKey: ["welcome", "entry", guestId],
    queryFn: ({ signal }) => api.welcome.entry(guestId!, signal).then((r) => r.entry),
    enabled: guestId !== null,
  });
}
