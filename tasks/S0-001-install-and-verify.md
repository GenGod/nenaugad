# S0-001 — accept the starter repository

**Result:** one locally runnable Atlas with an honest synthetic catalog, a real
lockfile and actually executed checks.

**Handover status:** the code is created, the offline part is verified in reports/DELIVERY.md;
npm/PostgreSQL/Next/Playwright are not yet qualified. Do not recreate the project.

**Not included:** auth, real CVs, a live API, paid models, deploy, new architectures.
**Risk:** ordinary; supply-chain and DB require a careful review.
**Data:** only the eight bundled synthetic records.
**Context:** AGENTS, README, docs/ARCHITECTURE, reports/DELIVERY, package/scripts.

## Acceptance
1. The specified direct dependencies are installed; a real package-lock.json created by
   the package manager, not written by a model. Peer conflicts resolved with justification.
2. check:offline, lint, typecheck, build completed; exact commands/exit codes recorded.
3. A real Next opens the home page, the catalog of 4 active examples, search and detail.
4. Playwright passes on 320/390/1440; the excluded vacancy is unavailable by direct ID.
5. Local PostgreSQL: migrate/seed repeatable, the read switches explicitly; a separate
   test DB passes test:db. A DB error does not yield fixtures.
6. No new network AI calls, no secrets in git, no auto-auth and no production bypass.
7. The implemented/tested/accepted statuses are separated; the owner accepts S0.

## Plan
Check the tree and versions -> install -> real commands -> diff review.
With npm missing, do not invent a build, lock or pass; record the blocker.
At most two repair cycles, the counter in tasks/current.json.

## Eligibility gate
Local installation of ordinary dependencies and a container requires an available environment;
paid AI and real sources are off. Make no purchases and no deploy.
An automatic git commit/push command is not permitted by this template.
Coding-host spend: unknown until an accessible bill.

## Shutdown
Stop npm dev and the local DB container. Do not delete the volume or other people's changes.
