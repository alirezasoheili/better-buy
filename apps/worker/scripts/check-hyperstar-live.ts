// Read-only, dated evidence. Run a bundled copy from the repository root.
// Never write provider responses, coordinates, guest headers, or tokens to logs.
import { Effect } from "effect";
import { readFileSync, writeFileSync } from "node:fs";
import { collectDeals } from "../src/providers/snapp/collector";
import type { DealRecord } from "@better-buy/shared";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const original: { collectDeals: typeof collectDeals } = await import(
  pathToFileURL(resolve(".data/hyperstar/prechange-collector.mjs")).href
);

const selected = JSON.parse(
  readFileSync(".data/hyperstar/location.json", "utf8")
) as { latitude: number; longitude: number };
const locations = [
  { label: "selected-local-default", ...selected },
  {
    label: "second-location-research-control",
    latitude: 35.773643,
    longitude: 51.418311,
  },
  { label: "out-of-area-control", latitude: 35.4, longitude: 51.1 },
];
const evidence: unknown[] = [];
for (const { label, ...location } of locations) {
  const requests: {
    path: string;
    page: string | null;
    status?: number;
    ms: number;
    error?: string;
  }[] = [];
  const discovery: unknown[] = [];
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== "https://svc.snapp.market")
      throw new Error("Unexpected origin");
    const at = performance.now();
    const rec: (typeof requests)[number] = {
      path: url.pathname.startsWith("/market-party/")
        ? "/market-party/{coordinates}"
        : url.pathname,
      page: url.searchParams.get("page"),
      ms: 0,
    };
    requests.push(rec);
    try {
      const r = await fetch(input, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([
          init?.signal ?? AbortSignal.timeout(8000),
          AbortSignal.timeout(8000),
        ]),
      });
      rec.status = r.status;
      if (r.ok && /vendors-list|express-home\/vendor/.test(url.pathname)) {
        const body = await r.clone().json();
        if (url.pathname.includes("vendors-list"))
          discovery.push({
            kind: "nearby",
            hint: body.data?.single_super_mall
              ? {
                  code: body.data.single_super_mall.code,
                  title: body.data.single_super_mall.title,
                }
              : null,
            ordinaryCodes: body.data?.finalResult
              ?.filter((row: { type: string }) => row.type === "VENDOR")
              .map((row: { data: { code: string } }) => row.data.code),
          });
        else
          discovery.push({
            kind: "home",
            requestedCode: url.pathname.split("/").at(-1),
            id: body.vendorInfo?.id,
            code: body.vendorInfo?.code,
            title: body.vendorInfo?.title,
            isOutOfArea: body.vendorInfo?.isOutOfArea,
            delivery: {
              doesDeliver: body.vendorInfo?.deliveryData?.doesDeliver,
              id: body.vendorInfo?.deliveryData?.id,
              detailVendorId: body.vendorInfo?.deliveryData?.detail?.vendorId,
              isExpress: body.vendorInfo?.deliveryData?.isExpress,
              scheduleOption: body.vendorInfo?.deliveryData?.scheduleOption,
              deliveryStatus: body.vendorInfo?.deliveryData?.deliveryStatus,
            },
          });
      }
      return r;
    } catch {
      rec.error = "NETWORK_OR_TIMEOUT";
      throw new Error("Live request unavailable");
    } finally {
      rec.ms = Math.round(performance.now() - at);
    }
  };
  let baseline: { deals: Omit<DealRecord, "scanId" | "state">[] } | undefined;
  let baselineError: string | null = null;
  let originalEnriched:
    { deals: Omit<DealRecord, "scanId" | "state">[] } | undefined;
  let originalError: string | null = null;
  // Baseline is needed for actual overlap; an unsuccessful baseline is unknown.
  try {
    baseline = await Effect.runPromise(
      collectDeals({ ...location, threshold: 40, fetcher }).pipe(
        Effect.timeout("22 seconds")
      )
    );
  } catch {
    baselineError = "BASELINE_UNAVAILABLE";
  }
  try {
    originalEnriched = await Effect.runPromise(
      original.collectDeals({
        ...location,
        threshold: 40,
        storeCampaigns: true,
        fetcher,
      })
    );
  } catch {
    originalError = "PRECHANGE_ENRICHMENT_UNAVAILABLE";
  }
  const beforeEnrichment = requests.length;
  let comparison: unknown = null;
  let error: string | null = null;
  try {
    const r = await Effect.runPromise(
      collectDeals({
        ...location,
        threshold: 40,
        storeCampaigns: true,
        fetcher,
      })
    );
    const base = new Set(baseline?.deals.map((d) => d.key));
    const previous = new Set(originalEnriched?.deals.map((d) => d.key));
    const current = new Set(r.deals.map((d) => d.key));
    comparison = {
      eligible: r.deals.length,
      baselineEligible: baseline?.deals.length ?? null,
      actualAdditions: baseline
        ? r.deals.filter((d) => !base.has(d.key)).length
        : null,
      overlap: baseline ? r.deals.filter((d) => base.has(d.key)).length : null,
      prechangeEligible: originalEnriched?.deals.length ?? null,
      prechangeOverlap: originalEnriched
        ? r.deals.filter((d) => previous.has(d.key)).length
        : null,
      additionsBeyondExpansion: originalEnriched
        ? r.deals.filter((d) => !previous.has(d.key)).length
        : null,
      missingFromExpansion: originalEnriched
        ? originalEnriched.deals.filter((d) => !current.has(d.key)).length
        : null,
      diagnostics: "campaignResearch" in r ? r.campaignResearch : null,
    };
  } catch {
    error = "ENRICHED_SCAN_UNAVAILABLE";
  }
  // If guest acquisition is blocked, still probe the requested discovery route
  // anonymously once; don't infer absence from its gateway/access failure.
  if (!discovery.some((d) => (d as { kind: string }).kind === "nearby")) {
    const url = new URL(
      "https://svc.snapp.market/express-vendor/general/vendors-list"
    );
    Object.entries({
      lat: String(location.latitude),
      long: String(location.longitude),
      sort: "lowest_delivery_price",
      page: "0",
      page_size: "20",
      is_home: "false",
      page_type: "vendor_list",
      "extra-filter[vendor_collection]": "-1",
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    try {
      await fetcher(url, {});
    } catch {
      /* recorded as unknown */
    }
  }
  const record = {
    label,
    startedAt,
    finishedAt: new Date().toISOString(),
    threshold: 40,
    availability: error ? "unknown" : "verified-response",
    baselineError,
    originalError,
    error,
    comparison,
    discovery,
    requests,
    enrichmentRequests: requests.length - beforeEnrichment,
    elapsedMs: Math.round(performance.now() - start),
  };
  evidence.push(record);
  writeFileSync(
    ".data/hyperstar/live-comparison.json",
    JSON.stringify(evidence, null, 2)
  );
  console.log(
    JSON.stringify({
      label,
      availability: record.availability,
      baselineError,
      error,
      requests: requests.length,
      statuses: requests.map((r) => r.status ?? r.error),
      elapsedMs: record.elapsedMs,
    })
  );
}
