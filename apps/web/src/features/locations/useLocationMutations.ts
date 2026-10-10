import { useMutation } from "@tanstack/react-query";
import {
  locationRecordSchema,
  type LocationInput,
  type LocationRecord,
} from "@better-buy/shared";
import { api } from "../../lib/api";
export function useLocationMutations(
  locationId: string | undefined,
  onSaved: (location?: LocationRecord) => void
) {
  const saveMutation = useMutation({
    mutationFn: (input: LocationInput) =>
      api(
        "/api/locations" + (locationId ? "/" + locationId : ""),
        {
          method: locationId ? "PATCH" : "POST",
          body: JSON.stringify(input),
        },
        locationRecordSchema.parse
      ),
  });
  const removeMutation = useMutation({
    mutationFn: () => api("/api/locations/" + locationId, { method: "DELETE" }),
  });
  const save = (input: LocationInput) => {
    if (!saveMutation.isPending)
      saveMutation.mutate(input, { onSuccess: onSaved });
  };
  const remove = (onFailure: () => void) => {
    if (locationId && !removeMutation.isPending)
      removeMutation.mutate(undefined, {
        onSuccess: () => onSaved(),
        onError: onFailure,
      });
  };
  return {
    error: saveMutation.error?.message ?? removeMutation.error?.message ?? "",
    pending: saveMutation.isPending || removeMutation.isPending,
    save,
    remove,
  };
}
