import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const installedChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH ?? (process.platform === "win32" && existsSync(installedChrome) ? installedChrome : undefined);

export default defineConfig({testDir:"./tests",fullyParallel:false,use:{baseURL:"http://127.0.0.1:3100",trace:"on-first-retry",launchOptions:executablePath?{executablePath}:undefined},projects:[{name:"desktop",use:{...devices["Desktop Chrome"]}},{name:"mobile",use:{...devices["Pixel 7"]}}],webServer:{command:"pnpm exec next dev -H 127.0.0.1 -p 3100",url:"http://127.0.0.1:3100",reuseExistingServer:true,timeout:120_000}});
