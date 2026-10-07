export type DealSource = "snappmarket" | "digikalajet" | "okala";
export type ActiveSource = Exclude<DealSource, "digikalajet">;
export type ConnectionState = {
  source: DealSource;
  label: string;
  status: "automatic" | "disabled";
  canScan: boolean;
  message: string;
};
