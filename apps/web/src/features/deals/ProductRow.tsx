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
import { Button } from "@/components/ui/button";

export function ProductRow({
  group,
  source,
  scanId,
  canAddToCart = false,
  inCart = false,
  addPending = false,
  cartWritePending = false,
  onAddToCart,
}: {
  group: ProductSummary;
  source: DealSource;
  scanId: string;
  canAddToCart?: boolean;
  inCart?: boolean;
  addPending?: boolean;
  cartWritePending?: boolean;
  onAddToCart?: (key: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const client = useQueryClient();
  const cursor = cursors.at(-1) ?? null;
  const baseKey = ["offers", scanId, source, group.key];
  const canCompareStores = group.currentStoreOfferCount > 1;
  const offers = useQuery({
    queryKey: [...baseKey, cursor],
    enabled: canCompareStores && expanded,
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
      className={`deal-row grid grid-cols-[88px_minmax(0,1fr)_minmax(150px,230px)] items-center gap-x-5 gap-y-3 px-6 py-5 max-[768px]:grid-cols-[72px_minmax(0,1fr)_160px] max-[768px]:gap-x-3 max-[768px]:gap-y-2 max-[768px]:p-4 max-[520px]:grid-cols-[64px_minmax(0,1fr)] max-[520px]:px-3 ${group.state === "no_longer_present" ? "historical-offer" : ""}`}
    >
      <div className="product-image grid size-22 place-items-center overflow-hidden rounded-lg border border-input bg-white max-[768px]:size-18 max-[520px]:size-16 max-[520px]:self-start">
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
      <div className="product-copy min-w-0">
        <h2>
          <bdi>{group.title}</bdi>
        </h2>
        <p>{best?.vendorTitle ?? "پیشنهاد جاری قابل مقایسه نیست"}</p>
        <small>
          {feedStateLabel(group.state)}
          {group.categoryTitle && ` · ${group.categoryTitle}`}
        </small>
      </div>
      <div className="price-label flex min-w-0 flex-col items-end gap-1 text-end tabular-nums max-[520px]:col-start-2 max-[520px]:items-start max-[520px]:text-start">
        {best ? (
          <>
            <div className="original-price flex items-center justify-end gap-2.5 text-xs text-muted-foreground max-[520px]:justify-start">
              <del>
                <bdi>{money(best.priceRials, source)}</bdi>
              </del>
              <span className="discount">
                {faNumber.format(Math.round(best.discountRatio))}٪
              </span>
            </div>
            <strong className="block text-[19px] max-[520px]:text-lg">
              <bdi>{money(best.finalPriceRials, source)}</bdi>
            </strong>
          </>
        ) : (
          <small>قیمت جاری در دسترس نیست</small>
        )}
        {canAddToCart && (
          <Button
            variant="outline"
            className="product-cart-add mt-1 min-w-33"
            aria-busy={addPending}
            disabled={inCart || cartWritePending}
            aria-label={
              inCart
                ? `${group.title} در سبد است`
                : `افزودن ${group.title} به سبد`
            }
            onClick={() => onAddToCart?.(group.key)}
          >
            {inCart
              ? "در سبد"
              : addPending
                ? "در حال افزودن…"
                : "افزودن به سبد"}
          </Button>
        )}
      </div>
      {canCompareStores && (
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
              {offers.isPending && (
                <p role="status">در حال دریافت فروشگاه‌ها…</p>
              )}
              {offers.error && (
                <div role="status">
                  <p>
                    دریافت فروشگاه‌ها انجام نشد؛ پیشنهادهای دریافت‌شده حفظ
                    شده‌اند.
                  </p>
                  <Button
                    variant="outline"
                    disabled={offers.isFetching}
                    onClick={() => void offers.refetch()}
                  >
                    دریافت دوباره فروشگاه‌ها
                  </Button>
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
                <Button
                  variant="outline"
                  disabled={offers.isFetching}
                  onClick={() => {
                    const next = offers.data?.nextCursor;
                    if (next && !cursors.includes(next))
                      setCursors([...cursors.slice(-20), next]);
                  }}
                >
                  نمایش فروشگاه‌های بیشتر
                </Button>
              )}
              {cursors.length > 20 && (
                <Button variant="outline" onClick={() => setCursors([null])}>
                  بازگشت به فروشگاه‌های نخست
                </Button>
              )}
            </div>
          )}
        </details>
      )}
      {canCompareStores && group.conditionalOfferCount > 0 && (
        <small>پیشنهادهای مشروط در مقایسه فروشگاه‌ها مشخص شده‌اند.</small>
      )}
    </article>
  );
}
