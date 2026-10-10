import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  scansReadSchema,
  scanStartedSchema,
  type LocationRecord,
  type ScanRecord,
} from "@better-buy/shared";
import { api, RequestFailure } from "../../lib/api";
import { recoveryInterval } from "../../lib/queryPolicy";
import type { DealSource } from "../dashboard/types";
export type ScanSelection = {
  locationId: string;
  source: DealSource;
  threshold: number;
  mode: "partial" | "full";
};
type UncertainAttempt = {
  target: ScanSelection;
  previousIds: string[];
  failedAt: number;
};
export function useStartScan(
  selection: ScanSelection,
  locations: LocationRecord[]
) {
  const client = useQueryClient();
  const locked = useRef(false);
  const [uncertain, setUncertain] = useState<UncertainAttempt | null>(null);
  const reconciliation = useQuery({
    queryKey: ["scans"],
    enabled: !!uncertain,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api("/api/scans", { signal }, scansReadSchema.parse),
    refetchInterval: (q) =>
      uncertain &&
      !q.state.data?.some(
        (r) =>
          !uncertain.previousIds.includes(r.id) &&
          r.locationId === uncertain.target.locationId &&
          r.source === uncertain.target.source &&
          r.threshold === uncertain.target.threshold
      )
        ? q.state.error
          ? recoveryInterval(q.state.error)
          : 15_000
        : false,
  });
  const recovered = uncertain
    ? reconciliation.data?.find(
        (r) =>
          !uncertain.previousIds.includes(r.id) &&
          r.locationId === uncertain.target.locationId &&
          r.source === uncertain.target.source &&
          r.threshold === uncertain.target.threshold
      )
    : undefined;
  const unresolved = !!uncertain && !recovered;
  const checked =
    reconciliation.isSuccess &&
    !!uncertain &&
    reconciliation.dataUpdatedAt >= uncertain.failedAt &&
    !reconciliation.isFetching;
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      target,
    }: {
      target: ScanSelection;
      previousIds: string[];
    }) => {
      const started = await api(
        "/api/scans",
        { method: "POST", body: JSON.stringify(target) },
        scanStartedSchema.parse
      );
      return {
        ...target,
        id: started.id,
        locationName:
          locations.find((l) => l.id === target.locationId)?.name ?? "",
        status: "queued",
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        vendorCount: 0,
        productCount: 0,
        dealCount: 0,
        errorCode: null,
        errorMessage: null,
      } satisfies ScanRecord;
    },
    onSuccess: (run) => {
      client.setQueryData(["scan", run.id], run);
      client.setQueryData<ScanRecord[]>(["scans"], (old) => [
        run,
        ...(old ?? []).filter((r) => r.id !== run.id),
      ]);
      setUncertain(null);
    },
    onError: (error, { target, previousIds }) => {
      if (
        error instanceof RequestFailure &&
        error.kind === "http" &&
        error.status === 409
      )
        void client.invalidateQueries({ queryKey: ["scans"] });
      if (
        error instanceof RequestFailure &&
        (error.kind !== "http" || (error.status ?? 0) >= 500)
      ) {
        setUncertain({ target, previousIds, failedAt: Date.now() });
        void client.invalidateQueries({ queryKey: ["scans"] });
      }
    },
    onSettled: () => {
      locked.current = false;
    },
  });
  const start = (overrides?: Partial<ScanSelection>) => {
    if (locked.current || mutation.isPending || unresolved) return;
    const target = { ...selection, ...overrides };
    if (!target.locationId || target.source === "digikalajet") return;
    if (target.source === "okala")
      target.threshold = Math.max(30, target.threshold);
    locked.current = true;
    mutation.mutate({
      target,
      previousIds: (client.getQueryData<ScanRecord[]>(["scans"]) ?? []).map(
        (r) => r.id
      ),
    });
  };
  return {
    start,
    submitting: mutation.isPending,
    unresolved,
    uncertain,
    recovered,
    reconciliation,
    checked,
    error: unresolved || recovered ? null : mutation.error,
    reset: () => {
      mutation.reset();
      setUncertain(null);
    },
    // Explicit acknowledgement after an authenticated fresh list, never a second automatic POST.
    allowNewAttempt: () => {
      if (
        checked &&
        !reconciliation.data?.some(
          (r) => r.status === "queued" || r.status === "running"
        )
      ) {
        setUncertain(null);
        mutation.reset();
      }
    },
  };
}
