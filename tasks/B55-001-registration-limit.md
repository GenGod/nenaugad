# B55-001: registration is limited service-wide (B55)

**Status: accepted by the owner, 2026-10-13.** Implemented, independently reviewed and checked
locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B55, the gap
B53-001 and B54-001 left: registration has no limit, so anyone can create accounts in
bulk or probe which emails are taken (`EMAIL_TAKEN`). Per SP 1.0 §4 the access rule was
presented to the owner first.

**Owner decisions, 2026-10-13:**
1. **One global counter**: all registrations share one count per 15-minute window (B53's
   table and window), so bulk creation and probing are bounded without trusting IPs. Anyone
   can use it up and block sign-ups until the window ends: accepted.
2. **Counted: every registration that passes the form checks** (a created account and an
   `EMAIL_TAKEN` answer alike), before the password is hashed. A malformed email or a short
   password is not counted.
3. **10 per 15 minutes**; then 429 `TOO_MANY_ATTEMPTS` with `Retry-After`, and the form says
   «Слишком много регистраций. Попробуйте через 15 минут.»
4. **A `REGISTRATION_LIMIT` setting**: a whole number from 1 to 10 000, 10 when unset or
   empty; any other value refuses registration (fail closed). The e2e server sets it high,
   because the suite registers about 33 accounts per run.

## Result and boundaries

**User result:** the 11th registration in a 15-minute window, service-wide, is refused with
the message above and creates nothing; the counter starts over when the window ends.

**Change.**
1. `src/server/auth-attempts.ts`: `takeAttempt` takes the limit (5 by default, as before);
   `REGISTRATION_KEY` (`register:all`).
2. `src/server/config.ts`: `registrationLimit(env)` (`REGISTRATION_LIMIT_INVALID` otherwise).
3. `src/server/users.ts`: `registerWithinLimit(pool, email, password, limit, now)`: the form
   checks, then the count, then `registerUser`. `registerUser` itself is unchanged (tests and
   seeds call it directly; the route is its only product caller).
4. `POST /api/v1/auth/register`: calls it with the setting; 429 with `Retry-After` and
   `retryAfterSeconds`; a configuration error answers 500 and logs its code as `reason`.
   It answers with the standard `Response.json` (as `/api/health` does) instead of
   `NextResponse`, so the route itself can be tested under Node.
5. The register form shows the message. `npm run doctor` reports `registrationLimit` (the
   number, or `invalid`). `.env.example` documents the setting. `playwright.config.ts` sets
   it to 1000 for the e2e server.

**Not changed:** `EMAIL_TAKEN` still says the email is taken (closing that needs email
verification); login and deletion limits (B53); no per-IP limit; no invitation list (the
admission of beta participants, SP 1.0 §9, is a separate decision).

**Risk: high (auth).** Tests first, an independent `reviewer` pass, and the owner's
acceptance before it is treated as done.

**Data:** the isolated test database; the e2e fixture backend. No provider call, no spend.

## Acceptance (fixed before the code)

1. With the default limit, 10 registrations that pass the form checks are admitted in a
   window, created accounts and `EMAIL_TAKEN` alike; the 11th is refused
   `TOO_MANY_ATTEMPTS` with `retryAfterSeconds` no more than 900 and creates no account; a
   malformed email or a short password is refused as before and not counted; after the
   window registration is admitted again. 20 parallel registrations admit exactly 10.
2. `registrationLimit`: unset or empty is 10; `"25"` is 25; `"0"`, `"10001"`, `"abc"`,
   `"1.5"`, `" 5"` are `REGISTRATION_LIMIT_INVALID`.
3. The route: 11 registrations with the default answer 201 ten times, then 429 with
   `Retry-After` and `{ error, retryAfterSeconds }`; an invalid setting answers 500
   `REGISTRATION_FAILED`, counts nothing, and logs `reason: REGISTRATION_LIMIT_INVALID`.
4. The register form shows the message on a 429 (e2e, with a labelled mocked answer: the
   e2e server's limit is raised).
5. `doctorReport` reports the limit, or `invalid`.
6. `npm run check`, `npm run test:db`, `npm run test:coverage`, `npm run build` and
   `npm run test:e2e` pass; thresholds not lowered; no visual baseline changes. An
   independent review finds no blocking issue.

## Plan

1. Tests first: `tests/integration/registration-limit.test.ts` (1–3), the doctor test (5),
   e2e (4).
2. The limit parameter, the setting, the service, the route, the form, doctor, docs.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`; no migration (the counter is a row in `auth_attempts`). Raising
`REGISTRATION_LIMIT` loosens the limit without a deploy of code.

## Approvals and limits

Owner decisions 2026-10-13, in the session. Local code, the isolated test database and the
e2e fixture backend. No provider call, no spend. Coding-host spend: not visible.

## Independent review (2026-10-13)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `test:db` and the desktop account e2e spec (all exit 0), and made one
read-only query of the development database's `register:all` row (it loaded `.env` into
the command to connect, without printing it, although asked not to read it). **Verdict:
no blocking issues.** It confirmed that racing registrations cannot pass the limit (one
atomic upsert; 20 in parallel admit 10); that the form checks come before the count, and
the count before the hash and the email lookup; that login and deletion pass three
arguments to `takeAttempt` and keep their limit of 5; that pruning only deletes a window
that has ended, so it cannot reset the counter early; that `Response.json` answers exactly
as `NextResponse.json` did (Next's is a re-wrap of it) on every branch; that only fixed
codes reach the log; that `registerUser` has no product caller but `registerWithinLimit`;
and that the setting cannot exceed 10 000.

Findings and what was done:
1. *Note:* the e2e server registers in the developer's own database (`DATABASE_URL` from
   `.env`), so its ~33 registrations use up the default 10 there: for up to 15 minutes
   after an e2e run, `npm run dev` refuses registration → stated in `.env.example` and
   below.
2. *Note:* no test pins "counted before the password is hashed"; the code order holds it
   (`registerWithinLimit` counts before it calls `registerUser`) → left; pinning it would
   need a module mock or a hook in `registerUser`.
3. *Note:* `registerWithinLimit` trusted its `limit` argument (`NaN` or `0` refuses all,
   `Infinity` admits all) → it refuses a limit outside 1 to 10 000 with
   `REGISTRATION_LIMIT_INVALID` and counts nothing (a test; removing the guard fails it).

## Result (2026-10-13)

**What changed.**
- `src/server/auth-attempts.ts`: `takeAttempt` takes the limit (5 by default, so login
  and deletion are unchanged); `REGISTRATION_KEY`.
- `src/server/config.ts`: `registrationLimit`.
- `src/server/users.ts`: `registerWithinLimit` (which also refuses a limit outside 1 to
  10 000, review 3); `RegistrationError` carries the wait.
- `src/app/api/v1/auth/register/route.ts`: the limited registration, 429 with
  `Retry-After`, the `reason` log; `Response.json` instead of `NextResponse`.
- `src/components/auth-forms.tsx`: the message. `scripts/doctor.ts`: `registrationLimit`.
  `.env.example`: the setting. `playwright.config.ts`: 1000 for the e2e server.
- Tests: `tests/integration/registration-limit.test.ts` (new: the setting, the limit and
  its window, what counts, an out-of-range limit, 20 in parallel, the route itself);
  `tests/unit/status-reporting.test.ts` (doctor); `tests/e2e/account.spec.ts` (the form
  message, with a labelled mocked answer).
- Docs: `docs/OPEN_GAPS.md` (B55), `IMPLEMENTATION_STATUS.md`. No migration.

**Tests first.** Before the code the new integration test failed (the route could not be
imported, the exports did not exist) and the doctor test failed.

**Mutation check:** 11 of 11 caught: registration never refused; form-check failures
counted; counted only after a creation; the limit parameter ignored; a default other than
10; the upper bound loosened; the route's log without its reason; no `Retry-After`; doctor
fixed at 10; the form message removed (e2e); `registerWithinLimit` without its bounds
check (review 3).

**Checks.** `npm run check` exit 0 (343 unit tests); `npm run test:db` exit 0 (120 tests);
`npm run test:coverage` exit 0 (463 tests; 84.21 / 87.22 / 92.91 against 82 / 86 / 91,
thresholds unchanged); `npm run build` exit 0; `npm run test:e2e` exit 0 (123 of 123). No
visual baseline changed.

**Limitations.** Anyone can use up the 10 and block sign-ups for the rest of the window
(owner decision 1). `EMAIL_TAKEN` still tells whether an email is registered, at most 10
probes per window. The e2e server runs with 1000, so e2e sees the refusal only through a
mocked answer, and its registrations use up the development database's counter: for up to
15 minutes after an e2e run, `npm run dev` refuses registration. No test pins that the
count comes before the password hash. Registration remains open to anyone: admitting beta
participants (SP 1.0 §9) is a separate decision.
