/** SnappMarket's price fields are already expressed in tomans. */
export const toman = (amount: number) => Math.round(amount);

import type { ScanRecord } from "./contracts";
/** Preserve each upstream unit; persisted *Rials field names are historical. */
export const displayToman = (amount: number, source: ScanRecord["source"]) =>
  source === "snappmarket" ? toman(amount) : Math.round(amount / 10);
