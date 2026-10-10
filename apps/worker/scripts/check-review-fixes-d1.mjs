import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// All persistence is isolated actual workerd D1; no user database or provider GET.
const require = createRequire(import.meta.url);
const tooling = createRequire(require.resolve("wrangler"));
const { Miniflare } = tooling("miniflare");
const { build } = tooling("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "better-buy-review-"));
const runtime = new Miniflare({
  modules: true,
  compatibilityDate: "2026-08-08",
  script: "export default {fetch(){return new Response('fixture')}}",
  d1Databases: ["DB"],
});
try {
  const bundle = path.join(temporary, "review.mjs");
  await build({
    stdin: {
      contents: `
    export {Store} from "./src/store.ts";
    export {DurableRepository} from "./src/durable/repository.ts";
    export {readDurableComparison} from "./src/durable/comparison.ts";
    export {materializeProducts} from "./src/saved-products.ts";
  `,
      resolveDir: root,
      sourcefile: "review-fixture.ts",
    },
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const {
    Store,
    DurableRepository,
    readDurableComparison,
    materializeProducts,
  } = await import(pathToFileURL(bundle).href);
  const db = await runtime.getD1Database("DB");
  for (const name of (await readdir(path.join(root, "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(path.join(root, "migrations", name), "utf8");
    for (const statement of sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  const store = new Store(db, "fixture-owner", "fixture-key");
  const repo = new DurableRepository(db, "fixture-key");
  const location = await store.createLocation({
    name: "Fixture",
    latitude: 35.7,
    longitude: 51.4,
  });
  const scan = await repo.reserve(
    "fixture-owner",
    {
      locationId: location.id,
      source: "snappmarket",
      threshold: 40,
      mode: "partial",
    },
    crypto.randomUUID(),
    true
  );
  await repo.started(scan.id);
  await repo.saveDiscovery(
    scan.id,
    "first-response",
    { fixture: true },
    "2026-10-10T08:00:00.000Z"
  );
  await repo.saveDiscovery(
    scan.id,
    "first-response",
    { fixture: true },
    "2026-10-10T08:02:00.000Z"
  );
  assert.equal(
    await repo.discoveryObservedAt(scan.id, "first-response"),
    "2026-10-10T08:00:00.000Z"
  );
  await repo.savePlanningAudit(scan.id, [
    {
      vendorCode: "omittedStore",
      collectionId: 8,
      sectionType: "product-list",
      reason: "CONDITIONAL_OR_UNVERIFIED_SECTION_CONFIG",
    },
  ]);
  const units = [
    { id: "market-party", kind: "market_party" },
    { id: "campaign-1-2", kind: "store_campaign" },
  ];
  await repo.freeze(scan.id, units, scan.context.manifest);
  const offer = {
    key: "1:2",
    productVariationId: "2",
    vendorId: "1",
    title: "Milk 1 L",
    image: null,
    vendorTitle: "Shop",
    vendorCode: null,
    categoryTitle: null,
    priceRials: 100000,
    discountRials: 50000,
    finalPriceRials: 50000,
    discountRatio: 50,
    stock: 2,
    observedAt: "2026-10-10T08:00:00.000Z",
    provenance: ["snapp:market_party"],
  };
  const page = {
    offers: [offer],
    products: ["1:2"],
    vendors: ["1"],
    identities: ["1:2"],
    reportedTotal: 1,
    rowCount: 1,
    terminal: true,
    terminalEvidence: "fixture_terminal",
    fingerprint: "baseline",
  };
  await repo.stage(scan.id, units[0], 0, page);
  const newer = {
    ...page,
    fingerprint: "campaign",
    offers: [
      {
        ...offer,
        priceRials: 200000,
        discountRials: 100000,
        finalPriceRials: 100000,
        stock: 7,
        observedAt: "2026-10-10T08:01:00.000Z",
        provenance: ["snapp:store_campaign:1:2"],
      },
    ],
  };
  await repo.stage(scan.id, units[1], 0, newer);
  await repo.stage(scan.id, units[1], 0, newer);
  assert.deepEqual(await store.deals(scan.id), []);
  await materializeProducts(db, "fixture-owner", scan.id);
  await repo.publish(scan.id);
  const published = await store.deals(scan.id);
  assert.equal(published.length, 1);
  assert.deepEqual(
    [
      published[0].priceRials,
      published[0].discountRials,
      published[0].finalPriceRials,
      published[0].stock,
    ],
    [200000, 100000, 100000, 7]
  );
  assert.equal(published[0].observedAt, "2026-10-10T08:01:00.000Z");
  assert.deepEqual(published[0].provenance, [
    "snapp:market_party",
    "snapp:store_campaign:1:2",
  ]);
  const comparison = await readDurableComparison(db, "fixture-owner", scan.id);
  assert.equal(comparison.conflictingOfferCount, 1);
  assert.deepEqual(comparison.conflictingOfferIdentities, ["1:2"]);
  assert.equal(comparison.planning.omittedCount, 1);
  assert.equal(comparison.campaigns.length, 1);
  assert.equal(
    comparison.omitted[0].reason,
    "CONDITIONAL_OR_UNVERIFIED_SECTION_CONFIG"
  );
  assert.equal(await readDurableComparison(db, "another-owner", scan.id), null);
  assert.deepEqual(
    (await store.scans())[0].execution,
    (await store.scan(scan.id)).execution
  );
  console.log(
    "Actual local D1 review checks passed: latest coherent tuple, provenance/conflict audit, immutable response time, omitted candidates, replay, publication and scan projection parity."
  );
} finally {
  await runtime.dispose();
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  await rm(temporary, { recursive: true, force: true });
}
