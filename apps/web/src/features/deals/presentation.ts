import {
  compareOfferPrice,
  type DealGroupRecord,
  type VendorOfferRecord,
} from "@better-buy/shared";
export function bestOffer(group: DealGroupRecord): VendorOfferRecord {
  if (group.bestCurrentOffer) return group.bestCurrentOffer;
  const current = group.vendors.filter((v) => v.state !== "no_longer_present");
  return [
    ...(current.length
      ? current
      : group.vendors.length
        ? group.vendors
        : (group.conditionalOffers ?? [])),
  ].sort(compareOfferPrice)[0]!;
}
export const feedStateLabel = (state: string) =>
  state === "current"
    ? "در فهرست فعلی"
    : state === "new"
      ? "پیشنهاد جدید"
      : state === "still_available"
        ? "در فهرست فعلی"
        : "دیگر در این فهرست نیست";
