import { useMutation, useQueryClient } from "@tanstack/react-query";
import { scanRecordSchema, type ScanRecord } from "@better-buy/shared";
import { api } from "../../lib/api";
export function useCancelScan() {
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      await client.cancelQueries({ queryKey: ["scan", id] });
      return api(
        `/api/scans/${id}/cancel`,
        { method: "POST" },
        scanRecordSchema.parse
      );
    },
    onSuccess: (run) => {
      client.setQueryData(["scan", run.id], run);
      client.setQueryData<ScanRecord[]>(["scans"], (previous) =>
        (previous ?? []).map((item) => (item.id === run.id ? run : item))
      );
    },
  });
}
