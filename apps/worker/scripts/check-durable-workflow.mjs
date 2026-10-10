import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Isolated actual workerd Workflow + D1. All outbound provider responses are fixtures.
const require = createRequire(import.meta.url),
  tooling = createRequire(require.resolve("wrangler"));
const { Miniflare, Response } = tooling("miniflare"),
  { build } = tooling("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "better-buy-workflow-"));
const modulePath = (p) =>
  JSON.stringify(path.join(root, p).replaceAll("\\", "/"));
const bundle = path.join(temporary, "worker.mjs");
await build({
  stdin: {
    contents: `
 import {Store} from ${modulePath("src/store.ts")};
 import {beginDurableScan} from ${modulePath("src/durable/service.ts")};
 export {ScanWorkflow} from ${modulePath("src/workflows/scan.ts")};
 export default {async fetch(req,env){const url=new URL(req.url);const store=new Store(env.DB,"fixture-owner",env.BOX_KEY);
  if(url.pathname==="/start"){const source=url.searchParams.get("source")??"snappmarket";const location=await store.createLocation({name:"Fixture",latitude:35.7,longitude:51.4});return Response.json(await beginDurableScan(env,"fixture-owner",{locationId:location.id,source,mode:"partial",threshold:source==="okala"?20:40},crypto.randomUUID()));}
  const scan=await store.scan(url.searchParams.get("scan"));const instance=await env.SCAN_WORKFLOW.get("scan-"+scan.id);
  if(url.pathname==="/pause")await instance.pause();if(url.pathname==="/resume")await instance.resume();
  return Response.json({scan,engine:await instance.status(),offers:await store.deals(scan.id)});
 }};`,
    resolveDir: root,
    sourcefile: "workflow-fixture.ts",
  },
  outfile: bundle,
  bundle: true,
  platform: "browser",
  format: "esm",
  external: ["cloudflare:workers", "cloudflare:workflows", "node:*"],
  target: "es2022",
});
let snappPages = 0,
  outbound = 0;
const devices = new Set();
const runtime = new Miniflare({
  modules: true,
  compatibilityDate: "2026-08-08",
  compatibilityFlags: ["nodejs_compat"],
  script: await readFile(bundle, "utf8"),
  d1Databases: ["DB"],
  bindings: {
    BOX_KEY: "fixture-only",
    SNAPP_STORE_CAMPAIGNS_ENABLED: "false",
    SCAN_WORKFLOW_CONCURRENCY: "1",
  },
  workflows: {
    SCAN_WORKFLOW: { name: "fixture-scan", className: "ScanWorkflow" },
  },
  outboundService: async (request) => {
    outbound++;
    const url = new URL(request.url);
    if (url.hostname === "svc.snapp.market") {
      devices.add(url.searchParams.get("UDID"));
      if (url.pathname.includes("oauth2"))
        return Response.json({
          status: true,
          data: { access_token: "fixture-only", expires_in: 1000 },
        });
      if (++snappPages === 1)
        return new Response(null, {
          status: 429,
          headers: { "retry-after": "2" },
        });
      const p = Number(url.searchParams.get("page"));
      return Response.json({
        status: true,
        data: {
          total_count: 2,
          vendors: [
            {
              vendor_id: p + 1,
              products: [
                {
                  vendorId: p + 1,
                  productVariationId: p + 10,
                  title: `Fixture ${p} 1 L`,
                  vendorTitle: "Store",
                  price: 100000,
                  discount: 50000,
                  discountRatio: 50,
                  stock: 1,
                },
              ],
            },
          ],
        },
      });
    }
    assert.equal(url.hostname, "apigateway.okala.com");
    if (url.pathname.endsWith("/nearby"))
      return Response.json({
        success: true,
        data: {
          stores: [
            { storeId: 5, isActive: true, isExist: true, isServes: true },
          ],
        },
      });
    if (url.pathname.endsWith("/multi-store"))
      return Response.json({
        carousel: { id: 7 },
        hasNextPage: false,
        entities: [
          {
            storeId: 5,
            storeName: "Store",
            products: [
              {
                storeId: 5,
                storeName: "Store",
                id: 2,
                name: "Fixture milk 1 L",
                price: 10000,
                okPrice: 7000,
                discountPercent: 30,
                hasQuantity: true,
                quantity: 1,
              },
            ],
          },
        ],
      });
    return Response.json({
      success: true,
      carousels: [{ isMulti: true, id: 7 }],
    });
  },
});
const call = async (route) =>
  (await runtime.dispatchFetch("http://fixture" + route)).json();
const poll = async (test, route) => {
  let last;
  for (let n = 0; n < 150; n++) {
    const value = await call(route);
    last = value;
    if (test(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log({
    engine: last.engine.status,
    scan: last.scan.status,
    phase: last.scan.execution.phase,
    attempts: last.scan.execution.attemptCount,
    outbound,
  });
  throw new Error("Fixture Workflow did not reach expected state");
};
try {
  const db = await runtime.getD1Database("DB");
  for (const name of (await readdir(path.join(root, "migrations")))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    for (const sql of (
      await readFile(path.join(root, "migrations", name), "utf8")
    )
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  const snapp = await call("/start");
  await poll(
    (v) => snappPages === 1 && v.scan.execution.attemptCount === 2,
    `/status?scan=${snapp.id}`
  );
  await call(`/pause?scan=${snapp.id}`);
  await poll((v) => v.engine.status === "paused", `/status?scan=${snapp.id}`);
  await call(`/resume?scan=${snapp.id}`);
  const completed = await poll(
    (v) => v.scan.status === "succeeded",
    `/status?scan=${snapp.id}`
  );
  assert.equal(completed.offers.length, 2);
  assert.equal(completed.scan.execution.attemptCount, 5);
  assert.equal(completed.scan.execution.completedPages, 2);
  assert.equal(devices.size, 1);
  assert.equal(outbound, 5);
  assert.equal(
    completed.engine.output === undefined ||
      !JSON.stringify(completed.engine.output).includes("fixture-only"),
    true
  );
  const okala = await call("/start?source=okala");
  const optional = await poll(
    (v) => v.scan.status === "succeeded",
    `/status?scan=${okala.id}`
  );
  assert.equal(optional.scan.threshold, 30);
  assert.equal(optional.offers.length, 1);
  assert.equal(optional.scan.execution.attemptCount, 3);
  const projected = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM product_projection_scans WHERE ready=1"
    )
    .first();
  assert.equal(projected.count, 2);
  console.log(
    "Actual local Workflow/D1 checks passed: retry sleep, pause/resume, stable device, Snapp and Okala pages, staging and projection publication."
  );
} finally {
  await runtime.dispose();
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  await rm(temporary, { recursive: true, force: true });
}
