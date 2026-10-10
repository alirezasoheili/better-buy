import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

// Isolated workerd D1, never the user's local or remote database.
const require = createRequire(import.meta.url);
const tooling = createRequire(require.resolve("wrangler"));
const { Miniflare } = tooling("miniflare");
const { build } = tooling("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(
  path.join(tmpdir(), "better-buy-store-campaign-")
);
const runtime = new Miniflare({
  modules: true,
  compatibilityDate: "2026-08-08",
  script: "export default { fetch() { return new Response('ok'); } }",
  d1Databases: ["DB"],
});
try {
  const bundle = path.join(temporary, "store.mjs");
  await build({
    entryPoints: [path.join(root, "src/store.ts")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { Store } = await import(pathToFileURL(bundle).href);
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
  const store = new Store(db, "owner", "fixture-key");
  const location = await store.createLocation({
    name: "Original",
    latitude: 35.7,
    longitude: 51.4,
    isDefault: true,
  });
  const id = await store.createScan(location.id, 40, "snappmarket", "partial");
  await store.markRunning(id);
  const scopes = [
    { vendorId: 114458, vendorCode: "pz91qe", collectionId: 901 },
    { vendorId: 114444, vendorCode: "3kjwqk", collectionId: 902 },
  ];
  await store.freezeSnappManifest(id, [...scopes, scopes[0]]);
  const scan = await store.scan(id);
  assert.deepEqual(scan.context.manifest.storeCampaigns, [...scopes].reverse());
  assert.deepEqual(scan.context.manifest.collectionIds, [901, 902]);
  await assert.rejects(store.freezeSnappManifest(id, scopes), /already frozen/);
  await assert.rejects(
    new Store(db, "other", "fixture-key").freezeSnappManifest(id, scopes),
    /not active/
  );
  const offer = {
    key: "114458:2",
    productVariationId: "2",
    vendorId: "114458",
    title: "Product",
    image: null,
    vendorTitle: "Store",
    vendorCode: "pz91qe",
    categoryTitle: null,
    priceRials: 100000,
    discountRials: 45000,
    finalPriceRials: 55000,
    discountRatio: 45,
    stock: 2,
    provenance: ["snapp:market_party", "snapp:store_campaign:114458:901"],
    benefit: {
      kind: "standard_discount",
      identity: "ordinary",
      applicable: true,
      terms: null,
    },
  };
  await store.succeed(id, { vendorCount: 2, productCount: 1 }, [offer]);
  assert.equal((await store.scan(id)).context.coverage, "complete");
  assert.deepEqual((await store.deals(id))[0].provenance, offer.provenance);
  const failed = await store.createScan(
    location.id,
    40,
    "snappmarket",
    "partial"
  );
  await store.markRunning(failed);
  await store.freezeSnappManifest(failed, scopes);
  assert.equal(
    (await store.scan(failed)).context.scopeHash,
    scan.context.scopeHash
  );
  await store.fail(failed, "INCOMPLETE_PAGINATION", "fixture");
  assert.equal((await store.scan(failed)).context.coverage, "incomplete");
  assert.deepEqual(await store.deals(failed), []);
  assert.equal((await store.deals(id)).length, 1);
  const rollback = await store.createScan(
    location.id,
    40,
    "snappmarket",
    "partial"
  );
  await store.markRunning(rollback);
  await store.succeed(rollback, { vendorCount: 1, productCount: 0 }, []);
  assert.notEqual(
    (await store.scan(rollback)).context.scopeHash,
    scan.context.scopeHash
  );
  assert.deepEqual(await store.deals(rollback), []);
  console.log(
    "Actual D1: frozen campaign scope, tenant guard, provenance, incomplete publication, prior history, and rollback passed"
  );
} finally {
  await runtime.dispose();
  await rm(temporary, { recursive: true, force: true });
}
