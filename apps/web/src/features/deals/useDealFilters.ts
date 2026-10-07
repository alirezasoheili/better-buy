import { useMemo, useState } from "react";
import {
  displayToman,
  type DealGroupRecord,
  type ScanRecord,
} from "@better-buy/shared";
import { activeGroupStock } from "./stock";
export function useDealFilters(
  dealGroups: DealGroupRecord[],
  scan: ScanRecord | null
) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedVendor, setVendor] = useState("all");
  const [minPrice, setMinPrice] = useState(0);
  const [sort, setSort] = useState("discount");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const vendors = useMemo(
    () =>
      [
        ...new Set(
          dealGroups.flatMap((group) =>
            group.vendors.map((groupVendor) => groupVendor.vendorTitle)
          )
        ),
      ].sort((a, b) => a.localeCompare(b, "fa")),
    [dealGroups]
  );
  const vendor = vendors.includes(selectedVendor) ? selectedVendor : "all";
  const visible = useMemo(
    () =>
      dealGroups
        .filter(
          (group) =>
            (stateFilter === "all" || group.state === stateFilter) &&
            (vendor === "all" ||
              group.vendors.some(
                (groupVendor) => groupVendor.vendorTitle === vendor
              )) &&
            displayToman(
              group.finalPriceRials,
              scan?.source ?? "snappmarket"
            ) >= minPrice &&
            `${group.title} ${group.categoryTitle ?? ""} ${group.vendors
              .map((groupVendor) => groupVendor.vendorTitle)
              .join(" ")}`.includes(query)
        )
        .sort((a, b) =>
          sort === "price"
            ? a.finalPriceRials - b.finalPriceRials
            : sort === "stock"
              ? activeGroupStock(b) - activeGroupStock(a)
              : b.discountRatio - a.discountRatio
        ),
    [dealGroups, stateFilter, vendor, minPrice, query, sort, scan?.source]
  );
  const counts = {
    all: dealGroups.filter((group) => group.state !== "no_longer_present")
      .length,
    new: dealGroups.filter((group) => group.state === "new").length,
    still: dealGroups.filter((group) => group.state === "still_available")
      .length,
    gone: dealGroups.filter((group) => group.state === "no_longer_present")
      .length,
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
    filtersOpen,
    setFiltersOpen,
    vendors,
    visible,
    counts,
  };
}
