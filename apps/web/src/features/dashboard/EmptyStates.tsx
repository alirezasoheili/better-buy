import type { ConnectionState } from "./types";
import { Icon } from "./Icon";
export function ActivationPanel({
  hasLocation,
  onLocation,
}: {
  hasLocation: boolean;
  onLocation: () => void;
}) {
  return (
    <section className="activation-panel" aria-labelledby="activation-title">
      <div className="activation-intro">
        <span>شروع مقایسه</span>
        <h1 id="activation-title">برای اولین اسکن آماده شوید</h1>
        <p>
          قیمت و موجودی هر پیشنهاد به موقعیت تحویل و فروشگاه انتخابی شما وابسته
          است.
        </p>
      </div>
      <ol className="activation-steps">
        <li className={hasLocation ? "complete" : "current"}>
          <span>۱</span>
          <div>
            <strong>موقعیت تحویل را انتخاب کنید</strong>
            <p>
              یک نشانی را روی نقشه ثبت کنید تا قیمت‌های همان محدوده نمایش داده
              شوند.
            </p>
            <button type="button" onClick={onLocation}>
              {hasLocation ? "تغییر موقعیت تحویل" : "افزودن موقعیت تحویل"}
            </button>
          </div>
        </li>
        <li className={hasLocation ? "current" : "pending"}>
          <span>۲</span>
          <div>
            <strong>اولین اسکن را اجرا کنید</strong>
            <p>
              پس از انتخاب موقعیت، اسکن اسنپ‌مارکت یا اکالا را شروع کنید؛ نیازی
              به ورود به فروشگاه یا وارد کردن توکن نیست.
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}

export function EmptyState({
  connection,
  hasDeals,
  onAction,
  onClearFilters,
}: {
  connection: ConnectionState;
  hasDeals: boolean;
  onAction: () => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">۴۰٪</span>
      <h2>{hasDeals ? "چیزی با این فیلتر پیدا نشد" : "قفسه هنوز خالی است"}</h2>
      <p>
        {hasDeals
          ? "فیلترها را سبک‌تر کنید تا کالاها دوباره دیده شوند."
          : connection.canScan
            ? "یک اسکن دستی اجرا کنید تا تخفیف‌های عمیق اطراف این مکان پیدا شوند."
            : connection.message}
      </p>
      {hasDeals ? (
        <button onClick={onClearFilters}>پاک‌کردن فیلترها</button>
      ) : (
        <button onClick={onAction}>
          {connection.canScan
            ? "اولین اسکن"
            : connection.status === "disabled"
              ? "بازگشت به اسکن فعال"
              : "تنظیم اتصال"}
        </button>
      )}
    </div>
  );
}

export function ProviderDisabledNotice({
  onActivate,
}: {
  onActivate: () => void;
}) {
  return (
    <section className="provider-disabled" role="status">
      <span className="empty-mark">جت</span>
      <h1>دیجی‌کالا جت موقتاً غیرفعال است</h1>
      <p>
        تنظیم اتصال و اسکن تازه برای این منبع فعلاً در دسترس نیست. نتایج قبلی
        همچنان از تاریخچه قابل مشاهده‌اند.
      </p>
      <button onClick={onActivate}>بازگشت به تنظیمات اسکن فعال</button>
    </section>
  );
}
