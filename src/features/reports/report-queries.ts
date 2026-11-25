import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Period, ReportId, ScheduleInput, ShareInput } from "./report-types";

/** TanStack Query hooks for the Reports hub (PRD PL-4, PL-5). */

export const reportKeys = {
  all: ["reports"] as const,
  list: ["reports", "list"] as const,
  data: (id: ReportId, period?: Period, type?: string) => ["reports", "data", id, period ?? "", type ?? ""] as const,
  recipients: (id: ReportId) => ["reports", "recipients", id] as const,
  schedules: ["reports", "schedules"] as const,
};

export const useReports = () => useQuery({ queryKey: reportKeys.list, queryFn: ({ signal }) => api.reports.list(signal) });
export const useReportData = (id: ReportId, period?: Period, type?: string) =>
  useQuery({ queryKey: reportKeys.data(id, period, type), queryFn: ({ signal }) => api.reports.get(id, { period, type }, signal), placeholderData: keepPreviousData });
export const useRecipients = (id: ReportId | null) =>
  useQuery({ queryKey: reportKeys.recipients(id ?? "lcm-pack"), queryFn: ({ signal }) => api.reports.recipients(id!, signal), enabled: !!id });
export const useSchedules = () => useQuery({ queryKey: reportKeys.schedules, queryFn: ({ signal }) => api.reports.schedules(signal) });

function useReportMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: async () => {
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      await Promise.all([qc.invalidateQueries({ queryKey: reportKeys.schedules }), qc.invalidateQueries({ queryKey: reportKeys.list })]);
    },
  });
}

export const useShareReport = () => useReportMutation((v: { id: ReportId; body: ShareInput }) => api.reports.share(v.id, v.body));
export const useCreateSchedule = () => useReportMutation((b: ScheduleInput) => api.reports.createSchedule(b));
export const useUpdateSchedule = () => useReportMutation((v: { id: string; body: ScheduleInput & { rowVer: number } }) => api.reports.updateSchedule(v.id, v.body));
export const useSetScheduleActive = () => useReportMutation((v: { id: string; active: boolean; rowVer: number }) => api.reports.setActive(v.id, v.active, v.rowVer));
export const useRunSchedule = () => useReportMutation((id: string) => api.reports.runNow(id));
export const useDeleteSchedule = () => useReportMutation((id: string) => api.reports.deleteSchedule(id));
