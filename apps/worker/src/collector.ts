import { z } from "zod";
import type { DealRecord } from "@better-buy/shared";

const productSchema = z
    .object({
        productVariationId: z.union([z.string(), z.number()]),
        price: z.number().nonnegative(),
        discountRatio: z.number(),
        title: z.string(),
        discount: z.number().nonnegative().default(0),
        image: z.string().nullable().optional(),
        main_image: z.string().nullable().optional(),
        vendorCode: z.string().nullable().optional(),
        vendorId: z.union([z.string(), z.number()]),
        vendorTitle: z.string(),
        menu_category_title: z.string().nullable().optional(),
        stock: z.number().default(0),
        is_out_of_stock: z.boolean().default(false),
    })
    .passthrough();
const vendorSchema = z
    .object({ vendor_id: z.union([z.string(), z.number()]), products: z.array(productSchema) })
    .passthrough();
const responseSchema = z.object({
    status: z.boolean(),
    data: z.object({ total_count: z.number().int().nonnegative(), vendors: z.array(vendorSchema) }),
});

export class CollectorError extends Error {
    constructor(
        public code: string,
        message: string,
    ) {
        super(message);
    }
}
export interface CollectInput {
    latitude: number;
    longitude: number;
    threshold: number;
    token: string;
    udid: string;
    appVersion: string;
    fetcher?: typeof fetch;
    onProgress?: (counts: { vendorCount: number; productCount: number }) => void;
}

export async function collectDeals(
    input: CollectInput,
): Promise<{ vendorCount: number; productCount: number; deals: Omit<DealRecord, "scanId" | "state">[] }> {
    const fetcher = input.fetcher ?? fetch,
        vendors = new Map<string, z.infer<typeof vendorSchema>>(),
        pageFingerprints = new Set<string>();
    let totalCount = Infinity;
    for (let page = 0; page < 50 && vendors.size < totalCount; page++) {
        const url = new URL(`https://svc.snapp.market/market-party/${input.latitude}/${input.longitude}`);
        Object.entries({
            deal_type: "supermarket",
            user_id: "0",
            isPro: "false",
            page: String(page),
            page_size: "100",
            client: "PWA",
            deviceType: "PWA",
            appVersion: input.appVersion,
            UDID: input.udid,
        }).forEach(([k, v]) => url.searchParams.set(k, v));
        let response: Response;
        try {
            response = await fetcher(url, {
                headers: {
                    accept: "application/json, text/plain, */*",
                    "accept-language": "fa-IR, fa;q=0.9,en;q=0.8",
                    authorization: `Bearer ${input.token}`,
                    origin: "https://snapp.market",
                    referer: "https://snapp.market/",
                    "user-agent": "Mozilla/5.0 BetterBuy/1.0",
                },
                signal: AbortSignal.timeout(30_000),
            });
        } catch {
            throw new CollectorError("NETWORK_ERROR", "ارتباط با اسنپ‌مارکت برقرار نشد");
        }
        if (response.status === 401 || response.status === 403)
            throw new CollectorError("AUTH_REJECTED", "توکن اسنپ‌مارکت پذیرفته نشد یا منقضی شده است");
        if (response.status === 429)
            throw new CollectorError("RATE_LIMITED", "اسنپ‌مارکت درخواست‌های اسکن را موقتاً محدود کرده است");
        if (!response.ok) throw new CollectorError("UPSTREAM_ERROR", `پاسخ ناموفق اسنپ‌مارکت (${response.status})`);
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            throw new CollectorError("UPSTREAM_CHANGED", "پاسخ اسنپ‌مارکت JSON معتبر نبود");
        }
        const parsed = responseSchema.safeParse(body);
        if (!parsed.success || !parsed.data.status)
            throw new CollectorError("UPSTREAM_CHANGED", "ساختار پاسخ اسنپ‌مارکت تغییر کرده است");
        totalCount = parsed.data.data.total_count;
        const pageVendors = parsed.data.data.vendors,
            fingerprint = pageVendors
                .map((v) => String(v.vendor_id))
                .sort()
                .join(",");
        if (pageVendors.length === 0) {
            if (vendors.size < totalCount)
                throw new CollectorError("INCOMPLETE_PAGINATION", "همه فروشگاه‌ها دریافت نشدند");
            break;
        }
        if (pageFingerprints.has(fingerprint))
            throw new CollectorError("INCOMPLETE_PAGINATION", "صفحه تکراری از اسنپ‌مارکت دریافت شد");
        pageFingerprints.add(fingerprint);
        for (const vendor of pageVendors) vendors.set(String(vendor.vendor_id), vendor);
        const productKeys = new Set<string>();
        for (const vendor of vendors.values())
            for (const p of vendor.products) productKeys.add(`${p.vendorId}:${p.productVariationId}`);
        input.onProgress?.({ vendorCount: vendors.size, productCount: productKeys.size });
    }
    if (vendors.size < totalCount)
        throw new CollectorError("INCOMPLETE_PAGINATION", `تنها ${vendors.size} از ${totalCount} فروشگاه دریافت شد`);
    const products = new Map<string, z.infer<typeof productSchema>>();
    for (const vendor of vendors.values())
        for (const p of vendor.products) products.set(`${p.vendorId}:${p.productVariationId}`, p);
    const deals = [...products.entries()]
        .filter(([, p]) => p.discountRatio >= input.threshold && !p.is_out_of_stock && p.stock > 0)
        .map(([key, p]) => ({
            key,
            productVariationId: String(p.productVariationId),
            vendorId: String(p.vendorId),
            title: p.title,
            image: p.image ?? p.main_image ?? null,
            vendorTitle: p.vendorTitle,
            vendorCode: p.vendorCode ?? null,
            categoryTitle: p.menu_category_title ?? null,
            priceRials: p.price,
            discountRials: p.discount,
            finalPriceRials: Math.max(0, p.price - p.discount),
            discountRatio: p.discountRatio,
            stock: p.stock,
        }));
    return { vendorCount: vendors.size, productCount: products.size, deals };
}
