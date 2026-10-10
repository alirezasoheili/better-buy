import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Isolated workerd D1. No Wrangler development DB, accounts or providers.
const require = createRequire(import.meta.url);
const tooling = createRequire(require.resolve("wrangler"));
const { Miniflare } = tooling("miniflare");
const { build } = tooling("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "better-buy-products-"));
const runtime = new Miniflare({
  modules: true,
  compatibilityDate: "2026-08-08",
  script: "export default { fetch() { return new Response('ok') } }",
  d1Databases: ["DB"],
});
try {
  const bundle = path.join(directory, "projection.mjs");
  await build({
    entryPoints: [path.join(root, "src/saved-products.ts")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { materializeProducts, readProductPage, readOfferPage } = await import(
    pathToFileURL(bundle).href
  );
  const db = await runtime.getD1Database("DB");
  for (const name of (await readdir(path.join(root, "migrations")))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    for (const sql of (
      await readFile(path.join(root, "migrations", name), "utf8")
    )
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  }
  await db
    .prepare(
      "INSERT INTO locations(id,user_id,name,latitude,longitude,created_at,updated_at) VALUES('location','owner','Fixture',35.7,51.4,'2026-01-01','2026-01-01')"
    )
    .run();
  const measurements = [];
  for (const [name, products, stores] of [
    ["small", 30, 3],
    ["medium", 500, 4],
    ["large", 3000, 8],
  ]) {
    await db
      .prepare(
        "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at,finished_at) VALUES(?,'owner','location',40,'snappmarket','partial','succeeded','2026-10-10T00:00:00.000Z','2026-10-10T00:00:01.000Z')"
      )
      .bind(name)
      .run();
    let rows = [];
    for (let product = 0; product < products; product++)
      for (let vendor = 0; vendor < stores; vendor++) {
        const original = 100000 + vendor * 2000,
          ratio = 40 + (product % 20),
          discount = (original * ratio) / 100;
        rows.push({
          id: `${name}:${product}:${vendor}`,
          key: `store${vendor}:${product}`,
          product: String(product),
          vendor: `store${vendor}`,
          title: `کالای آزمایشی ${product} ۵۰۰ گرمی`,
          price: original,
          discount,
          final: original - discount,
          ratio,
        });
        if (rows.length === 100) {
          await insert(db, name, rows);
          rows = [];
        }
      }
    if (rows.length) await insert(db, name, rows);
    const before = performance.now();
    await materializeProducts(db, "owner", name);
    const projectionMs = performance.now() - before;
    const times = [];
    let page;
    for (let n = 0; n < 20; n++) {
      const start = performance.now();
      page = await readProductPage(db, "owner", name, {});
      times.push(performance.now() - start);
    }
    const payloadBytes = Buffer.byteLength(JSON.stringify({ data: page }));
    assert.ok(payloadBytes < 250000, "default summary page exceeds 250 KB");
    assert.equal(page.items.length, Math.min(50, products));
    assert.ok(
      page.items.every(
        (p) =>
          !Object.hasOwn(p, "vendors") && !Object.hasOwn(p, "conditionalOffers")
      )
    );
    const expanded = await readOfferPage(
      db,
      "owner",
      name,
      page.items[0].key,
      {}
    );
    assert.equal(expanded.items.length, stores);
    const search = await readProductPage(db, "owner", name, {
      q: "كالا ٥٠٠",
      sort: "price",
    });
    assert.equal(search.items.length, Math.min(50, products));
    const plan = (
      await db
        .prepare(
          "EXPLAIN QUERY PLAN SELECT group_key FROM saved_products WHERE user_id=? AND scan_id=? ORDER BY presence,rank_ratio,rank_discount,rank_price,group_key LIMIT 51"
        )
        .bind("owner", name)
        .all()
    ).results;
    assert.ok(
      plan.some((row) =>
        String(row.detail).includes("saved_products_discount")
      ),
      "rank query does not use its compound index"
    );
    times.sort((a, b) => a - b);
    measurements.push({
      name,
      products,
      offers: products * stores,
      projectionMs: Math.round(projectionMs),
      warmReadP50Ms: Math.round(times[9]),
      warmReadP95Ms: Math.round(times[18]),
      payloadBytes,
      index: "saved_products_discount",
    });
  }
  console.log(
    JSON.stringify(
      { runtime: "isolated local workerd D1", measurements },
      null,
      2
    )
  );
} finally {
  await runtime.dispose();
  await rm(directory, { recursive: true, force: true });
}
async function insert(db, scan, rows) {
  await db
    .prepare(
      `INSERT INTO deals(id,scan_id,deal_key,product_variation_id,vendor_id,title,vendor_title,price_rials,discount_rials,final_price_rials,discount_ratio,stock)
    SELECT json_extract(value,'$.id'),?,json_extract(value,'$.key'),json_extract(value,'$.product'),json_extract(value,'$.vendor'),json_extract(value,'$.title'),
    'Fixture store',json_extract(value,'$.price'),json_extract(value,'$.discount'),json_extract(value,'$.final'),json_extract(value,'$.ratio'),3 FROM json_each(?)`
    )
    .bind(scan, JSON.stringify(rows))
    .run();
}
