import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: "list",
  // Visual baselines are recorded on Windows (*-win32.png). Elsewhere, such as
  // the Linux CI runner, every functional assertion still runs and only the
  // pixel comparisons are skipped instead of failing on missing baselines.
  ignoreSnapshots: process.platform !== "win32",
  use: { baseURL: "http://127.0.0.1:3100", trace: "off", screenshot: "only-on-failure" },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      ATLAS_ENV: "test", DATA_BACKEND: "fixture",
      LIVE_AI_ENABLED: "false", LIVE_SOURCES_ENABLED: "false",
      UPLOADS_ENABLED: "true", NEXT_TELEMETRY_DISABLED: "1"
    }
  },
  projects: [
    { name: "desktop", use: { browserName:"chromium", viewport:{ width:1440, height:1000 } } },
    { name: "mobile", use: { browserName:"chromium", viewport:{ width:390, height:844 } } },
    { name: "narrow", use: { browserName:"chromium", viewport:{ width:320, height:800 } } }
  ]
});
