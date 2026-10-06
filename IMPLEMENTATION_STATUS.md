# Nenaugad — status (ex-Atlas Starter)

A short snapshot of the current state, kept at about 120 lines at most. A task edits the
lines it changed and does not append history: details belong in its task file under
`tasks/`, and the narrative up to 2026-10-05 is frozen in
[docs/history/implementation-log.md](docs/history/implementation-log.md). Open items
with evidence: [docs/OPEN_GAPS.md](docs/OPEN_GAPS.md).
`implemented` != `tested locally` != `verified with provider` != `accepted` != `activated`.

**Updated:** 2026-10-06 by [B30-001](tasks/B30-001-card-excerpts.md).

## Switches and boundaries
- **Live AI is off** (`LIVE_AI_ENABLED=false`, a real switch since AI-007): no provider
  call happens.
- **Personal data stays inside the contour** (`personal-data-boundary.ts`): relevance
  scoring and letter generation are closed until a local model serves them. MODEL-001:
  the 1.5–1.7B CPU candidates fail the rubric; a 7–8B GPU spike is
  [MODEL-002](tasks/MODEL-002-gpu-spike.md).
- **Approved AI purposes:** `job_matching` (AI-004, 2026-10-01) and `extraction`
  (2026-10-04, job text only). `send_to_ai_provider` is granted to all three sources
  (AI-005). The user quota is $1/month; `npm run ai:holds` resolves stuck holds.
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
  and an import no longer blanks the excerpts of records it did not fetch (B30-001; the
  200 stored jobicy excerpts were decoded in place).
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
  posting only when its text changes (B28-001).
- **LLM field extraction:** core, validator and immutable evidence rows (C1-001); wired
  into the worker and the import scripts (C1-002). Without the switch it touches nothing.
  A paid record is keyed by its input, so a re-map that leaves the text alone is never
  paid again (B28-001).
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
- 2026-10-06 (B30-001): `npm run check` (unit 302/302), `npm run test:coverage` (unit
  and DB 376/376; 82.67% lines, 86.33% branches, 91.60% functions), `npm run build` and
  `npm run test:e2e` (99 passed), all exit 0. Not pushed.
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
- The first live extraction run: `LIVE_AI_ENABLED=true` plus a key, then
  `npm run seed:budgets` and `npm run extract:fields -- --source=himalayas --limit=5`.
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
- **B28-001 acceptance** (money): paid extraction is now keyed by its input, and
  migration 0020 is applied locally. The independent review found it ready for
  acceptance; one decision is open: whether 0020's guard should also have refused
  old-format extraction operations (none exist anywhere).
- **B30-001 acceptance:** then delete `backups/excerpts-2026-10-06/backup.json`. It holds
  the 200 old excerpts, which is posting text that must not outlive retention.
- **Before live AI:** a stuck extraction operation stops the pass and can pause a
  healthy import (OPEN_GAPS B31), and the pass may never get past its first 25 rows
  (B32).
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
- The embedding index has no tombstone filter: once retention tombstones a posting, the
  next index run would embed its blank text (OPEN_GAPS B29).

## Next
The current task is in `tasks/current.json`.
