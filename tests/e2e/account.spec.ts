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

// B53 (owner decisions 2026-10-13): 5 password attempts per 15 minutes, counted before the
// password is checked; the 6th is refused even with the right password.
const TOO_MANY = "Слишком много попыток. Попробуйте через 15 минут.";

test("login refuses even the right password after five wrong ones (B53)", async ({ page }) => {
  const email = `e2e-lim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const password = "e2e-long-password";
  expect((await page.request.post("/api/v1/auth/register", { data: { email, password } })).status()).toBe(201);

  await page.goto("/login");
  await page.getByRole("button", { name: "У меня есть аккаунт" }).click();
  await page.getByLabel("Email").fill(email);
  const field = page.getByLabel("Пароль (минимум 10 символов)");
  const submit = page.getByRole("button", { name: "Войти", exact: true });
  const callback = () => page.waitForResponse(response => response.url().includes("/api/auth/callback/credentials"));
  for (let i = 0; i < 5; i += 1) {
    await field.fill(`wrong-password-${i}`);
    await Promise.all([callback(), submit.click()]);
    await expect(page.getByText("Неверный email или пароль.")).toBeVisible();
  }
  await field.fill(password);
  await Promise.all([callback(), submit.click()]);
  await expect(page.getByText(TOO_MANY)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/u);
  expect((await page.request.get("/api/v1/profile")).status()).toBe(401);
});

test("account deletion refuses even the right password after five wrong ones (B53)", async ({ page }) => {
  const email = `e2e-lim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const password = "e2e-long-password";
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль (минимум 10 символов)").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт и войти" }).click();
  await expect(page).toHaveURL(/\/profile$/u);

  const confirm = page.getByLabel("Пароль для удаления");
  const remove = page.getByRole("button", { name: "Удалить аккаунт" });
  const deletion = () => page.waitForResponse(response =>
    response.url().endsWith("/api/v1/account") && response.request().method() === "DELETE");
  for (let i = 0; i < 5; i += 1) {
    await confirm.fill(`wrong-password-${i}`);
    await Promise.all([deletion(), remove.click()]);
    await expect(page.getByText("Пароль не подошёл — аккаунт не удалён.")).toBeVisible();
  }
  await confirm.fill(password);
  await Promise.all([deletion(), remove.click()]);
  await expect(page.getByText(TOO_MANY)).toBeVisible();
  await expect(page).toHaveURL(/\/profile$/u);

  const refused = await page.request.delete("/api/v1/account", { data: { password } });
  expect(refused.status()).toBe(429);
  const retryAfter = Number(refused.headers()["retry-after"]);
  expect(retryAfter).toBeGreaterThan(0);
  expect(retryAfter).toBeLessThanOrEqual(900);
  expect(await refused.json()).toEqual({ error: "TOO_MANY_ATTEMPTS", retryAfterSeconds: retryAfter });
  // The account is still there and still works.
  expect((await page.request.get("/api/v1/profile")).status()).toBe(200);
});

test("registration on an email whose logins are refused says the account was created (B53)", async ({ page }) => {
  const email = `e2e-lim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const password = "e2e-long-password";
  await page.goto("/login");
  await page.getByRole("button", { name: "У меня есть аккаунт" }).click();
  await page.getByLabel("Email").fill(email);
  const field = page.getByLabel("Пароль (минимум 10 символов)");
  const callback = () => page.waitForResponse(response => response.url().includes("/api/auth/callback/credentials"));
  // Five attempts on an email that has no account yet.
  for (let i = 0; i < 5; i += 1) {
    await field.fill(`wrong-password-${i}`);
    await Promise.all([callback(), page.getByRole("button", { name: "Войти", exact: true }).click()]);
  }
  await page.getByRole("button", { name: "Создать аккаунт", exact: true }).click();
  await field.fill(password);
  await Promise.all([callback(), page.getByRole("button", { name: "Создать аккаунт и войти" }).click()]);
  await expect(page.getByText("Регистрация прошла, но вход закрыт: слишком много попыток. Попробуйте войти через 15 минут.")).toBeVisible();
  // The account exists: registering it again is refused as taken.
  expect((await page.request.post("/api/v1/auth/register", { data: { email, password } })).status()).toBe(409);
});

// MOCK, labelled: the server's answer is replaced so the form's reading of
// LOGIN_UNAVAILABLE can be seen without stopping the database; the server side of it is
// tested in tests/integration/auth-attempts.test.ts.
test("login says it could not check, not that the password is wrong, when the check fails (B53, mocked answer)", async ({ page }) => {
  await page.goto("/login");
  await page.route("**/api/auth/callback/credentials", route => route.fulfill({
    status: 401, contentType: "application/json",
    body: JSON.stringify({ url: new URL("/api/auth/error?error=LOGIN_UNAVAILABLE", page.url()).toString() }),
  }));
  await page.getByRole("button", { name: "У меня есть аккаунт" }).click();
  await page.getByLabel("Email").fill("nobody@example.invalid");
  await page.getByLabel("Пароль (минимум 10 символов)").fill("e2e-long-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByText("Не удалось войти. Попробуйте позже.")).toBeVisible();
  await expect(page.getByText("Неверный email или пароль.")).toHaveCount(0);
});

// MOCK, labelled: the e2e server's registration limit is raised (REGISTRATION_LIMIT in
// playwright.config.ts, owner decision 2026-10-13), so the server's answer is replaced to
// show the form's reading of it; the server side is tested in
// tests/integration/registration-limit.test.ts.
test("registration says to wait when the service-wide limit is reached (B55, mocked answer)", async ({ page }) => {
  await page.goto("/login");
  await page.route("**/api/v1/auth/register", route => route.fulfill({
    status: 429, contentType: "application/json", headers: { "retry-after": "600" },
    body: JSON.stringify({ error: "TOO_MANY_ATTEMPTS", retryAfterSeconds: 600 }),
  }));
  await page.getByLabel("Email").fill("nobody@example.invalid");
  await page.getByLabel("Пароль (минимум 10 символов)").fill("e2e-long-password");
  await page.getByRole("button", { name: "Создать аккаунт и войти" }).click();
  await expect(page.getByText("Слишком много регистраций. Попробуйте через 15 минут.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/u);
});
