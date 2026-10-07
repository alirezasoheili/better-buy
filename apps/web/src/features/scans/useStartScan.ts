import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import type { LocationRecord, ScanRecord } from "@better-buy/shared";
import { api } from "../../lib/api";
import type { DealSource } from "../dashboard/types";
type ScanSelection = {
  locationId: string;
  source: DealSource;
  threshold: number;
  mode: "partial" | "full";
};
export function useStartScan(
  selection: ScanSelection,
  locations: LocationRecord[],
  onStarted: (scan: ScanRecord) => void,
  onError: (message: string) => void
) {
  const currentSelection = useRef(selection);
  currentSelection.current = selection;
  const mutation = useMutation({
    mutationFn: async (target: ScanSelection): Promise<ScanRecord> => {
      const started = await api<{ id: string; status: string }>("/api/scans", {
        method: "POST",
        body: JSON.stringify(target),
      });
      return {
        ...target,
        id: started.id,
        locationName:
          locations.find((location) => location.id === target.locationId)
            ?.name ?? "",
        status: "queued",
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        vendorCount: 0,
        productCount: 0,
        dealCount: 0,
        errorCode: null,
        errorMessage: null,
      };
    },
  });
  const start = (overrides?: Partial<ScanSelection>) => {
    if (mutation.isPending) return;
    const target = { ...selection, ...overrides };
    if (!target.locationId || target.source === "digikalajet") return;
    const stillSelected = () =>
      currentSelection.current.locationId === target.locationId &&
      currentSelection.current.source === target.source &&
      currentSelection.current.threshold === target.threshold &&
      currentSelection.current.mode === target.mode;
    // Per-call callbacks stop on unmount. The server owns an accepted mutation.
    mutation.mutate(target, {
      onSuccess: (run) => {
        if (stillSelected()) onStarted(run);
      },
      onError: (error) => {
        if (stillSelected()) onError(error.message);
      },
    });
  };
  return { start, submitting: mutation.isPending };
}
