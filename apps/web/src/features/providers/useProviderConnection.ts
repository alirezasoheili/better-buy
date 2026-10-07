import { useMemo } from "react";
import type { ProviderSettingsStatus } from "@better-buy/shared";
import type {
  ActiveSource,
  ConnectionState,
  DealSource,
} from "../dashboard/types";
import { sourceLabel } from "../dashboard/format";
export function useProviderConnection(
  source: DealSource,
  okalaSettings: ProviderSettingsStatus | null,
  providerErrors: Partial<Record<ActiveSource, string>>
) {
  const connection = useMemo<ConnectionState>(() => {
    if (source === "digikalajet")
      return {
        source,
        label: sourceLabel(source),
        status: "disabled",
        canScan: false,
        message: "دیجی‌کالا جت فعلاً غیرفعال است؛ این نتیجه فقط خواندنی است.",
      };
    if (source === "snappmarket")
      return {
        source,
        label: sourceLabel(source),
        status: "automatic",
        canScan: true,
        message:
          "برای اسکن اسنپ‌مارکت نیازی به ورود یا وارد کردن توکن نیست. ارتباط هنگام اسکن بررسی می‌شود.",
      };
    const value = okalaSettings;
    const providerError = providerErrors[source];
    if (providerError)
      return {
        source,
        label: sourceLabel(source),
        status: "unavailable",
        canScan: false,
        message: `${sourceLabel(source)}: ${providerError}`,
      };
    if (!value)
      return {
        source,
        label: sourceLabel(source),
        status: "unavailable",
        canScan: false,
        message: `وضعیت اتصال ${sourceLabel(source)} در دسترس نیست؛ تنظیمات را بررسی کنید.`,
      };
    if (!value.tokenConfigured)
      return {
        source,
        label: sourceLabel(source),
        status: "missing",
        canScan: false,
        message: `ابتدا توکن ${sourceLabel(source)} را در تنظیمات اتصال وارد کنید.`,
      };
    if (value.tokenExpired)
      return {
        source,
        label: sourceLabel(source),
        status: "expired",
        canScan: false,
        message: `توکن ${sourceLabel(source)} منقضی شده است؛ برای اسکن دوباره آن را تعویض کنید.`,
      };
    return {
      source,
      label: sourceLabel(source),
      status: "ready",
      canScan: true,
      message: `${sourceLabel(source)} آماده اسکن مکان انتخابی است.`,
    };
  }, [okalaSettings, providerErrors, source]);

  return connection;
}
