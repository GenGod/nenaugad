# Dependencies and the boundaries of verification

Date of preparation: 23 September 2026. This is not an automatic confirmation of an npm installation.

| Component | Chosen version | Justification |
|---|---|---|
| Next.js | 16.3.6 | The official security-update announcement of 22.09.2026 |
| React / React DOM | 19.3.0 | The official React 19.3 release and the react/latest metadata |
| pg | 8.23.0 | The package page of the node-postgres owner |
| next-auth | 4.24.15 | The auth implementation of S2-001 (scrypt credentials, owner from the session only); the version is pinned exactly, without a range |
| openai | 7.23.0 | AI-002 (owner decision 2026-09-25): the only allowed provider SDK. Its import is statically allowed only in `src/server/ai/openai-transport.ts` (`npm run guardrails`); SDK auto-retry is off by contract |
| @huggingface/transformers | 4.3.0 | Owner decision 2026-09-30 (brief §7.2, task B1): local embedding inference. The version is pinned exactly (without a range) and is checked by `npm run guardrails`; it pulls in `onnxruntime-node` 1.30.0, `sharp`, `@huggingface/tokenizers` — native binaries |
| Embedding model | `onnx-community/Qwen3-Embedding-0.6B-ONNX` @ `c25a394d`, int8, 1024 dim | Owner decision No. 2 (2026-09-30, §6.2): Apache-2.0, 32K context, last-token pooling, the instruction on the query side only. The weights are not an npm package: they are downloaded by `npm run models:fetch` with a pinned sha256 (`src/domain/embeddings.ts`), not stored in git; changing them — per `docs/EMBEDDING_PLAYBOOK.md` |
| ESCO skills (external classifier) | dataset v1.2.1 via the ESCO REST API v1.1.3 (`selectedVersion=v1.2.1`, 13 939 skills; API release notes 28.08.2025) | Owner decision E.6 (2026-10-02): only the skills part is connected, as a source of skill aliases. The artifact — `npm run esco:fetch` (sha256 pins in `data/esco-manifest.json`), not stored in git. © European Union; reuse with attribution (Decision 2011/833/EU; Commission legal notice — CC BY 4.0), marked as an adapted version; the occupations part (ISCO/ILO) is out of scope |
| PostgreSQL local image | pgvector/pgvector:0.8.6-pg17 | Owner decision 2026-09-30 (item 1 of §7): vectors are stored in pgvector. The image ships PostgreSQL 17.11 (Debian 12) — the same version as the previous `postgres:17.11-alpine`, so the data catalog is directly compatible (verified by a rehearsal on a copy of the volume); the `vector` extension 0.8.6 is enabled by migration 0016 |
| TypeScript | 5.9.3 | A known fixed version was chosen, not a promise of latest |
| Biome | 2.2.4 | The official version history |
| Playwright Test | 1.62.1 | The Microsoft package page |
| Recommended Node | 24.21.0 | The official archive of the 24 line |
| Node of the actual offline check | 22.16.0 | The local delivery environment |
| TypeScript of the limited local check | 5.8.3 | The already installed compiler of the environment, not the full project lock |

Type declarations in package.json are fixed starting versions.
Peer dependencies, transitive dependencies, the installation of native binaries and support
of the whole combination must be verified in S0. The npm probe in the delivery environment returned
DNS EAI_AGAIN; the lockfile and npm audit were not run. One cannot claim the absence of
vulnerabilities from the list of direct dependencies.
*(Update 2026-10-02: in the S0 preparation environment these checks indeed were not
performed; on the owner's working machine the installation was done, a real
`package-lock.json` was created and is in git, S0-001 was accepted 2026-09-24. The current
facts and numbers are in `IMPLEMENTATION_STATUS.md`.)*

## ESCO skills (external content, not a job source)
Owner decision E.6 (2026-10-02) after a verbatim reading of ESCO Handbook §5.
Only the skills part of ESCO is used: dataset **v1.2.1** via the open ESCO REST
API (software v1.1.3, release notes 28.08.2025; `selectedVersion=v1.2.1` → 13 939
skills). The artifact (full skill documents, 140 pages, labels of all 28 languages)
is downloaded by `npm run esco:fetch`, every file is checked by sha256, the pins are in
`data/esco-manifest.json`; the files themselves are not stored in git. The mapping of canons to
concepts and the alias delta — `src/domain/skills-esco.ts` (reviewed; the delta
is part of dictionary v3), changing it — through a `npm run esco:fetch --
--propose` proposal and review, not automatically.

Terms of use (verbatim from handbook §5 and the Commission legal notice):
- the mandatory attribution «This service uses the ESCO classification of the
  European Commission.» is placed in the interface footer and is checked by an e2e test;
- «Any modified or adapted version of ESCO must be clearly indicated as such.» —
  the skill alias dictionary is an adapted version of ESCO and is marked as
  such (the footer and the header of `src/domain/skills-esco.ts`);
- reuse is governed by Decision 2011/833/EU; the Commission's current policy
  (Commission legal notice) — CC BY 4.0: attribution + indication of changes;
- the occupations part of ESCO (ISCO-08, © ILO 2012) is not part of the project and is not downloaded.
A limitation recorded honestly: **ESCO has no Russian language** (28 API languages:
ar, the 24 official EU languages, is, no, en-us). The Russian aliases of the dictionary are
the project's own work and do not come from ESCO.
Rollback: delete `data/esco*` and `src/domain/skills-esco.ts`, remove the v3 delta and the
attribution line (see `tasks/ESCO-001-import-skills.md`).

## Primary sources
- https://nextjs.org/blog/nextjs-security-update-september-22-2026
- https://nextjs.org/docs/app/getting-started/installation
- https://react.dev/blog/2026/09/09/react-19-3
- https://registry.npmjs.org/react/latest
- https://www.npmjs.com/package/pg
- https://node-postgres.com/features/queries
- https://node-postgres.com/features/transactions
- https://www.postgresql.org/docs/17/
- https://nodejs.org/en/download/archive/v24
- https://nodejs.org/api/typescript.html
- https://biomejs.dev/internals/changelog/version/2-2-4/
- https://www.npmjs.com/package/@playwright/test
- https://nextjs.org/docs/app/guides/testing/playwright
- https://www.npmjs.com/package/@huggingface/transformers
- https://ec.europa.eu/esco/api/
- https://ec.europa.eu/esco/api/doc/release_notes.html
- https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
- https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX

The GitHub Actions starter uses the major tags checkout/setup-node v4 and does not pass them
off as an immutably pinned supply chain. Before activating the working CI, check the Actions
and pin the full current SHA in a separate reviewed diff. The workflow has no
production secrets, write permission or deploy. Do not use pull_request_target
to run code from an untrusted PR.

## Installation
The first time, `npm install`: the real dependency resolver creates the lockfile.
After the lockfile is reviewed/kept — `npm ci`.
Do not write package-lock by hand and do not hide a peer conflict with the --force option.
If the chosen version is unavailable, check the official registry/release,
propose a compatible supported replacement and record the reason for the change.
Do not roll Next back to a vulnerable version for the sake of a successful build.

## Watching for updates
`npm audit --audit-level=high` runs every Monday in the `Weekly checks` workflow
(`.github/workflows/weekly.yml`). It reads the lockfile and installs or upgrades
nothing; a high or critical advisory fails the run. Dependabot (`.github/dependabot.yml`)
opens one grouped weekly pull request for the GitHub Actions versions only. npm
packages are not updated automatically, because each version above is an owner decision.
