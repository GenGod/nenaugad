import type { NextConfig } from "next";

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
// reload in a loop (E2E-001).
const testServer = process.env.ATLAS_ENV === "test";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { turbopackFileSystemCacheForDev: !testServer },
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
export default nextConfig;
