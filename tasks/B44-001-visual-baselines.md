# B44-001: re-record the Windows visual baselines for B42's country hint (B44)

**Status: accepted by the owner, 2026-10-09.** Implemented and checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B44.

## Result and boundaries

**User result:** none visible. The local visual suite (`npm run test:e2e`, Windows) is green
again, so a real visual regression is not hidden among known failures.

**Cause.** B42-001 added a hint under the profile form's country field. The profile page is
69 px taller at 1440 px (1846 → 1915), and the `*-win32.png` baselines predate it. CI
ignores pixel comparisons off Windows, so it never saw this. `authed flow` stops at its
first failing screenshot, so the later profile shots were not yet compared: the full set
is found by recording, not assumed.

**Rule for this task.** A baseline is re-recorded only if its diff is the intended change
(the hint and the height it adds). Each changed image is viewed against the old one. Every
other baseline stays byte-identical, and no test, tolerance (`SHOT`) or threshold changes.

**Not included:** any change to the page, the hint's wording or its look (an owner
decision if the 69 px is unwanted); baselines for other platforms (there are none).

**Risk: low.** Test data only. The baselines are the approved appearance, so the owner
sees every changed image before acceptance.

**Data:** none.

## Acceptance (fixed before the code)

1. Before: the failing set is listed from a run that compares every shot (not stopping
   at the first).
2. After: `npm run test:e2e` has 0 failures on all three viewports.
3. `git diff --stat` shows only `*-win32.png` files under the snapshots folder, each in the
   affected set; each was viewed old against new, and the difference is the hint and the
   page height it adds, nothing else.
4. `tests/e2e/visual.spec.ts`, `playwright.config.ts` and every other baseline are
   unchanged.

## Plan

1. Find the full set (record into a scratch copy, not the repo, or review the diff output).
2. Re-record those shots only; view old against new; run the whole suite.

**Rollback:** `git revert` (the old baselines return, the suite fails as before).

## Approvals and limits

Local files only. Coding-host spend: not visible.

## Result (2026-10-09)

**The affected set** (found by `--update-snapshots=changed`, which rewrites only a shot that
differs): 9 files, 3 shots on 3 viewports: `authed-profile-empty`, `authed-profile-error`
and `authed-profile-saved`, each `-desktop`, `-mobile` and `-narrow` `-win32.png`. The error
and saved shots were not in the earlier 3-failure list only because the test stops at its
first failing screenshot. The other 51 baselines are unchanged.

**What changed in each image** (old read from `git show HEAD:…`, new from the working tree):
- Height grows by the hint: desktop +68/+69 px, mobile +89/+90 px, narrow +130 px (the
  hint wraps to more lines in a narrower column).
- Width is unchanged. The first differing row is where the hint starts, in all 9. The
  footer rows are byte-identical in all 9.
- Viewed by eye, old against new: `empty-desktop`, `error-desktop`, `saved-desktop` and
  `empty-narrow`. Each differs by the hint under «Страна работы» and everything below it
  moved down; in `error` the validation message stays above the hint. The mobile and
  the other narrow shots were checked by the numbers above, not by eye.
- Text below the hint is not byte-equal to the old pixels at a pure offset (fractional
  heights, 68 vs 69 px, re-antialias glyphs); the images read the same.

**Two existing quirks seen in the baselines, unchanged by this task** (they are in the old
images too): the «К содержимому» skip link is drawn over the first checkbox in the
`saved` shot, and on the narrow viewports the fixed bottom navigation is drawn
mid-page (a fixed element in a full-page screenshot lands at viewport height). Both
decide where the baseline's overlays fall, not what the page looks like; they are
not fixed here.

**Not changed:** `tests/e2e/visual.spec.ts`, `playwright.config.ts`, the `SHOT` options, any
other baseline, the page or the hint.

**Checks.** `npm run test:e2e`: 102 passed, 0 failed (before: 99 passed, 3 failed).
Not run: `npm run build`, `npm run check` (no source file changed).

**Limitations.** The hint is 3 lines at desktop width in the half-width country column;
whether that is wanted is a design question for the owner. The baselines are exact for this
machine's font stack, as the suite's header says.

**Rollback:** `git revert`.
