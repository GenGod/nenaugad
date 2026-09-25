import { expect, test } from "@playwright/test";

test("paste CV text, view it privately, delete it; anonymous access is rejected", async ({ page, request }) => {
  expect((await request.get("/api/v1/cv")).status()).toBe(401);

  const email = `cv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль (минимум 10 символов)").fill("e2e-long-password");
  await page.getByRole("button", { name: "Создать аккаунт и войти" }).click();
  await expect(page).toHaveURL(/\/profile$/u);

  await page.goto("/cv");
  await expect(page.getByText("Пока ничего не загружено")).toBeVisible();
  await page.getByLabel("Вставьте текст резюме").fill(
    "Инженер-платформ. React и Node.js, 5 лет. Полностью удалённо из Берлина.");
  await page.getByRole("button", { name: "Сохранить текст" }).click();
  await expect(page.getByText("Сохранено:", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Показать текст" })).toBeVisible();

  await page.getByRole("button", { name: "Показать текст" }).click();
  await expect(page.getByLabel("Извлечённый текст")).toHaveValue(/React и Node\.js/u);

  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Пока ничего не загружено")).toBeVisible();
  expect((await request.get("/api/v1/cv")).status()).toBe(401);
});
