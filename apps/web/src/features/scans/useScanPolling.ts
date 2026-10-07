import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScanRecord } from "@better-buy/shared";
import { api } from "../../lib/api";
export function useScanPolling(run: ScanRecord | null) {
  const client = useQueryClient();
  const active = run?.status === "queued" || run?.status === "running";
  return useQuery({
    queryKey: ["scan", run?.id ?? null],
    enabled: active,
    initialData: run ?? undefined,
    staleTime: active ? 0 : Infinity,
    queryFn: async ({ signal }) => {
      const scan = await api<ScanRecord>("/api/scans/" + run?.id, { signal });
      if (scan.status === "succeeded" || scan.status === "failed")
        await client.invalidateQueries({ queryKey: ["scans"] });
      return scan;
    },
    refetchInterval: (query) =>
      query.state.data?.status === "queued" ||
      query.state.data?.status === "running"
        ? 1200
        : false,
  });
}
