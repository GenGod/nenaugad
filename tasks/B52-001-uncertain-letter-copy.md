# B52-001: the letter editor says what an uncertain call means (B52)

**Status: accepted by the owner, 2026-10-13.** Implemented and checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B52,
found 2026-10-13 by the B46-001 review. The owner chose the wording on 2026-10-13: the
suggestion recorded in B52.

## Result and boundaries

**User result:** when a letter call's result is unknown (409 `OPERATION_UNCERTAIN`, B46) or
its reservation came too late to be sent (409 `DEADLINE_EXPIRED`, B50), the editor says
«Результат вызова не подтверждён; списание будет сверено владельцем. Повторная генерация
оплачивается отдельно.» instead of «Не удалось сгенерировать. Попробуйте позже.», which
invited a retry: each click is a new idempotency key, a new hold and a second paid call
while the first may already have been billed.

**Change.**
1. `letterErrorMessage(code)` in `src/components/letter-errors.ts` (pure, no server imports,
   like `form-validation.ts`): the editor's message for each error code. The existing
   messages are kept: «Бюджет исчерпан — обратитесь к владельцу.» for `BUDGET_EXCEEDED`,
   «Сначала заполните профиль.» for `PROFILE_REQUIRED`, the generic one for the rest. The
   owner's wording for `OPERATION_UNCERTAIN` and `DEADLINE_EXPIRED`; the same text for both,
   which is true of both (no confirmed result; the owner reconciles the hold; a new
   generation is a new charge).
2. `src/components/letter-editor.tsx` uses it.

**Not changed:** the server's codes and statuses (B46, B50); `NEEDS_INPUT` handling; the
editor's other states; no new copy elsewhere.

**Risk: low.** One client message, behind the personal-data boundary today.

**Data:** none.

## Acceptance (fixed before the code)

1. `letterErrorMessage`: `OPERATION_UNCERTAIN` and `DEADLINE_EXPIRED` → the owner's wording
   (exactly); `BUDGET_EXCEEDED` and `PROFILE_REQUIRED` → their messages as before; any other
   code, or none → «Не удалось сгенерировать. Попробуйте позже.»
2. The editor shows `letterErrorMessage(body.error)` for every non-OK answer but
   `NEEDS_INPUT` (read in the diff).
3. `npm run check`, `npm run build` and `npm run test:e2e` pass (the e2e flows show the
   generic message for the boundary's 503 and their baselines do not change).

## Plan

1. Test first: `tests/unit/letter-errors.test.ts`.
2. The helper; the editor.
3. Checks; docs; the owner.

**Rollback:** `git revert`.

## Approvals and limits

The owner chose the wording on 2026-10-13. No provider call, no spend. Coding-host spend:
not visible.

## Result (2026-10-13)

**What changed.**
- `src/components/letter-errors.ts` (new): `letterErrorMessage`.
- `src/components/letter-editor.tsx`: `setError(letterErrorMessage(body.error))` replaces
  the inline chain (`NEEDS_INPUT` is handled before it, as before).
- Tests: `tests/unit/letter-errors.test.ts` (new, 1).
- Docs: `docs/OPEN_GAPS.md` (B52), `IMPLEMENTATION_STATUS.md`.

**Tests first.** The test failed before the change (no module).

**Checks.** `npm run check` exit 0 (338 unit tests); `npm run build` exit 0;
`npm run test:e2e` exit 0 (102 of 102, no visual baseline changed); `npm run test:coverage`
exit 0 (441 tests; `letter-errors.ts` 100 %; thresholds unchanged). Not run:
`npm run test:db` (no server change).

**An e2e incident, not caused by this change.** The first e2e run after the build failed
59 of 102 tests in 16 minutes: under Playwright every page reloaded in a loop (the dev
server answered each hot-reload connection with a rebuild). It failed the same way with
this change set aside and with `src/` at `b290c3f`, whose run had passed that morning, so
it was not code. Removing the generated `.next` directory (379 MB, git-ignored, rebuilt on
demand) fixed it: the authed flow passed in 10 s and the full suite in 1.1 min. A
`NEXTAUTH_URL` override tried in `playwright.config.ts` along the way did not help and was
reverted. If the e2e suite starts timing out with `/login` reloading, clear `.next` first.

**Limitations.** None new. B40 stays open.
