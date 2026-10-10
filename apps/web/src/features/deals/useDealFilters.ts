import { useMemo, useState } from "react";
import {
  displayToman,
  normalizeDealGroupText,
  type DealGroupRecord,
  type ScanRecord,
} from "@better-buy/shared";
import { bestOffer } from "./presentation";
export function useDealFilters(
  dealGroups: DealGroupRecord[],
  scan: ScanRecord | null
) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedVendor, setVendor] = useState("all");
  const [minPrice, setMinPrice] = useState(0);
  const [sort, setSort] = useState("price");
  const vendors = useMemo(
    () =>
      [
        ...new Set(
          dealGroups.flatMap((g) => g.vendors.map((v) => v.vendorTitle))
        ),
      ].sort((a, b) => a.localeCompare(b, "fa")),
    [dealGroups]
  );
  const vendor = vendors.includes(selectedVendor) ? selectedVendor : "all";
  const normalizedQuery =
    normalizeDealGroupText(query)?.toLocaleLowerCase("fa") ?? "";
  const visible = useMemo(
    () =>
      dealGroups
        .filter(
          (g) =>
            (stateFilter === "all" || g.state === stateFilter) &&
            (vendor === "all" ||
              g.vendors.some((v) => v.vendorTitle === vendor)) &&
            (
              normalizeDealGroupText(
                `${g.title} ${g.categoryTitle ?? ""} ${g.vendors.map((v) => v.vendorTitle).join(" ")}`
              )?.toLocaleLowerCase("fa") ?? ""
            ).includes(normalizedQuery)
        )
        .map((g) =>
          vendor === "all"
            ? g
            : {
                ...g,
                vendors: g.vendors.filter((v) => v.vendorTitle === vendor),
              }
        )
        .filter(
          (g) =>
            displayToman(
              bestOffer(g).finalPriceRials,
              scan?.source ?? "snappmarket"
            ) >= minPrice
        )
        .sort((a, b) =>
          sort === "price"
            ? bestOffer(a).finalPriceRials - bestOffer(b).finalPriceRials
            : bestOffer(b).discountRatio - bestOffer(a).discountRatio
        ),
    [
      dealGroups,
      stateFilter,
      vendor,
      minPrice,
      normalizedQuery,
      sort,
      scan?.source,
    ]
  );
  const counts = {
    all: dealGroups.length,
    new: dealGroups.filter((g) => g.state === "new").length,
    still: dealGroups.filter((g) => g.state === "still_available").length,
    gone: dealGroups.filter((g) => g.state === "no_longer_present").length,
  };
  const activeCount =
    Number(vendor !== "all") +
    Number(minPrice > 0) +
    Number(stateFilter !== "all") +
    Number(!!query);
  const reset = () => {
    setQuery("");
    setStateFilter("all");
    setVendor("all");
    setMinPrice(0);
  };
  return {
    query,
    setQuery,
    stateFilter,
    setStateFilter,
    vendor,
    setVendor,
    minPrice,
    setMinPrice,
    sort,
    setSort,
    vendors,
    visible,
    counts,
    activeCount,
    reset,
  };
}
