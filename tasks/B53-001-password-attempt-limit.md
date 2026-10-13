# B53-001: login and account deletion limit password attempts (B53)

**Status: accepted by the owner, 2026-10-13** (with the register-form wording of review
note 5). Implemented, independently reviewed and checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B53, the
limitation B11-001 recorded: neither login nor account deletion limits password guesses.
Per SP 1.0 §4 the access rule was presented to the owner first.

**Owner decisions, 2026-10-13:**
1. The counts are kept in **PostgreSQL** (a new table), not in process memory.
2. Login counts **per email only**: a hash of the normalized email, whether or not an
   account has it. No per-IP limit until a deploy has a trusted proxy (today the client
   writes `x-forwarded-for` itself).
3. **5 attempts per 15 minutes, then refuse**: the 6th attempt within 15 minutes of the
   window's first is refused even with the right password, until the window ends. A
   successful login clears the count.
4. Deletion has **its own counter per account** (the session's user id), the same limit;
   the counter goes with the account.

## Result and boundaries

**User result:** after 5 wrong passwords in 15 minutes, login says «Слишком много попыток.
Попробуйте через 15 минут.» and does not log in even with the right password until the
window ends; account deletion answers 429 `TOO_MANY_ATTEMPTS` with `Retry-After`, the
form says the same, and the account stays.

**Change.**
1. Migration `0022_auth_attempts.sql`: `auth_attempts (key text PRIMARY KEY, attempts
   integer, window_started_at timestamptz)`.
2. `src/server/auth-attempts.ts`: `loginAttemptKey(email)` (`login:` + SHA-256 of the
   normalized email, never the email), `deletionAttemptKey(userId)`, `takeAttempt` (one
   atomic upsert that counts the attempt **before** the password is checked and returns
   whether it is admitted), `clearAttempts`, `pruneAttempts` (expired windows, skipping
   locked rows).
3. `src/server/users.ts`: `checkLogin(pool, email, password, now)`: count, look up, verify,
   clear on success. `src/server/auth.ts`: `authorize` uses it; a refusal throws
   `TOO_MANY_ATTEMPTS` (next-auth passes the message to the client); a failure of the
   check throws `LOGIN_UNAVAILABLE`, so no database message reaches the URL.
4. `src/server/account-deletion.ts`: inside the existing transaction, after the account
   row is locked, the attempt is counted; a refusal or a wrong password commits the count
   and changes nothing else; a deletion removes both of the account's counters.
5. `DELETE /api/v1/account`: 429 `TOO_MANY_ATTEMPTS` with `Retry-After` and
   `retryAfterSeconds`.
6. The login form and the deletion form show the message; the login form says «Не удалось
   войти. Попробуйте позже.» for `LOGIN_UNAVAILABLE` instead of a wrong password.

**Not changed:** registration (no limit; it reveals a taken email anyway); the unknown-email
path of login still skips the password hash (a timing difference that existed before);
sessions; no per-IP limit; no CAPTCHA; no notification to the account's owner.

**Risk: high (auth).** Tests first, an independent `reviewer` pass, and the owner's
acceptance before it is treated as done.

**Data:** the isolated test database; the e2e fixture backend. No provider call, no spend.

## Acceptance (fixed before the code)

1. A key admits 5 attempts in a window; the 6th is refused with `retryAfterSeconds` no more
   than 15 minutes; once 15 minutes have passed since the window's first attempt, the key
   admits again with a fresh count. 20 parallel attempts on a fresh key admit exactly 5.
2. Login: a wrong password 5 times, then the right one is refused `TOO_MANY_ATTEMPTS`;
   an email with no account is counted the same way; a successful login clears the count;
   the table never holds the email itself.
3. Deletion: 5 wrong passwords, then the right one is refused `TOO_MANY_ATTEMPTS` and the
   account and its rows are still there; after the window the right password deletes it,
   and `auth_attempts` holds neither of its keys. Another account's counter is untouched.
   A deletion of an account that no longer exists creates no counter.
4. The deletion route answers 429 with `Retry-After`; the form shows the message.
5. e2e: 5 wrong logins, then the right password shows «Слишком много попыток. Попробуйте
   через 15 минут.» and stays on the login page; 5 wrong deletion passwords, then the 6th
   shows the same message and the account still works.
6. `npm run check`, `npm run test:db`, `npm run test:coverage`, `npm run build` and
   `npm run test:e2e` pass; thresholds not lowered; no visual baseline changes. An
   independent review finds no blocking issue.

## Plan

1. Tests first: `tests/integration/auth-attempts.test.ts` (1–3); e2e in
   `tests/e2e/account.spec.ts` (4–5).
2. Migration; the limiter; `checkLogin` and `authorize`; deletion; the route; the forms.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`; the migration only adds a table (drop it to undo). Turning the
limit off without a revert is not provided.

## Approvals and limits

Owner decisions 2026-10-13, in the session. Local code, the isolated test database and the
e2e fixture backend. No provider call, no spend. Coding-host spend: not visible.

## Independent review (2026-10-13)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `test:db` and the desktop account e2e spec (all exit 0), and read next-auth
4.24.15's credentials callback and client. **Verdict: no blocking issues.** It confirmed
that `takeAttempt`'s single upsert cannot admit more than 5 per window under racing requests
(parallel deletions also queue on the account row's lock); that every password check is
counted first and a deletion refusal's count is committed before it is thrown; that
next-auth returns a thrown error's message as `result.error` and logs nothing of it; that
the table holds no email; that pruning with `SKIP LOCKED` closes every lock-wait cycle; and
that B11's guarantees hold.

Findings and what was done:
1. *Should-fix:* B11's catalog guard finds tables by column name and could not see
   `auth_attempts.key` → the B11 deletion test now also sweeps every text column of every
   table by value for the account's id, email and login key, before (it finds them) and
   after a deletion (only the kept ledger's five columns hold them). Leaving the counters
   behind fails it.
2. *Should-fix:* nothing tested that a database error stays out of next-auth's error URL →
   `authorize`'s body moved to `authorizeCredentials` in `users.ts` (next-auth's provider
   cannot be imported by the Node test runner), and a test calls it with an unreachable
   database and with a refusing configuration: exactly `LOGIN_UNAVAILABLE`, and the log
   holds the code alone. The form's reading of it is an e2e test with a mocked answer,
   labelled as such.
3. *Should-fix (low):* pruning scanned the whole table on every login → migration
   `0023_auth_attempts_window_index.sql` (0022 was already applied to the local databases;
   migrations are checksummed) and at most 100 rows per prune, pinned by a test.
4. *Note:* the key is unsalted SHA-256: anyone who can read the database can test a guessed
   email against it while its window lasts → left as decided (decision 2 named a hash);
   an HMAC under the server secret would close it. Recorded under Limitations.
5. *Note:* registering an email whose logins are refused created the account but said only
   «Слишком много попыток…» → the register form now says «Регистрация прошла, но вход
   закрыт: слишком много попыток. Попробуйте войти через 15 минут.» (an e2e test).
6. *Note:* the message always says 15 minutes, even with less left → the owner's wording;
   it is an upper bound.
7. *Note:* the tests' fixed past date relies on test files running one at a time → left;
   `test:db` runs with `--test-concurrency=1`.

## Result (2026-10-13)

**What changed.**
- `migrations/0022_auth_attempts.sql` (new): the counter table;
  `migrations/0023_auth_attempts_window_index.sql` (new): its window index (review 3).
- `src/server/auth-attempts.ts` (new): the keys, `takeAttempt`, `clearAttempts`,
  `pruneAttempts` (at most 100 rows).
- `src/server/users.ts`: `checkLogin` and `authorizeCredentials`. `src/server/auth.ts`:
  `authorize` calls `authorizeCredentials`, which throws only `TOO_MANY_ATTEMPTS` or
  `LOGIN_UNAVAILABLE`.
- `src/server/account-deletion.ts`: the count in the deletion transaction; a refusal is
  committed and thrown after it; a deletion clears both keys.
- `src/app/api/v1/account/route.ts`: 429 with `Retry-After`.
- `src/components/auth-forms.tsx`, `src/components/account-deletion.tsx`: the messages.
- Tests: `tests/integration/auth-attempts.test.ts` (new: 1–3, the parallel case, pruning
  past a locked row and its bound, the provider's fixed codes);
  `tests/integration/account-deletion.test.ts` (the by-value sweep, review 1);
  `tests/e2e/account.spec.ts` (four tests: 4–5, the register message, the mocked
  `LOGIN_UNAVAILABLE`).
- Docs: `docs/OPEN_GAPS.md` (B53), `IMPLEMENTATION_STATUS.md`.
- The local development database was migrated (`npm run db:migrate`, 0022 then 0023) so
  the e2e server has the table.

**Tests first.** Before the code the integration test failed (no module). The e2e tests
were written before the code but first run after it; the mutation check below shows they
fail without it.

**Mutation check:** 13 of 13 caught. Integration: the limit never refuses (4 tests fail);
the window never resets (2); an unknown email is not counted (1); a success does not clear
(1); a wrong deletion password rolls its count back (1); a deletion keeps its counters (the
B53 test, and the B11 sweep); pruning waits on a locked row (1, a lock timeout); pruning is
unbounded (1); `authorizeCredentials` without its try/catch (1). e2e: `authorize` returns
null instead of `TOO_MANY_ATTEMPTS` (login test); the route does not map 429 (deletion
test); the register message and the `LOGIN_UNAVAILABLE` message removed (their tests).

**Checks.** `npm run check` exit 0 (342 unit tests); `npm run test:db` exit 0 (113 tests);
`npm run test:coverage` exit 0 (455 tests; 83.95 / 87.28 / 92.85 against 82 / 86 / 91,
thresholds unchanged); `npm run build` exit 0; `npm run test:e2e` exit 0 (120 of 120). No
visual baseline changed.

**Limitations.** Anyone who knows an email can keep its logins refused (owner decision 2:
no per-IP limit until a trusted proxy). One client can still try one password against many
emails. The key is an unsalted SHA-256 of the email: anyone who can read the database can
confirm a guessed email against a row while its window lasts (rows are pruned by later
logins once it ends). Registration is not limited. Turning the limit off needs a revert.
