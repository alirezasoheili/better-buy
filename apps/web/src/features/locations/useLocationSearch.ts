import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { locationSearchReadSchema } from "@better-buy/shared";
import { api } from "../../lib/api";
export function useLocationSearch() {
  const [searchQuery, updateQuery] = useState("");
  const [submitted, setSubmitted] = useState<{
    text: string;
    revision: number;
  } | null>(null);
  const [validationError, setValidationError] = useState("");
  const query = useQuery({
    queryKey: ["locationSearch", submitted?.text, submitted?.revision],
    enabled: !!submitted,
    queryFn: ({ signal }) =>
      api(
        "/api/locations/search?q=" + encodeURIComponent(submitted?.text ?? ""),
        { signal },
        locationSearchReadSchema.parse
      ),
  });
  const setSearchQuery = (text: string) => {
    updateQuery(text);
    setSubmitted(null);
    setValidationError("");
  };
  const searchAddress = () => {
    const text = searchQuery.trim();
    if (text.length < 2) {
      setSubmitted(null);
      setValidationError("برای جست‌وجو حداقل دو نویسه وارد کنید.");
      return;
    }
    setValidationError("");
    setSubmitted((previous) => ({
      text,
      revision: (previous?.revision ?? 0) + 1,
    }));
  };
  const searchError =
    validationError || (submitted ? query.error?.message : "") || "";
  const searchResults = submitted ? (query.data ?? []) : [];
  const searchState = searchError
    ? "error"
    : !submitted
      ? "idle"
      : query.isFetching
        ? "loading"
        : searchResults.length
          ? "results"
          : "empty";
  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchState,
    searchError,
    searchAddress,
  };
}
