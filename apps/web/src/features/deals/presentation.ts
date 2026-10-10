import type { DealGroupRecord, VendorOfferRecord } from "@better-buy/shared";
export function bestOffer(group: DealGroupRecord): VendorOfferRecord {
  const current = group.vendors.filter((v) => v.state !== "no_longer_present");
  return [...(current.length ? current : group.vendors)].sort(
    (a, b) =>
      a.finalPriceRials - b.finalPriceRials ||
      a.vendorTitle.localeCompare(b.vendorTitle, "fa")
  )[0]!;
}
export const feedStateLabel = (state: string) =>
  state === "new"
    ? "پیشنهاد جدید"
    : state === "still_available"
      ? "در فهرست فعلی"
      : "دیگر در این فهرست نیست";
