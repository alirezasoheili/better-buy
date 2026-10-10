import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { authClient } from "../../app/auth-client";
import { Panel } from "./Primitives";
import { ThemeMenu } from "./ThemeMenu";
export function AppHeader({
  onLocations,
  onHistory,
  onHome,
  view,
}: {
  onLocations: () => void;
  onHistory: () => void;
  onHome: () => void;
  view: "deals" | "history";
}) {
  const [accountError, setAccountError] = useState("");
  return (
    <>
      <header className="app-header">
        <button
          className="brand"
          onClick={onHome}
          aria-label="بهتر بخر، پیشنهادها"
        >
          <span className="brand-mark">ب</span>
          <span>
            <strong>بهتر بخر</strong>
            <small>
              <bdi>Better Buy</bdi>
            </small>
          </span>
        </button>
        <nav aria-label="ناوبری اصلی">
          <button onClick={onLocations}>موقعیت‌ها</button>
          <button
            aria-current={view === "history" ? "page" : undefined}
            onClick={onHistory}
          >
            تاریخچه اسکن
          </button>
          <Panel title="راهنمای بهتر بخر" trigger={<button>راهنما</button>}>
            <p>
              موقعیت تحویل و فروشگاه را انتخاب کنید، اسکن را شروع کنید و قیمت
              پیشنهادها را مقایسه کنید.
            </p>
            <p>
              برای اسکن اسنپ‌مارکت و اکالا نیازی به ورود به فروشگاه نیست. ورود
              به بهتر بخر برای نگهداری موقعیت‌ها و تاریخچه لازم است.
            </p>
            <p>
              اکالا پیشنهادهای فهرست عمومی تبلیغاتی را بررسی می‌کند؛ این فهرست
              تمام کالاهای اکالا را پوشش نمی‌دهد.
            </p>
            <p>
              قیمت‌ها مشاهدات زمان اسکن هستند. نبودن پیشنهاد در فهرست تازه، به
              معنی ناموجود بودن آن در همه فروشگاه‌ها نیست.
            </p>
            <p>
              اسکن تازه جت فعلاً غیرفعال است؛ نتیجه‌های قبلی در تاریخچه قابل
              مشاهده‌اند.
            </p>
          </Panel>
          <ThemeMenu />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="account-button">
              حساب
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="account-menu"
                align="end"
                sideOffset={8}
              >
                <DropdownMenu.Label>حساب بهتر بخر</DropdownMenu.Label>
                <DropdownMenu.Item
                  onSelect={() => {
                    void authClient
                      .signOut()
                      .then((r) => {
                        if (r.error)
                          setAccountError(
                            "خروج از حساب انجام نشد؛ دوباره تلاش کنید."
                          );
                      })
                      .catch(() =>
                        setAccountError(
                          "خروج از حساب انجام نشد؛ دوباره تلاش کنید."
                        )
                      );
                  }}
                >
                  خروج از حساب
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </nav>
      </header>
      {accountError && (
        <p className="form-error" role="alert">
          {accountError}
        </p>
      )}
    </>
  );
}
