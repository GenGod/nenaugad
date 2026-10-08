# B41-001: /matched answers in seconds, not 20 (B41)

**Status: accepted by the owner, 2026-10-08.** Implemented and checked locally the same day. Found 2026-10-08 by the owner's report: after
creating a profile, uploading a CV and setting target roles, «Открыть подбор» does nothing
visible, and other buttons seem dead.

## Result and boundaries

**User result:** «Открыть подбор» shows a loading state at once and the matched page
arrives in a couple of seconds; the dev server is no longer blocked for ~20 s per request.
The matched list itself is unchanged.

**Root cause (measured, 2026-10-08).** `GET /matched` took 19–25 s of application code on
the local catalog (1398 postings). A CPU profile put ~17 of 19 s in `extractSkills`
(`src/domain/skills.ts`): every call re-sorted the alias list and ran `indexOf` for every
alias. `deriveRequirements` alone calls it once per sentence (about 56,000 calls over the
catalog, 7.4 s), and `matching.ts`, `match-ranker.ts` and `negative-preference.ts` each
call it again on the same posting text. The work runs on Node's one thread, so while it
runs no other request is served; `<Link>` prefetch of `/matched` starts more of it. There
is no `loading.tsx`, so the click shows nothing.

**Changes.**
1. `extractSkills`: the sorted alias list is built once; an alias is tried only when its
   first three characters (or the whole alias if shorter) occur in the text, which cannot
   change a result; texts of 400+ characters are memoised (bounded), so one posting is
   scanned once per request, not once per caller.
2. `src/app/matched/loading.tsx`: an Atlas loading state.

**Not included:** why a profile gets 0 eligible and 1349 «нужно уточнить» on this catalog
(not investigated, no evidence it is a defect); the `NEXTAUTH_URL` warning and the logout
redirect to `localhost:3000` (unverified); `/jobs` and other pages' timings.

**Risk: normal.** A pure-function optimisation behind unchanged outputs, plus one static
file. No auth, money, upload, deletion or source-rights change.

**Data:** the local catalog, read-only. No provider call, no spend.

## Acceptance (fixed before the code)

1. `extractSkills` returns exactly what it returned before, for every posting in the local
   catalog (title + description, and each sentence) and for the unit-test texts; the
   existing unit tests pass unchanged.
2. A returned array is not shared mutably: callers cannot change a later result.
3. `matchedForUser` for the owner's profile on the local catalog: from 18.9 s to under
   2 s; the lists are identical (same ids, same order, same counts). **Missed on the
   cold call** (see Result): the target was set before the cold cost was measured.
4. `/matched` has a loading state shown during navigation.
5. `npm run check` passes; coverage ratchet not lowered.

## Plan

1. Record the old outputs (scratch, from the unchanged code) for criterion 1 and 3.
2. Tests first (`tests/unit/skills.test.ts`): repeated and long-text calls, no shared
   mutation, alias containing delimiters, short aliases.
3. Implement; compare against the recorded outputs; time it; `loading.tsx`; checks.

**Rollback:** `git revert`.

## Approvals and limits

Local code and tests. Coding-host spend: not visible.

## Result (2026-10-08)

**What changed.**
- `src/domain/skills.ts`: the sorted alias list is built once; a call tries only the
  aliases whose opening three characters occur in the text (a 16-bit hash of the
  character codes, so a collision adds a candidate and never drops one; aliases under
  three characters are always tried); every answer is remembered by its text up to a
  48M-character budget, oldest first out, and returned frozen. The caller-visible
  contract (`readonly string[]`) is unchanged; no caller mutated a result.
- `src/app/matched/loading.tsx`: an Atlas loading state (page head plus three skeleton
  blocks, `aria-busy`).
- Tests: `tests/unit/skills-extract-equivalence.test.ts` (new): the previous scan is kept
  in the test as an oracle and compared on every dictionary alias in nine contexts
  (alone, capitalised, upper case, in a sentence, glued to a letter, between delimiters)
  and on 400 seeded random mixes of aliases, words and delimiters; a result is frozen;
  4,000 short calls under 250 ms; 300 repeats of a long text under 150 ms. Written
  before the code: the equivalence tests passed on the old code and the freeze and
  speed tests failed there.

**Measured on the local catalog (1398 postings, the owner's profile; read-only).**
| | before | after |
|---|---|---|
| `matchedForUser`, cold process | 18.9 s | 4.0 s |
| `matchedForUser`, repeat call | 18.9 s | 1.5 s |
| 55,805 `extractSkills` calls (every posting and sentence) | 9.1 s | 2.5 s cold |
| `/matched` in the browser (dev) | 25–40 s | loading state at 0.7 s; results 4.6 s cold, 1.7 s repeat |

The outputs are byte-identical to a recording of the old code: all 55,805 skill lists,
the eligible and needs-review ids and order (0 and 1349), the first 200 requirement
sets and the not-evaluated count.

**Not met.** The cold call is 4.0 s, not under 2 s: about 2.5 s of it is the first scan
of the catalog's text, which the cache cannot remove. The first request after a server
start pays it; later ones do not. Going lower needs a different matcher (tokenised
lookup) and its own equivalence proof, or storing the extracted skills with the posting
at import time: neither is in this task.

**Remaining cost, for the next task if wanted:** with every skill list cached, a repeat
call still takes 1.5 s (rule evaluation, ranker, JSON parsing of the stored snapshots).

**Checks.** `npm run check` exit 0; `npm run test:coverage` exit 0 (408 tests; lines
83.2, branches 86.8, functions 92.1, above the 82/86/91 ratchet); browser: login as the
owner, «Открыть подбор» navigates and shows the loading state, results follow;
«Изменить профиль» opens in 0.2 s. Not run: `npm run build`, `npm run test:e2e`.

**Limitations.** The cache is per server process (a restart or a dev hot reload empties
it) and holds posting text in memory, as the database read already did. A catalog larger
than the budget (~48M characters, about 7x today's) would thrash it: the budget is a
constant to raise then. The profile-form calls the same function in the browser on CV
text; it stays in that tab's memory only.

**Rollback:** `git revert`.
