import { expect, test } from "@playwright/test";

test("open catalog, search, inspect evidence and return", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading",{name:/Работа, которая/u})).toBeVisible();
  await page.getByRole("link",{name:/Посмотреть демо-каталог/u}).click();
  await expect(page.getByRole("article")).toHaveCount(4);
  await page.getByLabel("Роль, компания или навык").fill("React");
  await page.getByRole("button",{name:"Найти",exact:true}).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("link",{name:"Senior Frontend Engineer",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Карта условий",exact:true})).toBeVisible();
  await page.getByText("Основание по удалённому формату",{exact:true}).click();
  await expect(page.locator("blockquote")).toContainText("Постоянная полностью удалённая работа");
  await expect(page.getByRole("button",{name:"Перейти к отклику",exact:true})).toBeDisabled();
});
test("unknown geography is not presented as worldwide", async ({ page }) => {
  await page.goto("/jobs/orbit-product");
  await expect(page.getByText("Страны найма не указаны",{exact:false})).toBeVisible();
  await expect(page.getByText("Профиль не задан: персональная совместимость не оценена.",{exact:true})).toBeVisible();
});
test("excluded record is not directly readable", async ({ request }) => {
  expect((await request.get("/api/v1/jobs/hybrid-excluded")).status()).toBe(404);
  expect((await request.get("/api/v1/jobs/closed-excluded")).status()).toBe(404);
});
test("API rejects duplicate filters and never accepts a real letter", async ({ request }) => {
  expect((await request.get("/api/v1/jobs?q=React&q=SQL")).status()).toBe(400);
  const reply = await request.post("/api/v1/cover-letters",{data:{body:"SYNTHETIC TEST ONLY"}});
  expect(reply.status()).toBe(503);
});
test("empty state explains the result without silently broadening", async ({ page }) => {
  await page.goto("/jobs?q=unlisted-skill");
  await expect(page.getByRole("heading",{name:"По этому запросу примеров нет"})).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});
test("primary content reflows without horizontal overflow", async ({ page }) => {
  for (const route of ["/","/jobs","/jobs/fern-frontend","/profile","/saved","/status"]) {
    await page.goto(route);
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});
test("keyboard reaches skip link and labeled search", async ({ page }) => {
  await page.goto("/jobs");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link",{name:"К содержимому",exact:true})).toBeFocused();
  await page.getByLabel("Роль, компания или навык").focus();
  await page.keyboard.type("SQL");
  await page.keyboard.press("Enter");
  // Substring search: matches both "SQL" (cobalt-data) and "PostgreSQL" (north-backend).
  await expect(page.getByRole("article")).toHaveCount(2);
});
test("HTML-like search text is not executed", async ({ page }) => {
  await page.goto("/jobs?q="+encodeURIComponent('<script>document.title="injected"</script>'));
  await expect(page).not.toHaveTitle("injected");
});
