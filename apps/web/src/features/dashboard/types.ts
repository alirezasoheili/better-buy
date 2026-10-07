export type DealSource = "snappmarket" | "digikalajet" | "okala";
export type ActiveSource = Exclude<DealSource, "digikalajet">;
export type ConnectionState = {
  source: DealSource;
  label: string;
  status:
    "automatic" | "ready" | "missing" | "expired" | "unavailable" | "disabled";
  canScan: boolean;
  message: string;
};
