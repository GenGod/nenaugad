import type { NextConfig } from "next";
import { readConfig } from "./src/server/config.ts";

// `PHASE_PRODUCTION_SERVER` from next/constants, spelled out: that CommonJS path has no ESM
// export, so a native import of it fails (tests/unit/production-mode.test.ts pins the value).
const PRODUCTION_SERVER_PHASE = "phase-production-server";

const dev = process.env.NODE_ENV !== "production";
// Local starter policy. A production nonce-based CSP needs a separate task.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws://127.0.0.1:* ws://localhost:*" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join("; ");

// The e2e server (ATLAS_ENV=test, playwright.config.ts) compiles from scratch: a Turbopack
// dev cache that an earlier `next dev` on other code left in .next/dev makes its pages
// reload in a loop (E2E-001). It also skips Next's upgrade notice, which under a coding
// agent stops every other start mid-run whenever npm lists the installed Next.js in a
// security advisory, so an e2e result never depends on that check; `npm run dev` and
// `npm run build` keep it (owner decision 2026-11-02, kept by E6-001).
const testServer = process.env.ATLAS_ENV === "test";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    agentUpgrade: testServer ? false : "security",
    turbopackFileSystemCacheForDev: !testServer
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" }
      ]
    }];
  }
};

// `next start` exits 1 on a configuration that `readConfig` refuses, without answering a
// request (DEPLOY-002): it prints "Ready", loads this file, logs the code and stops. Next
// loads .env before this file. Without this the refusal came only from
// src/instrumentation.ts, which `next start` runs on the first request: the process stayed
// up and answered every request with 500. Dev and build keep their own paths.
export default function config(phase: string): NextConfig {
  if (phase === PRODUCTION_SERVER_PHASE) readConfig(process.env);
  return nextConfig;
}
