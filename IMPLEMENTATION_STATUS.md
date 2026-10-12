# Nenaugad — status (ex-Atlas Starter)

A short snapshot of the current state, kept at about 120 lines at most. A task edits the
lines it changed and does not append history: details belong in its task file under
`tasks/`, and the narrative up to 2026-10-05 is frozen in
[docs/history/implementation-log.md](docs/history/implementation-log.md). Open items
with evidence: [docs/OPEN_GAPS.md](docs/OPEN_GAPS.md).
`implemented` != `tested locally` != `verified with provider` != `accepted` != `activated`.

**Updated:** 2026-10-12: the owner accepted [B37-001](tasks/B37-001-no-retry-after-uncertain.md) (no retry after
an uncertain call). 2026-10-09: the owner accepted [B44-001](tasks/B44-001-visual-baselines.md) (9 visual baselines
re-recorded for B42's hint) and [B43-001](tasks/B43-001-logout-redirect.md) (logout stays on this
origin). 2026-10-08: the owner accepted [B42-001](tasks/B42-001-missing-country-notice.md) (a notice
when the profile has no country) and [B41-001](tasks/B41-001-matched-page-latency.md) (`/matched`
18.9 s → 4.0 s cold, 1.5 s repeat, plus a loading state), and [B38-001](tasks/B38-001-clean-text-and-prompt-p2.md), after
[B36-001](tasks/B36-001-settlement-releases-own-hold.md),
[B35-001](tasks/B35-001-tariff-unit.md),
[B34-001](tasks/B34-001-import-extraction-cap.md),
[B32-001](tasks/B32-001-extraction-pass-progress.md), [B33-001](tasks/B33-001-extract-fields-error-codes.md),
[B31-001](tasks/B31-001-stuck-extraction-operations.md) and
[B29-001](tasks/B29-001-tombstone-vectors.md); on 2026-10-06 the owner accepted [B28-001](tasks/B28-001-input-keyed-derivatives.md) and
[B30-001](tasks/B30-001-card-excerpts.md).

## Switches and boundaries
- **Live AI is off** (`LIVE_AI_ENABLED=false`, a real switch since AI-007): no provider
  call happens.
- **Personal data stays inside the contour** (`personal-data-boundary.ts`): relevance
  scoring and letter generation are closed until a local model serves them. MODEL-001:
  the 1.5–1.7B CPU candidates fail the rubric; a 7–8B GPU spike is
  [MODEL-002](tasks/MODEL-002-gpu-spike.md).
- **Approved AI purposes:** `job_matching` (AI-004, 2026-10-01) and `extraction`
  (2026-10-04, job text only). `send_to_ai_provider` is granted to all three sources
  (AI-005). The user quota is $1/month; `npm run ai:holds` resolves stuck holds. Money
  is counted in micro-dollars (μ$, 1 cent = 10,000); before B35-001 (owner-accepted
  2026-10-07) the tariff was a tenth of the price, so every call was booked at a tenth of
  its cost.
  Automatic background batch scoring is off (AI-006).
- **Uploads:** `UPLOADS_ENABLED` gates the whole CV surface (every CV route, B22).
- **Not beta:** no restore, no public deploy, no owner acceptance of the whole.

## By area
- **Sources:** himalayas and jobicy, owner-activated (S1-002 2026-09-24, S1-003
  2026-09-25). Normalized terms fingerprints; jobicy holds `process_with_ml` (EDEC-001).
- **Import and catalog:** worker with schedules, backoff and a per-source circuit
  breaker (S1-004); jobicy closure checks (S1-005); cross-source dedup with provenance
  (A4); a cross-language near-dup queue for a human, nothing merged automatically
  (B5-001); expired records become tombstones, and the journal keeps 12 months (RET-001).
  A worldwide jobicy label is checked against the posting text: a stated residence
  rule narrows it or leaves the countries unknown, and an exclusion is kept (B24-001).
  Other jobicy labels are read part by part: countries only make the complete list, and
  a label that also names a region keeps its countries as an incomplete list (B25-001).
  Himalayas location restrictions become the allowed countries, by name or ISO code,
  and a non-empty list never becomes worldwide (B27-001). The local catalog was
  re-mapped to both once (REMAP-001, 2026-10-06: 518 rows, with a backup without posting
  text and a rollback proven on the real rows). Card excerpts are decoded once at import
  and an import no longer blanks the excerpts of records it did not fetch (B30-001,
  owner-accepted 2026-10-06; the 200 stored jobicy excerpts were decoded in place).
- **Auth and profiles:** manual private profile, explainable matching, saved jobs
  (S2-001, owner-accepted); hide with a reason and applied marks (S2-002).
- **CV intake:** offline text/txt/md/docx intake and private storage (S3-001,
  owner-accepted, activated locally); PDF text layer (S3-003).
- **Letters:** private CRUD, versions and editor (S4-001); deterministic validator
  (S4-002); general mode (S4-003). Generation is closed by the boundary above.
- **Matching and ranking:** `/matched` is ordered by the ranker v5 (v4 plus the urgency
  layer, B23 and B6-001): NDCG@10 0.892 against 0.421 for the catalog order on the
  golden set v4 (39 vacancies, A1 and DGAP-001). Skills dictionary v2 with Russian
  aliases (A3) plus 13,939 ESCO v1.2.1 skills with mandatory attribution (ESCO-001).
  Freshness, seen-set, negative preference, digest, journal, ghost demotion and shadow
  guardrails (A5–A10). Matching rules v4: GEO-01 never fails a candidate on an incomplete
  country list (B25-001).
- **Retrieval:** pinned local embedding model (`npm run models:fetch`), pgvector, dense
  leg, BM25 and RRF are implemented and measured but not switched on: BM25 alone beats
  fusion, and the ranker beats every leg (B1-001, B1-002, B2-001). The rerank input is
  measured (B3-001); its implementation waits on owner decisions. The index re-embeds a
  posting only when its text changes (B28-001) and never gives a tombstone a vector, even
  one retention made while a run was embedding it (B29-001).
- **LLM field extraction:** core, validator and immutable evidence rows (C1-001); wired
  into the worker and the import scripts (C1-002). Without the switch it touches nothing.
  A paid record is keyed by its input, so a re-map that leaves the text alone is never
  paid again (B28-001, owner-accepted 2026-10-06). An operation that still holds money
  stops the source's pass until the owner resolves it with `npm run ai:holds`; a closed
  one blocks only its own posting; extraction can no longer fail or pause an import
  (B31-001, owner-accepted 2026-10-07). Each pass visits postings newest first, and its
  limit counts provider calls, so it works through the whole catalog (B32-001,
  owner-accepted 2026-10-07). After an import, from the worker or a manual import alike,
  it makes at most 25 calls per source (B34-001).
- **NLI pre-check:** evaluated with a negative result, not integrated (B4-001).
- **Design:** the Nenaugad design system 1.3 with `--ng-*` tokens (DS-001,
  owner-accepted 2026-09-27); visual baselines are recorded on Windows.
- **Documentation:** English since DOC-EN-001 (2026-10-05).
- **Development process:** Claude Code setup, model and effort policy, CI on pushes
  to `main` that change more than Markdown (DEVX-001, 2026-10-05). The CI job was
  rehearsed locally and fixed before its first run; workflow lint; `npm run ci:status`
  reads results compactly (DEVX-002). A weekly `npm audit` and Dependabot for the
  Actions versions (DEVX-003). CI runs as three jobs (Code quality, Build, Tests), with a
  coverage ratchet and Biome's recommended rules failing on warnings (DEVX-004).

## Latest checks
- 2026-10-07 (B38-001): `npm run check` (unit 315/315), `npm run test:coverage`
  (unit and DB 403/403; 83.15% lines, 86.75% branches, 92.01% functions), `npm run build` and `npm run test:e2e` (99 passed), all exit 0. Not
  pushed.
- 2026-10-07 (B36-001, B35-001, B34-001, B32-001, B33-001, B31-001): the same checks, all
  exit 0. CI on GitHub green on `c41ac65`, `e0f851a`, `cadad06`, `48b325d`, `beff301` and
  `fc9d545`, as on `75e7484` (B29-001) and `936a8ba` (B28-001, B30-001).
- 2026-10-06 (B28-001): the same checks, all exit 0 (unit and DB 371/371). The B27 commit
  had lost a space between two coverage flags, which silently disabled the 91% function
  threshold; fixed, and the ratchet 82/86/91 is enforced again.
- 2026-10-05 (DEVX-004): `npm run test:coverage` — unit and DB tests 344/344. Coverage of
  the `src/` .ts files, counting files no test loads: 82.14% lines, 85.19% branches,
  91.10% functions. Strict Biome: 0
  diagnostics; `tsc` clean. A rehearsal of the three CI jobs on a clean clone against a
  fresh pgvector database: lint, typecheck, drift, build and e2e (99 passed) all green.
- CI on GitHub: the first run ever passed on 2026-10-05 (`d679a9d`, 9 min 17 s, most
  of it a slow Ubuntu mirror). Before that, CI triggered on pull requests only and
  never ran. The three-job layout (DEVX-004) is fully green on `main` since 2026-10-06
  (`9bb9e01`): Code quality, Build, Tests (Linux coverage identical to local; e2e 99)
  and Workflow lint, about 3 min 41 s end to end. B24 and B25 (`83ce062`, pushed
  2026-10-06): green; a duplicate run was cancelled by the concurrency group.

## Waiting for the owner
- **The first live extraction run happened (2026-10-07):** 5 himalayas postings, 5 calls
  settled on the first attempt, 5 records accepted, no hold left. It found B35 (fixed and
  accepted). B36-001 (a settlement releases its own hold only) is accepted too. The five
  records were reviewed: faithful, nothing invented, two salaries found where the source
  has none. B38-001 (clean description text and prompt p2) is accepted (2026-10-08).
  **Before the worker extracts the catalog**, with live AI off: `npm run import:himalayas` until a pass
  that started at page 1 has finished (one run per 24 hours; the current pass is midway),
  and `npm run import:jobicy` once; then live AI on. Otherwise a posting extracted on its
  old text is paid again when re-read (under $0.40 for today's catalog). Then B40.
- **No retry after an uncertain call** ([B37-001](tasks/B37-001-no-retry-after-uncertain.md),
  money, reviewed, owner-accepted 2026-10-12): an uncertain operation keeps its hold and is never
  dispatched again under it. Callers' misreadings left: B45, B46.
- **Late receipts** ([B47-001](tasks/B47-001-settle-late-receipt.md), money, reviewed,
  owner-accepted 2026-10-12): `npm run ai:holds -- --settle=<op> --amount=<μ$>`
  books an uncertain call's charge; `--cancel=` still releases a hold without booking. A
  crashed `in_flight` operation can still only be cancelled (B48).
- The reranker (B3-001): purpose `rerank`, provider grants, profile privacy, and the
  quota and operation ceiling.
- Profile privacy (§4.4), which also gates `matching-scoring`, `hyde` and `eval-judge`.
- The local generative model path (MODEL-002).
- Account deletion (B11, a high-risk review) and restore (SP-T22, a beta prerequisite).
- Which design document is authoritative: AGENTS.md and README still name Atlas 1.1,
  while the tokens come from the design system 1.3 (flagged by DEVX-001).
- **Jobicy changed its API page (`terms:check`, 2026-10-05):** the fair-use rules are
  unchanged, but listings now come from a 7-day window and closure checks moved to a
  batch status endpoint. Re-read it, and decide whether S1-005 and A10 need a task
  ([DEVX-003](tasks/DEVX-003-weekly-checks.md)).
- Whether to normalize the himalayas "Current as of" date in the terms fingerprint
  (source-rights tooling). It is the precondition for a weekly `terms:check`.
- **Himalayas text check** (B26): narrower than jobicy's; widening it changes that
  catalog, so it is a separate task.

## Known limits
- The monthly quota window is stored but has no calendar reset (OPEN_GAPS A5).
- Constants of the new ranking layers wait for accumulated data; measurements come
  from one machine (DGAP-001).
- A stored record takes a new mapping only when an import re-reads it: the jobicy feed
  is a 7-day window, and the himalayas pass resumes at its cursor, 25 pages a run. A
  later mapping change needs its own re-map (REMAP-001's script is guarded for the
  shapes of 2026-10-06).

## Next
The current task is in `tasks/current.json`.
