import { useMemo, useState } from "react";
import {
  compareProductDiscount,
  normalizeDealGroupText,
  type DealGroupRecord,
} from "@better-buy/shared";
import { bestOffer } from "./presentation";
export function useDealFilters(dealGroups: DealGroupRecord[]) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("discount");
  const normalizedQuery =
    normalizeDealGroupText(query)?.toLocaleLowerCase("fa") ?? "";
  const visible = useMemo(
    () =>
      dealGroups
        .filter((group) =>
          (
            normalizeDealGroupText(
              `${group.title} ${group.vendors.map((v) => v.vendorTitle).join(" ")}`
            )?.toLocaleLowerCase("fa") ?? ""
          ).includes(normalizedQuery)
        )
        .sort((a, b) =>
          sort === "price"
            ? Number(!a.bestCurrentOffer) - Number(!b.bestCurrentOffer) ||
              bestOffer(a).finalPriceRials - bestOffer(b).finalPriceRials ||
              a.key.localeCompare(b.key)
            : compareProductDiscount(a, b)
        ),
    [dealGroups, normalizedQuery, sort]
  );
  return { query, setQuery, sort, setSort, visible, reset: () => setQuery("") };
}
