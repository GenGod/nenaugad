# S1-006 — the third source Remote First Jobs (rights → adapter → activation)

**Status: implemented, tested locally and reviewed; matrix owner-approved 2026-11-02; not
activated.** The owner asked to add more job sources and chose
Remote First Jobs after a live review of the four M3 candidates in the registry
(2026-11-02, this file's "Rights review").

**Result:** the Remote First Jobs source is connected on the Himalayas/Jobicy track: an
owner approval of the rights matrix → an adapter (a 500-job window, 5 pages) with the
policy disabled → a separate review → activation by a separate owner decision. Once
active, its explicitly remote postings appear in the catalog, matching and saved with
attribution and a link to the Remote First Jobs listing.

**Not included:** closure checks (the API has no status endpoint; absence from the
window never closes anything, retention tombstones after 720 h, as for the others);
the paid unlimited API; RSS; category or query filters; sending text to the AI
provider; the other candidates (Remote OK, Remotive, ATS boards).

## Rights review (live, 2026-11-02)

Pages read: `https://remotefirstjobs.com/jobs-api` (the API page with its own "Terms of
Use"), `https://remotefirstjobs.com/terms` (general site terms, updated Nov 9, 2025),
the API's `_README_` field, and the JobsCollider GitHub README (same operator:
`jobscollider.com` now redirects to `remotefirstjobs.com`). One research GET of page 0
(100 jobs), not stored in the repository.

- The API page: the API "is free and public". Two rules: "Credit us" (a link to Remote
  First Jobs and naming it as the source) and "Do not republish", which the page spells
  out as not submitting their jobs to third-party websites (LinkedIn Jobs, Google Jobs,
  Jooble). Our card is an excerpt and a link on our own site, which is the integration
  the page describes; the owner should read the heading as written when approving
  `publish_excerpt`. Non-compliance "may lead to access denial". Paid unlimited access
  exists; not used.
- The general terms are template text that forbids copying "unless and except as is
  expressly provided" in them; the API page is the express provision for API use.
- Nothing on AI, ML, training, retention or poll frequency. "Jobs are updated every 10
  minutes"; 24-hour delay after publication; 5 pages of 100 per query.
- Contract seen live: `id` is a lowercase slug (max 73 chars in the sample), `url` is
  `https://remotefirstjobs.com/companies/<company>/jobs/<id>`, `published_at` has **no
  offset**, read as UTC (the newest job, 13:30:55, was visible 44 min after the 24 h delay,
  which no western offset allows; an eastern one such as CET is not ruled out, so freshness
  may be off by an hour or two — an open assumption), `salary_min`/`salary_max` are **USD per year converted by
  the source** (a €4,600/month posting reads 61614; `$20-30/hr` reads 41600–62400; 0 =
  none), `locations` is up to 3 country names (36 of 100 empty, 3 `[""]`).
- **Not remote-only:** 29 of 100 postings mention hybrid, on-site or in-office work,
  several plainly hybrid ("3 days per week in our Munich office").

Other candidates, for the record: Remote OK (≈99-job window, dofollow backlink required,
clean terms, low volume — a later task), Remotive (the public API returns 12 jobs; the
site terms of March 2026 forbid copying listings — skip), JobsCollider (merged into this
source).

## Owner decisions (2026-11-02)

1. **Explicit remote only.** A posting reaches the main catalog only when its title or
   text says it is remote and nothing says hybrid, on-site or in-office. An office marker
   excludes it (a conflict with the feed's "remote jobs" claim, as for Jobicy). A posting
   with neither goes to needs-review (hidden while `showNeedsReview` is off).
2. **Local ML only.** `process_with_ml` is allowed (local embeddings and the ranker;
   nothing leaves the machine); `send_to_ai_provider` stays `unknown`; training denied.
3. **Matrix approved** (2026-11-02, after the review and both repair cycles): the
   proposed matrix below, unchanged; policy v2 `status: "approved"`, `approved_by:
   "owner"`, `enabled: false`. Not decided yet: the residual risk of the remote rule, and
   activation.
4. **Activated** (2026-11-02, after the merge: "switch this resource on if it's
   ready"). The main session judged it ready (reviewed, approved, merged, local checks
   green, CI running) with the remote rule's residual risk accepted by activating, and
   checked by hand every posting the first live import put in the catalog. Policy v3
   `enabled: true`.

## Proposed permission matrix (for owner approval)

| Permission | Value | Basis |
|---|---|---|
| fetch, cache, store_full_text, store_excerpt, derive_fields | allowed | the API is offered for integration "into your website or application" and returns the full HTML description |
| process_with_ml | allowed | owner decision 2 (local only) |
| send_to_ai_provider | unknown | owner decision 2; nothing in the terms |
| publish_excerpt | allowed | integration with credit and a link |
| publish_full_text | denied | as for the other sources; the listing is the route |
| syndicate_google_jobs | denied | explicitly forbidden |
| index_web_page, send_email, train_model, direct_apply, bulk_export | denied | not granted |

`min_poll_interval_seconds` 21600 (6 h; 5 requests a run), `max_retention_hours` 720,
attribution required ("Remote First Jobs", backlink, `nofollow`, logo `unknown`),
`apply_route: source_required`, `valid_until` 2026-12-23 (re-reviewed with the other two).
Until the owner approves: `status: "pending"`, `enabled: false`, and nothing runs.

## Acceptance

1. The policy is pending and disabled: `permissionFor` denies every operation, the import
   refuses, the catalog and matching show 0 cards of this source. Approval and activation
   are separate owner steps; rollback is `enabled: false`, no UI edit.
2. The mapper follows the live contract: the slug id and the pinned listing URL are
   validated; `published_at` without an offset is read as UTC; salary is USD/annual marked
   as converted by the source, 0 is none; `locations` become an incomplete country list
   (`exhaustive: false`), empty means unspecified, never worldwide; the HTML description
   only as text; the card excerpt is cut from the text.
3. The remote rule of decision 1, with its evidence quoted on the snapshot; measured on
   the 100-job sample and reported (main catalog / needs-review / excluded).
4. Import: pages 0–4 in order, stopping at a short page; the window is always partial
   (absence ≠ closure, miss counters do not grow); a failed first page imports nothing, a
   failed later page keeps the pages read; idempotent; the 6 h poll gate.
5. Transport only to `remotefirstjobs.com`, no redirects, the page number validated.
6. Snapshot IDs of the new source pass the ID checks of events, saved/hidden, feedback
   and letters; the database accepts the source (migration); the e2e fixture backend does
   not change.
7. Terms: the API page is snapshotted and fingerprinted; the offline terms test covers
   the new policy.

## Plan

1. `npm run terms:check -- --write --source=remote_first_jobs` after adding its manifest
   entry; the policy's `terms_hash` by hand.
2. `src/domain/source-contracts.ts`: one list of snapshot sources and one snapshot-ID
   pattern, used by `events.ts`, `profile-service.ts`, `feedback-service.ts`,
   `letters/service.ts`, the catalog and matching services and the worker.
3. `source-policies.ts`: the pending policy. `fetcher.ts`: `fetchRemoteFirstJobsPage`.
   `remote-first-jobs-fixture.ts` (mapper + synthetic contract fixture) and
   `remote-first-jobs-adapter.ts` (the page walk). Migration `0025`.
4. `scripts/import-remote-first-jobs.ts`, `npm run import:remote-first-jobs`; the worker.
5. Tests: unit (policy, mapper, remote rule, geography, salary, dates, paging, fetcher
   pinning, disabled refusal, ID patterns, terms loop); the registry entry updated.

## Result (2026-11-02)

**Implemented, tested locally and reviewed (two repair cycles used); matrix approved by
the owner 2026-11-02; not activated, not committed.** The policy is `approved` and
`enabled: false`: nothing is fetched or shown.

- `remote-first-jobs-fixture.ts`: the mapper and a 3-record synthetic contract fixture
  (remote, hybrid, silent). Rejects a bad slug (`[a-z0-9-]{1,120}`, which keeps evidence
  ids inside the contract's 160 limit), a URL off `remotefirstjobs.com` or naming another
  listing, empty title/company/description, a bad date, a negative or non-numeric salary,
  non-string locations.
- The remote rule (decision 1), three tiers; errors may only run toward hiding.
  1. An office **statement** → `conflicting`, excluded: in the title "hybrid" (not
     "hybrid cloud/IT/apps…"), "on-site", "in-office", "office-based", "non-remote", "not
     … remote"; in the text "hybrid role/work/working/model…", "on-site role", "N days a
     week in the … office" or "office … N days a week", an obligation ("must / required
     to work on-site"), "not (100%) remote".
  2. **Any office vocabulary** in the title or text blocks a confirmation → `unknown`,
     needs-review: "hybrid", "on-site/onsite", "office(s)" (not "home office"), "in
     person", "commut…", "relocat…", "HQ/headquarters", "partially remote", "work from
     home N…". Listing office phrasings one by one always missed some, so the word is
     enough; "Microsoft Office" or "Office Manager" go to review too.
  3. Only then a remote **label** in the title ("(Remote)", "[Remote]", "- Remote" at the
     end, "· Remote", "Remote/Travel", "- 100% Remote - US"; not "Remote Sensing
     Scientist", "Remote-First Company", "Remote-friendly") or a remote statement in the
     text ("fully remote", "remote-only", "work from anywhere", "Location: Remote", "this
     role is remote", "remote role/position") → `confirmed`, main catalog; "temporarily
     remote" → temporary, excluded. "Remote-first" (a company's culture) does not confirm.
  Neither → `unknown`, needs-review. Unicode hyphens and dashes read as "-" and a soft
  hyphen as nothing before matching. The matched words are the workplace evidence quote.
- **Measured on the 100-job research sample: 13 main catalog, 72 needs-review, 15
  excluded, 0 rejected.** Of the 42 postings whose title or text has any office
  vocabulary, **0 reach the main catalog** (15 excluded, 27 needs-review). The 13
  confirmed were read by hand: each has a remote label or an explicit remote statement
  ("Location: Fully remote", "This is a remote position…", "a fully remote team", one
  German body: "wir zu 100 % remote arbeiten") and no office word, and none states an
  office arrangement in the forms the final review names below. **Five of the 13 mention
  required travel** ("15% estimated travel", "up to 20%", "as needed", "some travel to
  our Connecticut facility"): required travel is not detected, as for the other two
  sources (`mandatory_travel` stays `not_stated`); treating it as a blocker would be a
  new owner decision. Misses in the safe direction are many by design ("don't ask to work in
  our office (we don't have one)", "monthly in-person team days", "This hybrid role
  covers the full lead lifecycle" on fully remote jobs). **At this rate a 500-job window
  shows about 65 postings**; the rest wait for review, hidden while `showNeedsReview` is
  off.
- **Review (fresh-context `reviewer`, 2026-11-02): one high finding, repaired in two
  cycles — the project's limit.** H1: the first rule (42 main) confirmed hybrid and
  on-site postings ("(Non-Remote)" titles, "Location: Remote / Hybrid", "Remote-first.
  Work model: Hybrid", "Work location: In person", "Remote Sensing Scientist"). Cycle 1
  (17 main) fixed those; the re-review still found office wording without "in" ("work
  from our London office", "commute to", "relocation", "Berlin HQ"), Unicode hyphens
  ("on‑site") and "Remote-First Company" titles confirming. Cycle 2 made any office
  vocabulary block a confirmation. All 34 review probes are rows of the unit table, with
  more. Low findings fixed: an exhaustive importer switch in the worker (a fourth source id
  is a type error, not Remote First Jobs' importer); an impossible date ("02-30") is
  refused, not rolled over; a listing URL with any "?" or "#" is refused; a null or scalar
  in a page is one rejected record, not a failed run; the page-cap test proves the clamp.
  Recorded for the owner: B62 (disabling a source does not withdraw saved postings or
  expire stored text; all sources) and B63 (the switched-off batch path asks no per-source
  provider right).
- **Final review of cycle 2: no regression; residual risk (the repair limit is reached, so
  these are not fixed in this task).** With a remote label or an English remote phrase,
  these still reach the main catalog: (1) office words in another language or inside a
  longer word ("Hybrides Arbeiten … vor Ort", "au bureau", "presencial", "Hybridmodell");
  (2) workplace nouns other than office/HQ ("at our Paris studio", "on our Austin campus",
  "our Austin facility weekly", "our Denver site three days a week", "the lab twice a
  week", "WFH 2 days a week", "field-based"); (3) an arrangement written into the title
  after the label ("Engineer (Remote, 2 days/wk in Austin)", "Engineer | Remote | Austin,
  TX (2x/week)"); (4) a negated phrase other than "not … remote" ("No remote position
  available", "Remote: No"); (5) required travel. None of these occurs among the 13
  confirmed postings of the sample. A regex reading of free text cannot be closed
  completely; the owner can accept the residual risk, ask for a follow-up task (more
  vocabulary, a travel rule, or a model-based check), or keep the source off.
  Follow-ups: (5) travel in [B64-001](B64-001-required-travel.md); (1)–(4) in
  [B65-001](B65-001-remote-rule-residual.md).
- `remote-first-jobs-adapter.ts`: pages 0–4 in order, a page shorter than 100 ends the
  walk; failed first page → `retry_scheduled`, nothing saved; failed later page → the
  pages read are imported, `interrupted`; always `complete: false`; the 6 h gate.
- `fetcher.ts`: `fetchRemoteFirstJobsPage({ page })`, pinned host, no redirects, only
  `page` 0–4 is sent (one live HEAD confirmed `application/json`).
- One list of snapshot sources and one snapshot-ID pattern in `source-contracts.ts`,
  used by events, saved jobs, hidden jobs, letters, the catalog, matching and the worker
  (they were seven hard-coded copies). Migration `0025` widens the source CHECK.
- `npm run import:remote-first-jobs` refuses until approved and enabled; the worker
  schedules the source by its policy. The extraction pass sends nothing for this source
  (`send_to_ai_provider` unknown).
- Terms snapshot `docs/sources/terms/remote-first-jobs-api.txt`; the registry entries of
  the four candidates re-checked today.
- Coverage ratchet lines 84 → 85 (measured 85.21 / 88.70 / 93.71).

## Activation (2026-11-02)

- `npm run import:remote-first-jobs` (exit 0): 5 pages, `page_cap`, **500 mapped, 0
  rejected, 498 created** (2 repeats across pages: the window moved while read);
  extraction `no_permission` — nothing sent, $0. Migration 0025 applied to the local
  database by the same run.
- **498 stored: 102 main catalog (20%), 314 needs-review, 82 excluded.**
- **Hand check of all 102 confirmed postings** for the residual patterns of the final
  review (other-language office words, studio/campus/facility/site/lab, WFH, field-based,
  title qualifiers, "no remote", travel): **no office arrangement found.** The non-travel
  hits were all false ("Site Reliability Engineering", "Label Studio", "WFH setup
  reimbursement", a one-time fingerprinting at a government facility). **About 13 of the
  102 require travel**, two of them up to 50% ("national travel expected up to 50%",
  "a remote role with up to 50% travel"); travel is not detected for any source.
- `npm run embeddings:index -- --embedder=local --source=remote_first_jobs` (exit 0):
  498/498 embedded locally (`qwen3-embedding-0.6b-int8`), 0 invalid; nothing left the
  machine.
- The running dev server's `/jobs` shows Remote First Jobs cards with "Источник: Remote
  First Jobs", the excerpt, the converted salary and an "Открыть на Remote First Jobs"
  link to the listing; all 48 such links carry `rel="nofollow noreferrer"`, no logo.
  CI on the merge commit `21a447d`: success.
- AGENTS.md, README, ARCHITECTURE and the status snapshot now name three live sources.

**Not done:** closure checks; the "Remote OK"
task.

**Risk: high** (source rights). Effort `xhigh`; a `reviewer` pass before owner approval.
**Rollback:** `enabled: false` stops fetching and every public surface (catalog,
matching), extraction and embeddings; the migration only widens a CHECK. It does **not**
withdraw postings users already saved or hid, and stored text is not retention-expired
while the source is off — true of all three sources, recorded as B62 for the owner.
**Data:** public job postings; no personal data. **Spend:** none (the free public API;
provider transfer not granted).
