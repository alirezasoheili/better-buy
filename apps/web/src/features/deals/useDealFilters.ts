import { useState } from "react";
export function useDealFilters() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("discount");
  return { query, setQuery, sort, setSort, reset: () => setQuery("") };
}
