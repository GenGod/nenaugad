# DEVX-003 — weekly dependency audit and Dependabot; the scheduled terms check is held

**Status: implemented, 2026-10-05.** The owner approved three extras on 2026-10-05: a
scheduled `terms:check`, a weekly `npm audit` and Dependabot for action versions. Two
are in. The terms check is held for an owner decision, with the evidence below.
Risk: normal (CI configuration; no product code).

## What was done

1. **`.github/workflows/weekly.yml`** ("Weekly checks": Mondays 06:00 UTC, also by
   hand): `npm audit --audit-level=high`. It reads `package-lock.json` and installs or
   upgrades nothing; a high or critical advisory fails the run, and GitHub emails a
   failed scheduled run.
2. **`.github/dependabot.yml`**: one grouped weekly pull request that bumps the GitHub
   Actions versions. npm packages are deliberately excluded: they are pinned exactly,
   and each version is an owner decision (`docs/DEPENDENCIES.md`).
3. **Docs:** `docs/DEPENDENCIES.md` ("Watching for updates") and `docs/TESTING.md`.

## Held: the scheduled terms check

`npm run terms:check` on 2026-10-05 exited 1, reporting both pages as CHANGED. A
throwaway clone ran `--write` to get the full text diff; nothing in the repository was
re-baselined, because the script's rule is that a human re-reads the terms first.

- **himalayas:** the whole text differs in one line only, "Current as of Sep 30, 2026"
  → "Current as of Oct 05, 2026". The page stamps the date it is rendered (the snapshot
  day, then today), so a scheduled check would fail every week. The fix is to normalize
  that line in `src/server/terms-fingerprint.ts`. That changes the fingerprints the
  source policies record, so it is a source-rights change: AGENTS.md requires a
  separate review and owner acceptance.
- **jobicy (the API and feed page):** 36 lines removed and 166 added. The fair-use rules
  are word for word unchanged; only their section number moved from 08 to 09. What
  changed is the API:
  - listings now come only from the last 7 days, with a 3-hour publication delay;
  - a paid Commercial API exists, at about $0.01 per new direct-link job;
  - pagination uses a cursor;
  - liveness is checked with a batch status endpoint
    (`/api/v2/remote-jobs/status?ids=…`) instead of the HEAD request that S1-005
    implements. The page adds that "a job leaving the seven-day feed can still be
    active".

## Checks

- actionlint 1.7.12: exit 0 on all three workflows; `dependabot.yml` parses with the
  expected keys.
- `npm audit --audit-level=high`: exit 0, 0 vulnerabilities.
- `npm run terms:check`: exit 1, as described above.
- On GitHub after the push (`8fca1e0`): a manual run of Weekly checks succeeded (run
  37359927667). Dependabot picked up the configuration at once and opened pull request
  #1, which bumps `actions/checkout`, `actions/setup-node` and
  `actions/upload-artifact` from v4 to v7 in all three workflows. Dependabot regenerated
  it on the DEVX-004 layout, and all four checks passed on it (ba76d20). It was merged
  on 2026-10-06 as `9bb9e01` (squash, owner request), and CI on `main` was green
  afterwards.

## Rollback

Delete `.github/workflows/weekly.yml` and `.github/dependabot.yml`.

## What remains (owner)

- Re-read Jobicy's changed API page, and decide whether the import and closure checks
  need a task: S1-005's HEAD checks, the A10 closure signals and the new 7-day window.
- Decide whether to normalize the himalayas date line (source-rights tooling). After
  that, re-baseline with `npm run terms:check -- --write` and add the weekly schedule.
