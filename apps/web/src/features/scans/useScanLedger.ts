import { useQuery } from "@tanstack/react-query";
import {
  dealsReadSchema,
  groupsReadSchema,
  type ScanRecord,
} from "@better-buy/shared";
import type { DealSource } from "../dashboard/types";
import { api, RequestFailure } from "../../lib/api";
export const loadDealLedger = async (scanId: string, signal?: AbortSignal) => {
  const [rawDeals, groupedDeals] = await Promise.all([
    api("/api/scans/" + scanId + "/deals", { signal }, dealsReadSchema.parse),
    api(
      "/api/scans/" + scanId + "/deal-groups",
      { signal },
      groupsReadSchema.parse
    ),
  ]);
  if (
    groupedDeals.some(
      (g) => g.state !== "no_longer_present" && g.scanId !== scanId
    )
  )
    throw new RequestFailure(
      "invalid-response",
      "پاسخ نتیجه با اسکن انتخاب‌شده مطابقت ندارد."
    );
  // Disappeared raw rows retain their previous scanId by the historical contract.
  return { rawDeals, groupedDeals };
};
export function useScanLedger({
  busy,
  selected,
  scans,
  source,
  threshold,
  selectedRunId,
}: {
  busy: boolean;
  selected: string;
  scans: ScanRecord[];
  source: DealSource;
  threshold: number;
  selectedRunId: string | null;
}) {
  const contextual = scans
    .filter(
      (r) =>
        r.locationId === selected &&
        r.source === source &&
        r.threshold === threshold
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const requested = selectedRunId
    ? contextual.find((r) => r.id === selectedRunId)
    : null;
  const scan =
    requested ?? contextual.find((r) => r.status === "succeeded") ?? null;
  const ledger = useQuery({
    queryKey: ["ledger", selected, source, threshold, scan?.id ?? null],
    enabled: !busy && scan?.status === "succeeded",
    queryFn: ({ signal }) => loadDealLedger(scan!.id, signal),
  });
  return {
    scan,
    deals: ledger.data?.rawDeals ?? [],
    dealGroups: ledger.data?.groupedDeals ?? [],
    results: ledger,
    hasResults: !!ledger.data,
  };
}
