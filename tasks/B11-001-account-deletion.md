# B11-001: a user can delete their account (B11)

**Status: accepted by the owner, 2026-10-13.** Implemented, independently reviewed and checked
locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B11
(deferred 2026-10-02: a high-risk zone); spec SP 1.0 §1 ("correction and deletion are
available"), §8 ("deletion covers the profile and derived letters/caches/vectors; a
tombstone/version blocks a late worker write; restore applies the deletion ledger; the user
sees the real consequences"), SP-T01, SP-T16, SP-T22. Per §4 the meaning of deletion was
presented to the owner first.

**Owner decisions, 2026-10-13:**
1. The AI spending ledger (operations, the account's budget row) is **kept**, pseudonymous:
   ids, statuses and amounts, no email or text.
2. The user confirms by **re-entering the password**.
3. Deletion is **allowed while an AI call holds money**; the hold stays for `ai:holds`.
4. **The account is checked on every request**: a deleted account's session is refused from
   the next request on (an authorization-model change).

## Result and boundaries

**User result:** on the profile page, «Удалить аккаунт» with the password deletes the account
and everything personal in it at once, ends the session and returns to the home page. The
page states what is deleted, what is kept and why.

**The meaning of deletion (what the data holds, checked against the database's own
catalog).** Every personal table references `users` with `ON DELETE CASCADE`, directly or
through `candidate_profiles`:
- deleted with the account row, in one transaction: the account (email, password hash);
  every profile version (`candidate_profiles`, `search_profiles`); CV texts (`cv_uploads`;
  the original file is never kept); letters and their revisions; saved and hidden jobs; the
  impression/click journal (`job_events`, which also holds the seen-set); relevance scores;
  profile embeddings; the batch queue;
- kept: `ai_operations` and the account's `ai_budgets` row (decision 1; no foreign key, no
  text); a new `account_deletions` row (account id and time, no email): the deletion ledger
  a future restore must re-apply (SP-T22), recorded in the same transaction;
- the foreign keys are the tombstone: any late write of personal data for a deleted
  account (a worker, a letter result, an embedding) is refused by the database (SP-T16).
  The kept AI ledger has no foreign key: a call already past the session check when the
  account is deleted can still reserve and settle against the kept budget row (decisions 1
  and 3); its result is then refused, and nothing re-creates a budget row for the id;
- what the kept ledger carries: ids, statuses, amounts, and idempotency keys. A letter's
  key now must be a token (`^[A-Za-z0-9-]{8,64}$`), so no free text survives; a relevance
  chunk's key is a hash of posting ids, which can be reversed for a single posting by
  hashing the catalog (it shows which posting was scored, not who). Both routes are closed
  by the personal-data boundary today, so neither writes ledger rows; revisit when it opens;
- no copy of personal data exists outside the live database (the only local backup,
  `backups/remap-2026-10-06`, holds job geography rows), and there is no restore yet.

**Change.**
1. Migration `0021_account_deletions.sql`: `account_deletions (user_id text PRIMARY KEY,
   deleted_at timestamptz NOT NULL DEFAULT now())`.
2. `src/server/account-deletion.ts`: `deleteAccount(pool, userId, password)` — in one
   transaction: lock the account row, verify the password (`PASSWORD_MISMATCH`, nothing
   changes), record the ledger row, delete the account row.
3. `src/server/users.ts`: `accountExists(pool, id)`; `currentUser` (`src/server/auth.ts`)
   returns null for a session whose account no longer exists, and fails closed (null) if
   the lookup fails.
4. `DELETE /api/v1/account` (`{ password }`): only the session's own account; 401 without a
   session, 400 without a password, 403 `PASSWORD_MISMATCH`, 200 `{ ok: true }`.
5. The profile page: a deletion section (consequences, password, button); on success the
   client signs out without a server redirect and goes home, as logout does (B43).

**Not changed:** the profile deletion that exists (it removes profiles, events and CVs and
keeps the account); login; the AI ledger; no login or deletion rate limit exists (a
limitation: guessing the password through deletion is as exposed as through login). A
request that races the deletion fails on a foreign key and answers with its own route's
error (a profile save 500, a saved job 404, a letter 502); nothing is written.

**Risk: high (deletion and auth).** Tests first, an independent `reviewer` pass, and the
owner's acceptance before it is treated as done.

**Data:** the isolated test database; the e2e fixture backend. No provider call, no spend.

## Acceptance (fixed before the code)

1. Two accounts A and B, each with a row in every personal table and an AI operation with
   its budget row. Deleting A with a wrong password changes nothing. With the right one:
   every personal table holds no row of A; B's rows are all still there; A's operation and
   budget row are still there; `account_deletions` holds A; `accountExists(A)` is false.
2. After the deletion, a late write for A — a profile version, a letter revision, a saved
   job, an embedding — is refused by the database (SP-T16).
3. The same email can register again, as a new account with a new id.
4. A deletion of an account that no longer exists is `ACCOUNT_NOT_FOUND`; nothing changes.
5. The route acts only on the session's account: it has no id parameter, and the service
   is given the session's id (read in the diff).
6. e2e: a user registers, deletes the account from the profile page with the password,
   lands signed out on the home page, and the old credentials no longer log in; a wrong
   password shows an error and deletes nothing.
7. `npm run check`, `npm run test:db`, `npm run test:coverage`, `npm run build` and
   `npm run test:e2e` pass; thresholds not lowered; any visual baseline that changes is
   inspected and re-recorded deliberately. An independent review finds no blocking issue.

## Plan

1. Tests first: `tests/integration/account-deletion.test.ts` (1–4); e2e (6).
2. Migration; the service; `accountExists` and `currentUser`; the route; the page.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`; the migration only adds a table (drop it to undo). Deleted
accounts cannot be restored: that is the point, and there is no backup of them.

## Approvals and limits

Owner decisions 2026-10-13, in the session. Local code, the isolated test database and the
e2e fixture backend. No provider call, no spend. Coding-host spend: not visible.

## Independent review (2026-10-13)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, the account, profile and CV integration tests, `test:db`, `test:coverage` and
the account e2e spec (all exit 0), and queried the test database's catalog. **Verdict: no
blocking issues.** It confirmed that every column naming a user, owner, email or account is
in a cascading table or the kept ledger; that every private path resolves the user through
`currentUser` (no other `getServerSession`, no middleware, no `useSession`); that `FOR
UPDATE` on the account row makes a racing write fail on its foreign key, never leave an
orphan; that the password check is constant-time with no enumeration path; that a
cross-site DELETE is blocked (SameSite=Lax, a JSON preflight, and the password); that no log
prints an email and the local backup holds no user data.

Findings and what was done:
1. *Should-fix:* the completeness test read a fixed table list → a third test reads the
   catalog: every table with a column naming an account must be a personal table with an
   ON DELETE CASCADE chain to `users`, or one of the three kept tables (dropping a table
   from the list fails it).
2. Two of the "late write" refusals were the app's, not the database's → each is now named
   (23503 for a profile, an embedding and a direct revision insert; the services' own codes
   for the two that look up first).
3. The kept ledger's keys: a letter's client header was free text → restricted to a token;
   the relevance key's reversibility is recorded above.
4. The ledger can still receive writes from a call already in flight → stated above.
5. The codes a racing request answers with → in "Not changed".
6. The route's 400s were untested → the e2e session test sends an empty body, invalid JSON
   and an over-long password (refused before hashing) before the real deletion.
7. `currentUser` now costs two primary-key lookups per signed-in page (header and page) →
   left; React `cache()` could make it one. `/api/auth/session` still returns a stale
   cookie's `{id, email}` until it expires (30 days); nothing reads it → a limitation.
8. The form said "try later" for a 401 and stayed put if sign-out failed → a 401 says the
   session ended or the account is already deleted, and the page leaves after a deletion
   whatever sign-out does.
9. No server-side password length limit → over 200 characters (registration's cap) is
   refused without hashing.
10. A red e2e artifact from the mutation check sat in `test-results/` → cleared.

## Result (2026-10-13)

**What changed.**
- `migrations/0021_account_deletions.sql` (new): the deletion ledger.
- `src/server/account-deletion.ts` (new): `deleteAccount`.
- `src/server/users.ts`: `accountExists`. `src/server/auth.ts`: `currentUser` checks the
  account on every request and fails closed.
- `src/app/api/v1/account/route.ts` (new): `DELETE`.
- `src/components/account-deletion.tsx` (new) and `src/app/profile/page.tsx`: the section.
- `src/app/api/v1/cover-letters/[id]/generations/route.ts`: the idempotency key is a token.
- Tests: `tests/integration/account-deletion.test.ts` (new, 1–4 and the catalog check);
  `tests/e2e/account.spec.ts` (new, 6, the session refusal and the route's 400s); nine
  re-recorded win32 baselines (`authed-profile-{empty,error,saved}` × three viewports),
  each changed only by the new section (checked by eye on desktop and narrow; the narrow
  page was 342 px wide before as well).
- Docs: `docs/OPEN_GAPS.md` (B11), `IMPLEMENTATION_STATUS.md`.
- The local development database was migrated (`npm run db:migrate`, one migration) so the
  e2e server has the table.

**Tests first.** Before the code the integration test failed (no module); the e2e tests
failed until the development database was migrated.

**Mutation check:** 4 of 4 caught: the password check removed; the ledger row removed; the
account row's deletion removed; `currentUser`'s account check removed (the e2e session
test). Dropping a table from the completeness list fails the catalog test.

**Checks.** `npm run check` exit 0 (342 unit tests); `npm run test:db` exit 0 (107 tests);
`npm run test:coverage` exit 0 (449 tests; 83.77 / 87.13 / 92.76 against 82 / 86 / 91,
thresholds unchanged); `npm run build` exit 0; `npm run test:e2e` exit 0 (108 of 108).
Two e2e runs on the way hit the stale `.next` reload loop recorded in B52-001; clearing
`.next` cleared it both times.

**Limitations.** No rate limit on the password (as for login). A stale cookie on another
device can still read its own `{id, email}` from `/api/auth/session` until it expires; no
page or route trusts it. There is no restore yet: when one is built it must delete every
account in `account_deletions` before the database is used (SP-T22).
