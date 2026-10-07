import type { DealRecord } from "./contracts";
type Offer = Omit<DealRecord, "scanId" | "state">;
/** Compare exact vendor/product identities against the preceding successful snapshot. */
export function compareDeals(
  current: readonly Offer[],
  previous: readonly Offer[],
  scanId: string
): DealRecord[] {
  const previousKeys = new Set(previous.map((deal) => deal.key));
  const currentKeys = new Set(current.map((deal) => deal.key));
  return [
    ...current.map((deal): DealRecord => ({
      ...deal,
      scanId,
      state: previousKeys.has(deal.key) ? "still_available" : "new",
    })),
    ...previous
      .filter((deal) => !currentKeys.has(deal.key))
      .map((deal): DealRecord => ({
        ...deal,
        scanId,
        state: "no_longer_present",
      })),
  ];
}
