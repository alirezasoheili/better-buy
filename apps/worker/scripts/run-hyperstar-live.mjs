// Read-only provider comparison; local and remote scan databases are never mutated.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
process.chdir(root);
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))(
  "esbuild"
);
mkdirSync(".data/hyperstar", { recursive: true });
const directory =
  "apps/worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = readdirSync(directory).find(
  (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite"
);
if (!file) throw new Error("No configured local location database");
const db = new DatabaseSync(`${directory}/${file}`, { readOnly: true });
const location = db
  .prepare(
    "SELECT latitude,longitude FROM locations ORDER BY is_default DESC,created_at LIMIT 1"
  )
  .get();
db.close();
if (!location) throw new Error("No selected local default location");
writeFileSync(".data/hyperstar/location.json", JSON.stringify(location));
const ref = process.env.HYPERSTAR_BASELINE_REF ?? "HEAD";
await build({
  entryPoints: ["apps/worker/src/providers/snapp/collector.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".data/hyperstar/prechange-collector.mjs",
  plugins: [
    {
      name: "original-discovery",
      setup(builder) {
        builder.onLoad(
          { filter: /providers[\\/]snapp[\\/](collector|storeCampaigns)\.ts$/ },
          (args) => ({
            contents: execFileSync(
              "git",
              [
                "show",
                `${ref}:apps/worker/src/providers/snapp/${args.path.split(/[\\/]/).at(-1)}`,
              ],
              { encoding: "utf8" }
            ),
            loader: "ts",
            resolveDir: dirname(args.path),
          })
        );
      },
    },
  ],
});
await build({
  entryPoints: ["apps/worker/scripts/check-hyperstar-live.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".data/hyperstar/live-comparison.mjs",
});
if (process.argv.includes("--bundle-only")) {
  console.log(
    "Live comparison bundles are ready; no provider request was sent."
  );
} else {
  await import(
    new URL("../../../.data/hyperstar/live-comparison.mjs", import.meta.url)
      .href
  );
}
