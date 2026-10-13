import { expect, test } from "@playwright/test";

// B11: the account is deleted with its password; a wrong password deletes nothing; the
// deleted account's session ends and its credentials no longer log in.
test("an account is deleted with its password, and only with it (B11)", async ({ page }) => {
  const email = `e2e-del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const password = "e2e-long-password";
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль (минимум 10 символов)").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт и войти" }).click();
  await expect(page).toHaveURL(/\/profile$/u);

  const confirm = page.getByLabel("Пароль для удаления");
  const remove = page.getByRole("button", { name: "Удалить аккаунт" });
  await expect(remove).toBeDisabled();
  await confirm.fill("not-the-password");
  await remove.click();
  await expect(page.getByText("Пароль не подошёл — аккаунт не удалён.")).toBeVisible();
  await expect(page).toHaveURL(/\/profile$/u);

  await confirm.fill(password);
  await remove.click();
  await expect(page).toHaveURL(/\/$/u);
  await page.goto("/profile");
  await expect(page.getByText("Сначала вход")).toBeVisible();

  // The old credentials no longer log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль (минимум 10 символов)").fill(password);
  await page.getByRole("button", { name: "У меня есть аккаунт" }).click();
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByText("Неверный email или пароль.")).toBeVisible();
});

// Owner decision 2026-10-13: the account is checked on every request, so a session token
// that outlives its deleted account is refused everywhere (B11).
test("a deleted account's session still in the browser is refused (B11)", async ({ page }) => {
  const email = `e2e-del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const password = "e2e-long-password";
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль (минимум 10 символов)").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт и войти" }).click();
  await expect(page).toHaveURL(/\/profile$/u);

  // Malformed requests are refused and delete nothing.
  expect((await page.request.delete("/api/v1/account", { data: {} })).status()).toBe(400);
  expect((await page.request.delete("/api/v1/account", {
    headers: { "content-type": "application/json" }, data: "{not json" })).status()).toBe(400);
  expect((await page.request.delete("/api/v1/account", { data: { password: "x".repeat(201) } })).status()).toBe(403);
  expect((await page.request.get("/api/v1/profile")).status()).toBe(200);

  // Deleted through the API: the browser keeps its session cookie.
  const deleted = await page.request.delete("/api/v1/account", { data: { password } });
  expect(deleted.status()).toBe(200);
  const cookies = await page.context().cookies();
  expect(cookies.some(cookie => cookie.name.includes("session-token"))).toBe(true);

  await page.goto("/profile");
  await expect(page.getByText("Сначала вход")).toBeVisible();
  expect((await page.request.get("/api/v1/profile")).status()).toBe(401);
  expect((await page.request.delete("/api/v1/account", { data: { password } })).status()).toBe(401);
});
