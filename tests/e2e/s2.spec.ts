import { expect, test } from "@playwright/test";

test("register, create profile, see honest empty matching, cannot save unknown jobs", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль (минимум 10 символов)").fill("e2e-long-password");
  await page.getByRole("button", { name: "Создать аккаунт и войти" }).click();
  await expect(page).toHaveURL(/\/profile$/u);
  await expect(page.getByText("Профиль ещё не создан", { exact: false })).toBeVisible();

  // Real-time validation: an invalid ISO code shows an inline message that
  // disappears once the field is corrected.
  const country = page.getByLabel("Страна работы (ISO-код, например DE)");
  await country.fill("D1");
  await country.blur();
  await expect(page.getByText("Страна — двухбуквенный ISO-код, например DE или US.")).toBeVisible();
  await country.fill("DE");
  await expect(page.getByText("Страна — двухбуквенный ISO-код, например DE или US.")).toBeHidden();

  // Autocomplete hints are wired: country codes and IANA zones are offered.
  await expect(page.locator("#country-options option[value='DE']")).toHaveCount(1);
  await expect(page.locator("#country-options option", { hasText: "Германия" })).toHaveCount(1);
  await expect(page.locator("#timezone-options option[value='Europe/Berlin']")).toHaveCount(1);

  await page.getByLabel("Часовой пояс (IANA, например Europe/Berlin)").fill("Europe/Berlin");
  await page.getByLabel("Целевые роли (через запятую)").fill("engineer");
  await page.getByRole("button", { name: "Создать профиль" }).click();
  await expect(page.getByText("Профиль сохранён — версия 1.", { exact: false })).toBeVisible();

  await page.goto("/matched");
  // Fixture backend: honest emptiness, no fake results.
  await expect(page.getByText("Нет данных источника")).toBeVisible();

  const saveStatus = await page.evaluate(async () => {
    const response = await fetch("/api/v1/saved", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: "himalayas:does-not-exist" }),
    });
    return response.status;
  });
  expect(saveStatus).toBe(404);

  const matched = await page.evaluate(async () => {
    const response = await fetch("/api/v1/matched");
    return (await response.json()) as { status?: string };
  });
  expect(matched.status).toBe("fixture_backend");
});

test("private APIs reject anonymous access", async ({ request }) => {
  expect((await request.get("/api/v1/profile")).status()).toBe(401);
  expect((await request.get("/api/v1/saved")).status()).toBe(401);
  expect((await request.get("/api/v1/matched")).status()).toBe(401);
});
