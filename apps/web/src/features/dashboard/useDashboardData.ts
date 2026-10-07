import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  LocationRecord,
  ProviderSettingsStatus,
  ScanRecord,
} from "@better-buy/shared";
import { api } from "../../lib/api";
const emptyLocations: LocationRecord[] = [];
const emptyScans: ScanRecord[] = [];
export function useDashboardData() {
  const client = useQueryClient();
  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: ({ signal }) =>
      api<LocationRecord[]>("/api/locations", { signal }),
  });
  const scansQuery = useQuery({
    queryKey: ["scans"],
    queryFn: ({ signal }) => api<ScanRecord[]>("/api/scans", { signal }),
  });
  const okalaQuery = useQuery({
    queryKey: ["settings", "okala"],
    queryFn: ({ signal }) =>
      api<ProviderSettingsStatus>("/api/settings/okala", { signal }),
  });
  const [selection, setSelected] = useState("");
  const locations = locationsQuery.data ?? emptyLocations;
  const selected = locations.some((location) => location.id === selection)
    ? selection
    : (locations.find((location) => location.isDefault)?.id ??
      locations[0]?.id ??
      "");
  const load = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["locations"] }),
      client.invalidateQueries({ queryKey: ["scans"] }),
      client.invalidateQueries({ queryKey: ["settings", "okala"] }),
    ]);
  }, [client]);
  const setOkalaSettings = (value: ProviderSettingsStatus) =>
    client.setQueryData(["settings", "okala"], value);
  return {
    locations,
    selected,
    setSelected,
    scans: scansQuery.data ?? emptyScans,
    busy:
      locationsQuery.isPending || scansQuery.isPending || okalaQuery.isPending,
    needsLocation: locationsQuery.isSuccess && locations.length === 0,
    okalaSettings: okalaQuery.data ?? null,
    setOkalaSettings,
    providerErrors: okalaQuery.error ? { okala: okalaQuery.error.message } : {},
    dataError: locationsQuery.error?.message ?? scansQuery.error?.message ?? "",
    load,
  };
}
