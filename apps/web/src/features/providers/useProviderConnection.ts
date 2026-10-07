import type { ConnectionState, DealSource } from "../dashboard/types";
import { sourceLabel } from "../dashboard/format";
export function useProviderConnection(source: DealSource): ConnectionState {
  if (source === "digikalajet")
    return {
      source,
      label: sourceLabel(source),
      status: "disabled",
      canScan: false,
      message: "دیجی‌کالا جت فعلاً غیرفعال است؛ این نتیجه فقط خواندنی است.",
    };
  return {
    source,
    label: sourceLabel(source),
    status: "automatic",
    canScan: true,
    message: `برای اسکن ${sourceLabel(source)} نیازی به ورود یا وارد کردن توکن نیست. ارتباط هنگام اسکن بررسی می‌شود.`,
  };
}
