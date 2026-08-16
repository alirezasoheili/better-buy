import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  ...(process.env.CLOUDFLARE_WORKER ? { output: "export" } : {}),
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
};
export default nextConfig;
