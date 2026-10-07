import type { DealGroupRecord } from "@better-buy/shared";
export const activeGroupStock = (group: DealGroupRecord) =>
  group.vendors
    .filter((vendor) => vendor.state !== "no_longer_present")
    .reduce((total, vendor) => total + vendor.stock, 0);
