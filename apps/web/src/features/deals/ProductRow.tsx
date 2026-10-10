import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  offerPageSchema,
  type OfferPage,
  type ProductSummary,
} from "@better-buy/shared";
import { api } from "../../lib/api";
import type { DealSource } from "../dashboard/types";
import { faNumber, money } from "../dashboard/format";
import { feedStateLabel } from "./presentation";

export function ProductRow({
  group,
  source,
  scanId,
}: {
  group: ProductSummary;
  source: DealSource;
  scanId: string;
}) {
  const [broken, setBroken] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const client = useQueryClient();
  const cursor = cursors.at(-1) ?? null;
  const baseKey = ["offers", scanId, source, group.key];
  const offers = useQuery({
    queryKey: [...baseKey, cursor],
    enabled: expanded,
    staleTime: 600_000,
    gcTime: 600_000,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const page = await api(
        `/api/scans/${scanId}/products/${encodeURIComponent(group.key)}/offers?${params}`,
        { signal },
        offerPageSchema.parse
      );
      if (cursors.length > 20)
        client.removeQueries({
          queryKey: [...baseKey, cursors[0]],
          exact: true,
        });
      return page;
    },
  });
  const rows = new Map(
    cursors
      .flatMap(
        (value) =>
          (value === cursor
            ? offers.data
            : client.getQueryData<OfferPage>([...baseKey, value])
          )?.items ?? []
      )
      .map((offer) => [offer.offerKey, offer])
  );
  const best = group.bestCurrentOffer;
  return (
    <article
      className={`deal-row ${group.state === "no_longer_present" ? "historical-offer" : ""}`}
    >
      <div className="product-image">
        {group.image && !broken ? (
          <img
            src={group.image}
            alt=""
            width={88}
            height={88}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : (
          <span>تصویر در دسترس نیست</span>
        )}
      </div>
      <div className="product-copy">
        <h2>
          <bdi>{group.title}</bdi>
        </h2>
        <p>{best?.vendorTitle ?? "پیشنهاد جاری قابل مقایسه نیست"}</p>
        <small>
          {feedStateLabel(group.state)}
          {group.categoryTitle && ` · ${group.categoryTitle}`}
        </small>
      </div>
      <div className="price-label">
        {best ? (
          <>
            <div className="original-price">
              <del>
                <bdi>{money(best.priceRials, source)}</bdi>
              </del>
              <span className="discount">
                {faNumber.format(Math.round(best.discountRatio))}٪
              </span>
            </div>
            <strong>
              <bdi>{money(best.finalPriceRials, source)}</bdi>
            </strong>
            <small>کمترین قیمت مشاهده‌شده</small>
          </>
        ) : (
          <small>قیمت جاری در دسترس نیست</small>
        )}
      </div>
      <details
        className="vendor-disclosure"
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>
          مقایسه فروشگاه‌ها{" "}
          <span>{faNumber.format(group.currentStoreOfferCount)}</span>
        </summary>
        {expanded && (
          <div
            className="vendor-offers"
            aria-label={`پیشنهادهای ${group.title}`}
          >
            {offers.isPending && <p role="status">در حال دریافت فروشگاه‌ها…</p>}
            {offers.error && (
              <div role="status">
                <p>
                  دریافت فروشگاه‌ها انجام نشد؛ پیشنهادهای دریافت‌شده حفظ
                  شده‌اند.
                </p>
                <button
                  disabled={offers.isFetching}
                  onClick={() => void offers.refetch()}
                >
                  دریافت دوباره فروشگاه‌ها
                </button>
              </div>
            )}
            {[...rows.values()].map((offer) => (
              <div
                className={`vendor-offer ${offer.state === "no_longer_present" ? "historical-offer" : ""}`}
                key={offer.offerKey}
              >
                <div>
                  <strong>
                    <bdi>{offer.vendorTitle}</bdi>
                  </strong>
                  <small>
                    {feedStateLabel(offer.state)}
                    {offer.state !== "no_longer_present" &&
                      ` · موجودی ثبت‌شده ${faNumber.format(offer.stock)}`}
                  </small>
                  {offer.benefit?.kind === "conditional" && (
                    <small>
                      {offer.benefit.terms ?? "شرایط استفاده مشخص نیست"}
                    </small>
                  )}
                </div>
                <div>
                  <del>
                    <bdi>{money(offer.priceRials, source)}</bdi>
                  </del>
                  <strong>
                    <bdi>{money(offer.finalPriceRials, source)}</bdi>
                  </strong>
                  <small>
                    {offer.state === "no_longer_present"
                      ? "قیمت تاریخی"
                      : `${faNumber.format(offer.discountRatio)}٪ تخفیف`}
                  </small>
                </div>
              </div>
            ))}
            {offers.data?.nextCursor && (
              <button
                disabled={offers.isFetching}
                onClick={() => {
                  const next = offers.data?.nextCursor;
                  if (next && !cursors.includes(next))
                    setCursors([...cursors.slice(-20), next]);
                }}
              >
                نمایش فروشگاه‌های بیشتر
              </button>
            )}
            {cursors.length > 20 && (
              <button onClick={() => setCursors([null])}>
                بازگشت به فروشگاه‌های نخست
              </button>
            )}
          </div>
        )}
      </details>
      {group.conditionalOfferCount > 0 && (
        <small>پیشنهادهای مشروط در مقایسه فروشگاه‌ها مشخص شده‌اند.</small>
      )}
    </article>
  );
}
