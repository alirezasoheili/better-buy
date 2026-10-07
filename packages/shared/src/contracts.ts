import { z } from "zod";
import { locationInputSchema } from "./validation";
export type LocationInput = z.infer<typeof locationInputSchema>;
export type DealState = "new" | "still_available" | "no_longer_present";
export type ScanStatus = "queued" | "running" | "succeeded" | "failed";

export interface LocationRecord extends LocationInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface LocationSearchResult {
  latitude: number;
  longitude: number;
  displayName: string;
}
export interface ProviderSettingsStatus {
  tokenConfigured: boolean;
  tokenExpired: boolean;
  tokenExpiresAt: string | null;
}
export interface ScanRecord {
  id: string;
  locationId: string;
  locationName: string;
  threshold: number;
  source: "snappmarket" | "digikalajet" | "okala";
  mode: "partial" | "full";
  status: ScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  vendorCount: number;
  productCount: number;
  dealCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}
export interface DealRecord {
  key: string;
  scanId: string;
  productVariationId: string;
  vendorId: string;
  title: string;
  image: string | null;
  vendorTitle: string;
  vendorCode: string | null;
  categoryTitle: string | null;
  priceRials: number;
  discountRials: number;
  finalPriceRials: number;
  discountRatio: number;
  stock: number;
  state: DealState;
}
