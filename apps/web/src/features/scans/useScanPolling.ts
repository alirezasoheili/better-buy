import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scanRecordSchema, type ScanRecord } from "@better-buy/shared";
import { api } from "../../lib/api";
import { recoveryInterval } from "../../lib/queryPolicy";
export const isActiveScan = (run: ScanRecord | null | undefined) =>
  run?.status === "queued" || run?.status === "running";
// Account-wide observer: navigating result context never hides a server-owned job.
export function useScanPolling(run: ScanRecord | null) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["scan", run?.id ?? null],
    enabled: isActiveScan(run),
    initialData: run ?? undefined,
    staleTime: isActiveScan(run) ? 0 : Infinity,
    queryFn: async ({ signal }) => {
      const scan = await api(
        "/api/scans/" + run?.id,
        { signal },
        scanRecordSchema.parse
      );
      client.setQueryData<ScanRecord[]>(["scans"], (old) =>
        (old ?? []).map((r) => (r.id === scan.id ? scan : r))
      );
      return scan;
    },
    refetchInterval: (query) =>
      isActiveScan(query.state.data)
        ? query.state.error
          ? recoveryInterval(query.state.error)
          : 1_500
        : false,
  });
}
