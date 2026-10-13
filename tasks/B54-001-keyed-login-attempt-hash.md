# B54-001: the login counter's email hash is keyed by the server secret (B54)

**Status: accepted by the owner, 2026-10-13.** Implemented, independently reviewed and checked
locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B54, the
B53-001 review's note 4: the login counter's key is an unsalted SHA-256 of the email, so
anyone who can read the database can confirm a guessed email against a row while its
window lasts. Per SP 1.0 §4 the choices were presented to the owner first.

**Owner decisions, 2026-10-13:**
1. The key is derived from the existing **`AUTH_SECRET`** (read as next-auth reads it:
   `NEXTAUTH_SECRET`, else `AUTH_SECRET`), through HKDF with a fixed label, so the counter
   key never equals anything next-auth derives. No new setting.
2. **Without the secret, refuse:** login says «Не удалось войти. Попробуйте позже.» and
   deletion answers 500; nothing is counted or deleted; the server log names
   `AUTH_SECRET_REQUIRED`. `npm run setup` fills `AUTH_SECRET` in for a new `.env`, and
   `npm run doctor` says whether it is set, never its value.

## Result and boundaries

**User result:** the counter table holds `login:` + HMAC-SHA256 of the normalized email
under a key derived from the server secret; without the secret, a database reader cannot
test a guessed email against it. Login and deletion behave as in B53 otherwise.

**Change.**
1. `src/server/auth-attempts.ts`: `loginAttemptKey(email)` = `login:` + HMAC-SHA256 under
   `HKDF-SHA256(secret, info "nenaugad auth-attempts login v1")`; a missing or empty
   secret throws `ConfigurationError("AUTH_SECRET_REQUIRED")`.
2. `src/server/users.ts`: `checkLogin` derives the key before it counts anything;
   `authorizeCredentials` logs a configuration error's code as `reason` (a fixed code,
   never a value or a database message).
3. `src/server/account-deletion.ts`: the login key is derived before the attempt is
   counted. `DELETE /api/v1/account` logs the same `reason`.
4. Migration `0024_auth_attempts_rekey.sql`: deletes every `login:` row (all were keyed by
   the plain hash); at most one 15-minute window of login counts starts over, once.
5. `scripts/setup.mjs` generates `AUTH_SECRET` for a new `.env`; `scripts/doctor.ts`
   reports `authSecret: "set" | "missing"`; `.env.example` says what it keys;
   `playwright.config.ts` gives the e2e server a fixed test-only secret unless one is
   provided, as CI does.

**Not changed:** the deletion counter's key (the account id, already in the kept ledger);
the limit itself (B53); next-auth's handling of the secret; an existing `.env` is not
edited (a local `.env` without `AUTH_SECRET` stops logging in until one is added).

**Risk: high (auth).** Tests first, an independent `reviewer` pass, and the owner's
acceptance before it is treated as done.

**Data:** the isolated test database; the e2e fixture backend. No provider call, no spend.

## Acceptance (fixed before the code)

1. `loginAttemptKey` is `login:` + 64 hex characters, the same for the same email however
   it is written; it is not the plain SHA-256 of the email; it changes with the secret;
   `NEXTAUTH_SECRET` takes precedence over `AUTH_SECRET`, as in next-auth.
2. With no secret (unset or empty): `loginAttemptKey` throws `AUTH_SECRET_REQUIRED`;
   `authorizeCredentials` throws `LOGIN_UNAVAILABLE`, logs `reason: AUTH_SECRET_REQUIRED`,
   and counts nothing; `deleteAccount` refuses, the account and its rows stay, and no
   counter is created.
3. B53's tests pass unchanged in meaning (the limit, the window, deletion, the B11 sweep).
4. `doctorReport` says `authSecret: "missing"` with no secret and `"set"` with one, and
   never contains the value; `setup` writes a 64-hex `AUTH_SECRET` into a new `.env`.
5. `npm run check`, `npm run test:db`, `npm run test:coverage`, `npm run build` and
   `npm run test:e2e` pass; thresholds not lowered; no visual baseline changes. An
   independent review finds no blocking issue.

## Plan

1. Tests first: `tests/integration/auth-attempts.test.ts` (1–2), the doctor test (4).
2. The key; the two callers; the migration; setup, doctor, `.env.example`, Playwright.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. The migration only deletes counters (they cannot come back;
nothing depends on them beyond one window).

## Approvals and limits

Owner decisions 2026-10-13, in the session. Local code, the isolated test database and the
e2e fixture backend. No provider call, no spend. Coding-host spend: not visible.

## Independent review (2026-10-13)

A `reviewer` agent in a fresh context read this file and the working-tree diff (not `.env`),
ran `check:agent`, `test:db`, the setup and doctor tests and the desktop account e2e spec
(all exit 0), and read next-auth 4.24.15's secret resolution and JWT key derivation.
**Verdict: no blocking issues.** It confirmed that the HKDF label keeps the key apart from
next-auth's own (`"NextAuth.js Generated Encryption Key"`); that `authSecret` matches
next-auth's resolution in every place it reads the secret (an empty `NEXTAUTH_SECRET`
beside a set `AUTH_SECRET` fails closed); that every `ConfigurationError` message is a
fixed literal, so `reason` cannot carry a value; that nothing logs, returns or prints the
secret; that the setup regex holds for LF and CRLF and an existing `.env` is untouched; and
that migration 0024 touches only `login:` rows.

Findings and what was done:
1. *Should-fix:* the no-secret deletion test used only the right password, so moving the
   key's derivation back after the count would pass (a wrong password would then commit a
   count and answer 403) → the test also deletes with a wrong password without the secret
   and checks no counter exists. Moving the derivation back now fails it.
2. *Note:* "nothing is pruned without the secret" was untested → the test keeps an expired
   counter through a login without the secret. Pruning before the key now fails it.
3. *Note:* Playwright does not load `.env`, so the e2e server replaced a developer's own
   `AUTH_SECRET` with the committed test-only one while serving the local database →
   `playwright.config.ts` reads `AUTH_SECRET` from `.env` (only that value, nothing
   printed) before falling back to the test-only secret.
4. *Note:* the deletion route's `reason` log is untested (the route imports next-auth,
   which the Node test runner cannot load) → left; the login side is pinned at
   `authorizeCredentials`.

## Result (2026-10-13)

**What changed.**
- `src/server/config.ts`: `authSecret(env)`, the secret as next-auth reads it.
- `src/server/auth-attempts.ts`: `loginAttemptKey` is the HMAC under the HKDF-derived key,
  and refuses without a secret.
- `src/server/users.ts`: `checkLogin` derives the key before it prunes or counts;
  `authorizeCredentials` logs a configuration error's code as `reason`.
- `src/server/account-deletion.ts`: the login key is derived before the count.
  `src/app/api/v1/account/route.ts`: the same `reason` in its log.
- `migrations/0024_auth_attempts_rekey.sql` (new): deletes the plain-hash `login:` rows.
- `scripts/setup.mjs`, `scripts/doctor.ts`, `.env.example`; `playwright.config.ts` (the
  environment's secret, else `.env`'s, else a test-only one; review 3).
- Tests: `tests/integration/auth-attempts.test.ts` (the construction pinned, precedence,
  empty and missing secrets, fail-closed login and deletion with nothing counted; the B53
  provider test now expects a configuration error's code as the reason);
  `tests/integration/account-deletion.test.ts` (brings its own secret);
  `tests/unit/setup.test.ts` (new: setup run in a temporary directory);
  `tests/unit/status-reporting.test.ts` (doctor).
- Docs: `docs/OPEN_GAPS.md` (B54), `IMPLEMENTATION_STATUS.md`.
- The local development database was migrated (`npm run db:migrate`, 0024).

**Tests first.** Before the code the new integration tests, the setup test and the doctor
test failed (3 integration, 2 unit); B53's other tests passed throughout.

**Mutation check:** 10 of 10 caught: the key ignores the secret; a missing secret falls
back to an unkeyed key; the HKDF label changes; the log drops the reason; `AUTH_SECRET` is
read before `NEXTAUTH_SECRET`; an empty secret is accepted; doctor always says set; setup
leaves the secret empty; deletion derives the key after the count (review 1); login prunes
before deriving the key (review 2).

**Checks.** `npm run check` exit 0 (343 unit tests); `npm run test:db` exit 0 (115 tests);
`npm run test:coverage` exit 0 (458 tests; 83.95 / 87.33 / 92.86 against 82 / 86 / 91,
thresholds unchanged); `npm run build` exit 0; `npm run test:e2e` exit 0 (120 of 120). No
visual baseline changed.

**Limitations.** A local `.env` without `AUTH_SECRET` no longer logs in: `npm run doctor`
says `authSecret: "missing"`, and the fix is to add one (setup fills it only for a new
`.env`). Changing the secret starts every login count over (and logs everyone out, as
before). Without a secret in the environment or `.env`, the e2e server signs with a committed
test-only one; it serves only 127.0.0.1:3100 while the tests run. The deletion route's
`reason` log is not tested. Anyone who has both
the database and the secret can still test a guessed email.
