import { useQuery } from "@tanstack/react-query";
import { productsReadSchema, type ScanRecord } from "@better-buy/shared";
import type { DealSource } from "../dashboard/types";
import { api, RequestFailure } from "../../lib/api";
export const loadDealLedger = async (scanId: string, signal?: AbortSignal) => {
  const groupedDeals = await api(
    "/api/scans/" + scanId + "/products",
    { signal },
    productsReadSchema.parse
  );
  if (
    groupedDeals.some(
      (g) => g.state !== "no_longer_present" && g.scanId !== scanId
    )
  )
    throw new RequestFailure(
      "invalid-response",
      "پاسخ نتیجه با اسکن انتخاب‌شده مطابقت ندارد."
    );
  return { groupedDeals };
};
export function useScanLedger({
  busy,
  selected,
  scans,
  source,
  selectedRunId,
  coordinateRevision,
}: {
  busy: boolean;
  selected: string;
  scans: ScanRecord[];
  source: DealSource;
  selectedRunId: string | null;
  coordinateRevision: number;
}) {
  const contextual = scans
    .filter(
      (r) =>
        r.locationId === selected &&
        r.source === source &&
        (r.id === selectedRunId ||
          r.context?.location.revision === coordinateRevision ||
          (!r.context && coordinateRevision === 1))
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const requested = selectedRunId
    ? contextual.find((r) => r.id === selectedRunId)
    : null;
  const scan =
    requested ?? contextual.find((r) => r.status === "succeeded") ?? null;
  const ledger = useQuery({
    queryKey: [
      "ledger",
      selected,
      coordinateRevision,
      source,
      scan?.id ?? null,
    ],
    gcTime: 600_000,
    staleTime: 600_000,
    enabled: !busy && scan?.status === "succeeded",
    queryFn: ({ signal }) => loadDealLedger(scan!.id, signal),
  });
  return {
    scan,
    dealGroups: ledger.data?.groupedDeals ?? [],
    results: ledger,
    hasResults: !!ledger.data,
  };
}
