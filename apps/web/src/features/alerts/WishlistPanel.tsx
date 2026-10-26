import { useState } from "react";
import type { LocationRecord } from "@better-buy/shared";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Panel, ReadNotice } from "../dashboard/Primitives";
import { useWishlist } from "./useAlerts";
import { PushSettings } from "./PushSettings";
import "./alerts.css";

export function WishlistPanel({
  locations,
  locationsReady,
}: {
  locations: LocationRecord[];
  locationsReady: boolean;
}) {
  const { query, mutation } = useWishlist();
  const [phrase, setPhrase] = useState("");
  const [notice, setNotice] = useState("");
  const savedLocation = query.data?.defaultLocationId;
  const missingLocation =
    savedLocation &&
    locationsReady &&
    !locations.some((location) => location.id === savedLocation);
  return (
    <Panel
      title="فهرست علاقه‌مندی‌ها"
      trigger={<Button variant="ghost">علاقه‌مندی‌ها</Button>}
    >
      <div className="alerts-content">
        <p className="muted">
          عبارت‌های دلخواه را ثبت کنید تا پیشنهادهای مرتبط را زودتر ببینید.
        </p>
        <p>اسکن زمان‌بندی‌شده: هر روز ساعت ۹ و ۱۸ به وقت تهران</p>
        {query.data?.scheduleEnabled === false && (
          <ReadNotice title="اسکن زمان‌بندی‌شده هنوز فعال نیست">
            زمان‌بندی از سمت سرویس غیرفعال است؛ می‌توانید علاقه‌مندی‌ها و موقعیت
            را برای زمان فعال‌سازی آماده کنید.
          </ReadNotice>
        )}
        {query.isPending && <p role="status">در حال دریافت علاقه‌مندی‌ها…</p>}
        {query.error && (
          <ReadNotice
            title="علاقه‌مندی‌ها دریافت نشدند"
            retry={() => void query.refetch()}
            busy={query.isFetching}
          >
            {query.error.message}
          </ReadNotice>
        )}
        {query.data && (
          <>
            <form
              className="wishlist-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!phrase.trim() || mutation.isPending) return;
                setNotice("");
                mutation.mutate(
                  { kind: "add", phrase: phrase.trim() },
                  {
                    onSuccess: () => {
                      setPhrase("");
                      setNotice("عبارت اضافه شد.");
                    },
                  }
                );
              }}
            >
              <label htmlFor="wishlist-phrase">نام کالا یا عبارت دلخواه</label>
              <div className="alerts-actions">
                <Input
                  id="wishlist-phrase"
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  placeholder="مثلاً چای ایرانی"
                  disabled={mutation.isPending}
                />
                <Button
                  type="submit"
                  disabled={!phrase.trim() || mutation.isPending}
                >
                  افزودن
                </Button>
              </div>
            </form>
            {query.data.items.length === 0 ? (
              <p className="muted">هنوز عبارتی ثبت نکرده‌اید.</p>
            ) : (
              <ul className="wishlist-items">
                {query.data.items.map((item) => (
                  <li key={item.id}>
                    <span>{item.phrase}</span>
                    <Button
                      variant="outline"
                      disabled={mutation.isPending}
                      aria-label={"حذف " + item.phrase}
                      onClick={() => {
                        setNotice("");
                        mutation.mutate(
                          { kind: "delete", id: item.id },
                          { onSuccess: () => setNotice("عبارت حذف شد.") }
                        );
                      }}
                    >
                      حذف
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="wishlist-location">
              <label htmlFor="wishlist-location">
                موقعیت اسکن زمان‌بندی‌شده
              </label>
              <select
                id="wishlist-location"
                value={savedLocation ?? ""}
                disabled={!locationsReady || mutation.isPending}
                onChange={(event) => {
                  setNotice("");
                  mutation.mutate(
                    {
                      kind: "location",
                      locationId: event.target.value || null,
                    },
                    { onSuccess: () => setNotice("موقعیت اسکن ذخیره شد.") }
                  );
                }}
              >
                <option value="">غیرفعال؛ بدون موقعیت</option>
                {missingLocation && (
                  <option value={savedLocation}>
                    موقعیت قبلی در دسترس نیست
                  </option>
                )}
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <p className="muted">
                این انتخاب مستقل از موقعیت نمایش پیشنهادهاست. برای اسکن خودکار
                یک موقعیت انتخاب کنید.
              </p>
              {!locationsReady && (
                <p role="status">
                  برای انتخاب موقعیت، ابتدا دریافت موقعیت‌ها باید کامل شود.
                </p>
              )}
            </div>
          </>
        )}
        {mutation.error && (
          <p className="form-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <p role="status">{mutation.isPending ? "در حال ذخیره…" : notice}</p>
        <PushSettings
          publicKey={query.data?.pushPublicKey ?? null}
          loading={query.isPending}
        />
      </div>
    </Panel>
  );
}
