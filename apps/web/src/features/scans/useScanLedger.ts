import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DealRecord,
  DealGroupRecord,
  ScanRecord,
} from "@better-buy/shared";
import type { DealSource } from "../dashboard/types";
import { api } from "../../lib/api";
import { useScanPolling } from "./useScanPolling";
export const loadDealLedger = async (scanId: string, signal?: AbortSignal) => {
  const [rawDeals, groupedDeals] = await Promise.all([
    api<DealRecord[]>("/api/scans/" + scanId + "/deals", { signal }),
    api<DealGroupRecord[]>("/api/scans/" + scanId + "/deal-groups", { signal }),
  ]);
  return { rawDeals, groupedDeals };
};
const noDeals: DealRecord[] = [];
const noGroups: DealGroupRecord[] = [];
export function useScanLedger({
  busy,
  selected,
  scans,
  source,
  threshold,
  setThreshold,
  setMode,
}: {
  busy: boolean;
  selected: string;
  scans: ScanRecord[];
  source: DealSource;
  threshold: number;
  setThreshold: (value: number) => void;
  setMode: (value: "partial" | "full") => void;
}) {
  const client = useQueryClient();
  const [currentRun, selectRun] = useState<ScanRecord | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const matchingRuns = useMemo(
    () =>
      scans
        .filter(
          (run) =>
            run.locationId === selected &&
            run.source === source &&
            run.status === "succeeded"
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [scans, selected, source]
  );
  // Adjust initial selection before React commits the query observers.
  if (!busy && selected && !hydrated) {
    setHydrated(true);
    const latest = !selectedRunId ? matchingRuns[0] : undefined;
    if (latest) {
      setThreshold(latest.threshold);
      setMode(latest.mode);
    }
  }
  const contextualRun =
    currentRun &&
    currentRun.locationId === selected &&
    currentRun.source === source &&
    currentRun.threshold === threshold &&
    !selectedRunId
      ? currentRun
      : null;
  const status = useScanPolling(contextualRun);
  const current = contextualRun ? (status.data ?? contextualRun) : null;
  const requested = selectedRunId
    ? matchingRuns.find(
        (run) => run.id === selectedRunId && run.threshold === threshold
      )
    : null;
  const latest =
    requested ??
    matchingRuns.find((run) => run.threshold === threshold) ??
    null;
  const succeeded = current?.status === "succeeded" ? current : latest;
  const scan = current ?? latest;
  const ledger = useQuery({
    queryKey: ["ledger", succeeded?.id ?? null],
    enabled: !busy && !!succeeded,
    queryFn: ({ signal }) => loadDealLedger(succeeded?.id ?? "", signal),
  });
  const setScan = (run: ScanRecord) => {
    client.setQueryData(["scan", run.id], run);
    selectRun(run);
  };
  const scanMessage =
    current?.status === "failed"
      ? (current.errorMessage ?? "اسکن ناموفق بود")
      : current?.status === "succeeded"
        ? "اسکن کامل شد؛ قفسه تازه است."
        : (status.error?.message ?? ledger.error?.message ?? "");
  return {
    scan,
    setScan,
    deals: ledger.data?.rawDeals ?? noDeals,
    dealGroups: ledger.data?.groupedDeals ?? noGroups,
    selectedRunId,
    setSelectedRunId,
    scanMessage,
  };
}
