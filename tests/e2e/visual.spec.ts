import { expect, test, type Page } from "@playwright/test";

// Visual regression (DS-001): full-page baselines per route and viewport
// project (desktop 1440, mobile 390, narrow 320). Baselines live in
// tests/e2e/visual.spec.ts-snapshots/ and are committed; regenerate with
// `npx playwright test visual --update-snapshots` after an intentional
// design change. Screenshot baselines are font-stack dependent (the project
// ships no font files, per the design system), so they are exact for the
// local environment that produced them.

const SHOT = { fullPage: true, animations: "disabled", caret: "hide" } as const;

// The Next.js dev-only route indicator is timing-dependent; it is not part
// of the app UI. Production builds do not render it.
async function shot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await expect(page).toHaveScreenshot(name, SHOT);
}

function shotName(route: string): string {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/[/?=&]+/g, "-");
}

const ANON_ROUTES = [
  "/", "/jobs", "/jobs/fern-frontend", "/jobs/orbit-product",
  "/jobs?q=React", "/jobs?q=unlisted-skill",
  "/login", "/status", "/profile", "/saved", "/cv",
];

for (const route of ANON_ROUTES) {
  test(`anonymous page renders as baselined: ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await shot(page, `${shotName(route)}.png`);
  });
}

test("authed flow renders as baselined: profile, matched, saved, letter", async ({ page }, testInfo) => {
  // Deterministic per project (desktop/mobile/narrow): the header shows the
  // email local-part. Users persist in the local database between runs, so
  // registration goes through the API first (create or detect an existing
  // account) and the UI performs the sign-in. Any previous profile — and its
  // derived letters — is deleted to restore the baselined empty state.
  const email = `visual-${testInfo.project.name}@example.invalid`;
  await page.request.post("/api/v1/auth/register", {
    data: { email, password: "visual-long-password" },
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль (минимум 10 символов)").fill("visual-long-password");
  await page.getByRole("button", { name: "У меня есть аккаунт" }).click();
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/u);
  await page.request.delete("/api/v1/profile");
  await page.reload();
  await expect(page.getByText("Профиль ещё не создан", { exact: false })).toBeVisible();
  await shot(page, "authed-profile-empty.png");

  // Inline validation state: the error disappears once the field is fixed.
  const country = page.getByLabel("Страна работы (ISO-код, например DE)");
  await country.fill("D1");
  await country.blur();
  await expect(page.getByText("Страна — двухбуквенный ISO-код, например DE или US.")).toBeVisible();
  await shot(page, "authed-profile-error.png");
  await country.fill("DE");

  await page.getByLabel("Страна работы (ISO-код, например DE)").fill("DE");
  await page.getByLabel("Часовой пояс (IANA, например Europe/Berlin)").fill("Europe/Berlin");
  await page.getByLabel("Целевые роли (через запятую)").fill("engineer");
  await page.getByRole("button", { name: "Создать профиль" }).click();
  await expect(page.getByText("Профиль сохранён — версия 1.", { exact: false })).toBeVisible();
  await shot(page, "authed-profile-saved.png");

  // Fixture backend: honest empty state, no fake results.
  await page.goto("/matched");
  await expect(page.getByText("Нет данных источника")).toBeVisible();
  await shot(page, "authed-matched.png");

  await page.goto("/saved");
  await shot(page, "authed-saved.png");

  await page.goto("/letters/new?mode=general");
  await expect(page).toHaveURL(/\/letters\//u);
  await expect(page.getByText("Сопроводительное письмо")).toBeVisible();
  await shot(page, "authed-letter-general.png");
});
