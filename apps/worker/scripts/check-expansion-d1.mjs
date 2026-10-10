import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

// Exercise the Store against workerd's actual D1 binding, without touching
// Wrangler's development DB or any remote data. Reuse the installed tooling.
const require = createRequire(import.meta.url);
const tooling = createRequire(require.resolve("wrangler"));
const { Miniflare } = tooling("miniflare");
const { build } = tooling("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "better-buy-d1-"));
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
  const offer = {
    key: "vendor:product",
    productVariationId: "product",
    vendorId: "vendor",
    title: "Product 500 g",
    image: null,
    vendorTitle: "Store",
    vendorCode: null,
    categoryTitle: null,
    priceRials: 100000,
    discountRials: 50000,
    finalPriceRials: 50000,
    discountRatio: 50,
    stock: 2,
  };
  const first = await store.createScan(
    location.id,
    40,
    "snappmarket",
    "partial"
  );
  await store.markRunning(first);
  assert.deepEqual(await store.deals(first), []);
  await assert.rejects(
    store.succeed(first, { vendorCount: 1, productCount: 2 }, [offer, offer])
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM deals WHERE scan_id=?")
        .bind(first)
        .first()
    ).count,
    0
  );
  assert.equal((await store.scan(first)).status, "running");
  await store.succeed(first, { vendorCount: 1, productCount: 1 }, [offer]);
  assert.equal((await store.deals(first))[0].state, "current");
  await store.updateLocation(location.id, { name: "Renamed" });
  assert.equal((await store.location(location.id)).coordinateRevision, 1);
  assert.equal((await store.scan(first)).locationName, "Original");
  const second = await store.createScan(
    location.id,
    40,
    "snappmarket",
    "partial"
  );
  await store.succeed(second, { vendorCount: 1, productCount: 0 }, []);
  assert.equal((await store.deals(second))[0].state, "no_longer_present");
  await store.updateLocation(location.id, { latitude: 35.71 });
  assert.equal((await store.location(location.id)).coordinateRevision, 2);
  const third = await store.createScan(
    location.id,
    40,
    "snappmarket",
    "partial"
  );
  await store.succeed(third, { vendorCount: 1, productCount: 0 }, []);
  assert.deepEqual(await store.deals(third), []);
  assert.equal(await new Store(db, "other", "fixture-key").scan(first), null);
  console.log(
    "Actual local D1: additive migrations, batch rollback, frozen context, revision, baseline compatibility and tenant isolation passed."
  );
} finally {
  await runtime.dispose();
  assert.equal(path.dirname(temporary), path.resolve(tmpdir()));
  assert.ok(path.basename(temporary).startsWith("better-buy-d1-"));
  await rm(temporary, { recursive: true, force: true });
}
