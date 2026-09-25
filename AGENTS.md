# Nenaugad / day-one instructions

## Read first
Read [START_HERE.md](START_HERE.md), `tasks/current.json`, the referenced task,
`package.json`, and `git status` if this folder has been initialized as a repository.
The rules are [SP 1.0](docs/solo/ATLAS_SOLO_PIPELINE.md). Read other documents
only when the current task needs them. This is a new project, but it now has a starter:
do not run create-next-app over it or build a second starter.

## Product
Nenaugad is a candidate-facing remote-only job service. Remote is not worldwide.
Unknown is not pass/fail. Eligibility is not relevance or offer probability.
AI does not change permissions, budgets or application status. No auto-apply.
Sources require purpose-specific approval. Profiles and letters are private.

Approved appearance: [Atlas 1.1](docs/solo/context/ATLAS_DESIGN_LANGUAGE.md).
Use `src/app/tokens.css`, generated from the original tokens. Do not redesign Nenaugad.

## What exists
One Next.js TypeScript app. Public read-only synthetic catalog. Fixture repository,
optional local PostgreSQL repository, migration/seed, tests and workflow instructions.
No authentication, CV upload, live source, paid AI, financial ledger or worker yet.
`docs/ARCHITECTURE.md` distinguishes the starter contract from target contracts.
Do not call stubbed features implemented.

## Working loop
One task -> short plan -> minimal complete change -> real checks -> diff review.
Preserve unrelated changes. Do not weaken security tests to get green.
At most two repair cycles; record a new testable hypothesis using
`npm run task -- repair "..."` BEFORE each cycle.
The counter survives sessions; no reset/renaming/subagents to bypass it.
Stop earlier when the same failure repeats with no new evidence.

High-risk changes (auth, money, deletion, upload, source rights) require a separate
review and owner acceptance before activation. Safe local tests need no per-file approval.
Do not auto-commit, push, merge, deploy, upgrade broad dependency ranges,
run production migrations, spend money or send real CVs without explicit permission.
A key in the environment is not approval. Do not print `.env`.

## Commands
`npm run check:offline` works without third-party packages on a supported Node runtime.
After dependency installation: `npm run check`, `npm run build`, `npm run test:e2e`.
Database: `npm run db:migrate`, `npm run db:seed`, `npm run test:db` (isolated test DB).
`npm run doctor` never prints secrets. `npm run task -- show` shows the current task.
Never claim a missing/skipped command passed. See `reports/DELIVERY.md`.

## Boundaries
Real AI cannot be enabled by changing an env flag. Implement and test its protections first:
ownership, approved source/purpose/provider, atomic budget reservation, quotas, persistent
attempt counters, deadline, uncertain billing, cancellation and commit-time revalidation.
No SDK retry/queue retry may reset a root operation's limit.
Use mocks only when clearly labelled; no fake generated letter or fake server save.

## Subagent delegation (owner decision 2026-09-25)
During work, create subagents for parallelisable simple tasks and pass them
the context they need. Delegate non-complex execution (file edits, test runs,
simple greps, boilerplate) to the fastest available model (GLM 5.3-flash).
Keep architecture, security, source-policy, money-adjacent and breaking-change
decisions in the main session. The main agent reviews all subagent output
before committing. Subagent cost is reported as unknown unless visible.

## Handoff
Update the existing `IMPLEMENTATION_STATUS.md`, not a new essay for each method.
Report: result, files, commands + exit codes, unexecuted checks, mock/live, costs/unknown,
limitations, rollback and the next small task.
`implemented` != `tested locally` != `verified with provider` != `accepted`.
Coding-host spending may be invisible: report it as unknown, not as a fictional cap.
