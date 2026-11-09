# S1-007 — the fourth source RemoteJobs.org (rights → adapter → activation)

**Status: implemented and tested locally 2026-11-07, reviewed (one repair cycle used);
matrix approved by the owner 2026-11-07 (decision 6) and activated by the owner the same
day as a separate decision (decision 7): policy v3 `approved`, `enabled: true`; first live
import run; committed as `dacd863`, merged into main as `230c48e` and pushed at the owner's
word ("Merge into main", "Push main"); CI green on `230c48e` (run 42439213313). Accepted
by the owner 2026-11-09 ("accepted S1-007").** The owner asked to add new job sources (2026-11-06) and chose
RemoteJobs.org after a live review of the remaining registry candidates and several new
ones (this file's "Candidate review"). See "Activation and first live run" under "Result".

**Result (target):** RemoteJobs.org is connected on the Himalayas/Jobicy/Remote First Jobs
track: an owner approval of the rights matrix → an adapter with the policy disabled → a
separate `reviewer` pass → activation by a separate owner decision. Once active, its
remote postings appear in the catalog, matching and saved with "Powered by RemoteJobs.org"
attribution and the source's own application link.

**Not included:** the v2 discovery endpoint and the MCP server; closure checks (there is
no status endpoint); a full-catalog crawl (20,210 jobs at 50 per request is 400+ requests,
two hours at the documented limit); sending text to the AI provider; RemoteJobs.org's
Career Agent; the other candidates.

## Candidate review (live, 2026-11-06)

Three research subagents read the registry's unreviewed candidates and several new ones;
their readings came through fetch summaries unless stated. Verdicts:

- **RemoteJobs.org — chosen** (below).
- **Remote OK** — clean but small: ≈100-job window, ≈5 new a day, a *followed* backlink
  (no `nofollow`) and the name required; no licence to store full text. A later task.
- **4dayweek.io** — ≈8,800 remote jobs, free API; terms bar using results to populate a
  competing job board. Written permission needed.
- **ATS public APIs** (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee,
  Teamtailor, Personio) — endpoints documented for the employer's own careers site; every
  vendor says the job data belongs to the employer. Per-employer permission (or the
  SmartRecruiters partner route). Lever and Ashby have the best structured remote fields.
- **We Work Remotely** — skip: its API Terms (read in full in the browser) forbid using
  its data for a job advertising or job search service and forbid storing it, and the ban
  covers all of its data, the RSS feed included. One subagent rated it a candidate from a
  keyword scan of the general terms only.
- **Skip** (no reuse channel, or the terms forbid this use): Remotive, Working Nomads,
  Arbeitnow (site terms non-commercial), The Muse (not remote-only, no redistribution),
  Adzuna (licence after a 14-day trial), Jooble (500 lifetime requests, no republishing),
  Findwork (terms unreadable without an account), DailyRemote, NoDesk, EU Remote Jobs,
  Dynamite Jobs, Jobspresso, Virtual Vocations, SkipTheDrive, RemoteWoman; Remote.co and
  FlexJobs (terms pages timed out; no public API found).

## Rights review: RemoteJobs.org (read in full by the main session, 2026-11-07)

Pages read: `https://remotejobs.org/developers/api` (undated) and
`https://www.remotejobs.org/terms` ("Last updated: October 24, 2026"). One research GET
(`/api/v1/jobs?limit=50&offset=0`), kept in the session scratchpad, not in the repository.

- **The API page** invites integration: public catalog requests need no credentials and
  the examples may run in a browser or on your own server. It tells integrators to cache
  results. It anticipates showing the description: the description
  field is sanitized HTML, and the docs ask you to apply your own HTML policy when
  displaying it.
- **Attribution** (section 07): if you display listings, include a visible link back to
  RemoteJobs.org and keep the job's application link intact. Suggested markup: a "Powered
  by RemoteJobs.org" link to `https://remotejobs.org`. No `rel` requirement either way,
  nothing on logos.
- **Limits:** below 200 requests per hour per IP, shared by v1 and v2 (best-effort, with
  `X-RateLimit-*` headers and `Retry-After` on 429); v1 returns at most 50 jobs a request.
  Nothing on poll frequency beyond "cache when fresh results are not needed".
- **The terms** ("API and site content"): use the API according to the documented access,
  attribution and limits. **Third-party job descriptions belong to their respective
  owners; access to the directory does not transfer ownership or authorize uses that
  infringe the owners' rights.** RemoteJobs.org says it aggregates listings from third
  parties and accepts employer submissions. No clause on competitors, AI/ML, training,
  retention or redistribution. Bypassing rate limits is forbidden.
- **Reading:** RemoteJobs.org gives a documented channel and conditions, but no licence
  over the third-party text itself; the owners' rights sit underneath. An excerpt with a
  link on our own site is the integration the API page describes. Storing full text
  internally and running local embeddings over it is not addressed. The residual risk is
  provenance: we do not know which upstream each posting came from, or whether that
  upstream's terms would object (some boards in the review above forbid aggregation).

## Live contract (the 50-job sample, 2026-11-07)

- Envelope: `data[]`, `pagination {total: 20210, limit, offset, has_more}`, `meta
  {powered_by, url, docs, search}`; `Cache-Control: no-store` on the HTTP response.
  Newest first; offset paging; "listings can change between requests".
- `id` is a UUID; `url` and `apply_url` are the same `https://remotejobs.org/remote-jobs/
  <slug>` page on all 50; `employer_job_id` set on 1 of 50; `direct_apply` null on all.
- `posted_at` is a date with a zero time (`2026-11-06T00:00:00+00:00`): **day precision
  only**. 49 of the 50 newest were posted 2026-11-06, one 2026-11-07, so the feed adds
  well over 50 postings a day (not measured further).
- **Not remote-only.** `applicant_location_requirements.work_arrangement`: remote 26,
  unknown 23, field missing 1 (`location_normalization.work_arrangement` is unknown on
  49). The documented `workArrangement=remote` filter exists.
- **Geography is structured and conservative**: `applicant_location_requirements` has
  `scope` (restricted on 49), `status` (known 39, partial 10), ISO `allowed_countries`,
  `excluded_countries`, subdivisions, timezones, `worldwide_permission_verified` (false on
  all 49). The docs state that bare "Remote" does not establish worldwide eligibility.
  It is **derived by their pipeline**: the `extraction_version` names an LLM
  (`claude-haiku-5-5`) and a `geography-prompt` version. 49 of 50 also name a
  `greenhouse-content/1` step; whether that marks the posting's origin is not stated.
- Salary: native currency and period, not converted (none 25, USD/year 17, USD/hour 5,
  CAD/year 2, USD/month 1). `type` and `employment_types` present. All English.
- `description`: sanitized HTML, 1.3–14 kB (median 5.5 kB), with a RemoteJobs.org apply
  link appended. `search_facts` carries their extracted skills and experience.

## Owner decisions (2026-11-07)

**All five approved as recommended** (owner, 2026-11-07: "Approve as recommended"):
full text, derived fields and local ML allowed (nothing leaves the machine); only
`workArrangement=remote` requested, with our office-vocabulary veto on top; their
structured geography used with its status, never widened to worldwide; every 6 h, up to
20 pages of 50, stopping early at a page of already-seen postings; `nofollow` kept. The
question to RemoteJobs.org below is recommended before activation and does not block the
adapter. The options as they were put to the owner:

1. **Full text and local ML.** Allow `store_full_text`, `derive_fields` and local
   `process_with_ml` (embeddings and the ranker; nothing leaves the machine) on the API
   page's reading, as for Remote First Jobs — or keep them `unknown` until RemoteJobs.org
   confirms in writing (then cards would show without matching, which makes the source
   nearly useless). Recommended: allow locally, and send the question below before
   activation.
2. **Which postings.** Request only `workArrangement=remote`, and still apply our own
   office-vocabulary veto (any hybrid/on-site/office statement in the title or text →
   excluded or needs-review, as B65 does for Remote First Jobs), or fetch everything and
   classify ourselves. Recommended: the filter plus our veto.
3. **Geography.** Use their structured `allowed_countries`/`excluded_countries` as the
   source's restriction, marked as source-derived (`status: partial` → not exhaustive),
   or ignore it and read only the location text with our shared geography rules.
   Recommended: use it with its status, never widening to worldwide.
4. **Volume per run.** Proposed: every 6 h, newest first, up to 20 pages of 50 (1,000
   postings, 20 requests), stopping early at a page of already-seen postings.
5. **Link rel.** Keep `nofollow` on the backlink like the other sources (nothing requires
   a followed link) — recommended — or follow it.

6. **Matrix approved** (owner, 2026-11-07: "Approve matrix", after the implementation,
   the reviewer pass and its repair cycle, and the credit-line decision): the proposed
   matrix below, unchanged, with the "Powered by RemoteJobs.org" credit line on every
   card. Policy v2: `status: "approved"`, `approved_by: "owner"`, `enabled: false`.
7. **Activated** (owner, 2026-11-07: "activate"), as a separate decision after the matrix
   approval, with the question below still unsent (it was recommended before activation,
   not required). Policy v3: `enabled: true`. Rollback: `enabled: false`.

**Question for RemoteJobs.org** (the owner sends it; drafted here, not sent):

> Hello — we run Nenaugad, a small remote-job search site. We'd like to show RemoteJobs.org
> listings from your public API as a title, company and short excerpt with "Powered by
> RemoteJobs.org" and your application link intact, refreshing a few times a day within
> your rate limit. To match postings to a candidate's profile we would also store the
> description internally and compute embeddings on our own machine (no third-party AI,
> no model training, no redistribution). Is that use fine with you, and can you tell us
> whether any of your upstream sources restrict it? Contact: support@remotejobs.org.

## Proposed permission matrix (decisions applied; owner approval after the review)

| Permission | Value | Basis |
|---|---|---|
| fetch, cache | allowed | documented public API; caching recommended |
| store_excerpt, publish_excerpt | allowed | the API page's "if you display listings" attribution clause |
| store_full_text, derive_fields, process_with_ml | allowed (ML local only) | decision 1 |
| send_to_ai_provider | unknown | nothing in the terms; owners' rights reserved |
| publish_full_text | denied | as for the other sources; the listing is the route |
| syndicate_google_jobs, index_web_page | denied | not granted; passing jobs on is not our use |
| send_email, train_model, direct_apply, bulk_export | denied | not granted |

`min_poll_interval_seconds` 21600 (6 h), `max_retention_hours` 720, attribution required
("RemoteJobs.org", backlink to `https://remotejobs.org` and the listing, `nofollow` per
decision 5, logo `unknown`), `apply_route: source_required` (the `apply_url` on
remotejobs.org, never a direct employer link), `valid_until` 2026-12-23 (re-reviewed with
the other three). Until the owner approves: `status: "pending"`, `enabled: false`.

## Acceptance

1. The policy is pending and disabled: `permissionFor` denies everything, the import
   refuses, catalog and matching show 0 cards of this source. Rollback is `enabled: false`.
   *Still met after the matrix approval (decision 6):* policy v2 is `approved` with
   `enabled: false`, and the unit and DB tests prove the same refusals.
2. The mapper follows the live contract: UUID id, the listing URL pinned to
   `remotejobs.org/remote-jobs/<slug>`; `posted_at` read as a date (day precision recorded,
   no invented time); salary in its native currency and period, never converted; geography
   from the structured fields with their status, never worldwide unless verified; HTML
   description only as text; the excerpt cut from the text.
3. The remote rule of decision 2, measured on a research sample and reported (main
   catalog / needs-review / excluded), with the confirmed postings read by hand.
4. Import: newest-first pages in order up to the cap, a short or empty page stops; the
   window is always partial (absence ≠ closure, miss counters do not grow); a failed first
   page imports nothing, a failed later page keeps what was read; idempotent; the 6 h gate;
   `Retry-After` respected.
5. Transport only to `remotejobs.org`, no redirects, parameters validated.
6. Snapshot IDs of the new source pass the ID checks of events, saved/hidden, feedback and
   letters; the database accepts the source (migration); the e2e fixture backend does not
   change.
7. Terms: the API page and the terms page are snapshotted and fingerprinted; the offline
   terms test covers the new policy; `terms:check` watches both.
8. Cards show "Powered by RemoteJobs.org" with a visible link back and the intact listing
   link; cross-source dedup is measured against the other three sources.
   *Met 2026-11-07 (owner decision "Add Powered-by line"):* the credit line comes from the
   policy's `attribution.credit_line` and shows on every surface that lists a posting, next
   to the unchanged "Источник … Открыть на RemoteJobs.org" listing link (see "Result",
   Attribution). Dedup: 0 of 50 (see "Cross-source dedup").

## Plan (after approval)

1. Terms snapshots and manifest entries (`terms:check -- --write --source=remotejobs_org`);
   the policy's `terms_hash` by hand.
2. `source-contracts.ts`: the source in the snapshot source list and ID pattern.
3. `source-policies.ts` (pending policy), `fetcher.ts` (`fetchRemoteJobsOrgPage`),
   `remotejobs-org-fixture.ts` (mapper + synthetic contract fixture),
   `remotejobs-org-adapter.ts` (the page walk), migration `0028`.
4. `scripts/import-remotejobs-org.ts`, `npm run import:remotejobs-org`; the worker.
5. Tests: policy, mapper, remote rule, geography, salary, dates, paging, fetcher pinning,
   disabled refusal, ID patterns, terms loop. The registry entry updated.
6. `reviewer` pass (fresh context), then owner approval of the matrix and, separately,
   activation.

**Risk: high** (source rights). Effort `xhigh`; a `reviewer` pass before owner acceptance.
**Rollback:** `enabled: false` stops fetching and every public surface. As for the other
sources, it does not withdraw postings users already saved or hid (B62).
**Data:** public job postings; no personal data. **Spend:** none (free public API; no
provider transfer).

## Result (2026-11-07)

**Implemented and tested locally. A fresh-context `reviewer` found nothing blocking; one
repair cycle was used and re-reviewed with no regression. Matrix approved by the owner
2026-11-07 (decision 6): policy v2 is `approved` and `enabled: false`. Not activated, not
committed.** Without `enabled`, `permissionFor` denies every operation, so nothing is
requested, stored or shown. `npm run import:remotejobs-org`
exits 1 with `SOURCE_NOT_ENABLED`, and the catalog and matching skip the source.

**Code.**

- **`source-contracts.ts`.** `remotejobs_org` is added to `SNAPSHOT_SOURCE_IDS` and
  `SNAPSHOT_ID_PATTERN`. A UUID fits `[a-z0-9-]{1,150}`, so events, saved/hidden,
  feedback and letters accept the source's ids.
- **Migration `0028`.** Widens the source CHECK and adds
  `import_state.retry_not_before`.
- **`source-policies.ts`.** `policy/remotejobs_org/1` (v1 pending; v2 `approved`,
  `enabled: false` after decision 6) carries the proposed matrix
  exactly:
  - `send_to_ai_provider` is unknown;
  - denied: full text, Google Jobs, indexing, email, training, direct apply, bulk export;
  - polling every 6 h, retention 720 h, valid until 2026-12-23;
  - attribution "RemoteJobs.org" with a backlink and `nofollow`; logo unknown;
    `source_required`.
- **`fetcher.ts` `fetchRemoteJobsOrgPage({ offset })`.**
  - The host is pinned to `remotejobs.org` with `redirect: "error"`. Only offsets 0–950
    in steps of 50 are allowed.
  - It sends
    `workArrangement=remote&sort=recent&limit=50&offset=N&requestVersion=job-search-request/1`.
    `sort` is the documented default, sent because the walk relies on newest first.
    `requestVersion` is sent because the API page asks for it "when relying on additive
    filters".
  - The envelope must answer the request: its offset, `has_more`, at most 50 jobs, and
    `meta.search.request_version`. Otherwise the page fails.
  - A 429 returns its `Retry-After`: seconds or an HTTP date, at least 1 s, never
    shortened.
  - **Not sent live:** neither `sort` nor `requestVersion`. The one research GET was made
    without them. If the version is not echoed, every page fails closed and the source
    pauses after five attempts. Check this on the first run after activation.
- **`remotejobs-org-fixture.ts`.** The mapper and a 3-record synthetic contract fixture.
  - **Remote rule (decision 2).**
    - The source's claim is the record's own `applicant_location_requirements.work_arrangement`
      or `location_normalization.work_arrangement` = remote; the filter reads both.
    - A hybrid or onsite value in either field excludes the posting.
    - A record with neither field remote is refused (`NOT_REMOTE`).
    - On top sits the Remote First Jobs office-vocabulary veto, exported unchanged as
      `readOfficeVocabulary`: an office statement excludes, any other office word sends
      the posting to needs-review, and temporary remote work excludes.
    - Required travel is read by B64's detector.
  - **Geography (decision 3)** comes from their structured reading and is never wider
    than it says:
    - excluded countries always stay;
    - worldwide only when `worldwide_permission_verified`, with status known and nothing
      beside it, and then it is tested against the text. Any other worldwide reading is
      unspecified;
    - a list counts only when its status is known or partial, with no `unresolved` note
      and no condition other than context or a working-hours requirement. Otherwise no
      country is allowed, and the condition's words are kept as evidence;
    - a country named with subdivisions, allowed or excluded, leaves the list;
    - the list is exhaustive only when known, with no subdivision or region;
    - an empty or null reading is unspecified.
  - **Schedule.** A required working-hours condition makes the schedule unknown and
    ambiguous (TIME-01 unknown), with the source's words.
  - **Salary.** Native bounds, currency and period (hour…year → hourly…annual), never
    converted. A range is structured only when both currency and period are known;
    otherwise the source's text is kept.
  - **Dates.** `posted_at` keeps its offset. A zero time is recorded as day precision
    (evidence `posted`) and is never given a time. The second sample carried real times.
  - **Employment types.** Google JobPosting values; VOLUNTEER, PER_DIEM and OTHER map to
    unknown.
  - **Text and excerpt.** The description is stored as plain text without the source's
    appended "Apply directly on RemoteJobs.org: …" line. The excerpt is the first 300
    characters, cut at a word.
  - **Rejected records:** an id that is not a UUID; a listing outside
    `https://remotejobs.org/remote-jobs/<slug>` or carrying `?` or `#`; an `apply_url`
    other than the listing; an empty title, company or text; a bad date or salary;
    malformed geography or employment types.
- **`remotejobs-org-adapter.ts`.**
  - Pages are read in order, up to 20. A caller can lower the cap, never raise it.
  - An empty page, a short page or `has_more: false` ends the walk (`complete`). A full
    page whose postings were all stored by earlier runs also ends it (`seen`).
  - Every run is `complete: false`: absence is not closure, and miss counters never grow.
    The 6 h gate applies.
  - A failed first page imports nothing and leaves the window unused. A failed later page
    keeps what was read (`interrupted`).
  - **Retry-After.** A 429 stores `retryNotBefore`, or one hour (the documented window)
    when no header is readable. Before that time the adapter refuses without making a
    request, and the scheduler's `nextDueAt` is not due, across restarts. A clean run or
    `worker -- --resume` clears it.
- **Scripts.** `scripts/import-remotejobs-org.ts` (`npm run import:remotejobs-org`), and
  a branch for the source in the worker's exhaustive importer switch. The worker log
  carries `nextEligibleAt`.
- **Terms.** `docs/sources/terms/remotejobs-org-api.txt` and `remotejobs-org-terms.txt`
  were written only by `npm run terms:check -- --write --source=remotejobs_org`.
  - Both match the reading above: section 07 attribution, the 200/h limit, "Wait for the
    number of seconds in Retry-After", and the terms dated October 24, 2026 with the
    owners'-rights clause.
  - The manifest now holds several pages per source (`<id>:<page>`).
  - A policy's `terms_hash` is `policyTermsHash`: for one page its own hash, for several
    the hash of their hashes in key order.
  - The offline test checks every page and every policy.
  - Himalayas and Jobicy were not re-baselined.
- **Registry.** The `remotejobs_org` entry is updated: at most 20 pages, the adapter
  facts, the sample split. `docs/OPEN_GAPS.md` gains B70 and B71.
- **Attribution** (owner decision 2026-11-07, "Add Powered-by line"):
  - **The contract.** The source policy's `attribution` gains an optional `credit_line`
    (`{ text, url }`), in `SourcePolicy`, `isSourcePolicy` and
    `03_DOMAIN_CONTRACTS.schema.json` (`schema_version` unchanged: the field is additive
    and optional). The validator takes plain text of 1–80 characters and an https URL
    only, so a policy cannot inject a link scheme.
  - **The value.** Only this policy sets it: `{ text: "Powered by RemoteJobs.org", url:
    "https://remotejobs.org" }`. The other three have none.
  - **Rendering.** `projectCard` carries it as `source.creditLine`, and
    `src/components/source-credit.tsx` renders it with `rel="nofollow noreferrer"`
    (decision 5, as every source link) and no logo (`logo_allowed` unknown). It appears
    on the catalog card, the matched card, saved and hidden rows and the "Что нового"
    digest, beside the unchanged "Источник … Открыть на RemoteJobs.org" listing link.
    The application link is untouched.
  - **Language.** The line stays in the source's exact English words, marked
    `lang="en"`. It is the attribution the API page asks for, a credit to the source by
    its own name rather than UI copy, so a translation would no longer be the markup it
    suggests.
  - **Tests.** A unit test covers the line's presence for this source (committed and
    approved) and its absence for the other three, plus the validator's refusals. A
    source-text test checks the five render points, the rel, no logo, and that no
    surface names the source. Node's type stripping cannot render `.tsx`, and e2e runs
    the fixture backend, which has no external cards.

### The second research sample (50 jobs, `workArrangement=remote`, 2026-11-07)

- **Volume.** `pagination.total` is 14,171 remote postings out of about 20,200.
- **Work arrangement.** `applicant_location_requirements` says remote on 48. On the other
  2 it is empty and `location_normalization.work_arrangement` says remote.
- **Status.** Known 39, partial 9.
- **Countries.** `allowed_countries` is empty on 5: US states only, or regions.
- **`unresolved` notes** on 7: a CET ±2 h window, "Charlotte, NC or nearby", a US-only
  salary range, Canada unconfirmed.
- **`conditions`.** Timezone (require and context), and licence (require for Utah, and
  context).
- **Salary.**
  - With amounts: 21 (USD year 12, USD hour 6, USD month 1, GBP hour 1, CAD year 1).
  - `salary_period: "year"` with no amount: 17.
  - Nothing: 10.
- **Dates and language.** `posted_at` had real times; the newest 50 spanned about 8
  hours. Nothing was translated.

### Remote rule measured (acceptance 3)

**25 main catalog, 24 needs-review, 1 excluded, 0 rejected.**

- **The exclusion is right.** "Remote Part Time Nurse Practitioner (NP) - Utah" says
  "This part-time … in-person role" at infusion centres. The source's field says remote;
  our veto excluded it.
- **The 25 confirmed postings were read by hand:** every work-mode sentence, and three in
  full. All 25 say remote in the employer's own text ("Location: Remote", "This is a
  remote, work-from-home position", "Fully remote work", "all-remote", "#LI-Remote",
  "LOCATION: United States of America : Remote"). Two need the owner's attention:
  - **Abbott, Principal Clinical Specialist.** Labelled remote, but it says "TRAVEL: Yes,
    50 % of the Time" and "regional EP implant case coverage": a field role. B64's travel
    reader misses that form field, so the posting shows as remote with no travel (B70,
    shared by every source).
  - **GitLab, Senior Professional Services Engineer.** "This role has a location
    requirement - Charlotte, NC or nearby". There is no office word, so the posting is
    confirmed. The source's `unresolved` note withholds the US, so GEO-01 is unknown
    (B71).
- **The 24 needs-review postings were not read in full.** Their triggers: office /
  offices / Office 11, in-person 5, commuter 2, hybrid 1, onsite 1 (an IT field
  technician), relocation 1, HR 1, "Büros" 1, "visit our accessibility site" 1. Most are
  benefits or boilerplate. These are false hides, the allowed direction.
- **At this rate a first run of 1,000 postings puts about 500 in the main catalog.**

### Cross-source dedup (acceptance 8)

0 of the 50 sampled postings merge with the 4,786 live rows of the other three sources in
the local database. That holds by dedup key, and also by company and title regardless of
geography; the check only read the database.

The overlap is probably underestimated:
- the sample covers only the newest ~8 hours;
- Remote First Jobs publishes 24 h late;
- Himalayas's newest stored posting is from 2026-09-25.

Measure again on the first live run.

### Review

**First pass** (fresh-context `reviewer`, 2026-11-07): **no blocking finding**. It
confirmed:
- the policy gate on every path;
- the terms hash;
- migration 0028;
- the veto's extraction preserves behaviour;
- the fetcher pinning;
- geography only ever narrows.

**Repair cycle 1** (hypothesis recorded with `npm run task -- repair`) fixed three
items, each now a row of the unit table:
- **Should-fix 2:** a location condition that was neither context nor a working-hours
  requirement left a known list passing.
- **Note 7:** a verified worldwide reading that named a region or countries was still
  worldwide.
- **Note 4:** `Retry-After` was cut at 24 h.

The sample split did not move (25 / 24 / 1).

**Re-review of the cycle:** no regression and no remaining widening. Its minor items were
applied within the cycle:
- `worker -- --resume` now also lifts a stored wait. Since the wait is never shortened, a
  hostile header must not park the source with SQL as the only way out.
- One comment and one test title were corrected.

**For the owner** (the matrix is approved, decision 6; these remain for activation):

1. **Attribution text: decided 2026-11-07** ("Add Powered-by line"), implemented as
   described under Attribution above. Every card now shows "Powered by RemoteJobs.org",
   linked to https://remotejobs.org, beside the listing link, so acceptance 8, the
   registry note and the drafted email agree with the card. As with every source, the
   links send `rel="nofollow noreferrer"`, so RemoteJobs.org sees no referrer.
2. **The `seen` stop** (decision 4) can skip a posting that lands behind a page already
   stored (day-precision dates, backfill by an aggregator). This affects coverage only,
   not rights.
3. **The question to RemoteJobs.org** (above) is still unsent; sending it before
   activation is recommended.

**Live requests made by this task:**
- one API GET (`/api/v1/jobs?workArrangement=remote&limit=50&offset=0`): status 200,
  `X-RateLimit-Remaining` 199. The 50 jobs are kept in the session scratchpad, not in the
  repository;
- the two terms pages, fetched by `terms:check --write`.

The rights review's unfiltered GET is recorded above.

### Checks (final tree, 2026-11-07)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (unit 492/492, lint, typecheck), after the credit line |
| `npm run build` | exit 0, after the credit line |
| `npm run test:e2e` | exit 0, 126/126, after the credit line (pages render it; e2e has no external cards) |
| `npm run test:coverage` (`PG_TOOLS_CONTAINER=nenaugad-db-1`) | exit 0, 650/650; 88.47 / 90.06 / 95.15, after the credit line |
| `npm run test:db` (same) | exit 0, 158/158 (final tree before the credit line; its DB tests also ran inside the coverage run above) |
| `npm run import:remotejobs-org` | exit 1, `SOURCE_NOT_ENABLED` (the intended refusal), again after the approval |
| After the matrix approval (policy v2) | `npm run check` exit 0 (492/492); `npm run test:db` exit 0 (158/158) |
| `npm run terms:check -- --write --source=remotejobs_org` | exit 0, the two pages only |
| After activation (policy v3) | `npm run check:agent` exit 0 (492/492); `npm run test:db` exit 0 (158/158); `npm run db:migrate` exit 0 (0028 applied locally); `npm run import:remotejobs-org` exit 0 (live, 349 stored) |

- **Running the DB suites.** They need `PG_TOOLS_CONTAINER=nenaugad-db-1`, as in
  DEPLOY-003 and B69-001. A first run without it failed only the 12 backup tests, with
  `PG_TOOL_NOT_FOUND` (no `pg_dump` on PATH).
- **Coverage ratchet.** Lines 87 → 88 and functions 94 → 95. Branches stay at 89: before
  the repair they measured exactly 90.00, on the gate.
- **The build** rewrote `next-env.d.ts`. That file is restored and is not part of this
  change; after the e2e run (`next dev`) it is unmodified.

**Not run** (before activation): a live import, which the policy refused, and the Docker
worker, whose image bakes the code in. Both ran after activation (below).

**Mock or live.** Synthetic fixtures and labelled, test-only approved clones of the
policy; a stubbed `fetch` in the fetcher test.

**Spend.** None: the API is free and no provider was called. Coding-host spend unknown.

**Rollback.** The policy is already off. Reverting the diff removes the source; `0028` is
additive (an empty nullable column and a wider CHECK).

### Activation and first live run (2026-11-07)

**Activated by the owner (decision 7).** Policy v3 sets `enabled: true`; nothing else in
the matrix changed. The tests now hold the committed policy as the active one and derive the
switched-off forms from it, as for Remote First Jobs: the unit policy test checks `fetch`
allowed, publishing on, no provider transfer, and a disabled or pending clone denying every
operation; the import-refusal test and the DB test use the policy with `enabled: false`; the
DB test now checks that the catalog shows only the confirmed fixture posting, with the credit
line and the listing link.

**Local database.** Migration 0028 was applied to the local database (`npm run db:migrate`,
`migrationsApplied: 1`) before the run; it had been applied only to the test database.

**The first run** (`npm run import:remotejobs-org`, from the host, exit 0):
- **7 pages, then `interrupted`.** Pages 1–7 passed the envelope check, so the API echoes
  `request_version` `job-search-request/1` and the `sort`/`requestVersion` parameters work
  live. Page 8 (offset 350) failed, and the report does not say why (B73). One manual
  request of that page a minute later answered 200 in 0.5 s with a valid envelope (50 jobs,
  445 kB, offset 350, the version echoed), so neither the 8 MB cap nor the 15 s timeout is
  the cause; the rate-limit counter suggests the failed request was not counted. Treated as
  transient: no repair cycle was opened on one unrepeated event.
- **349 stored, 1 rejected** (350 = 7 × 50). `import_state`: one run, 0 failures, no
  stored wait. The extraction pass reported `no_permission` and sent nothing ($0).
- **Split: 145 main catalog, 186 needs-review, 18 excluded** (42 / 53 / 5 %; the filtered
  sample was 50 / 48 / 2 %). All 186 for review are `unknown` by the office-word veto; all
  18 exclusions are office statements (`conflicting`, `mandatory_onsite: required`).
- **The exclusions read by their trigger** (one posting per employer, not in full): at least
  8 are remote roles hidden by a sentence about the company rather than the role ("remote
  and hybrid work options" in a perks list, Keeper's "100% remote … opportunity to work a
  hybrid schedule" near HQ, 1Password's remote-first section on 4 postings); 2 are right
  (the in-person nurse role from the sample, "role is Hybrid"); the rest are ambiguous.
  False hides, the allowed direction; recorded as B72.
- **Cross-source dedup.** 44 of the 349 share a dedup key with a live row of another source
  (43 Jobicy, 1 Himalayas); by company and title alone 83 (66 Jobicy, 19 Remote First Jobs,
  1 Himalayas). In the catalog 14 merge into one card: RemoteJobs.org's copy, the fresher,
  leads and the other board is listed beside it (`alsoListedAt`). For the other 30, our
  veto puts RemoteJobs.org's copy in review (27) or out (3) while Jobicy's is confirmed, so
  Jobicy's card shows alone. The overlap with Jobicy supports the provenance reading: the
  aggregator carries postings other boards also carry.
- **The catalog:** 4,178 → 4,309 cards (131 new). All 145 RemoteJobs.org cards carry the
  credit line; no other source's card does.

**The site in Docker** was rebuilt (`docker compose up -d --build`) so the worker and the web
app run this tree; the worker's next RemoteJobs.org run is due 6 h after the first.

**Live requests by the activation:** 7 import pages (plus the one that failed) and 2 manual
requests of page 8; `X-RateLimit-Remaining` 191 of 200 afterwards.

**Merge and CI (2026-11-08):** committed as `dacd863` on `feature/s1-007-remotejobs-org-source`,
merged into main as `230c48e` and pushed ("Merge into main", "Push main"). CI run 42439213313
on `230c48e`: Code quality, Build and Tests green; unit and DB tests with the coverage ratchet
650/650 (88.45 / 90.09 / 95.15); e2e 126/126. CI runs on fixtures and makes no request to
RemoteJobs.org. The record of this merge went in as `89d9c40`, merged as `bb42259` and
pushed; CI green on `bb42259` (run 42573095044).

**Owner acceptance:** 2026-11-09, "accepted S1-007", given in this session. Open at
acceptance: the question to RemoteJobs.org is unsent, and B70–B73 are open. By then the
worker had run the import 6 times with 0 failures (last run 2026-11-09 00:30 UTC).

**Next.**
1. Send the question to RemoteJobs.org (the owner).
2. B73: record the failed page's status in the import report (small, normal risk).
3. B72: perks boilerplate should not exclude (shared with Remote First Jobs; the B65 rule).
4. Follow-ups B70 and B71.
