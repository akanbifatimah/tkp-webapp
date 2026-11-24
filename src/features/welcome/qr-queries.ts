import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PrintLayout, QrDatesInput, QrInput } from "./qr-types";

/** TanStack Query hooks for QR codes (PRD 5.8). */

export const qrKeys = {
  all: ["qr"] as const,
  list: ["qr", "list"] as const,
  detail: (id: string) => ["qr", "detail", id] as const,
};

// Status depends on the clock (QR-10): refetch each minute so a code flips to Expired on screen.
export const useQrList = () => useQuery({ queryKey: qrKeys.list, queryFn: ({ signal }) => api.qr.list(signal), refetchInterval: 60_000 });

export const useQrDetail = (id: string | null) =>
  useQuery({ queryKey: qrKeys.detail(id ?? ""), queryFn: ({ signal }) => api.qr.get(id!, signal), enabled: !!id });

function useQrMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Done only once the fresh list is in, so the next click has the new rowVer.
    onSettled: async () => {
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      await qc.invalidateQueries({ queryKey: qrKeys.all });
    },
  });
}

export const useCreateQr = () => useQrMutation((v: QrInput) => api.qr.create(v));
export const useUpdateQr = () => useQrMutation((v: { id: string; body: QrInput & { rowVer: number } }) => api.qr.update(v.id, v.body));
export const useSetQrDates = () => useQrMutation((v: { id: string; body: QrDatesInput }) => api.qr.setDates(v.id, v.body));
export const useSetQrState = () =>
  useQrMutation((v: { id: string; verb: "publish" | "pause" | "resume"; rowVer: number }) => api.qr.setState(v.id, v.verb, v.rowVer));
export const useDeleteQr = () => useQrMutation((id: string) => api.qr.remove(id));
export const useLogQrPrint = () => useQrMutation((v: { ids: string[]; layout: PrintLayout; copies: number }) => api.qr.logPrint(v.ids, v.layout, v.copies));
