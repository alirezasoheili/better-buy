import { Effect } from "effect";
import { z } from "zod";
import type { DealRecord } from "@better-buy/shared";
import { CollectorError } from "../../domain/failures";
import { isEligibleDeal } from "../../domain/eligibility";

export type SnappRead = (
  url: URL
) => Effect.Effect<{ status: number; body: unknown }, CollectorError>;
export type CampaignScope = {
  vendorId: number;
  vendorCode: string;
  collectionId: number;
};
type Offer = Omit<DealRecord, "scanId" | "state">;
// Discovery is location scoped; no store, title or collection allowlist.
export const SNAPP_SCAN_REQUEST_BUDGET = 40;
const MAX_DISCOVERED_STORES = 20;
const MAX_PLANNING_REQUESTS = 12;
const MAX_COLLECTIONS = 2;
const BASELINE_AND_RETRY_RESERVE = 8;
const owner = z.number().int().positive().safe();
const homeSchema = z.object({
  vendorInfo: z.object({
    id: owner,
    code: z.string().regex(/^[a-zA-Z0-9]+$/),
    title: z.string().min(1),
    deliveryData: z.object({
      doesDeliver: z.boolean(),
      id: owner,
      detail: z.object({ vendorId: owner }),
    }),
  }),
  sections: z.array(
    z
      .object({
        type: z.string(),
        value: z.unknown().optional(),
        title: z.string().nullable().optional(),
        collection_type: z.string().nullable().optional(),
        config: z.unknown().optional(),
      })
      .passthrough()
  ),
});
const pageSchema = z.object({
  status: z.literal(true).optional(),
  data: z.object({
    id: owner,
    type: z.literal("default"),
    count: z.number().int().nonnegative(),
    finalResult: z.array(
      z.object({
        type: z.literal("PRODUCT"),
        data: z.record(z.string(), z.unknown()),
      })
    ),
  }),
});
const productSchema = z
  .object({
    id: owner,
    vendor_id: owner,
    document_id: z.string(),
    title: z.string().trim().min(1),
    price: z.number().finite().positive(),
    discount: z.number().finite().nonnegative(),
    discountRatio: z.number().finite().min(0).max(100).nullable(),
    stock: z.number().finite().nonnegative().optional(),
    no_stock: z.boolean().optional(),
    is_out_of_stock: z.boolean().optional(),
    menu_category_title: z.string().nullable().optional(),
    images: z
      .array(z.object({ main: z.string().nullable().optional() }))
      .optional(),
  })
  .passthrough();
type Page = z.infer<typeof pageSchema>["data"];
type Plan = CampaignScope & { title: string; first: Page };
export type CampaignReport = CampaignScope & {
  reportedCount: number;
  rawCount: number;
  uniqueCount: number;
  duplicateCount: number;
  pageSizes: number[];
  terminal: boolean;
  qualifying: number;
  overlap: number;
  additional: number;
  excluded: Record<string, number>;
};
export type CampaignDiagnostics = {
  reports: CampaignReport[];
  omitted: {
    vendorCode: string;
    collectionId?: number;
    sectionType?: string;
    reason: string;
  }[];
};
const changed = (field: string) =>
  new CollectorError(
    "UPSTREAM_CHANGED",
    `Snapp campaign contract changed: ${field}`
  );
const incomplete = (field: string) =>
  new CollectorError(
    "INCOMPLETE_PAGINATION",
    `Snapp campaign coverage incomplete: ${field}`
  );

function collectionUrl(
  scope: CampaignScope,
  page: number,
  location: { latitude: number; longitude: number }
) {
  const url = new URL(
    `https://svc.snapp.market/express-search/product-list/${scope.collectionId}/vendor/${scope.vendorCode}`
  );
  Object.entries({
    variable: String(scope.collectionId),
    secondVariable: scope.vendorCode,
    lat: String(location.latitude),
    long: String(location.longitude),
    filters: "[]",
    page: String(page),
    page_size: "100",
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}
function parsePage(body: unknown, collectionId: number): Page {
  const parsed = pageSchema.safeParse(body);
  if (!parsed.success)
    throw changed("data.count / data.finalResult[].type/data");
  if (parsed.data.data.id !== collectionId) throw changed("data.id ownership");
  return parsed.data.data;
}

const nearbySchema = z.object({
  status: z.literal(true),
  data: z.object({
    count: z.number().int().nonnegative(),
    finalResult: z.array(z.object({ type: z.string(), data: z.unknown() })),
  }),
});
const nearbyStoreSchema = z.object({
  code: z.string().regex(/^[a-zA-Z0-9]+$/),
});
const conditionalMetadata = (value: Record<string, unknown>) =>
  value.is_pro === true ||
  value.requires_pro === true ||
  value.isPro === true ||
  value.conditions != null ||
  value.terms != null ||
  value.benefit != null;

export function planStoreCampaigns(
  read: SnappRead,
  location: { latitude: number; longitude: number },
  remainingRequests: () => number
) {
  return Effect.gen(function* () {
    const plans: Plan[] = [];
    const omitted: CampaignDiagnostics["omitted"] = [];
    const nearbyUrl = new URL(
      "https://svc.snapp.market/express-vendor/general/vendors-list"
    );
    Object.entries({
      lat: String(location.latitude),
      long: String(location.longitude),
      sort: "lowest_delivery_price",
      page: "0",
      page_size: String(MAX_DISCOVERED_STORES),
      is_home: "false",
      page_type: "vendor_list",
      "extra-filter[vendor_collection]": "-1",
    }).forEach(([key, value]) => nearbyUrl.searchParams.set(key, value));
    const nearby = nearbySchema.safeParse((yield* read(nearbyUrl)).body);
    if (!nearby.success)
      return yield* Effect.fail(
        changed("nearby data.count / data.finalResult")
      );
    const codes = new Set<string>();
    for (const entry of nearby.data.data.finalResult) {
      if (entry.type !== "VENDOR") {
        omitted.push({
          vendorCode: "",
          sectionType: entry.type,
          reason: "UNSUPPORTED_NEARBY_ENTRY",
        });
        continue;
      }
      const store = nearbyStoreSchema.safeParse(entry.data);
      if (!store.success) {
        omitted.push({ vendorCode: "", reason: "INVALID_NEARBY_VENDOR_CODE" });
        continue;
      }
      codes.add(store.data.code);
    }
    if (
      nearby.data.data.count > codes.size ||
      codes.size > MAX_DISCOVERED_STORES
    )
      omitted.push({
        vendorCode: "",
        reason: "NEARBY_DISCOVERY_PAGE_LIMIT: first 20 returned stores only",
      });
    const planningStart = remainingRequests();
    const resolvedOwners = new Map<number, string>();
    let reservedPages = 0;
    const canProbe = () =>
      planningStart - remainingRequests() < MAX_PLANNING_REQUESTS &&
      remainingRequests() > reservedPages + BASELINE_AND_RETRY_RESERVE;
    for (const vendorCode of [...codes].slice(0, MAX_DISCOVERED_STORES)) {
      if (!canProbe()) {
        omitted.push({ vendorCode, reason: "DISCOVERY_REQUEST_BUDGET" });
        continue;
      }
      const homeUrl = new URL(
        `https://svc.snapp.market/express-home/vendor/${vendorCode}`
      );
      Object.entries({
        variable: vendorCode,
        lat: String(location.latitude),
        long: String(location.longitude),
      }).forEach(([key, value]) => homeUrl.searchParams.set(key, value));
      const home = homeSchema.safeParse((yield* read(homeUrl)).body);
      if (!home.success) {
        omitted.push({
          vendorCode,
          reason:
            "HOME_SCHEMA: " +
            home.error.issues.map((issue) => issue.path.join(".")).join(","),
        });
        continue;
      }
      const info = home.data.vendorInfo;
      if (info.code !== vendorCode) {
        omitted.push({ vendorCode, reason: "HOME_VENDOR_CODE_MISMATCH" });
        continue;
      }
      if (
        info.deliveryData.id !== info.id ||
        info.deliveryData.detail.vendorId !== info.id
      ) {
        omitted.push({ vendorCode, reason: "HOME_DELIVERY_OWNER_MISMATCH" });
        continue;
      }
      if (!info.deliveryData.doesDeliver) {
        omitted.push({ vendorCode, reason: "DOES_NOT_DELIVER" });
        continue;
      }
      const priorCode = resolvedOwners.get(info.id);
      if (priorCode && priorCode !== vendorCode)
        return yield* Effect.fail(
          changed("two store codes resolve to the same vendorInfo.id")
        );
      resolvedOwners.set(info.id, vendorCode);
      const candidates = new Set<number>();
      for (const section of home.data.sections) {
        const sectionId = owner.safeParse(section.value);
        const diagnostic = {
          vendorCode,
          sectionType: section.type,
          ...(sectionId.success ? { collectionId: sectionId.data } : {}),
        };
        let reason: string | undefined;
        if (section.type !== "product-list")
          reason = "UNSUPPORTED_SECTION_TYPE";
        else if (conditionalMetadata(section) || section.config != null)
          reason = "CONDITIONAL_OR_UNVERIFIED_SECTION_CONFIG";
        else if (section.collection_type !== "default")
          reason = "UNSUPPORTED_COLLECTION_TYPE";
        else if (!sectionId.success) reason = "INVALID_COLLECTION_ID";
        if (reason) omitted.push({ ...diagnostic, reason });
        else candidates.add(sectionId.data!);
      }
      if (!candidates.size)
        omitted.push({
          vendorCode,
          reason: "NO_SUPPORTED_ORDINARY_COLLECTION",
        });
      for (const collectionId of [...candidates].sort((a, b) => a - b)) {
        if (plans.length >= MAX_COLLECTIONS) {
          omitted.push({
            vendorCode,
            collectionId,
            reason: "SUPPLEMENTARY_COLLECTION_LIMIT",
          });
          continue;
        }
        if (!canProbe()) {
          omitted.push({
            vendorCode,
            collectionId,
            reason: "PLANNING_REQUEST_BUDGET",
          });
          continue;
        }
        const scope = { vendorId: info.id, vendorCode, collectionId };
        // Count is absent from home. Cache one planning page, then freeze all
        // admitted units before baseline collection and remaining enumeration.
        const probe = yield* read(collectionUrl(scope, 0, location)).pipe(
          Effect.flatMap((response) =>
            Effect.try({
              try: () => parsePage(response.body, collectionId),
              catch: (error) =>
                error instanceof CollectorError ? error : changed("page"),
            })
          ),
          Effect.map((first) => ({
            first,
            error: null as CollectorError | null,
          })),
          Effect.catch((error) =>
            [
              "UPSTREAM_CHANGED",
              "UPSTREAM_INVALID_JSON",
              "UPSTREAM_ERROR",
            ].includes(error.code)
              ? Effect.succeed({ first: null, error })
              : Effect.fail(error)
          )
        );
        if (!probe.first) {
          omitted.push({
            vendorCode,
            collectionId,
            reason: "UNSUPPORTED_PLANNING_RESPONSE: " + probe.error?.message,
          });
          continue;
        }
        const first = probe.first;
        if (
          first.count > 700 ||
          first.finalResult.length > 100 ||
          (first.count > first.finalResult.length &&
            first.finalResult.length !== 100) ||
          (first.count === 0 && first.finalResult.length !== 0) ||
          first.finalResult.length > first.count
        ) {
          omitted.push({
            vendorCode,
            collectionId,
            reason:
              "UNVERIFIED_OR_OVERSIZED_PAGINATION: maximum 700 rows / eight pages",
          });
          continue;
        }
        const additionalPages = Math.ceil(first.count / 100);
        if (
          remainingRequests() <
          reservedPages + additionalPages + BASELINE_AND_RETRY_RESERVE
        ) {
          omitted.push({
            vendorCode,
            collectionId,
            reason: "EXPECTED_COLLECTION_WORK_EXCEEDS_REMAINING_BUDGET",
          });
          continue;
        }
        reservedPages += additionalPages;
        plans.push({ ...scope, title: info.title, first });
      }
    }
    return { plans, omitted };
  });
}

export function enrichStoreCampaigns(
  read: SnappRead,
  location: { latitude: number; longitude: number; threshold: number },
  plans: Plan[],
  baseline: { vendorCount: number; productCount: number; deals: Offer[] },
  baselineProductKeys: Set<string>,
  baselineVendorIds: Set<string>,
  omitted: CampaignDiagnostics["omitted"]
) {
  return Effect.gen(function* () {
    const offers = new Map(
      baseline.deals.map((deal) => [
        deal.key,
        {
          ...deal,
          provenance: ["snapp:market_party"],
          observedAt: new Date().toISOString(),
        },
      ])
    );
    const productKeys = new Set(baselineProductKeys);
    const vendorIds = new Set(baselineVendorIds);
    const reports: CampaignReport[] = [];
    for (const plan of plans) {
      const report: CampaignReport = {
        vendorId: plan.vendorId,
        vendorCode: plan.vendorCode,
        collectionId: plan.collectionId,
        reportedCount: plan.first.count,
        rawCount: 0,
        uniqueCount: 0,
        duplicateCount: 0,
        pageSizes: [],
        terminal: false,
        qualifying: 0,
        overlap: 0,
        additional: 0,
        excluded: {},
      };
      const rows = new Map<
        string,
        { signature: string; offer: Offer | null }
      >();
      const fingerprints = new Set<string>();
      for (let page = 0; page < 8; page++) {
        const data =
          page === 0
            ? plan.first
            : yield* read(collectionUrl(plan, page, location)).pipe(
                Effect.flatMap((response) =>
                  Effect.try({
                    try: () => parsePage(response.body, plan.collectionId),
                    catch: (error) =>
                      error instanceof CollectorError ? error : changed("page"),
                  })
                )
              );
        if (data.count !== report.reportedCount)
          return yield* Effect.fail(incomplete("data.count drift"));
        const count = data.finalResult.length;
        report.pageSizes.push(count);
        if (count === 0) {
          if (report.rawCount !== report.reportedCount)
            return yield* Effect.fail(
              incomplete("empty terminal before reported count")
            );
          report.terminal = true;
          break;
        }
        if (count > 100)
          return yield* Effect.fail(incomplete("page_size=100 not honored"));
        const fingerprint = JSON.stringify(
          data.finalResult
            .map((row) => [row.data.id, row.data.vendor_id])
            .sort()
        );
        if (fingerprints.has(fingerprint))
          return yield* Effect.fail(incomplete("replayed page"));
        fingerprints.add(fingerprint);
        report.rawCount += count;
        if (report.rawCount > report.reportedCount)
          return yield* Effect.fail(incomplete("rows exceed reported count"));
        for (const entry of data.finalResult) {
          const parsed = productSchema.safeParse(entry.data);
          if (!parsed.success)
            return yield* Effect.fail(
              changed(
                "product: " +
                  parsed.error.issues
                    .map((issue) => issue.path.join("."))
                    .join(",")
              )
            );
          // This route uses null for undiscounted rows. A zero discount amount
          // establishes zero percent; a missing ratio on a positive benefit is
          // unknown and must never be promoted into threshold coverage.
          if (parsed.data.discountRatio === null && parsed.data.discount > 0)
            return yield* Effect.fail(
              changed("discountRatio is null for a positive discount")
            );
          const p: z.infer<typeof productSchema> & { discountRatio: number } = {
            ...parsed.data,
            discountRatio: parsed.data.discountRatio ?? 0,
          };
          if (
            p.vendor_id !== plan.vendorId ||
            p.document_id !== `${p.id}-${plan.vendorId}`
          )
            return yield* Effect.fail(
              changed("vendor_id / document_id ownership")
            );
          // If a future response also carries nested ownership, never trust two
          // conflicting identities just because the route was store-specific.
          const nested = p.vendor as
            { id?: unknown; code?: unknown } | undefined;
          if (
            nested &&
            (nested.id !== plan.vendorId ||
              (nested.code !== undefined && nested.code !== plan.vendorCode))
          )
            return yield* Effect.fail(
              changed("vendor.id / vendor.code ownership")
            );
          if (p.sub_vendor_id != null)
            return yield* Effect.fail(
              changed("sub_vendor_id ownership is unverified")
            );
          if (
            p.discount > p.price ||
            Math.abs(p.discountRatio - (p.discount / p.price) * 100) > 1
          )
            return yield* Effect.fail(
              changed("price / discount / discountRatio agreement")
            );
          const key = `${plan.vendorId}:${p.id}`;
          const signature = JSON.stringify([
            p.price,
            p.discount,
            p.discountRatio,
            p.stock,
            p.no_stock,
            p.is_out_of_stock,
            p.title,
            p.is_pro,
            p.requires_pro,
            p.isPro,
            p.conditions,
            p.terms,
            p.benefit,
          ]);
          const prior = rows.get(key);
          if (prior) {
            if (prior.signature !== signature)
              return yield* Effect.fail(
                incomplete("conflicting repeated price/stock/identity")
              );
            report.duplicateCount++;
            continue;
          }
          let reason: string | undefined;
          if (p.stock === undefined) reason = "UNKNOWN_STOCK";
          else if (
            p.no_stock === true ||
            p.is_out_of_stock === true ||
            p.stock <= 0
          )
            reason = "OUT_OF_STOCK";
          // Retain the existing ordinary inline-discount rule. Explicit benefit
          // restrictions must not be promoted into applicable ordinary offers.
          else if (
            p.is_pro === true ||
            p.requires_pro === true ||
            p.isPro === true ||
            p.conditions != null ||
            p.terms != null ||
            p.benefit != null
          )
            reason = "UNVERIFIED_CONDITIONAL_BENEFIT";
          else if (
            !isEligibleDeal(p.discountRatio, true, p.stock, location.threshold)
          )
            reason = "BELOW_THRESHOLD";
          const offer: Offer | null = reason
            ? null
            : {
                key,
                productVariationId: String(p.id),
                vendorId: String(plan.vendorId),
                title: p.title,
                image: p.images?.[0]?.main ?? null,
                vendorTitle: plan.title,
                vendorCode: plan.vendorCode,
                categoryTitle: p.menu_category_title ?? null,
                priceRials: p.price,
                discountRials: p.discount,
                finalPriceRials: p.price - p.discount,
                discountRatio: p.discountRatio,
                stock: p.stock!,
                benefit: {
                  kind: "standard_discount",
                  identity: "ordinary",
                  applicable: true,
                  terms: null,
                },
                observedAt: new Date().toISOString(),
                provenance: [
                  `snapp:store_campaign:${plan.vendorId}:${plan.collectionId}`,
                ],
              };
          if (reason)
            report.excluded[reason] = (report.excluded[reason] ?? 0) + 1;
          rows.set(key, { signature, offer });
          productKeys.add(key);
        }
      }
      if (!report.terminal)
        return yield* Effect.fail(
          incomplete("eight-page cap without empty terminal")
        );
      report.uniqueCount = rows.size;
      const baselineKeys = new Set(baseline.deals.map((offer) => offer.key));
      for (const [key, { offer }] of rows) {
        if (!offer) continue;
        report.qualifying++;
        if (baselineKeys.has(key)) report.overlap++;
        else if (!offers.has(key)) report.additional++;
        const prior = offers.get(key);
        // Retain the complete baseline tuple on overlap, combining provenance.
        // No cheap price / summed stock assembled from different observations.
        offers.set(
          key,
          prior
            ? {
                ...prior,
                provenance: [
                  ...new Set([...prior.provenance, ...offer.provenance!]),
                ].sort(),
              }
            : {
                ...offer,
                provenance: offer.provenance!,
                observedAt: offer.observedAt!,
              }
        );
      }
      vendorIds.add(String(plan.vendorId));
      reports.push(report);
    }
    return {
      vendorCount: vendorIds.size,
      productCount: productKeys.size,
      deals: [...offers.values()],
      campaignResearch: {
        baselineEligible: baseline.deals.length,
        enrichedEligible: offers.size,
        reports,
        omitted,
      },
    };
  });
}
