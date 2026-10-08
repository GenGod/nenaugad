# B42-001: say why nothing matches when the profile has no country (B42)

**Status: accepted by the owner, 2026-10-08.** Implemented and checked locally the same day. Found the same day by investigating the owner's
report that «Подбор» showed 0 matches.

## Result and boundaries

**User result:** a profile without a work country is told so, in the three places where it
matters: the profile form says what the country decides; the matched page says at the top
that no vacancy can match without it; and an empty «Условия совпадают» tab no longer calls
the emptiness an honest result when the country is the reason.

**Root cause (measured).** The owner's profile has `residenceCountry: null`. `GEO-01`
returns `unknown` (`LOCATION_UNKNOWN`) for every hiring option when the country is empty
(`src/domain/matching.ts:60`), and an option must pass for a posting to be eligible, so all
1398 postings sat in «Нужно уточнить» (1357) or were ineligible (41). The form accepts an
empty country on purpose (`validateCountry`), nothing said what it decides, and the empty
tab read «это честный результат, а не ошибка».

**Not changed:** the rules, the ruleset version, the form's validation (the country stays
optional: making it required changes the manual-profile contract and existing profiles, an
owner decision), the stored profile, ranking, the timezone behaviour.

**Not included:** a similar notice for a missing timezone (it lowers some postings to
«Нужно уточнить» but does not block matches; measured: DE without a timezone gives 18
eligible, with one 20); a note after saving.

**Risk: low.** Copy and one conditional block; no rule, data, auth, money or upload change.

**Data:** none written. Verified against the owner's local profile, read-only.

## Acceptance (fixed before the code)

1. A pure helper decides «no country»: `null`, an empty string and a whitespace-only string
   count as missing; a two-letter code does not; no profile at all says nothing.
2. The matched page, on both tabs, shows a notice when the country is missing: it names the
   consequence («ни одна вакансия не может попасть в «Условия совпадают»») and links to
   `/profile`. With a country it shows nothing new.
3. The empty «Условия совпадают» tab, when the country is missing and nothing is hidden as
   already seen, explains the missing country and links to `/profile` instead of «это
   честный результат»; with a country the text is unchanged.
4. The profile form shows a hint under the country field, tied to the input with
   `aria-describedby`; the field's label text is unchanged (the e2e test finds it by label).
5. `npm run check` passes; coverage thresholds not lowered.

## Plan

1. Tests first: `tests/unit/profile-gaps.test.ts` (1, and the wording of 2–4).
2. `src/domain/profile-gaps.ts`; the page and the form use it.
3. Checks; browser check on the owner's profile (no country) and on a profile with one,
   without saving anything to the owner's profile.

**Rollback:** `git revert`.

## Approvals and limits

Local code and tests. Coding-host spend: not visible.

## Result (2026-10-08)

**What changed.**
- `src/domain/profile-gaps.ts` (new): `lacksCountry` (null, empty and whitespace-only count
  as missing; no profile says nothing) and the three texts.
- `src/app/matched/page.tsx`: an amber `banner review` above the tab switch, on both tabs,
  with a link to `/profile`; the empty «Условия совпадают» tab, when the country is missing,
  shows its own heading, text and a «Указать страну» button instead of «это честный результат»
  (unchanged with a country, and unchanged when postings are only hidden as already seen).
- `src/components/profile-form.tsx`: the hint under the country field, linked with
  `aria-describedby`; the label text is unchanged.
- `tests/unit/profile-gaps.test.ts` (new, 5 tests), written before the code and failing
  on the missing module.

**Verified in the browser (dev server, local database).**
- The owner's profile (no country): the notice shows on «Для вас» and on the review tab,
  the link goes to `/profile`, the empty tab shows the new text, 1349 postings still in
  «Нужно уточнить» (the rules are unchanged).
- The profile form: the hint is present, `aria-describedby="country-hint"`, the label
  reads the same.
- A throwaway test account with country DE: no notice, 2 eligible and 28 to clarify.
  Nothing was written to the owner's profile.

**Checks.** `npm run check` exit 0; `npm run test:coverage` exit 0 (413 tests; lines
83.2, branches 86.9, functions 92.1). Not run: `npm run build`, `npm run test:e2e` (the
e2e profile test finds the country field by its label, which did not change).

**Limitations.** The hint is permanent text, not shown only to an empty field. The
owner's own profile still has no country: the product now says why, the owner decides
what to enter. A missing timezone has no notice (see "Not included").

**Rollback:** `git revert`.
