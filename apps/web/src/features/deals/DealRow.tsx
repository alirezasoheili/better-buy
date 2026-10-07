import { activeGroupStock } from "./stock";
import { displayToman } from "@better-buy/shared";
import type { DealGroupRecord } from "@better-buy/shared";
import type { DealSource } from "../dashboard/types";
import { faNumber, money } from "../dashboard/format";
export function DealRow({
  group: d,
  source,
}: {
  group: DealGroupRecord;
  source: DealSource;
}) {
  const activeVendors = d.vendors.filter(
    (groupVendor) => groupVendor.state !== "no_longer_present"
  );
  const bestVendor = activeVendors.reduce<
    (typeof activeVendors)[number] | null
  >(
    (best, groupVendor) =>
      !best || groupVendor.finalPriceRials < best.finalPriceRials
        ? groupVendor
        : best,
    null
  );
  return (
    <article className={`deal-row ${d.state}`}>
      <div className="discount-tab">
        <strong>{faNumber.format(d.discountRatio)}٪</strong>
        <span>تخفیف</span>
      </div>
      <div className="product-image">
        {d.image ? (
          <img src={d.image} alt="" loading="lazy" />
        ) : (
          <span>بدون تصویر</span>
        )}
      </div>
      <div className="product-copy">
        <div className="badges">
          <span>
            {d.state === "new"
              ? "تازه"
              : d.state === "still_available"
                ? "هنوز موجود"
                : "ناپدیدشده"}
          </span>
          {d.categoryTitle && <span>{d.categoryTitle}</span>}
        </div>
        <h2>{d.title}</h2>
        <p>
          {faNumber.format(activeVendors.length)} فروشگاه · موجودی{" "}
          {faNumber.format(activeGroupStock(d))}
        </p>
        <div className="vendor-chips" aria-label="فروشندگان این کالا">
          {d.vendors.map((groupVendor) => {
            const isGone = groupVendor.state === "no_longer_present";
            return (
              <span
                className={`vendor-chip ${groupVendor.state}`}
                key={groupVendor.vendorId}
                title={
                  isGone
                    ? `${groupVendor.vendorTitle} · ناپدیدشده`
                    : `${groupVendor.vendorTitle} · ${money(groupVendor.finalPriceRials, source)} · موجودی ${faNumber.format(groupVendor.stock)}`
                }
              >
                <strong>{groupVendor.vendorTitle}</strong>
                <small>
                  {isGone
                    ? "ناپدیدشده"
                    : `${money(groupVendor.finalPriceRials, source)} · موجودی ${faNumber.format(groupVendor.stock)}`}
                </small>
              </span>
            );
          })}
        </div>
      </div>
      <div className="price-label">
        <del>{money(d.priceRials, source)}</del>
        <strong>{money(d.finalPriceRials, source)}</strong>
        {bestVendor && (
          <small className="price-source">
            کمترین قیمت در {bestVendor.vendorTitle}
          </small>
        )}
        <small>
          {faNumber.format(displayToman(d.discountRials, source))} تومان
          صرفه‌جویی
        </small>
      </div>
    </article>
  );
}
