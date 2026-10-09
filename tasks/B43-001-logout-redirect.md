# B43-001: logout stays on this origin (B43)

**Status: accepted by the owner, 2026-10-09.** Implemented and checked locally the same day. Found 2026-10-08 while
reproducing the owner's «Открыть подбор» report: logging out of the app on port 3200
landed on `localhost:3000`, a different application.

## Result and boundaries

**User result:** «Выйти» ends the session and returns to the Nenaugad home page on the
same origin, on any port or host.

**Root cause (measured).** `LogoutButton` called `signOut({ callbackUrl: "/" })`. In
next-auth 4.24 the server computes the redirect and resolves the callback against
`NEXTAUTH_URL`; unset, that is `http://localhost:3000` (the dev server prints the
`[next-auth][warn][NEXTAUTH_URL]` warning). On port 3200 `POST /api/auth/signout` returned
`{"url":"http://localhost:3000/"}` for `"/"`, `.../login` for `"/login"`, and
`http://localhost:3000` even for the app's own absolute URL, so no callback value can
help. The e2e server (port 3100) reproduces it. Login was not affected: it uses
`redirect: false` and the router.

**Change.** `LogoutButton` signs out with `redirect: false`, then `router.push("/")` and
`router.refresh()`, like the login form. No environment variable is needed.

**Not changed:** the `NEXTAUTH_URL` warning (setting it is deployment configuration, an
owner decision, and a per-port value would only move the bug); next-auth's server
redirect callback (nothing else uses a server-computed redirect: login is `redirect:
false`, the other redirects are Next's `redirect()` with relative paths).

**Risk: low.** One client handler; the session cookie is still cleared by next-auth's own
signout call.

**Data:** none; verified on the e2e fixture backend.

## Acceptance (fixed before the code)

1. After «Выйти», the page URL is the app's own origin and `/`, on port 3100.
2. The session is gone: `/profile` shows «Сначала вход».
3. It holds on the desktop, mobile and narrow viewports (the header and the profile page
   share the one component).
4. `npm run check` passes.

## Plan

1. Test first: `tests/e2e/s2.spec.ts` "logout stays on this origin and ends the session".
2. The handler; the spec on all three projects; checks.

**Rollback:** `git revert`.

## Result (2026-10-09)

The new e2e test failed before the change (it navigated to `http://localhost:3000/`) and
passes after it on desktop, mobile and narrow; the other two s2 tests are unchanged.

**Checks.** `npm run check` exit 0. `npm run test:e2e`: 99 passed, 3 failed, all three the
visual snapshot `authed-profile-empty` (one per viewport). Not caused by this task: it
fails identically on commit d141ad0 without this change. B42-001 added the country hint
to the profile form, so the page is 69 px taller (1846 -> 1915 px at 1440 px wide) and the
Windows baselines predate it. CI skips pixel comparisons off Windows, so it stayed green.
The baselines are not touched here (they are the approved appearance); updating them for
an intended change is a separate step for the owner.

**Not run:** `npm run build`.
