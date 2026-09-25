import { expect, test } from "@playwright/test";

test("feedback API contract: anonymous 401, invalid reason 400, unknown snapshot 404", async ({ request }) => {
  expect((await request.get("/api/v1/hidden")).status()).toBe(401);
  expect((await request.post("/api/v1/hidden", { data: { snapshotId: "jobicy:1", reason: "nope" } })).status()).toBe(401);

  // Register and log in through the UI to get a session cookie for `request`.
});

test("authenticated feedback API validates input strictly", async ({ page }) => {
  const email = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль (минимум 10 символов)").fill("e2e-long-password");
  await page.getByRole("button", { name: "Создать аккаунт и войти" }).click();
  await expect(page).toHaveURL(/\/profile$/u);

  // page.request carries the browser session cookie.
  const hiddenInvalidReason = await page.request.post("/api/v1/hidden", {
    data: { snapshotId: "jobicy:123456", reason: "free-text-reason" },
  });
  expect(hiddenInvalidReason.status()).toBe(400);

  const hiddenUnknownSnapshot = await page.request.post("/api/v1/hidden", {
    data: { snapshotId: "jobicy:does-not-exist", reason: "other" },
  });
  expect(hiddenUnknownSnapshot.status()).toBe(404);

  const appliedUnknown = await page.request.patch("/api/v1/saved", {
    data: { snapshotId: "jobicy:does-not-exist", applied: true },
  });
  expect(appliedUnknown.status()).toBe(404);

  const appliedInvalid = await page.request.patch("/api/v1/saved", {
    data: { snapshotId: "jobicy:123456", applied: "yes" },
  });
  expect(appliedInvalid.status()).toBe(400);
});
