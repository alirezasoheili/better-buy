import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LocationRecord } from "@better-buy/shared";
import type { DealSource } from "../dashboard/types";
import { faNumber } from "../dashboard/format";
import { Panel } from "../dashboard/Primitives";
export function ScanControls({
  locations,
  selected,
  source,
  threshold,
  blocked,
  submitting,
  hasSnapshot,
  onLocation,
  onSource,
  onThreshold,
  onStart,
}: {
  locations: LocationRecord[];
  selected: string;
  source: DealSource;
  threshold: number;
  blocked: boolean;
  submitting: boolean;
  hasSnapshot: boolean;
  onLocation: (id: string) => void;
  onSource: (source: DealSource) => void;
  onThreshold: (n: number) => void;
  onStart: () => void;
}) {
  return (
    <section className="scan-controls" aria-label="موقعیت و تخفیف‌ها">
      <Label className="feed-location">
        موقعیت تحویل
        <Select value={selected || undefined} onValueChange={onLocation}>
          <SelectTrigger id="selected-location" aria-label="موقعیت تحویل">
            <SelectValue placeholder="یک موقعیت اضافه کنید" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      <div className="feed-actions">
        <Panel
          title="تنظیمات تخفیف‌ها"
          trigger={<Button variant="outline">تنظیمات</Button>}
        >
          {source === "digikalajet" ? (
            <div className="historical-source">
              <strong>دیجی‌کالا جت · فقط مشاهده</strong>
              <Button variant="outline" onClick={() => onSource("snappmarket")}>
                بازگشت به تخفیف‌ها
              </Button>
            </div>
          ) : (
            <>
              <Label>
                فروشگاه
                <Select
                  value={source}
                  onValueChange={(value) =>
                    onSource(value === "okala" ? "okala" : "snappmarket")
                  }
                >
                  <SelectTrigger aria-label="فروشگاه">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="snappmarket">اسنپ‌مارکت</SelectItem>
                    <SelectItem value="okala">اکالا</SelectItem>
                  </SelectContent>
                </Select>
              </Label>
              <Label>
                حداقل درصد تخفیف
                <Select
                  value={String(threshold)}
                  onValueChange={(value) => onThreshold(Number(value))}
                >
                  <SelectTrigger aria-label="حداقل درصد تخفیف">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      ...new Set([
                        threshold,
                        ...(source === "okala"
                          ? [30, 35, 40, 45, 50]
                          : [15, 20, 25, 30, 35, 40, 45, 50]),
                      ]),
                    ]
                      .sort((a, b) => a - b)
                      .map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {faNumber.format(n)}٪ به بالا
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Label>
              <p className="muted">
                این تنظیمات در به‌روزرسانی بعدی استفاده می‌شوند.
              </p>
            </>
          )}
        </Panel>
        <Button
          variant="default"
          className="primary scan-button"
          disabled={blocked || source === "digikalajet"}
          onClick={onStart}
        >
          {submitting
            ? "در حال شروع…"
            : hasSnapshot
              ? "به‌روزرسانی تخفیف‌ها"
              : "پیدا کردن تخفیف‌ها"}
        </Button>
      </div>
    </section>
  );
}
