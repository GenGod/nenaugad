# Nenaugad / day-one instructions

## Read first
Read `tasks/current.json`, the referenced task, `package.json` and `git status`.
[START_HERE.md](START_HERE.md) is the archived day-one record; skip it.
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
One Next.js TypeScript app. Public read-only synthetic catalog plus snapshots from
two approved live sources (Himalayas, Jobicy). Fixture repository or local
PostgreSQL, migrations/seed, import worker, tests and workflow instructions.
Auth and private versioned profiles (S2), CV intake behind `UPLOADS_ENABLED` (S3),
private letters (S4) and the guarded AI contour with its spending ledger
(AI-001…AI-007) exist locally. Live AI is off (`LIVE_AI_ENABLED=false`): relevance
scoring and letter generation refuse until a local model serves them, and nothing
about the candidate leaves the contour. Not beta: no restore, no public deploy,
no owner acceptance.
`docs/ARCHITECTURE.md` distinguishes the starter contract from target contracts;
`docs/OPEN_GAPS.md` is the audit of what is still open.
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
`npm run check:agent` runs the same checks as `check` but omits passing tests from
the output: use it while iterating, and `npm run check` once before the report.
CI runs on pushes to `main`, except those that touch only Markdown or `Reference/`.
After a push, `npm run ci:status` shows this commit's runs; a failed run prints only
the tail of each failed step's log.
Database: `npm run db:migrate`, `npm run db:seed`, `npm run test:db` (isolated test DB).
`npm run test:coverage` runs the unit and DB tests with the coverage ratchet CI enforces:
new code needs tests to stay above it. Raise its thresholds when coverage rises; never
lower them to get green. `npm run lint` fails on warnings.
`npm run doctor` never prints secrets. `npm run task -- show` shows the current task.
Never claim a missing/skipped command passed. See `reports/DELIVERY.md`.

## Boundaries
Real AI cannot be enabled by changing an env flag. Implement and test its protections first:
ownership, approved source/purpose/provider, atomic budget reservation, quotas, persistent
attempt counters, deadline, uncertain billing, cancellation and commit-time revalidation.
No SDK retry/queue retry may reset a root operation's limit.
Use mocks only when clearly labelled; no fake generated letter or fake server save.

## Subagent delegation (owner decisions 2026-09-25, 2026-10-05)
Delegate when it pays: reading that would flood the main context, or several
independent pieces of mechanical work. A small edit is cheaper done directly than
briefed, run in a fresh context and reviewed. Delegate non-complex execution (file
edits, test runs, boilerplate) to a cheaper model than the main session, and pass
the exact files, the change and the check to run. Keep architecture, security,
source-policy, money-adjacent and breaking-change decisions in the main session.
A high-risk diff gets an independent fresh-context review before owner acceptance.
The main agent reviews all subagent output before committing. Subagent cost is
reported as unknown unless visible. CLAUDE.md maps this onto Claude Code agents.

## Handoff
`IMPLEMENTATION_STATUS.md` is a short snapshot: edit the lines your task changed, do not
append history, and keep the detail in the task file. The record up to 2026-10-05 is
frozen in `docs/history/implementation-log.md`; read it only to look up history.
Report: result, files, commands + exit codes, unexecuted checks, mock/live, costs/unknown,
limitations, rollback and the next small task.
`implemented` != `tested locally` != `verified with provider` != `accepted`.
Coding-host spending may be invisible: report it as unknown, not as a fictional cap.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
