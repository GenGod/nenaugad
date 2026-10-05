# DEVX-001 — the development process tuned for Claude Code (quality per dollar)

**Status: implemented, 2026-10-05; uncommitted.** Owner decisions taken in the session
of 2026-10-05: an Opus main session with cheaper subagents, effort by task risk, the
status file split into a snapshot and a frozen log, CI on pushes to `main`.
`.claude/settings.json` is applied by the owner: Claude Code's auto mode does not let
the agent write its own permissions and hooks.

## Why

The repository was tuned for ZCode with GLM models. Under Claude Code:
- AGENTS.md never loaded by itself. With a CLAUDE.md present, Claude Code loads only
  CLAUDE.md, and that file merely asked the model to read AGENTS.md.
- The per-edit static scan that ZCode ran (`.mimosa/`) was gone.
- The delegation rule named GLM 5.3-flash, so delegated work inherited the main model.
- CI had never run. It triggered on pull requests only, while all work is pushed to
  `main`, and the GitHub default branch was a stale feature branch. Commit `7eb7b83`
  ("broke biome lint at HEAD") shows what slipped through.
- Context grew without need: a green `npm run check` printed 301 lines,
  `IMPLEMENTATION_STATUS.md` had 1,364 lines that every handoff touched, and
  `Reference/` added 142 tracked duplicates to every search.

Prices behind the policy (Claude docs, October 2026): Opus 5.5 costs $4/$20 per million
input/output tokens, Sonnet 5.5 $2/$10, Haiku 4.5 $1/$5. Opus 5.5 and Sonnet 5.5 both
read the cache at $0.20. Most of an agent session's input is the re-read context, so an
Opus main session costs about 1.5× a Sonnet one, and every token kept in context is
paid again on every turn.

## What was done

1. **Instructions.** CLAUDE.md imports AGENTS.md (`@AGENTS.md`) and adds only Claude
   Code mechanics: `check:agent`, a fresh context per task, the `.ignore` note, how the
   superpowers skills fit SP 1.0, and the model and effort policy. In AGENTS.md: the
   archived START_HERE.md left the read-first list (the file stays; guardrails need it),
   `check:agent` is documented, the delegation rule no longer names a model and says
   when delegating pays, and the handoff edits a short snapshot.
2. **`npm run check:agent`** with `scripts/test-quiet.mjs`: the same checks as `check`.
   A green run prints 12 lines instead of 301, failures print in full, and the test
   runner's exit code is kept.
3. **Per-edit hook** `.claude/hooks/post-edit-check.mjs`: after an Edit or Write of a
   TS/JS file under `src/`, `scripts/` or `tests/`, it runs the guardrails and Biome on
   that file. It is silent when clean (about 0.35 s); on findings it exits 2, so Claude
   sees them at once. It is inert until `.claude/settings.json` registers it.
4. **Agents.** `.claude/agents/executor.md` runs on Sonnet at medium effort; it holds
   the former `docs/PROMPT_EXECUTOR.md`, which is now a pointer.
   `.claude/agents/reviewer.md` runs on Opus at high effort and is the independent review
   of SP 1.0 §5 step 7.
5. **`.ignore`** keeps `Reference/*` out of Grep, except `Reference/Nenaugad/`.
   Tested: Claude Code's Grep honours it, Glob does not, and explicit reads still work.
   VS Code search honours `.ignore` as well.
6. **Status split.** `IMPLEMENTATION_STATUS.md` is now a snapshot of about 85 lines. The
   former content is in `docs/history/implementation-log.md` word for word: only its 46
   relative links were rewritten, and all 46 resolve.
7. **CI.** A push trigger on `main` that skips pushes touching only Markdown or
   `Reference/`. The service image is now `pgvector/pgvector:0.8.6-pg17`, as in
   compose.yaml, because migration 0016 creates the extension. Playwright skips pixel
   comparisons off Windows, since every baseline is `*-win32.png`; every functional
   assertion still runs. The GitHub default branch moved from
   `feature/A1-golden-set-eval-harness` to `main` (owner-approved).

## Checks

- `npm run check:agent`: exit 0, 273/273, 12 lines of output.
- `scripts/test-quiet.mjs` on a failing fixture: the full assertion diff and location,
  exit 1.
- The hook, fed Claude Code payloads: a clean source file → exit 0 (344 ms); a Markdown
  file → skipped; a probe with an external `fetch`, an `any` and an unused import →
  exit 2 naming all three. The probe was deleted.
- `.github/workflows/ci.yml` parses with PyYAML 6.0.3 (user-level install, not a project
  dependency). Its structural diff against HEAD is exactly the push trigger (the branch
  and two path ignores) and the service image, and all 9 steps have `run` or `uses`.
- Not run: CI itself (its first run comes with the next push), `test:db`, `build` and
  `test:e2e`. No product code changed; the Playwright change only affects non-Windows
  runs.

## Rollback

Restore the changed files with `git checkout`; delete `.claude/`, `.ignore`,
`scripts/test-quiet.mjs` and `docs/history/`; restore `IMPLEMENTATION_STATUS.md` from
git. If wanted, set the default branch back with `gh repo edit --default-branch`.

## What remains

- The owner applies `.claude/settings.json` (the content is in the session report).
- The first CI run comes at the next push to `main`; fix forward if it is red.
- Which design document is authoritative: AGENTS.md and README name Atlas 1.1, while
  the tokens come from the design system 1.3 (`Reference/Nenaugad/`).
