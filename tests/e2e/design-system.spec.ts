import { expect, test } from "@playwright/test";

// DS-001 coverage: brand assets, security headers and the semantic shell
// that screenshots cannot assert. The visual layer itself lives in
// visual.spec.ts; behavior contracts live in catalog/s2/s2b/s3.

test("brand assets and the 64-glyph icon sprite are served", async ({ request }) => {
  const wordmark = await request.get("/brand/wordmark.png");
  expect(wordmark.status()).toBe(200);
  expect(wordmark.headers()["content-type"]).toContain("image/png");
  const favicon = await request.get("/brand/favicon.svg");
  expect(favicon.status()).toBe(200);
  const sprite = await request.get("/icons/nenaugad.sprite.svg");
  expect(sprite.status()).toBe(200);
  const body = await sprite.text();
  expect([...body.matchAll(/<symbol id="ng-/gu)].length).toBe(64);
  // The sprite is a static decorative document: no scripts, no handlers.
  expect(body).not.toMatch(/<script/iu);
  expect(body).not.toMatch(/\son[a-z]+\s*=/iu);
});

test("starter security headers survive the redesign", async ({ request }) => {
  const home = await request.get("/");
  expect(home.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["x-robots-tag"]).toContain("noindex");
  expect(home.headers()["referrer-policy"]).toBe("no-referrer");
});

test("footer carries the mandatory ESCO attribution and the adaptation note", async ({ page }) => {
  // ESCO-001: the licence requires this exact sentence plus a clear marking of
  // adapted versions; both live in the footer, so they are asserted here.
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer).toContainText("This service uses the ESCO classification of the European Commission.");
  await expect(footer).toContainText("адаптированная версия ESCO");
});

test("header lockup, favicon wiring and decorative icons", async ({ page }, testInfo) => {
  await page.goto("/jobs");
  await expect(page.locator(".brand-logo")).toHaveAttribute("alt", "ненаугад");
  await expect(page.locator(".brand-logo")).toHaveAttribute("width", "208");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /favicon\.svg$/u);
  // Brand glyphs are decorative; action names live on buttons and links.
  const firstFactIcon = page.locator(".job-card .job-facts svg.ng-icon").first();
  await expect(firstFactIcon).toHaveAttribute("aria-hidden", "true");
  await expect(firstFactIcon.locator("use")).toHaveAttribute("href", /\/icons\/nenaugad\.sprite\.svg#ng-/u);
  if (testInfo.project.name === "desktop") {
    await expect(page.locator(".site-nav a", { hasText: "Вакансии" }))
      .toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Только удалённо")).toBeVisible();
  } else {
    // Small viewports replace the header nav with the bottom bar.
    await expect(page.locator(".site-nav")).toBeHidden();
    await expect(page.getByText("Только удалённо")).toBeHidden();
  }
});

test("condition map lists five honest groups; unknown geography turns amber", async ({ page }) => {
  await page.goto("/jobs/fern-frontend");
  await expect(page.locator(".condition-row")).toHaveCount(5);
  await expect(page.locator(".condition-icon.review")).toHaveCount(0);

  await page.goto("/jobs/orbit-product");
  const geographyRow = page.locator(".condition-row", { hasText: "Страны найма" });
  await expect(geographyRow.locator(".badge.review")).toContainText("Нужно уточнить у работодателя");
  await expect(geographyRow.locator(".condition-icon.review")).toBeVisible();
});

test("bottom navigation appears only on small viewports and navigates", async ({ page }, testInfo) => {
  await page.goto("/");
  const mobileNav = page.getByRole("navigation", { name: "Мобильная навигация" });
  if (testInfo.project.name === "desktop") {
    await expect(mobileNav).toBeHidden();
    return;
  }
  await expect(mobileNav).toBeVisible();
  await mobileNav.getByRole("link", { name: "Профиль" }).click();
  await expect(page).toHaveURL(/\/profile$/u);
});

test("letter entry redirects anonymous users to login", async ({ page }) => {
  await page.goto("/letters/new?mode=general");
  await expect(page).toHaveURL(/\/login$/u);
});
